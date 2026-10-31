// Taxes (TPS/TVQ) : registre des factures émises et trimestres de déclaration.
//
// Rangées dans doc.timesheet :
//   invoices [{ id, number, date, clientId, client, subtotal, tps, tvq, source }]
//     number   : « 2026-118 » (unique) ; date : date de facturation (AAAA-MM-JJ)
//     clientId : le client de l'application, ou null ; client : son nom (gardé tel quel)
//     subtotal : ventes avant taxes (ligne 101) ; tps (ligne 103) ; tvq (ligne 203), en $ CA
//     source   : « app » (créée avec « Créer la facture ») ou « manual » (ajoutée à la main)
//
// Trimestre : « 2026-T2 » = du 1er avril au 30 juin 2026.

import { newId } from "../data/item.js";

export const TPS_RATE = 0.05;
export const TVQ_RATE = 0.09975;

const round2 = (n) => Math.round(n * 100) / 100;
const str = (v) => String(v ?? "").trim();
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? round2(n) : null;
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// ---- Trimestres ----

export const quarterOf = (date) => `${date.slice(0, 4)}-T${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;

export function quarterRange(key) {
  const [, y, q] = /^(\d{4})-T([1-4])$/.exec(key) ?? [];
  if (!y) return null;
  const first = (Number(q) - 1) * 3 + 1;
  const last = new Date(Date.UTC(Number(y), first + 2, 0)).getUTCDate(); // dernier jour du 3e mois
  const pad = (n) => String(n).padStart(2, "0");
  return { from: `${y}-${pad(first)}-01`, to: `${y}-${pad(first + 2)}-${pad(last)}` };
}

export function shiftQuarter(key, step) {
  const [, y, q] = /^(\d{4})-T([1-4])$/.exec(key);
  const index = Number(y) * 4 + Number(q) - 1 + step;
  return `${Math.floor(index / 4)}-T${(index % 4) + 1}`;
}

// Le trimestre à déclarer : celui qui vient de finir (en octobre, juillet à septembre)
export const reportQuarter = (today) => shiftQuarter(quarterOf(today), -1);

// ---- Registre des factures ----

export function normalizeInvoice(i) {
  if (!i || !str(i.number) || !ISO.test(i.date)) return null;
  const subtotal = num(i.subtotal);
  if (subtotal === null) return null;
  return {
    id: i.id ?? newId(), number: str(i.number), date: i.date, clientId: i.clientId ?? null, client: str(i.client),
    subtotal, tps: num(i.tps) ?? 0, tvq: num(i.tvq) ?? 0, source: i.source === "app" ? "app" : "manual",
  };
}

export const normalizeInvoices = (list) => (Array.isArray(list) ? list.map(normalizeInvoice).filter(Boolean) : []);

// Taxes d'une vente : TPS 5 %, TVQ 9,975 %, arrondies au cent comme sur la facture
export const salesTaxes = (subtotal, { tps = true, tvq = true } = {}) => ({
  tps: tps ? round2(subtotal * TPS_RATE) : 0,
  tvq: tvq ? round2(subtotal * TVQ_RATE) : 0,
});

// Ajouter ou remplacer (même numéro) une facture du registre
export function recordInvoice(ts, fields) {
  const list = ts.invoices ?? [];
  const old = list.find((i) => i.number === str(fields.number));
  const invoice = normalizeInvoice({ ...fields, id: old?.id ?? fields.id });
  if (!invoice) return { ts, invoice: null };
  const invoices = old ? list.map((i) => (i.id === old.id ? invoice : i)) : [...list, invoice];
  return { ts: { ...ts, invoices }, invoice };
}

export const removeInvoice = (ts, id) => ({ ...ts, invoices: (ts.invoices ?? []).filter((i) => i.id !== id) });

export function quarterInvoices(ts, key) {
  const range = quarterRange(key);
  return (ts.invoices ?? [])
    .filter((i) => i.date >= range.from && i.date <= range.to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number, undefined, { numeric: true }));
}

// Lignes 101 (ventes), 103 (TPS perçue) et 203 (TVQ perçue)
export function salesTotals(list) {
  const sum = (k) => round2(list.reduce((s, i) => s + i[k], 0));
  const subtotal = sum("subtotal");
  const tps = sum("tps");
  const tvq = sum("tvq");
  return { subtotal, tps, tvq, total: round2(subtotal + tps + tvq) };
}
