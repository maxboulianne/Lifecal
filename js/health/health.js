// Santé : réactions aux aliments (nez qui coule, salive) — journal des repas et des réactions,
// liste des aliments avec le statut personnel de chacun, et programme en 3 phases
// (observer, calmer, réintroduire). Aucun avis médical : un outil pour noter et comprendre.
//
// Rangé dans le document : health = { foods, meals, reactions, program }
//   aliment  : { id, key, name, group, level: "good"|"limit"|"avoid", status: "unknown"|"ok"|"react" }
//   repas    : { id, date, time, kind, foods: [foodIds], text, drink, spicy, hot, note }
//   réaction : { id, date, time, mealId, where: "nose"|"mouth"|"both", intensity: 1..5, minutes, note }
//   programme : { start: date|null, observeDays, calmDays, testDays, tests: [{ foodId, start, result: "ok"|"react"|null }] }
//
// Les rappels du calendrier (début des phases, aliment à réintroduire) sont calculés.

import { addDays, parseISODate, toISODate } from "../core/dates.js";
import { newId } from "../data/item.js";

export const HEALTH_MODULE = "sante";
export const LEVELS = ["good", "limit", "avoid"];
export const STATUSES = ["unknown", "ok", "react"];
export const GROUPS = ["vegetables", "fruits", "grains", "proteins", "dairy", "fats", "herbs", "drinks", "other"];
export const MEAL_KINDS = ["breakfast", "lunch", "dinner", "snack", "drink"];
export const WHERE = ["nose", "mouth", "both"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^\d{2}:\d{2}$/;
const str = (v) => String(v ?? "").trim();

// ---- Liste de départ (aliments peu acides, à tester, à éviter pendant la phase 2) ----
const FOODS = {
  good: {
    vegetables: ["Brocoli", "Haricots verts", "Asperges", "Épinards", "Courgette", "Concombre", "Céleri", "Carotte", "Patate douce", "Pomme de terre", "Panais", "Chou-fleur", "Laitue", "Bok choy"],
    fruits: ["Banane", "Melon (cantaloup, miel)", "Poire", "Mangue mûre", "Papaye", "Avocat"],
    grains: ["Gruau", "Riz", "Quinoa", "Pain de blé entier", "Pâtes", "Craquelins", "Sarrasin"],
    proteins: ["Poulet", "Dinde", "Poisson blanc", "Saumon", "Œufs", "Tofu", "Légumineuses bien cuites", "Porc maigre"],
    dairy: ["Lait", "Boisson d'amande"],
    fats: ["Huile d'olive", "Amandes", "Beurre d'amande"],
    herbs: ["Basilic", "Persil", "Aneth", "Coriandre", "Thym", "Gingembre frais (un peu)", "Cannelle"],
    drinks: ["Eau", "Tisane de camomille"],
  },
  limit: {
    fruits: ["Pomme rouge douce", "Raisins rouges", "Bleuets", "Pêche bien mûre"],
    vegetables: ["Oignon cuit", "Ail cuit"],
    dairy: ["Fromage doux", "Yogourt nature"],
    drinks: ["Thé vert léger", "Café peu acide ou infusé à froid"],
    other: ["Chocolat noir"],
    herbs: ["Cumin", "Curcuma", "Paprika doux"],
  },
  avoid: {
    fruits: ["Orange", "Pamplemousse", "Citron", "Lime", "Clémentine", "Ananas", "Kiwi", "Fraises", "Framboises", "Canneberges", "Rhubarbe", "Pomme verte"],
    drinks: ["Jus d'orange", "Jus de fruits", "Café (filtre, espresso)", "Thé noir fort", "Boissons gazeuses", "Boissons énergisantes", "Vin blanc", "Bière", "Tisane à la menthe"],
    vegetables: ["Tomate", "Sauce tomate", "Oignon cru", "Ail cru"],
    other: ["Ketchup", "Salsa", "Vinaigre et vinaigrettes", "Marinades et cornichons", "Moutarde forte", "Fritures", "Plats très gras"],
    herbs: ["Piment", "Sauce piquante", "Poivre fort", "Wasabi", "Raifort", "Menthe"],
  },
};

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function emptyHealth() {
  const foods = [];
  for (const level of LEVELS) {
    for (const [group, names] of Object.entries(FOODS[level])) {
      for (const name of names) foods.push({ id: `f-${slug(name)}`, key: slug(name), name, group, level, status: "unknown" });
    }
  }
  return { foods, meals: [], reactions: [], program: { start: null, observeDays: 14, calmDays: 28, testDays: 3, tests: [] } };
}

// ---- Validation ----

function normalizeFood(f) {
  if (!f || !str(f.name)) return null;
  return {
    id: str(f.id) || newId(), key: str(f.key), name: str(f.name), group: GROUPS.includes(f.group) ? f.group : "other",
    level: LEVELS.includes(f.level) ? f.level : "limit", status: STATUSES.includes(f.status) ? f.status : "unknown",
  };
}

function normalizeMeal(m, foodIds) {
  if (!m || !ISO.test(m.date)) return null;
  const foods = [...new Set((Array.isArray(m.foods) ? m.foods : []).filter((id) => foodIds.has(id)))];
  if (!foods.length && !str(m.text) && !str(m.drink)) return null;
  return {
    id: str(m.id) || newId(), date: m.date, time: HM.test(m.time) ? m.time : "", kind: MEAL_KINDS.includes(m.kind) ? m.kind : "snack",
    foods, text: str(m.text), drink: str(m.drink), spicy: Boolean(m.spicy), hot: Boolean(m.hot), note: str(m.note),
  };
}

function normalizeReaction(r, mealIds) {
  if (!r || !ISO.test(r.date)) return null;
  const intensity = Math.round(Number(r.intensity));
  const minutes = Number(r.minutes);
  return {
    id: str(r.id) || newId(), date: r.date, time: HM.test(r.time) ? r.time : "", mealId: mealIds.has(r.mealId) ? r.mealId : null,
    where: WHERE.includes(r.where) ? r.where : "nose", intensity: intensity >= 1 && intensity <= 5 ? intensity : 3,
    minutes: Number.isFinite(minutes) && minutes >= 0 && r.minutes !== null && r.minutes !== "" ? Math.round(minutes) : null, note: str(r.note),
  };
}

export function normalizeHealth(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.foods)) return emptyHealth();
  const foods = raw.foods.map(normalizeFood).filter(Boolean);
  const foodIds = new Set(foods.map((f) => f.id));
  const meals = (Array.isArray(raw.meals) ? raw.meals : []).map((m) => normalizeMeal(m, foodIds)).filter(Boolean).sort(byWhen);
  const mealIds = new Set(meals.map((m) => m.id));
  const reactions = (Array.isArray(raw.reactions) ? raw.reactions : []).map((r) => normalizeReaction(r, mealIds)).filter(Boolean).sort(byWhen);
  const p = raw.program ?? {};
  const days = (v, d) => (Number.isInteger(v) && v >= 1 && v <= 120 ? v : d);
  const program = {
    start: ISO.test(p.start) ? p.start : null, observeDays: days(p.observeDays, 14), calmDays: days(p.calmDays, 28), testDays: days(p.testDays, 3),
    tests: (Array.isArray(p.tests) ? p.tests : []).filter((x) => foodIds.has(x?.foodId) && ISO.test(x.start))
      .map((x) => ({ foodId: x.foodId, start: x.start, result: ["ok", "react"].includes(x.result) ? x.result : null })),
  };
  return { foods, meals, reactions, program };
}

