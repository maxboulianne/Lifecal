import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addCategory, addEntry, emptyBudget, importRows, monthActuals, monthlyAmount, normalizeBudget, paymentCategory, plannedFromPayments,
  removeCategory, setCategory, suggestCategory, updateCategory,
} from "../js/budget/budget.js";
import { addPayment, markPaid, normalizePayments } from "../js/payments/payments.js";
import { migrate } from "../js/data/migrations.js";

// Relevé fictif (format des lignes lues dans un relevé Desjardins)
const rows = [
  { source: "caisse", account: "0001", date: "2026-10-02", seq: "1", description: "Dépôt direct /PAIE ENTREPRISE ABC", amount: -2500, orig: "" },
  { source: "caisse", account: "0001", date: "2026-10-05", seq: "2", description: "Paiement facture /HYDRO-QUEBEC", amount: 120.5, orig: "" },
  { source: "caisse", account: "0001", date: "2026-10-06", seq: "3", description: "Paiement /VISA DESJARDINS", amount: 800, orig: "" },
  { source: "visa", account: "1234", date: "2026-10-07", seq: "001", description: "IGA EXTRA #8123 LAVAL QC", amount: 152.3, orig: "" },
  { source: "visa", account: "1234", date: "2026-10-09", seq: "002", description: "RESTAURANT LE FICTIF MONTREAL QC", amount: 48, orig: "" },
  { source: "visa", account: "1234", date: "2026-10-12", seq: "003", description: "BOUTIQUE INCONNUE #44 QC", amount: 60, orig: "" },
  { source: "visa", account: "1234", date: "2026-10-14", seq: "004", description: "IGA EXTRA #8123 LAVAL QC", amount: -12.3, orig: "" },
];

test("Budget : catégories de départ et classement des opérations d'un relevé", () => {
  const b = emptyBudget();
  assert.ok(b.categories.some((c) => c.key === "groceries" && c.group === "variable"));
  assert.equal(suggestCategory(b, "Dépôt direct /PAIE ENTREPRISE ABC", -2500), "c-salary");
  assert.equal(suggestCategory(b, "Paiement /VISA DESJARDINS", 800), "c-transfers");
  assert.equal(suggestCategory(b, "Paiement facture /HYDRO-QUEBEC", 120.5), "c-electricity");
  assert.equal(suggestCategory(b, "BOUTIQUE INCONNUE #44 QC", 60), null);
  // Une facture payée au comptoir de la caisse
  assert.equal(suggestCategory(b, "PAIEMENT FACTURE BELL", 55), "c-phone");
});

test("Budget : import sans doublons, choix retenu par commerce, réel du mois", () => {
  let b = emptyBudget();
  let r = importRows(b, rows);
  assert.equal(r.added, 7);
  b = r.budget;
  r = importRows(b, rows);
  assert.equal(r.added, 0);
  assert.equal(r.skipped, 7);
  const unknown = b.entries.find((e) => e.description.startsWith("BOUTIQUE"));
  assert.equal(unknown.categoryId, null);
  b = setCategory(b, unknown.id, "c-shopping");
  assert.equal(b.rules["BOUTIQUE INCONNUE"], "c-shopping");
  // Le commerce retenu est classé au relevé suivant
  b = importRows(b, [{ ...rows[5], date: "2026-11-03", seq: "009" }]).budget;
  assert.equal(b.entries.at(-1).categoryId, "c-shopping");
  b = updateCategory(b, "c-groceries", { planned: 600 });
  b = updateCategory(b, "c-salary", { planned: "5 000" });
  const m = monthActuals(b, "2026-10");
  const row = (id) => m.rows.find((x) => x.category.id === id);
  assert.equal(m.imported, true);
  assert.equal(row("c-groceries").actual, 140); // 152,30 − 12,30 remboursé
  assert.equal(row("c-salary").actual, 2500);
  assert.equal(row("c-transfers").actual, 800); // pas compté dans les dépenses
  assert.equal(m.totals.income.planned, 5000);
  assert.equal(m.spent.actual, 120.5 + 140 + 48 + 60);
  assert.equal(m.balance.actual, 2500 - 368.5);
  assert.equal(m.unclassified.length, 0);
});

