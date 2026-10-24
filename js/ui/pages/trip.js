// Page d'un voyage : compte à rebours, carte de la destination, lieux à
// visiter (et lieux célèbres suggérés), hôtels des grandes chaînes, préparation.

import { getModule } from "../../config/modules.js";
import { esc } from "../../core/dom.js";
import { fmt, getLanguage, t } from "../../i18n/index.js";
import { HOTEL_CHAINS, MAX_CHAINS, getChain } from "../../travel/discover.js";
import {
  cachedHotels, cachedSuggestions, destQuery, getDest, getHotelChains, getPlaces, located, placeMapUrl, tripStatus,
} from "../../travel/trip.js";
import { productKey } from "../../grocery/grocery.js";
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

// État des recherches en cours (fourni par l'application) :
// { dest, suggestions, hotels } -> "loading" | "offline" | "notfound" | undefined
const statusLine = (key, params = {}) => `<p class="hint trip-status-line">${esc(t(key, params))}</p>`;
// Sans Internet : le message et un bouton pour réessayer.
const offlineLine = (trip) => `<p class="hint trip-status-line">${esc(t("trip.needInternet"))}
  <button type="button" class="btn link" data-action="trip-retry" data-id="${esc(trip.id)}">${t("trip.retry")}</button></p>`;

function mapCard(trip, status) {
  const dest = getDest(trip);
  const onMap = located(getPlaces(trip));
  const query = destQuery(trip);
  let body;
  if (dest || onMap.length) {
    body = `<div class="trip-map" id="trip-map" data-id="${esc(trip.id)}" role="region" aria-label="${esc(t("trip.map"))}"></div>
      <p class="hint small" data-role="map-status"></p>`;
  } else if (status.dest === "loading") body = statusLine("trip.locatingDest", { place: query });
  else if (status.dest === "notfound") body = statusLine("trip.destNotFound", { place: query });
  else if (status.dest === "offline") body = offlineLine(trip);
  else body = `<p class="hint">${t("trip.mapEmpty")}</p>`;
  return `<article class="card"><h2>${t("trip.map")}</h2>${body}</article>`;
}

function suggestionsBlock(trip, status) {
  if (!getDest(trip)) return "";
  const items = cachedSuggestions(trip, getLanguage());
  let body;
  if (items === null) {
    body = status.suggestions === "offline" ? offlineLine(trip) : statusLine("trip.suggestionsLoading");
  } else {
    const have = new Set(getPlaces(trip).map((p) => productKey(p.name)));
    const shown = items.filter((s) => !have.has(productKey(s.name)));
    body = shown.length
      ? `<ul class="suggestion-list">${shown.map((s, k) => `<li>
          <div class="suggestion-text">
            <strong>${esc(s.name)}</strong>
            ${s.description ? `<span class="hint">${esc(s.description)}</span>` : ""}
          </div>
          ${s.url ? `<a class="place-btn is-located" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(t("trip.wiki"))}"
            aria-label="${esc(t("trip.wiki"))} : ${esc(s.name)}">↗</a>` : ""}
          <button type="button" class="btn soft small-btn" data-action="suggestion-add" data-id="${esc(trip.id)}" data-index="${items.indexOf(s)}"
            aria-label="${esc(t("trip.addSuggestion", { name: s.name }))}">+ ${t("checklist.add")}</button>
        </li>`).join("")}</ul>`
      : statusLine(items.length ? "trip.suggestionsAllAdded" : "trip.suggestionsNone");
  }
  return `<div class="suggestions">
    <h3>${t("trip.suggestions")}</h3>
    <p class="hint">${t("trip.suggestionsHint")}</p>
    ${body}
  </div>`;
}

function hotelsCard(trip, status) {
  const dest = getDest(trip);
  const chosen = getHotelChains(trip);
  const hotels = cachedHotels(trip);
  let results = "";
  if (dest && chosen.length) {
    if (hotels === null) results = status.hotels === "offline" ? offlineLine(trip) : statusLine("trip.hotelsLoading");
    else if (!hotels.length) results = statusLine("trip.hotelsNone", { km: 25 });
    else results = `<ul class="hotel-list">${hotels.map((h) => `<li style="--hc:${getChain(h.chain).color}">
        <span class="hotel-dot" aria-hidden="true"></span>
        <div class="hotel-text"><strong>${esc(h.name)}</strong>
          <span class="hint">${esc(getChain(h.chain).name)} · ${esc(t("trip.hotelDistance", { km: fmt.decimal(h.km) }))}</span></div>
        <a class="btn link" href="${esc(h.url)}" target="_blank" rel="noopener">${t("trip.website")} ↗</a>
      </li>`).join("")}</ul>
      <p class="hint small">${t("trip.hotelsSource")}</p>`;
  }
  return `<article class="card">
    <h2>${t("trip.hotels")}</h2>
    <p class="hint">${t("trip.hotelsHint", { max: MAX_CHAINS, km: 25 })}</p>
    <div class="chain-picker">${HOTEL_CHAINS.map((c) => `<label class="chain-option" style="--hc:${c.color}">
      <input type="checkbox" data-action="hotel-chain" data-id="${esc(trip.id)}" value="${c.id}" ${chosen.includes(c.id) ? "checked" : ""}>
      <span>${esc(c.name)}</span></label>`).join("")}</div>
    ${dest ? results : chosen.length ? statusLine("trip.hotelsNeedDest") : ""}
  </article>`;
}

export const tripPage = {
  id: "trip",
  parent: "trips",

  title: ({ repo, tripId }) => repo.get(tripId)?.title ?? t("module.voyage"),

  render({ repo, today, tripId, tripStatus: status = {} }) {
    const trip = repo.get(tripId);
    if (!trip) return `<section class="page"><p class="empty-msg">${t("trip.missing")}</p></section>`;
    const m = getModule(trip.module);
    const places = getPlaces(trip);
    const visited = places.filter((p) => p.visited).length;

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

      ${mapCard(trip, status)}

      <article class="card">
        <h2>${t("trip.places")} ${places.length ? `<span class="hint">${t("trip.placesProgress", { done: visited, total: places.length })}</span>` : ""}</h2>
        ${places.length ? `<ul class="check-list places">${places.map((p) => placeRow(trip, p)).join("")}</ul>` : ""}
        <form class="check-add place-add" data-id="${esc(trip.id)}">
          <input data-role="place-input" placeholder="${esc(t("trip.placePlaceholder"))}" aria-label="${esc(t("trip.placePlaceholder"))}" autocomplete="off">
          <button type="submit" class="btn soft">${t("checklist.add")}</button>
        </form>
        ${suggestionsBlock(trip, status)}
      </article>

      ${hotelsCard(trip, status)}

      <article class="card">
        <h2>${t("trip.prep")}</h2>
        ${checklistSection(trip)}
      </article>
    </section>`;
  },
};
