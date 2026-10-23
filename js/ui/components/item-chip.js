import { getModule, moduleLabel } from "../../config/modules.js";
import { esc } from "../../core/dom.js";
import { isCancelled } from "../../data/item.js";
import { fmt, t } from "../../i18n/index.js";

const stateClass = (item) =>
  [item.done && "is-done", isCancelled(item) && "is-cancelled", item.occurrence?.optional && "is-optional"]
    .filter(Boolean)
    .join(" ");

// État lisible (pour les lecteurs d'écran et la fiche de détails).
export function stateLabel(item) {
  if (item.done) return t("state.done");
  if (item.occurrence?.skipped) return t("state.skipped");
  if (isCancelled(item)) return t("state.cancelled");
  if (item.occurrence?.optional) return t("state.optional");
  return "";
}

// Pastille d'un élément dans les vues jour et semaine.
export function itemChip(item, { detailed = false } = {}) {
  const m = getModule(item.module);
  const time = item.time ? `<span class="chip-time">${fmt.time(item.time)}</span>` : "";
  const place = detailed && item.place ? `<span class="chip-place">📍 ${esc(item.place)}</span>` : "";
  const repeat = item.recurrence ? '<span class="chip-repeat" aria-hidden="true">↻</span>' : "";
  const state = stateLabel(item);
  const label = `${moduleLabel(item.module)} : ${item.title}${state ? ` (${state})` : ""}`;
  return `<button type="button" class="chip ${stateClass(item)}" style="--c:${m.color}"
    data-action="open-item" data-id="${esc(item.id)}" data-date="${esc(item.date)}" aria-label="${esc(label)}">
    ${item.done ? '<span class="chip-check" aria-hidden="true">✓</span>' : ""}${time}
    <span class="chip-title">${esc(item.title)}</span>${repeat}${place}
  </button>`;
}

// Point de couleur (vue mois).
export function dot(item) {
  const m = getModule(item.module);
  return `<span class="dot ${stateClass(item)}" style="--c:${m.color}" title="${esc(item.title)}"></span>`;
}
