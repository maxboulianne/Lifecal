// Onglet « Budget » de la page Finances : revenus, dépenses par catégorie et épargne, prévu et réel
// du mois ; opérations à classer ; ajout d'une dépense ou d'un revenu ; import des relevés Desjardins ;
// catégories et budget prévu (proposé d'après les paiements).

import { parseISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { fmt, t } from "../../i18n/index.js";
import { GROUPS, monthActuals, plannedFromPayments } from "../../budget/budget.js";

export const categoryName = (c) => (c ? c.name || t(`budget.cat.${c.key}`) : t("budget.unclassified"));
const money = (n) => fmt.money(n);
const SOURCE_ICONS = { import: "🏦", manual: "✍️", payment: "💳" };

function categoryOptions(budget, selected, { empty = null } = {}) {
  return `${empty ? `<option value="">${esc(empty)}</option>` : ""}${GROUPS.map((g) => `<optgroup label="${esc(t(`budget.group.${g}`))}">${budget.categories.filter((c) => c.group === g)
    .map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? "selected" : ""}>${c.icon} ${esc(categoryName(c))}</option>`).join("")}</optgroup>`).join("")}`;
}

function lineRow(budget, l, { classify = false } = {}) {
  const editable = l.from !== "payment";
  return `<li class="bg-line">
    <span class="hint">${esc(fmt.dayMonth(parseISODate(l.date)))}</span>
    <span class="bg-line-desc">${SOURCE_ICONS[l.from] ?? ""} ${esc(l.description || "–")}</span>
    <strong class="bg-line-amount ${l.amount < 0 ? "is-in" : ""}">${l.amount < 0 ? "+" : ""}${esc(money(Math.abs(l.amount)))}</strong>
    ${editable ? `<span class="bg-line-tools">
      <select data-action="budget-entry-cat" data-id="${esc(l.id)}" aria-label="${esc(t("budget.category"))}" class="${classify ? "is-todo" : ""}">${categoryOptions(budget, l.categoryId, { empty: classify ? t("budget.chooseCategory") : null })}</select>
      <button type="button" class="check-remove" data-action="budget-entry-remove" data-id="${esc(l.id)}" aria-label="${esc(t("budget.remove"))}">×</button>
    </span>` : `<span class="hint bg-line-tools">${t("budget.fromPayments")}</span>`}
  </li>`;
}

function categoryRow(budget, row, ui) {
  const c = row.category;
  const planned = c.planned;
  const income = c.group === "income";
  const pct = planned ? Math.round((row.actual / planned) * 100) : null;
  const over = !income && planned !== null && row.actual > planned + 0.005;
  const open = ui.budgetOpen === c.id;
  if (!row.actual && !planned && !open) return "";
  return `<li class="bg-cat ${over ? "is-over" : ""}">
    <button type="button" class="bg-cat-head" data-action="budget-open" data-id="${esc(c.id)}" aria-expanded="${open}">
      <span>${c.icon} ${esc(categoryName(c))}</span>
      <span class="bg-cat-figures"><strong>${esc(money(row.actual))}</strong>${planned !== null ? ` <span class="hint">/ ${esc(money(planned))}</span>` : ""}</span>
    </button>
    ${planned ? `<span class="bg-bar ${income ? "is-income" : ""}" role="img" aria-label="${esc(t("budget.pctOf", { pct }))}"><span style="width:${Math.min(100, Math.max(2, pct))}%"></span></span>` : ""}
    ${over ? `<p class="bg-over">${t("budget.over", { amount: money(row.actual - planned) })}</p>` : ""}
    ${open ? (row.lines.length ? `<ul class="bg-lines">${row.lines.map((l) => lineRow(budget, l)).join("")}</ul>` : `<p class="hint">${t("budget.noLines")}</p>`) : ""}
  </li>`;
}

function entryForm(budget, today, month) {
  const date = today.startsWith(month) ? today : `${month}-01`;
  return `<form class="form bg-form" data-role="budget-entry">
    <div class="segmented bg-kind" role="radiogroup">
      <label><input type="radio" name="kind" value="expense" checked> ${t("budget.expense")}</label>
      <label><input type="radio" name="kind" value="income"> ${t("budget.income")}</label>
    </div>
    <div class="row">
      <label>${t("budget.date")} <input name="date" type="date" value="${esc(date)}" required></label>
      <label>${t("budget.amount")} <input name="amount" inputmode="decimal" required autocomplete="off"></label>
    </div>
    <label>${t("budget.category")} <select name="categoryId" required>${categoryOptions(budget, null, { empty: t("budget.chooseCategory") })}</select></label>
    <label>${t("budget.description")} <input name="description" autocomplete="off"></label>
    <div class="actions start">
      <button type="submit" class="btn primary">${t("budget.save")}</button>
      <button type="button" class="btn ghost" data-action="budget-add">${t("form.cancel")}</button>
    </div>
  </form>`;
}

function settings(budget, payments, open) {
  const proposal = plannedFromPayments(budget, payments);
  return `<details class="bg-settings" ${open ? "open" : ""}>
    <summary>⚙️ ${t("budget.settings")}</summary>
    <p class="hint">${t("budget.settingsHint")}</p>
    ${Object.keys(proposal).length ? `<button type="button" class="btn soft" data-action="budget-propose">💳 ${t("budget.propose")}</button>` : ""}
    ${GROUPS.map((g) => `<h3>${t(`budget.group.${g}`)}</h3>
      <ul class="bg-cat-edit">${budget.categories.filter((c) => c.group === g).map((c) => `<li>
        <span class="bg-icon">${c.icon}</span>
        <input data-action="budget-cat-name" data-id="${esc(c.id)}" value="${esc(categoryName(c))}" aria-label="${esc(t("budget.categoryName"))}">
        ${g === "transfer" ? "<span></span>" : `<input data-action="budget-planned" data-id="${esc(c.id)}" inputmode="decimal" value="${c.planned ?? ""}" placeholder="${esc(proposal[c.id] !== undefined ? String(proposal[c.id]) : "—")}" aria-label="${esc(t("budget.planned"))}">`}
        <button type="button" class="check-remove" data-action="budget-cat-remove" data-id="${esc(c.id)}" aria-label="${esc(t("budget.remove"))}">×</button>
      </li>`).join("")}</ul>`).join("")}
    <form class="form bg-form" data-role="budget-category">
      <div class="row">
        <label>${t("budget.categoryName")} <input name="name" required autocomplete="off"></label>
        <label>${t("budget.groupLabel")} <select name="group">${GROUPS.filter((g) => g !== "transfer").map((g) => `<option value="${g}" ${g === "variable" ? "selected" : ""}>${t(`budget.group.${g}`)}</option>`).join("")}</select></label>
      </div>
      <div class="actions start"><button type="submit" class="btn soft">＋ ${t("budget.addCategory")}</button></div>
    </form>
  </details>`;
}

export function budgetTab({ budget, payments, ui, today, month }) {
  // Paiements notés payés ce mois-ci (selon la date du paiement)
  const paidRows = payments.paid.filter((x) => x.date.startsWith(month))
    .map((paid) => ({ payment: payments.list.find((p) => p.id === paid.paymentId), paid })).filter((r) => r.payment);
  const m = monthActuals(budget, month, paidRows);
  const x = m.totals;
  const tile = (label, actual, planned, cls = "") => `<div class="bg-tile ${cls}"><span class="bg-tile-label">${label}</span>
    <strong>${esc(money(actual))}</strong>${planned ? `<span class="bg-tile-planned">${t("budget.plannedShort", { amount: money(planned) })}</span>` : ""}</div>`;
  const groupBlock = (g) => {
    const rows = m.rows.filter((r) => r.category.group === g).map((r) => categoryRow(budget, r, ui)).filter(Boolean);
    if (!rows.length) return "";
    return `<section class="bg-group"><h2>${t(`budget.group.${g}`)} <span>${esc(money(x[g].actual))}${x[g].planned ? ` / ${esc(money(x[g].planned))}` : ""}</span></h2>
      <ul class="bg-cats">${rows.join("")}</ul></section>`;
  };
  const transfers = m.rows.filter((r) => r.category.group === "transfer" && r.lines.length);
  return `<section class="bg-summary">
      ${tile(t("budget.group.income"), x.income.actual, x.income.planned)}
      ${tile(t("budget.spent"), m.spent.actual, m.spent.planned)}
      ${tile(t("budget.group.savings"), x.savings.actual, x.savings.planned)}
      ${tile(t("budget.balance"), m.balance.actual, m.balance.planned, m.balance.actual < 0 ? "is-negative" : "")}
    </section>
    <p class="hint">${t(m.imported ? "budget.sourceImported" : "budget.sourcePayments")}</p>
    <div class="actions start">
      <button type="button" class="btn primary" data-action="budget-add">＋ ${t("budget.add")}</button>
      <label class="btn soft bg-import">📥 ${t("budget.import")}<input type="file" data-action="budget-import" accept=".csv,.pdf,text/csv,application/pdf" multiple hidden></label>
    </div>
    ${ui.budgetAdding ? entryForm(budget, today, month) : ""}
    ${m.unclassified.length ? `<section class="bg-group is-todo"><h2>${t("budget.toClassify", { count: m.unclassified.length })}</h2>
      <p class="hint">${t("budget.toClassifyHint")}</p>
      <ul class="bg-lines">${m.unclassified.map((l) => lineRow(budget, l, { classify: true })).join("")}</ul></section>` : ""}
    ${["income", "fixed", "variable", "savings"].map(groupBlock).join("")}
    ${!m.rows.some((r) => r.actual || r.category.planned) && !m.unclassified.length ? `<p class="pay-intro">${t("budget.intro")}</p>` : ""}
    ${transfers.length ? `<details class="bg-group bg-transfers" ${ui.budgetTransfers ? "open" : ""}><summary>${t("budget.group.transfer")} · ${esc(money(x.transfer.actual))}</summary>
      <p class="hint">${t("budget.transferHint")}</p>
      <ul class="bg-lines">${transfers.flatMap((r) => r.lines).map((l) => lineRow(budget, l)).join("")}</ul></details>` : ""}
    ${settings(budget, payments, ui.budgetSettings)}`;
}
