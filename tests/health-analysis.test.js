import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyHealth, normalizeHealth } from "../js/health/health.js";
import { FLAG_SPICY, analyzeFoods, periodOf, reactionsByMeal, timeSlot } from "../js/health/analysis.js";
import { healthReportPdf } from "../js/health/report-pdf.js";

// Données fictives : la tomate revient avant les réactions, le riz et le poulet non
function sample() {
  const meals = [];
  const reactions = [];
  const day = (n) => `2026-10-${String(n).padStart(2, "0")}`;
  for (let n = 1; n <= 12; n++) {
    meals.push({ id: `m${n}`, date: day(n), time: "12:00", kind: "lunch", foods: ["f-riz", "f-poulet", ...(n % 3 === 0 ? ["f-tomate"] : [])], calm: n % 3 !== 0, spicy: n === 6 });
    if (n % 3 === 0) reactions.push({ id: `r${n}`, date: day(n), time: "12:30", mealId: `m${n}`, where: "nose", intensity: 4, minutes: 10 });
  }
  // Réaction sans repas, 1 h après le souper du 13 : rattachée à ce souper
  meals.push({ id: "m13", date: day(13), time: "18:00", kind: "dinner", foods: ["f-tomate", "f-riz"] });
  reactions.push({ id: "r13", date: day(13), time: "19:00", where: "mouth", intensity: 2, minutes: 5 });
  return normalizeHealth({ ...emptyHealth(), meals, reactions });
}

test("Analyse : une réaction sans repas se rattache au repas des 3 heures précédentes", () => {
  const h = sample();
  const by = reactionsByMeal(h.meals, h.reactions);
  assert.deepEqual(by.get("m13").map((r) => r.id), ["r13"]);
  assert.equal(by.get("m1").length, 0);
  // Plus de 3 heures après : non rattachée
  const late = reactionsByMeal(h.meals, [{ ...h.reactions.at(-1), time: "21:30" }]);
  assert.equal(late.get("m13").length, 0);
});

test("Analyse : aliments suspects, tolérés, taux moyen et tendances", () => {
  const h = sample();
  const a = analyzeFoods(h, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(a.totals.meals, 13);
  assert.equal(a.totals.reactedMeals, 5);
  assert.equal(a.totals.reactions, 5);
  assert.equal(a.totals.delay, 36); // délais : 30, 30, 30, 30 et 60 min
  assert.equal(Math.round(a.baseline * 100), 38); // 5 repas sur 13
  // Tomate : 5 repas, 5 réactions → suspect
  const tomate = a.suspects.find((x) => x.id === "f-tomate");
  assert.ok(tomate);
  assert.equal(tomate.eaten, 5);
  assert.equal(tomate.reacted, 5);
  assert.equal(tomate.rate, 1);
  assert.equal(tomate.intensity, 3.6); // 4, 4, 4, 4, 2
  // Riz : pris à chaque repas → taux égal à la moyenne : ni suspect ni toléré
  assert.ok(!a.suspects.some((x) => x.id === "f-riz"));
  assert.ok(!a.safe.some((x) => x.id === "f-riz"));
  // Repas épicé (une seule fois, avec réaction) : à surveiller
  assert.ok(a.watch.some((x) => x.id === FLAG_SPICY));
  // Tendances : réactions par semaine et moment de la journée
  assert.equal(a.weeks.reduce((s, w) => s + w.reactions, 0), 5);
  assert.equal(a.slots.midday, 4);
  assert.equal(a.slots.evening, 1);
  assert.deepEqual(a.where, { nose: 4, mouth: 1, both: 0 });
  // Repas les plus parlants : la réaction la plus forte d'abord
  assert.equal(a.notable[0].intensity, 4);
  assert.equal(a.notable.at(-1).meal.id, "m13");
  assert.equal(a.enough, true);
});

test("Analyse : un aliment toléré (3 repas « aucune réaction », jamais de réaction)", () => {
  const meals = [1, 2, 3, 4].map((n) => ({ id: `m${n}`, date: `2026-10-0${n}`, time: "08:00", kind: "breakfast", foods: ["f-gruau", ...(n === 4 ? ["f-orange"] : [])], calm: n !== 4 }));
  const reactions = [{ id: "r", date: "2026-10-04", time: "08:20", mealId: "m4", intensity: 3, minutes: 8 }];
  const h = normalizeHealth({ ...emptyHealth(), meals, reactions });
  const a = analyzeFoods(h, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(a.enough, false);
  assert.ok(!a.safe.some((x) => x.id === "f-gruau")); // une réaction après le 4e repas
  const h2 = normalizeHealth({ ...emptyHealth(), meals: meals.slice(0, 3) });
  assert.deepEqual(analyzeFoods(h2, { from: "2026-10-01", to: "2026-10-31" }).safe.map((x) => x.id), ["f-gruau"]);
});

test("Analyse : période et moment de la journée", () => {
  const h = sample();
  assert.deepEqual(periodOf(h, "2026-11-05", 30), { from: "2026-10-07", to: "2026-11-05" });
  assert.deepEqual(periodOf(h, "2026-11-05", 0), { from: "2026-10-01", to: "2026-11-05" });
  assert.equal(timeSlot("07:30"), "morning");
  assert.equal(timeSlot("12:00"), "midday");
  assert.equal(timeSlot("23:10"), "night");
  assert.equal(timeSlot(""), null);
});

test("Rapport PDF pour le médecin : un PDF valide", () => {
  const h = sample();
  const a = analyzeFoods(h, { from: "2026-10-01", to: "2026-10-31" });
  const bytes = healthReportPdf(h, a, { nameOf: (id) => h.foods.find((f) => f.id === id)?.name ?? id, today: "2026-11-05" });
  const text = new TextDecoder("latin1").decode(bytes);
  assert.ok(text.startsWith("%PDF-"));
  assert.ok(text.includes("Tomate"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
});

test("Analyse : un aliment de presque tous les repas n'est pas « à surveiller » pour un taux à peine plus haut", () => {
  // 20 repas, 4 avec réaction (20 %) ; le riz : 16 repas dont 4 avec réaction (25 %)
  const meals = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, date: `2026-10-${String(i + 1).padStart(2, "0")}`, time: "18:00", kind: "dinner",
    foods: i < 16 ? ["f-riz"] : ["f-quinoa"], calm: i >= 4 }));
  const reactions = [0, 1, 2, 3].map((i) => ({ id: `r${i}`, date: meals[i].date, time: "18:20", mealId: `m${i}`, intensity: 2, minutes: 5 }));
  const a = analyzeFoods(normalizeHealth({ ...emptyHealth(), meals, reactions }), { from: "2026-10-01", to: "2026-10-31" });
  assert.ok(!a.watch.some((x) => x.id === "f-riz"));
  assert.ok(!a.suspects.some((x) => x.id === "f-riz"));
});
