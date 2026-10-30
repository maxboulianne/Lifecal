// Page « Mes heures » : noter les heures de la journée par projet, voir les
// totaux, gérer projets et clients, exporter une période en Excel.

import { addDays, parseISODate, startOfWeek, toISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { fmt, getLanguage, t } from "../../i18n/index.js";
import {
  activeProjects, dayEntries, dayTotal, getClient, getProject, lastTask, periodSummary, previousWorkday, projectOrder, rateFor, weekTotal,
} from "../../timesheet/timesheet.js";
import {
  CURRENCIES, EXPENSE_ICONS, EXPENSE_TYPES, dayExpenses, expenseTotal, isMileage, periodExpenses, sumExpenses,
} from "../../timesheet/expenses.js";
import { getTask, otherTasks, quickTasks } from "../../timesheet/tasks.js";
import { getPresence, presenceHours, SUGGESTED, withSuggestions } from "../../timesheet/presence.js";
import { foldSection, isFoldOpen } from "../components/fold.js";
import { CHEVRON_LEFT, CHEVRON_RIGHT } from "../components/icons.js";

export const QUICK_STEPS = [0.25, 0.5, 1];
export const EXPORT_RANGES = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "custom"];

const h = (n) => `${fmt.hours(n)} h`;

// Dates d'une période d'export (« ce mois-ci »…), ou celles choisies.
export function rangeDates(range, today, custom = {}) {
  const d = parseISODate(today);
  const monday = startOfWeek(d);
  if (range === "thisWeek") return { from: toISODate(monday), to: toISODate(addDays(monday, 6)) };
  if (range === "lastWeek") return { from: toISODate(addDays(monday, -7)), to: toISODate(addDays(monday, -1)) };
  if (range === "lastMonth") return { from: toISODate(new Date(d.getFullYear(), d.getMonth() - 1, 1, 12)), to: toISODate(new Date(d.getFullYear(), d.getMonth(), 0, 12)) };
  if (range === "custom" && custom.from && custom.to) return { from: custom.from, to: custom.to };
  return { from: toISODate(new Date(d.getFullYear(), d.getMonth(), 1, 12)), to: toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)) };
}

const money = (n) => (n != null ? fmt.money(n) : "—");
const rateValue = (n) => (n != null ? esc(fmt.hours(n)) : "");
const step = (n, text) => `<p class="ts-step"><span class="ts-step-n" aria-hidden="true">${n}</span> ${text}</p>`;

export const CUSTOM_TASK = "__custom";

// Liste des tâches : sélection rapide, puis les autres ; un code hors catalogue
// (ancienne saisie) reste choisi tel quel.
function taskOptions(ts, code, { custom = false } = {}) {
  const option = (task) => `<option value="${esc(task.code)}" data-task="${esc(task.description)}" data-scope="${esc(task.scope)}"
    ${task.code === code ? "selected" : ""}>${esc(task.code)} — ${esc(task.description)}</option>`;
  const legacy = code && !getTask(ts, code) && code !== CUSTOM_TASK;
  return `<option value="" ${code ? "" : "selected"}>${esc(t("ts.noTask"))}</option>
    ${legacy ? `<option value="${esc(code)}" selected>${esc(code)}</option>` : ""}
    ${quickTasks(ts).length ? `<optgroup label="${esc(t("ts.quickTasks"))}">${quickTasks(ts).map(option).join("")}</optgroup>` : ""}
    ${otherTasks(ts).length ? `<optgroup label="${esc(t("ts.otherTasks"))}">${otherTasks(ts).map(option).join("")}</optgroup>` : ""}
    ${custom ? `<option value="${CUSTOM_TASK}" ${code === CUSTOM_TASK ? "selected" : ""}>✏️ ${esc(t("ts.customTask"))}</option>` : ""}`;
}

function entryRow(ts, e) {
  const p = getProject(ts, e.projectId);
  const client = getClient(ts, p?.clientId);
  return `<li class="ts-entry ${e.overtime ? "is-overtime" : ""}">
    <div class="ts-entry-project"><strong>${esc(p?.number || "")}</strong> ${esc(p?.name ?? "?")}
      ${client ? `<span class="hint">${esc(client.name)}</span>` : ""}</div>
    <label class="ts-entry-hours"><span class="hint">${t("ts.hours")}</span>
      <input class="ts-hours" data-action="ts-hours" data-id="${esc(e.id)}" value="${esc(fmt.hours(e.hours))}" inputmode="decimal" autocomplete="off"></label>
    <button type="button" class="check-remove" data-action="ts-remove" data-id="${esc(e.id)}" aria-label="${esc(t("ts.remove"))}">×</button>
    <div class="ts-entry-task">
      <select data-action="ts-entry-task" data-id="${esc(e.id)}" aria-label="${esc(t("ts.task"))}">${taskOptions(ts, e.taskCode)}</select>
      ${e.taskCode && !getTask(ts, e.taskCode) && e.task ? `<span class="hint">${esc(e.task)}</span>` : ""}
      <input data-action="ts-entry-field" data-field="work" data-id="${esc(e.id)}" value="${esc(e.work)}"
        placeholder="${esc(t("ts.workPlaceholder"))}" aria-label="${esc(t("ts.work"))}" autocomplete="off">
    </div>
    <label class="ts-ot-toggle"><input type="checkbox" data-action="ts-entry-ot" data-id="${esc(e.id)}" ${e.overtime ? "checked" : ""}> ${t("ts.overtime")}</label>
    <input class="ts-note" data-action="ts-entry-field" data-field="note" data-id="${esc(e.id)}" value="${esc(e.note)}" placeholder="${esc(t("ts.notePlaceholder"))}"
      aria-label="${esc(t("ts.note"))}" autocomplete="off">
  </li>`;
}

