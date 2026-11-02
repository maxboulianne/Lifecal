// Entretien de la maison : tâches à l'intérieur et à l'extérieur, avec leur fréquence,
// la dernière fois qu'elles ont été faites, et des listes à cocher de saison.
//
// Rangé dans le document : house = { tasks: [...], lists: [...], checks: {...} }
//   tâche  : { id, key, zone: "inside"|"outside", title, note, schedule, lastDone, history: [dates], list, active }
//   horaire : { kind: "every", months: 6 }                 aux 6 mois (après la dernière fois)
//             { kind: "dates", dates: ["05-15", "11-05"] } chaque année à ces dates (saisons)
//   liste  : { id, key, zone, title, entries: [{ id, text }] }
//   checks : { [listId]: { year: 2026, done: { [entryId]: true } } } — une nouvelle année repart à zéro
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

export function emptyHouse() {
  const lists = DEFAULT_LISTS.map(([key, zone, title, entries]) => ({ id: key, key, zone, title, entries: entries.map((text, i) => ({ id: `${key}-${i + 1}`, text })) }));
  const tasks = DEFAULT_TASKS.map(([key, zone, title, schedule, note = "", list = null]) => ({
    id: key, key, zone, title, note, schedule, lastDone: null, history: [], list, active: true,
  }));
  return { tasks, lists, checks: {} };
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
  };
}

function normalizeList(l) {
  if (!l || !str(l.title)) return null;
  const entries = (Array.isArray(l.entries) ? l.entries : []).filter((e) => e && str(e.text)).map((e) => ({ id: str(e.id) || newId(), text: str(e.text) }));
  return { id: str(l.id) || newId(), key: str(l.key), zone: ZONES.includes(l.zone) ? l.zone : "inside", title: str(l.title), entries };
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
  return { tasks, lists, checks };
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
export function markDone(house, id, date) {
  if (!ISO.test(date)) return house;
  return mapTask(house, id, (t) => {
    const history = [...new Set([...t.history, date])].sort(); // tout l'historique est gardé
    return { ...t, history, lastDone: history.at(-1) };
  });
}

// Annuler la dernière fois (erreur de toucher)
export function undoDone(house, id) {
  return mapTask(house, id, (t) => {
    const history = t.history.slice(0, -1);
    return { ...t, history, lastDone: history.at(-1) ?? null };
  });
}

export function updateTask(house, id, patch) {
  const listIds = new Set(house.lists.map((l) => l.id));
  return { ...house, tasks: house.tasks.map((t) => (t.id === id ? normalizeTask({ ...t, ...patch }, listIds) ?? t : t)) };
}

export function addTask(house, fields) {
  const task = normalizeTask({ ...fields, id: newId(), history: fields.lastDone ? [fields.lastDone] : [] }, new Set(house.lists.map((l) => l.id)));
  return task ? { house: { ...house, tasks: [...house.tasks, task] }, task } : { house, task: null };
}

export const removeTask = (house, id) => ({ ...house, tasks: house.tasks.filter((t) => t.id !== id) });

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

