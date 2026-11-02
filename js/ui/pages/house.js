// Page « Maison » : entretiens à l'intérieur et à l'extérieur (onglets séparés), triés par
// urgence, et listes à cocher de saison. Couleurs des documents Maxxam (marine et orange).

import { parseISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { ZONES, listState, supplyOverview, taskSupplies, zoneOverview } from "../../house/house.js";
import { fmt, t } from "../../i18n/index.js";

const GROUPS = ["overdue", "soon", "later", "unknown"];
const ZONE_ICONS = { inside: "🛋️", outside: "🌳" };
const TABS = [...ZONES, "supplies"];
const TAB_ICONS = { ...ZONE_ICONS, supplies: "🧰" };
const num = (n) => (n === null || n === undefined ? "" : fmt.decimal(n));
const qtyText = (s) => [num(s.qty), s.unit].filter(Boolean).join(" ");
// Photo d'une fourniture (dans le stockage des fichiers) : chargée après l'affichage
const photo = (id, cls = "house-photo") => `<img class="${cls}" data-house-photo="${esc(id)}" alt="">`;
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

function taskCard({ task, next, days, status }, ui, today, house) {
  const supplies = taskSupplies(house, task.id);
  if (ui.editing === task.id) return `<li class="house-task is-editing" id="house-task-${esc(task.id)}">${taskForm(task, task.zone, today)}</li>`;
  const due = next ? `<span class="house-due">${t("house.due", { date: fmt.dayMonth(parseISODate(next)) })} · ${esc(fmt.inDays(days))}</span>` : "";
  return `<li class="house-task is-${status} ${ui.focus === task.id ? "is-focus" : ""}" id="house-task-${esc(task.id)}">
    <div class="house-task-main">
      <strong>${esc(task.title)}</strong>
      <span class="hint">↻ ${esc(scheduleText(task.schedule))} · ${task.lastDone ? esc(t("house.last", { date: fmt.date(parseISODate(task.lastDone)) })) : t("house.never")}</span>
      ${due}
      ${task.note ? `<span class="house-note">${esc(task.note)}</span>` : ""}
      ${supplies.length ? `<div class="house-needs">🧰 ${t("house.needs")} ${supplies.map((s) => `<button type="button" class="house-need ${s.stock !== null && s.stock < (s.qty ?? 1) ? "is-short" : ""}" data-action="house-supply-open" data-id="${esc(s.id)}">
        ${s.photos[0] ? photo(s.photos[0], "house-thumb") : ""}<span>${esc([num(s.qty), s.unit && s.qty !== null ? "×" : "", s.name].filter(Boolean).join(" "))}${s.model ? ` · ${esc(s.model)}` : ""}${s.stock !== null ? ` · ${esc(t("house.stockShort", { n: num(s.stock) }))}` : ""}</span></button>`).join("")}</div>` : ""}
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
    <div class="actions start">
      <button type="button" class="btn primary" data-action="house-steps" data-list="${esc(list.id)}" data-index="${Math.max(0, list.entries.findIndex((e) => !done[e.id]))}">▶ ${t("house.steps.start")}</button>
    </div>
    <ul class="checklist">${list.entries.map((e, i) => `<li>
      <label><input type="checkbox" data-action="house-check" data-list="${esc(list.id)}" data-entry="${esc(e.id)}" ${done[e.id] ? "checked" : ""}>
        <span>${esc(e.text)}</span></label>
      <button type="button" class="house-step-open" data-action="house-steps" data-list="${esc(list.id)}" data-index="${i}" aria-label="${esc(t("house.steps.open"))}">
        ${e.figure ? "🖼️" : ""}${e.media.length ? `📷${e.media.length}` : ""}${e.note ? "📝" : ""}<span>›</span></button>
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

function supplyForm(s, house, today) {
  const inTasks = new Set(s?.tasks ?? []);
  return `<form class="form house-form" data-role="house-supply" data-id="${esc(s?.id ?? "")}">
    <label>${t("house.supply.name")} <input name="name" value="${esc(s?.name ?? "")}" required autocomplete="off"></label>
    <label>${t("house.supply.description")} <textarea name="description" rows="2">${esc(s?.description ?? "")}</textarea></label>
    <div class="row">
      <label>${t("house.supply.model")} <input name="model" value="${esc(s?.model ?? "")}" autocomplete="off" placeholder="${esc(t("house.supply.modelHint"))}"></label>
      <label>${t("house.supply.qty")} <input name="qty" inputmode="decimal" value="${esc(num(s?.qty))}" autocomplete="off"></label>
      <label>${t("house.supply.unit")} <input name="unit" value="${esc(s?.unit ?? "")}" autocomplete="off" placeholder="${esc(t("house.supply.unitHint"))}"></label>
    </div>
    <div class="row">
      <label>${t("house.supply.store")} <input name="store" value="${esc(s?.store ?? "")}" autocomplete="off"></label>
      <label>${t("house.supply.url")} <input name="url" type="url" value="${esc(s?.url ?? "")}" autocomplete="off" placeholder="https://"></label>
      <label>${t("house.supply.stock")} <input name="stock" inputmode="decimal" value="${esc(num(s?.stock))}" autocomplete="off" placeholder="${esc(t("house.supply.stockHint"))}"></label>
    </div>
    <details class="house-links"><summary>${t("house.supply.tasks", { count: inTasks.size })}</summary>
      ${ZONES.map((z) => `<p class="hint">${ZONE_ICONS[z]} ${t(`house.tab.${z}`)}</p>${house.tasks.filter((x) => x.zone === z).map((x) => `<label class="house-link">
        <input type="checkbox" name="tasks" value="${esc(x.id)}" ${inTasks.has(x.id) ? "checked" : ""}> <span>${esc(x.title)}</span></label>`).join("")}`).join("")}
    </details>
    <div class="actions start">
      <button type="submit" class="btn primary">${t("house.save")}</button>
      <button type="button" class="btn ghost" data-action="house-cancel">${t("form.cancel")}</button>
      ${s ? `<button type="button" class="btn danger" data-action="house-supply-remove" data-id="${esc(s.id)}">${t("house.remove")}</button>` : ""}
    </div>
  </form>`;
}

function purchaseForm(s, today) {
  return `<form class="form house-purchase" data-role="house-purchase" data-id="${esc(s.id)}">
    <div class="row">
      <label>${t("house.purchase.date")} <input name="date" type="date" value="${today}" max="${today}" required></label>
      <label>${t("house.supply.qty")} <input name="qty" inputmode="decimal" value="${esc(num(s.qty ?? 1))}" autocomplete="off"></label>
      <label>${t("house.purchase.price")} <input name="price" inputmode="decimal" autocomplete="off" placeholder="0,00"></label>
      <label>${t("house.supply.store")} <input name="store" value="${esc(s.store)}" autocomplete="off"></label>
    </div>
    <div class="actions start">
      <button type="submit" class="btn primary">${t("house.purchase.save")}</button>
      <button type="button" class="btn ghost" data-action="house-cancel">${t("form.cancel")}</button>
    </div>
  </form>`;
}

function supplyCard({ supply: s, tasks, next, status, last }, ui, today, house) {
  if (ui.editing === s.id) return `<li class="house-supply is-editing" id="house-supply-${esc(s.id)}">${supplyForm(s, house, today)}</li>`;
  const purchaseLine = (p) => [fmt.date(parseISODate(p.date)), p.qty !== null ? `${num(p.qty)} ${s.unit}`.trim() : "", p.price !== null ? fmt.money(p.price) : "", p.store].filter(Boolean).join(" · ");
  return `<li class="house-supply is-${status} ${ui.focus === s.id ? "is-focus" : ""}" id="house-supply-${esc(s.id)}">
    <div class="house-supply-top">
      <div class="house-photos">
        ${s.photos.map((id) => `<span class="house-photo-wrap">${photo(id)}<button type="button" class="house-photo-remove" data-action="house-photo-remove" data-id="${esc(s.id)}" data-photo="${esc(id)}" aria-label="${esc(t("house.remove"))}">×</button></span>`).join("")}
        <label class="house-photo-add" title="${esc(t("house.supply.addPhoto"))}">📷<span>${t("house.supply.addPhoto")}</span>
          <input type="file" accept="image/*" data-action="house-photo" data-id="${esc(s.id)}" hidden></label>
      </div>
      <div class="house-supply-main">
        <strong>${esc(s.name)}</strong>
        ${status !== "ok" ? `<span class="house-flag">${t(`house.supply.status.${status}`)}</span>` : ""}
        ${s.description ? `<span class="house-note">${esc(s.description)}</span>` : ""}
        <dl class="house-facts">
          ${s.model ? `<div><dt>${t("house.supply.model")}</dt><dd>${esc(s.model)}</dd></div>` : ""}
          ${qtyText(s) ? `<div><dt>${t("house.supply.qtyEach")}</dt><dd>${esc(qtyText(s))}</dd></div>` : ""}
          ${s.stock !== null ? `<div><dt>${t("house.supply.stock")}</dt><dd>${esc(num(s.stock))}</dd></div>` : ""}
          ${s.store ? `<div><dt>${t("house.supply.store")}</dt><dd>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.store)}</a>` : esc(s.store)}</dd></div>`
            : s.url ? `<div><dt>${t("house.supply.url")}</dt><dd><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(new URL(s.url).hostname)}</a></dd></div>` : ""}
          ${next ? `<div><dt>${t("house.supply.nextUse")}</dt><dd>${esc(fmt.dayMonth(parseISODate(next.next)))} · ${esc(fmt.inDays(next.days))}</dd></div>` : ""}
          ${last ? `<div><dt>${t("house.supply.lastPurchase")}</dt><dd>${esc(purchaseLine(last))}</dd></div>` : ""}
        </dl>
        ${tasks.length ? `<span class="hint">↻ ${esc(tasks.map((x) => x.title).join(" · "))}</span>` : ""}
      </div>
    </div>
    <div class="house-task-actions">
      <button type="button" class="btn primary" data-action="house-purchase-new" data-id="${esc(s.id)}">＋ ${t("house.purchase.add")}</button>
      <button type="button" class="btn soft" data-action="house-to-list" data-id="${esc(s.id)}">🛒 ${t("house.supply.toList")}</button>
      <button type="button" class="btn link" data-action="house-edit" data-id="${esc(s.id)}">${t("house.edit")}</button>
    </div>
    ${ui.purchasing === s.id ? purchaseForm(s, today) : ""}
    ${s.purchases.length ? `<details class="house-history"><summary>${t("house.purchase.history", { count: s.purchases.length })}</summary>
      <ul>${[...s.purchases].reverse().map((p) => `<li><span>🧾 ${esc(purchaseLine(p))}</span>
        <button type="button" class="check-remove" data-action="house-purchase-remove" data-id="${esc(s.id)}" data-purchase="${esc(p.id)}" aria-label="${esc(t("house.remove"))}">×</button></li>`).join("")}</ul>
    </details>` : ""}
  </li>`;
}

function suppliesTab(house, ui, today) {
  const all = supplyOverview(house, today);
  const toBuy = all.filter((x) => x.status !== "ok").length;
  return `<section class="house-summary">
      <div><span class="house-summary-value">${toBuy}</span><span>${t("house.supply.toBuyLabel")}</span></div>
      <p>${t("house.supply.hint")}</p>
    </section>
    <ul class="house-tasks house-supplies">${all.map((x) => supplyCard(x, ui, today, house)).join("")}</ul>
    <details class="house-new" ${ui.editing === "new-supply" ? "open" : ""}>
      <summary data-action="house-supply-new">＋ ${t("house.supply.add")}</summary>
      ${ui.editing === "new-supply" ? supplyForm(null, house, today) : ""}
    </details>`;
}

export const housePage = {
  id: "house",
  title: () => t("nav.house"),
  render({ repo, today, houseUi = {} }) {
    const house = repo.house();
    const tab = TABS.includes(houseUi.tab) ? houseUi.tab : "inside";
    const zone = ZONES.includes(tab) ? tab : "inside";
    const ui = { ...houseUi, tab };
    const counts = Object.fromEntries(ZONES.map((z) => [z, zoneOverview(house, z, today).overdue.length]));
    counts.supplies = supplyOverview(house, today).filter((x) => x.status === "buy").length;
    const tabs = `<nav class="segmented house-tabs" aria-label="${esc(t("nav.house"))}">${TABS.map((z) => `<button type="button" data-action="house-tab" data-tab="${z}"
        class="${z === tab ? "active" : ""}" aria-pressed="${z === tab}">${TAB_ICONS[z]} ${t(`house.tab.${z}`)}${counts[z] ? ` <span class="house-badge">${counts[z]}</span>` : ""}</button>`).join("")}</nav>`;
    if (tab === "supplies") return `<div class="page house">${tabs}${suppliesTab(house, ui, today)}</div>`;
    const groups = zoneOverview(house, zone, today);
    const soon = groups.soon.length;
    const lists = house.lists.filter((l) => l.zone === zone);
    return `<div class="page house">
      ${tabs}
      <section class="house-summary">
        <div><span class="house-summary-value">${groups.overdue.length}</span><span>${t("house.overdueLabel")}</span></div>
        <div><span class="house-summary-value">${soon}</span><span>${t("house.soonLabel")}</span></div>
        <p>${groups.overdue.length || soon ? t("house.calendarHint") : t("house.allGood")}</p>
      </section>
      ${GROUPS.filter((g) => groups[g].length).map((g) => `<section class="house-group is-${g}">
        <h2>${t(`house.group.${g}`)}</h2>
        ${g === "unknown" ? `<p class="hint">${t("house.unknownHint")}</p>` : ""}
        <ul class="house-tasks">${groups[g].map((x) => taskCard(x, ui, today, house)).join("")}</ul>
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

