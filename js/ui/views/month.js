import { daysInMonth, toISODate } from "../../core/dates.js";
import { fmt, t } from "../../i18n/index.js";
import { dot } from "../components/item-chip.js";

const MAX_DOTS = 6;
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

export const monthView = {
  id: "month",

  title(cursor) {
    return fmt.monthYear(cursor);
  },

  render({ cursor, repo, today }) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const n = daysInMonth(y, m);

    let cells = '<div class="month-cell is-blank"></div>'.repeat(offset);
    for (let day = 1; day <= n; day++) {
      const date = new Date(y, m, day, 12);
      const iso = toISODate(date);
      const items = repo.onDate(iso);
      const extra = items.length > MAX_DOTS ? `<span class="more">+${items.length - MAX_DOTS}</span>` : "";
      cells += `<button type="button" class="month-cell ${iso === today ? "is-today" : ""}"
        data-action="open-day" data-date="${iso}" aria-label="${fmt.date(date)}, ${t("count.items", { count: items.length })}">
        <span class="day-num">${day}</span>
        <span class="dots">${items.slice(0, MAX_DOTS).map(dot).join("")}${extra}</span>
      </button>`;
    }

    return `<section class="month-view">
      ${MONDAY_FIRST.map((d) => `<div class="month-head">${fmt.weekdayNarrow(d)}</div>`).join("")}
      ${cells}
    </section>`;
  },
};
