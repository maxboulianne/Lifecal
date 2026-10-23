// Page « Mes habitudes » : séries, bilans semaine / mois / année et
// grille des 12 dernières semaines. Ton encourageant, jamais culpabilisant.

import { getModule } from "../../config/modules.js";
import { addDays, parseISODate, startOfWeek, toISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { bestStreak, currentStreak, historyGrid, periodSummary } from "../../data/habit-stats.js";
import { fmt, t } from "../../i18n/index.js";
import { MONDAY_FIRST, describeRule, streakText } from "../components/habit-text.js";

const WEEKS = 12;

function periods(today) {
  const d = parseISODate(today);
  const weekStart = startOfWeek(d);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return {
    week: [toISODate(weekStart), toISODate(addDays(weekStart, 6))],
    month: [`${y}-${m}-01`, `${y}-${m}-31`],
    year: [`${y}-01-01`, `${y}-12-31`],
  };
}

function encouragement(rate) {
  if (rate === null) return t("habits.cheer.new");
  if (rate >= 0.8) return t("habits.cheer.high");
  if (rate >= 0.5) return t("habits.cheer.mid");
  return t("habits.cheer.low");
}

function stat(label, value) {
  return `<div class="stat"><span class="stat-value">${value}</span><span class="stat-label">${label}</span></div>`;
}

const ratio = (s) => (s.target ? `${s.done}/${s.target}` : "–");
const percent = (s) => (s.rate === null ? "–" : fmt.percent(s.rate));

function habitCard(habit, today) {
  const m = getModule(habit.module);
  const p = periods(today);
  const week = periodSummary(habit, ...p.week, today);
  const month = periodSummary(habit, ...p.month, today);
  const year = periodSummary(habit, ...p.year, today);
  const stopped = habit.recurrence.until && habit.recurrence.until < today;
  const grid = historyGrid(habit, today, WEEKS);

  return `<article class="card habit-card" style="--c:${m.color}">
    <header class="habit-head">
      <div>
        <h2>${esc(habit.title)} ${stopped ? `<span class="tag">${t("habits.stopped")}</span>` : ""}</h2>
        <p class="hint">↻ ${esc(describeRule(habit.recurrence))}</p>
      </div>
      <button type="button" class="btn link" data-action="edit-item" data-id="${esc(habit.id)}">${t("detail.edit")}</button>
    </header>

    <div class="stats">
      ${stat(t("habits.current"), streakText(habit.recurrence, currentStreak(habit, today)))}
      ${stat(t("habits.best"), streakText(habit.recurrence, bestStreak(habit, today)))}
      ${stat(t("habits.week"), ratio(week))}
      ${stat(t("habits.month"), percent(month))}
      ${stat(t("habits.year"), percent(year))}
    </div>

    <p class="cheer">${encouragement(month.rate)}</p>

    <div class="history" aria-label="${esc(t("habits.history", { count: WEEKS }))}">
      <div class="history-days" aria-hidden="true">${MONDAY_FIRST.map((d) => `<span>${fmt.weekdayNarrow(d)}</span>`).join("")}</div>
      <div class="history-grid">${grid
        .map((c) => `<span class="cell ${c.state}" title="${esc(fmt.date(parseISODate(c.iso)))} · ${esc(t(`grid.${c.state}`))}"></span>`)
        .join("")}</div>
    </div>
  </article>`;
}

export const habitsPage = {
  id: "habits",

  title: () => t("habits.title"),

  render({ repo, today }) {
    const habits = repo.habits();
    if (!habits.length) {
      return `<section class="page habits empty">
        <p class="empty-msg">${t("habits.empty")}</p>
        <button type="button" class="btn primary" data-action="new-habit">${t("habits.add")}</button>
      </section>`;
    }
    const legend = ["done", "missed", "skipped", "off"]
      .map((s) => `<span class="legend-item"><span class="cell ${s}" style="--c:${getModule("habitude").color}"></span>${t(`grid.${s}`)}</span>`)
      .join("");
    return `<section class="page habits">
      ${habits.map((h) => habitCard(h, today)).join("")}
      <p class="legend grid-legend">${legend}</p>
    </section>`;
  },
};