// Taux de change avec le séparateur décimal de la langue (« 0,000053931 »)
const rateText = (rate) => String(rate ?? "").replace(".", fmt.hours(1.5).replace(/\d/g, ""));

// Une dépense de la journée : type, pour quoi, montant en $ CA (et d'origine).
function expenseRow(ts, e) {
  const p = e.projectId ? getProject(ts, e.projectId) : null;
  const target = p ? p.number || p.name : t("ts.generalShort", { client: getClient(ts, e.clientId)?.name ?? "" });
  const origin = isMileage(e)
    ? `${fmt.hours(e.qty)} km × ${fmt.money(e.unitPrice)}`
    : e.currency !== "CAD" ? `${fmt.hours(e.amount)} ${e.currency} × ${rateText(e.rate)}` : "";
  return `<li class="ts-expense-row">
    <span class="ts-expense-icon" aria-hidden="true">${EXPENSE_ICONS[e.type]}</span>
    <div class="ts-expense-text"><strong>${esc(t(`ts.expenseType.${e.type}`))}</strong>${e.description ? ` · ${esc(e.description)}` : ""}
      <span class="hint">${esc(target)}${origin ? ` · ${esc(origin)}` : ""}</span></div>
    <span class="ts-expense-amount">${esc(fmt.money(expenseTotal(e)))}</span>
    <button type="button" class="ts-attach-btn ${e.attachments.length ? "has-files" : ""}" data-action="ts-attach" data-id="${esc(e.id)}"
      aria-label="${esc(t("attach.title"))} (${e.attachments.length})" title="${esc(t("attach.title"))}">📎${e.attachments.length ? `<span>${e.attachments.length}</span>` : ""}</button>
    <button type="button" class="ts-expense-edit-btn" data-action="ts-expense-edit" data-id="${esc(e.id)}" aria-label="${esc(t("ts.editExpense"))}" title="${esc(t("ts.editExpense"))}">✏️</button>
    <button type="button" class="check-remove" data-action="ts-expense-remove" data-id="${esc(e.id)}" aria-label="${esc(t("ts.remove"))}">×</button>
  </li>`;
}

// Choix « pour quoi » : un projet actif, ou les frais généraux d'un client.
function targetOptions(ts, projects, chosen, selected, editing) {
  // Une dépense modifiée garde son projet, même archivé depuis.
  const list = editing?.projectId && !projects.some((p) => p.id === editing.projectId)
    ? [...projects, getProject(ts, editing.projectId)].filter(Boolean) : projects;
  return `${list.map((p) => `<option value="p:${esc(p.id)}" ${`p:${p.id}` === selected ? "selected" : ""}>${esc([p.number, p.name].filter(Boolean).join(" · "))}</option>`).join("")}
    ${ts.clients.map((c) => `<option value="c:${esc(c.id)}" ${`c:${c.id}` === selected ? "selected" : ""}>${esc(t("ts.generalShort", { client: c.name }))}</option>`).join("")}`;
}

// Nom de la devise dans la langue choisie (« AED — dirham des Émirats arabes unis »)
function currencyLabel(code) {
  try {
    const name = new Intl.DisplayNames([getLanguage(), "en"], { type: "currency" }).of(code);
    return name && name !== code ? `${code} — ${name}` : code;
  } catch {
    return code;
  }
}

// Formulaire d'une dépense : nouvelle, ou modification de `editing`.
function expenseForm(ts, date, projects, chosen, editing) {
  const e = editing;
  const lastCurrency = [...ts.expenses].sort((x, y) => x.date.localeCompare(y.date)).filter((x) => !isMileage(x)).at(-1)?.currency ?? "CAD";
  const currency = e && !isMileage(e) ? e.currency : lastCurrency;
  const type = e?.type ?? EXPENSE_TYPES[0];
  const mileage = type === "mileage";
  const target = e ? (e.projectId ? `p:${e.projectId}` : `c:${e.clientId}`) : `p:${chosen}`;
  const rate = e && !isMileage(e) && e.currency !== "CAD" ? e.rate : ts.rates[currency];
  const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [...CURRENCIES, currency];
  return `<form class="form ts-new ts-expense-form" data-role="ts-expense" data-date="${date}" ${e ? `data-edit="${esc(e.id)}"` : ""}
      data-rates="${esc(JSON.stringify(ts.rates))}" data-mileage="${e && mileage ? e.unitPrice : ts.business.mileageRate}">
    ${e ? `<h3>✏️ ${t("ts.editExpense")}</h3>` : ""}
    <div class="ts-expense-types">${EXPENSE_TYPES.map((x) => `<label class="ts-project-chip">
      <input type="radio" name="type" value="${x}" ${x === type ? "checked" : ""}><span>${EXPENSE_ICONS[x]} ${t(`ts.expenseType.${x}`)}</span></label>`).join("")}</div>
    ${e ? `<label>${t("ts.expenseDate")} <input type="date" name="date" value="${e.date}"></label>` : ""}
    <label>${t("ts.expenseDesc")} <input name="description" value="${esc(e?.description ?? "")}" placeholder="${esc(t("ts.expenseDescPlaceholder"))}" autocomplete="off"></label>
    <label>${t("ts.expenseFor")} <select name="target">${targetOptions(ts, projects, chosen, target, e)}</select></label>
    <div class="row" data-role="money-row" ${mileage ? "hidden" : ""}>
      <label>${t("ts.amount")} <input name="amount" inputmode="decimal" value="${e && !mileage ? esc(fmt.hours(e.amount)) : ""}"
        placeholder="${esc(t("ts.example", { value: "25,50" }))}" autocomplete="off"></label>
      <label>${t("ts.currency")} <select name="currency">${currencies.map((c) => `<option value="${c}" ${c === currency ? "selected" : ""}>${esc(currencyLabel(c))}</option>`).join("")}</select></label>
    </div>
    <label data-role="rate-row" ${mileage || currency === "CAD" ? "hidden" : ""}><span data-role="rate-label">${esc(t("ts.rateFor", { currency }))}</span>
      <input name="rate" inputmode="decimal" value="${esc(rateText(rate))}" autocomplete="off"></label>
    <label data-role="km-row" ${mileage ? "" : "hidden"}>${t("ts.km")} <input name="km" inputmode="decimal" value="${e && mileage ? esc(fmt.hours(e.qty)) : ""}"
      placeholder="${esc(t("ts.example", { value: "128" }))}" autocomplete="off">
      <span class="hint">${esc(t("ts.mileageHint", { rate: fmt.money(e && mileage ? e.unitPrice : ts.business.mileageRate) }))}</span></label>
    ${e ? "" : `<label class="switch" data-role="monthly-row" ${mileage ? "hidden" : ""}><input type="checkbox" name="monthly">
      <span>🔁 ${esc(t("ts.monthly", { day: dayOfMonth(date.slice(8)) }))}</span></label>`}
    <p class="ts-expense-preview" data-role="expense-preview" aria-live="polite">${e ? `= ${esc(fmt.money(expenseTotal(e)))}` : ""}</p>
    <p class="form-errors" data-role="errors" role="alert"></p>
    <div class="actions">
      ${e ? `<button type="button" class="btn ghost" data-action="ts-expense-cancel">${t("form.cancel")}</button>` : ""}
      <button type="submit" class="btn primary">${t(e ? "ts.saveChanges" : "ts.saveExpense")}</button>
    </div>
  </form>`;
}

