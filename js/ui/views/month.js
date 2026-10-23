import { MOIS, capitalize, daysInMonth, toISODate } from "../../core/dates.js";
import { dot } from "../components/item-chip.js";

const HEADERS = ["L", "M", "M", "J", "V", "S", "D"];
const MAX_DOTS = 6;

export const monthView = {
  id: "month",
  label: "Mois",

  title(cursor) {
    return `${capitalize(MOIS[cursor.getMonth()])} ${cursor.getFullYear()}`;
  },

  render({ cursor, repo, today }) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const n = daysInMonth(y, m);

    let cells = '<div class="month-cell is-blank"></div>'.repeat(offset);
    for (let day = 1; day <= n; day++) {
      const iso = toISODate(new Date(y, m, day, 12));
      const items = repo.onDate(iso);
      const extra = items.length > MAX_DOTS ? `<span class="more">+${items.length - MAX_DOTS}</span>` : "";
      cells += `<button type="button" class="month-cell ${iso === today ? "is-today" : ""}"
        data-action="open-day" data-date="${iso}" aria-label="${day} ${MOIS[m]}, ${items.length} élément(s)">
        <span class="day-num">${day}</span>
        <span class="dots">${items.slice(0, MAX_DOTS).map(dot).join("")}${extra}</span>
      </button>`;
    }

    return `<section class="month-view">
      ${HEADERS.map((h) => `<div class="month-head">${h}</div>`).join("")}
      ${cells}
    </section>`;
  },
};
