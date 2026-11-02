// Section « Taxes (TPS/TVQ) » de « Mes heures » : le trimestre à déclarer et le registre
// des factures émises (ventes, TPS et TVQ perçues : lignes 101, 103 et 203).
// Les factures créées dans l'application s'y inscrivent toutes seules ; celles faites
// ailleurs (Excel) s'ajoutent à la main.

import { esc } from "../../core/dom.js";
import { fmt, getLanguage, t } from "../../i18n/index.js";
import { quarterInvoices, quarterRange, salesTotals } from "../../timesheet/taxes.js";
import { PURCHASE_CHOICES, choiceKey, purchaseTotals, quarterHomeCharging, quarterPurchases } from "../../timesheet/purchases.js";
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

const GROUPS = ["taxable", "mixed", "meal", "taxableOn", "mixedOn", "mealOn", "exempt", "excluded", "persoTaxable", "persoMixed", "persoMeal", "persoTaxableOn", "persoMixedOn", "persoMealOn", "persoExempt"];

// Une transaction : catégorie à choisir ; dans un relevé personnel, « Exclu » se dit « Personnel »
function purchaseRow(p) {
  const label = (c) => t(p.source === "perso" && c.category === "excluded" ? "tax.choice.personal" : `tax.choice.${c.category}.${c.pct}${c.tax === "on" ? ".on" : ""}`);
  return `<li class="ts-purchase ${p.status === "check" ? "is-check" : ""}">
    <div class="ts-purchase-text">
      <span class="ts-purchase-desc">${esc(p.description)}</span>
      <span class="hint">${esc(p.date)} · ${esc(t(`tax.source.${p.source}`))}${p.orig ? ` · ${esc(p.orig)}` : ""}${p.status === "check" && p.note ? ` · ${esc(t(`tax.why.${p.note}`))}` : ""}</span>
    </div>
    <span class="ts-purchase-amount">${money(p.amount)}</span>
    <select data-action="ts-purchase-cat" data-id="${esc(p.id)}" aria-label="${esc(t("tax.category"))}">
      ${PURCHASE_CHOICES.map((c) => `<option value="${choiceKey(c)}" ${choiceKey(c) === choiceKey(p) ? "selected" : ""}>${esc(label(c))}</option>`).join("")}
    </select>
    ${p.status === "check" ? `<button type="button" class="btn soft ts-purchase-ok" data-action="ts-purchase-ok" data-id="${esc(p.id)}" aria-label="${esc(t("tax.confirm"))}" title="${esc(t("tax.confirm"))}">✓</button>` : ""}
    <button type="button" class="check-remove" data-action="ts-purchase-remove" data-id="${esc(p.id)}" aria-label="${esc(t("ts.remove"))}">×</button>
  </li>`;
}

const importButton = (source) => `<div class="actions start ts-tax-import">
    <label class="btn primary">📥 ${t(source === "perso" ? "tax.importPersonal" : "tax.importStatements")}
      <input type="file" accept=".csv,text/csv,.pdf,application/pdf" multiple data-action="ts-tax-statement" data-source="${source}" hidden></label>
  </div>`;

// Relevés personnels : tout est personnel par défaut ; une case par transaction pour l'entreprise
function personalBlock(list, ui = {}) {
  const debits = list.filter((p) => p.amount > 0);
  const business = debits.filter((p) => p.category !== "excluded" || p.status === "check");
  const q = String(ui.persoQuery ?? "").trim().toLowerCase();
  const row = (p) => `<li ${q && !`${p.description} ${p.date} ${p.amount}`.toLowerCase().includes(q) ? "hidden" : ""} class="ts-perso ${p.category !== "excluded" ? "is-business" : ""}" data-search="${esc(`${p.description} ${p.date} ${p.amount}`.toLowerCase())}">
      <label class="ts-perso-check"><input type="checkbox" data-action="ts-perso-toggle" data-id="${esc(p.id)}" ${p.category !== "excluded" ? "checked" : ""}
        aria-label="${esc(t("tax.forBusiness"))}"></label>
      <div class="ts-purchase-text"><span class="ts-purchase-desc">${esc(p.description)}</span><span class="hint">${esc(p.date)}</span></div>
      <span class="ts-purchase-amount">${money(p.amount)}</span>
    </li>`;
  return `<h3>${t("tax.personal")}</h3>
    <p class="hint">${t("tax.personalHint")}</p>
    ${importButton("perso")}
    ${business.length ? `<p class="ts-perso-title">${t("tax.personalBusiness", { count: business.length })}</p>
      <ul class="ts-purchase-list">${business.map(purchaseRow).join("")}</ul>` : ""}
    ${debits.length ? `<details class="ts-purchase-all ts-perso-all" data-role="perso-all" ${ui.persoOpen ? "open" : ""}><summary>${t("tax.personalAll", { count: debits.length })}</summary>
        <input type="search" class="ts-perso-search" data-action="ts-perso-filter" value="${esc(ui.persoQuery ?? "")}" placeholder="${esc(t("tax.personalSearch"))}" aria-label="${esc(t("tax.personalSearch"))}" autocomplete="off">
        <ul class="ts-perso-list">${debits.map(row).join("")}</ul></details>` : ""}`;
}

