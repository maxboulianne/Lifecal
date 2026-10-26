// Page « Mes heures » : noter les heures de la journée par projet, voir les
// totaux, gérer projets et clients, exporter une période en Excel.

import { addDays, parseISODate, startOfWeek, toISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { fmt, t } from "../../i18n/index.js";
import {
  activeProjects, dayEntries, dayTotal, getClient, getProject, knownTasks, lastTask, periodSummary, previousWorkday, rateFor, weekTotal,
} from "../../timesheet/timesheet.js";
import { foldSection, isFoldOpen } from "../components/fold.js";
import { CHEVRON_LEFT, CHEVRON_RIGHT } from "../components/icons.js";

export const QUICK_STEPS = [0.25, 0.5, 1];
export const EXPORT_RANGES = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "custom"];

const h = (n) => `${fmt.decimal(n)} h`;

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
const rateValue = (n) => (n != null ? esc(fmt.decimal(n)) : "");
const step = (n, text) => `<p class="ts-step"><span class="ts-step-n" aria-hidden="true">${n}</span> ${text}</p>`;

function entryRow(ts, e) {
  const p = getProject(ts, e.projectId);
  const client = getClient(ts, p?.clientId);
  return `<li class="ts-entry ${e.overtime ? "is-overtime" : ""}">
    <div class="ts-entry-project"><strong>${esc(p?.number || "")}</strong> ${esc(p?.name ?? "?")}
      ${client ? `<span class="hint">${esc(client.name)}</span>` : ""}</div>
    <label class="ts-entry-hours"><span class="hint">${t("ts.hours")}</span>
      <input class="ts-hours" data-action="ts-hours" data-id="${esc(e.id)}" value="${esc(fmt.decimal(e.hours))}" inputmode="decimal" autocomplete="off"></label>
    <button type="button" class="check-remove" data-action="ts-remove" data-id="${esc(e.id)}" aria-label="${esc(t("ts.remove"))}">×</button>
    <div class="ts-entry-task">
      <input data-action="ts-entry-field" data-field="taskCode" data-id="${esc(e.id)}" value="${esc(e.taskCode)}" list="ts-task-codes"
        placeholder="${esc(t("ts.taskCode"))}" aria-label="${esc(t("ts.taskCode"))}" autocomplete="off">
      <input data-action="ts-entry-field" data-field="task" data-id="${esc(e.id)}" value="${esc(e.task)}"
        placeholder="${esc(t("ts.taskDesc"))}" aria-label="${esc(t("ts.taskDesc"))}" autocomplete="off">
    </div>
    <label class="ts-ot-toggle"><input type="checkbox" data-action="ts-entry-ot" data-id="${esc(e.id)}" ${e.overtime ? "checked" : ""}> ${t("ts.overtime")}</label>
    <input class="ts-note" data-action="ts-entry-field" data-field="note" data-id="${esc(e.id)}" value="${esc(e.note)}" placeholder="${esc(t("ts.notePlaceholder"))}"
      aria-label="${esc(t("ts.note"))}" autocomplete="off">
  </li>`;
}

