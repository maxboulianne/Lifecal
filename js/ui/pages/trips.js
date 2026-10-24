// Page « Mes voyages » : les voyages à venir (compte à rebours, valise,
// lieux à visiter) et les voyages passés.

import { getModule } from "../../config/modules.js";
import { esc } from "../../core/dom.js";
import { getChecklist, progress } from "../../data/checklist.js";
import { isCancelled } from "../../data/item.js";
import { t } from "../../i18n/index.js";
import { getPlaces, tripEnd } from "../../travel/trip.js";
import { tripDates, tripStatusText } from "../components/trip-text.js";

function tripCard(trip, today) {
  const m = getModule(trip.module);
  const bag = progress(getChecklist(trip));
  const places = getPlaces(trip);
  const visited = places.filter((p) => p.visited).length;
  return `<button type="button" class="card trip-card" style="--c:${m.color}" data-action="open-trip" data-id="${esc(trip.id)}">
    <span class="trip-card-icon" aria-hidden="true">${m.icon}</span>
    <span class="trip-card-text">
      <strong>${esc(trip.title)}</strong>
      ${trip.place ? `<span class="hint">📍 ${esc(trip.place)}</span>` : ""}
      <span class="hint">🗓️ ${esc(tripDates(trip))}</span>
      <span class="trip-status">${esc(tripStatusText(trip, today))}</span>
      <span class="trip-card-meta">
        ${bag.total ? `<span>🧳 ${t("trips.bag", { done: bag.done, total: bag.total })}</span>` : ""}
        ${places.length ? `<span>📍 ${t("trip.placesProgress", { done: visited, total: places.length })}</span>` : ""}
      </span>
    </span>
    <span class="trip-card-go" aria-hidden="true">›</span>
  </button>`;
}

export const tripsPage = {
  id: "trips",

  title: () => t("nav.trips"),

  render({ repo, today }) {
    const trips = repo.all().filter((i) => i.module === "voyage" && !i.recurrence && !isCancelled(i));
    const coming = trips.filter((i) => tripEnd(i) >= today).sort((a, b) => a.date.localeCompare(b.date));
    const past = trips.filter((i) => tripEnd(i) < today).sort((a, b) => b.date.localeCompare(a.date));

    return `<section class="page trips">
      ${coming.length ? coming.map((trip) => tripCard(trip, today)).join("") : `<p class="empty-msg">${t("trips.empty")}</p>
        <div class="actions center"><button type="button" class="btn primary" data-action="new-item" data-module="voyage">✈️ ${t("trips.add")}</button></div>`}
      ${past.length ? `<h2 class="section-title">${t("trips.past")}</h2>${past.map((trip) => tripCard(trip, today)).join("")}` : ""}
    </section>`;
  },
};
