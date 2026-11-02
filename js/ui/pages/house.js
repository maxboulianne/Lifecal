// Page « Maison » : entretiens à l'intérieur et à l'extérieur (onglets séparés), triés par
// urgence, et listes à cocher de saison. Couleurs des documents Maxxam (marine et orange).

import { parseISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { ZONES, listState, zoneOverview } from "../../house/house.js";
import { fmt, t } from "../../i18n/index.js";

const GROUPS = ["overdue", "soon", "later", "unknown"];
const ZONE_ICONS = { inside: "🛋️", outside: "🌳" };
const thisYear = (today) => today.slice(0, 4);
const dayMonth = (monthDay) => fmt.dayMonth(parseISODate(`2026-${monthDay}`));

export function scheduleText(s) {
  if (s.kind === "dates") return t("house.yearlyOn", { dates: fmt.list(s.dates.map(dayMonth)) });
  if (s.months === 1) return t("house.every.month");
  if (s.months === 12) return t("house.every.year");
  if (s.months % 12 === 0) return t("house.every.years", { n: s.months / 12 });
  return t("house.every.months", { n: s.months });
}

function taskForm(task, zone, today) {
  const s = task?.schedule ?? { kind: "every", months: 12 };
  const dateOf = (i) => (s.kind === "dates" && s.dates[i] ? `${thisYear(today)}-${s.dates[i]}` : "");
  return `<form class="form house-form" data-role="house-task" data-id="${esc(task?.id ?? "")}">
    <label>${t("house.form.title")} <input name="title" value="${esc(task?.title ?? "")}" required autocomplete="off"></label>
    <div class="row">
      <label>${t("house.form.zone")} <select name="zone">${ZONES.map((z) => `<option value="${z}" ${(task?.zone ?? zone) === z ? "selected" : ""}>${ZONE_ICONS[z]} ${t(`house.tab.${z}`)}</option>`).join("")}</select></label>
      <label>${t("house.form.kind")} <select name="kind">
        <option value="every" ${s.kind === "every" ? "selected" : ""}>${t("house.kind.every")}</option>
        <option value="dates" ${s.kind === "dates" ? "selected" : ""}>${t("house.kind.dates")}</option></select></label>
    </div>
    <div class="row">
      <label>${t("house.form.months")} <input name="months" type="number" min="1" max="240" inputmode="numeric" value="${s.kind === "every" ? s.months : 12}"></label>
      <label>${t("house.form.date1")} <input name="date1" type="date" value="${dateOf(0)}"></label>
      <label>${t("house.form.date2")} <input name="date2" type="date" value="${dateOf(1)}"></label>
    </div>
    <p class="hint">${t("house.form.kindHint")}</p>
    <label>${t("house.form.last")} <input name="lastDone" type="date" value="${esc(task?.lastDone ?? "")}" max="${today}"></label>
    <label>${t("house.form.note")} <textarea name="note" rows="2">${esc(task?.note ?? "")}</textarea></label>
    ${task?.history.length ? `<div class="house-history"><strong>${t("house.history", { count: task.history.length })}</strong>
      <ul>${[...task.history].reverse().map((d) => `<li>✓ ${esc(fmt.date(parseISODate(d)))}</li>`).join("")}</ul></div>` : ""}
    <div class="actions start">
      <button type="submit" class="btn primary">${t("house.save")}</button>
      <button type="button" class="btn ghost" data-action="house-cancel">${t("form.cancel")}</button>
      ${task?.history.length ? `<button type="button" class="btn soft" data-action="house-undo" data-id="${esc(task.id)}">↶ ${t("house.undo")}</button>` : ""}
      ${task ? `<button type="button" class="btn danger" data-action="house-remove" data-id="${esc(task.id)}">${t("house.remove")}</button>` : ""}
    </div>
  </form>`;
}

function taskCard({ task, next, days, status }, ui, today) {
  if (ui.editing === task.id) return `<li class="house-task is-editing" id="house-task-${esc(task.id)}">${taskForm(task, task.zone, today)}</li>`;
  const due = next ? `<span class="house-due">${t("house.due", { date: fmt.dayMonth(parseISODate(next)) })} · ${esc(fmt.inDays(days))}</span>` : "";
  return `<li class="house-task is-${status} ${ui.focus === task.id ? "is-focus" : ""}" id="house-task-${esc(task.id)}">
    <div class="house-task-main">
      <strong>${esc(task.title)}</strong>
      <span class="hint">↻ ${esc(scheduleText(task.schedule))} · ${task.lastDone ? esc(t("house.last", { date: fmt.date(parseISODate(task.lastDone)) })) : t("house.never")}</span>
      ${due}
      ${task.note ? `<span class="house-note">${esc(task.note)}</span>` : ""}
      ${status === "unknown" ? `<label class="house-last">${t("house.form.last")}
        <input type="date" data-action="house-last" data-id="${esc(task.id)}" max="${today}"></label>` : ""}
    </div>
    <div class="house-task-actions">
      <button type="button" class="btn primary" data-action="house-done" data-id="${esc(task.id)}">✓ ${t("house.done")}</button>
      ${task.list ? `<button type="button" class="btn soft" data-action="house-open-list" data-list="${esc(task.list)}">☑ ${t("house.procedure")}</button>` : ""}
      <button type="button" class="btn link" data-action="house-edit" data-id="${esc(task.id)}">${t("house.edit")}</button>
    </div>
  </li>`;
}

function listBlock(house, list, ui, today) {
  const done = listState(house, list.id, today);
  const count = list.entries.filter((e) => done[e.id]).length;
  return `<details class="house-list" id="house-list-${esc(list.id)}" ${ui.openList === list.id ? "open" : ""}>
    <summary><span>${esc(list.title)}</span><span class="house-count ${count === list.entries.length && count ? "is-complete" : ""}">${count}/${list.entries.length}</span></summary>
    <ul class="checklist">${list.entries.map((e) => `<li>
      <label><input type="checkbox" data-action="house-check" data-list="${esc(list.id)}" data-entry="${esc(e.id)}" ${done[e.id] ? "checked" : ""}>
        <span>${esc(e.text)}</span></label>
      <button type="button" class="check-remove" data-action="house-entry-remove" data-list="${esc(list.id)}" data-entry="${esc(e.id)}" aria-label="${esc(t("house.remove"))}">×</button>
    </li>`).join("")}</ul>
    <form class="house-entry-add" data-role="house-entry" data-list="${esc(list.id)}">
      <input name="text" placeholder="${esc(t("house.listAddPlaceholder"))}" autocomplete="off">
      <button type="submit" class="btn soft">${t("house.listAdd")}</button>
    </form>
    <div class="actions start">
      <button type="button" class="btn link" data-action="house-list-reset" data-list="${esc(list.id)}">${t("house.listReset")}</button>
    </div>
  </details>`;
}

export const housePage = {
  id: "house",
  title: () => t("nav.house"),
  render({ repo, today, houseUi = {} }) {
    const house = repo.house();
    const zone = ZONES.includes(houseUi.tab) ? houseUi.tab : "inside";
    const ui = { ...houseUi, tab: zone };
    const counts = Object.fromEntries(ZONES.map((z) => [z, zoneOverview(house, z, today).overdue.length]));
    const groups = zoneOverview(house, zone, today);
    const soon = groups.soon.length;
    const lists = house.lists.filter((l) => l.zone === zone);
    return `<div class="page house">
      <nav class="segmented house-tabs" aria-label="${esc(t("nav.house"))}">${ZONES.map((z) => `<button type="button" data-action="house-tab" data-tab="${z}"
        class="${z === zone ? "active" : ""}" aria-pressed="${z === zone}">${ZONE_ICONS[z]} ${t(`house.tab.${z}`)}${counts[z] ? ` <span class="house-badge">${counts[z]}</span>` : ""}</button>`).join("")}</nav>
      <section class="house-summary">
        <div><span class="house-summary-value">${groups.overdue.length}</span><span>${t("house.overdueLabel")}</span></div>
        <div><span class="house-summary-value">${soon}</span><span>${t("house.soonLabel")}</span></div>
        <p>${groups.overdue.length || soon ? t("house.calendarHint") : t("house.allGood")}</p>
      </section>
      ${GROUPS.filter((g) => groups[g].length).map((g) => `<section class="house-group is-${g}">
        <h2>${t(`house.group.${g}`)}</h2>
        ${g === "unknown" ? `<p class="hint">${t("house.unknownHint")}</p>` : ""}
        <ul class="house-tasks">${groups[g].map((x) => taskCard(x, ui, today)).join("")}</ul>
      </section>`).join("")}
      <details class="house-new" ${ui.editing === "new" ? "open" : ""}>
        <summary data-action="house-new">＋ ${t("house.add")}</summary>
        ${ui.editing === "new" ? taskForm(null, zone, today) : ""}
      </details>
      ${lists.length ? `<section class="house-lists"><h2>☑ ${t("house.lists")}</h2>
        <p class="hint">${t("house.listYearHint")}</p>
        ${lists.map((l) => listBlock(house, l, ui, today)).join("")}</section>` : ""}
    </div>`;
  },
};

