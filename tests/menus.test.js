import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyHealth, normalizeHealth, setFoodStatus } from "../js/health/health.js";
import {
  BUILT_IN_DISHES, addDish, dishName, dishWarnings, findDish, isSavedWeek, resetWeek, setSlot, weekDays, weekFoods, weekPlan, weekStartOf,
} from "../js/health/menus.js";

test("Menus : plats de départ (aliments connus, 7 langues) et menu proposé", () => {
  const h = emptyHealth();
  const ids = new Set(h.foods.map((f) => f.id));
  for (const d of BUILT_IN_DISHES) {
    assert.equal(d.names.length, 7, d.id);
    for (const f of d.foods) assert.ok(ids.has(f), `${d.id}: ${f}`);
    assert.equal(dishWarnings(h, d).length, 0, `${d.id} ne contient rien « à éviter »`);
  }
  assert.equal(weekStartOf("2026-11-05"), "2026-11-02"); // le lundi
  assert.equal(weekDays("2026-11-02").at(-1), "2026-11-08");
  const plan = weekPlan(h, "2026-11-02");
  assert.equal(plan.length, 7);
  assert.equal(dishName(findDish(h, plan[0].breakfast), "en"), "Oatmeal, banana and almond butter");
  assert.equal(isSavedWeek(h, "2026-11-02"), false);
});

test("Menus : changer un plat, revenir au menu proposé, liste d'épicerie", () => {
  let h = emptyHealth();
  h = setSlot(h, "2026-11-02", 0, "dinner", "d5");
  assert.equal(weekPlan(h, "2026-11-02")[0].dinner, "d5");
  assert.equal(weekPlan(h, "2026-11-02")[1].dinner, "d2"); // le reste : menu proposé
  h = setSlot(h, "2026-11-02", 2, "snack", null);
  assert.equal(weekPlan(h, "2026-11-02")[2].snack, null);
  assert.deepEqual(normalizeHealth(JSON.parse(JSON.stringify(h))).menus, h.menus); // relu tel quel
  const foods = weekFoods(h, "2026-11-02").map((f) => f.id);
  assert.ok(foods.includes("f-tofu") && foods.includes("f-saumon"));
  assert.equal(new Set(foods).size, foods.length);
  h = resetWeek(h, "2026-11-02");
  assert.equal(isSavedWeek(h, "2026-11-02"), false);
});

test("Menus : plat ajouté, avertissement pour un aliment qui fait réagir", () => {
  let h = emptyHealth();
  const added = addDish(h, { name: "Pâtes sauce tomate", kind: "dinner", foods: ["f-pates", "f-sauce-tomate", "inconnu"] });
  h = added.health;
  assert.deepEqual(added.dish.foods, ["f-pates", "f-sauce-tomate"]);
  assert.deepEqual(dishWarnings(h, added.dish).map((f) => f.id), ["f-sauce-tomate"]);
  h = setFoodStatus(h, "f-sauce-tomate", "ok");
  assert.equal(dishWarnings(h, added.dish).length, 0); // toléré : plus d'avertissement
  h = setFoodStatus(h, "f-pates", "react");
  assert.equal(dishWarnings(h, added.dish).length, 1);
  assert.equal(dishName(added.dish, "en"), "Pâtes sauce tomate"); // plat personnel : son nom
  assert.equal(normalizeHealth(JSON.parse(JSON.stringify(h))).dishes.length, 1);
  assert.equal(addDish(h, { name: "", kind: "dinner" }).dish, null);
});
