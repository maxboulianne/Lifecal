import { test } from "node:test";
import assert from "node:assert/strict";
import { amountsIn, findDate, findMerchant, findTime, invoiceTotal, parseReceipt, receiptExpense } from "../js/scan/receipt.js";
import { emptyTimesheet } from "../js/timesheet/timesheet.js";
import { addExpense, expenseText, mealAt, moveAttachment, addAttachment } from "../js/timesheet/expenses.js";

// Textes inventés, tels que l'OCR les rend (avec ses petites erreurs)
const INVOICE = `BISTRO DU COIN
123 rue Imaginaire, Laval QC
2026-09-22 12:44:31
ADDITION #1234
1 PATES ROSEE 25.00 FP
1 SALADE 14.00 FP
SOUS-TOTAL : 1148.00
TPS: 123456789RT0001
TPS $5.20
TVQ $10.37
TOTAL $54.57
MERCI !`;

const PROOF = `— DOSSIER DE TRANSACTION ="
Bistro du Coin
Achat
22 Sept 2026 12:45:41
VISA ************0000
Sous-total 54,57$
Montant 54,57 $
Paurhoire 1000 $
Total 64,57 $
Approuvée`;

const PROOF_SALE = `Café Exemple
Total 30,00 $
Pourboire 4,50 $
VENTE : CARTE DE 34,50 $
15-oct.-2026 12h39min35s p.m.
34,50 $ | Méthode : SANS CONTACT`;

test("Reçu : montants à deux décimales, séparateurs de milliers, pas les dates", () => {
  assert.deepEqual(amountsIn("Total 1 075,02 $"), [1075.02]);
  assert.deepEqual(amountsIn("TOTAL $170.16"), [170.16]);
  assert.deepEqual(amountsIn("le 15.10.2026 à 12:39"), []);
  assert.deepEqual(amountsIn("Pourboire 2552 $"), []);
  assert.deepEqual(amountsIn("1,234.50 et 2.345,60"), [1234.5, 2345.6]);
});

test("Reçu : dates en plusieurs formats", () => {
  assert.equal(findDate("2026-09-22 12:44"), "2026-09-22");
  assert.equal(findDate("15-oct.-2026 12h39"), "2026-10-15");
  assert.equal(findDate("22 Sept 2026"), "2026-09-22");
  assert.equal(findDate("Oct 3, 2026"), "2026-10-03");
  assert.equal(findDate("15/10/2026"), "2026-10-15");
  assert.equal(findDate("2626-18-15"), null); // illisible : rien plutôt qu'une fausse date
  assert.equal(findDate("aucune date"), null);
});

test("Reçu : le commerce est la première ligne qui ressemble à un nom", () => {
  assert.equal(findMerchant(INVOICE), "Bistro Du Coin");
  assert.equal(findMerchant(PROOF), "Bistro du Coin"); // saute « DOSSIER DE TRANSACTION »
  assert.equal(findMerchant("438 555 0100\n** Pizzeria Test **"), "Pizzeria Test");
});

test("Reçu : le total ignore le sous-total, et la preuve compte le pourboire", () => {
  const inv = parseReceipt(INVOICE);
  assert.equal(inv.total, 54.57); // pas le « SOUS-TOTAL 1148.00 » mal lu
  assert.equal(inv.date, "2026-09-22");
  assert.equal(parseReceipt(PROOF).total, 64.57);
  assert.equal(parseReceipt(PROOF_SALE).total, 34.5);
  assert.equal(parseReceipt("Coût 12,00\nautre 15,50").total, 15.5); // sans mot « total » : le plus grand
  assert.equal(parseReceipt("").total, null);
  assert.equal(parseReceipt("Total 20,00 €").currency, "EUR");
});

test("Reçu : la dépense proposée prend le montant de la preuve de transaction", () => {
  const invoice = parseReceipt(INVOICE);
  const proof = parseReceipt(PROOF);
  // Le commerce n'est pas nommé : seulement le repas, selon l'heure du paiement
  assert.deepEqual(receiptExpense({ invoice, proof }), { invoiceTotal: 54.57, tip: 10, meal: "lunch", date: "2026-09-22", amount: 64.57, currency: null });
  assert.equal(receiptExpense({ invoice }).amount, 54.57); // sans preuve : le total de la facture
  assert.equal(receiptExpense({ proof: parseReceipt("Total 20,00\n7:45 AM") }).meal, "breakfast");
  assert.equal(receiptExpense({ proof: parseReceipt("Total 80,00\n2026-10-01 19:12") }).meal, "dinner");
  assert.deepEqual(receiptExpense(), { invoiceTotal: null, tip: null, meal: null, date: null, amount: null, currency: null }); // sans heure : « Food »
});

