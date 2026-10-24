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
    <p class="detail-line">🕒 ${when}</p>
    ${item.occurrence ? habitSummary(item, today) : ""}
    ${item.module === "meditation" ? meditationSummary(item) : ""}
    ${place}
    ${item.notes ? `<p class="detail-notes">${esc(item.notes)}</p>` : ""}
    ${source}
    <div class="actions stack">${item.occurrence ? habitActions(item) : itemActions(item)}</div>
  </article>`;
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

const MOOD_FACES = ["😣", "😕", "😐", "🙂", "😌"];

function meditationSummary(item) {
  const d = item.data ?? {};
  const lines = [];
  if (d.minutes) lines.push(`🧘 ${t("med.minutes", { count: d.minutes })}`);
  if (Number.isInteger(d.moodBefore) || Number.isInteger(d.moodAfter)) {
    lines.push(`${MOOD_FACES[d.moodBefore] ?? "·"} → ${MOOD_FACES[d.moodAfter] ?? "·"}`);
  }
  return lines.map((l) => `<p class="detail-line">${l}</p>`).join("");
}

function itemActions(item) {
  return [
    item.module === "meditation" && !item.done
      ? `<button type="button" class="btn primary" data-action="open-meditation">${t("med.startNow")}</button>` : "",
    isCancelled(item) ? "" : btn("primary", "toggle-done", item, t(item.done ? "detail.markUndone" : "detail.markDone")),
    btn("soft", "edit-item", item, t("detail.edit")),
    btn("soft", isCancelled(item) ? "restore-item" : "cancel-item", item, t(isCancelled(item) ? "detail.restore" : "detail.cancel")),
    btn("danger", "delete-item", item, t("detail.delete")),
    `<button type="button" class="btn ghost" data-action="close">${t("detail.close")}</button>`,
  ].join("");
}
