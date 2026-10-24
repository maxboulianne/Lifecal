// Épicerie : carnet de prix, prix unitaires, comparaison entre épiceries et
// liste d'épicerie regroupée par épicerie la moins chère.
//
// Rangé dans doc.grocery :
//   stores  ["maxi", "superc", …]   épiceries comparées
//   prices  [{ id, product, key, store, price, qty, unit, deal, until, date }]
//             « price $ pour qty unit » (ex. 4,99 $ pour 1 lb, 3,49 $ pour 450 g)
//             until : dernier jour du rabais (AAAA-MM-JJ) ; null = prix régulier
//   list    [{ id, product, key, qty, done }]
//   custom  [{ id, name, category }]   articles ajoutés au catalogue (liste personnalisée)
// Fonctions pures : elles retournent toujours de nouvelles valeurs.

import { addDays, diffDays, parseISODate, toISODate } from "../core/dates.js";
import { newId } from "../data/item.js";
import { ALL_STORE_IDS } from "./stores.js";

// Facteur vers l'unité de comparaison : kg, L ou unité.
export const UNITS = {
  g: { dim: "mass", factor: 0.001 },
  kg: { dim: "mass", factor: 1 },
  lb: { dim: "mass", factor: 0.45359237 },
  ml: { dim: "volume", factor: 0.001 },
  L: { dim: "volume", factor: 1 },
  unit: { dim: "count", factor: 1 },
};
export const UNIT_IDS = Object.keys(UNITS);
export const KG_PER_LB = 0.45359237;
const DIM_ORDER = ["mass", "volume", "count"];
export const STALE_DAYS = 60;

export function emptyGrocery() {
  return { stores: [...ALL_STORE_IDS], prices: [], list: [], custom: [] };
}

export function normalizeGrocery(raw) {
  const g = raw && typeof raw === "object" ? raw : {};
  return {
    stores: Array.isArray(g.stores) ? g.stores.filter((s) => ALL_STORE_IDS.includes(s)) : [...ALL_STORE_IDS],
    prices: Array.isArray(g.prices) ? g.prices.map(normalizePrice).filter(Boolean) : [],
    list: Array.isArray(g.list) ? g.list.filter((e) => e && e.product).map((e) => ({ id: e.id ?? newId(), product: String(e.product), key: productKey(e.product), qty: String(e.qty ?? ""), done: Boolean(e.done) })) : [],
    custom: Array.isArray(g.custom)
      ? g.custom.filter((c) => c && String(c.name ?? "").trim() && c.category).map((c) => ({ id: c.id ?? newId(), name: String(c.name).trim(), category: String(c.category) }))
      : [],
  };
}

// Noms différents pour le même produit (après retrait des accents).
// Ajouter une paire ici rend les deux noms comparables.
const SYNONYMS = [
  [/\bsteak hache\b/g, "boeuf hache"],
  [/\bviande hachee de boeuf\b/g, "boeuf hache"],
  [/\bpoitrines? de poulet\b/g, "poitrine de poulet"],
  [/\bpommes de terre\b/g, "patates"],
  [/\bpatate\b/g, "patates"],
];

// « Bœuf  haché, mi-maigre », « boeuf hache mi maigre » et « Steak haché
// mi-maigre » sont le même produit.
export function productKey(name) {
  return SYNONYMS.reduce((key, [pattern, replacement]) => key.replace(pattern, replacement), baseKey(name));
}

function baseKey(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/œ/g, "oe").replace(/æ/g, "ae") // ligatures : pas décomposées par NFD
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, " ") // lettres de toutes les langues (coréen, vietnamien…)
    .trim();
}

