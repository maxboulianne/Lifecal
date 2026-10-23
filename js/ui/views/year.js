import { MOIS, capitalize, daysInMonth } from "../../core/dates.js";
import { isCancelled } from "../../data/item.js";

const pad = (n) => String(n).padStart(2, "0");

export const yearView = {
  id: "year",
  label: "Année",

  title(cursor) {
    return String(cursor.getFullYear());
  },

  render({ cursor, repo, today }) {
    const y = cursor.getFullYear();
    const currentMonth = today.slice(0, 7);
    return `<section class="year-view">${MOIS.map((name, m) => {
      const prefix = `${y}-${pad(m + 1)}`;
      const items = repo.between(`${prefix}-01`, `${prefix}-${pad(daysInMonth(y, m))}`).filter((i) => !isCancelled(i));
      const done = items.filter((i) => i.done).length;
      const pct = items.length ? Math.round((done / items.length) * 100) : 0;
      return `<button type="button" class="year-month ${prefix === currentMonth ? "is-today" : ""}"
        data-action="open-month" data-date="${prefix}-01">
        <span class="year-month-name">${capitalize(name)}</span>
        <span class="year-stat">${items.length} élément${items.length > 1 ? "s" : ""}</span>
        <span class="year-stat">✅ ${done} fait${done > 1 ? "s" : ""}</span>
        <span class="bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
      </button>`;
    }).join("")}</section>`;
  },
};
