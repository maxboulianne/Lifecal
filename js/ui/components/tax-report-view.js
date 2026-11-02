// Aperçu du rapport TPS / TVQ du trimestre (même contenu que l'Excel et le PDF) :
// taxes perçues, taxes payées, solde à remettre et lignes de la déclaration.

import { esc } from "../../core/dom.js";
import { fmt, t } from "../../i18n/index.js";
import { REPORT_LABELS as L } from "../../timesheet/tax-report.js";

const money = (n) => esc(fmt.money(n));

export function taxReportPreview(d) {
  const b = d.business;
  return `<div class="tax-report">
    <h2 id="tax-report-title">📄 ${t("tax.report")}</h2>
    <p class="hint">${t("tax.reportHint")}</p>
    <div class="actions start">
      <button type="button" class="btn primary" data-action="ts-tax-report-xlsx">📊 ${t("tax.reportExcel")}</button>
      <button type="button" class="btn soft" data-action="ts-tax-report-pdf">📄 ${t("tax.reportPdf")}</button>
      <button type="button" class="btn ghost" data-action="close">${t("detail.close")}</button>
    </div>
    <article class="tax-report-doc">
      <header class="tax-report-top">
        <div>${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ""}</div>
        <div class="tax-report-heading"><h3>${L.title}</h3><p>${L.subtitle}</p></div>
      </header>
      <div class="tax-report-meta">
        <div><p class="tax-report-company">${esc(b.name)}</p><p>${esc(b.addressLine)}</p>
          ${b.tpsNumber ? `<p class="hint">${L.tps} ${esc(b.tpsNumber)}</p>` : ""}${b.tvqNumber ? `<p class="hint">${L.tvq} ${esc(b.tvqNumber)}</p>` : ""}</div>
        <div class="tax-report-period"><strong>${esc(d.period)}</strong><span>${esc(d.from)} → ${esc(d.to)}</span></div>
      </div>
      ${d.toCheck ? `<p class="tax-report-warn">⚠️ ${esc(L.toCheck(d.toCheck))}</p>` : ""}
      <p class="tax-report-section">${L.collected}</p>
      <div class="ts-tax-scroll"><table class="ts-summary tax-report-table is-invoices">
        <thead><tr><th>${L.invoice}</th><th>${L.date}</th><th>${L.client}</th><th>${L.subtotal}</th><th>${L.tpsCol}</th><th>${L.tvqCol}</th></tr></thead>
        <tbody>${d.invoices.map((i) => `<tr><td>${esc(i.number)}</td><td>${esc(i.date)}</td><td>${esc(i.client)}</td>
          <td>${money(i.subtotal)}</td><td>${money(i.tps)}</td><td>${money(i.tvq)}</td></tr>`).join("") || `<tr><td colspan="6">${L.noInvoices}</td></tr>`}</tbody>
        <tfoot><tr><th colspan="3">${L.salesTotal}</th><th>${money(d.sales.subtotal)}</th><th>${money(d.sales.tps)}</th><th>${money(d.sales.tvq)}</th></tr></tfoot>
      </table></div>
      <p class="tax-report-section">${L.paid}</p>
      <div class="ts-tax-scroll"><table class="ts-summary tax-report-table">
        <thead><tr><th>${L.group}</th><th>${L.count}</th><th>${L.beforeTax}</th><th>${L.tpsHstCol}</th><th>${L.tvqCol}</th></tr></thead>
        <tbody>${d.paid.map((g) => `<tr><td>${esc(g.label)}</td><td>${g.count}</td><td>${money(g.amount)}</td><td>${money(g.tps)}</td><td>${money(g.tvq)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><th colspan="3">${L.paidTotal}</th><th>${money(d.paidTotals.tps)}</th><th>${money(d.paidTotals.tvq)}</th></tr></tfoot>
      </table></div>
      <p class="tax-report-section">${L.balance}</p>
      <div class="ts-tax-balance">
        <dl><div><dt>TPS / GST (109)</dt><dd>${money(d.balance.tps)}</dd></div><div><dt>TVQ / QST (209)</dt><dd>${money(d.balance.tvq)}</dd></div>
          <div class="total"><dt>${L.total}</dt><dd>${money(d.balance.total)}</dd></div></dl>
      </div>
      <p class="tax-report-section">${L.lines}</p>
      <table class="ts-summary tax-report-lines">
        <tbody>${[101, 103, 106, 109, 203, 206, 209].map((no) => `<tr class="${no === 109 || no === 209 ? "is-net" : ""}"><td>${no}</td><td>${esc(L.lineLabels[no])}</td><td>${money(d.lines[no])}</td></tr>`).join("")}</tbody>
      </table>
    </article>
  </div>`;
}