// Accepte « 4,99 » comme « 4.99 ».
export const parseAmount = (value) => {
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function normalizePrice(p) {
  if (!p || !p.product || !UNITS[p.unit]) return null;
  const price = Number(p.price);
  const qty = Number(p.qty);
  if (!(price > 0) || !(qty > 0)) return null;
  return {
    id: p.id ?? newId(),
    product: String(p.product).trim(),
    key: productKey(p.product),
    store: String(p.store),
    price,
    qty,
    unit: p.unit,
    deal: Boolean(p.deal),
    until: typeof p.until === "string" ? p.until : null,
    date: typeof p.date === "string" ? p.date : null,
  };
}

export function createPrice({ product, store, price, qty, unit, deal = false, until = null }, today) {
  return normalizePrice({ product, store, price: parseAmount(price), qty: parseAmount(qty), unit, deal, until: deal ? until : null, date: today });
}

// Prix pour 1 kg, 1 L ou 1 unité.
export function unitPrice(p) {
  const u = UNITS[p.unit];
  return { value: p.price / (p.qty * u.factor), dim: u.dim };
}

// Un rabais terminé ne compte plus ; un prix régulier reste valable (mais
// il est signalé comme ancien après STALE_DAYS jours).
export const isExpired = (p, today) => Boolean(p.until && p.until < today);
export const isStale = (p, today) => !p.until && Boolean(p.date) && diffDays(p.date, today) > STALE_DAYS;

// Dernier jour d'une circulaire : la plupart changent le jeudi, donc
// le mercredi qui vient (ou aujourd'hui si on est mercredi).
export function nextFlyerEnd(today) {
  const d = parseISODate(today);
  return toISODate(addDays(d, (3 - d.getDay() + 7) % 7));
}

// Tous les prix valables d'un produit, du moins cher au plus cher (prix
// unitaire), dans la mesure la plus courante pour ce produit (poids, volume
// ou nombre : on ne compare pas des kilos avec des unités). Un seul prix
// par épicerie : le meilleur.
export function comparePrices(prices, key, { stores = ALL_STORE_IDS, today }) {
  const valid = prices
    .filter((p) => p.key === key && stores.includes(p.store) && !isExpired(p, today))
    .map((p) => ({ ...p, per: unitPrice(p) }));
  if (!valid.length) return { dim: null, rows: [] };
  const counts = Object.fromEntries(DIM_ORDER.map((d) => [d, valid.filter((p) => p.per.dim === d).length]));
  const dim = DIM_ORDER.reduce((best, d) => (counts[d] > counts[best] ? d : best), DIM_ORDER.find((d) => counts[d]));
  const bestByStore = new Map();
  for (const p of valid.filter((v) => v.per.dim === dim)) {
    const cur = bestByStore.get(p.store);
    if (!cur || p.per.value < cur.per.value) bestByStore.set(p.store, p);
  }
  const rows = [...bestByStore.values()].sort((a, b) => a.per.value - b.per.value);
  return { dim, rows };
}

// La liste d'épicerie regroupée par épicerie la moins chère.
// -> { groups: [{ store, entries: [{ entry, best, next, rows }] }], unknown: [entries] }
export function planList(grocery, today) {
  const groups = new Map();
  const unknown = [];
  for (const entry of grocery.list) {
    const { rows } = comparePrices(grocery.prices, entry.key, { stores: grocery.stores, today });
    if (!rows.length) {
      unknown.push({ entry, best: null, next: null, rows });
      continue;
    }
    const line = { entry, best: rows[0], next: rows[1] ?? null, rows };
    if (!groups.has(rows[0].store)) groups.set(rows[0].store, []);
    groups.get(rows[0].store).push(line);
  }
  const order = grocery.stores;
  return {
    groups: [...groups.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([store, entries]) => ({ store, entries })),
    unknown,
  };
}

// ---- Modifications de la liste -------------------------------------------------

export function addToList(list, product, qty = "") {
  const name = String(product ?? "").trim();
  if (!name) return list;
  const key = productKey(name);
  if (list.some((e) => e.key === key && !e.done)) return list;
  return [...list, { id: newId(), product: name, key, qty: String(qty ?? "").trim(), done: false }];
}

export const toggleListEntry = (list, id) => list.map((e) => (e.id === id ? { ...e, done: !e.done } : e));
export const removeListEntry = (list, id) => list.filter((e) => e.id !== id);
export const clearDone = (list) => list.filter((e) => !e.done);

// ---- Liste personnalisée (catalogue à cocher) -------------------------------------

// Un article du catalogue est « coché » s'il est dans la liste et pas encore pris.
export const isListed = (list, name) => list.some((e) => e.key === productKey(name) && !e.done);

// Cocher l'ajoute à la liste d'épicerie ; décocher l'en retire.
export function toggleListed(list, name) {
  const key = productKey(name);
  return isListed(list, name) ? list.filter((e) => !(e.key === key && !e.done)) : addToList(list, name);
}

export function addCustomItem(custom, name, category) {
  const clean = String(name ?? "").trim();
  if (!clean || custom.some((c) => c.category === category && productKey(c.name) === productKey(clean))) return custom;
  return [...custom, { id: newId(), name: clean, category }];
}

export const removeCustomItem = (custom, id) => custom.filter((c) => c.id !== id);

// ---- Lien avec le calendrier ---------------------------------------------------------
//
// La liste d'épicerie apparaît dans le calendrier comme une commission
// « Liste d'épicerie » (item.data.grocery = true). Sa liste à cocher est le
// reflet de grocery.list : mêmes identifiants, même état « pris ».

const entryText = (e) => (e.qty ? `${e.product} (${e.qty})` : e.product);

// grocery.list -> liste à cocher de la commission du calendrier.
export const toChecklist = (list) => list.map((e) => ({ id: e.id, text: entryText(e), done: e.done }));

// Liste à cocher modifiée dans le calendrier -> nouvelle grocery.list.
// Cochée, retirée, ajoutée ou renommée là-bas : pareil ici.
export function fromChecklist(list, checklist) {
  const byId = new Map(list.map((e) => [e.id, e]));
  return checklist.map((c) => {
    const e = byId.get(c.id);
    if (e && entryText(e) === c.text) return { ...e, done: Boolean(c.done) };
    return { id: c.id, product: c.text, key: productKey(c.text), qty: "", done: Boolean(c.done) };
  });
}

// Une ancienne commission du calendrier qui sert déjà de liste d'épicerie
// (ex. « Liste d'épicerie », « Épicerie ») : on la reprend au lieu d'en créer une 2e.
export function looksLikeGroceryList(item, names) {
  const keys = names.map(productKey);
  return item.module === "commission" && !item.recurrence && !item.done && keys.includes(productKey(item.title));
}

// Noms de produits connus (pour proposer des suggestions en tapant).
export function knownProducts(grocery) {
  const names = new Map();
  for (const p of [...grocery.list, ...grocery.prices]) if (!names.has(p.key)) names.set(p.key, p.product);
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

// Produits du carnet, avec leurs prix comparés (pour la recherche « où est-ce le moins cher »).
export function priceBook(grocery, today) {
  const keys = [...new Set(grocery.prices.map((p) => p.key))];
  return keys
    .map((key) => {
      const all = grocery.prices.filter((p) => p.key === key);
      return { key, product: all.at(-1).product, ...comparePrices(grocery.prices, key, { stores: grocery.stores, today }), all };
    })
    .sort((a, b) => a.product.localeCompare(b.product));
}
