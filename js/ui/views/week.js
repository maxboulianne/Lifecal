import { JOURS_COURTS, MOIS, addDays, startOfWeek, toISODate } from "../../core/dates.js";
import { itemChip } from "../components/item-chip.js";

export const weekView = {
  id: "week",
  label: "Semaine",

  title(cursor) {
    const start = startOfWeek(cursor);
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth
      ? `${start.getDate()} – ${end.getDate()} ${MOIS[end.getMonth()]} ${end.getFullYear()}`
      : `${start.getDate()} ${MOIS[start.getMonth()]} – ${end.getDate()} ${MOIS[end.getMonth()]} ${end.getFullYear()}`;
  },

  render({ cursor, repo, today }) {
    const start = startOfWeek(cursor);
    const days = Array.from({ length: 7 }, (_, k) => addDays(start, k));
    return `<section class="week-view">${days
      .map((d) => {
        const iso = toISODate(d);
        const items = repo.onDate(iso);
        return `<div class="week-day ${iso === today ? "is-today" : ""}">
          <button type="button" class="day-head" data-action="open-day" data-date="${iso}">
            <span class="day-name">${JOURS_COURTS[d.getDay()]}</span><span class="day-num">${d.getDate()}</span>
          </button>
          <div class="day-items">${items.map((i) => itemChip(i)).join("")}</div>
        </div>`;
      })
      .join("")}</section>`;
  },
};
