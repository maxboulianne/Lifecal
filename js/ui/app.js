// Contrôleur de l'interface : état, rendu, actions.
//
// Deux sortes d'écrans :
//  - le calendrier, avec ses vues (#/week/2026-10-23) ;
//  - des pages : « Mes habitudes » (#/habits) et « Paramètres » (#/settings).
// L'état est reflété dans l'adresse pour que le bouton « retour » fonctionne.

import { MODULES, MODULE_IDS, moduleLabel } from "../config/modules.js";
import { isISODate, parseISODate, toISODate, todayISO } from "../core/dates.js";
import { $, esc } from "../core/dom.js";
import { currentStreak } from "../data/habit-stats.js";
import { FREQ, doneInWeek } from "../data/recurrence.js";
import { ValidationError } from "../data/repository.js";
import { getCurrentPosition, watchPosition } from "../geo/geo.js";
import { getLanguage, setLanguage, t } from "../i18n/index.js";
import { itemDetail } from "./components/item-detail.js";
import { itemForm, readItemForm, syncRepeatFields } from "./components/item-form.js";
import { closeModal, openModal, setupModal } from "./components/modal.js";
import { nudgesBar } from "./components/nudges.js";
import { cheer, toast } from "./components/toast.js";
import { welcome } from "./components/welcome.js";
import { habitsPage } from "./pages/habits.js";
import { settingsPage } from "./pages/settings.js";
import { DEFAULT_VIEW, VIEWS, VIEW_ORDER } from "./views/index.js";

const PAGES = { habits: habitsPage, settings: settingsPage };

export class App {
  page = null; // null = calendrier
  view = DEFAULT_VIEW;
  cursor = parseISODate(todayISO());
  position = null;
  #stopWatch = null;
  #lastNudgeKey = "";

  constructor({ repo, triggers, storageLabel }) {
    this.repo = repo;
    this.triggers = triggers;
    this.storageLabel = storageLabel; // clé de traduction
  }

  start() {
    setupModal();
    this.#readHash();
    document.addEventListener("click", (e) => this.#onClick(e));
    document.addEventListener("change", (e) => this.#onChange(e));
    document.addEventListener("submit", (e) => this.#onSubmit(e));
    window.addEventListener("hashchange", () => {
      this.#readHash();
      this.render();
    });
    // Revenir sur l'app le lendemain : « aujourd'hui » doit suivre.
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && this.render());
    this.repo.on("change", () => this.render());
    this.#syncProximityWatch();
    this.render();
    if (!this.repo.settings.language) openModal(welcome(), { labelledBy: "welcome-title" });
  }

  // ---- Navigation --------------------------------------------------------

  #readHash() {
    const [, first, date] = location.hash.match(/^#\/(\w+)(?:\/([\d-]+))?/) ?? [];
    this.page = PAGES[first] ? first : null;
    if (VIEWS[first]) this.view = first;
    if (isISODate(date)) this.cursor = parseISODate(date);
  }

  navigate(view, cursor, { push = false } = {}) {
    this.page = null;
    this.view = view;
    this.cursor = cursor;
    this.#setHash(`#/${view}/${toISODate(cursor)}`, push);
  }

  openPage(page) {
    if (this.page === page) return;
    this.page = page;
    this.#setHash(`#/${page}`, true);
  }

  backToCalendar() {
    this.navigate(this.view, this.cursor, { push: true });
  }

  #setHash(hash, push) {
    if (push) history.pushState(null, "", hash);
    else history.replaceState(null, "", hash);
    window.scrollTo(0, 0);
    this.render();
  }

  // ---- Rendu -------------------------------------------------------------

  render() {
    const today = todayISO();
    this.#renderTopbar();
    $("#legend").hidden = Boolean(this.page);
    $("#legend").innerHTML = MODULE_IDS.map(
      (id) => `<span class="legend-item"><span class="dot" style="--c:${MODULES[id].color}"></span>${esc(moduleLabel(id))}</span>`,
    ).join("");
    $("#legend").setAttribute("aria-label", t("nav.modules"));
    $("#fab").setAttribute("aria-label", t(this.page === "habits" ? "habits.add" : "nav.add"));
    $("#fab").dataset.action = this.page === "habits" ? "new-habit" : "new-item";
    $("#fab").hidden = this.page === "settings";

    const main = $("#calendar");
    main.dataset.view = this.page ?? this.view;
    if (this.page) {
      main.innerHTML = PAGES[this.page].render({
        repo: this.repo,
        today,
        settings: this.repo.settings,
        storageLabel: this.storageLabel,
        count: this.repo.all().length,
      });
      $("#nudges").innerHTML = "";
    } else {
      main.innerHTML = VIEWS[this.view].render({ cursor: this.cursor, repo: this.repo, today });
      this.#renderNudges(today);
    }
  }

  #renderTopbar() {
    const pageButtons = `
      <button type="button" class="icon-btn ${this.page === "habits" ? "active" : ""}" data-action="open-habits"
        aria-label="${esc(t("nav.habits"))}" title="${esc(t("nav.habits"))}">🌱</button>
      <button type="button" class="icon-btn ${this.page === "settings" ? "active" : ""}" data-action="open-settings"
        aria-label="${esc(t("nav.settings"))}" title="${esc(t("nav.settings"))}">⚙︎</button>`;

    if (this.page) {
      $("#topbar").innerHTML = `
        <div class="nav">
          <button type="button" class="btn soft" data-action="back">‹ ${t("nav.calendar")}</button>
          <h1 id="title">${esc(PAGES[this.page].title())}</h1>
        </div>
        <div class="nav">${pageButtons}</div>`;
      document.title = `${PAGES[this.page].title()} – LifeCal`;
      return;
    }

    const title = VIEWS[this.view].title(this.cursor);
    $("#topbar").innerHTML = `
      <div class="nav">
        <button type="button" class="icon-btn" data-action="prev" aria-label="${esc(t("nav.prev"))}">‹</button>
        <h1 id="title" aria-live="polite">${esc(title)}</h1>
        <button type="button" class="icon-btn" data-action="next" aria-label="${esc(t("nav.next"))}">›</button>
        <button type="button" class="btn soft" data-action="today">${t("nav.today")}</button>
      </div>
      <div class="nav">
        <nav class="segmented" aria-label="${esc(t("nav.views"))}">
          ${VIEW_ORDER.map((id) => `<button type="button" data-action="set-view" data-view="${id}"
            class="${id === this.view ? "active" : ""}" aria-pressed="${id === this.view}">${t(`view.${id}`)}</button>`).join("")}
        </nav>
        ${pageButtons}
      </div>`;
    document.title = "LifeCal";
  }

