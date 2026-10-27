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
//   rates    { VND: 0.000053931, … }   dernier taux de change utilisé pour chaque devise
// Le montant en dollars canadiens : arrondi au cent, comme sur la facture.

import { newId } from "../data/item.js";

export const EXPENSE_TYPES = ["food", "hotel", "transport", "mileage", "phone", "material"];
export const EXPENSE_ICONS = { food: "🍽️", hotel: "🏨", transport: "🚕", mileage: "🚗", phone: "📱", material: "🧰" };
// Colonne du sommaire de la facture (le kilométrage va dans « Transport »)
export const EXPENSE_CATEGORY = { food: "food", hotel: "hotel", transport: "transport", mileage: "transport", phone: "phone", material: "material" };
export const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "MXN", "CNY", "JPY", "KRW", "VND", "THB", "INR", "PHP", "IDR", "MYR", "SGD", "AUD", "CHF"];
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

export function normalizeExpense(e) {
  if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !EXPENSE_TYPES.includes(e.type)) return null;
  if (!e.projectId && !e.clientId) return null;
  const base = { id: e.id ?? newId(), date: e.date, type: e.type, description: str(e.description), projectId: e.projectId ?? null, clientId: e.projectId ? null : e.clientId };
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
export const setRate = (ts, currency, rate) => ({ ...ts, rates: normalizeRates({ ...ts.rates, [currency]: rate }) });
