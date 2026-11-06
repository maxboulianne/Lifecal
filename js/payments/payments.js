// Paiements à faire : entreprise (carte de crédit, DAS, TPS/TVQ, sa propre paie) et personnels
// (cartes, cellulaire, Hydro-Québec…). Chaque paiement revient selon sa fréquence ; ses échéances
// paraissent dans le calendrier (module « paiement ») et se cochent « payé » avec le montant réel,
// gardé dans l'historique. Les noms et les montants sont entrés dans l'application (rien de personnel
// dans le code).
//
// Rangé dans le document : payments = { list, paid }
//   paiement : { id, name, scope: "business"|"personal", kind, freq, start: date de la première échéance,
//                lastDay: true = le dernier jour du mois, amount: nombre ou null (variable), auto: prélèvement
//                automatique, remindDays, note, active, budgetCategory }
//   payé     : { id, paymentId, due: échéance, date: payé le, amount, note }
//
// Échéances du gouvernement (DAS, TPS/TVQ) : un samedi, un dimanche ou un jour férié, elles passent
// au jour ouvrable suivant.

import { addDays, parseISODate, toISODate } from "../core/dates.js";
import { newId } from "../data/item.js";
import { holidayOn } from "../timesheet/holidays.js";

export const PAYMENT_MODULE = "paiement";
export const SCOPES = ["business", "personal"];
export const KINDS = ["card", "bill", "das", "salesTax", "pay", "loan", "other"];
export const FREQS = ["monthly", "biweekly", "bimonthly", "quarterly", "yearly"];
const MONTH_STEP = { monthly: 1, bimonthly: 2, quarterly: 3, yearly: 12 };
const GOVERNMENT = new Set(["das", "salesTax"]);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v) => String(v ?? "").trim();
export const parseAmount = (v) => money(v);
function money(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export const emptyPayments = () => ({ list: [], paid: [] });

function normalizePayment(p) {
  if (!p || !str(p.name) || !ISO.test(p.start)) return null;
  const remind = Number(p.remindDays);
  return {
    id: str(p.id) || newId(), name: str(p.name), scope: SCOPES.includes(p.scope) ? p.scope : "personal",
    kind: KINDS.includes(p.kind) ? p.kind : "other", freq: FREQS.includes(p.freq) ? p.freq : "monthly", start: p.start,
    lastDay: Boolean(p.lastDay), amount: money(p.amount), auto: Boolean(p.auto),
    remindDays: Number.isInteger(remind) && remind >= 0 && remind <= 30 ? remind : 3, note: str(p.note), active: p.active !== false,
    budgetCategory: str(p.budgetCategory), // catégorie du budget (vide : choisie d'après le type et le nom)
  };
}

function normalizePaid(x, ids) {
  if (!x || !ids.has(x.paymentId) || !ISO.test(x.due)) return null;
  return { id: str(x.id) || newId(), paymentId: x.paymentId, due: x.due, date: ISO.test(x.date) ? x.date : x.due, amount: money(x.amount), note: str(x.note) };
}

export function normalizePayments(raw) {
  if (!raw || typeof raw !== "object") return emptyPayments();
  const list = (Array.isArray(raw.list) ? raw.list : []).map(normalizePayment).filter(Boolean);
  const ids = new Set(list.map((p) => p.id));
  const paid = (Array.isArray(raw.paid) ? raw.paid : []).map((x) => normalizePaid(x, ids)).filter(Boolean)
    .sort((a, b) => a.due.localeCompare(b.due));
  return { list, paid };
}

// ---- Échéances ----

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m : 1 à 12
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Jour ouvrable suivant (samedi, dimanche, congé férié du Québec)
export function nextBusinessDay(date) {
  let d = date;
  for (let i = 0; i < 7; i++) {
    const wd = parseISODate(d).getDay();
    if (wd !== 0 && wd !== 6 && !holidayOn(d)) return d;
    d = toISODate(addDays(parseISODate(d), 1));
  }
  return d;
}

// Échéances prévues (avant tout report au jour ouvrable), de `from` à `to`
function plannedDates(p, from, to) {
  const out = [];
  if (p.freq === "biweekly") {
    const start = parseISODate(p.start);
    const gap = Math.max(0, Math.floor((parseISODate(from) - start) / 86400000 / 14) - 1);
    for (let k = gap; ; k++) {
      const d = toISODate(addDays(start, 14 * k));
      if (d > to) break;
      if (d >= from) out.push(d);
    }
    return out;
  }
  const step = MONTH_STEP[p.freq];
  const [sy, sm, sd] = p.start.split("-").map(Number);
  const [fy, fm] = from.split("-").map(Number);
  // Premier mois de la série qui peut tomber dans la période (un mois plus tôt : report au jour ouvrable)
  let k = Math.max(0, Math.floor(((fy - sy) * 12 + (fm - sm) - 1) / step));
  for (;; k++) {
    const total = sm - 1 + k * step;
    const y = sy + Math.floor(total / 12);
    const m = (total % 12) + 1;
    const d = iso(y, m, p.lastDay ? daysIn(y, m) : Math.min(sd, daysIn(y, m)));
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

// Échéances d'un paiement entre deux dates : [{ planned, due }] (due : reportée au jour ouvrable)
export function dueDates(p, from, to) {
  if (!p.active) return [];
  const before = toISODate(addDays(parseISODate(from), -7));
  return plannedDates(p, before, to)
    .filter((d) => d >= p.start)
    .map((planned) => ({ planned, due: GOVERNMENT.has(p.kind) ? nextBusinessDay(planned) : planned }))
    .filter(({ due }) => due >= from && due <= to);
}

// Paiement noté pour une échéance (ou null)
export const paidFor = (payments, paymentId, due) => payments.paid.find((x) => x.paymentId === paymentId && x.due === due) ?? null;

// Échéances de tous les paiements d'une période, avec leur état : paid, overdue, soon, upcoming
export function schedule(payments, from, to, today) {
  const out = [];
  for (const p of payments.list) {
    for (const { due } of dueDates(p, from, to)) {
      const paid = paidFor(payments, p.id, due);
      const days = Math.round((parseISODate(due) - parseISODate(today)) / 86400000);
      const state = paid ? "paid" : days < 0 ? "overdue" : days <= p.remindDays ? "soon" : "upcoming";
      out.push({ payment: p, due, paid, days, state });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.payment.name.localeCompare(b.payment.name));
}

// Totaux d'une liste d'échéances : prévu (montants connus), payé, reste, nombre de montants variables
export function totals(rows, estimate = () => null) {
  const r2 = (n) => Math.round(n * 100) / 100;
  let planned = 0;
  let paid = 0;
  let unknown = 0;
  for (const row of rows) {
    const expected = row.payment.amount ?? estimate(row);
    if (row.paid) paid += row.paid.amount ?? expected ?? 0;
    if (expected !== null) planned += row.paid?.amount ?? expected;
    else if (row.paid?.amount != null) planned += row.paid.amount;
    else unknown++;
  }
  return { planned: r2(planned), paid: r2(paid), left: r2(Math.max(0, planned - paid)), unknown };
}

// Échéances en retard (pas payées, jusqu'à `withinDays` jours avant aujourd'hui)
export const overdue = (payments, today, withinDays = 60) =>
  schedule(payments, toISODate(addDays(parseISODate(today), -withinDays)), toISODate(addDays(parseISODate(today), -1)), today).filter((r) => !r.paid);

// Rappels : en retard ou à payer bientôt (sauf prélèvement automatique)
export function dueSoon(payments, today) {
  const ahead = Math.max(0, ...payments.list.map((p) => p.remindDays));
  const rows = [...overdue(payments, today), ...schedule(payments, today, toISODate(addDays(parseISODate(today), ahead)), today)];
  return rows.filter((r) => !r.paid && !r.payment.auto && r.days <= r.payment.remindDays);
}

// ---- Modifications ----

export function addPayment(payments, fields) {
  const p = normalizePayment({ ...fields, id: newId() });
  return p ? { payments: { ...payments, list: [...payments.list, p] }, payment: p } : { payments, payment: null };
}

export function updatePayment(payments, id, fields) {
  return { ...payments, list: payments.list.map((p) => (p.id === id ? normalizePayment({ ...p, ...fields, id }) ?? p : p)) };
}

export const removePayment = (payments, id) => ({ list: payments.list.filter((p) => p.id !== id), paid: payments.paid.filter((x) => x.paymentId !== id) });

// « Payé » : le montant réel et la date (remplace une note déjà faite pour cette échéance)
export function markPaid(payments, paymentId, due, { date, amount = null, note = "" } = {}) {
  const ids = new Set(payments.list.map((p) => p.id));
  const entry = normalizePaid({ id: newId(), paymentId, due, date, amount, note }, ids);
  if (!entry) return payments;
  const paid = [...payments.paid.filter((x) => !(x.paymentId === paymentId && x.due === due)), entry].sort((a, b) => a.due.localeCompare(b.due));
  return { ...payments, paid };
}

export const unmarkPaid = (payments, paymentId, due) => ({ ...payments, paid: payments.paid.filter((x) => !(x.paymentId === paymentId && x.due === due)) });

// Historique d'un paiement, le plus récent d'abord
export const history = (payments, paymentId) => payments.paid.filter((x) => x.paymentId === paymentId).sort((a, b) => b.due.localeCompare(a.due));

// ---- Modèles (raccourcis pour ajouter un paiement) ----

// Prochaine date (à partir d'aujourd'hui) d'une série : jour du mois (ou dernier jour) dans les mois donnés
function nextInMonths(today, months, day) {
  const [y, m, d] = today.split("-").map(Number);
  for (let i = 0; i < 24; i++) {
    const total = m - 1 + i;
    const yy = y + Math.floor(total / 12);
    const mm = (total % 12) + 1;
    if (!months.includes(mm)) continue;
    const dd = day === "last" ? daysIn(yy, mm) : Math.min(day, daysIn(yy, mm));
    if (i > 0 || dd >= d) return iso(yy, mm, dd);
  }
  return today;
}

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const QUARTER_NEXT = [1, 4, 7, 10]; // mois qui suivent la fin de chaque trimestre

// key : clé de traduction du nom ; le reste pré-remplit le formulaire
export const TEMPLATES = [
  { key: "dasFederal", scope: "business", kind: "das", freq: "monthly", start: (today) => nextInMonths(today, ALL, 15) },
  { key: "dasQuebec", scope: "business", kind: "das", freq: "quarterly", start: (today) => nextInMonths(today, QUARTER_NEXT, 15) },
  { key: "salesTax", scope: "business", kind: "salesTax", freq: "quarterly", lastDay: true, start: (today) => nextInMonths(today, QUARTER_NEXT, "last") },
  { key: "myPay", scope: "business", kind: "pay", freq: "biweekly", start: (today) => today },
  { key: "businessCard", scope: "business", kind: "card", freq: "monthly", start: (today) => today },
  { key: "creditCard", scope: "personal", kind: "card", freq: "monthly", start: (today) => today },
  { key: "phone", scope: "personal", kind: "bill", freq: "monthly", start: (today) => today },
  { key: "internet", scope: "personal", kind: "bill", freq: "monthly", start: (today) => today },
  { key: "electricity", scope: "personal", kind: "bill", freq: "monthly", start: (today) => today },
  { key: "housing", scope: "personal", kind: "loan", freq: "monthly", start: (today) => nextInMonths(today, ALL, 1) },
  { key: "insurance", scope: "personal", kind: "bill", freq: "monthly", start: (today) => today },
];

// ---- Calendrier ----

export function paymentOccurrences(payments, from, to, today) {
  if (!payments?.list?.length) return [];
  return schedule(payments, from, to, today).map(({ payment: p, due, paid }) => ({
    id: `payment:${p.id}:${due}`, title: p.name, module: PAYMENT_MODULE, date: due, time: "", place: "", lat: null, lng: null,
    done: Boolean(paid), status: "active", notes: "", recurrence: null, data: { payment: { id: p.id, due } },
    source: { provider: "payment", externalId: p.id, etag: null }, createdAt: null, updatedAt: null,
  }));
}