const byWhen = (a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "");

// ---- Journal ----

// Repas selon l'heure : déjeuner avant 10 h 30, dîner avant 14 h 30, souper de 17 h à 21 h, sinon collation
export function mealKindAt(time) {
  const [h, m] = (time || "12:00").split(":").map(Number);
  const t = h * 60 + m;
  if (t >= 300 && t < 630) return "breakfast";
  if (t >= 690 && t < 870) return "lunch";
  if (t >= 1020 && t < 1260) return "dinner";
  return "snack";
}

// Aliments reconnus dans un texte libre (« poulet, riz et brocoli ») : liés au repas pour l'analyse
const plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function foodsInText(health, text) {
  const t = ` ${plain(text).replace(/[^a-z0-9]+/g, " ")} `;
  const found = health.foods.map((f) => ({ id: f.id, base: plain(f.name).replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim() }))
    .filter((f) => f.base && t.includes(` ${f.base} `));
  // « Jus d'orange » plutôt que « Orange » aussi : le nom le plus long l'emporte
  return found.filter((f) => !found.some((g) => g !== f && g.base.length > f.base.length && ` ${g.base} `.includes(` ${f.base} `))).map((f) => f.id);
}

export function addMeal(health, fields) {
  const ids = new Set(health.foods.map((f) => f.id));
  const foods = [...new Set([...(fields.foods ?? []), ...foodsInText(health, `${fields.text ?? ""} ${fields.drink ?? ""}`)])];
  const meal = normalizeMeal({ ...fields, foods, id: newId() }, ids);
  return meal ? { health: { ...health, meals: [...health.meals, meal].sort(byWhen) }, meal } : { health, meal: null };
}

