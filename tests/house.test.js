import { test } from "node:test";
import assert from "node:assert/strict";
import { addTask, dueSoon, emptyHouse, houseOccurrences, listState, markDone, nextDue, normalizeHouse, taskStatus, toggleCheck, undoDone, updateTask, zoneOverview } from "../js/house/house.js";
import { MemoryAdapter } from "../js/data/storage/adapters.js";
import { Repository } from "../js/data/repository.js";

const TODAY = "2026-11-02";
const task = (house, key) => house.tasks.find((t) => t.key === key);

test("Maison : listes de départ, intérieur et extérieur séparés", () => {
  const h = emptyHouse();
  assert.ok(h.tasks.length > 30);
  assert.ok(h.tasks.some((t) => t.zone === "inside") && h.tasks.some((t) => t.zone === "outside"));
  assert.equal(task(h, "ro-6").title.includes("reminéralisation"), true);
  assert.equal(h.tasks.some((t) => /échangeur/i.test(t.title)), false); // pas d'échangeur d'air
  assert.deepEqual(normalizeHouse(JSON.parse(JSON.stringify(h))), h); // relu tel quel
  assert.equal(normalizeHouse(undefined).tasks.length, h.tasks.length); // anciennes données : listes de départ
});

test("Maison : prochaine date (aux N mois, ou dates de saison)", () => {
  let h = emptyHouse();
  // Aux N mois, jamais fait : on attend la dernière fois
  assert.equal(nextDue(task(h, "fridge-water"), TODAY), null);
  assert.equal(taskStatus(task(h, "fridge-water"), TODAY).status, "unknown");
  h = markDone(h, "fridge-water", "2026-06-10");
  assert.equal(nextDue(task(h, "fridge-water"), TODAY), "2026-12-10");
  assert.equal(taskStatus(task(h, "fridge-water"), TODAY).status, "later");
  // Saison jamais faite : la date passée de moins de 45 jours est en retard
  assert.equal(nextDue(task(h, "heating-on"), TODAY), "2026-10-01");
  assert.equal(taskStatus(task(h, "heating-on"), TODAY).status, "overdue");
  // Faite un peu après sa date : la prochaine est l'an prochain
  h = markDone(h, "heating-on", "2026-10-04");
  assert.equal(nextDue(task(h, "heating-on"), TODAY), "2027-10-01");
  // Deux dates par année (gouttières : printemps et automne)
  assert.equal(nextDue(task(h, "gutters"), TODAY), "2026-11-05");
  h = markDone(h, "gutters", "2026-11-03");
  assert.equal(nextDue(task(h, "gutters"), TODAY), "2027-05-15");
  // Annuler la dernière fois
  h = undoDone(h, "gutters");
  assert.equal(task(h, "gutters").lastDone, null);
});

test("Maison : regroupement, rappels et calendrier", () => {
  let h = markDone(emptyHouse(), "softener-soap", "2026-10-05");
  const inside = zoneOverview(h, "inside", TODAY);
  assert.ok(inside.soon.some((x) => x.task.key === "softener-soap")); // 5 octobre + 1 mois = 5 novembre : bientôt
  assert.ok(inside.overdue.some((x) => x.task.key === "heating-on")); // 1er octobre, pas encore fait
  const soap = taskStatus(task(h, "softener-soap"), TODAY);
  assert.equal(soap.next, "2026-11-05");
  assert.ok(dueSoon(h, TODAY, 7).some((x) => x.task.key === "softener-soap"));
  const occ = houseOccurrences(h, "2026-10-01", "2027-01-31", TODAY).filter((o) => o.data.house.taskId === "softener-soap");
  assert.deepEqual(occ.map((o) => [o.date, o.done]), [["2026-10-05", true], ["2026-11-05", false], ["2026-12-05", false], ["2027-01-05", false]]);
  assert.equal(occ[0].module, "maison");
  // Modifier la fréquence, ajouter un entretien
  h = updateTask(h, "softener-soap", { schedule: { kind: "every", months: 2 } });
  assert.equal(nextDue(task(h, "softener-soap"), TODAY), "2026-12-05");
  const added = addTask(h, { title: "Tondre", zone: "outside", schedule: { kind: "dates", dates: ["06-01"] } });
  assert.equal(added.task.zone, "outside");
  assert.equal(addTask(h, { title: "Sans fréquence", schedule: { kind: "dates", dates: [] } }).task, null);
});

test("Maison : listes à cocher, remises à zéro chaque année", () => {
  let h = emptyHouse();
  h = toggleCheck(h, "winter", "winter-1", TODAY);
  assert.deepEqual(listState(h, "winter", TODAY), { "winter-1": true });
  assert.deepEqual(listState(h, "winter", "2027-10-10"), {});
});

test("Maison : les rappels s'ajoutent au calendrier du dépôt", async () => {
  const repo = new Repository(new MemoryAdapter(), { clock: () => new Date(2026, 10, 2, 12) });
  await repo.init();
  await repo.updateHouse(markDone(repo.house(), "fridge-air", "2026-05-02"));
  assert.ok(repo.onDate("2026-11-02").some((i) => i.id === "house:fridge-air:2026-11-02"));
});

test("Maison : tout l'historique est gardé", () => {
  let h = emptyHouse();
  for (let m = 0; m < 40; m++) h = markDone(h, "softener-soap", `20${24 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-05`);
  assert.equal(task(h, "softener-soap").history.length, 40);
  assert.equal(normalizeHouse(JSON.parse(JSON.stringify(h))).tasks.find((t) => t.key === "softener-soap").history.length, 40);
});