// « 1er » en français pour le premier du mois
export const dayOfMonth = (day) => (getLanguage() === "fr" && Number(day) === 1 ? "1er" : String(Number(day)));

// Dépenses mensuelles en cours (ex. le cellulaire) : montant modifiable, arrêter.
function monthlyList(ts) {
  if (!ts.recurring?.length) return "";
  return `<details class="ts-monthly">
    <summary>🔁 ${esc(t("ts.monthlyList", { count: ts.recurring.length }))}</summary>
    <ul class="ts-monthly-list">${ts.recurring.map((r) => {
      const p = r.projectId ? getProject(ts, r.projectId) : null;
      const target = p ? p.number || p.name : t("ts.generalShort", { client: getClient(ts, r.clientId)?.name ?? "" });
      return `<li>
        <span aria-hidden="true">${EXPENSE_ICONS[r.type]}</span>
        <div><strong>${esc(r.description || t(`ts.expenseType.${r.type}`))}</strong>
          <span class="hint">${esc(target)} · ${esc(t("ts.monthlyDay", { day: dayOfMonth(r.day) }))}</span></div>
        <label class="ts-monthly-amount">${r.currency}
          <input data-action="ts-recurring-amount" data-id="${esc(r.id)}" value="${esc(fmt.hours(r.amount))}" inputmode="decimal" aria-label="${esc(t("ts.amount"))}"></label>
        <button type="button" class="btn link danger" data-action="ts-recurring-stop" data-id="${esc(r.id)}">${t("ts.stop")}</button>
      </li>`;
    }).join("")}</ul>
    <p class="hint">${t("ts.monthlyHint")}</p>
  </details>`;
}

function expensesBlock(ts, date, projects, chosen, editingId) {
  const list = dayExpenses(ts, date);
  const editing = ts.expenses.find((x) => x.id === editingId) ?? null;
  const canAdd = projects.length || ts.clients.length;
  return `<div class="ts-expenses">
    <h3>💳 ${t("ts.expenses")}${list.length ? ` <span class="hint">${esc(fmt.money(sumExpenses(list)))}</span>` : ""}</h3>
    ${list.length ? `<ul class="ts-expense-list">${list.map((e) => (editing?.id === e.id
      ? `<li class="ts-expense-edit">${expenseForm(ts, date, projects, chosen, editing)}</li>`
      : expenseRow(ts, e))).join("")}</ul>` : ""}
    ${monthlyList(ts)}
    ${canAdd && !editing ? `<details class="ts-new-wrap" data-role="expense-wrap">
      <summary class="btn soft">＋ ${t("ts.addExpense")}</summary>
      ${expenseForm(ts, date, projects, chosen, null)}
    </details>` : ""}
  </div>`;
}

