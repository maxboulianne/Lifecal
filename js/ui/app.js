// Contrôleur de l'interface : état (vue + date affichée), rendu, actions.
//
// L'état est reflété dans l'adresse (#/semaine/2026-10-23 → #/week/2026-10-23)
// pour que le bouton « retour » du navigateur ramène à la vue précédente.

import { MODULES, MODULE_IDS } from "../config/modules.js";
import { isISODate, parseISODate, toISODate, todayISO } from "../core/dates.js";
import { $, esc } from "../core/dom.js";
import { ValidationError } from "../data/repository.js";
import { getCurrentPosition, watchPosition } from "../geo/geo.js";
import { itemDetail } from "./components/item-detail.js";
import { itemForm, readItemForm } from "./components/item-form.js";
import { closeModal, openModal, setupModal } from "./components/modal.js";
import { nudgesBar } from "./components/nudges.js";
import { settingsPanel } from "./components/settings.js";
import { cheer, toast } from "./components/toast.js";
import { DEFAULT_VIEW, VIEWS, VIEW_ORDER } from "./views/index.js";

export class App {
  view = DEFAULT_VIEW;
  cursor = parseISODate(todayISO());
  position = null;
  #stopWatch = null;
  #lastNudgeKey = "";

  constructor({ repo, triggers, storageLabel }) {
    this.repo = repo;
    this.triggers = triggers;
    this.storageLabel = storageLabel;
  }

  start() {
    this.#renderChrome();
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
  }

  // ---- Navigation --------------------------------------------------------

  #readHash() {
    const [, view, date] = location.hash.match(/^#\/(\w+)(?:\/([\d-]+))?/) ?? [];
    if (VIEWS[view]) this.view = view;
    if (isISODate(date)) this.cursor = parseISODate(date);
  }

  navigate(view, cursor, { push = false } = {}) {
    this.view = view;
    this.cursor = cursor;
    const hash = `#/${view}/${toISODate(cursor)}`;
    if (push) history.pushState(null, "", hash);
    else history.replaceState(null, "", hash);
    this.render();
  }

  // ---- Rendu -------------------------------------------------------------

