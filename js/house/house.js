// Entretien de la maison : tâches à l'intérieur et à l'extérieur, avec leur fréquence,
// la dernière fois qu'elles ont été faites, et des listes à cocher de saison.
//
// Rangé dans le document : house = { tasks: [...], lists: [...], checks: {...} }
//   tâche  : { id, key, zone: "inside"|"outside", title, note, schedule, lastDone, history: [dates], list, active }
//   horaire : { kind: "every", months: 6 }                 aux 6 mois (après la dernière fois)
//             { kind: "dates", dates: ["05-15", "11-05"] } chaque année à ces dates (saisons)
//   liste  : { id, key, zone, title, entries: [{ id, text }] }
//   checks : { [listId]: { year: 2026, done: { [entryId]: true } } } — une nouvelle année repart à zéro
//   fourniture (à racheter) : { id, key, name, description, model, qty, unit, store, url, photos: [fileIds],
//     stock (en réserve, null = pas suivi), tasks: [taskIds], purchases: [{ id, date, qty, price, store, note }] }
//
// Les rappels du calendrier sont calculés (jamais enregistrés), comme les occurrences des habitudes.

import { addDays, addMonths, parseISODate, toISODate } from "../core/dates.js";
import { newId } from "../data/item.js";

export const HOUSE_MODULE = "maison";
export const ZONES = ["inside", "outside"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// Une tâche de saison faite un peu avant ou après sa date compte pour cette date-là.
const SEASON_GRACE_DAYS = 45;
export const SOON_DAYS = 30;

const str = (v) => String(v ?? "").trim();

// ---- Listes de départ (modifiables ensuite dans l'application) ----

const every = (months) => ({ kind: "every", months });
const dates = (...d) => ({ kind: "dates", dates: d });

const DEFAULT_TASKS = [
  // Intérieur
  ["softener-soap", "inside", "Adoucisseur d'eau : ajouter le nettoyant dans la colonne du bac à sel", every(1)],
  ["softener-salt", "inside", "Adoucisseur d'eau : vérifier le niveau de sel et briser la croûte de sel", every(1)],
  ["softener-clean", "inside", "Adoucisseur d'eau : nettoyer le bac à sel et vérifier qu'il ne s'encrasse pas", every(12)],
  ["ro-1", "inside", "Osmose inverse — étape 1 : filtre à sédiments (5 microns)", every(6), "Aux 6 à 12 mois selon l'eau."],
  ["ro-2", "inside", "Osmose inverse — étape 2 : filtre au charbon en granules (GAC)", every(6), "Aux 6 à 12 mois."],
  ["ro-3", "inside", "Osmose inverse — étape 3 : filtre au charbon compressé (CTO)", every(6), "Aux 6 à 12 mois."],
  ["ro-4", "inside", "Osmose inverse — étape 4 : membrane d'osmose", every(24), "Aux 2 à 3 ans."],
  ["ro-5", "inside", "Osmose inverse — étape 5 : post-filtre au charbon (goût)", every(12)],
  ["ro-6", "inside", "Osmose inverse — étape 6 : cartouche de reminéralisation", every(12)],
  ["fridge-water", "inside", "Réfrigérateur : changer le filtre à eau", every(6)],
  ["fridge-air", "inside", "Réfrigérateur : changer le filtre à air", every(6)],
  ["heating-on", "inside", "Chauffage : remettre les disjoncteurs du chauffage et revérifier les thermostats Sinopé", dates("10-01"), "", "heating"],
  ["heating-off", "inside", "Chauffage : couper les disjoncteurs du chauffage", dates("03-25")],
  ["detectors-test", "inside", "Tester les détecteurs de fumée et de monoxyde de carbone", every(1)],
  ["detectors-batteries", "inside", "Changer les piles des détecteurs (au changement d'heure)", dates("11-01")],
  ["detectors-replace", "inside", "Remplacer les détecteurs de fumée et de monoxyde de carbone", every(120), "Aux 10 ans (date sur le détecteur)."],
  ["water-heater", "inside", "Vidanger le chauffe-eau", every(12)],
  ["hood-filter", "inside", "Nettoyer le filtre de la hotte de cuisine", every(3)],
  ["dishwasher-filter", "inside", "Nettoyer le filtre du lave-vaisselle", every(1)],
  ["dryer-vent", "inside", "Nettoyer le conduit de la sécheuse", every(12)],
  ["extinguisher", "inside", "Vérifier l'extincteur (aiguille dans le vert)", every(12)],
  ["silicone", "inside", "Refaire les joints de silicone (salle de bain, cuisine)", every(24)],
  // Extérieur
  ["chimney", "outside", "Faire ramoner la cheminée", every(24)],
  ["gutters", "outside", "Nettoyer les gouttières (feuilles et débris)", dates("05-15", "11-05")],
  ["pool-open", "outside", "Ouverture de la piscine", dates("05-20"), "", "pool-open"],
  ["pool-close", "outside", "Fermeture et vidange de la piscine", dates("09-15"), "", "pool-close"],
  ["stakes-in", "outside", "Installer les piquets de déneigement", dates("10-15")],
  ["stakes-out", "outside", "Enlever les piquets de déneigement", dates("04-20")],
  ["carport-in", "outside", "Installer l'abri d'auto temporaire", dates("10-15"), "Selon les dates permises par ta ville."],
  ["carport-out", "outside", "Désinstaller l'abri d'auto temporaire", dates("04-15"), "Selon les dates permises par ta ville."],
  ["leaves", "outside", "Ramasser les feuilles", dates("10-25")],
  ["flowerbeds", "outside", "Nettoyer les plates-bandes", dates("05-10", "10-20")],
  ["taps-close", "outside", "Fermer et purger les robinets extérieurs, ranger les boyaux", dates("10-15")],
  ["taps-open", "outside", "Rouvrir les robinets extérieurs et réinstaller les boyaux", dates("05-01")],
  ["snowblower", "outside", "Souffleuse à neige : huile, essence, essai", dates("10-20")],
  ["tractor-store", "outside", "Tracteur à pelouse : enlever la batterie, la rentrer au chaud et la mettre sur le chargeur", dates("10-30")],
  ["tractor-ready", "outside", "Tracteur à pelouse : réinstaller la batterie et le préparer", dates("04-25")],
  ["furniture", "outside", "Ranger le mobilier de jardin", dates("10-01")],
  ["inspection", "outside", "Inspecter la toiture, la fondation et le calfeutrage des portes et fenêtres", dates("05-01")],
  ["deck-stain", "outside", "Teindre ou sceller la terrasse", every(36), "Aux 2 ou 3 ans."],
  ["cedar-windows", "outside", "Teindre ou sceller les fenêtres en cèdre", every(36), "Aux 2 ou 3 ans."],
];

const DEFAULT_LISTS = [
  ["heating", "inside", "Début du chauffage (octobre)", [
    "Remettre en marche les disjoncteurs du chauffage au panneau électrique",
    "Vérifier que chaque plinthe ou convecteur chauffe",
    "Revérifier la programmation de chaque thermostat Sinopé (horaires jour et nuit)",
    "Vérifier l'heure des thermostats (changement d'heure en novembre)",
    "Dégager les plinthes (meubles, rideaux)",
  ]],
  ["winter", "outside", "Préparer l'hiver", [
    "Pelles à neige à l'avant de la maison",
    "Pelles à neige au garage",
    "Sel de déglaçage dans un bac ou une chaudière, à l'avant",
    "Sel de déglaçage dans un bac ou une chaudière, au garage",
    "Petite pierre dans un bac ou une chaudière, à l'avant",
    "Petite pierre dans un bac ou une chaudière, au garage",
    "Grattoir et balai à neige dans l'auto",
  ]],
  ["pool-close", "outside", "Piscine : fermeture (procédure générale)", [
    "Quelques jours avant : équilibrer l'eau (pH 7,2 à 7,6 et alcalinité)",
    "Brosser les parois, passer l'aspirateur, vider les paniers de l'écumoire et de la pompe",
    "Faire un traitement choc et ajouter le produit d'hivernage (selon le fabricant)",
    "Baisser le niveau d'eau sous l'écumoire et les retours (selon le type de piscine)",
    "Laver le filtre à contre-courant (sable) ou nettoyer la cartouche",
    "Couper le courant de la pompe, du chauffe-eau et de l'électrolyseur au panneau",
    "Vidanger la pompe, le filtre et le chauffe-eau (bouchons de vidange)",
    "Souffler l'eau des conduites et poser les bouchons d'hivernage",
    "Ranger l'échelle, les accessoires et la cellule de l'électrolyseur au sec",
    "Installer la toile d'hivernage (avec un coussin d'air pour une piscine hors terre)",
  ]],
  ["pool-open", "outside", "Piscine : ouverture (procédure générale)", [
    "Enlever l'eau et les débris sur la toile, puis retirer la toile",
    "Nettoyer et sécher la toile avant de la ranger",
    "Remonter le niveau d'eau jusqu'au milieu de l'écumoire",
    "Retirer les bouchons d'hivernage, réinstaller les raccords, la pompe et le filtre",
    "Remettre le courant, démarrer la pompe et vérifier qu'il n'y a pas de fuite",
    "Brosser les parois et passer l'aspirateur",
    "Analyser l'eau, équilibrer le pH et l'alcalinité, faire un traitement choc",
    "Réinstaller l'échelle et les accessoires",
    "Après quelques jours : faire analyser l'eau en magasin",
  ]],
];

// Fournitures de départ : marques et numéros à compléter (photo du vieux filtre, du sac…)
const DEFAULT_SUPPLIES = [
  ["salt", "Sel pour adoucisseur d'eau", "Pastilles (ou cristaux) de sel haute pureté pour adoucisseur.", 2, "sacs de 20 kg", ["softener-salt"]],
  ["resin-cleaner", "Nettoyant pour résine d'adoucisseur (le « savon »)", "Versé chaque mois dans la colonne du bac à sel.", 1, "dose", ["softener-soap"]],
  ["ro-1", "Osmose 1 — filtre à sédiments 5 microns", "Souvent vendu en ensemble avec les filtres 2 et 3.", 1, "filtre", ["ro-1"]],
  ["ro-2", "Osmose 2 — filtre au charbon en granules (GAC)", "", 1, "filtre", ["ro-2"]],
  ["ro-3", "Osmose 3 — filtre au charbon compressé (CTO)", "", 1, "filtre", ["ro-3"]],
  ["ro-4", "Osmose 4 — membrane d'osmose", "Noter la capacité (ex. 75 GPD).", 1, "membrane", ["ro-4"]],
  ["ro-5", "Osmose 5 — post-filtre au charbon (en ligne)", "", 1, "filtre", ["ro-5"]],
  ["ro-6", "Osmose 6 — cartouche de reminéralisation (en ligne)", "", 1, "cartouche", ["ro-6"]],
  ["fridge-water", "Filtre à eau du réfrigérateur", "Le numéro est sur l'étiquette du filtre en place.", 1, "filtre", ["fridge-water"]],
  ["fridge-air", "Filtre à air du réfrigérateur", "", 1, "filtre", ["fridge-air"]],
  ["batteries", "Piles des détecteurs", "Type à préciser (9 V ou AA). Une par détecteur.", null, "piles", ["detectors-batteries"]],
  ["hood-filter", "Filtre de la hotte de cuisine", "Seulement s'il se remplace (charbon) ; un filtre en métal se lave.", 1, "filtre", ["hood-filter"]],
  ["silicone", "Silicone pour salle de bain et cuisine", "Silicone 100 % avec anti-moisissure, blanc ou transparent.", 1, "tube", ["silicone"]],
  ["pool-close", "Produits de fermeture de la piscine", "Produit d'hivernage, chlore choc, bouchons d'hivernage au besoin.", null, "", ["pool-close"]],
  ["pool-open", "Produits d'ouverture de la piscine", "Chlore choc, ajusteurs de pH et d'alcalinité, bandelettes d'analyse.", null, "", ["pool-open"]],
  ["deicing-salt", "Sel de déglaçage", "Pour les bacs à l'avant et au garage.", null, "sacs", []],
  ["grit", "Petite pierre (abrasif)", "Pour les bacs à l'avant et au garage.", null, "sacs", []],
  ["stakes", "Piquets de déneigement", "Pour remplacer ceux qui sont brisés.", null, "piquets", ["stakes-in"]],
  ["snowblower-oil", "Huile et stabilisateur d'essence pour la souffleuse", "", 1, "de chaque", ["snowblower"]],
  ["stain", "Teinture ou scellant (terrasse, fenêtres en cèdre)", "Noter la couleur et la marque.", null, "gallons", ["deck-stain", "cedar-windows"]],
];

export function emptyHouse() {
  const lists = DEFAULT_LISTS.map(([key, zone, title, entries]) => ({ id: key, key, zone, title, entries: entries.map((text, i) => ({ id: `${key}-${i + 1}`, text })) }));
  const tasks = DEFAULT_TASKS.map(([key, zone, title, schedule, note = "", list = null]) => ({
    id: key, key, zone, title, note, schedule, lastDone: null, history: [], list, active: true, consumedOn: null,
  }));
  const supplies = DEFAULT_SUPPLIES.map(([key, name, description, qty, unit, taskIds]) => ({
    id: `s-${key}`, key, name, description, model: "", qty, unit, store: "", url: "", photos: [], stock: null, tasks: taskIds, purchases: [],
  }));
  return { tasks, lists, checks: {}, supplies };
}

// ---- Validation ----

export function normalizeSchedule(s) {
  if (s?.kind === "every") {
    const months = Math.round(Number(s.months));
    return months >= 1 && months <= 240 ? { kind: "every", months } : null;
  }
  if (s?.kind === "dates") {
    const list = [...new Set((Array.isArray(s.dates) ? s.dates : []).filter((d) => MD.test(d)))].sort();
    return list.length ? { kind: "dates", dates: list } : null;
  }
  return null;
}

function normalizeTask(t, listIds) {
  const schedule = normalizeSchedule(t?.schedule);
  if (!t || !str(t.title) || !schedule) return null;
  const history = [...new Set((Array.isArray(t.history) ? t.history : []).filter((d) => ISO.test(d)))].sort(); // tout l'historique est gardé
  const lastDone = ISO.test(t.lastDone) ? t.lastDone : history.at(-1) ?? null;
  return {
    id: str(t.id) || newId(), key: str(t.key), zone: ZONES.includes(t.zone) ? t.zone : "inside", title: str(t.title), note: str(t.note),
    schedule, lastDone, history, list: listIds.has(t.list) ? t.list : null, active: t.active !== false,
    consumedOn: ISO.test(t.consumedOn) ? t.consumedOn : null, // dernière fois où la réserve a baissé
  };
}

function normalizeList(l) {
  if (!l || !str(l.title)) return null;
  const entries = (Array.isArray(l.entries) ? l.entries : []).filter((e) => e && str(e.text)).map((e) => ({ id: str(e.id) || newId(), text: str(e.text) }));
  return { id: str(l.id) || newId(), key: str(l.key), zone: ZONES.includes(l.zone) ? l.zone : "inside", title: str(l.title), entries };
}

const posNum = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Math.round(Number(v) * 100) / 100);