// Présence de la journée : début, fin, pause ; heures travaillées comparées aux heures notées.
// Une valeur pas encore confirmée est proposée en gris (début 9 h 30, fin 17 h, pause 0,5)
// et sert au balancement ; elle n'est enregistrée qu'une fois confirmée.
function presenceBlock(ts, date) {
  const p = getPresence(ts, date);
  const worked = presenceHours(withSuggestions(p));
  const suggesting = !p.start || !p.end || p.pause === null;
  const logged = dayTotal(ts, date);
  const gap = worked === null ? 0 : Math.round((worked - logged) * 100) / 100;
  const input = (field, extra) => `data-action="ts-presence" data-field="${field}" data-date="${date}" ${extra}`;
  let status = `<p class="hint">${t("ts.presenceHint")}</p>`;
  if (worked !== null) {
    const balance = gap === 0
      ? `<span class="ts-balance is-ok">✓ ${t("ts.balanced")}</span>`
      : gap > 0
        ? `<span class="ts-balance is-left">${esc(t("ts.toAllocate", { hours: h(gap) }))}</span>
           <button type="button" class="btn soft ts-fill-gap" data-action="ts-fill-gap" data-hours="${gap}">＋ ${esc(t("ts.fillGap", { hours: h(gap) }))}</button>`
        : `<span class="ts-balance is-over">${esc(t("ts.overPresence", { hours: h(-gap) }))}</span>`;
    status = `<p class="ts-presence-status"><strong>${esc(t("ts.worked", { hours: h(worked) }))}</strong>
      <span class="hint">${esc(t("ts.logged", { hours: h(logged) }))}</span></p><div class="ts-balance-row">${balance}</div>
      ${suggesting ? `<p class="hint">${t("ts.suggestedHint")}</p>` : ""}`;
  }
  return `<div class="ts-presence">
    <h3>🕘 ${t("ts.presence")}</h3>
    <div class="ts-presence-row">
      <label>${t("ts.start")} <input type="time" ${input("start", p.start ? `value="${p.start}"` : `data-suggest="${SUGGESTED.start}" class="is-suggested"`)}></label>
      <label>${t("ts.end")} <input type="time" ${input("end", p.end ? `value="${p.end}"` : `data-suggest="${SUGGESTED.end}" class="is-suggested"`)}></label>
      <label>${t("ts.pause")} <input ${input("pause", `${p.pause !== null ? `value="${esc(fmt.hours(p.pause))}"` : `data-suggest="${esc(fmt.hours(SUGGESTED.pause))}" class="is-suggested"`}
        inputmode="decimal" autocomplete="off" placeholder="${esc(t("ts.pausePlaceholder"))}"`)}></label>
    </div>
    ${status}
  </div>`;
}

// Semaine de la journée affichée : un bouton par jour (heures notées), semaine d'avant ou d'après.
function weekStrip(ts, date, today) {
  const monday = startOfWeek(parseISODate(date));
  const days = Array.from({ length: 7 }, (_, i) => toISODate(addDays(monday, i)));
  const jump = (n) => toISODate(addDays(parseISODate(date), n));
  return `<nav class="ts-week" aria-label="${esc(t("ts.weekNav"))}">
    <button type="button" class="ts-week-jump" data-action="ts-day" data-date="${jump(-7)}" aria-label="${esc(t("ts.prevWeek"))}" title="${esc(t("ts.prevWeek"))}">«</button>
    ${days.map((d) => {
      const hours = dayTotal(ts, d);
      const spent = dayExpenses(ts, d).length > 0;
      return `<button type="button" class="ts-week-day ${d === date ? "is-current" : ""} ${d === today ? "is-today" : ""}" data-action="ts-day" data-date="${d}"
        aria-current="${d === date ? "date" : "false"}" aria-label="${esc(fmt.longDate(parseISODate(d)))}${hours ? ` · ${esc(h(hours))}` : ""}">
        <span class="ts-week-name">${esc(fmt.weekdayShort(parseISODate(d)))}</span>
        <span class="ts-week-num">${parseISODate(d).getDate()}</span>
        <span class="ts-week-hours">${hours ? esc(fmt.hours(hours)) : spent ? "💳" : "·"}</span>
      </button>`;
    }).join("")}
    <button type="button" class="ts-week-jump" data-action="ts-day" data-date="${jump(7)}" aria-label="${esc(t("ts.nextWeek"))}" title="${esc(t("ts.nextWeek"))}">»</button>
  </nav>`;
}

