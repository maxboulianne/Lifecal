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
import { FREQ, doneInWeek, yearlyDate } from "../data/recurrence.js";
import { ValidationError } from "../data/repository.js";
import { isCancelled, newId } from "../data/item.js";
import { addEntry, fromLines, getChecklist, progress, removeEntry, toggleEntry } from "../data/checklist.js";
import { getCurrentPosition, watchPosition } from "../geo/geo.js";
import { fmt, getLanguage, setLanguage, t, tList } from "../i18n/index.js";
import { itemDetail } from "./components/item-detail.js";
import { itemForm, readItemForm, syncRepeatFields } from "./components/item-form.js";
import { closeModal, openModal, setupModal } from "./components/modal.js";
import { nudgesBar } from "./components/nudges.js";
import { cheer, toast } from "./components/toast.js";
import { CHEVRON_LEFT, CHEVRON_RIGHT } from "./components/icons.js";
import { setFoldOpen } from "./components/fold.js";
import { welcome } from "./components/welcome.js";
import { MeditationPlayer } from "./meditation/player.js";
import { habitsPage } from "./pages/habits.js";
import { journalPage, readJournal } from "./pages/journal.js";
import { JOURNAL_MODULE, entryFor, entryTitle, isEmptyContent } from "../journal/journal.js";
import { meditationPage, setupContent, setupSheet } from "./pages/meditation.js";
import { meditationStatsPage } from "./pages/meditation-stats.js";
import { tripPage } from "./pages/trip.js";
import { tripsPage } from "./pages/trips.js";
import { eventsPage } from "./pages/events.js";
import { SHOPPING_TABS, perText, shoppingPage } from "./pages/shopping.js";
import { parseAmount, addCustomItem, fromChecklist, looksLikeGroceryList, removeCustomItem, toChecklist, toggleListed, addToList, clearDone, createPrice, planList, productKey, removeListEntry, toggleListEntry } from "../grocery/grocery.js";
import { getStore } from "../grocery/stores.js";
import { mountMap } from "../travel/map.js";
import { MAX_CHAINS, fetchHotels, fetchSuggestions, getChain } from "../travel/discover.js";
import { geocode } from "../travel/geocode.js";
import { addPlace, getPlaces, located, removePlace, setPlaceCoords, toggleVisited, cachedHotels, cachedSuggestions, destQuery, getDest, hotelsKey, suggestionsKey } from "../travel/trip.js";
import { settingsPage } from "./pages/settings.js";
import { CUSTOM_TASK, dayOfMonth, rangeDates, timesheetPage } from "./pages/timesheet.js";
import { addTask, getTask, removeTask, taskUseCount, updateTask } from "../timesheet/tasks.js";
import { normalizeTime, parsePause, setPresence } from "../timesheet/presence.js";
import {
  activeProjects, addClient, addEntry as addTsEntry, addProject, copyDay, deleteClient, deleteProject, getClient, getProject, parseHours, projectEntryCount,
  LOGO_MAX_LENGTH, nextInvoiceNumber, projectLabel, removeEntry as removeTsEntry, updateBusiness, updateClient, updateEntry as updateTsEntry, updateProject,
} from "../timesheet/timesheet.js";
import { timesheetSheets } from "../timesheet/export.js";
import { invoiceData, invoiceSheets } from "../timesheet/invoice.js";
import { deleteFile, getFile, pruneFiles, putFile } from "../data/files.js";
import { invoicePdf } from "../timesheet/invoice-pdf.js";
import { receiptsPdf } from "../timesheet/receipts-pdf.js";
import { PDF_TYPE, jpegInfo } from "../export/pdf.js";
import { scanImage } from "./components/scanner.js";
import { attachmentsView } from "./components/attachments-view.js";
import {
  EXPENSE_ICONS, addAttachment, attachmentIds, moveAttachment, removeAttachment, updateAttachment,
} from "../timesheet/expenses.js";
import { RECEIPT_SLOTS, receiptView, slotStatus } from "./components/receipt-view.js";
import { readText } from "../scan/ocr.js";
import { parseReceipt, receiptExpense } from "../scan/receipt.js";
import {
  addExpense, addRecurring, expenseTotal as expenseTotalOf, monthLabel, removeExpense, removeRecurring, setRate, syncRecurring, updateExpense, updateRecurring,
} from "../timesheet/expenses.js";
import { invoicePreview } from "./components/invoice-view.js";
import { XLSX_TYPE, buildXlsx } from "../export/xlsx.js";
import { DEFAULT_VIEW, VIEWS, VIEW_ORDER } from "./views/index.js";
import { MeditationAudio } from "../meditation/audio.js";
import { BREATHING_EXERCISES } from "../meditation/catalog.js";
import { breathingScript, timerScript } from "../meditation/runner.js";
import { sessionContent } from "../meditation/scripts/index.js";
import { loadVoices, pickVoice, SpeechVoice } from "../meditation/voice.js";

// Catégories ouvertes de la liste personnalisée : une préférence de cet
// appareil (le stockage peut être indisponible, ex. navigation privée).
const CATALOG_OPEN_KEY = "lifecal:catalogOpen";
function readCatalogOpen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CATALOG_OPEN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}
function saveCatalogOpen(open) {
  try {
    localStorage.setItem(CATALOG_OPEN_KEY, JSON.stringify([...open]));
  } catch {
    /* préférence non retenue : sans conséquence */
  }
}

const SWIPE_MIN_PX = 60;

// Écran tactile (iPhone, iPad) : les champs d'heure et de date s'ouvrent en roulette.
const TOUCH = globalThis.matchMedia?.("(pointer: coarse)") ?? { matches: false };
const isPickerField = (el) => (el?.type === "time" || el?.type === "date") && Boolean(el.dataset?.action?.startsWith("ts-"));
// Enregistrer à la fermeture : toujours pour une heure (on tape l'heure puis les minutes),
// et pour une date sur écran tactile (roulette) ; avec la souris, une date choisie compte tout de suite.
const savesOnClose = (el) => isPickerField(el) && (el.type === "time" || TOUCH.matches);

// Nombre écrit à la main : « 2 924 738 », « 0,000053931 », « 25,50 $ » ; null si invalide ou 0.
const readNumber = (value) => parseAmount(String(value ?? "").replace(/[\s$\u00a0\u202f]/g, ""));

// Mots d'une recherche, écrits comme les clés de produits (sans accents).
const productKeyWords = (query) => productKey(query).split(" ").filter(Boolean);

