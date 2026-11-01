// Retrouver une facture dans un fichier Excel : numéro, date, client, sous-total, TPS, TVQ.
// On cherche les étiquettes (« SOUS-TOTAL/ SUB-TOTAL », « TPS / GST (5 %) »…) et la valeur
// à leur droite. Cela marche avec les factures faites à la main dans Excel et avec celles
// que crée l'application.
//
//   invoiceFromCells(cells, fileName) -> { number, date, client, subtotal, tps, tvq, problems } ou null
//     problems : ce qui empêche de l'inscrire sans vérifier (montants pas calculés dans le
//                fichier, numéro différent de celui du nom du fichier…)

import { excelDateToISO } from "../export/xlsx-read.js";

const LABELS = {
  number: /no\.?\s*facture|invoice\s*(#|no)|facturation\s*-\s*invoice/i,
  date: /invoice\s*date|date\s*(de\s*)?facturation/i,
  client: /billed\s*to|factur[ée]\s*[àa]/i,
  subtotal: /sous[\s-]*total|sub[\s-]*total/i,
  due: /montant\s*d[ûu]|amount\s*due/i,
  tps: /^\s*TPS\s*\/\s*GST(?!\s*:)/i,
  tvq: /^\s*TVQ\s*\/\s*(PST|QST)(?!\s*:)/i,
};
const round2 = (n) => Math.round(n * 100) / 100;

function grid(cells) {
  const rows = new Map();
  for (const [key, value] of cells) {
    const [r, c] = key.split(",").map(Number);
    if (!rows.has(r)) rows.set(r, new Map());
    rows.get(r).set(c, value);
  }
  return rows;
}

// Première cellule (ligne, colonne) dont le texte correspond à l'étiquette
function find(rows, re) {
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    for (const c of [...rows.get(r).keys()].sort((a, b) => a - b)) {
      const v = rows.get(r).get(c);
      if (typeof v === "string" && re.test(v)) return { r, c };
    }
  }
  return null;
}

const rightOf = (rows, at) => [...(rows.get(at.r) ?? new Map())].filter(([c]) => c > at.c).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
const NEAR = 4; // le nom du client est sous son étiquette, ou juste à droite

// Le montant d'une ligne : le premier nombre à droite de l'étiquette, sans les taux (5 %,
// 9,975 %). Une formule pas calculée rend le montant inconnu (NaN) : on ne prend pas un
// autre nombre de la ligne à sa place.
const RATES = [0.05, 0.09975, 0.14975];
function amountAt(rows, re) {
  const at = find(rows, re);
  if (!at) return null;
  for (const v of rightOf(rows, at)) {
    if (v === null) return NaN;
    if (typeof v === "number" && !RATES.includes(v)) return round2(v);
  }
  return null;
}

function toISO(v) {
  if (typeof v === "number") return excelDateToISO(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? "").trim());
  return m ? m[0] : null;
}

export function invoiceFromCells(cells, fileName = "") {
  const rows = grid(cells);
  const at = (key) => find(rows, LABELS[key]);
  // Numéro : à droite de son étiquette ; sinon dans le nom du fichier (« 2026-0107_CPS.xlsx »)
  const numberAt = at("number");
  let number = numberAt ? rightOf(rows, numberAt).filter((v) => v !== null).map((v) => String(v).trim()).find((v) => /\d/.test(v)) : null;
  const m = /(?<![\dA-Za-z])(20\d\d)-0*(\d{2,4})(?!\d)/.exec(fileName);
  const fromName = m ? `${m[1]}-${m[2].padStart(3, "0")}` : null;
  number ??= fromName;
  const problems = [];
  if (fromName && number !== fromName && number.replace(/-0*/, "-") !== fromName) problems.push({ code: "number", file: fromName });
  const dateAt = at("date");
  const date = dateAt ? rightOf(rows, dateAt).filter((v) => v !== null).map(toISO).find(Boolean) ?? null : null;
  // Client : sous l'étiquette « Facturé à » (ou à sa droite), sans les courriels ni les autres étiquettes
  let client = "";
  const clientAt = at("client");
  if (clientAt) {
    for (let r = clientAt.r; r <= clientAt.r + 2 && !client; r++) {
      const row = rows.get(r) ?? new Map();
      for (const c of [...row.keys()].sort((a, b) => a - b)) {
        const v = row.get(c);
        if (c < clientAt.c || c > clientAt.c + NEAR || (r === clientAt.r && c === clientAt.c) || typeof v !== "string") continue;
        if (/@|exp[ée]di|shipped|billed|factur/i.test(v) || !/\p{L}{2}/u.test(v)) continue;
        client = v.trim();
        break;
      }
    }
  }
  // Ventes : le montant dû (après un acompte), sinon le sous-total
  const due = amountAt(rows, LABELS.due);
  const subtotal = due === null ? amountAt(rows, LABELS.subtotal) : due;
  const tps = amountAt(rows, LABELS.tps);
  const tvq = amountAt(rows, LABELS.tvq);
  if (!number || !date || subtotal === null) return null;
  if ([subtotal, tps, tvq].some((n) => Number.isNaN(n))) problems.push({ code: "uncalculated" });
  return { number, date, client, subtotal, tps: tps ?? 0, tvq: tvq ?? 0, problems };
}
