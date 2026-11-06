import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TEMPLATES, addPayment, dueDates, dueSoon, history, markPaid, nextBusinessDay, normalizePayments, overdue, paymentOccurrences,
  removePayment, schedule, totals, unmarkPaid,
} from "../js/payments/payments.js";
import { migrate } from "../js/data/migrations.js";

const add = (payments, fields) => addPayment(payments, fields).payments;
const dues = (p, from, to) => dueDates(p, from, to).map((d) => d.due);

test("Paiements : échéances chaque mois, aux 3 mois, au dernier jour, aux 2 semaines", () => {
  let pay = normalizePayments({});
  pay = add(pay, { name: "Carte", scope: "personal", kind: "card", freq: "monthly", start: "2026-01-31" });
  pay = add(pay, { name: "DAS Québec", scope: "business", kind: "das", freq: "quarterly", start: "2026-01-15" });
  pay = add(pay, { name: "TPS/TVQ", scope: "business", kind: "salesTax", freq: "quarterly", start: "2026-01-31", lastDay: true });
  pay = add(pay, { name: "Ma paie", scope: "business", kind: "pay", freq: "biweekly", start: "2026-11-05" });
  const [card, rq, tax, mine] = pay.list;
  // Le 31 : le dernier jour des mois plus courts
  assert.deepEqual(dues(card, "2026-02-01", "2026-04-30"), ["2026-02-28", "2026-03-31", "2026-04-30"]);
  // DAS du Québec : 15 janvier, avril, juillet, octobre (le 15 août 2026 n'en est pas un)
  assert.deepEqual(dues(rq, "2026-01-01", "2026-12-31"), ["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]);
  // TPS/TVQ : un mois après la fin du trimestre ; le 31 janvier 2027 est un dimanche → lundi 1er février
  assert.deepEqual(dues(tax, "2026-04-01", "2027-02-28"), ["2026-04-30", "2026-07-31", "2026-11-02", "2027-02-01"]);
  // Aux 2 semaines, jamais avant la première date
  assert.deepEqual(dues(mine, "2026-10-01", "2026-12-10"), ["2026-11-05", "2026-11-19", "2026-12-03"]);
});

test("Paiements : jour ouvrable suivant (fin de semaine, congé férié)", () => {
  assert.equal(nextBusinessDay("2026-11-16"), "2026-11-16"); // lundi
  assert.equal(nextBusinessDay("2026-11-15"), "2026-11-16"); // dimanche
  assert.equal(nextBusinessDay("2026-06-24"), "2026-06-25"); // Fête nationale (mercredi)
  // Un paiement personnel ne se reporte pas
  const pay = add(normalizePayments({}), { name: "Bell", kind: "bill", freq: "monthly", start: "2026-11-15" });
  assert.deepEqual(dues(pay.list[0], "2026-11-01", "2026-11-30"), ["2026-11-15"]);
  // DAS fédérales du 15 novembre 2026 (dimanche) : le lundi 16
  const das = add(normalizePayments({}), { name: "DAS", scope: "business", kind: "das", freq: "monthly", start: "2026-11-15" });
  assert.deepEqual(dues(das.list[0], "2026-11-01", "2026-11-30"), ["2026-11-16"]);
});

test("Paiements : payé, historique, totaux, retard et rappels", () => {
  let pay = normalizePayments({});
  pay = add(pay, { name: "Visa", kind: "card", freq: "monthly", start: "2026-10-20", amount: "450,25" });
  pay = add(pay, { name: "Hydro", kind: "bill", freq: "monthly", start: "2026-11-10", auto: true });
  pay = add(pay, { name: "Cellulaire", kind: "bill", freq: "monthly", start: "2026-11-08", amount: 60 });
  const [visa, hydro, cell] = pay.list;
  assert.equal(visa.amount, 450.25);
  // Octobre pas payé : en retard au 6 novembre
  assert.deepEqual(overdue(pay, "2026-11-06").map((r) => r.due), ["2026-10-20"]);
  // Rappels : Visa en retard et le cellulaire dans 2 jours ; Hydro (prélèvement automatique) jamais
  assert.deepEqual(dueSoon(pay, "2026-11-06").map((r) => r.payment.name), ["Visa", "Cellulaire"]);
  pay = markPaid(pay, visa.id, "2026-10-20", { date: "2026-11-06", amount: "430" });
  pay = markPaid(pay, cell.id, "2026-11-08", { date: "2026-11-06" });
  assert.equal(overdue(pay, "2026-11-06").length, 0);
  assert.deepEqual(history(pay, visa.id).map((x) => [x.due, x.amount]), [["2026-10-20", 430]]);
  const rows = schedule(pay, "2026-11-01", "2026-11-30", "2026-11-06");
  assert.deepEqual(rows.map((r) => [r.payment.name, r.state]), [["Cellulaire", "paid"], ["Hydro", "upcoming"], ["Visa", "upcoming"]]);
  // Novembre : 60 (cellulaire, payé au montant prévu) + 450,25 (Visa) ; Hydro variable
  assert.deepEqual(totals(rows), { planned: 510.25, paid: 60, left: 450.25, unknown: 1 });
  pay = unmarkPaid(pay, cell.id, "2026-11-08");
  assert.equal(history(pay, cell.id).length, 0);
  pay = removePayment(pay, visa.id);
  assert.equal(pay.paid.length, 0);
  assert.equal(hydro.auto, true);
});

test("Paiements : modèles (DAS, TPS/TVQ) et calendrier", () => {
  const tpl = (key) => TEMPLATES.find((x) => x.key === key);
  assert.equal(tpl("dasFederal").start("2026-11-06"), "2026-11-15");
  assert.equal(tpl("dasFederal").start("2026-11-20"), "2026-12-15");
  assert.equal(tpl("dasQuebec").start("2026-11-06"), "2027-01-15");
  assert.equal(tpl("salesTax").start("2026-11-06"), "2027-01-31");
  assert.equal(tpl("salesTax").start("2026-10-12"), "2026-10-31");
  let pay = add(normalizePayments({}), { name: "Bell", kind: "bill", freq: "monthly", start: "2026-11-12" });
  pay = markPaid(pay, pay.list[0].id, "2026-11-12", { date: "2026-11-10" });
  const occ = paymentOccurrences(pay, "2026-11-01", "2026-12-31", "2026-11-06");
  assert.deepEqual(occ.map((o) => [o.date, o.module, o.done]), [["2026-11-12", "paiement", true], ["2026-12-12", "paiement", false]]);
  // Les anciennes données reçoivent une liste vide ; les paiements survivent à une copie
  assert.deepEqual(migrate({ schemaVersion: 4, items: [] }).payments, { list: [], paid: [] });
  assert.equal(migrate({ schemaVersion: 4, items: [], payments: pay }).payments.list[0].name, "Bell");
});

test("Paiements : le fournisseur s'affiche avec le nom (calendrier, budget)", async () => {
  const { paymentLabel } = await import("../js/payments/payments.js");
  const { emptyBudget, paymentCategory, monthActuals } = await import("../js/budget/budget.js");
  let pay = add(normalizePayments({}), { name: "Internet et télé", provider: "Bell", kind: "bill", freq: "monthly", start: "2026-11-12", amount: 95 });
  pay = add(pay, { name: "Électricité", provider: "Hydro-Québec", kind: "bill", freq: "monthly", start: "2026-11-20" });
  const [net, hydro] = pay.list;
  assert.equal(net.provider, "Bell");
  assert.equal(paymentLabel(net), "Internet et télé — Bell");
  assert.equal(paymentLabel({ name: "Loyer", provider: "" }), "Loyer");
  assert.equal(paymentOccurrences(pay, "2026-11-01", "2026-11-30", "2026-11-06")[0].title, "Internet et télé — Bell");
  // Le fournisseur aide à choisir la catégorie du budget
  assert.equal(paymentCategory(emptyBudget(), net), "c-phone");
  assert.equal(paymentCategory(emptyBudget(), hydro), "c-electricity");
  pay = markPaid(pay, net.id, "2026-11-12", { date: "2026-11-12" });
  const m = monthActuals(emptyBudget(), "2026-11", [{ payment: net, paid: pay.paid[0] }]);
  assert.equal(m.rows.find((r) => r.category.id === "c-phone").lines[0].description, "Internet et télé — Bell");
});