function normalizePurchase(p) {
  if (!p || !ISO.test(p.date)) return null;
  return { id: str(p.id) || newId(), date: p.date, qty: posNum(p.qty), price: posNum(p.price), store: str(p.store), note: str(p.note) };
}

function normalizeSupply(s, taskIds) {
  if (!s || !str(s.name)) return null;
  return {
    id: str(s.id) || newId(), key: str(s.key), name: str(s.name), description: str(s.description), model: str(s.model),
    qty: posNum(s.qty), unit: str(s.unit), store: str(s.store), url: /^https?:\/\//i.test(str(s.url)) ? str(s.url) : "",
    photos: (Array.isArray(s.photos) ? s.photos : []).filter((x) => typeof x === "string" && x),
    stock: posNum(s.stock), tasks: (Array.isArray(s.tasks) ? s.tasks : []).filter((id) => taskIds.has(id)),
    purchases: (Array.isArray(s.purchases) ? s.purchases : []).map(normalizePurchase).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function normalizeHouse(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.tasks)) return emptyHouse();
  const lists = (Array.isArray(raw.lists) ? raw.lists : []).map(normalizeList).filter(Boolean);
  const listIds = new Set(lists.map((l) => l.id));
  const tasks = raw.tasks.map((t) => normalizeTask(t, listIds)).filter(Boolean);
  const checks = {};
  for (const [id, c] of Object.entries(raw.checks && typeof raw.checks === "object" ? raw.checks : {})) {
    if (listIds.has(id) && Number.isInteger(c?.year)) checks[id] = { year: c.year, done: Object.fromEntries(Object.entries(c.done ?? {}).filter(([, v]) => v === true)) };
  }
  const taskIds = new Set(tasks.map((t) => t.id));
  // Données d'avant les fournitures : celles de départ
  const supplies = Array.isArray(raw.supplies) ? raw.supplies.map((s) => normalizeSupply(s, taskIds)).filter(Boolean) : emptyHouse().supplies.map((s) => normalizeSupply(s, taskIds));
  return { tasks, lists, checks, supplies };
}

