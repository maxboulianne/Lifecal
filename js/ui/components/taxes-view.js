// Section « Taxes (TPS/TVQ) » de « Mes heures » : le trimestre à déclarer et le registre
// des factures émises (ventes, TPS et TVQ perçues : lignes 101, 103 et 203).
// Les factures créées dans l'application s'y inscrivent toutes seules ; celles faites
// ailleurs (Excel) s'ajoutent à la main.

import { esc } from "../../core/dom.js";
import { fmt, getLanguage, t } from "../../i18n/index.js";
import { quarterInvoices, quarterRange, salesTotals } from "../../timesheet/taxes.js";
import { PURCHASE_CHOICES, choiceKey, purchaseTotals, quarterPurchases } from "../../timesheet/purchases.js";
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


// ---- Taxes payées : achats tirés des relevés ----

const GROUPS = ["taxable", "mixed", "meal", "exempt", "excluded"];

function purchaseRow(p) {
  return `<li class="ts-purchase ${p.status === "check" ? "is-check" : ""}">
    <div class="ts-purchase-text">
      <span class="ts-purchase-desc">${esc(p.description)}</span>
      <span class="hint">${esc(p.date)} · ${esc(t(`tax.source.${p.source}`))}${p.orig ? ` · ${esc(p.orig)}` : ""}${p.status === "check" && p.note ? ` · ${esc(t(`tax.why.${p.note}`))}` : ""}</span>
    </div>
    <span class="ts-purchase-amount">${money(p.amount)}</span>
    <select data-action="ts-purchase-cat" data-id="${esc(p.id)}" aria-label="${esc(t("tax.category"))}">
      ${PURCHASE_CHOICES.map((c) => `<option value="${choiceKey(c)}" ${choiceKey(c) === choiceKey(p) ? "selected" : ""}>${esc(t(`tax.choice.${c.category}.${c.pct}`))}</option>`).join("")}
    </select>
    ${p.status === "check" ? `<button type="button" class="btn soft ts-purchase-ok" data-action="ts-purchase-ok" data-id="${esc(p.id)}" aria-label="${esc(t("tax.confirm"))}" title="${esc(t("tax.confirm"))}">✓</button>` : ""}
    <button type="button" class="check-remove" data-action="ts-purchase-remove" data-id="${esc(p.id)}" aria-label="${esc(t("ts.remove"))}">×</button>
  </li>`;
}

function purchasesBlock(ts, quarter, sales) {
  const list = quarterPurchases(ts, quarter);
  const x = purchaseTotals(list);
  const toCheck = list.filter((p) => p.status === "check");
  const summary = list.length ? `<div class="ts-tax-scroll"><table class="ts-summary ts-purchase-summary">
      <thead><tr><th>${t("tax.category")}</th><th>${t("tax.count")}</th><th>${t("tax.amount")}</th><th>TPS</th><th>TVQ</th></tr></thead>
      <tbody>${GROUPS.filter((g) => x.groups[g]).map((g) => `<tr><td>${esc(t(`tax.group.${g}`))}</td><td>${x.groups[g].count}</td>
        <td>${money(x.groups[g].amount)}</td><td>${money(x.groups[g].tps)}</td><td>${money(x.groups[g].tvq)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><th colspan="3">${t("tax.paidTotal")}</th><th>${money(x.tps)}</th><th>${money(x.tvq)}</th></tr>
        <tr class="ts-tax-lines"><td colspan="3"></td><td>${t("tax.line", { line: 106 })}</td><td>${t("tax.line", { line: 206 })}</td></tr></tfoot>
    </table></div>` : `<p class="ts-empty-export">${t("tax.noPurchases")}</p>`;
  const balance = list.length || sales.subtotal ? `<div class="ts-tax-balance">
      <p class="ts-tax-balance-title">${t("tax.balance")}</p>
      <dl><div><dt>TPS</dt><dd>${money(sales.tps - x.tps)}</dd></div><div><dt>TVQ</dt><dd>${money(sales.tvq - x.tvq)}</dd></div>
        <div class="total"><dt>${t("tax.total")}</dt><dd>${money(sales.tps - x.tps + sales.tvq - x.tvq)}</dd></div></dl>
      <p class="hint">${t(toCheck.length ? "tax.balanceDraftCheck" : "tax.balanceDraft", { count: toCheck.length })}</p>
    </div>` : "";
  return `<h3>${t("tax.paid")}</h3>
    <p class="hint">${t("tax.paidHint")}</p>
    <div class="actions start ts-tax-import">
      <label class="btn primary">📥 ${t("tax.importStatements")}
        <input type="file" accept=".csv,text/csv,.pdf,application/pdf" multiple data-action="ts-tax-statement" hidden></label>
    </div>
    ${summary}
    ${toCheck.length ? `<div class="ts-purchase-check">
        <p class="ts-purchase-check-title">⚠️ ${t("tax.toCheck", { count: toCheck.length })}</p>
        <p class="hint">${t("tax.toCheckHint")}</p>
        <ul class="ts-purchase-list">${toCheck.map(purchaseRow).join("")}</ul>
        <div class="actions start"><button type="button" class="btn soft" data-action="ts-purchase-ok-all">✓ ${t("tax.confirmAll", { count: toCheck.length })}</button></div>
      </div>` : ""}
    ${list.length ? `<details class="ts-purchase-all"><summary>${t("tax.allPurchases", { count: list.length })}</summary>
        <ul class="ts-purchase-list">${list.map(purchaseRow).join("")}</ul></details>` : ""}
    ${balance}`;
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
      <div class="actions start ts-tax-import">
        <label class="btn primary">📥 ${t("tax.importInvoices")}
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple data-action="ts-tax-import" hidden></label>
      </div>
      <p class="hint">${t("tax.importHint")}</p>
      ${editing ? invoiceForm(ts, quarter, editing) : `<details class="ts-new-wrap">
        <summary class="btn soft">＋ ${t("tax.addInvoice")}</summary>${invoiceForm(ts, quarter, null)}</details>`}
      ${purchasesBlock(ts, quarter, x)}
      <p class="hint ts-tax-next">${t("tax.nextSteps")}</p>`,
  });
}