// Recharge à la maison : part « Véhicule électrique » de chaque période d'Hydro-Québec
function homeChargingBlock(hc) {
  return `<h3>${t("tax.homeCharging")}</h3>
    <p class="hint">${t("tax.homeChargingHint")}</p>
    ${hc.rows.length ? `<div class="ts-tax-scroll"><table class="ts-summary ts-home-table">
      <thead><tr><th>${t("tax.period")}</th><th>${t("tax.evAmount")}</th><th>${t("tax.daysInQuarter")}</th><th>${t("tax.share")}</th><th></th></tr></thead>
      <tbody>${hc.rows.map((r) => `<tr><td>${esc(r.from)} → ${esc(r.to)}</td><td>${money(r.amount)}</td><td>${r.inQuarter} / ${r.days}</td><td>${money(r.share)}</td>
        <td><button type="button" class="check-remove" data-action="ts-home-remove" data-id="${esc(r.id)}" aria-label="${esc(t("ts.remove"))}">×</button></td></tr>`).join("")}</tbody>
      <tfoot><tr><th colspan="3">${t("tax.homeChargingTotal")}</th><th>${money(hc.base)}</th><th></th></tr></tfoot>
    </table></div>` : ""}
    <details class="ts-new-wrap"><summary class="btn soft">＋ ${t("tax.addPeriod")}</summary>
      <form class="form ts-new" data-role="ts-home-charging">
        <div class="row three">
          <label>${t("ts.from")} <input type="date" name="from" required></label>
          <label>${t("ts.to")} <input type="date" name="to" required></label>
          <label>${t("tax.evAmount")} <input name="amount" inputmode="decimal" placeholder="${esc(t("ts.example", { value: "34,00" }))}" autocomplete="off" required></label>
        </div>
        <p class="form-errors" data-role="errors" role="alert"></p>
        <div class="actions"><button type="submit" class="btn primary">${t("tax.addPeriod")}</button></div>
      </form></details>`;
}

// Ajouter un achat à la main : date (dans le trimestre), description, montant, qui a payé, catégorie
function addPurchaseForm(quarter) {
  const { from } = quarterRange(quarter);
  return `<details class="ts-new-wrap"><summary class="btn soft">＋ ${t("tax.addPurchase")}</summary>
    <form class="form ts-new" data-role="ts-purchase-add">
      <div class="row">
        <label>${t("tax.date")} <input type="date" name="date" value="${from}" required></label>
        <label>${t("tax.amountWithTaxes")} <input name="amount" inputmode="decimal" placeholder="${esc(t("ts.example", { value: "50,00" }))}" autocomplete="off" required></label>
      </div>
      <label>${t("ts.expenseDesc")} <input name="description" placeholder="${esc(t("ts.example", { value: "Circuit électrique — prépaiement" }))}" autocomplete="off" required></label>
      <div class="row">
        <label>${t("tax.paidBy")} <select name="source">
          <option value="manual">${esc(t("tax.paidByCompany"))}</option><option value="perso">${esc(t("tax.paidByMe"))}</option></select></label>
        <label>${t("tax.category")} <select name="choice">
          ${PURCHASE_CHOICES.filter((c) => c.category !== "excluded").map((c) => `<option value="${choiceKey(c)}">${esc(t(`tax.choice.${c.category}.${c.pct}${c.tax === "on" ? ".on" : ""}`))}</option>`).join("")}</select></label>
      </div>
      <p class="hint">${t("tax.addPurchaseHint")}</p>
      <p class="form-errors" data-role="errors" role="alert"></p>
      <div class="actions"><button type="submit" class="btn primary">${t("tax.addPurchase")}</button></div>
    </form></details>`;
}