test("Budget : sans relevé, les paiements notés « payés » donnent le réel", () => {
  let pay = normalizePayments({});
  pay = addPayment(pay, { name: "Bell", scope: "personal", kind: "bill", freq: "monthly", start: "2026-11-10", amount: 55 }).payments;
  pay = addPayment(pay, { name: "Visa Desjardins", scope: "personal", kind: "card", freq: "monthly", start: "2026-11-15" }).payments;
  pay = addPayment(pay, { name: "Ma paie", scope: "business", kind: "pay", freq: "biweekly", start: "2026-11-05", amount: 2000 }).payments;
  pay = addPayment(pay, { name: "DAS", scope: "business", kind: "das", freq: "monthly", start: "2026-11-15", amount: 900 }).payments;
  const [bell, visa, mine, das] = pay.list;
  let b = emptyBudget();
  assert.equal(paymentCategory(b, bell), "c-phone");
  assert.equal(paymentCategory(b, visa), "c-cardPurchases");
  assert.equal(paymentCategory(b, mine), "c-salary");
  assert.equal(paymentCategory(b, das), null); // l'entreprise n'est pas dans le budget personnel
  assert.equal(paymentCategory(b, { ...bell, budgetCategory: "c-misc" }), "c-misc");
  assert.equal(monthlyAmount(mine), 4333.33);
  assert.deepEqual(plannedFromPayments(b, pay), { "c-phone": 55, "c-salary": 4333.33 });
  pay = markPaid(pay, bell.id, "2026-11-10", { date: "2026-11-09" });
  pay = markPaid(pay, visa.id, "2026-11-16", { date: "2026-11-14", amount: 640 });
  pay = markPaid(pay, mine.id, "2026-11-05", { date: "2026-11-05" });
  pay = markPaid(pay, das.id, "2026-11-16", { date: "2026-11-16" });
  const paidRows = pay.paid.map((paid) => ({ payment: pay.list.find((p) => p.id === paid.paymentId), paid }));
  b = addEntry(b, { date: "2026-11-02", amount: "35", categoryId: "c-gifts", description: "Cadeau" }).budget;
  const m = monthActuals(b, "2026-11", paidRows);
  const row = (id) => m.rows.find((x) => x.category.id === id).actual;
  assert.equal(m.imported, false);
  assert.equal(row("c-phone"), 55);
  assert.equal(row("c-cardPurchases"), 640);
  assert.equal(row("c-salary"), 2000);
  assert.equal(row("c-gifts"), 35);
  assert.equal(m.spent.actual, 730);
  // Un relevé importé pour ce mois : les paiements ne comptent plus (déjà dans le relevé)
  b = importRows(b, [{ ...rows[3], date: "2026-11-20" }]).budget;
  const m2 = monthActuals(b, "2026-11", paidRows);
  assert.equal(m2.imported, true);
  assert.equal(m2.rows.find((x) => x.category.id === "c-phone").actual, 0);
});

test("Budget : catégories ajoutées et retirées, données anciennes", () => {
  let b = emptyBudget();
  const r = addCategory(b, { name: "Animaux", group: "variable" });
  b = addEntry(r.budget, { date: "2026-11-01", amount: 20, categoryId: r.category.id }).budget;
  b = removeCategory(b, r.category.id);
  assert.equal(b.entries[0].categoryId, null);
  assert.equal(normalizeBudget(null).categories.length, emptyBudget().categories.length);
  assert.ok(migrate({ schemaVersion: 4, items: [] }).budget.categories.length > 10);
});

test("Budget : catégorie d'un paiement d'après son nom", () => {
  const b = emptyBudget();
  const p = (name) => ({ name, provider: "", scope: "personal", kind: "bill" });
  assert.equal(paymentCategory(b, p("Internet et télé")), "c-phone");
  assert.equal(paymentCategory(b, p("Électricité")), "c-electricity");
  assert.equal(paymentCategory(b, p("Loyer")), "c-housing");
  assert.equal(paymentCategory(b, p("Garderie")), "c-misc");
});
