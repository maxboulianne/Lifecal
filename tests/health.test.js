import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addFood, addMeal, addReaction, currentPhase, currentTest, emptyHealth, finishTest, foodsInText, healthOccurrences, journal, mealKindAt,
  normalizeHealth, ongoingReaction, programPhases, removeMeal, setFoodStatus, startProgram, startReaction, startTest, stopReaction, toTest, weekSummary,
} from "../js/health/health.js";
import { MemoryAdapter } from "../js/data/storage/adapters.js";
import { Repository } from "../js/data/repository.js";

const food = (h, name) => h.foods.find((f) => f.name === name);

test("Santé : liste de départ (à privilégier, à limiter, à éviter)", () => {
  const h = emptyHealth();
  assert.equal(food(h, "Orange").level, "avoid");
  assert.equal(food(h, "Banane").level, "good");
  assert.equal(food(h, "Bleuets").level, "limit");
  assert.equal(new Set(h.foods.map((f) => f.id)).size, h.foods.length); // identifiants uniques
  assert.deepEqual(normalizeHealth(JSON.parse(JSON.stringify(h))), h);
  assert.equal(normalizeHealth(undefined).foods.length, h.foods.length); // anciennes données
});

test("Santé : repas, aliments reconnus dans le texte, réaction en direct", () => {
  assert.equal(mealKindAt("07:30"), "breakfast");
  assert.equal(mealKindAt("12:10"), "lunch");
  assert.equal(mealKindAt("18:45"), "dinner");
  assert.equal(mealKindAt("15:30"), "snack");
  let h = emptyHealth();
  assert.deepEqual(foodsInText(h, "Poulet, riz et brocoli").sort(), [food(h, "Brocoli").id, food(h, "Poulet").id, food(h, "Riz").id].sort());
  const added = addMeal(h, { date: "2026-11-03", time: "12:00", kind: "lunch", text: "Poulet et riz", drink: "Jus d'orange", foods: [food(h, "Banane").id] });
  h = added.health;
  assert.equal(added.meal.foods.length, 4); // banane + poulet + riz + jus d'orange
  assert.equal(addMeal(h, { date: "2026-11-03", text: "" }).meal, null);
  // « Je réagis maintenant » à 12 h 10 : rattachée au dîner ; durée à 12 h 22
  const started = startReaction(h, { date: "2026-11-03", time: "12:10" });
  h = started.health;
  assert.equal(started.reaction.mealId, added.meal.id);
  assert.equal(ongoingReaction(h, "2026-11-03", "12:15").id, started.reaction.id);
  h = stopReaction(h, started.reaction.id, "2026-11-03", "12:22");
  assert.equal(h.reactions[0].minutes, 12);
  assert.equal(ongoingReaction(h, "2026-11-03", "12:30"), null);
  // Sans repas récent : réaction seule
  assert.equal(startReaction(h, { date: "2026-11-03", time: "16:00" }).reaction.mealId, null);
  // Réaction notée après coup, journal et bilan
  h = addReaction(h, { date: "2026-11-03", time: "12:00", mealId: added.meal.id, where: "both", intensity: 5, minutes: 8 });
  const j = journal(h, "2026-11-03");
  assert.equal(j[0].meals[0].reactions.length, 2);
  const w = weekSummary(h, "2026-11-03");
  assert.equal(w.reactions, 2);
  assert.equal(w.minutes, 10);
  // Supprimer le repas garde ses réactions
  h = removeMeal(h, added.meal.id);
  assert.equal(h.reactions.length, 2);
  assert.equal(h.reactions.every((r) => r.mealId === null), true);
});

test("Santé : aliments (statut, ajout)", () => {
  let h = setFoodStatus(emptyHealth(), "f-orange", "react");
  assert.equal(food(h, "Orange").status, "react");
  const added = addFood(h, { name: "Kombucha", level: "avoid", group: "drinks" });
  assert.equal(added.food.level, "avoid");
  assert.equal(addFood(added.health, { name: "kombucha" }).food, null); // déjà là
});

test("Santé : programme en 3 phases et réintroduction", () => {
  let h = startProgram(emptyHealth(), "2026-11-03");
  const phases = programPhases(h.program);
  assert.deepEqual(phases.map((p) => [p.id, p.from]), [["observe", "2026-11-03"], ["calm", "2026-11-17"], ["reintro", "2026-12-15"]]);
  assert.equal(currentPhase(h.program, "2026-11-10").id, "observe");
  assert.equal(currentPhase(h.program, "2026-12-01").id, "calm");
  assert.equal(currentPhase(h.program, "2027-01-05").id, "reintro");
  const first = toTest(h)[0];
  h = startTest(h, first.id, "2026-12-15");
  assert.equal(currentTest(h).foodId, first.id);
  h = finishTest(h, "ok");
  assert.equal(currentTest(h), null);
  assert.equal(h.foods.find((f) => f.id === first.id).status, "ok");
  assert.equal(toTest(h).some((f) => f.id === first.id), false);
  const occ = healthOccurrences(h, "2026-11-01", "2026-12-31");
  assert.deepEqual(occ.map((o) => o.date), ["2026-11-03", "2026-11-17", "2026-12-15", "2026-12-15"]);
  assert.equal(occ[0].module, "sante");
});

test("Santé : rappels dans le calendrier du dépôt", async () => {
  const repo = new Repository(new MemoryAdapter(), { clock: () => new Date(2026, 10, 3, 12) });
  await repo.init();
  await repo.updateHealth(startProgram(repo.health(), "2026-11-03"));
  assert.ok(repo.onDate("2026-11-17").some((i) => i.id === "health:calm:2026-11-17"));
});
