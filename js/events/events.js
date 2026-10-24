// Événements et anniversaires (module « evenement »).
//
// item.data d'un événement :
//   kind        "birthday" (fête) | "anniversary" (mariage, rencontre…) | "event" (souper, spectacle…)
//   yearUnknown true si l'année de départ n'est pas connue (pas d'âge affiché)
//   budget      budget cadeau en dollars (ou null)
//   gifts       idées cadeaux  [{ id, text, done }]  (done = acheté)
//   guests      invités        [{ id, text, done }]  (done = confirmé)
//   checklist   à préparer     [{ id, text, done }]
// Une fête ou un anniversaire revient chaque année (recurrence { freq: "yearly" }) :
// sa date est la date d'origine (naissance, mariage), d'où l'âge.

import { addDays, diffDays, parseISODate, toISODate } from "../core/dates.js";
import { isCancelled } from "../data/item.js";
import { occurrencesBetween } from "../data/recurrence.js";

export const EVENT_MODULE = "evenement";
export const EVENT_KINDS = ["birthday", "anniversary", "event"];
export const KIND_ICONS = { birthday: "🎂", anniversary: "💍", event: "🎉" };
export const EVENT_LISTS = ["gifts", "guests", "checklist"];

export const eventKind = (item) => (EVENT_KINDS.includes(item?.data?.kind) ? item.data.kind : "event");
export const kindIcon = (item) => KIND_ICONS[eventKind(item)];

// Âge (ou nombre d'années) à la date `iso` d'une occurrence ; null si inconnu.
export function ageOn(item, iso) {
  if (eventKind(item) === "event" || item.data?.yearUnknown || item.recurrence?.freq !== "yearly") return null;
  const start = item.occurrence?.start ?? item.date;
  const years = Number(iso.slice(0, 4)) - Number(start.slice(0, 4));
  return years > 0 ? years : null;
}

export const budgetOf = (item) => {
  const n = Number(item?.data?.budget);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Prochains événements (de aujourd'hui à `days` jours), du plus proche au plus lointain :
// [{ item (occurrence), date, days, age }]
export function upcomingEvents(items, today, days = 365) {
  const end = toISODate(addDays(parseISODate(today), days));
  const events = items.filter((i) => i.module === EVENT_MODULE && !isCancelled(i));
  return occurrencesBetween(events, today, end)
    .filter((o) => !isCancelled(o))
    .map((o) => ({ item: o, date: o.date, days: diffDays(today, o.date), age: ageOn(o, o.date) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.item.title.localeCompare(b.item.title));
}

// Moment du rappel : le jour même, dans 1-2 jours, ou dans 3 à 14 jours.
export function reminderPhase(days) {
  if (days === 0) return "today";
  if (days <= 2) return "soon";
  if (days <= 14) return "ahead";
  return null;
}