test("Justificatif déplacé d'une dépense à une autre", () => {
  let ts = { ...emptyTimesheet(), clients: [{ id: "c1", name: "Entreprise ABC" }] };
  const a = addExpense(ts, { date: "2026-10-15", type: "mileage", clientId: "c1", qty: 100, unitPrice: 0.65 });
  const b = addExpense(a.ts, { date: "2026-10-15", type: "food", clientId: "c1", amount: 34.5 });
  ts = addAttachment(b.ts, a.expense.id, { id: "f1", kind: "proof", type: "image/jpeg", name: "" });
  const moved = moveAttachment(ts, a.expense.id, b.expense.id, "f1");
  assert.deepEqual(moved.expenses.find((e) => e.id === a.expense.id).attachments, []);
  assert.deepEqual(moved.expenses.find((e) => e.id === b.expense.id).attachments.map((x) => x.id), ["f1"]);
  assert.equal(moveAttachment(ts, a.expense.id, "inconnu", "f1"), ts);
});

test("Repas : selon l'heure, et sur la facture en anglais", () => {
  assert.deepEqual(findTime("15-oct.-2026 12h39min35s p.m."), { hour: 12, minute: 39 });
  assert.deepEqual(findTime("7:15 PM"), { hour: 19, minute: 15 });
  assert.equal(findTime("ID: 055574"), null);
  assert.deepEqual([mealAt(7, 30), mealAt(10, 29), mealAt(10, 30), mealAt(15, 59), mealAt(16, 0), mealAt(1, 0)],
    ["breakfast", "breakfast", "lunch", "lunch", "dinner", "dinner"]);
  let ts = { ...emptyTimesheet(), clients: [{ id: "c1", name: "Entreprise ABC" }] };
  const { expense } = addExpense(ts, { date: "2026-10-15", type: "food", meal: "lunch", clientId: "c1", amount: 34.5 });
  assert.equal(expenseText(expense), "Lunch");
  assert.equal(expenseText({ ...expense, description: "Shanghai" }), "Lunch · Shanghai");
  assert.equal(expenseText({ ...expense, meal: null }), ""); // « Repas / Food » seul sur la facture
  // Un repas seulement pour la nourriture
  assert.equal(addExpense(ts, { date: "2026-10-15", type: "hotel", meal: "lunch", clientId: "c1", amount: 100 }).expense.meal, null);
});

test("Reçu : un article mal lu ne devient pas le total de la facture", () => {
  // « $26.00 » lu « 826.00 », « TOTAL » lu « TOTAI » : le total vient après les taxes
  const misread = parseReceipt("BISTRO TEST\n1 PATES 826.00 FP\n1 SALADE $31.00 FP\nSOUS-TOTAL : $148.00\nTVQ $14.76\nTOTAI $170.16");
  assert.equal(misread.total, 170.16);
  assert.equal(parseReceipt("1 PATES 826.00\nTVQ $14.76\n$170.16").total, 170.16);
  // Avec la preuve : jamais plus que ce qui a été payé, ni moins de la moitié
  const bad = { total: 826, amounts: [826, 31, 14.76, 170.16, 0.16] };
  assert.equal(invoiceTotal(bad, 195.68), 170.16);
  assert.equal(invoiceTotal({ total: 0.16, amounts: [0.16, 170.16] }, 195.68), 170.16);
  assert.equal(invoiceTotal(bad), 826); // sans preuve, on ne peut pas vérifier
  const r = receiptExpense({ invoice: bad, proof: parseReceipt("Total 195,68 $") });
  assert.equal(r.invoiceTotal, 170.16);
  assert.equal(r.tip, 25.52);
  assert.equal(r.amount, 195.68);
});

test("Note de justification : sur la facture seulement si on la coche", () => {
  const ts = { ...emptyTimesheet(), clients: [{ id: "c1", name: "Entreprise ABC" }] };
  const base = { date: "2026-10-15", type: "food", meal: "lunch", clientId: "c1", amount: 80, note: "  With J. Smith   (supplier) " };
  const hidden = addExpense(ts, base).expense;
  assert.equal(hidden.note, "With J. Smith (supplier)");
  assert.equal(hidden.showNote, false);
  assert.equal(expenseText(hidden), "Lunch");
  const shown = addExpense(ts, { ...base, showNote: true, description: "Laval" }).expense;
  assert.equal(expenseText(shown), "Lunch · Laval — With J. Smith (supplier)");
  const tool = addExpense(ts, { date: "2026-10-15", type: "material", clientId: "c1", amount: 20, note: "Paint thickness gauge", showNote: true }).expense;
  assert.equal(expenseText(tool), "Paint thickness gauge");
  assert.equal(addExpense(ts, { ...base, note: "", showNote: true }).expense.showNote, false); // rien à afficher
});

