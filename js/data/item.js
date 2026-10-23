// Modèle d'un élément du calendrier.
//
// Champs du cahier des charges : id, title, module, date, time, place, lat, lng, done.
// Champs ajoutés pour préparer la suite :
//   status     "active" | "cancelled" — un élément annulé reste visible, barré.
//   notes      texte libre.
//   recurrence null, ou règle de répétition (voir recurrence.js).
//   data       charge utile propre au module (liste d'épicerie, lieux d'un voyage…).
//   source     provenance : "local" ou un fournisseur externe (google, outlook, yahoo)
//              avec son identifiant, pour la synchronisation future.
//   createdAt / updatedAt  horodatages ISO, utiles à la résolution de conflits.

import { DEFAULT_MODULE, MODULES } from "../config/modules.js";
import { isISODate } from "../core/dates.js";
import { FREQ, normalizeRecurrence } from "./recurrence.js";

export const STATUS = Object.freeze({ ACTIVE: "active", CANCELLED: "cancelled" });

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const toNumberOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Construit un élément complet et cohérent à partir d'une saisie partielle.
export function createItem(input = {}, now = new Date()) {
  const stamp = now.toISOString();
  return normalizeItem({
    id: newId(),
    createdAt: stamp,
    updatedAt: stamp,
    ...input,
  });
}

export function normalizeItem(raw) {
  return {
    id: String(raw.id ?? newId()),
    title: String(raw.title ?? "").trim(),
    module: MODULES[raw.module] ? raw.module : DEFAULT_MODULE,
    date: String(raw.date ?? ""),
    time: /^\d{2}:\d{2}$/.test(raw.time ?? "") ? raw.time : "",
    place: String(raw.place ?? "").trim(),
    lat: toNumberOrNull(raw.lat),
    lng: toNumberOrNull(raw.lng),
    done: Boolean(raw.done),
    status: raw.status === STATUS.CANCELLED ? STATUS.CANCELLED : STATUS.ACTIVE,
    notes: String(raw.notes ?? ""),
    recurrence: normalizeRecurrence(raw.recurrence),
    data: raw.data && typeof raw.data === "object" ? raw.data : {},
    source: {
      provider: raw.source?.provider ?? "local",
      externalId: raw.source?.externalId ?? null,
      etag: raw.source?.etag ?? null,
    },
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

// Retourne une liste de clés d'erreur à traduire (vide si l'élément est valide).
export function validateItem(item) {
  const errors = [];
  if (!item.title) errors.push("errors.title");
  if (!isISODate(item.date)) errors.push("errors.date");
  if ((item.lat === null) !== (item.lng === null)) errors.push("errors.coords");
  if (item.recurrence?.freq === FREQ.WEEKLY && !item.recurrence.days.length) errors.push("errors.days");
  return errors;
}

export const isCancelled = (item) => item.status === STATUS.CANCELLED;
export const hasCoordinates = (item) => item.lat !== null && item.lng !== null;

// Tri dans une journée : sans heure d'abord (toute la journée), puis par heure.
export function compareItems(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return (a.time || "").localeCompare(b.time || "") || a.title.localeCompare(b.title, "fr");
}
