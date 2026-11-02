// Taxes payées : les achats tirés des relevés (Visa, Caisse), leur classement et les crédits
// de taxe (CTI pour la TPS, RTI pour la TVQ).
//
// Rangées dans doc.timesheet :
//   purchases [{ id, date, source, account, seq, description, amount, orig, category, pct, status, note }]
//     source   : « visa » | « caisse » | « perso » ; account : fin du numéro (« 1041 »)
//     amount   : montant en $ CA, taxes comprises (négatif : un crédit, un dépôt)
//     orig     : montant d'origine d'un achat en devise (« 118,25 USD »)
//     category : taxable | meal | exempt | excluded ; pct : part pour l'entreprise (1 ou 0,5)
//     tax      : qc (TPS + TVQ, par défaut) | on (TVH de l'Ontario, 13 %)
//     status   : ok (confirmé) | check (à confirmer)
//   merchantRules { [commerce]: { category, pct } }  les choix retenus, par commerce
//   personalRules { [commerce]: { category, pct } }  commerces d'affaires repérés dans les
//                 relevés personnels (proposés aux relevés suivants, jamais imposés)
//   homeCharging  [{ id, from, to, amount }]  recharge à la maison : part « Véhicule électrique »
//                 d'une période d'Hydro-Québec, en $ avant taxes ; répartie au prorata des jours
//
// Relevé personnel (source « perso ») : tout y est personnel (exclu) par défaut ; on coche ce
// qui a été payé pour l'entreprise.
//
// Crédit d'un achat taxable : montant ÷ 1,14975, × part d'affaires, × 5 % (TPS) et × 9,975 % (TVQ).
// Achat en Ontario (tax « on ») : TVH de 13 % ; montant ÷ 1,13, × part, × 13 %, réclamée en entier
// avec la TPS (ligne 106) ; pas de TVQ.

import { newId } from "../data/item.js";
import { quarterRange, TPS_RATE, TVQ_RATE } from "./taxes.js";

export const PURCHASE_CATEGORIES = ["taxable", "meal", "exempt", "excluded"];
// Choix proposés dans la liste : catégorie, part d'affaires, taxe (Québec ou TVH de l'Ontario)
export const PURCHASE_CHOICES = [
  { category: "taxable", pct: 1 }, { category: "taxable", pct: 0.5 }, { category: "meal", pct: 0.5 },
  { category: "taxable", pct: 1, tax: "on" }, { category: "taxable", pct: 0.5, tax: "on" }, { category: "meal", pct: 0.5, tax: "on" },
  { category: "exempt", pct: 1 }, { category: "excluded", pct: 0 },
];
export const HST_ON = 0.13;
export const TAX_REGIONS = ["qc", "on"];
const isHst = (p) => p.tax === "on" && (p.category === "taxable" || p.category === "meal");
export const choiceKey = (p) => `${p.category}:${p.pct}${isHst(p) ? ":on" : ""}`;
export const parseChoice = (key) => {
  const [category, pct, tax] = String(key).split(":");
  return { category, pct: Number(pct), tax: tax === "on" ? "on" : "qc" };
};

const round2 = (n) => Math.round(n * 100) / 100;
const str = (v) => String(v ?? "").trim();
const TAXES = 1 + TPS_RATE + TVQ_RATE;

// ---- Lire un relevé Desjardins (CSV) ----