function daySection(ts, date, today, selected, editingExpense) {
  const entries = dayEntries(ts, date);
  const projects = activeProjects(ts);
  const chosen = projects.some((p) => p.id === selected) ? selected : projects[0]?.id;
  const task = chosen ? lastTask(ts, chosen) : { code: "", task: "" };
  // Dernière tâche du projet : du catalogue, sinon « autre tâche » (code écrit à la main)
  const taskCode = !task.code ? "" : getTask(ts, task.code) ? task.code : CUSTOM_TASK;
  const prev = entries.length ? null : previousWorkday(ts, date);
  const title = date === today ? t("nav.today") : fmt.longDate(parseISODate(date));
  return `<section class="card ts-day">
    <header class="ts-day-head">
      <button type="button" class="nav-arrow" data-action="ts-day" data-date="${toISODate(addDays(parseISODate(date), -1))}"
        aria-label="${esc(t("nav.prev.day"))}" title="${esc(t("nav.prev.day"))}">${CHEVRON_LEFT}</button>
      <label class="ts-date-pick" title="${esc(t("ts.pickDate"))}">
        <h2>${esc(title)} <span aria-hidden="true">📅</span></h2>
        <input type="date" data-action="ts-goto" value="${date}" aria-label="${esc(t("ts.pickDate"))}">
      </label>
      <button type="button" class="nav-arrow" data-action="ts-day" data-date="${toISODate(addDays(parseISODate(date), 1))}"
        aria-label="${esc(t("nav.next.day"))}" title="${esc(t("nav.next.day"))}">${CHEVRON_RIGHT}</button>
      ${date !== today ? `<button type="button" class="btn soft" data-action="ts-day" data-date="${today}">${t("nav.today")}</button>` : ""}
    </header>
    ${weekStrip(ts, date, today)}
    <div class="ts-totals">
      <span class="ts-total">${esc(h(dayTotal(ts, date)))}</span>
      <span class="hint">${esc(t("ts.week", { hours: h(weekTotal(ts, date)) }))}</span>
    </div>
    ${presenceBlock(ts, date)}
    ${entries.length ? `<ul class="ts-entries">${entries.map((e) => entryRow(ts, e)).join("")}</ul>` : ""}
    ${prev ? `<button type="button" class="btn soft" data-action="ts-copy" data-from="${prev}" data-date="${date}">📋 ${esc(t("ts.copyDay", { date: fmt.longDate(parseISODate(prev)) }))}</button>` : ""}
    ${projects.length ? `<form class="ts-add" data-role="ts-add" data-date="${date}">
        ${step(1, t("ts.step1"))}
        <div class="ts-projects">${projects.map((p) => `<label class="ts-project-chip">
          <input type="radio" name="projectId" value="${esc(p.id)}" ${p.id === chosen ? "checked" : ""}
            data-task-code="${esc(lastTask(ts, p.id).code)}" data-task="${esc(lastTask(ts, p.id).task)}">
          <span><strong>${esc(p.number)}</strong> ${esc(p.name)}</span></label>`).join("")}</div>
        ${step(2, t("ts.step2"))}
        <div class="ts-add-row">
          <input name="hours" class="ts-hours" inputmode="decimal" placeholder="${esc(t("ts.hoursPlaceholder"))}" aria-label="${esc(t("ts.hours"))}" autocomplete="off">
          ${QUICK_STEPS.map((s) => `<button type="button" class="btn soft ts-step-btn" data-action="ts-bump" data-step="${s}">+${s === 0.25 ? "¼" : s === 0.5 ? "½" : "1"}</button>`).join("")}
        </div>
        <div class="segmented ts-kind" role="radiogroup" aria-label="${esc(t("ts.kind"))}">
          <label><input type="radio" name="overtime" value="0" checked><span>${t("ts.regular")}</span></label>
          <label><input type="radio" name="overtime" value="1"><span>${t("ts.overtime")}</span></label>
        </div>
        <label>${t("ts.task")} <select name="taskCode" data-role="task-select">${taskOptions(ts, taskCode, { custom: true })}</select></label>
        <p class="hint ts-task-scope" data-role="task-scope">${esc(getTask(ts, taskCode)?.scope ?? "")}</p>
        <div class="ts-task-row" data-role="custom-task" ${taskCode === CUSTOM_TASK ? "" : "hidden"}>
          <label>${t("ts.taskCode")} <input name="customCode" value="${esc(taskCode === CUSTOM_TASK ? task.code : "")}" placeholder="${esc(t("ts.example", { value: "TR01" }))}" autocomplete="off"></label>
          <label>${t("ts.taskDesc")} <input name="customTask" value="${esc(taskCode === CUSTOM_TASK ? task.task : "")}" placeholder="${esc(t("ts.taskDescPlaceholder"))}" autocomplete="off"></label>
        </div>
        <label>${t("ts.work")} <input name="work" placeholder="${esc(t("ts.workPlaceholder"))}" autocomplete="off"></label>
        <label class="ts-note-label">${t("ts.notePrivate")} <input name="note" class="ts-note" placeholder="${esc(t("ts.notePlaceholder"))}" autocomplete="off"></label>
        ${step(3, t("ts.step3"))}
        <p class="form-errors" data-role="errors" role="alert"></p>
        <button type="submit" class="btn primary">${t("ts.add")}</button>
      </form>`
      : `<p class="empty-msg small">${t("ts.noProjects")}</p>`}
    ${expensesBlock(ts, date, projects, chosen, editingExpense)}
  </section>`;
}

function clientOptions(ts, selected, { none = true } = {}) {
  return `${none ? `<option value="">${esc(t("ts.noClient"))}</option>` : ""}${ts.clients.map((c) =>
    `<option value="${esc(c.id)}" ${c.id === selected ? "selected" : ""}>${esc(c.name)}</option>`).join("")}`;
}

// Formulaire d'ajout replié derrière « + Nouveau … » dès qu'il y a déjà des fiches,
// pour ne pas le confondre avec les fiches existantes.
const addBlock = (open, summary, form) => `<details class="ts-new-wrap" ${open ? "open" : ""}>
  <summary class="btn soft">＋ ${summary}</summary>${form}</details>`;

function projectCard(ts, p) {
  const field = (name, label, input) => `<label>${label} ${input}</label>`;
  const attrs = (f) => `data-action="ts-project-field" data-id="${esc(p.id)}" data-field="${f}" autocomplete="off"`;
  return `<li class="ts-card ${p.archived ? "is-archived" : ""}" data-project-card="${esc(p.id)}">
    <div class="row">
      ${field("number", t("ts.number"), `<input ${attrs("number")} value="${esc(p.number)}">`)}
      ${field("name", t("ts.projectName"), `<input ${attrs("name")} value="${esc(p.name)}">`)}
    </div>
    ${field("clientId", t("ts.client"), `<select ${attrs("clientId")}>${clientOptions(ts, p.clientId)}</select>`)}
    <div class="row">
      ${field("rate", `${t("ts.rateRegular")} ($/h)`, `<input ${attrs("rate")} value="${rateValue(p.rate)}" inputmode="decimal">`)}
      ${field("overtimeRate", `${t("ts.rateOvertime")} ($/h)`, `<input ${attrs("overtimeRate")} value="${rateValue(p.overtimeRate)}" inputmode="decimal"
        placeholder="${p.rate != null ? esc(fmt.hours(rateFor(p, true))) : ""}">`)}
    </div>
    <label class="switch"><input type="checkbox" data-action="ts-project-pin" data-id="${esc(p.id)}" ${p.pinned ? "checked" : ""}><span>📌 ${t("ts.pinFirst")}</span></label>
    <div class="ts-card-actions">
      ${p.archived ? "" : `<button type="button" class="btn soft" data-action="ts-pick" data-id="${esc(p.id)}">⏱️ ${t("ts.logHours")}</button>`}
      <button type="button" class="btn link" data-action="ts-archive" data-id="${esc(p.id)}">${t(p.archived ? "ts.unarchive" : "ts.archive")}</button>
      <button type="button" class="btn link danger" data-action="ts-delete-project" data-id="${esc(p.id)}">🗑 ${t("ts.delete")}</button>
    </div>
  </li>`;
}