function daySection(ts, date, today, selected) {
  const entries = dayEntries(ts, date);
  const projects = activeProjects(ts);
  const chosen = projects.some((p) => p.id === selected) ? selected : projects[0]?.id;
  const task = chosen ? lastTask(ts, chosen) : { code: "", task: "" };
  const prev = entries.length ? null : previousWorkday(ts, date);
  const title = date === today ? t("nav.today") : fmt.longDate(parseISODate(date));
  return `<section class="card ts-day">
    <header class="ts-day-head">
      <button type="button" class="nav-arrow" data-action="ts-day" data-date="${toISODate(addDays(parseISODate(date), -1))}"
        aria-label="${esc(t("nav.prev.day"))}" title="${esc(t("nav.prev.day"))}">${CHEVRON_LEFT}</button>
      <h2>${esc(title)}</h2>
      <button type="button" class="nav-arrow" data-action="ts-day" data-date="${toISODate(addDays(parseISODate(date), 1))}"
        aria-label="${esc(t("nav.next.day"))}" title="${esc(t("nav.next.day"))}">${CHEVRON_RIGHT}</button>
      ${date !== today ? `<button type="button" class="btn soft" data-action="ts-day" data-date="${today}">${t("nav.today")}</button>` : ""}
    </header>
    <div class="ts-totals">
      <span class="ts-total">${esc(h(dayTotal(ts, date)))}</span>
      <span class="hint">${esc(t("ts.week", { hours: h(weekTotal(ts, date)) }))}</span>
    </div>
    ${entries.length ? `<ul class="ts-entries">${entries.map((e) => entryRow(ts, e)).join("")}</ul>` : ""}
    ${prev ? `<button type="button" class="btn soft" data-action="ts-copy" data-from="${prev}" data-date="${date}">📋 ${esc(t("ts.copyDay", { date: fmt.longDate(parseISODate(prev)) }))}</button>` : ""}
    <datalist id="ts-task-codes">${knownTasks(ts).filter((x) => x.code).map((x) => `<option value="${esc(x.code)}" data-task="${esc(x.task)}">${esc(x.task)}</option>`).join("")}</datalist>
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
        <div class="ts-task-row">
          <label>${t("ts.taskCode")} <input name="taskCode" list="ts-task-codes" value="${esc(task.code)}" placeholder="${esc(t("ts.example", { value: "QA-01" }))}" autocomplete="off"></label>
          <label>${t("ts.taskDesc")} <input name="task" value="${esc(task.task)}" placeholder="${esc(t("ts.taskDescPlaceholder"))}" autocomplete="off"></label>
        </div>
        <label class="ts-note-label">${t("ts.note")} <input name="note" class="ts-note" placeholder="${esc(t("ts.notePlaceholder"))}" autocomplete="off"></label>
        ${step(3, t("ts.step3"))}
        <p class="form-errors" data-role="errors" role="alert"></p>
        <button type="submit" class="btn primary">${t("ts.add")}</button>
      </form>`
      : `<p class="empty-msg small">${t("ts.noProjects")}</p>`}
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
  return `<li class="ts-card ${p.archived ? "is-archived" : ""}">
    <div class="row">
      ${field("number", t("ts.number"), `<input ${attrs("number")} value="${esc(p.number)}">`)}
      ${field("name", t("ts.projectName"), `<input ${attrs("name")} value="${esc(p.name)}">`)}
    </div>
    ${field("clientId", t("ts.client"), `<select ${attrs("clientId")}>${clientOptions(ts, p.clientId)}</select>`)}
    <div class="row">
      ${field("rate", `${t("ts.rateRegular")} ($/h)`, `<input ${attrs("rate")} value="${rateValue(p.rate)}" inputmode="decimal">`)}
      ${field("overtimeRate", `${t("ts.rateOvertime")} ($/h)`, `<input ${attrs("overtimeRate")} value="${rateValue(p.overtimeRate)}" inputmode="decimal"
        placeholder="${p.rate != null ? esc(fmt.decimal(rateFor(p, true))) : ""}">`)}
    </div>
    <div class="ts-card-actions">
      ${p.archived ? "" : `<button type="button" class="btn soft" data-action="ts-pick" data-id="${esc(p.id)}">⏱️ ${t("ts.logHours")}</button>`}
      <button type="button" class="btn link" data-action="ts-archive" data-id="${esc(p.id)}">${t(p.archived ? "ts.unarchive" : "ts.archive")}</button>
      <button type="button" class="btn link danger" data-action="ts-delete-project" data-id="${esc(p.id)}">🗑 ${t("ts.delete")}</button>
    </div>
  </li>`;
}

