// Dépenses à refacturer : repas, hôtel, transport, kilométrage, cellulaire, matériel.
//
// Rangées dans doc.timesheet :
//   expenses [{ id, date, type, description, projectId, clientId, qty, amount, currency, rate, unitPrice }]
//     type      : food | hotel | transport | mileage | phone | material
//     projectId : le projet (ex. la carte SIM d'un voyage) ; ou null + clientId pour un
//                 frais général du client (ex. le cellulaire du mois)
//     qty       : 1, ou le nombre de km pour le kilométrage
//     amount    : montant d'origine, dans la devise (currency) ; rate : $ CA pour 1 unité de la devise
//     unitPrice : kilométrage seulement : $ CA par km (ex. 0,65)
//     meal      : repas seulement : breakfast | lunch | dinner, ou null (« Food », générique)
//     note      : justification (qui était présent au repas, à quoi sert l'achat…)
//     showNote  : la note paraît sur la facture au client, à la suite de la description
//     attachments : justificatifs [{ id, kind, type, name }] ; le fichier lui-même est dans
//                   IndexedDB (data/files.js) ; kind : invoice (facture) | proof (preuve de
//                   transaction) | other ; type : image/jpeg ou application/pdf
//   rates    { VND: 0.000053931, … }   dernier taux de change utilisé pour chaque devise
// Le montant en dollars canadiens : arrondi au cent, comme sur la facture.

import { newId } from "../data/item.js";

export const EXPENSE_TYPES = ["food", "hotel", "transport", "mileage", "phone", "material"];
export const EXPENSE_ICONS = { food: "🍽️", hotel: "🏨", transport: "🚕", mileage: "🚗", phone: "📱", material: "🧰" };
// Colonne du sommaire de la facture (le kilométrage va dans « Transport »)
export const EXPENSE_CATEGORY = { food: "food", hotel: "hotel", transport: "transport", mileage: "transport", phone: "phone", material: "material" };
// Devises proposées (CNY : yuan chinois ; AED : dirham des Émirats ; BRL : réal brésilien)
export const CURRENCIES = [
  "CAD", "USD", "EUR", "GBP", "CHF", "MXN", "BRL", "AED", "SAR", "CNY", "HKD", "TWD", "JPY", "KRW", "VND", "THB",
  "INR", "PHP", "IDR", "MYR", "SGD", "AUD", "NZD",
];
export const DEFAULT_MILEAGE_RATE = 0.65;

const round2 = (n) => Math.round(n * 100) / 100;
const str = (v) => String(v ?? "").trim();
const positive = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && v !== "" && v !== null ? n : null;
};

export const isMileage = (e) => e.type === "mileage";

// Prix unitaire et total en $ CA
export const expenseUnitPrice = (e) => (isMileage(e) ? e.unitPrice : round2(e.amount * e.rate));
export const expenseTotal = (e) => round2(e.qty * expenseUnitPrice(e));
export const sumExpenses = (list) => round2(list.reduce((s, e) => s + expenseTotal(e), 0));

export const ATTACHMENT_KINDS = ["invoice", "proof", "other"];

// Repas : déjeuner, dîner, souper (ou simplement « Food »). Sur la facture au client, en anglais.
export const MEALS = ["breakfast", "lunch", "dinner"];
export const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
// Le repas selon l'heure du paiement : avant 10 h 30 déjeuner, avant 16 h dîner, sinon souper.
export function mealAt(hour, minute = 0) {
  const m = hour * 60 + minute;
  if (m < 4 * 60) return "dinner"; // tard le soir, après minuit
  if (m < 10 * 60 + 30) return "breakfast";
  return m < 16 * 60 ? "lunch" : "dinner";
}
// Texte de la dépense sur la facture : « Lunch », « Lunch · Shanghai », la description seule,
// puis la note si elle est à afficher : « Lunch — With J. Smith (supplier) »
export function expenseText(e) {
  const text = [MEAL_LABELS[e.meal], e.description].filter(Boolean).join(" · ");
  return e.showNote && e.note ? [text, e.note].filter(Boolean).join(" — ") : text;
}

