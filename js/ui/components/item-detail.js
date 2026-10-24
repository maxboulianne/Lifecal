import { getModule, moduleLabel } from "../../config/modules.js";
import { addDays, parseISODate, startOfWeek, toISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { currentStreak, periodSummary } from "../../data/habit-stats.js";
import { hasCoordinates, isCancelled } from "../../data/item.js";
import { mapUrl } from "../../geo/geo.js";
import { fmt, t } from "../../i18n/index.js";
import { getProvider } from "../../sync/providers.js";
import { describeRule, streakText } from "./habit-text.js";
import { stateLabel } from "./item-chip.js";
import { entryContent } from "../../journal/journal.js";
import { MOODS } from "../../meditation/catalog.js";
import { hasFeature } from "../../config/modules.js";
import { getChecklist, progress } from "../../data/checklist.js";
import { tripDates, tripStatusText } from "./trip-text.js";
import { EVENT_MODULE, ageOn, budgetOf, eventKind, kindIcon } from "../../events/events.js";
import { diffDays } from "../../core/dates.js";

const btn = (cls, action, item, label) =>
  `<button type="button" class="btn ${cls}" data-action="${action}" data-id="${esc(item.id)}" data-date="${esc(item.date)}">${label}</button>`;

// `item` peut être une occurrence d'habitude (item.occurrence est alors défini).
export function itemDetail(item, { today }) {
  const m = getModule(item.module);
  const when = `${fmt.longDate(parseISODate(item.date))}${item.time ? ` · ${fmt.time(item.time)}` : ""}`;
  const place = item.place || hasCoordinates(item)
    ? `<p class="detail-line">📍 ${esc(item.place || t("detail.positionSaved"))}
        ${hasCoordinates(item) ? `<a href="${mapUrl(item)}" target="_blank" rel="noopener">${t("detail.viewMap")}</a>` : ""}</p>`
    : "";
  const source = item.source.provider !== "local"
    ? `<p class="detail-line hint">${t("detail.syncedWith", { provider: getProvider(item.source.provider)?.label ?? item.source.provider })}</p>`
    : "";
  const state = stateLabel(item);
  const badge = state ? `<p class="badge ${item.done ? "done" : ""}">${esc(state)}</p>` : "";

  return `<article class="detail" style="--c:${m.color}">
    <p class="detail-module">${m.icon} ${esc(moduleLabel(item.module))}</p>
    <h2 id="detail-title">${esc(item.title)}</h2>
    ${badge}
    ${item.module === "voyage" ? tripSummary(item, today) : `<p class="detail-line">🕒 ${when}</p>`}
    ${item.occurrence && item.module !== EVENT_MODULE ? habitSummary(item, today) : ""}
    ${item.module === EVENT_MODULE ? eventSummary(item, today) : ""}
    ${item.module === "meditation" ? meditationSummary(item) : ""}
    ${item.module === "journal" && !item.recurrence ? journalSummary(item) : ""}
    ${place}
    ${item.module === EVENT_MODULE ? eventLists(item)
      : hasFeature(item.module, "checklist") && !item.occurrence ? checklistSection(item) : ""}
    ${item.notes && item.module !== "journal" ? `<p class="detail-notes">${esc(item.notes)}</p>` : ""}
    ${source}
    <div class="actions stack">${item.occurrence ? (item.module === EVENT_MODULE ? eventActions(item) : habitActions(item)) : itemActions(item)}</div>
  </article>`;
}

// Voyage : ses dates (même vu depuis un jour au milieu) et le compte à rebours.
function tripSummary(item, today) {
  const trip = { ...item, date: item.span?.start ?? item.date };
  return `<p class="detail-line">🗓️ ${esc(tripDates(trip))}${item.time ? ` · ${fmt.time(item.time)}` : ""}</p>
    <p class="detail-line">⏳ ${esc(tripStatusText(trip, today))}</p>`;
}

// Fête, anniversaire ou événement : type, âge, compte à rebours, budget.
function eventSummary(item, today) {
  const kind = eventKind(item);
  const age = ageOn(item, item.date);
  const days = diffDays(today, item.date);
  const budget = budgetOf(item);
  return `<p class="detail-line">${kindIcon(item)} ${esc(t(`event.kind.${kind}`))}${age ? ` · ${esc(t(`event.age.${kind}`, { count: age }))}` : ""}</p>
    ${days >= 0 ? `<p class="detail-line">⏳ ${esc(capitalize(fmt.inDays(days)))}</p>` : ""}
    ${budget ? `<p class="detail-line">💰 ${esc(t("event.budgetLine", { amount: fmt.amount(budget) }))}</p>` : ""}`;
}

const capitalize = (s) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

// Idées cadeaux, invités, à préparer.
function eventLists(item) {
  return [
    checklistSection(item, { field: "gifts", title: t("event.gifts"), placeholder: t("event.giftsPlaceholder"), doneText: t("event.giftsDone") }),
    checklistSection(item, { field: "guests", title: t("event.guests"), placeholder: t("event.guestsPlaceholder"), doneText: t("event.guestsDone") }),
    checklistSection(item, { field: "checklist", title: t("event.prep") }),
  ].join("");
}

// Une fête qui revient chaque année : modifier, supprimer, fermer.
function eventActions(occ) {
  return [
    btn("soft", "edit-item", occ, t("detail.edit")),
    btn("danger", "delete-item", occ, t("detail.delete")),
    `<button type="button" class="btn ghost" data-action="close">${t("detail.close")}</button>`,
  ].join("");
}

function habitSummary(occ, today) {
  const habit = { ...occ, date: occ.occurrence.start }; // l'habitude d'origine
  const streak = currentStreak(habit, today);
  const weekStart = toISODate(startOfWeek(parseISODate(occ.date)));
  const week = periodSummary(habit, weekStart, toISODate(addDays(parseISODate(weekStart), 6)), today);
  return `<p class="detail-line">↻ ${esc(describeRule(occ.recurrence))}</p>
    ${streak ? `<p class="detail-line">🌱 ${t("detail.streak", { streak: streakText(occ.recurrence, streak) })}</p>` : ""}
    ${week.target ? `<p class="detail-line">📊 ${t("detail.thisWeek", { done: week.done, target: week.target })}</p>` : ""}`;
}

function habitActions(occ) {
  const skipped = occ.occurrence.skipped;
  return [
    skipped ? "" : btn("primary", "toggle-done", occ, t(occ.done ? "detail.markUndone" : "detail.markDone")),
    occ.done ? "" : btn("soft", "toggle-skip", occ, t(skipped ? "detail.unskip" : "detail.skip")),
    btn("soft", "edit-item", occ, t("detail.editHabit")),
    btn("soft", "open-habits", occ, t("detail.seeStats")),
    btn("soft", "stop-habit", occ, t("detail.stopHabit")),
    btn("danger", "delete-item", occ, t("detail.deleteHabit")),
    `<button type="button" class="btn ghost" data-action="close">${t("detail.close")}</button>`,
  ].join("");
}

const MOOD_FACES = MOODS;

// Une liste à cocher de l'élément. `field` : "checklist" (par défaut), ou une
// autre liste rangée dans item.data (idées cadeaux, invités d'un événement).
export function checklistSection(item, { field = "checklist", title = null, placeholder = null, doneText = null } = {}) {
  const list = getChecklist(item, field);
  const p = progress(list);
  const titleKey = `checklist.title.${item.module}`;
  const heading = title ?? (t(titleKey) === titleKey ? t("checklist.title") : t(titleKey));
  const hint = placeholder ?? t("checklist.placeholder");
  const ids = `data-id="${esc(item.id)}" data-field="${field}"`;
  const titleId = `checklist-title-${esc(item.id)}-${field}`;
  return `<section class="checklist" aria-labelledby="${titleId}">
    <h3 id="${titleId}">${esc(heading)}
      ${p.total ? `<span class="hint">${p.done}/${p.total}</span>` : ""}</h3>
    ${list.length ? `<ul class="check-list">${list.map((e) => `<li class="${e.done ? "is-checked" : ""}">
      <label class="check-row">
        <input type="checkbox" data-action="check-toggle" ${ids} data-entry="${esc(e.id)}" ${e.done ? "checked" : ""}>
        <span>${esc(e.text)}</span>
      </label>
      <button type="button" class="check-remove" data-action="check-remove" ${ids} data-entry="${esc(e.id)}"
        aria-label="${esc(t("checklist.remove", { text: e.text }))}">×</button>
    </li>`).join("")}</ul>` : ""}
    ${p.complete ? `<p class="check-done">${esc(doneText ?? t("checklist.allDone"))}</p>` : ""}
    <form class="check-add" ${ids}>
      <input data-role="checklist-input" placeholder="${esc(hint)}" aria-label="${esc(hint)}" autocomplete="off">
      <button type="submit" class="btn soft">${t("checklist.add")}</button>
    </form>
  </section>`;
}

function journalSummary(item) {
  const c = entryContent(item);
  const grateful = c.gratitude.filter((g) => g.trim());
  return [
    c.mood !== null ? `<p class="detail-line">${MOODS[c.mood]} ${esc(t(`mood.level.${c.mood}`))}</p>` : "",
    c.text.trim() ? `<p class="detail-notes">${esc(c.text.length > 400 ? `${c.text.slice(0, 400)}…` : c.text)}</p>` : "",
    grateful.length ? `<p class="detail-line">💛 ${esc(grateful.join(" · "))}</p>` : "",
  ].join("");
}

function meditationSummary(item) {
  const d = item.data ?? {};
  const lines = [];
  if (d.minutes) lines.push(`🧘 ${t("med.minutes", { count: d.minutes })}`);
  if (d.kind === "session") lines.push(t(d.completed === false ? "med.partial" : "med.completed"));
  if (Number.isInteger(d.moodBefore) || Number.isInteger(d.moodAfter)) {
    lines.push(`${MOOD_FACES[d.moodBefore] ?? "·"} → ${MOOD_FACES[d.moodAfter] ?? "·"}`);
  }
  return lines.map((l) => `<p class="detail-line">${l}</p>`).join("");
}

function itemActions(item) {
  return [
    item.module === "meditation" && !item.done
      ? `<button type="button" class="btn primary" data-action="open-meditation">${t("med.startNow")}</button>` : "",
    item.data?.grocery
      ? `<button type="button" class="btn primary" data-action="open-grocery">🛒 ${t("grocery.custom.seeList")}</button>` : "",
    item.module === "voyage"
      ? `<button type="button" class="btn primary" data-action="open-trip" data-id="${esc(item.id)}">🗺️ ${t("trip.open")}</button>` : "",
    item.module === "journal"
      ? `<button type="button" class="btn primary" data-action="open-journal" data-date="${esc(item.date)}">${t("journal.open")}</button>` : "",
    isCancelled(item) ? "" : btn("primary", "toggle-done", item, t(item.done ? "detail.markUndone" : "detail.markDone")),
    btn("soft", "edit-item", item, t("detail.edit")),
    btn("soft", isCancelled(item) ? "restore-item" : "cancel-item", item, t(isCancelled(item) ? "detail.restore" : "detail.cancel")),
    btn("danger", "delete-item", item, t("detail.delete")),
    `<button type="button" class="btn ghost" data-action="close">${t("detail.close")}</button>`,
  ].join("");
}
