// Budget personnel : revenus, dépenses par catégorie et épargne, prévu et réel, mois par mois.
//
// Rangé dans le document : budget = { categories, entries, rules, imported }
//   catégorie : { id, key (catégorie de départ, nom traduit à l'affichage) | name, group, planned, icon }
//               group : income (revenus) | fixed (dépenses fixes) | variable (dépenses courantes) |
//                       savings (épargne et placements) | transfer (virements et paiements de carte :
//                       ni revenu ni dépense, pour ne pas compter deux fois)
//   opération : { id, date, amount, categoryId (null = à classer), description, source, account, seq, merchant }
//               amount : positif = sortie d'argent, négatif = entrée (dépôt, remboursement)
//               source : manual (ajoutée à la main) | import (relevé Desjardins)
//   rules     : { [commerce]: categoryId }  les choix retenus, proposés aux relevés suivants
//
// Le réel d'un mois : les opérations (importées ou ajoutées à la main) ; si aucun relevé n'a été
// importé pour ce mois, les paiements notés « payés » dans la page Paiements les remplacent
// (sinon ils seraient comptés deux fois : ils sont déjà dans le relevé).

import { newId } from "../data/item.js";
import { merchantKey } from "../timesheet/purchases.js";
import { paymentLabel } from "../payments/payments.js";

export const GROUPS = ["income", "fixed", "variable", "savings", "transfer"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v) => String(v ?? "").trim();
const r2 = (n) => Math.round(n * 100) / 100;
export function parseMoney(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[\s  $]/g, "").replace(",", "."));
  return Number.isFinite(n) ? r2(n) : null;
}

// Catégories de départ : [clé, groupe, icône]
export const DEFAULT_CATEGORIES = [
  ["salary", "income", "💵"], ["otherIncome", "income", "➕"],
  ["housing", "fixed", "🏡"], ["electricity", "fixed", "💡"], ["phone", "fixed", "📱"], ["insurance", "fixed", "🛡️"],
  ["car", "fixed", "🚗"], ["subscriptions", "fixed", "📺"],
  ["groceries", "variable", "🛒"], ["restaurants", "variable", "🍽️"], ["fuel", "variable", "⛽"], ["health", "variable", "💊"],
  ["shopping", "variable", "🛍️"], ["home", "variable", "🔨"], ["leisure", "variable", "🎟️"], ["travel", "variable", "✈️"],
  ["gifts", "variable", "🎁"], ["cash", "variable", "🏧"], ["cardPurchases", "variable", "💳"], ["misc", "variable", "📦"],
  ["savings", "savings", "📈"],
  ["transfers", "transfer", "🔁"],
];
const catId = (key) => `c-${key}`;