const PAGES = {
  journal: journalPage,
  meditation: meditationPage,
  medstats: meditationStatsPage,
  trips: tripsPage,
  events: eventsPage,
  trip: tripPage,
  shopping: shoppingPage,
  habits: habitsPage,
  timesheet: timesheetPage,
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
  shoppingTab = "grocery";
  catalogOpen = readCatalogOpen(); // catégories ouvertes de la liste personnalisée
  catalogQuery = "";
  groceryPrefill = null;
  lastStore = null;
  statsPeriod = "week";
  statsOffset = 0;
  tripId = null;
  timesheetDate = null; // null = aujourd'hui
  timesheetProject = null; // dernier projet choisi pour ajouter des heures
  receipt = null; // « Scanner un reçu » en cours : { date, slots, values, auto }
  timesheetExport = { range: "thisMonth", from: "", to: "", clientId: "" };
  #invoicePending = null; // facture affichée dans l'aperçu
  #pruned = false; // justificatifs inutilisés déjà effacés pendant ce lancement
  editingExpense = null; // dépense en cours de modification
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
    this.#linkGroceryList().catch((err) => console.error(err));
    document.addEventListener("click", (e) => this.#onClick(e));
    document.addEventListener("change", (e) => this.#onChange(e));
    // Roulettes d'heure et de date (iPhone, iPad) : enregistrer quand on les referme.
    document.addEventListener("focusout", (e) => {
      // Aussi une valeur proposée (en gris) qu'on confirme en la touchant puis en la quittant
      const confirmable = savesOnClose(e.target) || (e.target.dataset?.suggest && e.target.dataset.action?.startsWith("ts-"));
      if (confirmable && e.target.isConnected && e.target.value !== e.target.defaultValue) {
        this.#onTimesheetChange(e.target);
      }
    });
    document.addEventListener("submit", (e) => this.#onSubmit(e));
    this.#listenSwipe();
    // Flèches du clavier (iPad avec clavier, ordinateur) : jour, semaine, mois ou année d'avant ou d'après.
    document.addEventListener("keydown", (e) => {
      // Entrée dans un champ d'heure : valider (comme fermer la roulette)
      if (e.key === "Enter" && savesOnClose(e.target)) {
        e.preventDefault();
        e.target.blur();
        return;
      }
      if (this.page || !$("#modal").hidden || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") this.#actions.prev();
      if (e.key === "ArrowRight") this.#actions.next();
    });
    document.addEventListener("input", (e) => {
      if (e.target.dataset.journal) this.#scheduleJournalSave();
      if (e.target.dataset.role === "grocery-search") this.#filterPrices(e.target.value);
      if (e.target.form?.dataset.role === "ts-expense") this.#syncExpenseForm(e.target.form);
      if (e.target.dataset.role === "catalog-search") {
        this.catalogQuery = e.target.value;
        this.#filterCatalog(this.catalogQuery);
      }
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

  // Glisser le doigt vers la gauche ou la droite sur le calendrier : période
  // suivante ou précédente (un geste surtout horizontal, d'au moins 60 px).
  #listenSwipe() {
    const area = $("#calendar");
    let start = null;
    area.addEventListener("touchstart", (e) => {
      start = !this.page && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    }, { passive: true });
    area.addEventListener("touchend", (e) => {
      if (!start || this.page) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      start = null;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      this.#actions[dx < 0 ? "next" : "prev"]();
    }, { passive: true });
  }

  #readHash() {
    const [, first, second] = location.hash.match(/^#\/(\w+)(?:\/([\w-]+))?/) ?? [];
    this.page = PAGES[first] ? first : null;
    if (VIEWS[first]) this.view = first;
    if (first === "trip") this.tripId = second ?? null;
    else if (first === "shopping") this.shoppingTab = SHOPPING_TABS.includes(second) ? second : "grocery";
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
    const fabModule = { trips: "voyage", events: "evenement" }[this.page] ?? "";
    $("#fab").setAttribute("aria-label", t({ habits: "habits.add", trips: "trips.add", events: "events.add" }[this.page] ?? "nav.add"));
    $("#fab").dataset.action = this.page === "habits" ? "new-habit" : "new-item";
    $("#fab").dataset.module = fabModule;
    $("#fab").hidden = ["settings", "meditation", "medstats", "journal", "trip", "timesheet"].includes(this.page)
      || this.page === "shopping"; // l'épicerie a ses propres champs
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
        tripStatus: this.#tripStatus[this.tripId] ?? {},
        shoppingTab: this.shoppingTab,
        groceryPrefill: this.groceryPrefill,
        lastStore: this.lastStore,
        catalogOpen: this.catalogOpen,
        timesheetDate: this.timesheetDate,
        timesheetProject: this.timesheetProject,
        timesheetExport: this.timesheetExport,
        editingExpense: this.editingExpense,
        storageLabel: this.storageLabel,
        count: this.repo.all().length,
      });
      $("#nudges").innerHTML = "";
      if (this.page === "timesheet") {
        this.#syncMonthly();
        // Heure proposée (ex. fin à 17 h) : affichée, mais enregistrée seulement une fois confirmée
        for (const el of document.querySelectorAll("input[data-suggest]")) if (!el.value) el.value = el.dataset.suggest;
      }
      if (this.page === "trip") {
        this.#mountTripMap();
        this.#discoverTrip(this.tripId);
      }
      if (this.page === "shopping" && this.catalogQuery) {
        const search = $("[data-role=catalog-search]");
        if (search) search.value = this.catalogQuery;
        this.#filterCatalog(this.catalogQuery);
      }
    } else {
      main.innerHTML = VIEWS[this.view].render({ cursor: this.cursor, repo: this.repo, today });
      this.#renderNudges(today);
    }
  }

  #renderTopbar() {
    const pageButtons = `<div class="page-links">
      <button type="button" class="icon-btn ${this.page === "shopping" ? "active" : ""}" data-action="open-shopping"
        aria-label="${esc(t("nav.shopping"))}" title="${esc(t("nav.shopping"))}">🛒</button>
      <button type="button" class="icon-btn ${this.page === "events" ? "active" : ""}" data-action="open-events"
        aria-label="${esc(t("nav.events"))}" title="${esc(t("nav.events"))}">🎂</button>
      <button type="button" class="icon-btn ${["trips", "trip"].includes(this.page) ? "active" : ""}" data-action="open-trips"
        aria-label="${esc(t("nav.trips"))}" title="${esc(t("nav.trips"))}">✈️</button>
      <button type="button" class="icon-btn ${this.page === "timesheet" ? "active" : ""}" data-action="open-timesheet"
        aria-label="${esc(t("nav.timesheet"))}" title="${esc(t("nav.timesheet"))}">⏱️</button>
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
        <button type="button" class="nav-arrow" data-action="prev" aria-label="${esc(t(`nav.prev.${this.view}`))}" title="${esc(t(`nav.prev.${this.view}`))}">${CHEVRON_LEFT}</button>
        <h1 id="title" aria-live="polite">${esc(title)}</h1>
        <button type="button" class="nav-arrow" data-action="next" aria-label="${esc(t(`nav.next.${this.view}`))}" title="${esc(t(`nav.next.${this.view}`))}">${CHEVRON_RIGHT}</button>
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
      timesheet: this.repo.timesheet(),
      hour: new Date().getHours(),
    });
    this.#lastNudgeKey = nudges.map((n) => n.id).join("|");
    $("#nudges").innerHTML = nudgesBar(nudges);
  }

  // ---- Fenêtres ----------------------------------------------------------

  openNewItem(options = {}) {
    openModal(itemForm(null, { date: toISODate(this.cursor), ...options }), { labelledBy: "form-title" });
  }

  #detailDate = null; // date de l'occurrence affichée (fête qui revient chaque année)

  openItem(id, date) {
    this.#detailDate = date ?? null;
    const item = this.repo.getOn(id, date);
    if (!item) return;
    openModal(itemDetail(item, { today: todayISO() }), { labelledBy: "detail-title" });
  }

  // Redessine la fiche ouverte sans perdre la position de défilement.
  #refreshDetail(id, focusSelector) {
    const sheet = $("#modal .sheet");
    const top = sheet.scrollTop;
    this.openItem(id, this.#detailDate);
    sheet.scrollTop = top;
    if (focusSelector) $(focusSelector, sheet)?.focus();
  }

  // `field` : la liste « checklist » ou une autre (idées cadeaux, invités…).
  async #updateChecklist(id, change, focusSelector, field = "checklist") {
    const item = this.repo.get(id);
    const before = progress(getChecklist(item, field));
    const list = change(getChecklist(item, field));
    await this.#updateData(id, { [field]: list }, focusSelector);
    // La « Liste d'épicerie » du calendrier : la liste d'épicerie suit.
    if (item.data?.grocery && field === "checklist") await this.repo.updateGrocery({ list: fromChecklist(this.repo.grocery().list, list) });
    if (field === "checklist" && !before.complete && progress(list).complete) toast(t("checklist.allDone"));
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

  // ---- Épicerie ----------------------------------------------------------

  #openShoppingTab(tab) {
    this.shoppingTab = SHOPPING_TABS.includes(tab) ? tab : "grocery";
    if (this.shoppingTab !== "prices") this.groceryPrefill = null;
    history.replaceState(null, "", `#/shopping/${this.shoppingTab}`);
    this.render();
  }

  // Modifie la section épicerie sans perdre la position dans la page.
  async #updateGrocery(patch, focusSelector) {
    const top = window.scrollY;
    await this.repo.updateGrocery(patch);
    if (patch.list) await this.#syncGroceryToCalendar();
    window.scrollTo(0, top);
    if (focusSelector) $(focusSelector)?.focus();
  }

  async #addGrocery(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const product = String(f.get("product") ?? "").trim();
    if (!product) return;
    const before = this.repo.grocery().list;
    const list = addToList(before, product, f.get("qty"));
    if (list === before) return toast(t("grocery.already", { name: product }));
    await this.#updateGrocery({ list }, "[data-role=grocery-add] [name=product]");
  }

  async #addPrice(e) {
    e.preventDefault();
    const form = e.target;
    const f = new FormData(form);
    const errors = $("[data-role=errors]", form);
    if (!String(f.get("product") ?? "").trim()) return (errors.textContent = t("grocery.errors.product"));
    const price = createPrice({
      product: f.get("product"), store: f.get("store"), price: f.get("price"), qty: f.get("qty"), unit: f.get("unit"),
      deal: f.get("deal") === "on", until: f.get("until") || null,
    }, todayISO());
    if (!price) return (errors.textContent = t("grocery.errors.price"));
    this.lastStore = price.store;
    this.groceryPrefill = null;
    await this.#updateGrocery({ prices: [...this.repo.grocery().prices, price] });
    toast(t("grocery.saved", { name: price.product, store: getStore(price.store)?.name ?? "" }));
    $("[data-role=price-add] [name=product]")?.focus();
  }

  // Ouvre ou ferme une catégorie de la liste personnalisée, sans redessiner
  // la page ; l'état est retenu (aussi après un rechargement).
  #foldCategory(id, open) {
    if (open) this.catalogOpen.add(id);
    else this.catalogOpen.delete(id);
    saveCatalogOpen(this.catalogOpen);
    const card = $(`.catalog-cat[data-category="${id}"]`);
    if (!card) return;
    card.classList.toggle("is-open", open);
    $(".catalog-fold", card).setAttribute("aria-expanded", String(open));
    $(".catalog-body", card).hidden = !open;
  }

  // Recherche dans la liste personnalisée : seuls les articles qui
  // correspondent restent visibles, dans leurs catégories ouvertes.
  #filterCatalog(query) {
    const words = productKeyWords(query);
    let shown = 0;
    document.querySelectorAll(".catalog-cat").forEach((card) => {
      let matches = 0;
      card.querySelectorAll(".catalog-item").forEach((item) => {
        const key = productKey(item.textContent);
        const match = words.every((w) => key.includes(w));
        item.hidden = !match;
        if (match) matches++;
      });
      const open = words.length ? matches > 0 : this.catalogOpen.has(card.dataset.category);
      card.hidden = words.length > 0 && matches === 0;
      card.classList.toggle("is-open", open);
      $(".catalog-body", card).hidden = !open;
      $(".catalog-fold", card).setAttribute("aria-expanded", String(open));
      if (!card.hidden) shown++;
    });
    const none = $("[data-role=catalog-no-match]");
    if (none) none.hidden = shown > 0;
  }

  // Recherche dans le carnet de prix, sans redessiner la page.
  #filterPrices(query) {
    const words = productKeyWords(query);
    let shown = 0;
    document.querySelectorAll(".price-card").forEach((card) => {
      const match = words.every((w) => card.dataset.key.includes(w));
      card.hidden = !match;
      if (match) shown++;
    });
    const none = $("[data-role=no-match]");
    if (none) none.hidden = shown > 0;
  }

  // La commission « Liste d'épicerie » du calendrier qui reflète la liste d'épicerie.
  #groceryItem() {
    return this.repo.all()
      .filter((i) => i.data?.grocery && !i.done && !isCancelled(i))
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  }

  // Met la « Liste d'épicerie » du calendrier à jour (la crée au besoin, pour
  // aujourd'hui ; une liste d'un jour passé est ramenée à aujourd'hui).
  async #syncGroceryToCalendar() {
    const list = this.repo.grocery().list;
    const linked = this.#groceryItem();
    const today = todayISO();
    const checklist = toChecklist(list);
    if (!linked) {
      if (!list.some((e) => !e.done)) return;
      await this.repo.add({ title: t("grocery.tab.grocery"), module: "commission", date: today, data: { grocery: true, checklist } });
      return;
    }
    const date = linked.date < today ? today : linked.date;
    if (date === linked.date && JSON.stringify(checklist) === JSON.stringify(getChecklist(linked))) return;
    await this.repo.update(linked.id, { date, data: { ...linked.data, checklist } });
  }

  // Au démarrage : une ancienne commission « Liste d'épicerie » est reprise (ses
  // articles rejoignent la liste d'épicerie) plutôt que d'avoir deux listes.
  async #linkGroceryList() {
    if (!this.#groceryItem()) {
      const names = [t("grocery.tab.grocery"), "Liste d'épicerie", "Épicerie", "Grocery list", "Groceries"];
      const old = this.repo.all().find((i) => looksLikeGroceryList(i, names));
      if (old) {
        let list = this.repo.grocery().list;
        for (const c of getChecklist(old)) if (!c.done) list = addToList(list, c.text);
        await this.repo.updateGrocery({ list });
        await this.repo.update(old.id, { data: { ...old.data, grocery: true, checklist: toChecklist(list) } });
      }
    }
    await this.#syncGroceryToCalendar();
  }

  openTrip(id) {
    closeModal();
    this.tripId = id;
    this.page = "trip";
    this.#setHash(`#/trip/${id}`, true);
  }

  // Carte du voyage : montée après le rendu de la page (Leaflet a besoin du DOM).
  // Centrée sur la destination, avec les lieux et les hôtels des chaînes choisies.
  #mountTripMap() {
    const el = $("#trip-map");
    if (!el) return;
    const trip = this.repo.get(el.dataset.id);
    const hotels = (cachedHotels(trip) ?? []).map((h) => ({
      ...h, color: getChain(h.chain).color, chainName: getChain(h.chain).name,
      distance: t("trip.hotelDistance", { km: fmt.decimal(h.km) }),
    }));
    mountMap(el, { center: getDest(trip), places: located(getPlaces(trip)), hotels, color: MODULES.voyage.color, labels: { website: t("trip.website") } })
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

  // État des recherches d'un voyage (en mémoire seulement) :
  // { dest, suggestions, hotels } = "loading" | "notfound" | "offline", et les clés déjà tentées.
  #tripStatus = {};

  #rerenderTrip(id) {
    if (this.page !== "trip" || this.tripId !== id) return;
    const top = window.scrollY;
    this.render();
    window.scrollTo(0, top);
  }

  // Trouve la destination sur la carte, puis les lieux célèbres, puis les hôtels
  // des chaînes choisies. Chaque recherche n'est faite qu'une fois ; le résultat
  // est gardé dans le voyage (consultable ensuite sans Internet).
  async #discoverTrip(id) {
    const status = (this.#tripStatus[id] ??= {});
    const lang = getLanguage();
    let trip = this.repo.get(id);
    if (!trip) return;
    const query = destQuery(trip);
    if (query && !getDest(trip)) {
      if (status.destKey === query) return; // déjà en cours, introuvable ou hors ligne
      status.destKey = query;
      status.dest = "loading";
      this.#rerenderTrip(id);
      try {
        const hit = await geocode(query, lang);
        status.dest = hit ? undefined : "notfound";
        if (hit) await this.#updateData(id, { dest: { query, lat: hit.lat, lng: hit.lng } });
        else this.#rerenderTrip(id);
      } catch {
        status.dest = "offline";
        this.#rerenderTrip(id);
      }
      return; // la page redessinée relance la suite
    }
    const dest = getDest(trip);
    if (!dest) return;
    const sKey = suggestionsKey(trip, lang);
    if (cachedSuggestions(trip, lang) === null && status.suggestionsKey !== sKey) {
      status.suggestionsKey = sKey;
      try {
        const items = await fetchSuggestions(dest, lang, { exclude: [query, trip.title] });
        await this.#updateData(id, { suggestions: { key: sKey, items } });
      } catch {
        status.suggestions = "offline";
        this.#rerenderTrip(id);
      }
    }
    trip = this.repo.get(id);
    const hKey = hotelsKey(trip);
    if (hKey && cachedHotels(trip) === null && status.hotelsKey !== hKey) {
      status.hotelsKey = hKey;
      try {
        const items = await fetchHotels(trip.data.hotelChains, getDest(trip));
        if (hotelsKey(this.repo.get(id)) !== hKey) return;
        // Aucun hôtel : rien n'est gardé (on pourra réessayer plus tard).
        if (items.length) await this.#updateData(id, { hotels: { key: hKey, items } });
        else {
          status.hotels = "none";
          this.#rerenderTrip(id);
        }
      } catch {
        status.hotels = "offline";
        this.#rerenderTrip(id);
      }
    }
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
    // Ajouter un lieu célèbre suggéré (déjà placé sur la carte).
    "suggestion-add": (el) => {
      const trip = this.repo.get(el.dataset.id);
      const s = cachedSuggestions(trip, getLanguage())?.[Number(el.dataset.index)];
      if (!s) return;
      const list = addPlace(getPlaces(trip), s.name);
      toast(t("trip.located", { name: s.name }));
      return this.#updateData(trip.id, { places: setPlaceCoords(list, list.at(-1).id, s) });
    },
    // Ouvrir ou fermer une section (flèche ▸), sans redessiner la page.
    fold: (el) => {
      const section = el.closest("[data-fold-id]");
      const open = !section.classList.contains("is-open");
      section.classList.toggle("is-open", open);
      el.setAttribute("aria-expanded", String(open));
      section.querySelector(":scope > .fold-body").hidden = !open;
      setFoldOpen(section.dataset.foldId, open);
      // Une carte qui réapparaît doit recalculer sa taille.
      if (open && section.querySelector("#trip-map")) this.#map?.invalidateSize();
    },
    // Imprimer (ou enregistrer en PDF) seulement la liste « À emporter ».
    "packing-print": () => {
      document.body.classList.add("print-packing");
      const done = () => {
        document.body.classList.remove("print-packing");
        window.removeEventListener("afterprint", done);
        document.removeEventListener("pointerdown", done);
      };
      window.addEventListener("afterprint", done);
      document.addEventListener("pointerdown", done);
      window.print();
    },
    // Partager la liste (Notes, Messages, courriel…) ou la copier.
    "packing-share": async (el) => {
      const trip = this.repo.get(el.dataset.id);
      const text = [`🧳 ${trip.title} — ${t("checklist.title.voyage")}`,
        ...getChecklist(trip).map((e) => `${e.done ? "☑" : "☐"} ${e.text}`)].join("\n");
      try {
        if (navigator.share) await navigator.share({ title: trip.title, text });
        else {
          await navigator.clipboard.writeText(text);
          toast(t("trip.copied"));
        }
      } catch (err) {
        if (err?.name !== "AbortError") toast(t("toast.error"));
      }
    },
    "trip-retry": (el) => {
      delete this.#tripStatus[el.dataset.id];
      this.#rerenderTrip(el.dataset.id);
    },
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
    "open-grocery": () => {
      closeModal();
      this.shoppingTab = "grocery";
      if (this.page === "shopping") this.#openShoppingTab("grocery");
      else this.openPage("shopping");
    },
    "shopping-tab": (el) => this.#openShoppingTab(el.dataset.tab),
    "grocery-remove": (el) => this.#updateGrocery({ list: removeListEntry(this.repo.grocery().list, el.dataset.entry) }),
    "catalog-fold": (el) => this.#foldCategory(el.dataset.category, !this.catalogOpen.has(el.dataset.category)),
    "catalog-fold-all": (el) => {
      document.querySelectorAll(".catalog-cat").forEach((c) => this.#foldCategory(c.dataset.category, el.dataset.open === "true"));
    },
    "catalog-remove": (el) => this.#updateGrocery({ custom: removeCustomItem(this.repo.grocery().custom, el.dataset.id) }),
    "grocery-clear": () => this.#updateGrocery({ list: clearDone(this.repo.grocery().list) }),
    "grocery-add-product": async (el) => {
      await this.#updateGrocery({ list: addToList(this.repo.grocery().list, el.dataset.product) });
      toast(t("grocery.added", { name: el.dataset.product }));
    },
    "grocery-price": (el) => {
      this.groceryPrefill = el.dataset.product;
      this.#openShoppingTab("prices");
      $("[data-role=price-add] [name=price]")?.focus();
    },
    "grocery-price-remove": (el) => this.#updateGrocery({ prices: this.repo.grocery().prices.filter((p) => p.id !== el.dataset.id) }),
    "grocery-print": () => window.print(),

    "open-trips": () => this.openPage("trips"),
    "open-events": () => this.openPage("events"),
    "open-timesheet": () => {
      this.timesheetDate = null;
      if (this.page === "timesheet") return this.render();
      this.openPage("timesheet");
    },
    "ts-day": (el) => this.#showTimesheetDay(el.dataset.date),
    "ts-expense-edit": (el) => {
      this.editingExpense = el.dataset.id;
      this.#renderKeepingScroll();
      $("[data-role=ts-expense][data-edit]")?.scrollIntoView({ block: "center" });
    },
    "ts-expense-cancel": () => {
      this.editingExpense = null;
      this.#renderKeepingScroll();
    },
    "ts-copy": (el) => this.#updateTimesheet(copyDay(this.repo.timesheet(), el.dataset.from, el.dataset.date)),
    "ts-remove": (el) => this.#updateTimesheet(removeTsEntry(this.repo.timesheet(), el.dataset.id)),
    // + ¼ h, + ½ h, + 1 h : ajoute au nombre déjà écrit, sans redessiner.
    "ts-bump": (el) => {
      const input = el.form.elements.hours;
      const now = parseHours(input.value) ?? 0;
      input.value = fmt.hours(Math.round((now + Number(el.dataset.step)) * 100) / 100);
    },
    "ts-archive": (el) => {
      const ts = this.repo.timesheet();
      return this.#updateTimesheet(updateProject(ts, el.dataset.id, { archived: !getProject(ts, el.dataset.id)?.archived }));
    },
    // « ⏱️ Noter des heures » sur un projet : le choisir en haut, prêt à écrire les heures.
    "ts-pick": (el) => {
      this.timesheetProject = el.dataset.id;
      this.render();
      window.scrollTo(0, 0);
      $("[data-role=ts-add] [name=hours]")?.focus({ preventScroll: true });
    },
    "ts-delete-project": (el) => {
      const ts = this.repo.timesheet();
      const p = getProject(ts, el.dataset.id);
      const count = projectEntryCount(ts, el.dataset.id);
      const msg = [t("ts.confirmDeleteProject", { name: projectLabel(p) }), count ? t("ts.confirmDeleteHours", { count }) : ""].filter(Boolean).join("\n\n");
      if (!p || !confirm(msg)) return;
      return this.#updateTimesheet(deleteProject(ts, p.id)).then(() => toast(t("ts.deleted")));
    },
    "ts-delete-client": (el) => {
      const ts = this.repo.timesheet();
      const c = getClient(ts, el.dataset.id);
      if (!c || !confirm(t("ts.confirmDeleteClient", { name: c.name }))) return;
      return this.#updateTimesheet(deleteClient(ts, c.id)).then(() => toast(t("ts.deleted")));
    },
    "ts-range": (el) => {
      const { from, to } = rangeDates(this.timesheetExport.range, todayISO(), this.timesheetExport);
      this.timesheetExport = { ...this.timesheetExport, range: el.dataset.range, from, to, invoiceNumber: "" };
      this.#renderKeepingScroll();
    },
    "ts-export": (el) => this.#exportTimesheet(el.dataset.from, el.dataset.to, el.dataset.client),
    "ts-invoice": (el) => this.#createInvoice(this.#invoiceOptions(el.closest("[data-role=ts-invoice]"))),
    // Aperçu de la facture dans l'application, avant de créer le fichier.
    // Mettre l'écart (présence − heures notées) dans la case des heures à ajouter
    "ts-fill-gap": (el) => {
      const input = $("[data-role=ts-add] [name=hours]");
      if (!input) return toast(t("ts.noProjects"));
      input.value = fmt.hours(Number(el.dataset.hours));
      input.scrollIntoView({ block: "center" });
      input.focus({ preventScroll: true });
    },
    "ts-task-quick": (el) => {
      const ts = this.repo.timesheet();
      return this.#updateTimesheet(updateTask(ts, el.dataset.code, { quick: !getTask(ts, el.dataset.code)?.quick }));
    },
    "ts-task-remove": (el) => {
      const ts = this.repo.timesheet();
      const task = getTask(ts, el.dataset.code);
      const used = taskUseCount(ts, el.dataset.code);
      const msg = [t("ts.confirmDeleteTask", { code: task?.code ?? "", name: task?.description ?? "" }), used ? t("ts.taskStillUsed", { count: used }) : ""].filter(Boolean).join("\n\n");
      if (!task || !confirm(msg)) return;
      return this.#updateTimesheet(removeTask(ts, task.code)).then(() => toast(t("ts.deleted")));
    },
    "ts-attach": (el) => this.#openAttachments(el.dataset.id),
    "ts-receipt": (el) => this.#openReceipt(el.dataset.date),
    "ts-receipt-from": (el) => this.#receiptFromExpense(el.dataset.id),
    "ts-receipt-clear": (el) => {
      this.#captureReceiptForm();
      this.#clearReceiptSlot(el.dataset.kind);
      this.#showReceipt();
    },
    "ts-attach-remove": async (el) => {
      if (!confirm(t("attach.confirmRemove"))) return;
      await this.#updateTimesheet(removeAttachment(this.repo.timesheet(), el.dataset.expense, el.dataset.id));
      await deleteFile(el.dataset.id).catch(() => {});
      this.#openAttachments(el.dataset.expense);
    },
    "ts-invoice-pdf": (el) => this.#sendInvoice(this.#invoiceOptions(el.closest("[data-role=ts-invoice]")), { invoice: true }),
    "ts-receipts-pdf": (el) => this.#sendInvoice(this.#invoiceOptions(el.closest("[data-role=ts-invoice]")), { receipts: true }),
    "ts-invoice-email": (el) => this.#sendInvoice(this.#invoiceOptions(el.closest("[data-role=ts-invoice]")), { invoice: true, receipts: true, email: true }),
    "ts-invoice-pdf-pending": () => this.#sendInvoice(this.#invoicePending, { invoice: true }),
    "ts-invoice-email-pending": () => this.#sendInvoice(this.#invoicePending, { invoice: true, receipts: true, email: true }),
    "ts-recurring-stop": (el) => {
      if (!confirm(t("ts.confirmStopMonthly"))) return;
      return this.#updateTimesheet(removeRecurring(this.repo.timesheet(), el.dataset.id)).then(() => toast(t("ts.monthlyStopped")));
    },
    "ts-expense-remove": (el) => this.#updateTimesheet(removeExpense(this.repo.timesheet(), el.dataset.id)),
    "ts-logo-remove": () => this.#updateTimesheet(updateBusiness(this.repo.timesheet(), { logo: "", logoSize: null })),
    "ts-invoice-preview": (el) => {
      const options = this.#invoiceOptions(el.closest("[data-role=ts-invoice]"));
      if (!options) return;
      this.#invoicePending = options;
      openModal(invoicePreview(invoiceData(this.repo.timesheet(), options)), { labelledBy: "invoice-title" });
      // Sur un téléphone, la page entière tient dans la largeur (on peut zoomer avec deux doigts).
      const doc = $(".invoice-doc");
      const box = $(".invoice-scroll");
      const scale = Math.min(1, box.clientWidth / doc.offsetWidth);
      if (scale < 1) {
        doc.style.transform = `scale(${scale.toFixed(3)})`;
        doc.style.transformOrigin = "top left";
        box.style.height = `${Math.ceil(doc.offsetHeight * scale)}px`;
        box.style.overflow = "hidden";
      }
    },
    "ts-invoice-xlsx": async () => {
      const options = this.#invoicePending;
      closeModal();
      await this.#createInvoice(options);
    },
    // Imprimer (ou enregistrer en PDF) seulement la facture affichée.
    "ts-invoice-print": () => {
      document.body.classList.add("print-invoice");
      const done = () => {
        document.body.classList.remove("print-invoice");
        window.removeEventListener("afterprint", done);
        document.removeEventListener("pointerdown", done);
      };
      window.addEventListener("afterprint", done);
      document.addEventListener("pointerdown", done);
      window.print();
    },
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
      const item = this.repo.get(el.dataset.id);
      const recurring = Boolean(item?.recurrence) && item.module === "habitude";
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
    "check-remove": (el) => this.#updateChecklist(el.dataset.id, (list) => removeEntry(list, el.dataset.entry), null, el.dataset.field),
    export: () => this.#exportData(),
    close: () => closeModal(),
  };

  async #toggleDone(id, date) {
    const item = await this.repo.toggleDone(id, date);
    // « Liste terminée » sur la liste d'épicerie : les articles pris sont retirés ;
    // ceux qui restent iront dans la prochaine liste.
    if (item.data?.grocery && item.done) await this.repo.updateGrocery({ list: clearDone(this.repo.grocery().list) });
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
    if (form && el.name === "eventKind") {
      // Une fête ou un anniversaire revient chaque année ; un événement, non.
      form.elements.yearly.checked = el.value !== "event";
      syncRepeatFields(form);
    }
    if (form && el.name === "yearly") syncRepeatFields(form);
    if (form && (el.name === "module" || el.name === "repeat")) {
      // Choisir « Habitude » pour un nouvel élément propose « Tous les jours ».
      if (el.name === "module" && el.value === "habitude" && !form.dataset.id && form.elements.repeat.value === "none") {
        form.querySelector(`[name=repeat][value=${FREQ.DAILY}]`).checked = true;
      }
      syncRepeatFields(form);
    }
    if (el.dataset.action === "ts-logo" && el.files?.[0]) {
      await this.#setLogo(el.files[0]);
      el.value = "";
      return;
    }
    // Sur un écran tactile, chaque mouvement de la roulette déclenche « change » : on attend
    // qu'elle soit refermée (focusout), sinon la page se redessine et la referme trop tôt.
    if (savesOnClose(el)) return;
    if (el.dataset.action?.startsWith("ts-")) return this.#onTimesheetChange(el);
    if (el.form?.dataset.role === "ts-expense") return this.#syncExpenseForm(el.form, el.name === "currency");
    // Choisir un projet propose sa dernière tâche ; choisir une tâche montre sa portée.
    if (el.name === "projectId" && el.form?.dataset.role === "ts-add") {
      const code = el.dataset.taskCode ?? "";
      const f = el.form.elements;
      const known = code && getTask(this.repo.timesheet(), code);
      f.taskCode.value = !code ? "" : known ? known.code : CUSTOM_TASK;
      f.customCode.value = code && !known ? code : "";
      f.customTask.value = code && !known ? el.dataset.task ?? "" : "";
      return this.#syncTaskForm(el.form);
    }
    if (el.dataset.role === "task-select") return this.#syncTaskForm(el.form);
    if (el.dataset.action === "grocery-toggle") {
      return this.#updateGrocery({ list: toggleListEntry(this.repo.grocery().list, el.dataset.entry) });
    }
    if (el.dataset.action === "catalog-toggle") {
      return this.#updateGrocery({ list: toggleListed(this.repo.grocery().list, el.dataset.name) });
    }
    if (el.dataset.action === "grocery-store") {
      const chosen = [...document.querySelectorAll("[data-action=grocery-store]:checked")].map((c) => c.value);
      return this.#updateGrocery({ stores: chosen });
    }
    if (el.dataset.action === "grocery-deal") {
      el.form.querySelector("[data-role=until]").hidden = !el.checked;
      return;
    }
    if (el.dataset.action === "packing-toggle") {
      // Coché : ajouté à « À emporter » ; décoché : retiré de la liste.
      const key = productKey(el.dataset.name);
      return this.#updateChecklist(el.dataset.id, (list) => (list.some((e) => productKey(e.text) === key)
        ? list.filter((e) => productKey(e.text) !== key)
        : addEntry(list, el.dataset.name)));
    }
    if (el.dataset.action === "hotel-chain") {
      const chosen = [...document.querySelectorAll("[data-action=hotel-chain]:checked")].map((c) => c.value);
      if (chosen.length > MAX_CHAINS) {
        el.checked = false;
        return toast(t("trip.hotelsMax", { max: MAX_CHAINS }));
      }
      return this.#updateData(el.dataset.id, { hotelChains: chosen });
    }
    if (el.dataset.action === "place-toggle") {
      const trip = this.repo.get(el.dataset.id);
      await this.#updateData(trip.id, { places: toggleVisited(getPlaces(trip), el.dataset.entry) });
      return;
    }
    if (el.dataset.action === "check-toggle") {
      await this.#updateChecklist(el.dataset.id, (list) => toggleEntry(list, el.dataset.entry), null, el.dataset.field);
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
    if (e.target.dataset.role === "grocery-add") return this.#addGrocery(e);
    if (e.target.dataset.role?.startsWith("ts-")) return this.#onTimesheetSubmit(e);
    if (e.target.dataset.role === "price-add") return this.#addPrice(e);
    if (e.target.dataset.role === "catalog-add") {
      e.preventDefault();
      const { category } = e.target.dataset;
      const name = String(new FormData(e.target).get("name") ?? "").trim();
      if (!name) return;
      // Ajouté au catalogue et coché d'emblée (on l'ajoute parce qu'on en a besoin).
      const g = this.repo.grocery();
      return this.#updateGrocery(
        { custom: addCustomItem(g.custom, name, category), list: addToList(g.list, name) },
        `[data-role=catalog-add][data-category="${category}"] [name=name]`,
      );
    }
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
      const { id, field } = e.target.dataset;
      const target = `.check-add[data-id="${CSS.escape(id)}"][data-field="${field}"] [data-role=checklist-input]`;
      return this.#updateChecklist(id, (list) => addEntry(list, text), target, field);
    }
    if (e.target.id !== "item-form") return;
    e.preventDefault();
    const form = e.target;
    const existing = form.dataset.id ? this.repo.get(form.dataset.id) : null;
    const { checklistText, endDate, event, ...data } = readItemForm(form, existing);
    if (checklistText !== null) {
      data.data = { ...(existing?.data ?? {}), checklist: fromLines(checklistText, getChecklist(existing)) };
    }
    if (event) {
      // Fête ou anniversaire : le jour et le mois viennent de « Date de la fête »,
      // l'année d'origine (pour l'âge) de son propre champ ; vide = année inconnue.
      const yearlyKind = data.recurrence?.freq === FREQ.YEARLY && event.kind !== "event";
      let yearUnknown = false;
      if (yearlyKind && event.birthYear) {
        const y = Number(event.birthYear);
        if (!/^\d{4}$/.test(event.birthYear) || y < 1900 || y > Number(todayISO().slice(0, 4))) {
          $("[data-role=errors]", form).textContent = t("errors.birthYear");
          return;
        }
        if (isISODate(data.date)) data.date = yearlyDate(data.date, y);
      } else if (yearlyKind) yearUnknown = true;
      data.data = { ...(data.data ?? existing?.data ?? {}), kind: event.kind, yearUnknown, budget: parseAmount(event.budget) };
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
      if (existing?.data?.grocery && data.data?.checklist) {
        await this.repo.updateGrocery({ list: fromChecklist(this.repo.grocery().list, data.data.checklist) });
      }
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

  // ---- Mes heures --------------------------------------------------------

  async #updateTimesheet(ts, focusSelector) {
    const top = window.scrollY;
    await this.repo.updateTimesheet(ts);
    window.scrollTo(0, top);
    if (focusSelector) $(focusSelector)?.focus();
  }

  // Dépenses mensuelles arrivées à échéance (ex. le cellulaire du 1er) : ajoutées en ouvrant « Mes heures ».
  #syncMonthly() {
    const ts = this.repo.timesheet();
    // Une fois par lancement : effacer les justificatifs qui ne servent plus (dépense supprimée…)
    if (!this.#pruned) {
      this.#pruned = true;
      pruneFiles(attachmentIds(ts)).catch(() => {});
    }
    const next = syncRecurring(ts, todayISO());
    if (next !== ts) this.repo.updateTimesheet(next).catch((err) => console.error(err));
  }

  // Aller à une journée (flèches, semaine, calendrier), en gardant la position dans la page.
  #showTimesheetDay(date) {
    if (!isISODate(date)) return;
    this.timesheetDate = date === todayISO() ? null : date;
    this.editingExpense = null;
    this.#renderKeepingScroll();
  }

  #renderKeepingScroll() {
    const top = window.scrollY;
    this.render();
    window.scrollTo(0, top);
  }

  async #onTimesheetChange(el) {
    const ts = this.repo.timesheet();
    const { id } = el.dataset;
    switch (el.dataset.action) {
      case "ts-hours": {
        const hours = parseHours(el.value);
        if (hours === null || hours <= 0) {
          toast(t("ts.errors.hours"));
          el.value = fmt.hours(ts.entries.find((e) => e.id === id)?.hours ?? 0);
          return;
        }
        return this.#updateTimesheet(updateTsEntry(ts, id, { hours }));
      }
      case "ts-entry-task": {
        const task = getTask(ts, el.value);
        return this.#updateTimesheet(updateTsEntry(ts, id, { taskCode: task?.code ?? "", task: task?.description ?? "" }));
      }
      case "ts-task-field": {
        if (el.dataset.field === "description" && !el.value.trim()) {
          el.value = getTask(ts, el.dataset.code)?.description ?? "";
          return toast(t("ts.errors.task"));
        }
        return this.#updateTimesheet(updateTask(ts, el.dataset.code, { [el.dataset.field]: el.value.trim() }));
      }
      case "ts-entry-field":
        return this.#updateTimesheet(updateTsEntry(ts, id, { [el.dataset.field]: el.value.trim() }));
      case "ts-rate": {
        const rate = readNumber(el.value);
        if (rate === null) return toast(t("ts.errors.expenseRate"));
        return this.#updateTimesheet(setRate(ts, el.dataset.currency, rate));
      }
      case "ts-business-field": {
        const { field } = el.dataset;
        if (field === "mileageRate") {
          const rate = readNumber(el.value);
          if (rate === null) return toast(t("ts.errors.rate"));
          return this.#updateTimesheet(updateBusiness(ts, { mileageRate: rate }));
        }
        if (field === "terms") {
          const days = Number(el.value.trim());
          if (!Number.isInteger(days) || days < 0) {
            el.value = ts.business.terms;
            return toast(t("ts.errors.terms"));
          }
          return this.#updateTimesheet(updateBusiness(ts, { terms: days }));
        }
        return this.#updateTimesheet(updateBusiness(ts, { [field]: el.value.trim() }));
      }
      case "ts-presence": {
        const { field, date } = el.dataset;
        if (field === "pause") {
          // Champ vidé : la pause redevient « proposée » ; sinon un nombre (0 compris)
          const pause = el.value.trim() === "" ? null : parsePause(el.value);
          if (pause === null && el.value.trim() !== "") return toast(t("ts.errors.pause"));
          return this.#updateTimesheet(setPresence(ts, date, { pause }));
        }
        return this.#updateTimesheet(setPresence(ts, date, { [field]: normalizeTime(el.value) }));
      }
      case "ts-attach-kind":
        return this.#updateTimesheet(updateAttachment(ts, el.dataset.expense, el.dataset.id, { kind: el.value }));
      case "ts-attach-move":
        if (!el.value) return undefined;
        await this.#updateTimesheet(moveAttachment(ts, el.dataset.expense, el.value, el.dataset.id));
        toast(t("attach.moved"));
        return this.#openAttachments(el.dataset.expense);
      case "ts-receipt-file": {
        const file = el.files?.[0];
        el.value = "";
        if (file) await this.#addReceiptFile(el.dataset.kind, file);
        return undefined;
      }
      case "ts-attach-file": {
        const file = el.files?.[0];
        el.value = "";
        if (file) await this.#addAttachmentFile(el.dataset.expense, file);
        return undefined;
      }
      case "ts-project-pin":
        return this.#updateTimesheet(updateProject(ts, id, { pinned: el.checked }));
      case "ts-recurring-amount": {
        const amount = readNumber(el.value);
        if (amount === null) return toast(t("ts.errors.expenseAmount"));
        return this.#updateTimesheet(updateRecurring(ts, id, { amount }));
      }
      case "ts-goto":
        return this.#showTimesheetDay(el.value);
      case "ts-business-toggle":
        return this.#updateTimesheet(updateBusiness(ts, { [el.dataset.field]: el.checked }));
      case "ts-entry-ot":
        return this.#updateTimesheet(updateTsEntry(ts, id, { overtime: el.checked }));
      case "ts-client-field": {
        const value = el.dataset.field === "address" ? el.value.trim() : el.value.trim().replace(/\s+/g, " ");
        if (el.dataset.field === "name" && !value) {
          el.value = getClient(ts, id)?.name ?? "";
          return toast(t("ts.errors.client"));
        }
        return this.#updateTimesheet(updateClient(ts, id, { [el.dataset.field]: value }));
      }
      case "ts-project-field": {
        const { field } = el.dataset;
        let value = field === "clientId" ? el.value || null : el.value.trim();
        if ((field === "number" || field === "name") && !value && !getProject(ts, id)?.[field === "number" ? "name" : "number"]) {
          el.value = getProject(ts, id)?.[field] ?? "";
          return toast(t("ts.errors.project"));
        }
        if (field === "rate" || field === "overtimeRate") {
          const raw = value.replace(/[$\s]/g, "");
          value = raw ? parseAmount(raw) : null;
          if (raw && value === null) return toast(t("ts.errors.rate"));
        }
        return this.#updateTimesheet(updateProject(ts, id, { [field]: value }));
      }
      case "ts-client-tax":
        return this.#updateTimesheet(updateClient(ts, id, { [el.dataset.tax]: el.checked }));
      case "ts-export-date":
        this.timesheetExport = { ...this.timesheetExport, [el.dataset.field]: el.value, invoiceNumber: "" };
        return this.#renderKeepingScroll();
      case "ts-export-client":
        this.timesheetExport = { ...this.timesheetExport, clientId: el.value, invoiceNumber: "" };
        return this.#renderKeepingScroll();
      default:
    }
  }

  async #onTimesheetSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const f = new FormData(form);
    const errors = $("[data-role=errors]", form);
    const text = (name) => String(f.get(name) ?? "").trim();
    const ts = this.repo.timesheet();
    // Garder ouverte la section où l'on vient d'ajouter un projet ou un client.
    const fold = form.closest("[data-fold-id]")?.dataset.foldId;
    if (fold) setFoldOpen(fold, true);
    if (form.dataset.role === "ts-expense") return this.#addExpense(form, f, errors);
    if (form.dataset.role === "ts-new-task") {
      if (!text("code") || !text("description")) return (errors.textContent = t("ts.errors.task"));
      const { ts: next, task } = addTask(ts, { code: text("code"), description: text("description"), scope: text("scope"), quick: f.get("quick") === "on" });
      if (!task) return (errors.textContent = t("ts.errors.taskExists", { code: text("code").toUpperCase() }));
      await this.#updateTimesheet(next);
      return toast(t("ts.taskAdded", { code: task.code }));
    }
    if (form.dataset.role === "ts-add") {
      const hours = parseHours(text("hours"));
      if (hours === null || hours <= 0) return (errors.textContent = t("ts.errors.hours"));
      const projectId = text("projectId");
      if (!projectId) return (errors.textContent = t("ts.pickProject"));
      this.timesheetProject = projectId;
      const overtime = text("overtime") === "1";
      // Tâche : du catalogue (description standard), ou écrite à la main
      const chosen = text("taskCode");
      const known = chosen !== CUSTOM_TASK && getTask(ts, chosen);
      const taskCode = chosen === CUSTOM_TASK ? text("customCode").toUpperCase() : known ? known.code : chosen;
      const task = chosen === CUSTOM_TASK ? text("customTask") : known ? known.description : "";
      const entry = { date: form.dataset.date, projectId, hours, overtime, taskCode, task, work: text("work"), note: text("note") };
      return this.#updateTimesheet(addTsEntry(ts, entry), "[data-role=ts-add] [name=hours]");
    }
    if (form.dataset.role === "ts-new-project") {
      if (!text("number") && !text("name")) return (errors.textContent = t("ts.errors.project"));
      // « 68 », « 68,00 $ », « 68 $/h » : le taux horaire
      const readRate = (name) => {
        const raw = text(name).replace(/[$\s\u00a0]/g, "").replace(/\/h(r|eure)?$/i, "");
        return raw ? parseAmount(raw) ?? NaN : null;
      };
      const rate = readRate("rate");
      const overtimeRate = readRate("overtimeRate");
      if (Number.isNaN(rate) || Number.isNaN(overtimeRate)) return (errors.textContent = t("ts.errors.rate"));
      const { ts: next, project } = addProject(ts, { number: text("number"), name: text("name"), clientId: text("clientId") || null, rate, overtimeRate });
      this.timesheetProject = project.id;
      await this.#updateTimesheet(next);
      // Montrer la fiche du nouveau projet (avec son taux) pour confirmer
      const card = $(`[data-project-card="${project.id}"]`);
      card?.scrollIntoView({ block: "center" });
      card?.classList.add("is-new");
      const name = [project.number, project.name].filter(Boolean).join(" ");
      return toast(project.rate != null ? t("ts.projectAddedRate", { name, rate: fmt.money(project.rate) }) : t("ts.projectAdded", { name }));
    }
    if (form.dataset.role === "ts-new-client") {
      if (!text("name")) return (errors.textContent = t("ts.errors.client"));
      const { ts: next, client } = addClient(ts, {
        name: text("name"), contact: text("contact"), email: text("email"), address: String(f.get("address") ?? "").trim(),
        tps: f.get("tps") === "on", tvq: f.get("tvq") === "on",
      });
      await this.#updateTimesheet(next);
      return toast(t("ts.clientAdded", { name: client.name }));
    }
  }

  #timesheetLabels() {
    const columns = Object.fromEntries(["date", "day", "number", "project", "type", "taskCode", "task", "work", "client", "hours", "note", "rate", "amount"]
      .map((k) => [k, t(`ts.col.${k}`)]));
    return {
      title: t("ts.sheetTitle"), period: t("ts.period"), regular: t("ts.regular"), overtime: t("ts.overtime"), dayTotal: t("ts.dayTotal"),
      total: t("ts.total"), sheetHours: t("ts.sheetHours"), sheetProjects: t("ts.sheetProjects"), columns,
      presence: Object.fromEntries(["sheet", "date", "day", "start", "end", "pause", "worked", "logged", "gap"].map((k) => [k, t(`ts.presenceCol.${k}`)])),
    };
  }

  // Classeur Excel de la période : partagé (iPhone, iPad) ou téléchargé.
  async #exportTimesheet(from, to, clientId) {
    const sheets = timesheetSheets(this.repo.timesheet(), {
      from, to, clientId: clientId || null, weekday: (iso) => fmt.weekdayShort(parseISODate(iso)), labels: this.#timesheetLabels(),
    });
    await this.#shareFile(new File([buildXlsx({ sheets })], `${t("ts.fileName")}-${from}_${to}.xlsx`, { type: XLSX_TYPE }));
  }

  // Saisie des heures : portée de la tâche choisie ; « autre tâche » : code et description à écrire.
  #syncTaskForm(form) {
    const select = form.elements.taskCode;
    const option = select.selectedOptions[0];
    $("[data-role=task-scope]", form).textContent = option?.dataset.scope ?? "";
    $("[data-role=custom-task]", form).hidden = select.value !== CUSTOM_TASK;
    if (select.value === CUSTOM_TASK) form.elements.customCode.focus();
  }

  // Formulaire de dépense : kilomètres ou montant, taux de la devise, montant en $ CA.
  #syncExpenseForm(form, currencyChanged = false) {
    const f = form.elements;
    const mileage = form.querySelector("[name=type]:checked")?.value === "mileage";
    const currency = f.currency.value;
    $("[data-role=money-row]", form).hidden = mileage;
    $("[data-role=meal-row]", form).hidden = form.querySelector("[name=type]:checked")?.value !== "food";
    $("[data-role=km-row]", form).hidden = !mileage;
    const monthlyRow = $("[data-role=monthly-row]", form);
    if (monthlyRow) monthlyRow.hidden = mileage;
    $("[data-role=rate-row]", form).hidden = mileage || currency === "CAD";
    if (currencyChanged) {
      const rates = JSON.parse(form.dataset.rates || "{}");
      f.rate.value = rates[currency] ? String(rates[currency]).replace(".", fmt.hours(1.5).replace(/\d/g, "")) : "";
      $("[data-role=rate-label]", form).textContent = t("ts.rateFor", { currency });
    }
    const cad = mileage
      ? (readNumber(f.km.value) ?? 0) * Number(form.dataset.mileage)
      : (readNumber(f.amount.value) ?? 0) * (currency === "CAD" ? 1 : readNumber(f.rate.value) ?? 0);
    $("[data-role=expense-preview]", form).textContent = cad ? `= ${fmt.money(Math.round(cad * 100) / 100)}` : "";
  }

  async #addExpense(form, f, errors) {
    const text = (name) => String(f.get(name) ?? "").trim();
    const type = text("type");
    const [kind, id] = text("target").split(":");
    const fields = { date: form.dataset.date, type, meal: text("meal") || null, description: text("description"), projectId: kind === "p" ? id : null, clientId: kind === "c" ? id : null };
    if (!id) return (errors.textContent = t("ts.errors.expenseTarget"));
    const ts = this.repo.timesheet();
    if (type === "mileage") {
      fields.qty = readNumber(text("km"));
      fields.unitPrice = Number(form.dataset.mileage) || ts.business.mileageRate; // une dépense modifiée garde son taux
      if (fields.qty === null) return (errors.textContent = t("ts.errors.expenseKm"));
    } else {
      fields.amount = readNumber(text("amount"));
      fields.currency = text("currency") || "CAD";
      fields.rate = fields.currency === "CAD" ? 1 : readNumber(text("rate"));
      if (fields.amount === null) return (errors.textContent = t("ts.errors.expenseAmount"));
      if (fields.rate === null) return (errors.textContent = t("ts.errors.expenseRate"));
    }
    if (form.hasAttribute("data-receipt")) return this.#saveReceipt(fields, text("date"), errors);
    if (form.dataset.edit) {
      // Modification : la dépense garde son identité ; la date peut changer.
      if (isISODate(text("date"))) fields.date = text("date");
      let next = updateExpense(ts, form.dataset.edit, fields);
      if (fields.currency && fields.currency !== "CAD") next = setRate(next, fields.currency, fields.rate);
      this.editingExpense = null;
      await this.#updateTimesheet(next);
      const saved = next.expenses.find((e) => e.id === form.dataset.edit);
      return toast(t("ts.expenseSaved", { amount: fmt.money(expenseTotalOf(saved)) }));
    }
    // Chaque mois : la dépense porte le mois dans sa description (« Cell Phone fees October 2026 »)
    const monthly = f.get("monthly") === "on" && type !== "mileage";
    const typed = fields.description;
    if (monthly) fields.description = [typed, monthLabel(fields.date.slice(0, 7))].filter(Boolean).join(" ");
    const { ts: added, expense } = addExpense(ts, fields);
    if (!expense) return (errors.textContent = t("ts.errors.expenseAmount"));
    const next = monthly ? syncRecurring(addRecurring(added, { ...expense, description: typed }), todayISO()) : added;
    await this.#updateTimesheet(next);
    if (monthly) toast(t("ts.monthlyAdded", { day: dayOfMonth(expense.date.slice(8)) }));
    // Le formulaire reste ouvert : on note souvent plusieurs dépenses d'affilée.
    const wrap = $("[data-role=expense-wrap]");
    if (wrap) wrap.open = true;
    $("[data-role=ts-expense] [name=description]")?.focus({ preventScroll: true });
    toast(t("ts.expenseAdded", { amount: fmt.money(expenseTotalOf(expense)) }));
  }

  // Logo de l'entreprise : réduit (au plus 600 × 300 px) et gardé en PNG dans les données.
  async #setLogo(file) {
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 600 / img.naturalWidth, 300 / img.naturalHeight);
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; // fond blanc, comme la facture
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      let logo = canvas.toDataURL("image/png");
      if (logo.length > LOGO_MAX_LENGTH) logo = canvas.toDataURL("image/jpeg", 0.85);
      if (logo.length > LOGO_MAX_LENGTH) return toast(t("ts.errors.logo"));
      await this.#updateTimesheet(updateBusiness(this.repo.timesheet(), { logo, logoSize: { width, height } }));
      toast(t("ts.logoSaved"));
    } catch {
      toast(t("ts.errors.logo"));
    }
  }

  // Numéro, date, PO, client et période de la facture, lus dans le bloc « Facture ».
  #invoiceOptions(box) {
    const read = (name) => $(`[name=${name}]`, box).value.trim();
    const { client: clientId, from, to } = box.dataset;
    const number = read("number");
    if (!number) {
      $("[name=number]", box).focus();
      toast(t("ts.errors.invoiceNumber"));
      return null;
    }
    return { clientId, from, to, number, date: read("date") || todayISO(), po: read("po") };
  }

  // Facture Excel (modèle de Max) + le détail des heures du client.
  async #createInvoice(options) {
    if (!options) return;
    const { clientId, from, to, number, date, po } = options;
    let ts = this.repo.timesheet();
    const { sheets, styles, totals } = invoiceSheets(ts, { from, to, clientId, number, date, po });
    await this.#rememberInvoice(options);
    const name = `${t("ts.invoiceFile")}-${number.replace(/[^\w.-]+/g, "_")}.xlsx`;
    await this.#shareFile(new File([buildXlsx({ sheets, styles })], name, { type: XLSX_TYPE }));
    toast(t("ts.invoiceReady", { total: fmt.money(totals.total) }));
  }

  // Retenir le PO du client et proposer le numéro suivant la prochaine fois ; le numéro
  // de cette facture reste affiché (Excel, PDF et courriel portent le même numéro).
  async #rememberInvoice({ clientId, number, po }) {
    let ts = this.repo.timesheet();
    ts = updateClient(ts, clientId, { po });
    ts = updateBusiness(ts, { nextInvoice: nextInvoiceNumber(number) });
    this.timesheetExport = { ...this.timesheetExport, invoiceNumber: number };
    await this.#updateTimesheet(ts);
  }

  // ---- Justificatifs (photos scannées, PDF) ----

  #openAttachments(expenseId) {
    const ts = this.repo.timesheet();
    const expense = ts.expenses.find((e) => e.id === expenseId);
    if (!expense) return;
    const p = expense.projectId ? getProject(ts, expense.projectId) : null;
    const target = p ? p.number || p.name : t("ts.generalShort", { client: getClient(ts, expense.clientId)?.name ?? "" });
    // Les autres dépenses de la même semaine (ou presque), pour y déplacer un justificatif
    const days = (d) => parseISODate(d).getTime() / 86400000;
    const others = ts.expenses
      .filter((e) => e.id !== expense.id && Math.abs(days(e.date) - days(expense.date)) <= 7)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({ id: e.id, label: `${e.date} · ${EXPENSE_ICONS[e.type]} ${e.description || t(`ts.expenseType.${e.type}`)} · ${fmt.money(expenseTotalOf(e))}` }));
    openModal(attachmentsView(expense, target, others), { labelledBy: "attach-title" });
    // Les images et les PDF sont dans IndexedDB : on les montre une fois chargés
    for (const el of document.querySelectorAll("#modal [data-file], #modal [data-file-link]")) {
      getFile(el.dataset.file ?? el.dataset.fileLink).then((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        if (el.dataset.file) el.src = url;
        else el.href = url;
      }).catch(() => {});
    }
  }

  // Une photo passe par le scanner (recadrée, redressée) ; un PDF est gardé tel quel.
  async #addAttachmentFile(expenseId, file) {
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const blob = pdf ? file : await scanImage(file);
    if (!blob) return this.#openAttachments(expenseId);
    const ts = this.repo.timesheet();
    const expense = ts.expenses.find((e) => e.id === expenseId);
    const kinds = new Set(expense?.attachments.map((a) => a.kind));
    const kind = !kinds.has("invoice") ? "invoice" : !kinds.has("proof") ? "proof" : "other";
    const id = newId();
    try {
      await putFile(id, blob);
    } catch {
      toast(t("attach.storageError"));
      return this.#openAttachments(expenseId);
    }
    await this.#updateTimesheet(addAttachment(ts, expenseId, { id, kind, type: pdf ? "application/pdf" : "image/jpeg", name: pdf ? file.name : "" }));
    toast(t("attach.added", { kind: t(`attach.kind.${kind}`) }));
    this.#openAttachments(expenseId);
  }

  // ---- Scanner un reçu : la facture et la preuve de transaction créent la dépense ----

  #openReceipt(date, values = {}) {
    this.#discardReceipt();
    const projects = activeProjects(this.repo.timesheet());
    const chosen = projects.some((p) => p.id === this.timesheetProject) ? this.timesheetProject : projects[0]?.id;
    this.receipt = {
      date,
      slots: { invoice: null, proof: null },
      values: { type: "food", meal: null, date, target: chosen ? `p:${chosen}` : undefined, description: "", amount: null, currency: null, ...values },
      auto: { date, meal: null, amount: null },
    };
    this.#showReceipt();
  }

  #showReceipt() {
    const r = this.receipt;
    if (!r) return;
    const ts = this.repo.timesheet();
    const projects = activeProjects(ts);
    const chosen = projects.some((p) => p.id === this.timesheetProject) ? this.timesheetProject : projects[0]?.id;
    openModal(receiptView(r, ts, r.date, projects, chosen), { labelledBy: "receipt-title" });
    const form = $("#modal form[data-receipt]");
    if (form) {
      r.auto.currency ??= form.elements.currency.value;
      this.#syncExpenseForm(form);
    }
  }

  // Garder ce qui est écrit dans le formulaire (la fenêtre du scanner va le remplacer)
  #captureReceiptForm() {
    const form = $("#modal form[data-receipt]");
    if (!this.receipt || !form) return;
    const f = form.elements;
    Object.assign(this.receipt.values, {
      type: form.querySelector("[name=type]:checked")?.value ?? "food",
      meal: form.querySelector("[name=meal]:checked")?.value || null,
      date: f.date.value || this.receipt.date,
      description: f.description.value,
      target: f.target.value,
      amount: readNumber(f.amount.value),
      currency: f.currency.value,
    });
  }

  #clearReceiptSlot(kind) {
    const slot = this.receipt?.slots[kind];
    if (!slot) return;
    if (slot.url) URL.revokeObjectURL(slot.url);
    this.receipt.slots[kind] = null;
  }

  #discardReceipt() {
    if (!this.receipt) return;
    for (const k of RECEIPT_SLOTS) this.#clearReceiptSlot(k);
    this.receipt = null;
  }

  // Une photo passe par le scanner, puis est lue ; un PDF est gardé tel quel (non lu).
  async #addReceiptFile(kind, file) {
    this.#captureReceiptForm();
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const blob = pdf ? file : await scanImage(file);
    if (!this.receipt) return;
    if (blob) {
      this.#clearReceiptSlot(kind);
      this.#setReceiptSlot(kind, { blob, type: pdf ? "application/pdf" : "image/jpeg", name: pdf ? file.name : "" });
    }
    this.#showReceipt();
  }

  #setReceiptSlot(kind, slot) {
    const r = this.receipt;
    r.slots[kind] = { ...slot, url: URL.createObjectURL(slot.blob), status: slot.type === "application/pdf" ? "pdf" : "reading" };
    if (slot.type !== "application/pdf") this.#readReceipt(kind, r.slots[kind]);
  }

  // Lecture du texte (sur l'appareil), puis la dépense est préremplie.
  async #readReceipt(kind, slot) {
    const r = this.receipt;
    const refresh = () => {
      const status = this.receipt === r && r.slots[kind] === slot && $(`#modal [data-slot=${kind}] [data-role=slot-status]`);
      if (status) status.innerHTML = slotStatus(slot);
    };
    try {
      const text = await readText(slot.blob, (m) => {
        if (m.status === "recognizing text") {
          slot.progress = m.progress;
          refresh();
        }
      });
      slot.parsed = parseReceipt(text);
      slot.total = slot.parsed.total;
      slot.status = "done";
    } catch (err) {
      console.error(err);
      slot.status = "failed";
    }
    refresh();
    if (this.receipt === r && r.slots[kind] === slot) this.#applyReceipt();
  }

  // Remplir la dépense avec ce que les reçus disent, sans écraser ce que la personne a changé.
  #applyReceipt() {
    const r = this.receipt;
    const found = receiptExpense({ invoice: r.slots.invoice?.parsed, proof: r.slots.proof?.parsed });
    const form = $("#modal form[data-receipt]");
    if (form) this.#captureReceiptForm();
    const v = r.values;
    const free = (field) => !v[field] || v[field] === r.auto[field];
    for (const field of ["meal", "date", "amount", "currency"]) {
      if (found[field] && free(field)) {
        v[field] = found[field];
        r.auto[field] = found[field];
      }
    }
    if (!form) return;
    const f = form.elements;
    const meal = form.querySelector(`[name=meal][value="${v.meal ?? ""}"]`);
    if (meal) meal.checked = true;
    f.date.value = v.date ?? r.date;
    f.amount.value = v.amount ? fmt.hours(v.amount) : "";
    const currencyChanged = v.currency && f.currency.value !== v.currency && [...f.currency.options].some((o) => o.value === v.currency);
    if (currencyChanged) f.currency.value = v.currency;
    this.#syncExpenseForm(form, currencyChanged);
  }

  async #saveReceipt(fields, date, errors) {
    const r = this.receipt;
    if (!r) return undefined;
    if (isISODate(date)) fields.date = date;
    let { ts, expense } = addExpense(this.repo.timesheet(), fields);
    if (!expense) return (errors.textContent = t("ts.errors.expenseAmount"));
    for (const kind of RECEIPT_SLOTS) {
      const slot = r.slots[kind];
      if (!slot) continue;
      let id = slot.fileId;
      if (id) {
        ts = removeAttachment(ts, slot.from, id); // déplacé depuis une autre dépense
      } else {
        id = newId();
        try {
          await putFile(id, slot.blob);
        } catch {
          toast(t("attach.storageError"));
          continue;
        }
      }
      ts = addAttachment(ts, expense.id, { id, kind, type: slot.type, name: slot.name });
    }
    this.#discardReceipt();
    closeModal();
    this.timesheetDate = fields.date === todayISO() ? null : fields.date; // montrer la journée de la dépense
    await this.#updateTimesheet(ts);
    toast(t("ts.expenseAdded", { amount: fmt.money(expenseTotalOf(expense)) }));
    return undefined;
  }

  // Les justificatifs d'une dépense (ex. scannés sur le kilométrage) deviennent une nouvelle dépense.
  async #receiptFromExpense(expenseId) {
    const expense = this.repo.timesheet().expenses.find((e) => e.id === expenseId);
    if (!expense) return;
    const target = expense.projectId ? `p:${expense.projectId}` : `c:${expense.clientId}`;
    this.#openReceipt(expense.date, { target });
    const r = this.receipt;
    const order = [...expense.attachments].sort((a, b) => (a.kind === "proof") - (b.kind === "proof"));
    for (const a of order) {
      const kind = a.kind !== "other" && !r.slots[a.kind] ? a.kind : RECEIPT_SLOTS.find((k) => !r.slots[k]);
      if (!kind) break;
      const blob = await getFile(a.id).catch(() => null);
      if (!blob || this.receipt !== r) continue;
      this.#setReceiptSlot(kind, { blob, type: a.type, name: a.name, fileId: a.id, from: expense.id });
    }
    this.#showReceipt();
  }

  // ---- Facture PDF, justificatifs PDF, courriel au client ----

  // Largeur du texte dans le PDF (Helvetica ≈ Arial), mesurée avec le canvas
  #measure() {
    const ctx = document.createElement("canvas").getContext("2d");
    return (text, size, bold, italic) => {
      ctx.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px Helvetica, Arial, sans-serif`;
      return ctx.measureText(text).width;
    };
  }

  // Image (Blob) -> JPEG prêt pour le PDF { bytes, width, height } (fond blanc pour un PNG)
  async #jpegForPdf(blob) {
    if (blob.type !== "image/jpeg") {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, ...jpegInfo(bytes) };
  }

  async #sendInvoice(options, { invoice = false, receipts = false, email = false }) {
    if (!options) return;
    const ts = this.repo.timesheet();
    const d = invoiceData(ts, options);
    const safe = options.number.replace(/[^\w.-]+/g, "_");
    const measure = this.#measure();
    const files = [];
    toast(t("ts.pdfWorking"));
    if (invoice) {
      const logo = ts.business.logo ? await this.#jpegForPdf(await (await fetch(ts.business.logo)).blob()).catch(() => null) : null;
      files.push(new File([invoicePdf(d, { logo, measure })], `${t("ts.invoiceFile")}-${safe}.pdf`, { type: PDF_TYPE }));
    }
    if (receipts) {
      if (!d.expenseLines.length && !invoice) return toast(t("ts.noReceipts"));
      if (d.expenseLines.length) {
        const images = {};
        const extra = [];
        for (const l of d.expenseLines) {
          for (const a of l.attachments) {
            const blob = await getFile(a.id).catch(() => null);
            if (!blob) continue;
            if (a.type === "application/pdf") extra.push(new File([blob], a.name || `${a.id}.pdf`, { type: PDF_TYPE }));
            else images[a.id] = await this.#jpegForPdf(blob);
          }
        }
        files.push(new File([receiptsPdf(d, images, { measure })], `${t("ts.receiptsFile")}-${safe}.pdf`, { type: PDF_TYPE }), ...extra);
        const missing = d.expenseLines.filter((l) => !l.attachments.length).length;
        if (missing) toast(t("ts.receiptsMissing", { count: missing }));
      }
    }
    await this.#rememberInvoice(options);
    await this.#shareFiles(files, email ? {
      title: t("ts.emailSubject", { number: options.number }),
      text: t("ts.emailBody", { number: options.number, total: fmt.money(d.totals.total), due: d.totals.dueDate, name: ts.business.contact || ts.business.name }),
    } : {});
  }

  // Partager plusieurs fichiers (Mail, Fichiers…) ; sinon les télécharger un à un
  async #shareFiles(files, { title, text } = {}) {
    if (!files.length) return;
    if (navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files, ...(title ? { title } : {}), ...(text ? { text } : {}) });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    for (const file of files) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    toast(t("ts.exported"));
  }

  async #shareFile(file) {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(t("ts.exported"));
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