// Une ligne CSV : champs entre guillemets, séparés par des virgules
export function csvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const amountOf = (v) => (str(v) === "" ? null : Number(str(v).replace(/\s/g, "").replace(",", ".")));
const isoDate = (v) => str(v).replace(/\//g, "-");

// Relevé de carte (« VISA**** **** **** 1041 », date, no, description, …, débit, crédit) ou de
// compte de la Caisse (succursale, compte, type, date, no, description, …, retrait, dépôt, …, solde).
// Une ligne « USD » de la Visa donne le montant d'origine de l'achat précédent.
export function parseDesjardinsCsv(text) {
  const out = [];
  for (const r of csvRows(text)) {
    if (!/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(str(r[3]))) continue;
    const card = /^(VISA|MASTERCARD)/i.test(str(r[0]));
    if (card) {
      const description = str(r[5]).replace(/\s+/g, " ");
      const debit = amountOf(r[11]);
      const credit = amountOf(r[12]);
      if (/^[A-Z]{3}$/.test(description) && out.length && debit !== null) {
        out.at(-1).orig = `${debit.toFixed(2).replace(".", ",")} ${description}`;
        continue;
      }
      out.push({ source: "visa", account: str(r[0]).slice(-4), date: isoDate(r[3]), seq: str(r[4]), description,
        amount: round2(debit ?? -Math.abs(credit ?? 0)), orig: "" });
    } else {
      // Sous-comptes (épargne ES, terme ET, marge de crédit MC, prêt PR) : pas des dépenses
      if (/^(ES|ET|MC|PR)\d*$/i.test(str(r[2]))) continue;
      const withdrawal = amountOf(r[7]);
      const deposit = amountOf(r[8]);
      out.push({ source: "caisse", account: str(r[1]).slice(-4), date: isoDate(r[3]), seq: str(r[4]), description: str(r[5]).replace(/\s+/g, " "),
        amount: round2(withdrawal ?? -Math.abs(deposit ?? 0)), orig: "" });
    }
  }
  return out;
}

// Relevé de carte Visa Desjardins en PDF (lignes de texte lues par pdf.js) :
//   « 02  06  02  06  001  CSC IBEROSTAR CLUB 3  866-8594402  AZ  167,65 »
//   « 118,25 DOLLAR AMERICAIN  TX: 1.417758 »   (montant d'origine de l'achat précédent)
//   « 15  06  15  06  001  PAIEMENT CAISSE  4 500,00CR »   (opérations au compte : crédit)
// -> { rows, total, expected } ; total (achats lus) doit égaler expected (« Total » du relevé).
const CURRENCY_NAMES = {
  "DOLLAR AMERICAIN": "USD", DONG: "VND", EURO: "EUR", "LIVRE STERLING": "GBP", "PESO MEXICAIN": "MXN", YUAN: "CNY", "YUAN RENMINBI": "CNY",
  REAL: "BRL", "REAL BRESILIEN": "BRL", DIRHAM: "AED", WON: "KRW", YEN: "JPY", BAHT: "THB", "DOLLAR AUSTRALIEN": "AUD", "FRANC SUISSE": "CHF",
};
const frAmount = (v) => Number(v.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
export function parseDesjardinsVisaPdf(lines) {
  const text = lines.join("\n");
  const statement = /DATE DU RELEV[ÉE].*?Mois\s+(\d\d)\s+Ann[ée]e\s+(20\d\d)/i.exec(text);
  if (!statement) return { rows: [], total: 0, expected: null };
  const [month, year] = [Number(statement[1]), Number(statement[2])];
  const account = /\*{4}\s+(\d{4})/.exec(text)?.[1] ?? "";
  const rows = [];
  let last = null;
  let section = "card";
  let expected = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^Op[ée]rations au compte/i.test(line)) section = "account";
    const total = /^Total\s+([\d\s\u00a0]+,\d\d)$/.exec(line);
    if (total && section === "card" && expected === null) expected = frAmount(total[1]);
    const m = /^(\d\d)\s+(\d\d)\s+\d\d\s+\d\d\s+(\d{3})\s+(.+?)\s+(\d{1,3}(?:[\s\u00a0]\d{3})*,\d\d)(CR)?$/.exec(line);
    if (m) {
      const [, d, mo, seq, description, amount, credit] = m;
      const y = Number(mo) > month ? year - 1 : year; // relevé de janvier : achats de décembre
      last = { source: "visa", account, date: `${y}-${mo}-${d}`, seq: `${section === "account" ? "A" : ""}${seq}`,
        description: description.replace(/\s+/g, " "), amount: round2(credit ? -frAmount(amount) : frAmount(amount)), orig: "", section };
      rows.push(last);
      continue;
    }
    const c = /^([\d\s\u00a0]+,\d\d)\s+([A-ZÀ-Ü][A-ZÀ-Ü ]*?)\s+TX:/.exec(line);
    if (c && last) last.orig = `${c[1].replace(/\s+/g, " ")} ${CURRENCY_NAMES[c[2].trim()] ?? c[2].trim()}`;
  }
  const total = round2(rows.filter((r) => r.section === "card").reduce((sum, r) => sum + r.amount, 0));
  return { rows: rows.map(({ section, ...r }) => r), total, expected };
}

// ---- Classer ----

// Le commerce, pour retenir les choix, sans ce qui change d'un achat à l'autre (no de
// magasin, de commande, téléphone) : « THE HOME DEPOT #7147 SAINT-JEROME QC » -> « THE HOME DEPOT »,
// « Paiement internet à Proprietaire/P20260402 » -> « PAIEMENT INTERNET À PROPRIETAIRE »,
// « Achat /THE HOME DEPOT #7147 » (carte de débit) -> « THE HOME DEPOT »
export function merchantKey(description) {
  return str(description).toUpperCase().replace(/^(ACHAT|RETOUR PAIEMENT DIRECT)\s*\//, "").split("#")[0].replace(/\*/g, " ").split(/\s+/)
    .map((w) => ((w.match(/\d/g) ?? []).length >= 2 ? (w.includes("/") ? w.split("/")[0] : "") : w))
    .map((w) => w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ""))
    .filter((w) => w.length > 1 || /\p{L}/u.test(w))
    .slice(0, 6)
    .join(" ");
}

