// Section « Taxes (TPS/TVQ) » de « Mes heures » : le trimestre à déclarer et le registre
// des factures émises (ventes, TPS et TVQ perçues : lignes 101, 103 et 203).
// Les factures créées dans l'application s'y inscrivent toutes seules ; celles faites
// ailleurs (Excel) s'ajoutent à la main.

import { esc } from "../../core/dom.js";
import { fmt, getLanguage, t } from "../../i18n/index.js";
import { quarterInvoices, quarterRange, salesTotals } from "../../timesheet/taxes.js";
import { foldSection, isFoldOpen } from "./fold.js";

// « avril – juin 2026 »
export function quarterLabel(key) {
  const { from, to } = quarterRange(key);
  const month = (iso) => new Intl.DateTimeFormat(getLanguage(), { month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  return `${month(from)} – ${month(to)} ${from.slice(0, 4)}`;
}

const money = (n) => esc(fmt.money(n));

function invoiceForm(ts, quarter, editing) {
  const e = editing;
  const { from } = quarterRange(quarter);
  const clientId = e?.clientId ?? (ts.clients.length === 1 ? ts.clients[0].id : "");
  const amount = (n) => (n === undefined || n === null ? "" : esc(fmt.hours(n)));
  return `<form class="form ts-new ts-tax-form" data-role="ts-tax-invoice" ${e ? `data-edit="${esc(e.id)}"` : ""}>
    ${e ? `<h4>✏️ ${t("tax.editInvoice")}</h4>` : ""}
    <div class="row">
      <label>${t("ts.invoiceNumber")} <input name="number" value="${esc(e?.number ?? "")}" placeholder="${esc(t("ts.example", { value: "2026-107" }))}" autocomplete="off" required></label>
      <label>${t("ts.invoiceDate")} <input name="date" type="date" value="${esc(e?.date ?? from)}" required></label>
    </div>
    <label>${t("ts.client")} <select name="clientId">
      ${ts.clients.map((c) => `<option value="${esc(c.id)}" ${c.id === clientId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
      <option value="" ${clientId ? "" : "selected"}>${esc(t("tax.otherClient"))}</option></select></label>
    <label data-role="tax-client-name" ${clientId ? "hidden" : ""}>${t("tax.clientName")} <input name="client" value="${esc(e && !e.clientId ? e.client : "")}" autocomplete="off"></label>
    <div class="row three">
      <label>${t("tax.subtotal")} <input name="subtotal" inputmode="decimal" value="${amount(e?.subtotal)}" placeholder="${esc(t("ts.example", { value: "5 678,00" }))}" autocomplete="off" required></label>
      <label>${t("tax.tps")} <input name="tps" inputmode="decimal" value="${amount(e?.tps)}" placeholder="${esc(t("tax.auto"))}" autocomplete="off"></label>
      <label>${t("tax.tvq")} <input name="tvq" inputmode="decimal" value="${amount(e?.tvq)}" placeholder="${esc(t("tax.auto"))}" autocomplete="off"></label>
    </div>
    <p class="hint">${t("tax.formHint")}</p>
    <p class="form-errors" data-role="errors" role="alert"></p>
    <div class="actions">
      ${e ? `<button type="button" class="btn ghost" data-action="ts-tax-cancel">${t("form.cancel")}</button>` : ""}
      <button type="submit" class="btn primary">${t(e ? "ts.saveChanges" : "tax.addInvoice")}</button>
    </div>
  </form>`;
}

export function taxesSection(ts, quarter, editingId) {
  const list = quarterInvoices(ts, quarter);
  const editing = (ts.invoices ?? []).find((i) => i.id === editingId) ?? null;
  const x = salesTotals(list);
  const table = list.length ? `<div class="ts-tax-scroll"><table class="ts-summary ts-tax-table">
      <thead><tr><th>${t("tax.invoice")}</th><th>${t("tax.date")}</th><th>${t("ts.client")}</th><th>${t("tax.subtotal")}</th><th>TPS</th><th>TVQ</th><th>${t("tax.total")}</th><th></th></tr></thead>
      <tbody>${list.map((i) => `<tr class="${i.id === editingId ? "is-editing" : ""}">
        <td><strong>${esc(i.number)}</strong>${i.source === "app" ? ` <span class="hint" title="${esc(t("tax.fromApp"))}">⏱️</span>` : ""}</td>
        <td>${esc(i.date)}</td><td>${esc(i.client)}</td>
        <td>${money(i.subtotal)}</td><td>${money(i.tps)}</td><td>${money(i.tvq)}</td><td>${money(i.subtotal + i.tps + i.tvq)}</td>
        <td class="ts-tax-actions">
          <button type="button" class="ts-expense-edit-btn" data-action="ts-tax-edit" data-id="${esc(i.id)}" aria-label="${esc(t("tax.editInvoice"))}">✏️</button>
          <button type="button" class="check-remove" data-action="ts-tax-remove" data-id="${esc(i.id)}" aria-label="${esc(t("ts.remove"))}">×</button>
        </td></tr>`).join("")}</tbody>
      <tfoot><tr><th colspan="3">${t("tax.salesTotal", { count: list.length })}</th>
        <th>${money(x.subtotal)}</th><th>${money(x.tps)}</th><th>${money(x.tvq)}</th><th>${money(x.total)}</th><th></th></tr>
        <tr class="ts-tax-lines"><td colspan="3"></td><td>${t("tax.line", { line: 101 })}</td><td>${t("tax.line", { line: 103 })}</td><td>${t("tax.line", { line: 203 })}</td><td colspan="2"></td></tr></tfoot>
    </table></div>` : `<p class="ts-empty-export">${t("tax.noInvoices")}</p>`;
  return foldSection("ts-taxes", {
    title: `🧾 ${esc(t("tax.title"))}`,
    extra: esc(quarterLabel(quarter)),
    open: isFoldOpen("ts-taxes", false),
    body: `<div class="ts-tax-quarter">
        <button type="button" class="btn soft" data-action="ts-tax-quarter" data-step="-1" aria-label="${esc(t("tax.prevQuarter"))}">‹</button>
        <strong>${esc(quarterLabel(quarter))}</strong>
        <button type="button" class="btn soft" data-action="ts-tax-quarter" data-step="1" aria-label="${esc(t("tax.nextQuarter"))}">›</button>
      </div>
      <h3>${t("tax.collected")}</h3>
      <p class="hint">${t("tax.collectedHint")}</p>
      ${table}
      ${editing ? invoiceForm(ts, quarter, editing) : `<details class="ts-new-wrap" ${list.length ? "" : "open"}>
        <summary class="btn soft">＋ ${t("tax.addInvoice")}</summary>${invoiceForm(ts, quarter, null)}</details>`}
      <p class="hint ts-tax-next">${t("tax.nextSteps")}</p>`,
  });
}
