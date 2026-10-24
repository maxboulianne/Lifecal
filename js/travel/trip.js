// Voyages : dates, compte à rebours et lieux à visiter.
//
// item.data d'un voyage :
//   endDate    "AAAA-MM-JJ" date de retour (facultative)
//   checklist  la liste « À emporter » (voir data/checklist.js)
//   places     [{ id, name, visited, lat, lng }] lieux à visiter

import { diffDays } from "../core/dates.js";
import { newId } from "../data/item.js";
import { spanEnd } from "../data/recurrence.js";

export const tripEnd = (trip) => spanEnd(trip) ?? trip.date;
export const tripLength = (trip) => diffDays(trip.date, tripEnd(trip)) + 1;

// { phase: "before" | "during" | "after", days?, day?, total }
export function tripStatus(trip, todayISO) {
  const total = tripLength(trip);
  if (todayISO < trip.date) return { phase: "before", days: diffDays(todayISO, trip.date), total };
  if (todayISO <= tripEnd(trip)) return { phase: "during", day: diffDays(trip.date, todayISO) + 1, total };
  return { phase: "after", total };
}

// ---- Lieux à visiter (fonctions pures : retournent une nouvelle liste) ----------

export const getPlaces = (trip) => (Array.isArray(trip?.data?.places) ? trip.data.places : []);

export function addPlace(list, name) {
  const clean = String(name ?? "").trim();
  return clean ? [...list, { id: newId(), name: clean, visited: false, lat: null, lng: null }] : list;
}

export const toggleVisited = (list, id) => list.map((p) => (p.id === id ? { ...p, visited: !p.visited } : p));
export const removePlace = (list, id) => list.filter((p) => p.id !== id);
export const setPlaceCoords = (list, id, { lat, lng }) => list.map((p) => (p.id === id ? { ...p, lat, lng } : p));
export const located = (list) => list.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

// Lien vers une carte : la position si on la connaît, sinon une recherche par nom.
export function placeMapUrl(place, destination = "") {
  if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
    return `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=16/${place.lat}/${place.lng}`;
  }
  const query = [place.name, destination].filter(Boolean).join(", ");
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}

// ---- Destination, suggestions et hôtels (gardés dans item.data) ----------------
//   dest         { query, lat, lng }          la destination trouvée sur la carte
//   suggestions  { key, items: [...] }        lieux célèbres (voir discover.js)
//   hotelChains  ["hilton", …]                chaînes choisies (2 au plus)
//   hotels       { key, items: [...] }        hôtels de ces chaînes à 25 km

// Ce qu'on cherche sur la carte : le lieu du voyage, sinon son titre (« Milan »).
export const destQuery = (trip) => String(trip.place || trip.title || "").trim();

// La destination connue, si elle correspond toujours au lieu du voyage.
export function getDest(trip) {
  const d = trip.data?.dest;
  return d && d.query === destQuery(trip) && Number.isFinite(d.lat) && Number.isFinite(d.lng) ? d : null;
}

export const suggestionsKey = (trip, lang) => `${destQuery(trip)}|${lang}`;
export const getHotelChains = (trip) => (Array.isArray(trip.data?.hotelChains) ? trip.data.hotelChains : []);
export function hotelsKey(trip) {
  const dest = getDest(trip);
  const chains = [...getHotelChains(trip)].sort();
  // « v2 » : les résultats de l'ancienne recherche (parfois vides à tort) sont ignorés.
  return dest && chains.length ? `v2|${chains.join(",")}|${dest.lat},${dest.lng}` : null;
}

// Les données gardées, seulement si elles sont encore à jour.
export const cachedSuggestions = (trip, lang) =>
  trip.data?.suggestions?.key === suggestionsKey(trip, lang) ? trip.data.suggestions.items : null;
export const cachedHotels = (trip) => (hotelsKey(trip) && trip.data?.hotels?.key === hotelsKey(trip) ? trip.data.hotels.items : null);
