// Page d'un voyage : compte à rebours, préparation (« À emporter »),
// lieux à visiter et carte.

import { getModule } from "../../config/modules.js";
import { esc } from "../../core/dom.js";
import { t } from "../../i18n/index.js";
import { getPlaces, located, placeMapUrl, tripStatus } from "../../travel/trip.js";
import { checklistSection } from "../components/item-detail.js";
import { tripDates, tripStatusText } from "../components/trip-text.js";

function placeRow(trip, place) {
  const hasCoords = Number.isFinite(place.lat);
  return `<li class="${place.visited ? "is-checked" : ""}">
    <label class="check-row">
      <input type="checkbox" data-action="place-toggle" data-id="${esc(trip.id)}" data-entry="${esc(place.id)}" ${place.visited ? "checked" : ""}
        aria-label="${esc(t("trip.visited"))} : ${esc(place.name)}">
      <span>${esc(place.name)}</span>
    </label>
    <button type="button" class="place-btn ${hasCoords ? "is-located" : ""}" data-action="place-locate" data-id="${esc(trip.id)}" data-entry="${esc(place.id)}"
      title="${esc(t("trip.locate"))}" aria-label="${esc(t("trip.locate"))} : ${esc(place.name)}">📍</button>
    <a class="place-btn" href="${placeMapUrl(place, trip.place)}" target="_blank" rel="noopener"
      title="${esc(t("trip.mapLink"))}" aria-label="${esc(t("trip.mapLink"))} : ${esc(place.name)}">↗</a>
    <button type="button" class="check-remove" data-action="place-remove" data-id="${esc(trip.id)}" data-entry="${esc(place.id)}"
      aria-label="${esc(t("trip.removePlace", { name: place.name }))}">×</button>
  </li>`;
}

export const tripPage = {
  id: "trip",
  parent: "trips",

  title: ({ repo, tripId }) => repo.get(tripId)?.title ?? t("module.voyage"),

  render({ repo, today, tripId }) {
    const trip = repo.get(tripId);
    if (!trip) return `<section class="page"><p class="empty-msg">${t("trip.missing")}</p></section>`;
    const m = getModule(trip.module);
    const places = getPlaces(trip);
    const visited = places.filter((p) => p.visited).length;
    const onMap = located(places);

    return `<section class="page trip" style="--c:${m.color}">
      <article class="card trip-hero">
        <p class="detail-module">${m.icon} ${esc(trip.place || t("module.voyage"))}</p>
        <h2>${esc(trip.title)}</h2>
        <p class="trip-dates">${esc(tripDates(trip))} · ${t("count.days", { count: tripStatus(trip, today).total })}</p>
        <p class="trip-status">${esc(tripStatusText(trip, today))}</p>
        <div class="actions start">
          <button type="button" class="btn soft" data-action="edit-item" data-id="${esc(trip.id)}">${t("detail.edit")}</button>
        </div>
      </article>

      <article class="card">
        <h2>${t("trip.prep")}</h2>
        ${checklistSection(trip)}
      </article>

      <article class="card">
        <h2>${t("trip.places")} ${places.length ? `<span class="hint">${t("trip.placesProgress", { done: visited, total: places.length })}</span>` : ""}</h2>
        ${places.length ? `<ul class="check-list places">${places.map((p) => placeRow(trip, p)).join("")}</ul>` : ""}
        <form class="check-add place-add" data-id="${esc(trip.id)}">
          <input data-role="place-input" placeholder="${esc(t("trip.placePlaceholder"))}" aria-label="${esc(t("trip.placePlaceholder"))}" autocomplete="off">
          <button type="submit" class="btn soft">${t("checklist.add")}</button>
        </form>
      </article>

      <article class="card">
        <h2>${t("trip.map")}</h2>
        ${onMap.length
          ? `<div class="trip-map" id="trip-map" data-id="${esc(trip.id)}" role="region" aria-label="${esc(t("trip.map"))}"></div>
             <p class="hint small" data-role="map-status"></p>`
          : `<p class="hint">${t("trip.mapEmpty")}</p>`}
      </article>
    </section>`;
  },
};
