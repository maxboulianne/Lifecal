import { daysInMonth } from "../../core/dates.js";
import { isCancelled } from "../../data/item.js";
import { fmt, t } from "../../i18n/index.js";

const pad = (n) => String(n).padStart(2, "0");

// Les habitudes répétées ne comptent que jusqu'à aujourd'hui (sinon une
// habitude quotidienne gonflerait les mois à venir), et leurs jours
// facultatifs non faits sont ignorés.
const counts = (item, today) =>
  !isCancelled(item) && !(item.occurrence && (item.date > today || (item.occurrence.optional && !item.done)));

export const yearView = {
  id: "year",

  title(cursor) {
    return String(cursor.getFullYear());
  },

  render({ cursor, repo, today }) {
    const y = cursor.getFullYear();
    const currentMonth = today.slice(0, 7);
    return `<section class="year-view">${Array.from({ length: 12 }, (_, m) => {
      const prefix = `${y}-${pad(m + 1)}`;
      const items = repo.between(`${prefix}-01`, `${prefix}-${pad(daysInMonth(y, m))}`).filter((i) => counts(i, today));
      const done = items.filter((i) => i.done).length;
      const pct = items.length ? Math.round((done / items.length) * 100) : 0;
      return `<button type="button" class="year-month ${prefix === currentMonth ? "is-today" : ""}"
        data-action="open-month" data-date="${prefix}-01">
        <span class="year-month-name">${fmt.monthName(m)}</span>
        <span class="year-stat">${t("count.items", { count: items.length })}</span>
        <span class="year-stat">✅ ${t("count.done", { count: done })}</span>
        <span class="bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
      </button>`;
    }).join("")}</section>`;
  },
};