// Reçus inventés dans d'autres langues, tels que l'OCR les rend
const VIE = `NHÀ HÀNG PHỞ MẪU
Hóa đơn thanh toán
Ngày: 15/10/2026 19:05
Phở bò 2 x 65.000 130.000
Trà đá 2 x 5.000 10.000
Tạm tính 140.000
Thuế VAT 8% 11.200
Tổng cộng: 151.200 đ
Tiền khách đưa 200.000
Tiền thừa 48.800`;
const CHI = `餐厅测试
2026年10月16日 12:30
宫保鸡丁 1 38.00
米饭 2 4.00
小计 46.00
合计：¥46.00
实收 100.00 现金
找零 54.00`;
const KOR = `테스트 식당
2026.10.17 오후 7:15
비빔밥 2 24,000
소계 24,000
부가세 2,400
합계 26,400원
결제금액 26,400`;
const POR = `RESTAURANTE EXEMPLO
18/10/2026 13:10
Prato do dia 45,90
Subtotal R$ 45,90
Gorjeta 10% 4,59
Total R$ 50,49
Cartão de crédito`;
const ARA = `مطعم تجريبي
2026-10-19 20:40
المجموع الفرعي ٨٠٫٠٠
ضريبة ٤٫٠٠
الإجمالي ٨٤٫٠٠ د.إ`;
const USA = `TEST DINER
10/05/2026 8:12 AM
Subtotal 18.50
Tax 1.64
Total $20.14
Tip 4.00
Amount paid $24.14`;

test("Reçus étrangers : devise, montants sans décimales, total, date et heure", () => {
  const v = parseReceipt(VIE);
  assert.equal(v.currency, "VND");
  assert.equal(v.total, 151200); // pas l'argent remis (200 000)
  assert.equal(v.date, "2026-10-15");
  assert.deepEqual(v.time, { hour: 19, minute: 5 });
  const c = parseReceipt(CHI);
  assert.equal(c.currency, "CNY");
  assert.equal(c.total, 46); // pas le « 实收 100.00 » payé en espèces
  assert.equal(c.date, "2026-10-16");
  const k = parseReceipt(KOR);
  assert.equal(k.currency, "KRW");
  assert.equal(k.total, 26400);
  assert.equal(k.date, "2026-10-17");
  assert.equal(receiptExpense({ proof: k }).meal, "dinner"); // 오후 7:15 = 19 h 15
  const p = parseReceipt(POR);
  assert.equal(p.currency, "BRL");
  assert.equal(p.total, 50.49);
  assert.equal(p.date, "2026-10-18");
  const a = parseReceipt(ARA);
  assert.equal(a.currency, "AED");
  assert.equal(a.total, 84);
  const u = parseReceipt(USA, { currency: "USD" }); // « $ » seul : la devise du formulaire
  assert.equal(u.currency, null);
  assert.equal(u.total, 24.14);
  assert.equal(u.date, "2026-10-05"); // mm/jj aux États-Unis
  assert.equal(receiptExpense({ proof: u }).meal, "breakfast");
  // La devise du formulaire sert quand le reçu ne la dit pas
  assert.equal(parseReceipt("Tổng cộng 85.000", { currency: "VND" }).total, 85000);
  assert.equal(parseReceipt("Tổng cộng 85.000").total, null); // sans devise : 85.000 n'est pas un montant à 2 décimales
});

test("Reçus étrangers : textes et chiffres normalisés", () => {
  assert.deepEqual(amountsIn("合计：58元"), [58]);
  assert.deepEqual(amountsIn("Tổng 1.250.000", { whole: true }), [1250000]);
  assert.deepEqual(amountsIn("VISA ****1041 2026", { whole: true }), []); // carte masquée, année
  assert.equal(findDate("ngày 15 tháng 10 năm 2026"), "2026-10-15");
  assert.equal(findDate("18 de outubro de 2026"), "2026-10-18");
  assert.equal(findDate("3. Okt. 2026"), "2026-10-03");
  assert.equal(findDate("15 dic 2026"), "2026-12-15");
  assert.deepEqual(findTime("下午 1:20"), { hour: 13, minute: 20 });
});