// ---- Calcul des dates ----

const yearOf = (iso) => Number(iso.slice(0, 4));
const iso = (d) => toISODate(d);
// « 02-29 » une année non bissextile : le 28 février
function onYear(year, monthDay) {
  const [m, d] = monthDay.split("-").map(Number);
  const last = new Date(year, m, 0).getDate();
  return `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

// Dates de saison à partir de `from` (incluse), dans l'ordre
function* seasonDates(schedule, from) {
  for (let y = yearOf(from); y < yearOf(from) + 300; y++) {
    for (const d of schedule.dates) {
      const day = onYear(y, d);
      if (day >= from) yield day;
    }
  }
}

// Prochaine date prévue (null : jamais faite et aux N mois — on attend la dernière fois)
export function nextDue(task, today) {
  const s = task.schedule;
  if (s.kind === "every") return task.lastDone ? iso(addMonths(parseISODate(task.lastDone), s.months)) : null;
  const from = task.lastDone ? iso(addDays(parseISODate(task.lastDone), SEASON_GRACE_DAYS + 1)) : iso(addDays(parseISODate(today), -SEASON_GRACE_DAYS));
  return seasonDates(s, from).next().value;
}

// Dates prévues entre deux dates (pour le calendrier)
export function dueDatesBetween(task, from, to, today) {
  const first = nextDue(task, today);
  if (!first || first > to) return [];
  const out = [];
  if (task.schedule.kind === "every") {
    for (let d = first, n = 1; d <= to && n < 600; d = iso(addMonths(parseISODate(first), task.schedule.months * n++))) if (d >= from) out.push(d);
  } else {
    for (const d of seasonDates(task.schedule, first)) {
      if (d > to) break;
      if (d >= from) out.push(d);
    }
  }
  return out;
}

// État d'une tâche : overdue | soon | later | unknown
export function taskStatus(task, today) {
  const next = nextDue(task, today);
  if (!next) return { next: null, status: "unknown", days: null };
  const days = Math.round((parseISODate(next) - parseISODate(today)) / 86400000);
  return { next, days, status: days < 0 ? "overdue" : days <= SOON_DAYS ? "soon" : "later" };
}

// Tâches d'une zone, groupées et triées par date prévue
export function zoneOverview(house, zone, today) {
  const groups = { overdue: [], soon: [], later: [], unknown: [] };
  for (const task of house.tasks.filter((t) => t.zone === zone && t.active)) {
    const st = taskStatus(task, today);
    groups[st.status].push({ task, ...st });
  }
  for (const k of ["overdue", "soon", "later"]) groups[k].sort((a, b) => a.next.localeCompare(b.next) || a.task.title.localeCompare(b.task.title, "fr"));
  // « Dernière fois inconnue » : dans l'ordre de la liste (adoucisseur, osmose 1 à 6…)
  return groups;
}

// Ce qui est à faire bientôt, toutes zones confondues (rappels de l'accueil)
export function dueSoon(house, today, withinDays = 7) {
  return house.tasks
    .filter((t) => t.active)
    .map((task) => ({ task, ...taskStatus(task, today) }))
    .filter((x) => x.next && x.days <= withinDays);
}

// Rappels du calendrier : éléments calculés (module « maison »), faits ou à faire
export function houseOccurrences(house, from, to, today) {
  if (!house) return [];
  const out = [];
  const make = (task, date, done) => ({
    id: `house:${task.id}:${date}`, title: task.title, module: HOUSE_MODULE, date, time: "", place: "", lat: null, lng: null,
    done, status: "active", notes: task.note, recurrence: null, data: { house: { taskId: task.id, zone: task.zone } },
    source: { provider: "house", externalId: task.id, etag: null }, createdAt: null, updatedAt: null,
  });
  for (const task of house.tasks.filter((t) => t.active)) {
    for (const d of task.history) if (d >= from && d <= to) out.push(make(task, d, true));
    for (const d of dueDatesBetween(task, from, to, today)) if (!task.history.includes(d)) out.push(make(task, d, false));
  }
  return out;
}

// ---- Modifications (fonctions pures : retournent une nouvelle maison) ----

const mapTask = (house, id, fn) => ({ ...house, tasks: house.tasks.map((t) => (t.id === id ? fn(t) : t)) });

// Marquer une tâche faite à une date (aujourd'hui par défaut)
// `consume` : l'entretien vient d'être fait (« ✓ Fait ») — la réserve des fournitures liées baisse
export function markDone(house, id, date, { consume = false } = {}) {
  if (!ISO.test(date)) return house;
  const task = house.tasks.find((t) => t.id === id);
  if (!task) return house;
  const fresh = !task.history.includes(date);
  let next = mapTask(house, id, (t) => {
    const history = [...new Set([...t.history, date])].sort(); // tout l'historique est gardé
    return { ...t, history, lastDone: history.at(-1), consumedOn: consume && fresh ? date : t.consumedOn };
  });
  if (consume && fresh) next = shiftStock(next, id, -1);
  return next;
}

// Annuler la dernière fois (erreur de toucher) ; la réserve revient si elle avait baissé
export function undoDone(house, id) {
  const task = house.tasks.find((t) => t.id === id);
  if (!task?.history.length) return house;
  const removed = task.history.at(-1);
  let next = mapTask(house, id, (t) => {
    const history = t.history.slice(0, -1);
    return { ...t, history, lastDone: history.at(-1) ?? null, consumedOn: t.consumedOn === removed ? null : t.consumedOn };
  });
  if (task.consumedOn === removed) next = shiftStock(next, id, 1);
  return next;
}

// Réserve des fournitures d'une tâche : ± la quantité par remplacement (1 si non précisée)
function shiftStock(house, taskId, sign) {
  return {
    ...house,
    supplies: house.supplies.map((s) => (s.tasks.includes(taskId) && s.stock !== null
      ? { ...s, stock: Math.max(0, Math.round((s.stock + sign * (s.qty ?? 1)) * 100) / 100) } : s)),
  };
}

export function updateTask(house, id, patch) {
  const listIds = new Set(house.lists.map((l) => l.id));
  return { ...house, tasks: house.tasks.map((t) => (t.id === id ? normalizeTask({ ...t, ...patch }, listIds) ?? t : t)) };
}

export function addTask(house, fields) {
  const task = normalizeTask({ ...fields, id: newId(), history: fields.lastDone ? [fields.lastDone] : [] }, new Set(house.lists.map((l) => l.id)));
  return task ? { house: { ...house, tasks: [...house.tasks, task] }, task } : { house, task: null };
}

export const removeTask = (house, id) => ({
  ...house, tasks: house.tasks.filter((t) => t.id !== id), supplies: house.supplies.map((s) => ({ ...s, tasks: s.tasks.filter((x) => x !== id) })),
});

// ---- Fournitures à racheter ----

const taskIdSet = (house) => new Set(house.tasks.map((t) => t.id));
const mapSupply = (house, id, fn) => ({ ...house, supplies: house.supplies.map((s) => (s.id === id ? fn(s) : s)) });

export function addSupply(house, fields) {
  const supply = normalizeSupply({ ...fields, id: newId(), purchases: [] }, taskIdSet(house));
  return supply ? { house: { ...house, supplies: [...house.supplies, supply] }, supply } : { house, supply: null };
}

export function updateSupply(house, id, patch) {
  const ids = taskIdSet(house);
  return mapSupply(house, id, (s) => normalizeSupply({ ...s, ...patch, id }, ids) ?? s);
}

export const removeSupply = (house, id) => ({ ...house, supplies: house.supplies.filter((s) => s.id !== id) });

// Noter un achat : il s'ajoute à l'historique et à la réserve
export function addSupplyPurchase(house, id, purchase) {
  const p = normalizePurchase(purchase);
  if (!p) return house;
  return mapSupply(house, id, (s) => ({
    ...s,
    purchases: [...s.purchases, p].sort((a, b) => a.date.localeCompare(b.date)),
    stock: p.qty !== null ? Math.round(((s.stock ?? 0) + p.qty) * 100) / 100 : s.stock,
    store: s.store || p.store,
  }));
}

export function removeSupplyPurchase(house, id, purchaseId) {
  return mapSupply(house, id, (s) => {
    const p = s.purchases.find((x) => x.id === purchaseId);
    const stock = p?.qty !== null && p?.qty !== undefined && s.stock !== null ? Math.max(0, Math.round((s.stock - p.qty) * 100) / 100) : s.stock;
    return { ...s, purchases: s.purchases.filter((x) => x.id !== purchaseId), stock };
  });
}

// Fournitures avec leur urgence : « buy » (réserve insuffisante), « soon » (entretien dû d'ici 30 jours
// sans réserve suivie), « ok ». Les plus urgentes d'abord.
export function supplyOverview(house, today) {
  const rank = { buy: 0, soon: 1, ok: 2 };
  return house.supplies.map((supply) => {
    const tasks = house.tasks.filter((t) => supply.tasks.includes(t.id) && t.active);
    const dues = tasks.map((t) => taskStatus(t, today)).filter((x) => x.next).sort((a, b) => a.next.localeCompare(b.next));
    const next = dues[0] ?? null;
    const need = supply.qty ?? 1;
    const short = supply.stock !== null && supply.stock < need;
    const dueSoon = next && next.days <= SOON_DAYS;
    const status = short && (dueSoon || supply.stock === 0) ? "buy" : dueSoon && supply.stock === null ? "soon" : short ? "buy" : "ok";
    return { supply, tasks, next, status, last: supply.purchases.at(-1) ?? null };
  }).sort((a, b) => rank[a.status] - rank[b.status] || (a.next?.next ?? "9999").localeCompare(b.next?.next ?? "9999") || a.supply.name.localeCompare(b.supply.name, "fr"));
}

// Fournitures liées à une tâche (pour « À prévoir » sur la carte de l'entretien)
export const taskSupplies = (house, taskId) => house.supplies.filter((s) => s.tasks.includes(taskId));

// Photos gardées (à ne pas effacer du stockage des fichiers)
export const housePhotoIds = (house) => (house?.supplies ?? []).flatMap((s) => s.photos);

// ---- Listes à cocher ----

const seasonYear = (today) => yearOf(today);

export function listState(house, listId, today) {
  const c = house.checks[listId];
  return c && c.year === seasonYear(today) ? c.done : {};
}

export function toggleCheck(house, listId, entryId, today) {
  const done = { ...listState(house, listId, today) };
  if (done[entryId]) delete done[entryId];
  else done[entryId] = true;
  return { ...house, checks: { ...house.checks, [listId]: { year: seasonYear(today), done } } };
}

export const resetList = (house, listId) => {
  const checks = { ...house.checks };
  delete checks[listId];
  return { ...house, checks };
};

export function addListEntry(house, listId, text) {
  const clean = str(text);
  if (!clean) return house;
  return { ...house, lists: house.lists.map((l) => (l.id === listId ? { ...l, entries: [...l.entries, { id: newId(), text: clean }] } : l)) };
}

export function removeListEntry(house, listId, entryId) {
  return { ...house, lists: house.lists.map((l) => (l.id === listId ? { ...l, entries: l.entries.filter((e) => e.id !== entryId) } : l)) };
}