const PROVINCES = /\s(QC|ON|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU|CA|CAN)$/i;
// Commerces en ligne (numéro de téléphone, site web) : la ville affichée n'est pas le lieu de l'achat
const ONLINE = /\d{3}-\d{3}-\d{4}|\d{7,}|\.COM|\.CA\b|WWW|AMZN|AMAZON|APPLE|GOOGLE|PAYPAL|MICROSOFT|ADOBE|NETFLIX|SPOTIFY|UBER/i;

// Règles de départ (communes à tous) ; les choix confirmés par commerce passent avant.
const RULES = [
  [/PROPRI[ÉE]TAIRE/i, "excluded", 0, "check", "owner"],
  [/S\.?A\.?A\.?Q/i, "exempt", 1, "ok", "saaq"],
  [/PAIEMENT D'AUTOMOBILE|FORD CREDIT|GM FINANCIAL|TOYOTA CREDIT|HONDA FINANCE/i, "exempt", 1, "check", "carLoan"],
  [/ASSURANCE|INSURANCE|CROIX ?BLEUE|BLUE ?CROSS/i, "exempt", 1, "check", "insurance"],
  [/REMISE GOUVERNEMENTALE|CODE PAIEMENT RQ|REVENU QU[ÉE]BEC|RECEVEUR G[ÉE]N[ÉE]RAL|AGENCE DU REVENU/i, "excluded", 0, "ok", "government"],
  [/^PAIEMENT (AUTORIS|CAISSE)|^PAIEMENT \/VISA|ACC[ÈE]SD INTERNET \/VISA|TRANSFERT MENSUALIT/i, "excluded", 0, "ok", "cardPayment"],
  [/FRAIS DE CR[ÉE]DIT|INT[ÉE]R[ÊE]TS|FRAIS FIXES|FRAIS DE SERVICE|FRAIS MENSUELS/i, "exempt", 1, "ok", "bankFees"],
  [/AMENDE|COUR MUNICIPALE|CONSTAT/i, "excluded", 0, "check", "fine"],
  [/CIRCUIT [ÉE]LECTRIQUE|LE CIRCUIT|CHARGEPOINT|\bFLO\b|SWIFTCHARGE|ELECTRIFY|\bIVY\b|PETRO.?CANADA EV|TESLA SUPERCHARG/i, "taxable", 1, "check", "charging"],
  [/RESTO|RESTAURANT|PIZZ|CAF[EÉ]\b|BISTRO|BRASSERIE|GRILL|SUSHI|\bPHO\b|TIM HORTONS|MCDONALD|STARBUCKS|SUBWAY|\bA&W\b|\bBAR\b|\bPUB\b|BOULANGERIE|P[ÂA]TISSERIE|TRAITEUR/i, "meal", 0.5, "check", "meal"],
];

// Ce que l'on propose pour une transaction : { category, pct, status, note }
export function suggest(p, rules = {}, personalRules = {}) {
  if (p.amount < 0) return { category: "excluded", pct: 0, status: "ok", note: "credit" };
  if (p.source === "perso") {
    const business = personalRules[merchantKey(p.description)];
    return business ? { ...business, status: "check", note: "businessBefore" } : { category: "excluded", pct: 0, status: "ok", note: "personal" };
  }
  const known = rules[merchantKey(p.description)];
  if (known) return { category: known.category, pct: known.pct, tax: known.tax ?? "qc", status: "ok", note: "remembered" };
  // Commerce physique en Ontario (relevé Visa : « … BROCKVILLE ON ») : TVH de 13 %. Les achats en
  // ligne facturés de l'Ontario (Apple, Amazon, Google…) restent au taux du Québec.
  const ontario = p.source === "visa" && /\sON$/.test(p.description) && !ONLINE.test(p.description);
  for (const [re, category, pct, status, note] of RULES) {
    if (!re.test(p.description)) continue;
    return ontario && (category === "taxable" || category === "meal") ? { category, pct, tax: "on", status: "check", note: "ontario" } : { category, pct, status, note };
  }
  if (ontario) return { category: "taxable", pct: 1, tax: "on", status: "check", note: "ontario" };
  // Achat en devise, ou commerçant hors du Canada : normalement sans TPS/TVQ
  if (p.orig || (p.source === "visa" && /\s[A-Z]{2}$/.test(p.description) && !PROVINCES.test(p.description))) {
    return { category: "exempt", pct: 1, status: "check", note: "foreign" };
  }
  return { category: "taxable", pct: 1, status: "check", note: "new" };
}

export function normalizePurchase(p) {
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(Number(p.amount))) return null;
  const category = PURCHASE_CATEGORIES.includes(p.category) ? p.category : "taxable";
  const pct = category === "excluded" ? 0 : [1, 0.5].includes(Number(p.pct)) ? Number(p.pct) : 1;
  return {
    id: p.id ?? newId(), date: p.date, source: ["visa", "caisse", "perso"].includes(p.source) ? p.source : "visa", account: str(p.account), seq: str(p.seq),
    description: str(p.description), amount: round2(Number(p.amount)), orig: str(p.orig), category, pct,
    tax: p.tax === "on" && (category === "taxable" || category === "meal") ? "on" : "qc",
    status: p.status === "ok" ? "ok" : "check", note: str(p.note),
  };
}
export const normalizePurchases = (list) => (Array.isArray(list) ? list.map(normalizePurchase).filter(Boolean) : []);

