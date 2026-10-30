// Aperçu de la facture dans l'application : même présentation que la facture
// Excel approuvée (logo, bleu marine et orange). Imprimable ou enregistrable en PDF.

import { esc } from "../../core/dom.js";
import { fmt, t } from "../../i18n/index.js";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, INVOICE_LABELS as L } from "../../timesheet/invoice.js";

// Montants et heures comme dans Excel : « 1 075,02 $ », « 4,50 », « – » pour zéro.
const money = (n) => esc(fmt.money(n));
const moneyDash = (n) => (n ? money(n) : "–");
const hours = (n) => esc(fmt.fixed2(n));
const hoursDash = (n) => (n ? hours(n) : "–");
const lines = (text) => esc(text).replace(/\n/g, "<br>");

function header(d) {
  const b = d.business;
  return `<header class="inv-top">
    <div class="inv-logo">${d.logo ? `<img src="${esc(d.logo)}" alt="">` : ""}</div>
    <div class="inv-heading"><h1>${L.title}</h1><p>${L.subtitle}</p></div>
  </header>
  <div class="inv-rule"></div>
  <div class="inv-meta">
    <div class="inv-from">
      <p class="inv-company">${esc(b.name)}</p>
      <p>${esc(d.addressLine)}</p>
      <p>${esc(d.contactLine)}</p>
      ${b.tpsNumber ? `<p class="inv-muted">${L.tps} ${esc(b.tpsNumber)}</p>` : ""}
      ${b.tvqNumber ? `<p class="inv-muted">${L.tvq} ${esc(b.tvqNumber)}</p>` : ""}
    </div>
    <table class="inv-refs">
      <tr><th>${L.number}</th><td class="inv-number">${esc(d.number)}</td></tr>
      <tr><th>${L.date}</th><td>${esc(d.date)}</td></tr>
      <tr><th>${L.po}</th><td>${esc(d.po)}</td></tr>
      <tr><th>${L.terms}</th><td>NET${esc(d.totals.terms)}</td></tr>
      <tr><th>${L.dueDate}</th><td class="inv-due">${esc(d.totals.dueDate)}</td></tr>
    </table>
  </div>`;
}

function parties(d) {
  const c = d.client;
  const block = (title, withEmail) => `<div>
    <p class="inv-kicker">${title}</p>
    <p class="inv-party">${esc(c.name)}</p>
    ${[c.attn, ...c.lines].filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join("")}
    ${withEmail && c.email ? `<p class="inv-muted">${esc(c.email)}</p>` : ""}
  </div>`;
  return `<div class="inv-parties">${block(L.billedTo, true)}${block(L.shippedTo, false)}</div>`;
}

function lineTable(d) {
  return `<table class="inv-lines">
    <thead><tr><th>${lines(L.qty)}</th><th>${L.unit}</th><th>${lines(L.unitPrice)}</th><th class="inv-desc">${L.description}</th><th>${L.total}</th></tr></thead>
    <tbody>${d.days.map((day) => `<tr class="inv-day"><td colspan="3">${esc(day.date)}</td><td colspan="2">${esc(day.weekday)}</td></tr>
      ${day.lines.map((l) => (l.kind === "expense"
        ? `<tr><td class="num">${hours(l.qty)}</td><td class="inv-unit">${l.unit}</td><td class="num">${moneyDash(l.unitPrice)}</td>`
        : `<tr><td class="num">${hours(l.hours)}</td><td class="inv-unit">HR</td><td class="num">${moneyDash(l.rate)}</td>`) + `
        <td class="inv-desc">${esc(l.text)}</td><td class="num inv-strong">${moneyDash(l.amount)}</td></tr>`).join("")}`).join("")}
    </tbody>
  </table>`;
}

function summary(d) {
  const s = d.summaryTotals;
  const cells = (r, h) => `<${h} class="num">${hoursDash(r.regHours)}</${h}><${h} class="num">${hoursDash(r.otHours)}</${h}><${h} class="num">${moneyDash(r.amount)}</${h}>
    ${EXPENSE_CATEGORIES.map((c) => `<${h} class="num">${moneyDash(r.expenses[c])}</${h}>`).join("")}<${h} class="num">${moneyDash(r.total)}</${h}>`;
  return `<p class="inv-section">${L.summary}</p>
  <table class="inv-summary">
    <thead><tr>${[L.project, L.regHours, L.otHours, L.hoursAmount, ...EXPENSE_CATEGORIES.map((c) => CATEGORY_LABELS[c]), L.total]
      .map((h) => `<th>${lines(h)}</th>`).join("")}</tr></thead>
    <tbody>${d.summary.map((r) => `<tr><td>${esc(r.project)}</td>${cells(r, "td")}</tr>`).join("")}</tbody>
    <tfoot><tr><th>${L.totals}</th>${cells(s, "th")}</tr></tfoot>
  </table>`;
}

function footer(d) {
  const b = d.business;
  const x = d.totals;
  return `<div class="inv-foot">
    <div class="inv-pay-to">
      <p class="inv-kicker">${L.cheque}</p>
      <p class="inv-company">${esc(b.name)}</p>
      <p>${L.receivable}</p>
      <p>${esc(d.addressLine)}</p>
      <p class="inv-kicker">${L.requests}</p>
      <p>${esc(d.requestsLine)}</p>
    </div>
    <div class="inv-totals">
      <table>
        <tr><th>${L.subtotal}</th><td>${moneyDash(x.subtotal)}</td></tr>
        <tr><th>${L.advance}</th><td>${moneyDash(x.advance)}</td></tr>
        <tr class="inv-strong"><th>${L.due}</th><td>${moneyDash(x.due)}</td></tr>
        <tr><th>${L.tpsLine}</th><td>${moneyDash(x.tps)}</td></tr>
        <tr><th>${L.tvqLine}</th><td>${moneyDash(x.tvq)}</td></tr>
        <tr><th>${L.freight}</th><td>${L.included}</td></tr>
      </table>
      <div class="inv-pay"><span>${L.pay}</span><strong>${money(x.total)}</strong></div>
      <p class="inv-due-line">${L.dueDate} : ${esc(x.dueDate)}  ·  NET${esc(x.terms)}</p>
    </div>
  </div>
  <div class="inv-rule thin"></div>
  <p class="inv-thanks">${L.thanks}</p>`;
}

// La facture seule (feuille blanche), réutilisée pour l'impression.
export const invoiceDocument = (d) => `<article class="invoice-doc" lang="fr-CA">${header(d)}${parties(d)}${lineTable(d)}${summary(d)}${footer(d)}</article>`;

// Fenêtre d'aperçu : la facture et ses boutons.
export function invoicePreview(d) {
  return `<div class="invoice-preview">
    <div class="invoice-tools">
      <h2 id="invoice-title">🧾 ${t("ts.invoicePreview")}</h2>
      <p class="hint">${t("ts.invoicePreviewHint")}</p>
      <div class="actions start">
        <button type="button" class="btn primary" data-action="ts-invoice-xlsx">📊 ${t("ts.createInvoice")}</button>
        <button type="button" class="btn soft" data-action="ts-invoice-pdf-pending">📄 ${t("ts.invoicePdf")}</button>
        <button type="button" class="btn soft" data-action="ts-invoice-email-pending">✉️ ${t("ts.sendToClient")}</button>
        <button type="button" class="btn soft" data-action="ts-invoice-print">🖨️ ${t("ts.printInvoice")}</button>
        <button type="button" class="btn ghost" data-action="close">${t("detail.close")}</button>
      </div>
    </div>
    <div class="invoice-scroll">${invoiceDocument(d)}</div>
  </div>`;
}