function projectsSection(ts) {
  const list = [...ts.projects].sort((a, b) => Number(a.archived) - Number(b.archived) || projectOrder(a, b));
  // Taux du dernier projet ajouté, proposé (déjà écrit) pour le nouveau projet
  const suggestedRate = [...ts.projects].reverse().find((p) => p.rate != null)?.rate ?? null;
  return foldSection("ts-projects", {
    title: esc(t("ts.projects")),
    extra: String(ts.projects.filter((p) => !p.archived).length),
    open: isFoldOpen("ts-projects", ts.projects.length === 0),
    body: `${list.length ? `<ul class="ts-cards form">${list.map((p) => projectCard(ts, p)).join("")}</ul>` : ""}
      ${addBlock(!list.length, t("ts.newProject"), `<form class="form ts-new" data-role="ts-new-project">
        <div class="row">
          <label>${t("ts.number")} <input name="number" placeholder="${esc(t("ts.example", { value: "CA15713" }))}" autocomplete="off"></label>
          <label>${t("ts.projectName")} <input name="name" placeholder="${esc(t("ts.projectNamePlaceholder"))}" autocomplete="off"></label>
        </div>
        <label>${t("ts.client")} <select name="clientId">${clientOptions(ts, ts.clients[0]?.id ?? "")}</select></label>
        <div class="row">
          <label>${t("ts.rateRegular")} ($/h) <input name="rate" inputmode="decimal" autocomplete="off"
            ${suggestedRate ? `value="${esc(fmt.hours(suggestedRate))}"` : `placeholder="${esc(t("ts.example", { value: "68" }))}"`}></label>
          <label>${t("ts.rateOvertime")} ($/h) <input name="overtimeRate" inputmode="decimal" autocomplete="off"
            placeholder="${esc(suggestedRate ? fmt.hours(suggestedRate * 1.5) : t("ts.example", { value: "102" }))}"></label>
        </div>
        <p class="hint">${t(suggestedRate ? "ts.rateSuggestedHint" : "ts.overtimeHint")}</p>
        <p class="form-errors" data-role="errors" role="alert"></p>
        <div class="actions"><button type="submit" class="btn primary">${t("ts.addProject")}</button></div>
      </form>`)}`,
  });
}

function tasksSection(ts) {
  const list = ts.tasks;
  return foldSection("ts-tasks", {
    title: esc(t("ts.tasks")),
    extra: String(list.length),
    open: isFoldOpen("ts-tasks", false),
    body: `<p class="hint">${t("ts.tasksHint")}</p>
      <ul class="ts-task-list">${list.map((task) => `<li class="${task.quick ? "is-quick" : ""}">
        <button type="button" class="ts-star" data-action="ts-task-quick" data-code="${esc(task.code)}" aria-pressed="${task.quick}"
          aria-label="${esc(t("ts.quickToggle", { code: task.code }))}" title="${esc(t("ts.quickToggle", { code: task.code }))}">${task.quick ? "⭐" : "☆"}</button>
        <strong class="ts-task-code">${esc(task.code)}</strong>
        <div class="ts-task-text">
          <input data-action="ts-task-field" data-code="${esc(task.code)}" data-field="description" value="${esc(task.description)}" aria-label="${esc(t("ts.taskDesc"))}">
          <input data-action="ts-task-field" data-code="${esc(task.code)}" data-field="scope" value="${esc(task.scope)}" placeholder="${esc(t("ts.taskScope"))}" aria-label="${esc(t("ts.taskScope"))}" class="ts-task-scope-input">
        </div>
        <button type="button" class="check-remove" data-action="ts-task-remove" data-code="${esc(task.code)}" aria-label="${esc(t("ts.delete"))}">×</button>
      </li>`).join("")}</ul>
      ${addBlock(false, t("ts.newTask"), `<form class="form ts-new" data-role="ts-new-task">
        <div class="row">
          <label>${t("ts.taskCode")} <input name="code" placeholder="${esc(t("ts.example", { value: "TR01" }))}" autocomplete="off"></label>
          <label>${t("ts.taskDesc")} <input name="description" placeholder="${esc(t("ts.example", { value: "Travel time" }))}" autocomplete="off"></label>
        </div>
        <label>${t("ts.taskScope")} <input name="scope" autocomplete="off"></label>
        <label class="switch"><input type="checkbox" name="quick" checked><span>${t("ts.inQuick")}</span></label>
        <p class="form-errors" data-role="errors" role="alert"></p>
        <div class="actions"><button type="submit" class="btn primary">${t("ts.addTask")}</button></div>
      </form>`)}`,
  });
}