  #renderNudges(today = todayISO()) {
    if (this.page) return;
    const nudges = this.triggers.evaluate({
      items: this.repo.all(),
      today,
      position: this.position,
      settings: this.repo.settings,
    });
    this.#lastNudgeKey = nudges.map((n) => n.id).join("|");
    $("#nudges").innerHTML = nudgesBar(nudges);
  }

  // ---- Fenêtres ----------------------------------------------------------

  openNewItem(options = {}) {
    openModal(itemForm(null, { date: toISODate(this.cursor), ...options }), { labelledBy: "form-title" });
  }

  openItem(id, date) {
    const item = this.repo.getOn(id, date);
    if (!item) return;
    openModal(itemDetail(item, { today: todayISO() }), { labelledBy: "detail-title" });
  }

  openEdit(id) {
    openModal(itemForm(this.repo.get(id)), { labelledBy: "form-title" });
  }

  // ---- Actions -----------------------------------------------------------

  #actions = {
    "set-view": (el) => this.navigate(el.dataset.view, this.cursor, { push: true }),
    prev: () => this.navigate(this.view, VIEWS[this.view].step(this.cursor, -1)),
    next: () => this.navigate(this.view, VIEWS[this.view].step(this.cursor, 1)),
    today: () => this.navigate(this.view, parseISODate(todayISO())),
    back: () => this.backToCalendar(),
    "open-day": (el) => this.navigate("day", parseISODate(el.dataset.date), { push: true }),
    "open-month": (el) => this.navigate("month", parseISODate(el.dataset.date), { push: true }),
    "open-habits": () => {
      closeModal();
      this.openPage("habits");
    },
    "open-settings": () => this.openPage("settings"),
    "new-item": (el) => this.openNewItem(el.dataset.date ? { date: el.dataset.date } : {}),
    "new-habit": () => this.openNewItem({ date: todayISO(), module: "habitude", repeat: FREQ.DAILY }),
    "open-item": (el) => this.openItem(el.dataset.id, el.dataset.date),
    "edit-item": (el) => this.openEdit(el.dataset.id),
    "toggle-done": (el) => this.#toggleDone(el.dataset.id, el.dataset.date),
    "toggle-skip": async (el) => {
      const item = await this.repo.toggleSkip(el.dataset.id, el.dataset.date);
      closeModal();
      if (item.data.skipped?.[el.dataset.date]) toast(t("toast.skipped"));
    },
    "stop-habit": async (el) => {
      if (!confirm(t("confirm.stopHabit"))) return;
      await this.repo.stopRecurrence(el.dataset.id, el.dataset.date);
      closeModal();
      toast(t("toast.stopped"));
    },
    "cancel-item": async (el) => {
      await this.repo.cancel(el.dataset.id);
      closeModal();
      toast(t("toast.cancelled"));
    },
    "restore-item": async (el) => {
      await this.repo.restore(el.dataset.id);
      closeModal();
    },
    "delete-item": async (el) => {
      const recurring = Boolean(this.repo.get(el.dataset.id)?.recurrence);
      if (!confirm(t(recurring ? "confirm.deleteHabit" : "confirm.delete"))) return;
      await this.repo.remove(el.dataset.id);
      closeModal();
      toast(t("toast.deleted"));
    },
    "dismiss-nudge": async (el) => {
      const dismissed = { ...this.repo.settings.dismissedNudges, [el.dataset.id]: todayISO() };
      // On ne garde que les entrées du jour pour que la liste ne grossisse pas.
      for (const [k, v] of Object.entries(dismissed)) if (v !== todayISO()) delete dismissed[k];
      await this.repo.updateSettings({ dismissedNudges: dismissed });
    },
    "pick-language": async (el) => {
      setLanguage(el.dataset.lang);
      await this.repo.updateSettings({ language: el.dataset.lang });
      // L'accueil se redessine dans la nouvelle langue.
      if ($("#modal .welcome")) openModal(welcome(), { labelledBy: "welcome-title" });
    },
    "finish-welcome": async () => {
      if (!this.repo.settings.language) await this.repo.updateSettings({ language: getLanguage() });
      closeModal();
    },
    "use-position": async (el) => {
      const form = el.closest("form");
      el.disabled = true;
      el.textContent = t("form.locating");
      try {
        this.#setFormCoords(form, await getCurrentPosition());
      } catch {
        toast(t("toast.noPosition"));
      } finally {
        el.disabled = false;
        el.textContent = t("form.usePosition");
      }
    },
    "clear-position": (el) => this.#setFormCoords(el.closest("form"), null),
    export: () => this.#exportData(),
    close: () => closeModal(),
  };

  async #toggleDone(id, date) {
    const item = await this.repo.toggleDone(id, date);
    closeModal();
    const done = item.recurrence ? Boolean(item.data.completions?.[date]) : item.done;
    if (!done) return;
    if (item.recurrence?.freq === FREQ.FLEXIBLE && doneInWeek(item, date) === item.recurrence.timesPerWeek) {
      return toast(t("toast.weekGoal"));
    }
    const streak = item.recurrence && date === todayISO() ? currentStreak(item, date) : 0;
    toast(streak >= 2 ? t("toast.streak", { count: streak }) : cheer());
  }

  async #onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el || el.tagName === "INPUT") return;
    const action = this.#actions[el.dataset.action];
    if (!action) return;
    e.preventDefault();
    try {
      await action(el);
    } catch (err) {
      console.error(err);
      toast(t("toast.error"));
    }
  }

  async #onChange(e) {
    const el = e.target;
    const form = el.closest("#item-form");
    if (form && (el.name === "module" || el.name === "repeat")) {
      // Choisir « Habitude » pour un nouvel élément propose « Tous les jours ».
      if (el.name === "module" && el.value === "habitude" && !form.dataset.id && form.elements.repeat.value === "none") {
        form.querySelector(`[name=repeat][value=${FREQ.DAILY}]`).checked = true;
      }
      syncRepeatFields(form);
    }
    if (el.dataset.action === "toggle-proximity") {
      try {
        await this.repo.updateSettings({ proximityEnabled: el.checked });
        this.#syncProximityWatch();
      } catch {
        el.checked = !el.checked;
        toast(t("toast.settingFailed"));
      }
    }
    if (el.dataset.action === "import" && el.files?.[0]) {
      await this.#importData(el.files[0]);
      el.value = "";
    }
  }

  async #onSubmit(e) {
    if (e.target.id !== "item-form") return;
    e.preventDefault();
    const form = e.target;
    const existing = form.dataset.id ? this.repo.get(form.dataset.id) : null;
    const data = readItemForm(form, existing);
    try {
      if (existing) await this.repo.update(existing.id, data);
      else await this.repo.add(data);
      closeModal();
      // Montrer l'élément là où il a été placé (sauf depuis une page ou une vue large).
      if (!this.page && (this.view === "day" || this.view === "week")) this.navigate(this.view, parseISODate(data.date));
    } catch (err) {
      $("[data-role=errors]", form).textContent =
        err instanceof ValidationError ? err.errors.map((k) => t(k)).join(" ") : t("form.saveError");
    }
  }

  #setFormCoords(form, pos) {
    form.elements.lat.value = pos?.lat ?? "";
    form.elements.lng.value = pos?.lng ?? "";
    $("[data-role=coords]", form).textContent = pos ? `📍 ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : "";
    $("[data-action=clear-position]", form).hidden = !pos;
  }

  // ---- Proximité ---------------------------------------------------------

  #syncProximityWatch() {
    const enabled = this.repo.settings.proximityEnabled;
    if (enabled && !this.#stopWatch) {
      this.#stopWatch = watchPosition(
        (pos) => {
          this.position = pos;
          const before = this.#lastNudgeKey;
          this.#renderNudges();
          if (this.#lastNudgeKey !== before && this.#lastNudgeKey.includes("commissions-proximite")) {
            navigator.vibrate?.(80);
          }
        },
        () => toast(t("toast.proximityPaused")),
      );
    } else if (!enabled && this.#stopWatch) {
      this.#stopWatch();
      this.#stopWatch = null;
      this.position = null;
      this.#renderNudges();
    }
  }

  // ---- Sauvegarde --------------------------------------------------------

  #exportData() {
    const blob = new Blob([this.repo.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lifecal-${todayISO()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async #importData(file) {
    if (!confirm(t("confirm.import"))) return;
    try {
      const n = await this.repo.importJSON(await file.text());
      setLanguage(this.repo.settings.language ?? getLanguage());
      this.render();
      toast(t("toast.imported", { count: n }));
    } catch (err) {
      console.error(err);
      toast(t("toast.importFailed"));
    }
  }
}
