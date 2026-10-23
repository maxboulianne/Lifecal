import { toISODate } from "../../core/dates.js";
import { isCancelled } from "../../data/item.js";
import { fmt, t } from "../../i18n/index.js";
import { itemChip } from "../components/item-chip.js";

export const dayView = {
  id: "day",

  title(cursor) {
    return fmt.longDate(cursor);
  },

  render({ cursor, repo }) {
    const iso = toISODate(cursor);
    const items = repo.onDate(iso);
    if (!items.length) {
      return `<section class="day-view empty">
        <p class="empty-msg">${t("day.empty")}</p>
        <button type="button" class="btn soft" data-action="new-item" data-date="${iso}">${t("day.add")}</button>
      </section>`;
    }
    // Les jours facultatifs d'une habitude « X fois par semaine » ne comptent pas.
    const active = items.filter((i) => !isCancelled(i) && !(i.occurrence?.optional && !i.done));
    const done = active.filter((i) => i.done).length;
    const progress = active.length
      ? `<p class="day-progress">${done === active.length
          ? t("day.allDone", { total: active.length })
          : t("day.progress", { count: done, done, total: active.length })}</p>`
      : "";
    return `<section class="day-view">
      ${progress}
      <div class="day-list">${items.map((i) => itemChip(i, { detailed: true })).join("")}</div>
    </section>`;
  },
};