// Mots-clés des relevés -> catégorie de départ (le choix retenu pour un commerce passe avant)
const KEYWORDS = [
  ["transfers", /^PAIEMENT (AUTORIS|CAISSE)|PAIEMENT \/VISA|\/VISA|ACC[ÈE]SD INTERNET \/VISA|TRANSFERT|VIREMENT ENTRE|VIR(EMENT)? INTERAC .*(DE|À) .*COMPTE|MASTERCARD|CARTE DE CR[ÉE]DIT|REMBOURSEMENT DE PR[ÊE]T/i],
  ["salary", /\bPAIE\b|SALAIRE|PAYROLL|D[ÉE]P[ÔO]T DIRECT/i],
  ["cash", /RETRAIT|GAB|GUICHET|\bATM\b/i],
  ["electricity", /HYDRO.?QU[ÉE]BEC|HYDRO QUEBEC|[ÉE]NERGIR/i],
  ["phone", /\bBELL\b|VIRGIN|VID[ÉE]OTRON|\bFIDO\b|ROGERS|TELUS|KOODO|\bFIZZ\b|FREEDOM MOBILE|PUBLIC MOBILE|COGECO|EBOX/i],
  ["insurance", /ASSURANCE|INSURANCE|INTACT|BELAIR|LA CAPITALE|BENEVA|SSQ|CROIX ?BLEUE|BLUE ?CROSS/i],
  ["housing", /LOYER|HYPOTH[ÈE]QUE|PROPRI[ÉE]TAIRE|TAXES? MUNICIPALE|TAXE SCOLAIRE|CONDO/i],
  ["car", /PAIEMENT D'AUTOMOBILE|FORD CREDIT|GM FINANCIAL|TOYOTA CREDIT|HONDA FINANCE|HYUNDAI|KIA FIN|S\.?A\.?A\.?Q|GARAGE|PNEU|CARROSSERIE|STATIONNEMENT|PARKING/i],
  ["subscriptions", /NETFLIX|SPOTIFY|DISNEY|CRAVE|YOUTUBE|APPLE\.COM|ITUNES|GOOGLE ?\*|PRIME VIDEO|AMAZON PRIME|AUDIBLE|ICLOUD|MICROSOFT\*|PATREON/i],
  ["groceries", /\bIGA\b|METRO|\bMAXI\b|PROVIGO|SUPER ?C\b|COSTCO|WAL.?MART|ADONIS|LOBLAWS|AVRIL|RACHELLE|FRUITERIE|BOUCHERIE|[ÉE]PICERIE|MARCH[ÉE] |\bPA SUPER|SUPERMARCH|DOLLARAMA/i],
  ["restaurants", /RESTO|RESTAURANT|PIZZ|CAF[EÉ]\b|BISTRO|BRASSERIE|GRILL|SUSHI|\bPHO\b|TIM HORTONS|MCDONALD|STARBUCKS|SUBWAY|\bA&W\b|\bBAR\b|\bPUB\b|BOULANGERIE|P[ÂA]TISSERIE|TRAITEUR|DOORDASH|UBER ?EATS|SKIP ?THE/i],
  ["fuel", /\bESSO\b|SHELL|PETRO|ULTRAMAR|IRVING|COUCHE.?TARD|CROISSANT|CIRCLE K|\bSONIC\b|CIRCUIT [ÉE]LECTRIQUE|CHARGEPOINT|\bFLO\b|SUPERCHARG/i],
  ["health", /PHARMA|JEAN.?COUTU|UNIPRIX|FAMILIPRIX|BRUNET|PROXIM|CLINIQUE|DENTI|OPTOM|LUNETT|PHYSIO|CHIRO|MASSO/i],
  ["home", /HOME DEPOT|\bRONA\b|\bBMR\b|CANADIAN TIRE|LOWE|R[ÉE]NO.?D[ÉE]P[ÔO]T|IKEA|PISCINE|JARDIN|QUINCAILLERIE/i],
  ["travel", /AIR CANADA|AIR TRANSAT|WESTJET|PORTER|SUNWING|EXPEDIA|BOOKING|AIRBNB|H[ÔO]TEL|HOTEL|MARRIOTT|HILTON/i],
  ["leisure", /\bSAQ\b|CIN[ÉE]MA|CINEPLEX|BILLET|TICKETMASTER|SPORT|GYM|\bSKI\b|GOLF|MUS[ÉE]E/i],
  ["shopping", /AMAZON|AMZN|WINNERS|SIMONS|BEST BUY|APPLE STORE|SPORT CHEK|ARDENE|H&M|UNIQLO|LA MAISON SIMONS/i],
];

// Noms de paiements (pas des relevés : « PAIEMENT INTERNET » y désigne un paiement fait en ligne)
const PAYMENT_NAMES = [
  ["phone", /INTERNET|T[ÉE]L[ÉE]|\bTV\b|CELL|PHONE|MOBILE|HANDY|CELULAR|ĐIỆN THOẠI|인터넷|휴대폰/i],
  ["electricity", /[ÉE]LECTRICIT|CHAUFFAGE|ELECTRIC|ELETRICIDADE|STROM|HEAT|ĐIỆN|전기/i],
  ["housing", /LOYER|HYPOTH|RENT|MORTGAGE|ALQUILER|ALUGUEL|MIETE|TIỀN THUÊ|월세/i],
  ["insurance", /ASSURANCE|INSURANCE|SEGURO|VERSICHERUNG|BẢO HIỂM|보험/i],
];

export function emptyBudget() {
  return {
    categories: DEFAULT_CATEGORIES.map(([key, group, icon]) => ({ id: catId(key), key, name: "", group, planned: null, icon })),
    entries: [], rules: {},
  };
}

function normalizeCategory(c) {
  if (!c || (!str(c.key) && !str(c.name))) return null;
  return { id: str(c.id) || newId(), key: str(c.key), name: str(c.name), group: GROUPS.includes(c.group) ? c.group : "variable",
    planned: c.planned === null || c.planned === undefined || c.planned === "" ? null : Math.abs(parseMoney(c.planned) ?? 0), icon: str(c.icon) || "📦" };
}

function normalizeEntry(e, ids) {
  const amount = parseMoney(e?.amount);
  if (!e || !ISO.test(e.date) || amount === null) return null;
  return {
    id: str(e.id) || newId(), date: e.date, amount, categoryId: ids.has(e.categoryId) ? e.categoryId : null, description: str(e.description),
    source: e.source === "import" ? "import" : "manual", account: str(e.account), seq: str(e.seq), merchant: str(e.merchant),
  };
}

export function normalizeBudget(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.categories)) return emptyBudget();
  const categories = raw.categories.map(normalizeCategory).filter(Boolean);
  const ids = new Set(categories.map((c) => c.id));
  const entries = (Array.isArray(raw.entries) ? raw.entries : []).map((e) => normalizeEntry(e, ids)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  const rules = {};
  for (const [k, v] of Object.entries(raw.rules ?? {})) if (ids.has(v)) rules[k] = v;
  return { categories, entries, rules };
}

