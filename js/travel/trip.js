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
