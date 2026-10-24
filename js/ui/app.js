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
import { addEntry, fromLines, getChecklist, progress, removeEntry, toggleEntry } from "../data/checklist.js";
import { getCurrentPosition, watchPosition } from "../geo/geo.js";
import { getLanguage, setLanguage, t, tList } from "../i18n/index.js";
import { itemDetail } from "./components/item-detail.js";
import { itemForm, readItemForm, syncRepeatFields } from "./components/item-form.js";
import { closeModal, openModal, setupModal } from "./components/modal.js";
import { nudgesBar } from "./components/nudges.js";
import { cheer, toast } from "./components/toast.js";
import { welcome } from "./components/welcome.js";
import { MeditationPlayer } from "./meditation/player.js";
import { habitsPage } from "./pages/habits.js";
import { journalPage, readJournal } from "./pages/journal.js";
import { JOURNAL_MODULE, entryFor, entryTitle, isEmptyContent } from "../journal/journal.js";
import { meditationPage, setupContent, setupSheet } from "./pages/meditation.js";
import { meditationStatsPage } from "./pages/meditation-stats.js";
import { tripPage } from "./pages/trip.js";
import { tripsPage } from "./pages/trips.js";
import { shoppingPage } from "./pages/shopping.js";
import { mountMap } from "../travel/map.js";
import { geocode } from "../travel/geocode.js";
import { addPlace, getPlaces, located, removePlace, setPlaceCoords, toggleVisited } from "../travel/trip.js";
import { settingsPage } from "./pages/settings.js";
import { DEFAULT_VIEW, VIEWS, VIEW_ORDER } from "./views/index.js";
import { MeditationAudio } from "../meditation/audio.js";
import { BREATHING_EXERCISES } from "../meditation/catalog.js";
import { breathingScript, timerScript } from "../meditation/runner.js";
import { sessionContent } from "../meditation/scripts/index.js";
import { loadVoices, pickVoice, SpeechVoice } from "../meditation/voice.js";

const PAGES = {
  journal: journalPage,
  meditation: meditationPage,
  medstats: meditationStatsPage,
  trips: tripsPage,
  trip: tripPage,
  shopping: shoppingPage,
  habits: habitsPage,
  settings: settingsPage,
};
const JOURNAL_SAVE_DELAY = 700;

export class App {
  page = null; // null = calendrier
  view = DEFAULT_VIEW;
  cursor = parseISODate(todayISO());
  position = null;
  #stopWatch = null;
  #lastNudgeKey = "";
  #quiet = false; // enregistrement du journal en cours : ne pas redessiner sous les doigts
  #journalTimer = null;
  promptShift = 0;
  statsPeriod = "week";
  statsOffset = 0;
  tripId = null;
  #map = null;

  constructor({ repo, triggers, storageLabel }) {
    this.repo = repo;
    this.triggers = triggers;
    this.storageLabel = storageLabel; // clé de traduction
  }