export function normalizeAttachments(list) {
  return (Array.isArray(list) ? list : []).flatMap((a) => (a && typeof a.id === "string" && /^(image\/(jpeg|png)|application\/pdf)$/.test(a.type)
    ? [{ id: a.id, kind: ATTACHMENT_KINDS.includes(a.kind) ? a.kind : "other", type: a.type, name: str(a.name) }]
    : []));
}

export function normalizeExpense(e) {
  if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !EXPENSE_TYPES.includes(e.type)) return null;
  if (!e.projectId && !e.clientId) return null;
  const base = {
    id: e.id ?? newId(), date: e.date, type: e.type, description: str(e.description), projectId: e.projectId ?? null, clientId: e.projectId ? null : e.clientId,
    meal: e.type === "food" && MEALS.includes(e.meal) ? e.meal : null,
    note: str(e.note).replace(/\s+/g, " "), showNote: Boolean(e.showNote) && str(e.note) !== "",
    attachments: normalizeAttachments(e.attachments),
  };
  if (e.type === "mileage") {
    const qty = positive(e.qty);
    const unitPrice = positive(e.unitPrice);
    return qty && unitPrice ? { ...base, qty, amount: null, currency: "CAD", rate: 1, unitPrice } : null;
  }
  const amount = positive(e.amount);
  const currency = /^[A-Z]{3}$/.test(e.currency) ? e.currency : "CAD";
  const rate = currency === "CAD" ? 1 : positive(e.rate);
  return amount && rate ? { ...base, qty: 1, amount, currency, rate, unitPrice: null } : null;
}

export const normalizeExpenses = (list) => (Array.isArray(list) ? list.map(normalizeExpense).filter(Boolean) : []);

export function normalizeRates(rates) {
  const out = {};
  for (const [k, v] of Object.entries(rates && typeof rates === "object" ? rates : {})) {
    if (/^[A-Z]{3}$/.test(k) && k !== "CAD" && positive(v)) out[k] = Number(v);
  }
  return out;
}

// ---- Lectures ----

const projectOf = (ts, e) => ts.projects.find((p) => p.id === e.projectId) ?? null;
export const expenseClientId = (ts, e) => (e.projectId ? projectOf(ts, e)?.clientId ?? null : e.clientId);
export const dayExpenses = (ts, date) => ts.expenses.filter((e) => e.date === date);

