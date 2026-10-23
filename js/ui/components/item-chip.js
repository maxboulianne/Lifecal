import { getModule } from "../../config/modules.js";
import { formatTime } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { isCancelled } from "../../data/item.js";

const stateClass = (item) => [item.done && "is-done", isCancelled(item) && "is-cancelled"].filter(Boolean).join(" ");

// Pastille d'un élément dans les vues jour et semaine.
export function itemChip(item, { detailed = false } = {}) {
  const m = getModule(item.module);
  const time = item.time ? `<span class="chip-time">${formatTime(item.time)}</span>` : "";
  const place = detailed && item.place ? `<span class="chip-place">📍 ${esc(item.place)}</span>` : "";
  const label = `${m.label} : ${item.title}${item.done ? " (fait)" : ""}${isCancelled(item) ? " (annulé)" : ""}`;
  return `<button type="button" class="chip ${stateClass(item)}" style="--c:${m.color}"
    data-action="open-item" data-id="${esc(item.id)}" aria-label="${esc(label)}">
    ${item.done ? '<span class="chip-check" aria-hidden="true">✓</span>' : ""}${time}
    <span class="chip-title">${esc(item.title)}</span>${place}
  </button>`;
}

// Point de couleur (vue mois, légende).
export function dot(item) {
  const m = getModule(item.module);
  return `<span class="dot ${stateClass(item)}" style="--c:${m.color}" title="${esc(item.title)}"></span>`;
}