  start() {
    setupModal();
    this.audio = new MeditationAudio();
    this.player = new MeditationPlayer({ repo: this.repo, audio: this.audio });
    // Les voix de l'appareil arrivent parfois en retard : redessiner les Paramètres.
    loadVoices().then((v) => {
      this.voices = v;
      if (this.page === "settings") this.render();
    });
    this.#readHash();
    document.addEventListener("click", (e) => this.#onClick(e));
    document.addEventListener("change", (e) => this.#onChange(e));
    document.addEventListener("submit", (e) => this.#onSubmit(e));
    document.addEventListener("input", (e) => {
      if (e.target.dataset.journal) this.#scheduleJournalSave();
    });
    window.addEventListener("hashchange", () => {
      this.#flushJournal();
      this.#readHash();
      this.render();
    });
    // Revenir sur l'app le lendemain : « aujourd'hui » doit suivre.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.#flushJournal();
      else this.render();
    });
    this.repo.on("change", () => this.#quiet || this.render());
    window.addEventListener("offline", () => toast(t("toast.offline")));
    this.#syncProximityWatch();
    this.render();
    if (!this.repo.settings.language) openModal(welcome(), { labelledBy: "welcome-title" });
  }

  setStorageProtected(ok) {
    this.storageProtected = ok;
    if (this.page === "settings") this.render();
  }

  // ---- Navigation --------------------------------------------------------

  #readHash() {
    const [, first, second] = location.hash.match(/^#\/(\w+)(?:\/([\w-]+))?/) ?? [];
    this.page = PAGES[first] ? first : null;
    if (VIEWS[first]) this.view = first;
    if (first === "trip") this.tripId = second ?? null;
    else if (isISODate(second)) this.cursor = parseISODate(second);
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
    this.#setHash(page === "journal" ? `#/journal/${toISODate(this.cursor)}` : `#/${page}`, true);
  }

  backToCalendar() {
    this.navigate(this.view, this.cursor, { push: true });
  }

  #setHash(hash, push) {
    this.#flushJournal();
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
    // Sur les pages Habitudes, Commissions et Voyages, le + crée un élément de ce module.
    const fabModule = { shopping: "commission", trips: "voyage" }[this.page] ?? "";
    $("#fab").setAttribute("aria-label", t({ habits: "habits.add", shopping: "shopping.add", trips: "trips.add" }[this.page] ?? "nav.add"));
    $("#fab").dataset.action = this.page === "habits" ? "new-habit" : "new-item";
    $("#fab").dataset.module = fabModule;
    $("#fab").hidden = ["settings", "meditation", "medstats", "journal", "trip"].includes(this.page);
    this.#map?.remove();
    this.#map = null;

    const main = $("#calendar");
    main.dataset.view = this.page ?? this.view;
    if (this.page) {
      main.innerHTML = PAGES[this.page].render({
        repo: this.repo,
        today,
        settings: this.repo.settings,
        voices: this.voices ?? [],
        storageProtected: this.storageProtected,
        cursor: this.cursor,
        promptShift: this.promptShift,
        statsPeriod: this.statsPeriod,
        statsOffset: this.statsOffset,
        tripId: this.tripId,
        storageLabel: this.storageLabel,
        count: this.repo.all().length,
      });
      $("#nudges").innerHTML = "";
      if (this.page === "trip") this.#mountTripMap();
    } else {
      main.innerHTML = VIEWS[this.view].render({ cursor: this.cursor, repo: this.repo, today });
      this.#renderNudges(today);
    }
  }

  #renderTopbar() {
    const pageButtons = `<div class="page-links">
      <button type="button" class="icon-btn ${this.page === "shopping" ? "active" : ""}" data-action="open-shopping"
        aria-label="${esc(t("nav.shopping"))}" title="${esc(t("nav.shopping"))}">🛒</button>
      <button type="button" class="icon-btn ${["trips", "trip"].includes(this.page) ? "active" : ""}" data-action="open-trips"
        aria-label="${esc(t("nav.trips"))}" title="${esc(t("nav.trips"))}">✈️</button>
      <button type="button" class="icon-btn ${this.page === "journal" ? "active" : ""}" data-action="open-journal"
        aria-label="${esc(t("nav.journal"))}" title="${esc(t("nav.journal"))}">📓</button>
      <button type="button" class="icon-btn ${this.page === "meditation" ? "active" : ""}" data-action="open-meditation"
        aria-label="${esc(t("nav.meditation"))}" title="${esc(t("nav.meditation"))}">🧘</button>
      <button type="button" class="icon-btn ${this.page === "habits" ? "active" : ""}" data-action="open-habits"
        aria-label="${esc(t("nav.habits"))}" title="${esc(t("nav.habits"))}">🌱</button>
      <button type="button" class="icon-btn ${this.page === "settings" ? "active" : ""}" data-action="open-settings"
        aria-label="${esc(t("nav.settings"))}" title="${esc(t("nav.settings"))}">⚙︎</button>
      </div>`;

    if (this.page) {
      $("#topbar").innerHTML = `
        <div class="nav">
          <button type="button" class="btn soft" data-action="back">‹ ${t(PAGES[this.page].parent ? `nav.${PAGES[this.page].parent}` : "nav.calendar")}</button>
          <h1 id="title">${esc(PAGES[this.page].title({ repo: this.repo, tripId: this.tripId }))}</h1>
        </div>
        <div class="nav">${pageButtons}</div>`;
      document.title = `${PAGES[this.page].title({ repo: this.repo, tripId: this.tripId })} – LifeCal`;
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
      hour: new Date().getHours(),
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

  // Redessine la fiche ouverte sans perdre la position de défilement.
  #refreshDetail(id, focusSelector) {
    const sheet = $("#modal .sheet");
    const top = sheet.scrollTop;
    this.openItem(id);
    sheet.scrollTop = top;
    if (focusSelector) $(focusSelector, sheet)?.focus();
  }

  async #updateChecklist(id, change, focusSelector) {
    const item = this.repo.get(id);
    const before = progress(getChecklist(item));
    const list = change(getChecklist(item));
    await this.#updateData(id, { checklist: list }, focusSelector);
    if (!before.complete && progress(list).complete) toast(t("checklist.allDone"));
  }