// Dépenses d'une période, pour un client (ou tous), triées par date.
export function periodExpenses(ts, from, to, clientId = null) {
  return ts.expenses
    .filter((e) => e.date >= from && e.date <= to && (!clientId || expenseClientId(ts, e) === clientId))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---- Modifications ----

// Ajoute une dépense ; retient le taux de change de sa devise pour la prochaine fois.
export function addExpense(ts, fields) {
  const expense = normalizeExpense({ ...fields, id: newId() });
  if (!expense) return { ts, expense: null };
  const rates = expense.currency !== "CAD" ? { ...ts.rates, [expense.currency]: expense.rate } : ts.rates;
  return { ts: { ...ts, expenses: [...ts.expenses, expense], rates }, expense };
}

export function updateExpense(ts, id, patch) {
  return {
    ...ts,
    expenses: ts.expenses.map((e) => (e.id === id ? normalizeExpense({ ...e, ...patch }) ?? e : e)),
  };
}

export const removeExpense = (ts, id) => ({ ...ts, expenses: ts.expenses.filter((e) => e.id !== id) });

// Justificatifs d'une dépense : ajouter, changer le type (facture / preuve), retirer
export const addAttachment = (ts, expenseId, attachment) => updateExpense(ts, expenseId, {
  attachments: [...(ts.expenses.find((e) => e.id === expenseId)?.attachments ?? []), attachment],
});
export const updateAttachment = (ts, expenseId, id, patch) => updateExpense(ts, expenseId, {
  attachments: (ts.expenses.find((e) => e.id === expenseId)?.attachments ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
});
export const removeAttachment = (ts, expenseId, id) => updateExpense(ts, expenseId, {
  attachments: (ts.expenses.find((e) => e.id === expenseId)?.attachments ?? []).filter((a) => a.id !== id),
});
// Déplacer un justificatif vers une autre dépense (ex. scanné par erreur sur le kilométrage)
export function moveAttachment(ts, fromId, toId, id) {
  const a = ts.expenses.find((e) => e.id === fromId)?.attachments.find((x) => x.id === id);
  if (!a || fromId === toId || !ts.expenses.some((e) => e.id === toId)) return ts;
  return addAttachment(removeAttachment(ts, fromId, id), toId, a);
}
// Tous les fichiers utilisés (pour effacer ceux qui ne servent plus)
export const attachmentIds = (ts) => ts.expenses.flatMap((e) => e.attachments.map((a) => a.id));
export const setRate = (ts, currency, rate) => ({ ...ts, rates: normalizeRates({ ...ts.rates, [currency]: rate }) });

// ---- Dépenses mensuelles (ex. le cellulaire, facturé au début de chaque mois) ----
//
// Rangées dans doc.timesheet.recurring :
//   [{ id, type, description, projectId, clientId, amount, currency, rate, day, start, months }]
//   day : jour du mois (1 = le 1er ; 31 = le dernier jour des mois plus courts)
//   start : premier mois (« 2026-10 ») ; months : mois déjà ajoutés (une dépense
//   effacée à la main ne revient donc pas)
// Chaque mois, à partir du jour prévu, la dépense est ajoutée avec le mois dans sa
// description (« Cell Phone fees October 2026 ») ; elle se modifie comme les autres.

const MONTH = /^\d{4}-\d{2}$/;
const MONTH_EN = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
export const monthLabel = (month) => MONTH_EN.format(new Date(`${month}-15T12:00:00Z`));
const nextMonth = (m) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};
// Date du jour prévu dans un mois (le 31 devient le 30, ou le 28 en février…)
export function dayInMonth(month, day) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function normalizeRecurring(list) {
  return (Array.isArray(list) ? list : []).flatMap((r) => {
    const base = normalizeExpense({ ...r, date: "2000-01-01" });
    const day = Math.round(Number(r?.day));
    if (!base || isMileage(base) || !(day >= 1 && day <= 31) || !MONTH.test(r.start)) return [];
    const { date, qty, unitPrice, attachments, ...fields } = base;
    return [{ ...fields, day, start: r.start, months: (Array.isArray(r.months) ? r.months : []).filter((m) => MONTH.test(m)) }];
  });
}

// Nouvelle dépense mensuelle à partir d'une dépense (son jour, son mois de départ).
export function addRecurring(ts, expense) {
  const month = expense.date.slice(0, 7);
  const [rec] = normalizeRecurring([{ ...expense, id: newId(), day: Number(expense.date.slice(8)), start: month, months: [month] }]);
  return rec ? { ...ts, recurring: [...(ts.recurring ?? []), rec] } : ts;
}

export const updateRecurring = (ts, id, patch) => ({
  ...ts, recurring: normalizeRecurring((ts.recurring ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r))),
});
export const removeRecurring = (ts, id) => ({ ...ts, recurring: (ts.recurring ?? []).filter((r) => r.id !== id) });

// Ajoute les dépenses mensuelles arrivées à échéance (jusqu'à aujourd'hui) ; rien si tout est à jour.
export function syncRecurring(ts, today) {
  let changed = false;
  let next = ts;
  const recurring = (ts.recurring ?? []).map((r) => {
    const months = new Set(r.months);
    for (let m = r.start; m <= today.slice(0, 7); m = nextMonth(m)) {
      const date = dayInMonth(m, r.day);
      if (months.has(m) || date > today) continue;
      const { id, day, start, months: done, description, ...fields } = r;
      const added = addExpense(next, { ...fields, date, description: [description, monthLabel(m)].filter(Boolean).join(" ") });
      next = added.ts;
      months.add(m);
      changed = true;
    }
    return { ...r, months: [...months].sort() };
  });
  return changed ? { ...next, recurring } : ts;
}
