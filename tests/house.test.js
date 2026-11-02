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

test("Maison : fournitures, achats et réserve", async () => {
  const { addSupplyPurchase, removeSupplyPurchase, supplyOverview, taskSupplies, updateSupply, housePhotoIds } = await import("../js/house/house.js");
  let h = emptyHouse();
  const salt = () => h.supplies.find((s) => s.key === "salt");
  assert.deepEqual(taskSupplies(h, "softener-salt").map((s) => s.key), ["salt"]);
  assert.equal(salt().stock, null); // pas suivi au départ
  // Un achat : historique + réserve
  h = addSupplyPurchase(h, salt().id, { date: "2026-10-12", qty: 4, price: 35.96, store: "Magasin Test" });
  assert.equal(salt().stock, 4);
  assert.equal(salt().store, "Magasin Test");
  assert.equal(salt().purchases.length, 1);
  // « Fait » : la réserve baisse de la quantité par remplacement (2 sacs) ; annuler la remet
  h = markDone(h, "softener-salt", "2026-11-02", { consume: true });
  assert.equal(salt().stock, 2);
  h = markDone(h, "softener-salt", "2026-11-02", { consume: true }); // même date : pas deux fois
  assert.equal(salt().stock, 2);
  h = undoDone(h, "softener-salt");
  assert.equal(salt().stock, 4);
  h = markDone(h, "softener-salt", "2026-11-02", { consume: true });
  h = markDone(h, "softener-salt", "2026-11-03", { consume: true });
  assert.equal(salt().stock, 0);
  assert.equal(supplyOverview(h, TODAY).find((x) => x.supply.key === "salt").status, "buy");
  // Supprimer un achat le retire de la réserve (sans passer sous 0)
  h = removeSupplyPurchase(h, salt().id, salt().purchases[0].id);
  assert.equal(salt().purchases.length, 0);
  assert.equal(salt().stock, 0);
  // Modifier la fiche, photos gardées dans le stockage
  h = updateSupply(h, salt().id, { model: "TEST-123", photos: ["photo-1"], url: "javascript:alert(1)" });
  assert.equal(salt().model, "TEST-123");
  assert.equal(salt().url, "");
  assert.deepEqual(housePhotoIds(h), ["photo-1"]);
  // Anciennes données (sans fournitures) : celles de départ
  const old = JSON.parse(JSON.stringify(emptyHouse()));
  delete old.supplies;
  assert.equal(normalizeHouse(old).supplies.length, emptyHouse().supplies.length);
});

test("Maison : procédure pas à pas (illustrations, note, photos et vidéos)", async () => {
  const { addStepMedia, removeStepMedia, setStepNote, housePhotoIds } = await import("../js/house/house.js");
  const { FIGURES } = await import("../js/house/figures.js");
  let h = emptyHouse();
  const close = () => h.lists.find((l) => l.id === "pool-close");
  // Chaque étape de la piscine a son illustration générale
  for (const l of h.lists.filter((x) => x.id.startsWith("pool-"))) for (const e of l.entries) assert.ok(FIGURES[e.figure], e.id);
  h = setStepNote(h, "pool-close", "pool-close-7", "  Bouchon bleu à gauche de la pompe ");
  h = addStepMedia(h, "pool-close", "pool-close-7", { id: "f1", type: "image" });
  h = addStepMedia(h, "pool-close", "pool-close-7", { id: "f2", type: "video" });
  h = addStepMedia(h, "pool-close", "pool-close-7", { id: "f3", type: "pdf" }); // refusé
  const step = close().entries[6];
  assert.equal(step.note, "Bouchon bleu à gauche de la pompe");
  assert.deepEqual(step.media.map((m) => m.type), ["image", "video"]);
  assert.ok(housePhotoIds(h).includes("f2")); // gardé lors du ménage des fichiers
  h = removeStepMedia(h, "pool-close", "pool-close-7", "f1");
  assert.deepEqual(close().entries[6].media.map((m) => m.id), ["f2"]);
  // Relu tel quel ; anciennes listes (sans illustration) : l'illustration de départ est ajoutée
  assert.deepEqual(normalizeHouse(JSON.parse(JSON.stringify(h))).lists, h.lists);
  const old = JSON.parse(JSON.stringify(emptyHouse()));
  for (const l of old.lists) for (const e of l.entries) { delete e.figure; delete e.media; delete e.note; }
  assert.equal(normalizeHouse(old).lists.find((l) => l.id === "pool-open").entries[0].figure, "uncover");
});
