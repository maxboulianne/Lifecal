// Page « Mes heures » : noter les heures de la journée par projet, voir les
// totaux, gérer projets et clients, exporter une période en Excel.

import { addDays, parseISODate, startOfWeek, toISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { fmt, t } from "../../i18n/index.js";
import {
  activeProjects, dayEntries, dayTotal, getClient, getProject, periodSummary, previousWorkday, weekTotal,
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

function entryRow(ts, e) {
  const p = getProject(ts, e.projectId);
  const client = getClient(ts, p?.clientId);
  return `<li class="ts-entry">
    <div class="ts-entry-project"><strong>${esc(p?.number || "")}</strong> ${esc(p?.name ?? "?")}
      ${client ? `<span class="hint">${esc(client.name)}</span>` : ""}</div>
    <input class="ts-hours" data-action="ts-hours" data-id="${esc(e.id)}" value="${esc(fmt.decimal(e.hours))}" inputmode="decimal"
      aria-label="${esc(t("ts.hours"))} · ${esc(p?.number ?? "")}" autocomplete="off">
    <input class="ts-note" data-action="ts-note" data-id="${esc(e.id)}" value="${esc(e.note)}" placeholder="${esc(t("ts.notePlaceholder"))}"
      aria-label="${esc(t("ts.note"))}" autocomplete="off">
    <button type="button" class="check-remove" data-action="ts-remove" data-id="${esc(e.id)}" aria-label="${esc(t("ts.remove"))}">×</button>
  </li>`;
}

function daySection(ts, date, today, selected) {
  const entries = dayEntries(ts, date);
  const projects = activeProjects(ts);
  const chosen = projects.some((p) => p.id === selected) ? selected : projects[0]?.id;
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
    ${projects.length ? `<form class="ts-add" data-role="ts-add" data-date="${date}">
        <p class="hint">${t("ts.pickProject")}</p>
        <div class="ts-projects">${projects.map((p) => `<label class="ts-project-chip">
          <input type="radio" name="projectId" value="${esc(p.id)}" ${p.id === chosen ? "checked" : ""}>
          <span><strong>${esc(p.number)}</strong> ${esc(p.name)}</span></label>`).join("")}</div>
        <div class="ts-add-row">
          <input name="hours" class="ts-hours" inputmode="decimal" placeholder="${esc(t("ts.hoursPlaceholder"))}" aria-label="${esc(t("ts.hours"))}" autocomplete="off">
          ${QUICK_STEPS.map((s) => `<button type="button" class="btn soft ts-step" data-action="ts-bump" data-step="${s}">+${s === 0.25 ? "¼" : s === 0.5 ? "½" : "1"}</button>`).join("")}
        </div>
        <input name="note" class="ts-note" placeholder="${esc(t("ts.notePlaceholder"))}" aria-label="${esc(t("ts.note"))}" autocomplete="off">
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

function projectsSection(ts) {
  const list = [...ts.projects].sort((a, b) => Number(a.archived) - Number(b.archived) || a.number.localeCompare(b.number, undefined, { numeric: true }));
  return foldSection("ts-projects", {
    title: esc(t("ts.projects")),
    extra: String(ts.projects.filter((p) => !p.archived).length),
    open: isFoldOpen("ts-projects", ts.projects.length === 0),
    body: `${list.length ? `<ul class="ts-project-list">${list.map((p) => `<li class="${p.archived ? "is-archived" : ""}">
        <input data-action="ts-project-field" data-id="${esc(p.id)}" data-field="number" value="${esc(p.number)}" aria-label="${esc(t("ts.number"))}" class="ts-number">
        <input data-action="ts-project-field" data-id="${esc(p.id)}" data-field="name" value="${esc(p.name)}" aria-label="${esc(t("ts.projectName"))}" class="ts-name">
        <select data-action="ts-project-field" data-id="${esc(p.id)}" data-field="clientId" aria-label="${esc(t("ts.client"))}">${clientOptions(ts, p.clientId)}</select>
        <label class="ts-rate"><input data-action="ts-project-field" data-id="${esc(p.id)}" data-field="rate" value="${p.rate != null ? esc(fmt.decimal(p.rate)) : ""}" inputmode="decimal" aria-label="${esc(t("ts.rate"))}"> $/h</label>
        <button type="button" class="btn link" data-action="ts-archive" data-id="${esc(p.id)}">${t(p.archived ? "ts.unarchive" : "ts.archive")}</button>
      </li>`).join("")}</ul>` : ""}
      <form class="form ts-new" data-role="ts-new-project">
        <h3>${t("ts.newProject")}</h3>
        <div class="row">
          <label>${t("ts.number")} <input name="number" placeholder="CA15713" autocomplete="off"></label>
          <label>${t("ts.rate")} ($/h) <input name="rate" inputmode="decimal" placeholder="68" autocomplete="off"></label>
        </div>
        <label>${t("ts.projectName")} <input name="name" placeholder="${esc(t("ts.projectNamePlaceholder"))}" autocomplete="off"></label>
        <label>${t("ts.client")} <select name="clientId">${clientOptions(ts, ts.clients[0]?.id ?? "")}</select></label>
        <p class="form-errors" data-role="errors" role="alert"></p>
        <div class="actions"><button type="submit" class="btn primary">${t("ts.addProject")}</button></div>
      </form>`,
  });
}

function clientsSection(ts) {
  return foldSection("ts-clients", {
    title: esc(t("ts.clients")),
    extra: String(ts.clients.length),
    open: isFoldOpen("ts-clients", ts.clients.length === 0),
    body: `${ts.clients.length ? `<ul class="ts-client-list">${ts.clients.map((c) => `<li>
        <strong>${esc(c.name)}</strong>
        <span class="hint">${esc([c.contact, c.email].filter(Boolean).join(" · "))}</span>
        <label class="switch"><input type="checkbox" data-action="ts-client-tax" data-id="${esc(c.id)}" data-tax="tps" ${c.tps ? "checked" : ""}><span>TPS 5 %</span></label>
        <label class="switch"><input type="checkbox" data-action="ts-client-tax" data-id="${esc(c.id)}" data-tax="tvq" ${c.tvq ? "checked" : ""}><span>TVQ 9,975 %</span></label>
      </li>`).join("")}</ul>` : ""}
      <form class="form ts-new" data-role="ts-new-client">
        <h3>${t("ts.newClient")}</h3>
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
      </form>`,
  });
}

function exportSection(ts, today, exp) {
  const { from, to } = rangeDates(exp.range, today, exp);
  const s = periodSummary(ts, from, to, exp.clientId || null);
  return foldSection("ts-export", {
    title: esc(t("ts.export")),
    open: isFoldOpen("ts-export", false),
    body: `<div class="segmented wrap ts-ranges">${EXPORT_RANGES.map((r) => `<button type="button" data-action="ts-range" data-range="${r}"
        class="${exp.range === r ? "active" : ""}" aria-pressed="${exp.range === r}">${t(`ts.range.${r}`)}</button>`).join("")}</div>
      <div class="row ts-export-row">
        <label>${t("ts.from")} <input type="date" data-action="ts-export-date" data-field="from" value="${from}" ${exp.range === "custom" ? "" : "disabled"}></label>
        <label>${t("ts.to")} <input type="date" data-action="ts-export-date" data-field="to" value="${to}" ${exp.range === "custom" ? "" : "disabled"}></label>
      </div>
      <label class="ts-export-client">${t("ts.client")}
        <select data-action="ts-export-client"><option value="">${esc(t("ts.allClients"))}</option>${clientOptions(ts, exp.clientId, { none: false })}</select></label>
      ${s.projects.length ? `<table class="ts-summary">
          <thead><tr><th>${t("ts.project")}</th><th>${t("ts.hours")}</th><th>${t("ts.amount")}</th></tr></thead>
          <tbody>${s.projects.map((r) => `<tr><td><strong>${esc(r.project?.number ?? "")}</strong> ${esc(r.project?.name ?? "")}</td>
            <td>${esc(h(r.hours))}</td><td>${r.amount != null ? esc(fmt.money(r.amount)) : "—"}</td></tr>`).join("")}</tbody>
          <tfoot><tr><th>${t("ts.total")}</th><th>${esc(h(s.hours))}</th><th>${esc(fmt.money(s.amount))}</th></tr></tfoot>
        </table>
        <button type="button" class="btn primary" data-action="ts-export" data-from="${from}" data-to="${to}">📊 ${t("ts.exportExcel")}</button>`
      : `<p class="hint">${t("ts.nothingToExport")}</p>`}`,
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
    </section>`;
  },
};