function clientCard(c) {
  const attrs = (f) => `data-action="ts-client-field" data-id="${esc(c.id)}" data-field="${f}" autocomplete="off"`;
  return `<li class="ts-card">
    <label>${t("ts.clientName")} <input ${attrs("name")} value="${esc(c.name)}"></label>
    <div class="row">
      <label>${t("ts.contact")} <input ${attrs("contact")} value="${esc(c.contact)}"></label>
      <label>${t("ts.email")} <input ${attrs("email")} type="email" value="${esc(c.email)}"></label>
    </div>
    <label>${t("ts.address")} <textarea ${attrs("address")} rows="3">${esc(c.address)}</textarea></label>
    <label>${t("ts.po")} <input ${attrs("po")} value="${esc(c.po)}"></label>
    <label class="switch"><input type="checkbox" data-action="ts-client-tax" data-id="${esc(c.id)}" data-tax="tps" ${c.tps ? "checked" : ""}><span>${t("ts.chargeTps")}</span></label>
    <label class="switch"><input type="checkbox" data-action="ts-client-tax" data-id="${esc(c.id)}" data-tax="tvq" ${c.tvq ? "checked" : ""}><span>${t("ts.chargeTvq")}</span></label>
    <div class="ts-card-actions">
      <button type="button" class="btn link danger" data-action="ts-delete-client" data-id="${esc(c.id)}">🗑 ${t("ts.delete")}</button>
    </div>
  </li>`;
}

function clientsSection(ts) {
  return foldSection("ts-clients", {
    title: esc(t("ts.clients")),
    extra: String(ts.clients.length),
    open: isFoldOpen("ts-clients", ts.clients.length === 0),
    body: `${ts.clients.length ? `<p class="hint">${t("ts.editHint")}</p><ul class="ts-cards form">${ts.clients.map(clientCard).join("")}</ul>` : ""}
      ${addBlock(!ts.clients.length, t("ts.newClient"), `<form class="form ts-new" data-role="ts-new-client">
        <label>${t("ts.clientName")} <input name="name" placeholder="${esc(t("ts.clientNamePlaceholder"))}" autocomplete="off"></label>
        <div class="row">
          <label>${t("ts.contact")} <input name="contact" autocomplete="off"></label>
          <label>${t("ts.email")} <input name="email" type="email" autocomplete="off"></label>
        </div>
        <label>${t("ts.address")} <textarea name="address" rows="3"></textarea></label>
        <label class="switch"><input type="checkbox" name="tps" checked><span>${t("ts.chargeTps")}</span></label>
        <label class="switch"><input type="checkbox" name="tvq" checked><span>${t("ts.chargeTvq")}</span></label>
        <p class="form-errors" data-role="errors" role="alert"></p>
        <div class="actions"><button type="submit" class="btn primary">${t("ts.addClient")}</button></div>
      </form>`)}`,
  });
}

// Exemple d'une ligne de facture selon les options choisies
function lineExample(b) {
  const task = [b.showTaskCodes ? "QA04" : "", b.showTaskDescription ? "Painting specification review" : ""].filter(Boolean).join(" : ");
  return `CA15713${b.showProjectName ? " · Siemens Grand Tower" : ""}${task ? `  —  ${task}` : ""}  —  Reviewed galvanizing requirements`;
}

function businessSection(ts) {
  const b = ts.business;
  const attrs = (f) => `data-action="ts-business-field" data-field="${f}" autocomplete="off"`;
  const field = (f, label, extra = "") => `<label>${label} <input ${attrs(f)} value="${esc(b[f])}" ${extra}></label>`;
  return foldSection("ts-business", {
    title: esc(t("ts.business")),
    open: isFoldOpen("ts-business", false),
    body: `<p class="hint">${t("ts.businessHint")}</p>
      <div class="form ts-card">
        <div class="ts-logo">
          ${b.logo ? `<img src="${esc(b.logo)}" alt="${esc(t("ts.logo"))}">` : `<span class="hint">${t("ts.noLogo")}</span>`}
          <label class="btn soft">🖼️ ${t(b.logo ? "ts.changeLogo" : "ts.addLogo")}
            <input type="file" accept="image/png,image/jpeg,image/*" data-action="ts-logo" hidden></label>
          ${b.logo ? `<button type="button" class="btn link danger" data-action="ts-logo-remove">${t("ts.removeLogo")}</button>` : ""}
        </div>
        ${field("name", t("ts.businessName"))}
        ${field("contact", t("ts.yourName"))}
        <label>${t("ts.address")} <textarea ${attrs("address")} rows="3">${esc(b.address)}</textarea></label>
        <div class="row">${field("phone", t("ts.phone"), 'type="tel"')}${field("email", t("ts.email"), 'type="email"')}</div>
        <div class="row">${field("tpsNumber", t("ts.tpsNumber"))}${field("tvqNumber", t("ts.tvqNumber"))}</div>
        <div class="row">${field("terms", t("ts.terms"), 'inputmode="numeric"')}${field("nextInvoice", t("ts.nextInvoice"), `placeholder="${esc(t("ts.example", { value: "2026-115" }))}"`)}</div>
        <h3>${t("ts.invoiceLines")}</h3>
        <p class="hint">${t("ts.invoiceLinesHint")}</p>
        ${["showProjectName", "showTaskCodes", "showTaskDescription"].map((f) => `<label class="switch">
          <input type="checkbox" data-action="ts-business-toggle" data-field="${f}" ${b[f] ? "checked" : ""}><span>${t(`ts.${f}`)}</span></label>`).join("")}
        <p class="hint ts-line-example" data-role="line-example">${esc(t("ts.example", { value: lineExample(b) }))}</p>
        <label>${t("ts.mileageRate")} <input ${attrs("mileageRate")} value="${esc(fmt.hours(b.mileageRate))}" inputmode="decimal"></label>
        <h3>${t("ts.rates")}</h3>
        ${Object.keys(ts.rates).length
          ? `<div class="ts-rates">${Object.entries(ts.rates).map(([cur, rate]) => `<label>${esc(t("ts.rateFor", { currency: cur }))}
              <input data-action="ts-rate" data-currency="${cur}" value="${esc(rateText(rate))}" inputmode="decimal" autocomplete="off"></label>`).join("")}</div>`
          : `<p class="hint">${t("ts.noRates")}</p>`}
      </div>`,
  });
}