function purchasesBlock(ts, quarter, sales, ui = {}) {
  const all = quarterPurchases(ts, quarter);
  const list = all.filter((p) => p.source !== "perso");
  const perso = all.filter((p) => p.source === "perso");
  const x = purchaseTotals(all);
  const hc = quarterHomeCharging(ts, quarter);
  const paid = { tps: x.tps + hc.tps, tvq: x.tvq + hc.tvq };
  const toCheck = all.filter((p) => p.status === "check");
  const summaryRows = [
    ...GROUPS.filter((g) => x.groups[g]).map((g) => [t(`tax.group.${g}`), x.groups[g].count, x.groups[g].amount, x.groups[g].tps, x.groups[g].tvq]),
    ...(hc.rows.length ? [[t("tax.group.homeCharging"), hc.rows.length, hc.base, hc.tps, hc.tvq]] : []),
  ];
  const summary = summaryRows.length ? `<div class="ts-tax-scroll"><table class="ts-summary ts-purchase-summary">
      <thead><tr><th>${t("tax.category")}</th><th>${t("tax.count")}</th><th>${t("tax.amount")}</th><th>TPS/TVH</th><th>TVQ</th></tr></thead>
      <tbody>${summaryRows.map(([label, count, amount, tps, tvq]) => `<tr><td>${esc(label)}</td><td>${count}</td>
        <td>${money(amount)}</td><td>${money(tps)}</td><td>${money(tvq)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><th colspan="3">${t("tax.paidTotal")}</th><th>${money(paid.tps)}</th><th>${money(paid.tvq)}</th></tr>
        <tr class="ts-tax-lines"><td colspan="3"></td><td>${t("tax.line", { line: 106 })}</td><td>${t("tax.line", { line: 206 })}</td></tr></tfoot>
    </table></div>` : `<p class="ts-empty-export">${t("tax.noPurchases")}</p>`;
  const businessCheck = list.filter((p) => p.status === "check");
  const balance = all.length || hc.rows.length || sales.subtotal ? `<div class="ts-tax-balance">
      <p class="ts-tax-balance-title">${t("tax.balance")}</p>
      <dl><div><dt>TPS</dt><dd>${money(sales.tps - paid.tps)}</dd></div><div><dt>TVQ</dt><dd>${money(sales.tvq - paid.tvq)}</dd></div>
        <div class="total"><dt>${t("tax.total")}</dt><dd>${money(sales.tps - paid.tps + sales.tvq - paid.tvq)}</dd></div></dl>
      <p class="hint">${t(toCheck.length ? "tax.balanceDraftCheck" : "tax.balanceDraft", { count: toCheck.length })}</p>
    </div>` : "";
  return `<h3>${t("tax.paid")}</h3>
    <p class="hint">${t("tax.paidHint")}</p>
    ${importButton("business")}
    ${addPurchaseForm(quarter)}
    ${summary}
    ${businessCheck.length ? `<div class="ts-purchase-check">
        <p class="ts-purchase-check-title">⚠️ ${t("tax.toCheck", { count: businessCheck.length })}</p>
        <p class="hint">${t("tax.toCheckHint")}</p>
        <ul class="ts-purchase-list">${businessCheck.map(purchaseRow).join("")}</ul>
        <div class="actions start"><button type="button" class="btn soft" data-action="ts-purchase-ok-all">✓ ${t("tax.confirmAll", { count: businessCheck.length })}</button></div>
      </div>` : ""}
    ${list.length ? `<details class="ts-purchase-all"><summary>${t("tax.allPurchases", { count: list.length })}</summary>
        <ul class="ts-purchase-list">${list.map(purchaseRow).join("")}</ul></details>` : ""}
    ${personalBlock(perso, ui)}
    ${homeChargingBlock(hc)}
    ${balance}`;
}

export function taxesSection(ts, quarter, editingId, ui = {}) {
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
      ${purchasesBlock(ts, quarter, x, ui)}
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
