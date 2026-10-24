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
import { isCancelled } from "../data/item.js";
import { addEntry, fromLines, getChecklist, progress, removeEntry, toggleEntry } from "../data/checklist.js";
import { getCurrentPosition, watchPosition } from "../geo/geo.js";
import { fmt, getLanguage, setLanguage, t, tList } from "../i18n/index.js";
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
import { eventsPage } from "./pages/events.js";
import { SHOPPING_TABS, perText, shoppingPage } from "./pages/shopping.js";
import { parseAmount, addCustomItem, fromChecklist, looksLikeGroceryList, removeCustomItem, toChecklist, toggleListed, addToList, clearDone, createPrice, planList, productKey, removeListEntry, toggleListEntry } from "../grocery/grocery.js";
import { getStore } from "../grocery/stores.js";
import { mountMap } from "../travel/map.js";
import { MAX_CHAINS, fetchHotels, fetchSuggestions, getChain } from "../travel/discover.js";
import { geocode } from "../travel/geocode.js";
import { addPlace, getPlaces, located, removePlace, setPlaceCoords, toggleVisited, cachedHotels, cachedSuggestions, destQuery, getDest, hotelsKey, suggestionsKey } from "../travel/trip.js";
import { settingsPage } from "./pages/settings.js";
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
    document.addEventListener("submit", (e) => this.#onSubmit(e));
    document.addEventListener("input", (e) => {
      if (e.target.dataset.journal) this.#scheduleJournalSave();
      if (e.target.dataset.role === "grocery-search") this.#filterPrices(e.target.value);
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
    $("#fab").hidden = ["settings", "meditation", "medstats", "journal", "trip"].includes(this.page)
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
        storageLabel: this.storageLabel,
        count: this.repo.all().length,
      });
      $("#nudges").innerHTML = "";
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
        if (hotelsKey(this.repo.get(id)) === hKey) await this.#updateData(id, { hotels: { key: hKey, items } });
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
      data.data = { ...(data.data ?? existing?.data ?? {}), kind: event.kind, yearUnknown: event.yearUnknown, budget: parseAmount(event.budget) };
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