export function normalizeMerchantRules(rules) {
  const out = {};
  for (const [k, v] of Object.entries(rules && typeof rules === "object" ? rules : {})) {
    if (k && PURCHASE_CATEGORIES.includes(v?.category)) {
      out[k] = { category: v.category, pct: v.category === "excluded" ? 0 : Number(v.pct) === 0.5 ? 0.5 : 1, tax: v.tax === "on" ? "on" : "qc" };
    }
  }
  return out;
}

// Une même transaction importée deux fois (relevé téléchargé de nouveau, ou deux relevés qui
// se chevauchent) n'est gardée qu'une fois. Le no de transaction change d'un téléchargement à
// l'autre : on compare date, description et montant, et l'on compte. Trois cafés identiques le
// même jour restent trois : un relevé n'ajoute que les copies qui manquent.
const sameKey = (p) => [p.source, p.account, p.date, p.description, round2(p.amount)].join("|");

// Ajouter les transactions d'un relevé : classées, sans doublons. -> { ts, added, skipped }
// source : « perso » pour un relevé personnel (sinon celle du relevé : visa ou caisse)
export function addPurchases(ts, rows, { source } = {}) {
  const list = ts.purchases ?? [];
  const have = new Map();
  for (const p of list) have.set(sameKey(p), (have.get(sameKey(p)) ?? 0) + 1);
  const inFile = new Map();
  const added = [];
  let skipped = 0;
  for (const original of rows) {
    const row = source ? { ...original, source } : original;
    const key = sameKey(row);
    const n = (inFile.get(key) ?? 0) + 1;
    inFile.set(key, n);
    if (n <= (have.get(key) ?? 0)) { skipped++; continue; }
    const p = normalizePurchase({ ...row, ...suggest(row, ts.merchantRules ?? {}, ts.personalRules ?? {}) });
    if (p) added.push(p);
  }
  return { ts: { ...ts, purchases: [...list, ...added] }, added: added.length, skipped };
}

// Classer un achat (et retenir le choix pour son commerce : les autres achats de ce commerce
// encore « à confirmer » suivent)
export function classifyPurchase(ts, id, { category, pct, tax = "qc" }, { remember = true } = {}) {
  const target = (ts.purchases ?? []).find((p) => p.id === id);
  if (!target) return ts;
  const key = merchantKey(target.description);
  const choice = { category, pct: category === "excluded" ? 0 : pct, tax: tax === "on" && (category === "taxable" || category === "meal") ? "on" : "qc" };
  // Relevé personnel : un achat coché « entreprise » fait proposer ce commerce la prochaine
  // fois ; les autres achats du même commerce restent personnels (on y achète aussi pour soi).
  if (target.source === "perso") {
    const purchases = ts.purchases.map((p) => (p.id === id ? { ...p, ...choice, status: "ok", note: category === "excluded" ? "personal" : p.note } : p));
    const personalRules = { ...(ts.personalRules ?? {}) };
    if (remember && category !== "excluded" && target.amount >= 0) personalRules[key] = choice;
    return { ...ts, purchases, personalRules };
  }
  const purchases = ts.purchases.map((p) => {
    if (p.id === id) return { ...p, ...choice, status: "ok" };
    if (remember && p.status === "check" && p.amount >= 0 && merchantKey(p.description) === key) return { ...p, ...choice, status: "ok", note: "remembered" };
    return p;
  });
  const merchantRules = remember && target.amount >= 0 ? { ...(ts.merchantRules ?? {}), [key]: choice } : ts.merchantRules ?? {};
  return { ...ts, purchases, merchantRules };
}