// ---- Classer ----

// Catégorie proposée pour une opération de relevé : le choix retenu pour ce commerce, sinon les mots-clés
export function suggestCategory(budget, description, amount) {
  const merchant = merchantKey(description);
  if (budget.rules[merchant]) return budget.rules[merchant];
  const ids = new Set(budget.categories.map((c) => c.id));
  for (const [key, re] of KEYWORDS) {
    if (!re.test(description)) continue;
    // La paie est un dépôt ; un montant négatif chez un commerce reconnu est un remboursement (il réduit la catégorie)
    if (amount >= 0 && key === "salary") continue;
    if (ids.has(catId(key))) return catId(key);
  }
  return null;
}

// Opérations lues dans des relevés : ajoutées sans doublons, classées si possible
export function importRows(budget, rows) {
  const seen = new Set(budget.entries.filter((e) => e.source === "import").map((e) => `${e.account}|${e.date}|${e.seq}|${e.amount}|${e.description}`));
  const added = [];
  let skipped = 0;
  for (const row of rows) {
    const key = `${str(row.account)}|${row.date}|${str(row.seq)}|${r2(row.amount)}|${str(row.description)}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    const entry = normalizeEntry({ ...row, id: newId(), source: "import", merchant: merchantKey(row.description), categoryId: suggestCategory(budget, row.description, row.amount) },
      new Set(budget.categories.map((c) => c.id)));
    if (entry) added.push(entry);
  }
  return { budget: { ...budget, entries: [...budget.entries, ...added].sort((a, b) => a.date.localeCompare(b.date)) }, added: added.length, skipped };
}

// Choisir la catégorie d'une opération ; `remember` : retenue pour ce commerce, et appliquée aux
// autres opérations du même commerce encore à classer
export function setCategory(budget, entryId, categoryId, { remember = true } = {}) {
  const entry = budget.entries.find((e) => e.id === entryId);
  if (!entry || !budget.categories.some((c) => c.id === categoryId)) return budget;
  const rules = remember && entry.merchant ? { ...budget.rules, [entry.merchant]: categoryId } : budget.rules;
  const entries = budget.entries.map((e) => (e.id === entryId || (remember && e.merchant && e.merchant === entry.merchant && !e.categoryId) ? { ...e, categoryId } : e));
  return { ...budget, entries, rules };
}

export function addEntry(budget, { date, amount, categoryId, description = "", kind = "expense" }) {
  const n = parseMoney(amount);
  if (n === null) return { budget, entry: null };
  const signed = kind === "income" ? -Math.abs(n) : Math.abs(n);
  const entry = normalizeEntry({ id: newId(), date, amount: signed, categoryId, description, source: "manual" }, new Set(budget.categories.map((c) => c.id)));
  return entry ? { budget: { ...budget, entries: [...budget.entries, entry].sort((a, b) => a.date.localeCompare(b.date)) }, entry } : { budget, entry: null };
}

export const removeEntry = (budget, id) => ({ ...budget, entries: budget.entries.filter((e) => e.id !== id) });

// ---- Catégories ----

export const updateCategory = (budget, id, patch) => ({
  ...budget, categories: budget.categories.map((c) => (c.id === id ? normalizeCategory({ ...c, ...patch, id }) ?? c : c)),
});

export function addCategory(budget, { name, group = "variable", icon = "📦" }) {
  const c = normalizeCategory({ id: newId(), name, group, icon });
  return c ? { budget: { ...budget, categories: [...budget.categories, c] }, category: c } : { budget, category: null };
}

// Une catégorie retirée : ses opérations redeviennent « à classer »
export const removeCategory = (budget, id) => ({
  ...budget, categories: budget.categories.filter((c) => c.id !== id),
  entries: budget.entries.map((e) => (e.categoryId === id ? { ...e, categoryId: null } : e)),
  rules: Object.fromEntries(Object.entries(budget.rules).filter(([, v]) => v !== id)),
});

// ---- Paiements -> budget ----

// Catégorie d'un paiement (page Paiements) : celle choisie, sinon d'après son type et son nom.
// Les paiements ne comptent que pour les mois sans relevé importé (voir monthActuals).
// Les paiements de l'entreprise (DAS, TPS/TVQ, carte de l'entreprise) ne font pas partie du budget
// personnel ; la paie de l'entreprise à soi-même est un revenu.
export function paymentCategory(budget, p) {
  const ids = new Set(budget.categories.map((c) => c.id));
  if (p.budgetCategory && ids.has(p.budgetCategory)) return p.budgetCategory;
  if (p.kind === "pay") return ids.has(catId("salary")) ? catId("salary") : null;
  if (p.scope === "business") return null;
  // Paiement de carte : sans relevé importé, c'est la meilleure mesure des achats faits avec la carte
  // (avec les relevés, les achats sont classés un à un et ce paiement n'est plus compté)
  if (p.kind === "card") return ids.has(catId("cardPurchases")) ? catId("cardPurchases") : null;
  const guess = suggestCategory({ ...budget, rules: {} }, `${p.name} ${p.provider ?? ""}`, 1);
  if (guess) return guess;
  // Noms de paiements courants (dans toutes les langues de l'application)
  for (const [key, re] of PAYMENT_NAMES) if (re.test(p.name) && ids.has(catId(key))) return catId(key);
  if (p.kind === "loan") return catId("housing");
  return ids.has(catId("misc")) ? catId("misc") : null;
}

// Montant par mois d'un paiement (aux 2 semaines : 26 par année ; aux 3 mois : le tiers…)
const PER_MONTH = { monthly: 1, biweekly: 26 / 12, bimonthly: 1 / 2, quarterly: 1 / 3, yearly: 1 / 12 };
export const monthlyAmount = (p) => (p.amount === null ? null : r2(p.amount * (PER_MONTH[p.freq] ?? 1)));

// Budget prévu proposé d'après les paiements à montant connu : { [categoryId]: montant par mois }
export function plannedFromPayments(budget, payments) {
  const out = {};
  for (const p of payments?.list ?? []) {
    if (!p.active) continue;
    const id = paymentCategory(budget, p);
    const m = monthlyAmount(p);
    const cat = budget.categories.find((c) => c.id === id);
    if (!id || m === null || cat?.group === "transfer") continue;
    out[id] = r2((out[id] ?? 0) + m);
  }
  return out;
}

// ---- Le mois ----

// Réel d'un mois par catégorie. paidRows : paiements notés payés ce mois-ci [{ payment, paid }]
export function monthActuals(budget, month, paidRows = []) {
  const entries = budget.entries.filter((e) => e.date.startsWith(month));
  const imported = entries.some((e) => e.source === "import");
  const lines = entries.map((e) => ({ ...e, from: e.source }));
  if (!imported) {
    for (const { payment: p, paid } of paidRows) {
      const id = paymentCategory(budget, p);
      const amount = paid?.amount ?? p.amount;
      if (!id || amount === null) continue;
      const cat = budget.categories.find((c) => c.id === id);
      lines.push({ id: `pay-${p.id}-${paid.due}`, date: paid.date, amount: cat?.group === "income" ? -amount : amount, categoryId: id, description: paymentLabel(p), from: "payment" });
    }
  }
  const byCat = new Map(budget.categories.map((c) => [c.id, { category: c, actual: 0, lines: [] }]));
  const unclassified = [];
  for (const l of lines) {
    const row = l.categoryId && byCat.get(l.categoryId);
    if (!row) {
      unclassified.push(l);
      continue;
    }
    // Revenus : les entrées d'argent (montants négatifs) ; ailleurs : les sorties
    row.actual = r2(row.actual + (row.category.group === "income" ? -l.amount : l.amount));
    row.lines.push(l);
  }
  const rows = [...byCat.values()];
  const sum = (group, field) => r2(rows.filter((r) => r.category.group === group).reduce((s, r) => s + (field === "planned" ? r.category.planned ?? 0 : r.actual), 0));
  const totals = {};
  for (const g of GROUPS) totals[g] = { planned: sum(g, "planned"), actual: sum(g, "actual") };
  const spentPlanned = r2(totals.fixed.planned + totals.variable.planned);
  const spentActual = r2(totals.fixed.actual + totals.variable.actual);
  return {
    month, imported, rows, unclassified, totals,
    balance: {
      planned: r2(totals.income.planned - spentPlanned - totals.savings.planned),
      actual: r2(totals.income.actual - spentActual - totals.savings.actual),
    },
    spent: { planned: spentPlanned, actual: spentActual },
  };
}
