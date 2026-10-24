import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addToList, clearDone, comparePrices, createPrice, isStale, knownProducts, nextFlyerEnd, normalizeGrocery,
  parseAmount, planList, priceBook, productKey, toggleListEntry, unitPrice,
} from "../js/grocery/grocery.js";
import { migrate, SCHEMA_VERSION } from "../js/data/migrations.js";
import { Repository } from "../js/data/repository.js";
import { MemoryAdapter } from "../js/data/storage/adapters.js";

const today = "2026-10-24"; // un samedi
const price = (o) => createPrice({ unit: "kg", qty: 1, ...o }, o.date ?? today);

test("même produit malgré les accents, la casse et la ponctuation", () => {
  assert.equal(productKey("Bœuf  haché, Mi-maigre"), productKey("boeuf hache mi maigre"));
  assert.equal(productKey("Steak haché mi-maigre"), productKey("Bœuf haché mi-maigre"));
  assert.equal(productKey("Poitrines de poulet"), productKey("poitrine de poulet"));
  assert.notEqual(productKey("Bœuf haché maigre"), productKey("Bœuf haché mi-maigre"));
  assert.notEqual(productKey("우유"), productKey("버터"), "coréen");
  assert.equal(productKey("Đậu hộp"), "đau hop", "vietnamien");
  assert.equal(parseAmount("4,99"), 4.99);
  assert.equal(parseAmount("0"), null);
  assert.equal(parseAmount("abc"), null);
});

test("prix unitaire : au kilo, au litre, à l'unité", () => {
  const lb = unitPrice(price({ product: "x", store: "maxi", price: "4,99", qty: 1, unit: "lb" }));
  assert.equal(lb.dim, "mass");
  assert.ok(Math.abs(lb.value - 11.0) < 0.01, `${lb.value} $/kg`);
  const g = unitPrice(price({ product: "x", store: "maxi", price: 3.49, qty: 450, unit: "g" }));
  assert.ok(Math.abs(g.value - 7.756) < 0.01);
  const ml = unitPrice(price({ product: "lait", store: "iga", price: 2.5, qty: 500, unit: "ml" }));
  assert.deepEqual([ml.dim, ml.value], ["volume", 5]);
  const u = unitPrice(price({ product: "avocat", store: "iga", price: 5, qty: 2, unit: "unit" }));
  assert.deepEqual([u.dim, u.value], ["count", 2.5]);
});

test("comparaison : le moins cher au kilo, un prix par épicerie, rabais terminés exclus", () => {
  const prices = [
    price({ product: "Bœuf haché mi-maigre", store: "maxi", price: 4.99, qty: 1, unit: "lb" }), // 11,00 $/kg
    price({ product: "boeuf hache mi-maigre", store: "superc", price: 9.9, qty: 1, unit: "kg" }), // 9,90 $/kg
    price({ product: "Boeuf haché mi-maigre", store: "superc", price: 12, qty: 1, unit: "kg" }), // plus cher, ignoré
    price({ product: "Boeuf haché mi-maigre", store: "iga", price: 3.99, qty: 1, unit: "lb", deal: true, until: "2026-10-22" }), // terminé
    price({ product: "Boeuf haché mi-maigre", store: "metro", price: 8, qty: 1, unit: "unit" }), // pas comparable au poids
  ];
  const { dim, rows } = comparePrices(prices, productKey("boeuf hache mi maigre"), { today });
  assert.equal(dim, "mass");
  assert.deepEqual(rows.map((r) => r.store), ["superc", "maxi"]);
  assert.equal(rows[0].price, 9.9);
  const onlyMaxi = comparePrices(prices, productKey("boeuf hache mi maigre"), { stores: ["maxi", "iga"], today });
  assert.deepEqual(onlyMaxi.rows.map((r) => r.store), ["maxi"]);
});

