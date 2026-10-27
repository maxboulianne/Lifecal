// Aperçu de la facture dans l'application : même présentation que la facture
// Excel (en-tête, facturé à / expédié à, lignes par jour, sommaire par projet,
// totaux, coordonnées). Imprimable ou enregistrable en PDF.

import { esc } from "../../core/dom.js";
import { fmt, t } from "../../i18n/index.js";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, INVOICE_LABELS as L, businessLine, taxNumbersLine } from "../../timesheet/invoice.js";

const money = (n) => esc(fmt.money(n));
const dash = (n) => (n ? money(n) : "-");
const hours = (n) => esc(fmt.fixed2(n));

function header(d) {
  const b = d.business;
  return `<header class="inv-head">
    <div>
      <h1 class="inv-title">${L.title}</h1>
      <p class="inv-company">${esc(b.name)}</p>
      <p class="inv-small">${esc(businessLine(d))}</p>
      ${b.email ? `<p class="inv-small">${esc(b.email)}</p>` : ""}
    </div>
    <table class="inv-box inv-meta">
      <tr><th>${L.invoice}</th><td><strong>${esc(d.number)}</strong></td></tr>
      <tr><th>${L.date}</th><td>${esc(d.date)}</td></tr>
      <tr><th>${L.po}</th><td>${esc(d.po)}</td></tr>
    </table>
  </header>
  <div class="inv-parties">
    ${[L.billedTo, L.shippedTo].map((title) => `<div><p class="inv-label">${title}</p>${d.clientLines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>`).join("")}
  </div>`;
}

function lines(d) {
  return `<table class="inv-lines">
    <thead><tr><th>${L.qty}</th><th>${L.unit}</th><th>${L.unitPrice}</th><th class="inv-desc">${L.description}</th><th>${L.totalPrice}</th></tr></thead>
    ${d.days.map((day) => `<tbody>
      <tr class="inv-day"><td colspan="3"></td><td colspan="2"><strong>${esc(day.date)} ${esc(day.weekday)}</strong></td></tr>
      ${day.lines.map((l) => `<tr>
        <td class="num">${hours(l.hours)}</td><td>${l.unit}</td><td class="num">${l.rate != null ? money(l.rate) : ""}</td>
        <td class="inv-desc">${esc(l.description)}</td><td class="num">${money(l.amount)}</td></tr>`).join("")}
    </tbody>`).join("")}
  </table>`;
}

function summary(d) {
  const s = d.summaryTotals;
  return `<p class="inv-section">${L.summary}</p>
  <table class="inv-box inv-summary">
    <thead><tr><th>${L.project}</th><th>${L.hours}</th><th>${L.rate}</th><th>${L.hoursAmount}</th>
      ${EXPENSE_CATEGORIES.map((c) => `<th>${CATEGORY_LABELS[c]}</th>`).join("")}<th>${L.totals}</th></tr></thead>
    <tbody>${d.summary.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${hours(r.hours)}</td>
      <td class="num">${r.rate != null ? money(r.rate) : ""}</td><td class="num">${dash(r.amount)}</td>
      ${EXPENSE_CATEGORIES.map((c) => `<td class="num">${dash(r.expenses[c])}</td>`).join("")}<td class="num">${dash(r.total)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><th>${L.totals}</th><th class="num">${hours(s.hours)}</th><th></th><th class="num">${dash(s.amount)}</th>
      ${EXPENSE_CATEGORIES.map((c) => `<th class="num">${dash(s.expenses[c])}</th>`).join("")}<th class="num">${dash(s.total)}</th></tr></tfoot>
  </table>`;
}

function footer(d) {
  const b = d.business;
  const x = d.totals;
  return `<div class="inv-foot">
    <div class="inv-contact">
      <p class="inv-label">${L.requests}</p>
      ${[b.contact, b.phone, b.email].filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join("")}
      <p class="inv-label">${L.cheque}</p>
      ${[b.name, L.attn, ...d.addressLines].filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join("")}
    </div>
    <table class="inv-box inv-totals">
      <tr><th>${L.subtotal}</th><td>${money(x.subtotal)}</td></tr>
      <tr><th>${L.advance}</th><td>${money(x.advance)}</td></tr>
      <tr><th>${L.due}</th><td>${money(x.due)}</td></tr>
      <tr><th>${L.tps}</th><td>${money(x.tps)}</td></tr>
      <tr><th>${L.tvq}</th><td>${money(x.tvq)}</td></tr>
      <tr><th>${L.freight}</th><td>${L.included}</td></tr>
      <tr class="inv-pay"><th>${L.pay}</th><td>${money(x.total)}</td></tr>
      <tr><th>${L.terms}</th><td>NET${esc(x.terms)}</td></tr>
      <tr><th>${L.dueDate}</th><td>${esc(x.dueDate)}</td></tr>
    </table>
  </div>
  <p class="inv-small">${esc(taxNumbersLine(b))}</p>
  <p class="inv-thanks">${L.thanks}</p>`;
}

// La facture seule (papier blanc), réutilisée pour l'impression.
export const invoiceDocument = (d) => `<article class="invoice-doc" lang="fr-CA">${header(d)}${lines(d)}${summary(d)}${footer(d)}</article>`;

// Fenêtre d'aperçu : la facture et ses boutons.
export function invoicePreview(d) {
  return `<div class="invoice-preview">
    <div class="invoice-tools">
      <h2 id="invoice-title">🧾 ${t("ts.invoicePreview")}</h2>
      <p class="hint">${t("ts.invoicePreviewHint")}</p>
      <div class="actions start">
        <button type="button" class="btn primary" data-action="ts-invoice-xlsx">📊 ${t("ts.createInvoice")}</button>
        <button type="button" class="btn soft" data-action="ts-invoice-print">🖨️ ${t("ts.printInvoice")}</button>
        <button type="button" class="btn ghost" data-action="close">${t("detail.close")}</button>
      </div>
    </div>
    <div class="invoice-scroll">${invoiceDocument(d)}</div>
  </div>`;
}
