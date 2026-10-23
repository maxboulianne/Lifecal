import { capitalize, formatLong, toISODate } from "../../core/dates.js";
import { isCancelled } from "../../data/item.js";
import { itemChip } from "../components/item-chip.js";

export const dayView = {
  id: "day",
  label: "Jour",

  title(cursor) {
    return capitalize(formatLong(cursor));
  },

  render({ cursor, repo }) {
    const iso = toISODate(cursor);
    const items = repo.onDate(iso);
    if (!items.length) {
      return `<section class="day-view empty">
        <p class="empty-msg">Rien de prévu. Profite de la journée 🌿</p>
        <button type="button" class="btn soft" data-action="new-item" data-date="${iso}">Ajouter quelque chose</button>
      </section>`;
    }
    const active = items.filter((i) => !isCancelled(i));
    const done = active.filter((i) => i.done).length;
    const progress = active.length
      ? `<p class="day-progress">${done} sur ${active.length} ${done === active.length ? "— tout est fait, bravo ✨" : "fait" + (done > 1 ? "s" : "")}</p>`
      : "";
    return `<section class="day-view">
      ${progress}
      <div class="day-list">${items.map((i) => itemChip(i, { detailed: true })).join("")}</div>
    </section>`;
  },
};