test("liste regroupée par épicerie la moins chère, produits sans prix à part", () => {
  let list = addToList([], "Bœuf haché mi-maigre", "2 lb");
  list = addToList(list, "boeuf hache mi-maigre"); // déjà là : ignoré
  list = addToList(list, "Lait 2 %");
  list = addToList(list, "Safran");
  list = addToList(list, "  ");
  assert.equal(list.length, 3);
  const grocery = normalizeGrocery({
    list,
    prices: [
      price({ product: "Boeuf haché mi-maigre", store: "superc", price: 9.9 }),
      price({ product: "Boeuf haché mi-maigre", store: "maxi", price: 11 }),
      price({ product: "Lait 2 %", store: "maxi", price: 5.49, qty: 2, unit: "L" }),
      price({ product: "Lait 2 %", store: "iga", price: 6.29, qty: 2, unit: "L" }),
    ],
  });
  const plan = planList(grocery, today);
  assert.deepEqual(plan.groups.map((g) => [g.store, g.entries.map((e) => e.entry.product)]), [
    ["maxi", ["Lait 2 %"]],
    ["superc", ["Bœuf haché mi-maigre"]],
  ]);
  assert.equal(plan.groups[1].entries[0].next.store, "maxi");
  assert.deepEqual(plan.unknown.map((u) => u.entry.product), ["Safran"]);
  // Cocher puis retirer les articles cochés
  const done = toggleListEntry(grocery.list, grocery.list[0].id);
  assert.equal(clearDone(done).length, 2);
  assert.deepEqual(knownProducts(grocery), ["Bœuf haché mi-maigre", "Lait 2 %", "Safran"]);
  assert.equal(priceBook(grocery, today).length, 2);
});

test("circulaire : se termine le mercredi qui vient ; prix régulier ancien signalé", () => {
  assert.equal(nextFlyerEnd("2026-10-24"), "2026-10-28"); // samedi -> mercredi
  assert.equal(nextFlyerEnd("2026-10-28"), "2026-10-28"); // mercredi
  assert.equal(nextFlyerEnd("2026-10-29"), "2026-11-04"); // jeudi -> mercredi suivant
  const old = price({ product: "x", store: "maxi", price: 1, date: "2026-07-01" });
  assert.equal(isStale(old, today), true);
  assert.equal(isStale(price({ product: "x", store: "maxi", price: 1 }), today), false);
});