// Fenêtre d'aperçu de l'import : ce qui a été lu dans chaque fichier, à cocher avant d'inscrire.
//   items : [{ file, invoice, problems, existing }]
export function importPreview(items) {
  const problemText = (p) => (p.code === "number" ? t("tax.problem.number", { file: p.file })
    : p.code === "uncalculated" ? t("tax.problem.uncalculated") : t("tax.problem.unreadable"));
  return `<div class="tax-import">
    <h2 id="tax-import-title">📥 ${t("tax.importTitle")}</h2>
    <p class="hint">${t("tax.importCheck")}</p>
    <div class="ts-tax-scroll"><table class="ts-summary ts-tax-table">
      <thead><tr><th></th><th>${t("tax.invoice")}</th><th>${t("tax.date")}</th><th>${t("ts.client")}</th><th>${t("tax.subtotal")}</th><th>TPS</th><th>TVQ</th></tr></thead>
      <tbody>${items.map((item, k) => {
        const i = item.invoice;
        const amount = (n) => (Number.isFinite(n) ? money(n) : "?");
        const notes = [...item.problems.map(problemText), item.existing ? t("tax.problem.existing") : ""].filter(Boolean);
        return `<tr class="${item.problems.length ? "has-problem" : ""}">
          <td><input type="checkbox" data-import="${k}" ${i && !item.problems.length ? "checked" : ""} ${i && !item.problems.some((p) => p.code !== "number") ? "" : "disabled"}
            aria-label="${esc(item.file)}"></td>
          <td><strong>${esc(i?.number ?? "—")}</strong><span class="hint tax-import-file">${esc(item.file)}</span></td>
          <td>${esc(i?.date ?? "")}</td><td>${esc(i?.client ?? "")}</td>
          <td>${i ? amount(i.subtotal) : ""}</td><td>${i ? amount(i.tps) : ""}</td><td>${i ? amount(i.tvq) : ""}</td>
        </tr>${notes.length ? `<tr class="tax-import-note"><td></td><td colspan="6">⚠️ ${esc(notes.join(" "))}</td></tr>` : ""}`;
      }).join("")}</tbody>
    </table></div>
    <div class="actions">
      <button type="button" class="btn ghost" data-action="close">${t("form.cancel")}</button>
      <button type="button" class="btn primary" data-action="ts-tax-import-confirm">${t("tax.importConfirm")}</button>
    </div>
  </div>`;
}
