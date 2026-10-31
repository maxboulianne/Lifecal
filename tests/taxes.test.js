import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quarterInvoices, quarterOf, quarterRange, recordInvoice, removeInvoice, reportQuarter, salesTaxes, salesTotals, shiftQuarter,
} from "../js/timesheet/taxes.js";
import { emptyTimesheet, normalizeTimesheet } from "../js/timesheet/timesheet.js";

test("Trimestres : dates, voisins, celui à déclarer", () => {
  assert.equal(quarterOf("2026-04-24"), "2026-T2");
  assert.equal(quarterOf("2026-12-31"), "2026-T4");
  assert.deepEqual(quarterRange("2026-T2"), { from: "2026-04-01", to: "2026-06-30" });
  assert.deepEqual(quarterRange("2026-T1"), { from: "2026-01-01", to: "2026-03-31" });
  assert.deepEqual(quarterRange("2024-T1"), { from: "2024-01-01", to: "2024-03-31" });
  assert.equal(shiftQuarter("2026-T1", -1), "2025-T4");
  assert.equal(shiftQuarter("2026-T4", 1), "2027-T1");
  assert.equal(reportQuarter("2026-10-31"), "2026-T3"); // en octobre : juillet à septembre
  assert.equal(reportQuarter("2026-02-10"), "2025-T4");
});

test("Registre des factures : ajouter, remplacer par numéro, retirer, totaux du trimestre", () => {
  let ts = emptyTimesheet();
  const add = (number, date, subtotal, extra = {}) => {
    const r = recordInvoice(ts, { number, date, client: "Entreprise ABC", subtotal, ...salesTaxes(subtotal), ...extra });
    ts = r.ts;
    return r.invoice;
  };
  add("2026-001", "2026-04-24", 5678);
  add("2026-002", "2026-05-08", 5199);
  add("2026-003", "2026-07-03", 1000); // trimestre suivant
  const first = add("2026-001", "2026-04-24", 5600); // même numéro : remplacée
  assert.equal(ts.invoices.length, 3);
  assert.equal(ts.invoices.find((i) => i.number === "2026-001").subtotal, 5600);
  assert.equal(first.source, "manual");
  const q2 = quarterInvoices(ts, "2026-T2");
  assert.deepEqual(q2.map((i) => i.number), ["2026-001", "2026-002"]);
  assert.deepEqual(salesTotals(q2), { subtotal: 10799, tps: 539.95, tvq: 1077.20, total: 12416.15 });
  assert.deepEqual(salesTaxes(5678), { tps: 283.9, tvq: 566.38 }); // arrondies comme sur la facture
  assert.deepEqual(salesTaxes(100, { tvq: false }), { tps: 5, tvq: 0 });
  ts = removeInvoice(ts, first.id);
  assert.equal(quarterInvoices(ts, "2026-T2").length, 1);
  assert.equal(recordInvoice(ts, { number: "", date: "2026-04-01", subtotal: 5 }).invoice, null);
  // gardé dans les données (normalisation)
  const back = normalizeTimesheet(JSON.parse(JSON.stringify(ts)));
  assert.equal(back.invoices.length, 2);
  assert.equal(normalizeTimesheet({}).invoices.length, 0);
});