test("migration v2 -> v3 : section épicerie vide, données gardées ; dépôt", async () => {
  const doc = migrate({ schemaVersion: 2, items: [], settings: { language: "fr" } });
  assert.equal(doc.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(doc.grocery.list, []);
  assert.equal(doc.grocery.stores.length, 9);
  const repo = new Repository(new MemoryAdapter(null));
  await repo.init();
  await repo.updateGrocery({ list: addToList([], "Pain") });
  assert.equal(repo.grocery().list[0].product, "Pain");
  assert.match(repo.exportJSON(), /"Pain"/);
  // Une donnée invalide est écartée plutôt que de bloquer l'application.
  const cleaned = normalizeGrocery({ prices: [{ product: "x", price: -1, qty: 1, unit: "kg" }, { product: "y", price: 1, qty: 1, unit: "boîte" }], stores: ["maxi", "inconnue"] });
  assert.deepEqual([cleaned.prices.length, cleaned.stores], [0, ["maxi"]]);
});

import { addCustomItem, isListed, removeCustomItem, toggleListed } from "../js/grocery/grocery.js";
import { CATALOG_LANGS, RAW_CATALOG, catalog } from "../js/grocery/catalog.js";

test("liste personnalisée : cocher ajoute à la liste, décocher retire", () => {
  let list = toggleListed([], "Lait");
  assert.equal(isListed(list, "lait"), true);
  list = toggleListed(list, "Pommes de terre");
  assert.equal(list.length, 2);
  list = toggleListed(list, "LAIT");
  assert.deepEqual(list.map((e) => e.product), ["Pommes de terre"]);
  // Un article déjà pris au magasin ne compte plus comme coché, et n'est pas effacé.
  list = list.map((e) => ({ ...e, done: true }));
  assert.equal(isListed(list, "Pommes de terre"), false);
  list = toggleListed(list, "Pommes de terre");
  assert.equal(list.length, 2);
});

test("articles personnalisés : ajout sans doublon, retrait", () => {
  let custom = addCustomItem([], "  Kombucha ", "drinks");
  custom = addCustomItem(custom, "kombucha", "drinks");
  custom = addCustomItem(custom, "", "drinks");
  assert.deepEqual(custom.map((c) => c.name), ["Kombucha"]);
  assert.equal(removeCustomItem(custom, custom[0].id).length, 0);
  assert.deepEqual(normalizeGrocery({ custom: [{ name: "x", category: "drinks" }, { name: " ", category: "drinks" }] }).custom.length, 1);
});

test("catalogue : chaque article a ses 7 langues, sans doublon dans une langue", () => {
  for (const c of RAW_CATALOG) {
    assert.equal(c.name.length, CATALOG_LANGS.length, c.id);
    for (const item of c.items) assert.equal(item.length, CATALOG_LANGS.length, item[0]);
  }
  for (const lang of CATALOG_LANGS) {
    const keys = catalog(lang).flatMap((c) => c.items).map(productKey);
    assert.equal(new Set(keys).size, keys.length, `doublon en ${lang}`);
  }
  const total = RAW_CATALOG.reduce((n, c) => n + c.items.length, 0);
  assert.ok(total >= 300, `${total} articles`);
  // Triés par ordre alphabétique de la langue, accents compris.
  const veg = catalog("fr").find((c) => c.id === "vegetables").items;
  assert.ok(veg.indexOf("Échalotes") > veg.indexOf("Courgettes") && veg.indexOf("Échalotes") < veg.indexOf("Épinards"));
  for (const c of catalog("fr")) assert.deepEqual(c.items, [...c.items].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })), c.id);
  assert.equal(catalog("xx")[0].items[0], "Abricots", "langue inconnue : français");
  assert.ok(catalog("fr").find((c) => c.id === "herbs").items.includes("Persil"));
});

import { fromChecklist, looksLikeGroceryList, toChecklist } from "../js/grocery/grocery.js";

test("liste du calendrier : reflet de la liste d'épicerie, dans les deux sens", () => {
  let list = addToList(addToList([], "Lait"), "Bœuf haché", "2 lb");
  const checklist = toChecklist(list);
  assert.deepEqual(checklist.map((c) => c.text), ["Lait", "Bœuf haché (2 lb)"]);
  assert.equal(checklist[0].id, list[0].id);
  // Coché au magasin, un article retiré, un autre ajouté dans le calendrier.
  const edited = [{ ...checklist[1], done: true }, { id: "n1", text: "Persil", done: false }];
  list = fromChecklist(list, edited);
  assert.deepEqual(list.map((e) => [e.product, e.qty, e.done]), [["Bœuf haché", "2 lb", true], ["Persil", "", false]]);
  assert.equal(list[1].key, productKey("persil"));
  // Renommé dans le calendrier.
  list = fromChecklist(list, [{ id: list[0].id, text: "Steak haché", done: false }]);
  assert.deepEqual([list[0].product, list[0].key], ["Steak haché", productKey("Bœuf haché")]);
});

test("ancienne commission « Liste d'épicerie » reconnue", () => {
  const names = ["Liste d'épicerie", "Épicerie"];
  const item = (o) => ({ module: "commission", recurrence: null, done: false, title: "Liste d’épicerie", ...o });
  assert.equal(looksLikeGroceryList(item({}), names), true, "apostrophe typographique");
  assert.equal(looksLikeGroceryList(item({ title: "epicerie" }), names), true);
  assert.equal(looksLikeGroceryList(item({ title: "Quincaillerie" }), names), false);
  assert.equal(looksLikeGroceryList(item({ done: true }), names), false);
  assert.equal(looksLikeGroceryList(item({ module: "rdv" }), names), false);
});