  // Modifie item.data puis redessine la fiche ouverte, ou la page (voyage).
  async #updateData(id, patch, focusSelector) {
    const item = this.repo.get(id);
    const top = window.scrollY;
    await this.repo.update(id, { data: { ...item.data, ...patch } });
    if (!$("#modal").hidden) return this.#refreshDetail(id, focusSelector);
    window.scrollTo(0, top);
    if (focusSelector) $(focusSelector)?.focus();
  }

  openTrip(id) {
    closeModal();
    this.tripId = id;
    this.page = "trip";
    this.#setHash(`#/trip/${id}`, true);
  }

  // Carte du voyage : montée après le rendu de la page (Leaflet a besoin du DOM).
  #mountTripMap() {
    const el = $("#trip-map");
    if (!el) return;
    const trip = this.repo.get(el.dataset.id);
    mountMap(el, located(getPlaces(trip)), { color: MODULES.voyage.color })
      .then((map) => {
        // La page a pu être redessinée pendant le chargement de la carte.
        if (el.isConnected) this.#map = map;
        else map?.remove();
      })
      .catch(() => {
        if (!el.isConnected) return;
        el.hidden = true;
        $("[data-role=map-status]").textContent = t("trip.mapOffline");
      });
  }

  async #locatePlace(el) {
    const trip = this.repo.get(el.dataset.id);
    const place = getPlaces(trip).find((p) => p.id === el.dataset.entry);
    el.disabled = true;
    try {
      const hit =
        (await geocode([place.name, trip.place].filter(Boolean).join(", "), getLanguage())) ??
        (trip.place ? await geocode(place.name, getLanguage()) : null);
      if (!hit) return toast(t("trip.notFound"));
      await this.#updateData(trip.id, { places: setPlaceCoords(getPlaces(trip), place.id, hit) });
      toast(t("trip.located", { name: place.name }));
    } catch {
      toast(t("trip.mapOffline"));
    } finally {
      el.disabled = false;
    }
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
    back: () => {
      const parent = PAGES[this.page]?.parent;
      if (parent) this.openPage(parent);
      else this.backToCalendar();
    },
    "open-trip": (el) => this.openTrip(el.dataset.id),
    "place-remove": (el) => {
      const trip = this.repo.get(el.dataset.id);
      return this.#updateData(trip.id, { places: removePlace(getPlaces(trip), el.dataset.entry) });
    },
    "place-locate": (el) => this.#locatePlace(el),
    "open-medstats": () => {
      this.statsOffset = 0;
      this.openPage("medstats");
    },
    "stats-period": (el) => {
      this.statsPeriod = el.dataset.period;
      this.statsOffset = 0;
      this.render();
    },
    "stats-shift": (el) => {
      this.statsOffset = Math.max(0, this.statsOffset + Number(el.dataset.step));
      this.render();
    },
    "stats-bar": (el) => {
      $("[data-role=readout]").textContent = el.dataset.readout;
      document.querySelectorAll(".bar-group.selected").forEach((g) => g.classList.remove("selected"));
      el.classList.add("selected");
    },
    "open-day": (el) => this.navigate("day", parseISODate(el.dataset.date), { push: true }),
    "open-month": (el) => this.navigate("month", parseISODate(el.dataset.date), { push: true }),
    "open-habits": () => {
      closeModal();
      this.openPage("habits");
    },
    "open-settings": () => this.openPage("settings"),
    "open-journal": (el) => {
      closeModal();
      const today = todayISO();
      const date = el.dataset.date && el.dataset.date <= today ? el.dataset.date : today;
      this.cursor = parseISODate(date);
      this.promptShift = 0;
      if (this.page === "journal") this.#setHash(`#/journal/${date}`, false);
      else this.openPage("journal");
    },
    "journal-day": (el) => {
      this.cursor = parseISODate(el.dataset.date);
      this.promptShift = 0;
      this.#setHash(`#/journal/${el.dataset.date}`, false);
    },
    "journal-mood": (el) => {
      const wasSelected = el.classList.contains("selected");
      el.parentElement.querySelectorAll(".mood").forEach((b) => {
        const on = b === el && !wasSelected; // toucher à nouveau = effacer
        b.classList.toggle("selected", on);
        b.setAttribute("aria-checked", String(on));
      });
      return this.#saveJournal();
    },
    "journal-next-prompt": () => {
      this.#flushJournal();
      this.promptShift++;
      this.render();
    },
    "journal-use-prompt": (el) => {
      const area = $("[data-journal=text]");
      const prefix = `${el.dataset.prompt}\n`;
      if (!area.value.startsWith(prefix)) area.value = prefix + area.value;
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
      return this.#saveJournal();
    },
    "open-meditation": () => {
      closeModal();
      this.openPage("meditation");
    },
    "med-setup": (el) => {
      const prefs = this.repo.settings.meditation ?? {};
      openModal(setupSheet(el.dataset.kind, el.dataset.id, prefs), { labelledBy: "med-setup-title" });
    },
    "test-voice": () => {
      const prefs = this.repo.settings.meditation ?? {};
      const voice = pickVoice(getLanguage(), prefs.voices?.[getLanguage()], this.voices);
      new SpeechVoice({ voice, lang: getLanguage() }).speak(t("med.testPhrase"));
    },
    "new-item": (el) => {
      if (el.dataset.module) return this.openNewItem({ date: todayISO(), module: el.dataset.module });
      this.openNewItem(el.dataset.date ? { date: el.dataset.date } : {});
    },
    "open-shopping": () => this.openPage("shopping"),
    "open-trips": () => this.openPage("trips"),
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
    "check-remove": (el) => this.#updateChecklist(el.dataset.id, (list) => removeEntry(list, el.dataset.entry)),
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
    if (el.dataset.action === "place-toggle") {
      const trip = this.repo.get(el.dataset.id);
      await this.#updateData(trip.id, { places: toggleVisited(getPlaces(trip), el.dataset.entry) });
      return;
    }
    if (el.dataset.action === "check-toggle") {
      await this.#updateChecklist(el.dataset.id, (list) => toggleEntry(list, el.dataset.entry));
      return;
    }
    if (el.dataset.action === "pick-voice") {
      const prefs = this.repo.settings.meditation ?? {};
      await this.repo.updateSettings({ meditation: { ...prefs, voices: { ...prefs.voices, [getLanguage()]: el.value } } });
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
    if (e.target.id === "med-setup") return this.#startMeditation(e);
    if (e.target.classList.contains("place-add")) {
      e.preventDefault();
      const name = $("[data-role=place-input]", e.target).value;
      if (!name.trim()) return;
      const trip = this.repo.get(e.target.dataset.id);
      return this.#updateData(trip.id, { places: addPlace(getPlaces(trip), name) }, "[data-role=place-input]");
    }
    if (e.target.classList.contains("check-add")) {
      e.preventDefault();
      const input = $("[data-role=checklist-input]", e.target);
      const text = input.value;
      if (!text.trim()) return;
      const target = `.check-add[data-id="${CSS.escape(e.target.dataset.id)}"] [data-role=checklist-input]`;
      return this.#updateChecklist(e.target.dataset.id, (list) => addEntry(list, text), target);
    }
    if (e.target.id !== "item-form") return;
    e.preventDefault();
    const form = e.target;
    const existing = form.dataset.id ? this.repo.get(form.dataset.id) : null;
    const { checklistText, endDate, ...data } = readItemForm(form, existing);
    if (checklistText !== null) {
      data.data = { ...(existing?.data ?? {}), checklist: fromLines(checklistText, getChecklist(existing)) };
    }
    if (endDate !== null) {
      if (endDate && endDate < data.date) {
        $("[data-role=errors]", form).textContent = t("errors.endDate");
        return;
      }
      data.data = { ...(data.data ?? existing?.data ?? {}), endDate: endDate > data.date ? endDate : null };
    }
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

  // ---- Journal -----------------------------------------------------------

  #scheduleJournalSave() {
    clearTimeout(this.#journalTimer);
    const status = $("[data-role=save-status]");
    if (status) status.textContent = t("journal.saving");
    this.#journalTimer = setTimeout(() => this.#saveJournal(), JOURNAL_SAVE_DELAY);
  }

  // Enregistre tout de suite ce qui attend (avant de quitter la page).
  #flushJournal() {
    if (this.#journalTimer) this.#saveJournal();
  }

  async #saveJournal() {
    clearTimeout(this.#journalTimer);
    this.#journalTimer = null;
    const root = $(".journal-entry");
    if (!root) return;
    const iso = root.dataset.date;
    const content = readJournal(root); // lu tout de suite, avant tout changement d'écran
    const status = $("[data-role=save-status]");
    const existing = entryFor(this.repo.all(), iso);
    this.#quiet = true;
    try {
      if (isEmptyContent(content)) {
        if (existing) await this.repo.remove(existing.id);
      } else {
        const fields = {
          title: entryTitle(content, t("journal.untitled"), tList("journal.prompts")),
          module: JOURNAL_MODULE,
          date: iso,
          notes: "",
          data: { ...(existing?.data ?? {}), ...content },
        };
        if (existing) await this.repo.update(existing.id, fields);
        else await this.repo.add(fields);
      }
      if (status?.isConnected) status.textContent = t("journal.saved");
    } catch (err) {
      console.error(err);
      if (status?.isConnected) status.textContent = t("toast.error");
    } finally {
      this.#quiet = false;
    }
  }

  // Prépare la séance choisie et ouvre le lecteur (dans le geste de l'utilisateur).
  #startMeditation(e) {
    e.preventDefault();
    const form = e.target;
    const { kind, id } = form.dataset;
    const f = new FormData(form);
    const minutes = Number(f.get("minutes"));
    const ambience = f.get("ambience") ?? "none";
    const interval = Number(f.get("interval") ?? 0);
    const voiceOn = kind !== "timer" && f.get("voice") === "on";
    const prefs = this.repo.settings.meditation ?? {};
    this.repo.updateSettings({
      meditation: { ...prefs, ambience, ...(kind === "timer" ? { interval } : { voiceOn }), minutes: { ...prefs.minutes, [kind]: minutes } },
    });

    let script;
    if (kind === "session") script = sessionContent(id).script;
    else if (kind === "breathing") {
      const pattern = BREATHING_EXERCISES.find((b) => b.id === id).pattern;
      script = breathingScript(pattern, minutes, { intro: t("med.breath.intro"), outro: t("med.breath.outro") });
    } else script = timerScript(minutes, interval);

    const content = setupContent(kind, id);
    closeModal();
    this.player.open({ kind, id, title: content.title, kicker: content.kicker, color: content.color, script, minutes, ambience, voiceOn });
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
    this.repo.updateSettings({ lastExport: todayISO() });
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
