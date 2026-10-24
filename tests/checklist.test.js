import { test } from "node:test";
import assert from "node:assert/strict";
import { addEntry, fromLines, getChecklist, pending, progress, removeEntry, toLines, toggleEntry } from "../js/data/checklist.js";
import { normalizeItem } from "../js/data/item.js";
import { nearbyErrands } from "../js/triggers/proximity-triggers.js";
import { MemoryAdapter } from "../js/data/storage/adapters.js";
import { Repository } from "../js/data/repository.js";

test("ajouter, cocher, retirer", () => {
  let list = addEntry([], "  Lait ");
  list = addEntry(list, "Pain");
  list = addEntry(list, "   "); // ignoré
  assert.deepEqual(list.map((e) => e.text), ["Lait", "Pain"]);
  list = toggleEntry(list, list[0].id);
  assert.deepEqual(progress(list), { done: 1, total: 2, complete: false });
  assert.deepEqual(pending(list).map((e) => e.text), ["Pain"]);
  list = toggleEntry(list, list[1].id);
  assert.equal(progress(list).complete, true);
  list = removeEntry(list, list[0].id);
  assert.deepEqual(list.map((e) => e.text), ["Pain"]);
  assert.equal(progress([]).complete, false);
});

test("formulaire : une ligne par article, l'état coché est conservé", () => {
  const initial = fromLines("Lait\nPain");
  const checked = toggleEntry(initial, initial[0].id); // Lait coché
  const after = fromLines("- lait\n\n• Œufs\nPain", checked);
  assert.deepEqual(after.map((e) => [e.text, e.done]), [["lait", true], ["Œufs", false], ["Pain", false]]);
  assert.equal(after[0].id, checked[0].id); // même article, même identifiant
  assert.equal(toLines(after), "lait\nŒufs\nPain");
});

test("la liste est enregistrée avec l'élément", async () => {
  const repo = new Repository(new MemoryAdapter());
  await repo.init();
  const item = await repo.add({ title: "Épicerie", module: "commission", date: "2026-10-24", data: { checklist: fromLines("Lait\nPain") } });
  await repo.update(item.id, { data: { ...item.data, checklist: toggleEntry(getChecklist(item), getChecklist(item)[0].id) } });
  assert.deepEqual(progress(getChecklist(repo.get(item.id))), { done: 1, total: 2, complete: false });
});

test("proximité : la liste montre les articles qui restent", () => {
  const iga = { lat: 45.57, lng: -73.75 };
  const list = fromLines("Lait\nPain\nŒufs");
  const withList = normalizeItem({ id: "a", title: "Épicerie", module: "commission", date: "2026-10-24", place: "IGA", ...iga,
    data: { checklist: toggleEntry(list, list[0].id) } }); // Lait déjà acheté
  const plain = normalizeItem({ id: "b", title: "Timbres", module: "commission", date: "2026-10-24", place: "IGA", ...iga });
  const [n] = nearbyErrands.evaluate({ items: [withList, plain], today: "2026-10-24", position: iga, settings: {} });
  assert.equal(n.params.list, "Pain, Œufs et Timbres");
});