function projectsSection(ts) {
  const list = [...ts.projects].sort((a, b) => Number(a.archived) - Number(b.archived) || a.number.localeCompare(b.number, undefined, { numeric: true }));
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
          <label>${t("ts.rateRegular")} ($/h) <input name="rate" inputmode="decimal" placeholder="${esc(t("ts.example", { value: "68" }))}" autocomplete="off"></label>
          <label>${t("ts.rateOvertime")} ($/h) <input name="overtimeRate" inputmode="decimal" placeholder="${esc(t("ts.example", { value: "102" }))}" autocomplete="off"></label>
        </div>
        <p class="hint">${t("ts.overtimeHint")}</p>
        <p class="form-errors" data-role="errors" role="alert"></p>
        <div class="actions"><button type="submit" class="btn primary">${t("ts.addProject")}</button></div>
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

function businessSection(ts) {
  const b = ts.business;
  const attrs = (f) => `data-action="ts-business-field" data-field="${f}" autocomplete="off"`;
  const field = (f, label, extra = "") => `<label>${label} <input ${attrs(f)} value="${esc(b[f])}" ${extra}></label>`;
  return foldSection("ts-business", {
    title: esc(t("ts.business")),
    open: isFoldOpen("ts-business", false),
    body: `<p class="hint">${t("ts.businessHint")}</p>
      <div class="form ts-card">
        ${field("name", t("ts.businessName"))}
        ${field("contact", t("ts.yourName"))}
        <label>${t("ts.address")} <textarea ${attrs("address")} rows="3">${esc(b.address)}</textarea></label>
        <div class="row">${field("phone", t("ts.phone"), 'type="tel"')}${field("email", t("ts.email"), 'type="email"')}</div>
        <div class="row">${field("tpsNumber", t("ts.tpsNumber"))}${field("tvqNumber", t("ts.tvqNumber"))}</div>
        <div class="row">${field("terms", t("ts.terms"), 'inputmode="numeric"')}${field("nextInvoice", t("ts.nextInvoice"), `placeholder="${esc(t("ts.example", { value: "2026-115" }))}"`)}</div>
      </div>`,
  });
}

function invoiceBlock(ts, today, clientId, from, to, hasHours) {
  const client = getClient(ts, clientId);
  if (!client) return `<div class="ts-invoice"><h3>🧾 ${t("ts.invoice")}</h3><p class="ts-empty-export">${t("ts.invoicePickClient")}</p></div>`;
  return `<div class="ts-invoice form" data-role="ts-invoice" data-client="${esc(client.id)}" data-from="${from}" data-to="${to}">
    <h3>🧾 ${t("ts.invoice")} — ${esc(client.name)}</h3>
    <div class="row">
      <label>${t("ts.invoiceNumber")} <input name="number" value="${esc(ts.business.nextInvoice)}" placeholder="${esc(t("ts.example", { value: "2026-115" }))}" autocomplete="off"></label>
      <label>${t("ts.invoiceDate")} <input name="date" type="date" value="${today}"></label>
    </div>
    <label>${t("ts.po")} <input name="po" value="${esc(client.po)}" autocomplete="off"></label>
    ${ts.business.name ? "" : `<p class="hint">⚠️ ${t("ts.businessMissing")}</p>`}
    ${hasHours ? `<button type="button" class="btn primary" data-action="ts-invoice">🧾 ${t("ts.createInvoice")}</button>` : ""}
  </div>`;
}

function exportSection(ts, today, exp) {
  const { from, to } = rangeDates(exp.range, today, exp);
  // Un seul client : il est choisi d'office (la facture est pour un client).
  const clientId = exp.clientId || (ts.clients.length === 1 ? ts.clients[0].id : "");
  const s = periodSummary(ts, from, to, clientId || null);
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
      ${s.projects.length ? `<table class="ts-summary">
          <thead><tr><th>${t("ts.project")}</th><th>${t("ts.hours")}</th><th>${t("ts.rate")}</th><th>${t("ts.amount")}</th></tr></thead>
          <tbody>${s.projects.map((r) => `<tr><td><strong>${esc(r.project?.number ?? "")}</strong> ${esc(r.project?.name ?? "")}
              ${r.overtime ? `<span class="ts-badge">${t("ts.overtime")}</span>` : ""}</td>
            <td>${esc(h(r.hours))}</td><td>${r.rate != null ? esc(fmt.money(r.rate)) : "—"}</td><td>${esc(money(r.amount))}</td></tr>`).join("")}</tbody>
          <tfoot><tr><th>${t("ts.total")}</th><th>${esc(h(s.hours))}</th><th></th><th>${esc(fmt.money(s.amount))}</th></tr></tfoot>
        </table>
        <button type="button" class="btn soft" data-action="ts-export" data-from="${from}" data-to="${to}" data-client="${esc(clientId)}">📊 ${t("ts.exportExcel")}</button>`
      : `<p class="ts-empty-export">${t("ts.nothingToExport")}</p>`}
      ${invoiceBlock(ts, today, clientId, from, to, s.projects.length > 0)}`,
  });
}

export const timesheetPage = {
  id: "timesheet",

  title: () => t("nav.timesheet"),

  render({ repo, today, timesheetDate, timesheetExport, timesheetProject }) {
    const ts = repo.timesheet();
    const date = timesheetDate ?? today;
    return `<section class="page timesheet">
      ${daySection(ts, date, today, timesheetProject)}
      ${projectsSection(ts)}
      ${clientsSection(ts)}
      ${exportSection(ts, today, timesheetExport)}
      ${businessSection(ts)}
    </section>`;
  },
};