function invoiceBlock(ts, today, clientId, from, to, hasHours, invoiceNumber = "") {
  const client = getClient(ts, clientId);
  if (!client) return `<div class="ts-invoice"><h3>🧾 ${t("ts.invoice")}</h3><p class="ts-empty-export">${t("ts.invoicePickClient")}</p></div>`;
  return `<div class="ts-invoice form" data-role="ts-invoice" data-client="${esc(client.id)}" data-from="${from}" data-to="${to}">
    <h3>🧾 ${t("ts.invoice")} — ${esc(client.name)}</h3>
    <div class="row">
      <label>${t("ts.invoiceNumber")} <input name="number" value="${esc(invoiceNumber || ts.business.nextInvoice)}" placeholder="${esc(t("ts.example", { value: "2026-115" }))}" autocomplete="off"></label>
      <label>${t("ts.invoiceDate")} <input name="date" type="date" value="${today}"></label>
    </div>
    <label>${t("ts.po")} <input name="po" value="${esc(client.po)}" autocomplete="off"></label>
    ${ts.business.name ? "" : `<p class="hint">⚠️ ${t("ts.businessMissing")}</p>`}
    ${hasHours ? `<div class="actions start">
        <button type="button" class="btn primary" data-action="ts-invoice-preview">👁️ ${t("ts.invoicePreview")}</button>
        <button type="button" class="btn soft" data-action="ts-invoice">📊 ${t("ts.createInvoice")}</button>
      </div>
      <div class="actions start">
        <button type="button" class="btn soft" data-action="ts-invoice-pdf">📄 ${t("ts.invoicePdf")}</button>
        <button type="button" class="btn soft" data-action="ts-receipts-pdf">🧾 ${t("ts.receiptsPdf")}</button>
      </div>
      <div class="actions start">
        <button type="button" class="btn primary" data-action="ts-invoice-email">✉️ ${t("ts.sendToClient")}</button>
      </div>
      <p class="hint">${t("ts.sendHint")}</p>` : ""}
  </div>`;
}

function exportSection(ts, today, exp) {
  const { from, to } = rangeDates(exp.range, today, exp);
  // Un seul client : il est choisi d'office (la facture est pour un client).
  const clientId = exp.clientId || (ts.clients.length === 1 ? ts.clients[0].id : "");
  const s = periodSummary(ts, from, to, clientId || null);
  const spent = sumExpenses(periodExpenses(ts, from, to, clientId || null));
  return foldSection("ts-export", {
    title: esc(t("ts.exportInvoice")),
    open: isFoldOpen("ts-export", false),
    body: `<div class="segmented wrap ts-ranges">${EXPORT_RANGES.map((r) => `<button type="button" data-action="ts-range" data-range="${r}"
        class="${exp.range === r ? "active" : ""}" aria-pressed="${exp.range === r}">${t(`ts.range.${r}`)}</button>`).join("")}</div>
      <div class="row ts-export-row">
        <label>${t("ts.from")} <input type="date" data-action="ts-export-date" data-field="from" value="${from}" ${exp.range === "custom" ? "" : "disabled"}></label>
        <label>${t("ts.to")} <input type="date" data-action="ts-export-date" data-field="to" value="${to}" ${exp.range === "custom" ? "" : "disabled"}></label>
      </div>
      <label class="ts-export-client">${t("ts.client")}
        <select data-action="ts-export-client"><option value="">${esc(t("ts.allClients"))}</option>${clientOptions(ts, clientId, { none: false })}</select></label>
      ${s.projects.length || spent ? `<table class="ts-summary">
          <thead><tr><th>${t("ts.project")}</th><th>${t("ts.hours")}</th><th>${t("ts.rate")}</th><th>${t("ts.amount")}</th></tr></thead>
          <tbody>${s.projects.map((r) => `<tr><td><strong>${esc(r.project?.number ?? "")}</strong> ${esc(r.project?.name ?? "")}
              ${r.overtime ? `<span class="ts-badge">${t("ts.overtime")}</span>` : ""}</td>
            <td>${esc(h(r.hours))}</td><td>${r.rate != null ? esc(fmt.money(r.rate)) : "—"}</td><td>${esc(money(r.amount))}</td></tr>`).join("")}</tbody>
          <tfoot>${spent ? `<tr><td colspan="3">💳 ${t("ts.expensesTotal")}</td><td>${esc(fmt.money(spent))}</td></tr>` : ""}
            <tr><th>${t("ts.total")}</th><th>${esc(h(s.hours))}</th><th></th><th>${esc(fmt.money(s.amount + spent))}</th></tr></tfoot>
        </table>
        <button type="button" class="btn soft" data-action="ts-export" data-from="${from}" data-to="${to}" data-client="${esc(clientId)}">📊 ${t("ts.exportExcel")}</button>`
      : `<p class="ts-empty-export">${t("ts.nothingToExport")}</p>`}
      ${invoiceBlock(ts, today, clientId, from, to, s.projects.length > 0 || spent > 0, exp.invoiceNumber)}`,
  });
}

export const timesheetPage = {
  id: "timesheet",

  title: () => t("nav.timesheet"),

  render({ repo, today, timesheetDate, timesheetExport, timesheetProject, editingExpense }) {
    const ts = repo.timesheet();
    const date = timesheetDate ?? today;
    return `<section class="page timesheet">
      ${daySection(ts, date, today, timesheetProject, editingExpense)}
      ${projectsSection(ts)}
      ${tasksSection(ts)}
      ${clientsSection(ts)}
      ${exportSection(ts, today, timesheetExport)}
      ${businessSection(ts)}
    </section>`;
  },
};