export function updateMeal(health, id, fields) {
  const ids = new Set(health.foods.map((f) => f.id));
  return { ...health, meals: health.meals.map((m) => (m.id === id ? normalizeMeal({ ...m, ...fields, id }, ids) ?? m : m)).sort(byWhen) };
}

export const removeMeal = (health, id) => ({
  ...health, meals: health.meals.filter((m) => m.id !== id), reactions: health.reactions.map((r) => (r.mealId === id ? { ...r, mealId: null } : r)),
});

const minutesOf = (date, time) => parseISODate(date).getTime() / 60000 + (time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) - 12 * 60 : 0);

// Le repas en cours ou qui vient de finir (dans les 90 minutes) : la réaction s'y rattache
export function recentMeal(health, date, time, withinMinutes = 90) {
  const now = minutesOf(date, time);
  return [...health.meals].reverse().find((m) => {
    const d = now - minutesOf(m.date, m.time || "12:00");
    return d >= -15 && d <= withinMinutes;
  }) ?? null;
}

// « Je réagis maintenant » : réaction commencée maintenant, durée notée quand elle s'arrête
export function startReaction(health, { date, time, where = "nose", intensity = 3 }) {
  const meal = recentMeal(health, date, time);
  const reaction = normalizeReaction({ id: newId(), date, time, mealId: meal?.id ?? null, where, intensity, minutes: null }, new Set(health.meals.map((m) => m.id)));
  return { health: { ...health, reactions: [...health.reactions, reaction].sort(byWhen) }, reaction };
}

export function updateReaction(health, id, fields) {
  const ids = new Set(health.meals.map((m) => m.id));
  return { ...health, reactions: health.reactions.map((r) => (r.id === id ? normalizeReaction({ ...r, ...fields, id }, ids) ?? r : r)) };
}

// Fin de la réaction : durée depuis son début
export function stopReaction(health, id, date, time) {
  const r = health.reactions.find((x) => x.id === id);
  if (!r) return health;
  const minutes = Math.max(1, Math.round(minutesOf(date, time) - minutesOf(r.date, r.time || time)));
  return updateReaction(health, id, { minutes });
}

// Réaction notée après coup pour un repas (où, intensité, durée)
export function addReaction(health, fields) {
  const ids = new Set(health.meals.map((m) => m.id));
  const reaction = normalizeReaction({ ...fields, id: newId() }, ids);
  return reaction ? { ...health, reactions: [...health.reactions, reaction].sort(byWhen) } : health;
}

export const removeReaction = (health, id) => ({ ...health, reactions: health.reactions.filter((r) => r.id !== id) });

// Réaction encore en cours (sans durée, commencée depuis moins de 2 h)
export function ongoingReaction(health, date, time) {
  const now = minutesOf(date, time);
  return [...health.reactions].reverse().find((r) => r.minutes === null && now - minutesOf(r.date, r.time) <= 120 && now >= minutesOf(r.date, r.time)) ?? null;
}

// Journal des derniers jours : chaque repas avec ses réactions, plus les réactions sans repas
export function journal(health, today, days = 7) {
  const from = toISODate(addDays(parseISODate(today), -(days - 1)));
  const out = [];
  for (let d = today; d >= from; d = toISODate(addDays(parseISODate(d), -1))) {
    const meals = health.meals.filter((m) => m.date === d).map((meal) => ({ meal, reactions: health.reactions.filter((r) => r.mealId === meal.id) }));
    const loose = health.reactions.filter((r) => r.date === d && !r.mealId);
    if (meals.length || loose.length) out.push({ date: d, meals, loose });
  }
  return out;
}

// ---- Aliments ----

export function setFoodStatus(health, id, status) {
  if (!STATUSES.includes(status)) return health;
  return { ...health, foods: health.foods.map((f) => (f.id === id ? { ...f, status } : f)) };
}

