// Page « Finances » : onglets Paiements et Budget (voir budget.js).
// Onglet « Paiements » : les échéances du mois (entreprise et personnelles), celles en retard,
// « ✓ Payé » avec le montant réel, la liste des paiements à faire (ajout, modification, historique)
// et des modèles prêts (DAS, TPS/TVQ, sa paie aux 2 semaines…).

import { addDays, parseISODate, toISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { fmt, t } from "../../i18n/index.js";
import { FREQS, KINDS, SCOPES, TEMPLATES, dueDates, history, overdue, schedule, totals } from "../../payments/payments.js";
import { taxReportData } from "../../timesheet/tax-report.js";
import { paymentCategory } from "../../budget/budget.js";
import { budgetTab, categoryName } from "./budget.js";
import { quarterOf, shiftQuarter } from "../../timesheet/taxes.js";

const SCOPE_ICONS = { business: "🏢", personal: "🏠" };
const KIND_ICONS = { card: "💳", bill: "🧾", das: "🏛️", salesTax: "🧮", pay: "💵", loan: "🏦", other: "📌" };
const REMIND = [0, 1, 2, 3, 5, 7, 10];
const date = (iso) => fmt.date(parseISODate(iso));
const dayLabel = (iso) => fmt.longDate(parseISODate(iso));
const monthKey = (iso) => iso.slice(0, 7);
const monthBounds = (key) => {
  const [y, m] = key.split("-").map(Number);
  return { from: `${key}-01`, to: toISODate(new Date(y, m, 0)) };
};
const shiftMonth = (key, n) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// TPS/TVQ : le solde du trimestre qui vient de finir, calculé dans « Mes heures → Taxes »
function taxEstimator(ts) {
  const cache = new Map();
  return (row) => {
    if (row.payment.kind !== "salesTax" || !ts) return null;
    const quarter = shiftQuarter(quarterOf(row.due), -1);
    if (!cache.has(quarter)) {
      let total = null;
      try {
        const d = taxReportData(ts, quarter);
        if (d.invoices.length || d.purchases.length) total = d.balance.total;
      } catch {
        total = null;
      }
      cache.set(quarter, total);
    }
    const v = cache.get(quarter);
    return v === null ? null : Math.max(0, v);
  };
}

function expectedText(row, estimate) {
  if (row.payment.amount !== null) return fmt.money(row.payment.amount);
  const e = estimate(row);
  if (e !== null) return t("pay.estimate", { amount: fmt.money(e) });
  return t("pay.variable");
}

function payForm(row, estimate, today) {
  const expected = row.payment.amount ?? estimate(row);
  return `<form class="form pay-form" data-role="pay-paid" data-id="${esc(row.payment.id)}" data-due="${esc(row.due)}">
    <div class="row">
      <label>${t("pay.paidAmount")} <input name="amount" inputmode="decimal" value="${expected !== null ? esc(String(expected)) : ""}" autocomplete="off"></label>
      <label>${t("pay.paidOn")} <input name="date" type="date" value="${esc(today)}" required></label>
    </div>
    <label>${t("pay.note")} <input name="note" autocomplete="off"></label>
    <div class="actions start">
      <button type="submit" class="btn primary">✓ ${t("pay.save")}</button>
      <button type="button" class="btn ghost" data-action="pay-cancel">${t("form.cancel")}</button>
    </div>
  </form>`;
}

function dueRow(row, ui, estimate, today) {
  const p = row.payment;
  const key = `${p.id}|${row.due}`;
  const state = row.paid
    ? `<span class="pay-state is-paid">✓ ${t("pay.paidOnDate", { date: fmt.dayMonth(parseISODate(row.paid.date)) })}${row.paid.amount !== null ? ` · ${fmt.money(row.paid.amount)}` : ""}</span>`
    : row.state === "overdue" ? `<span class="pay-state is-late">⚠️ ${t("pay.late")}</span>`
    : `<span class="pay-state is-${row.state}">${fmt.inDays(row.days)}</span>`;
  return `<li class="pay-row is-${row.state}" id="pay-${esc(key)}">
    <div class="pay-row-head">
      <span class="pay-name">${SCOPE_ICONS[p.scope]} ${KIND_ICONS[p.kind]} <strong>${esc(p.name)}</strong></span>
      <span class="pay-amount">${esc(row.paid?.amount != null ? fmt.money(row.paid.amount) : expectedText(row, estimate))}</span>
    </div>
    <div class="pay-row-meta">
      <span class="hint">${esc(dayLabel(row.due))}${p.auto ? ` · 🔁 ${t("pay.autoShort")}` : ""}</span>
      ${state}
    </div>
    ${ui.paying === key ? payForm(row, estimate, today) : `<div class="actions start">
      ${row.paid ? `<button type="button" class="btn link" data-action="pay-unmark" data-id="${esc(p.id)}" data-due="${esc(row.due)}">${t("pay.undo")}</button>`
        : `<button type="button" class="btn soft pay-btn" data-action="pay-mark" data-id="${esc(p.id)}" data-due="${esc(row.due)}">✓ ${t("pay.markPaid")}</button>`}
    </div>`}
  </li>`;
}

function paymentForm(p, draft, today, budget) {
  const v = p ?? draft ?? { name: "", scope: "personal", kind: "bill", freq: "monthly", start: today, lastDay: false, amount: null, auto: false, remindDays: 3, note: "" };
  const opt = (list, cur, prefix) => list.map((x) => `<option value="${x}" ${x === cur ? "selected" : ""}>${t(`${prefix}.${x}`)}</option>`).join("");
  return `<form class="form pay-edit" data-role="pay-edit" data-id="${esc(p?.id ?? "")}">
    <h2>${p ? t("pay.editTitle") : t("pay.addTitle")}</h2>
    <label>${t("pay.name")} <input name="name" value="${esc(v.name)}" required autocomplete="off" placeholder="${esc(t("pay.nameHint"))}"></label>
    <div class="row">
      <label>${t("pay.scopeLabel")} <select name="scope">${SCOPES.map((s) => `<option value="${s}" ${s === v.scope ? "selected" : ""}>${SCOPE_ICONS[s]} ${t(`pay.scope.${s}`)}</option>`).join("")}</select></label>
      <label>${t("pay.kindLabel")} <select name="kind">${opt(KINDS, v.kind, "pay.kind")}</select></label>
    </div>
    <div class="row">
      <label>${t("pay.freqLabel")} <select name="freq">${opt(FREQS, v.freq, "pay.freq")}</select></label>
      <label>${t("pay.start")} <input name="start" type="date" value="${esc(v.start)}" required></label>
    </div>
    <p class="hint">${t("pay.startHint")}</p>
    <label class="switch"><input type="checkbox" name="lastDay" ${v.lastDay ? "checked" : ""}><span>${t("pay.lastDay")}</span></label>
    <div class="row">
      <label>${t("pay.amount")} <input name="amount" inputmode="decimal" value="${v.amount !== null && v.amount !== undefined ? esc(String(v.amount)) : ""}" placeholder="${esc(t("pay.variable"))}" autocomplete="off"></label>
      <label>${t("pay.remind")} <select name="remindDays">${REMIND.map((n) => `<option value="${n}" ${n === v.remindDays ? "selected" : ""}>${n ? t("pay.remindDays", { count: n }) : t("pay.remindSameDay")}</option>`).join("")}</select></label>
    </div>
    <label class="switch"><input type="checkbox" name="auto" ${v.auto ? "checked" : ""}><span>🔁 ${t("pay.auto")}</span></label>
    ${budget ? `<label>${t("pay.budgetCategory")} <select name="budgetCategory">
      <option value="">${esc(t("pay.budgetAuto", { name: categoryName(budget.categories.find((c) => c.id === paymentCategory(budget, { ...v, budgetCategory: "" }))) }))}</option>
      ${budget.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === v.budgetCategory ? "selected" : ""}>${c.icon} ${esc(categoryName(c))}</option>`).join("")}
    </select></label>` : ""}
    <label>${t("pay.note")} <input name="note" value="${esc(v.note)}" autocomplete="off"></label>
    <div class="actions start">
      <button type="submit" class="btn primary">${t("pay.save")}</button>
      <button type="button" class="btn ghost" data-action="pay-cancel">${t("form.cancel")}</button>
      ${p ? `<button type="button" class="btn danger" data-action="pay-remove" data-id="${esc(p.id)}">${t("pay.remove")}</button>` : ""}
    </div>
  </form>`;
}

function paymentLine(payments, p, ui, today, estimate, budget) {
  if (ui.editing === p.id) return `<li class="pay-item is-editing">${paymentForm(p, null, today, budget)}</li>`;
  const next = dueDates(p, today, toISODate(addDays(parseISODate(today), 400)))[0];
  const amount = p.amount !== null ? fmt.money(p.amount) : next ? expectedText({ payment: p, due: next.due }, estimate) : t("pay.variable");
  const past = history(payments, p.id);
  const year = today.slice(0, 4);
  const yearTotal = past.filter((x) => x.due.startsWith(year)).reduce((s, x) => s + (x.amount ?? 0), 0);
  return `<li class="pay-item ${p.active ? "" : "is-off"}">
    <div class="pay-row-head">
      <span class="pay-name">${KIND_ICONS[p.kind]} <strong>${esc(p.name)}</strong></span>
      <span class="pay-amount">${esc(amount)}</span>
    </div>
    <p class="hint">${t(`pay.freq.${p.freq}`)}${p.lastDay ? ` · ${t("pay.lastDayShort")}` : ""}${p.auto ? ` · 🔁 ${t("pay.autoShort")}` : ""}${next ? ` · ${t("pay.next", { date: date(next.due) })}` : ""}</p>
    ${p.note ? `<p class="hint">📝 ${esc(p.note)}</p>` : ""}
    ${past.length ? `<details class="pay-history"><summary>${t("pay.history", { count: past.length })}${yearTotal ? ` · ${t("pay.yearTotal", { year, amount: fmt.money(yearTotal) })}` : ""}</summary>
      <ul>${past.slice(0, 24).map((x) => `<li><span>${esc(date(x.due))}</span><span class="hint">${t("pay.paidOnDate", { date: fmt.dayMonth(parseISODate(x.date)) })}${x.note ? ` · ${esc(x.note)}` : ""}</span><strong>${x.amount !== null ? esc(fmt.money(x.amount)) : "–"}</strong></li>`).join("")}</ul>
    </details>` : ""}
    <div class="actions start">
      <button type="button" class="btn link" data-action="pay-edit" data-id="${esc(p.id)}">${t("pay.edit")}</button>
    </div>
  </li>`;
}

export const paymentsPage = {
  id: "payments",
  title: () => t("nav.payments"),
  render({ repo, today, paymentsUi = {} }) {
    const payments = repo.payments();
    const budget = repo.budget();
    const tab = paymentsUi.tab === "budget" ? "budget" : "payments";
    const ts = repo.timesheet();
    const estimate = taxEstimator(ts);
    const key = paymentsUi.month ?? monthKey(today);
    const { from, to } = monthBounds(key);
    const rows = schedule(payments, from, to, today);
    const late = key === monthKey(today) ? overdue(payments, today).filter((r) => r.due < from) : [];
    const sum = totals(rows, estimate);
    const byScope = Object.fromEntries(SCOPES.map((s) => [s, totals(rows.filter((r) => r.payment.scope === s), estimate)]));
    const ui = paymentsUi;
    const tile = (value, label) => `<div><span class="pay-value">${value}</span><span>${label}</span></div>`;
    const empty = !payments.list.length;
    const tabs = `<nav class="segmented pay-tabs" aria-label="${esc(t("nav.payments"))}">${["payments", "budget"].map((x) => `<button type="button" data-action="pay-tab" data-tab="${x}"
      class="${x === tab ? "active" : ""}" aria-pressed="${x === tab}">${x === "payments" ? "💳" : "📊"} ${t(`pay.tab.${x}`)}</button>`).join("")}</nav>`;
    const monthNav = `<div class="pay-month-nav">
        <button type="button" class="btn soft" data-action="pay-month" data-shift="-1" aria-label="${esc(t("pay.prevMonth"))}">‹</button>
        <strong>${esc(fmt.monthYear(parseISODate(from)))}</strong>
        <button type="button" class="btn soft" data-action="pay-month" data-shift="1" aria-label="${esc(t("pay.nextMonth"))}">›</button>
        ${key !== monthKey(today) ? `<button type="button" class="btn link" data-action="pay-month" data-shift="0">${t("pay.thisMonth")}</button>` : ""}
      </div>`;
    if (tab === "budget") return `<div class="page payments">${tabs}${monthNav}${budgetTab({ budget, payments, ui, today, month: key })}</div>`;
    return `<div class="page payments">
      ${tabs}
      ${monthNav}
      ${empty ? `<p class="pay-intro">${t("pay.intro")}</p>` : `<section class="pay-summary">
        ${tile(fmt.money(sum.planned), t("pay.sum.planned"))}
        ${tile(fmt.money(sum.paid), t("pay.sum.paid"))}
        ${tile(fmt.money(sum.left), t("pay.sum.left"))}
        <p class="pay-split">${SCOPES.map((s) => `${SCOPE_ICONS[s]} ${t(`pay.scope.${s}`)} : ${fmt.money(byScope[s].planned)}`).join(" · ")}${sum.unknown ? ` · ${t("pay.sum.unknown", { count: sum.unknown })}` : ""}</p>
      </section>`}
      ${late.length ? `<section class="pay-block is-late"><h2>⚠️ ${t("pay.lateTitle")}</h2>
        <ul class="pay-list">${late.map((r) => dueRow(r, ui, estimate, today)).join("")}</ul></section>` : ""}
      ${empty ? "" : `<section class="pay-block"><h2>${t("pay.monthTitle")}</h2>
        ${rows.length ? `<ul class="pay-list">${rows.map((r) => dueRow(r, ui, estimate, today)).join("")}</ul>` : `<p class="hint">${t("pay.noneThisMonth")}</p>`}
      </section>`}
      <section class="pay-block">
        <h2>${t("pay.mine")}</h2>
        ${SCOPES.map((s) => {
          const list = payments.list.filter((p) => p.scope === s);
          return list.length ? `<h3>${SCOPE_ICONS[s]} ${t(`pay.scope.${s}`)}</h3><ul class="pay-list">${list.map((p) => paymentLine(payments, p, ui, today, estimate, budget)).join("")}</ul>` : "";
        }).join("")}
        ${ui.editing === "new" ? paymentForm(null, ui.draft, today, budget) : `<div class="actions start">
          <button type="button" class="btn primary" data-action="pay-new">＋ ${t("pay.add")}</button>
        </div>
        <p class="hint">${t("pay.templatesHint")}</p>
        <div class="pay-templates">${SCOPES.map((s) => `<div><span class="hint">${SCOPE_ICONS[s]} ${t(`pay.scope.${s}`)}</span>
          ${TEMPLATES.filter((x) => x.scope === s).map((x) => `<button type="button" class="chip-btn" data-action="pay-template" data-key="${x.key}">＋ ${t(`pay.tpl.${x.key}`)}</button>`).join("")}</div>`).join("")}
        </div>`}
      </section>
    </div>`;
  },
};