export const removePurchase = (ts, id) => ({ ...ts, purchases: (ts.purchases ?? []).filter((p) => p.id !== id) });

export function quarterPurchases(ts, key) {
  const { from, to } = quarterRange(key);
  return (ts.purchases ?? []).filter((p) => p.date >= from && p.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source) || a.seq.localeCompare(b.seq, undefined, { numeric: true }));
}

// Crédits d'un achat : { base, tps, tvq } (base : montant avant taxes, pour la part d'affaires)
// En Ontario : { base, tps } où tps est la TVH de 13 % (réclamée avec la TPS), tvq 0.
export function purchaseTaxes(p) {
  if (p.category !== "taxable" && p.category !== "meal") return { base: 0, tps: 0, tvq: 0 };
  if (isHst(p)) {
    const base = (p.amount / (1 + HST_ON)) * p.pct;
    return { base, tps: base * HST_ON, tvq: 0 };
  }
  const base = (p.amount / TAXES) * p.pct;
  return { base, tps: base * TPS_RATE, tvq: base * TVQ_RATE };
}

// Totaux par groupe (taxables à 100 %, usage mixte, repas, sans taxes, exclus) et lignes 106/206
export function purchaseTotals(list) {
  const groups = {};
  const kind = (p) => (p.category === "taxable" ? (p.pct === 1 ? "taxable" : "mixed") : p.category);
  const region = (p) => (isHst(p) ? "On" : "");
  const group = (p) => (p.source === "perso" ? `perso${kind(p)[0].toUpperCase()}${kind(p).slice(1)}` : kind(p)) + region(p);
  for (const p of list) {
    if (p.source === "perso" && p.category === "excluded") continue; // dépenses personnelles
    const g = (groups[group(p)] ??= { count: 0, amount: 0, tps: 0, tvq: 0 });
    const x = purchaseTaxes(p);
    g.count++;
    g.amount += p.amount;
    g.tps += x.tps;
    g.tvq += x.tvq;
  }
  for (const g of Object.values(groups)) for (const k of ["amount", "tps", "tvq"]) g[k] = round2(g[k]);
  const sum = (k) => round2(Object.values(groups).reduce((s, g) => s + g[k], 0));
  return { groups, tps: sum("tps"), tvq: sum("tvq"), toCheck: list.filter((p) => p.status === "check").length };
}

// ---- Recharge à la maison (Hydro-Québec) ----

const DAY = 86400000;
const days = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY) + 1;

export function normalizeHomeCharging(list) {
  return (Array.isArray(list) ? list : []).flatMap((c) => {
    const amount = Number(c?.amount);
    const ok = c && /^\d{4}-\d{2}-\d{2}$/.test(c.from) && /^\d{4}-\d{2}-\d{2}$/.test(c.to) && c.from <= c.to && Number.isFinite(amount) && amount >= 0;
    return ok ? [{ id: c.id ?? newId(), from: c.from, to: c.to, amount: round2(amount) }] : [];
  }).sort((a, b) => a.from.localeCompare(b.from));
}

export const addHomeCharging = (ts, period) => ({ ...ts, homeCharging: normalizeHomeCharging([...(ts.homeCharging ?? []), period]) });
export const removeHomeCharging = (ts, id) => ({ ...ts, homeCharging: (ts.homeCharging ?? []).filter((c) => c.id !== id) });

// Part de chaque période d'Hydro-Québec dans le trimestre, au prorata des jours ; le montant
// est avant taxes : les crédits sont 5 % et 9,975 % de cette part.
//   -> { rows: [{ ...période, days, inQuarter, share }], base, tps, tvq }
export function quarterHomeCharging(ts, key) {
  const { from, to } = quarterRange(key);
  const rows = (ts.homeCharging ?? []).flatMap((c) => {
    const start = c.from > from ? c.from : from;
    const end = c.to < to ? c.to : to;
    if (start > end) return [];
    const total = days(c.from, c.to);
    const inQuarter = days(start, end);
    return [{ ...c, days: total, inQuarter, share: round2((c.amount * inQuarter) / total) }];
  });
  const base = round2(rows.reduce((s, r) => s + r.share, 0));
  return { rows, base, tps: round2(base * TPS_RATE), tvq: round2(base * TVQ_RATE) };
}