  #renderChrome() {
    $("#view-switch").innerHTML = VIEW_ORDER.map(
      (id) => `<button type="button" data-action="set-view" data-view="${id}">${VIEWS[id].label}</button>`,
    ).join("");
    $("#legend").innerHTML = MODULE_IDS.map(
      (id) => `<span class="legend-item"><span class="dot" style="--c:${MODULES[id].color}"></span>${esc(MODULES[id].label)}</span>`,
    ).join("");
  }

  render() {
    const view = VIEWS[this.view];
    const today = todayISO();
    $("#title").textContent = view.title(this.cursor);
    document.querySelectorAll("#view-switch button").forEach((b) => {
      const active = b.dataset.view === this.view;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    $("#calendar").dataset.view = this.view;
    $("#calendar").innerHTML = view.render({ cursor: this.cursor, repo: this.repo, today });
    this.#renderNudges(today);
  }

  #renderNudges(today = todayISO()) {
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

  openNewItem(date) {
    openModal(itemForm(null, { date: date ?? toISODate(this.cursor) }), { labelledBy: "form-title" });
  }

  openItem(id) {
    const item = this.repo.get(id);
    if (!item) return;
    openModal(itemDetail(item), { labelledBy: "detail-title" });
  }

  openEdit(id) {
    openModal(itemForm(this.repo.get(id)), { labelledBy: "form-title" });
  }

  openSettings() {
    openModal(settingsPanel(this.repo.settings, { storageLabel: this.storageLabel, count: this.repo.all().length }), {
      labelledBy: "settings-title",
    });
  }

  // ---- Actions -----------------------------------------------------------

  #actions = {
    "set-view": (el) => this.navigate(el.dataset.view, this.cursor, { push: true }),
    prev: () => this.navigate(this.view, VIEWS[this.view].step(this.cursor, -1)),
    next: () => this.navigate(this.view, VIEWS[this.view].step(this.cursor, 1)),
    today: () => this.navigate(this.view, parseISODate(todayISO())),
    "open-day": (el) => this.navigate("day", parseISODate(el.dataset.date), { push: true }),
    "open-month": (el) => this.navigate("month", parseISODate(el.dataset.date), { push: true }),
    "new-item": (el) => this.openNewItem(el.dataset.date),
    "open-item": (el) => this.openItem(el.dataset.id),
    "edit-item": (el) => this.openEdit(el.dataset.id),
    "toggle-done": async (el) => {
      const item = await this.repo.toggleDone(el.dataset.id);
      closeModal();
      if (item.done) toast(cheer());
    },
    "cancel-item": async (el) => {
      await this.repo.cancel(el.dataset.id);
      closeModal();
      toast("Élément annulé. Pas de souci 🌿");
    },
    "restore-item": async (el) => {
      await this.repo.restore(el.dataset.id);
      closeModal();
    },
    "delete-item": async (el) => {
      if (!confirm("Supprimer cet élément pour de bon ?")) return;
      await this.repo.remove(el.dataset.id);
      closeModal();
      toast("Élément supprimé");
    },
    "dismiss-nudge": async (el) => {
      const dismissed = { ...this.repo.settings.dismissedNudges, [el.dataset.id]: todayISO() };
      // On ne garde que les entrées du jour pour que la liste ne grossisse pas.
      for (const [k, v] of Object.entries(dismissed)) if (v !== todayISO()) delete dismissed[k];
      await this.repo.updateSettings({ dismissedNudges: dismissed });
    },
    "use-position": async (el) => {
      const form = el.closest("form");
      el.disabled = true;
      el.textContent = "Recherche…";
      try {
        const pos = await getCurrentPosition();
        this.#setFormCoords(form, pos);
      } catch {
        toast("Position introuvable. Tu peux simplement écrire le lieu.");
      } finally {
        el.disabled = false;
        el.textContent = "Utiliser ma position";
      }
    },
    "clear-position": (el) => this.#setFormCoords(el.closest("form"), null),
    settings: () => this.openSettings(),
    export: () => this.#exportData(),
    close: () => closeModal(),
  };

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
      toast("Oups, quelque chose n'a pas fonctionné.");
    }
  }

  async #onChange(e) {
    const el = e.target;
    if (el.dataset.action === "toggle-proximity") {
      await this.repo.updateSettings({ proximityEnabled: el.checked });
      this.#syncProximityWatch();
    }
    if (el.dataset.action === "import" && el.files?.[0]) {
      await this.#importData(el.files[0]);
    }
  }

  async #onSubmit(e) {
    if (e.target.id !== "item-form") return;
    e.preventDefault();
    const form = e.target;
    const data = readItemForm(form);
    try {
      if (form.dataset.id) await this.repo.update(form.dataset.id, data);
      else await this.repo.add(data);
      closeModal();
      // Montrer l'élément là où il a été placé.
      const date = parseISODate(data.date);
      if (this.view === "year" || this.view === "month") this.render();
      else this.navigate(this.view, date);
    } catch (err) {
      $("[data-role=errors]", form).textContent =
        err instanceof ValidationError ? err.errors.join(" ") : "Impossible d'enregistrer pour l'instant.";
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
        () => toast("Je n'arrive pas à connaître ta position. Les rappels de proximité sont en pause."),
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
    if (!confirm("Remplacer toutes tes données par celles de ce fichier ?")) return;
    try {
      const n = await this.repo.importJSON(await file.text());
      closeModal();
      toast(`${n} élément${n > 1 ? "s" : ""} importé${n > 1 ? "s" : ""} ✨`);
    } catch (err) {
      console.error(err);
      toast("Ce fichier ne semble pas être une copie LifeCal.");
    }
  }
}