export function addFood(health, { name, level = "limit", group = "other" }) {
  const food = normalizeFood({ id: newId(), name, level, group });
  if (!food || health.foods.some((f) => plain(f.name) === plain(food.name))) return { health, food: null };
  return { health: { ...health, foods: [...health.foods, food] }, food };
}

export const removeFood = (health, id) => ({
  ...health, foods: health.foods.filter((f) => f.id !== id), meals: health.meals.map((m) => ({ ...m, foods: m.foods.filter((x) => x !== id) })),
  program: { ...health.program, tests: health.program.tests.filter((x) => x.foodId !== id) },
});

// ---- Programme en 3 phases ----

export function programPhases(program) {
  if (!program.start) return null;
  const at = (n) => toISODate(addDays(parseISODate(program.start), n));
  return [
    { id: "observe", from: program.start, to: at(program.observeDays - 1) },
    { id: "calm", from: at(program.observeDays), to: at(program.observeDays + program.calmDays - 1) },
    { id: "reintro", from: at(program.observeDays + program.calmDays), to: null },
  ];
}

export function currentPhase(program, today) {
  const phases = programPhases(program);
  if (!phases) return null;
  if (today < phases[0].from) return { ...phases[0], upcoming: true };
  return phases.find((p) => today >= p.from && (!p.to || today <= p.to));
}

export const startProgram = (health, date) => ({ ...health, program: { ...health.program, start: date, tests: [] } });
export const stopProgram = (health) => ({ ...health, program: { ...health.program, start: null, tests: [] } });

// Aliments à réintroduire : ceux « à éviter » ou « à limiter » pas encore jugés, dans l'ordre de la liste
export const toTest = (health) => health.foods.filter((f) => f.level !== "good" && f.status === "unknown" && !health.program.tests.some((x) => x.foodId === f.id && x.result));

// Test en cours (réintroduction) : le dernier commencé, sans résultat
export const currentTest = (health) => health.program.tests.find((x) => !x.result) ?? null;

export function startTest(health, foodId, date) {
  if (currentTest(health)) return health;
  return { ...health, program: { ...health.program, tests: [...health.program.tests, { foodId, start: date, result: null }] } };
}

// Résultat : toléré ou réaction ; le statut de l'aliment suit
export function finishTest(health, result) {
  const test = currentTest(health);
  if (!test || !["ok", "react"].includes(result)) return health;
  const next = { ...health, program: { ...health.program, tests: health.program.tests.map((x) => (x === test ? { ...x, result } : x)) } };
  return setFoodStatus(next, test.foodId, result);
}

// Rappels du calendrier : début de chaque phase, et chaque aliment à réintroduire
export function healthOccurrences(health, from, to) {
  if (!health?.program?.start) return [];
  const make = (key, date, title, done = false) => ({
    id: `health:${key}:${date}`, title, module: HEALTH_MODULE, date, time: "", place: "", lat: null, lng: null, done, status: "active",
    notes: "", recurrence: null, data: { health: { key } }, source: { provider: "health", externalId: key, etag: null }, createdAt: null, updatedAt: null,
  });
  const out = [];
  const titles = { observe: "Phase 1 — observer", calm: "Phase 2 — calmer", reintro: "Phase 3 — réintroduire" };
  for (const p of programPhases(health.program)) if (p.from >= from && p.from <= to) out.push(make(p.id, p.from, titles[p.id]));
  for (const x of health.program.tests) {
    const food = health.foods.find((f) => f.id === x.foodId);
    if (food && x.start >= from && x.start <= to) out.push(make(`test-${x.foodId}`, x.start, `Réintroduire « ${food.name} »`, Boolean(x.result)));
  }
  return out;
}

// Petit bilan : réactions des 7 derniers jours (nombre, intensité moyenne)
export function weekSummary(health, today) {
  const from = toISODate(addDays(parseISODate(today), -6));
  const list = health.reactions.filter((r) => r.date >= from && r.date <= today);
  const meals = health.meals.filter((m) => m.date >= from && m.date <= today).length;
  const avg = list.length ? Math.round((list.reduce((s, r) => s + r.intensity, 0) / list.length) * 10) / 10 : null;
  const timed = list.filter((r) => r.minutes !== null);
  const minutes = timed.length ? Math.round(timed.reduce((s, r) => s + r.minutes, 0) / timed.length) : null;
  return { reactions: list.length, meals, intensity: avg, minutes };
}
