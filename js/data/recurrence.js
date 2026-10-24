// Répétition des éléments (utilisée par les habitudes).
//
// Un élément répété garde sa date de départ dans `date` et sa règle dans
// `recurrence` :
//   { freq: "daily" }                          tous les jours
//   { freq: "weekly", days: [1, 3, 5] }         certains jours (0 = dimanche)
//   { freq: "flexible", timesPerWeek: 3 }       X fois par semaine, n'importe quel jour
//   { freq: "yearly" }                          chaque année à la même date (fêtes, anniversaires)
//   + until: "AAAA-MM-JJ" | null                dernier jour (habitude arrêtée)
//
// Le suivi jour par jour vit dans `data` :
//   data.completions = { "2026-10-23": true }  jours où c'est fait
//   data.skipped     = { "2026-10-24": true }  jours sautés volontairement (neutres)
//
// Les « occurrences » sont des copies de l'élément pour une date donnée ;
// elles ne sont jamais enregistrées, seulement calculées à l'affichage.

import { addDays, diffDays as diffDaysISO, parseISODate, startOfWeek, toISODate } from "../core/dates.js";
import { STATUS } from "./item.js";

export const FREQ = Object.freeze({ DAILY: "daily", WEEKLY: "weekly", FLEXIBLE: "flexible", YEARLY: "yearly" });

export function normalizeRecurrence(raw) {
  if (!raw || typeof raw !== "object") return null;
  const until = typeof raw.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.until) ? raw.until : null;
  if (raw.freq === FREQ.DAILY) return { freq: FREQ.DAILY, until };
  if (raw.freq === FREQ.YEARLY) return { freq: FREQ.YEARLY, until };
  if (raw.freq === FREQ.WEEKLY) {
    const days = [...new Set((raw.days ?? []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    return { freq: FREQ.WEEKLY, days, until };
  }
  if (raw.freq === FREQ.FLEXIBLE) {
    const n = Math.round(Number(raw.timesPerWeek));
    return { freq: FREQ.FLEXIBLE, timesPerWeek: Number.isFinite(n) ? Math.min(7, Math.max(1, n)) : 3, until };
  }
  return null;
}

export const isRecurring = (item) => Boolean(item.recurrence);
export const isYearly = (item) => item.recurrence?.freq === FREQ.YEARLY;

// Date d'un élément annuel pour une année donnée. Le 29 février tombe le
// 28 les années non bissextiles.
export function yearlyDate(startISO, year) {
  const [, m, d] = startISO.split("-").map(Number);
  const last = new Date(year, m, 0).getDate(); // dernier jour du mois
  return `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

// L'élément est-il prévu ce jour-là ?
export function isScheduledOn(item, iso) {
  const r = item.recurrence;
  if (!r) return item.date === iso;
  if (iso < item.date || (r.until && iso > r.until)) return false;
  if (r.freq === FREQ.WEEKLY) return r.days.includes(parseISODate(iso).getDay());
  if (r.freq === FREQ.YEARLY) return yearlyDate(item.date, Number(iso.slice(0, 4))) === iso;
  return true; // daily et flexible : visibles chaque jour
}

export const isDoneOn = (item, iso) => Boolean(item.data?.completions?.[iso]);
export const isSkippedOn = (item, iso) => Boolean(item.data?.skipped?.[iso]);

// Pour « X fois par semaine » : nombre de jours faits dans la semaine de `iso`.
export function doneInWeek(item, iso) {
  const start = startOfWeek(parseISODate(iso));
  let n = 0;
  for (let k = 0; k < 7; k++) if (isDoneOn(item, toISODate(addDays(start, k)))) n++;
  return n;
}

export function toOccurrence(item, iso) {
  const done = isDoneOn(item, iso);
  const skipped = isSkippedOn(item, iso);
  // Objectif de la semaine déjà atteint : les autres jours deviennent facultatifs.
  const optional = item.recurrence.freq === FREQ.FLEXIBLE && !done && doneInWeek(item, iso) >= item.recurrence.timesPerWeek;
  return {
    ...item,
    date: iso,
    done,
    status: skipped || item.status === STATUS.CANCELLED ? STATUS.CANCELLED : STATUS.ACTIVE,
    occurrence: { of: item.id, date: iso, start: item.date, skipped, optional },
  };
}

// Élément sur plusieurs jours (ex. un voyage) : data.endDate après la date de départ.
export const spanEnd = (item) =>
  !item.recurrence && typeof item.data?.endDate === "string" && item.data.endDate > item.date ? item.data.endDate : null;

// Toutes les occurrences entre deux dates ISO (incluses).
// Un élément sur plusieurs jours apparaît chaque jour, avec item.span = { start, end, day, days }.
export function occurrencesBetween(items, fromISO, toISO) {
  const out = [];
  for (const item of items) {
    const end = spanEnd(item);
    if (end) {
      const days = diffDaysISO(item.date, end) + 1;
      const first = item.date > fromISO ? item.date : fromISO;
      const last = end < toISO ? end : toISO;
      for (let d = parseISODate(first); toISODate(d) <= last; d = addDays(d, 1)) {
        const iso = toISODate(d);
        out.push({ ...item, date: iso, span: { start: item.date, end, day: diffDaysISO(item.date, iso) + 1, days } });
      }
      continue;
    }
    if (!item.recurrence) {
      if (item.date >= fromISO && item.date <= toISO) out.push(item);
      continue;
    }
    const first = item.date > fromISO ? item.date : fromISO;
    const last = item.recurrence.until && item.recurrence.until < toISO ? item.recurrence.until : toISO;
    if (item.recurrence.freq === FREQ.YEARLY) {
      // Une date par année : inutile de parcourir chaque jour.
      for (let y = Number(first.slice(0, 4)); y <= Number(last.slice(0, 4)); y++) {
        const iso = yearlyDate(item.date, y);
        if (iso >= first && iso <= last) out.push(toOccurrence(item, iso));
      }
      continue;
    }
    for (let d = parseISODate(first); toISODate(d) <= last; d = addDays(d, 1)) {
      const iso = toISODate(d);
      if (isScheduledOn(item, iso)) out.push(toOccurrence(item, iso));
    }
  }
  return out;
}
