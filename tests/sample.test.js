import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_INVOICE, SAMPLE_QUARTER, sampleTimesheet } from "../js/timesheet/sample.js";
import { INVOICE_LABELS, invoiceData, invoiceSheets, subtitleOf } from "../js/timesheet/invoice.js";
import { taxReportData } from "../js/timesheet/tax-report.js";

test("Exemples : facture et rapport faits de données fictives", () => {
  const ts = sampleTimesheet();
  const d = invoiceData(ts, SAMPLE_INVOICE);
  assert.equal(d.sample, true);
  assert.equal(d.totals.hours, 60);
  assert.equal(subtitleOf(INVOICE_LABELS, d), "INVOICE  ·  EXEMPLE / SAMPLE");
  assert.equal(subtitleOf(INVOICE_LABELS, {}), "INVOICE");
  assert.ok(invoiceSheets(ts, SAMPLE_INVOICE).sheets.length);
  const r = taxReportData(ts, SAMPLE_QUARTER, { sample: true });
  assert.equal(r.sample, true);
  assert.equal(r.invoices.length, 3);
  assert.equal(r.toCheck, 0);
  assert.equal(r.lines[103], r.sales.tps);
  assert.ok(r.paid.some((g) => g.key === "homeCharging" && g.tps > 0));
  assert.equal(r.balance.total, Math.round((r.lines[109] + r.lines[209]) * 100) / 100);
});
