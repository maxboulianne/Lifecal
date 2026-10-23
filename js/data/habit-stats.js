// Statistiques des habitudes : séries, bilans par période, grille d'historique.
//
// Principes (ton doux) :
//  - un jour sauté est neutre : il ne casse pas la série et ne compte pas ;
//  - aujourd'hui, tant que ce n'est pas fait, ne casse pas la série ;
//  - pour « X fois par semaine », la série se compte en semaines réussies.

import { addDays, parseISODate, startOfWeek, toISODate } from "../core/dates.js";
import { FREQ, doneInWeek, isDoneOn, isScheduledOn, isSkippedOn } from "./recurrence.js";

const prevDay = (iso) => toISODate(addDays(parseISODate(iso), -1));
const weekStart = (iso) => toISODate(startOfWeek(parseISODate(iso)));
const ended = (item, iso) => item.recurrence?.until && iso > item.recurrence.until;

function lastRelevantDay(item, todayISO) {
  return ended(item, todayISO) ? item.recurrence.until : todayISO;
}

// Série en cours, en jours (ou en semaines pour « flexible »).
export function currentStreak(item, todayISO) {
  if (item.recurrence?.freq === FREQ.FLEXIBLE) return currentWeekStreak(item, todayISO);
  let streak = 0;
  let iso = lastRelevantDay(item, todayISO);
  if (iso === todayISO && !isDoneOn(item, iso)) iso = prevDay(iso);
  for (; iso >= item.date; iso = prevDay(iso)) {
    if (!isScheduledOn(item, iso) || isSkippedOn(item, iso)) continue;
    if (!isDoneOn(item, iso)) break;
    streak++;
  }
  return streak;
}

function currentWeekStreak(item, todayISO) {
  const goal = item.recurrence.timesPerWeek;
  let week = weekStart(lastRelevantDay(item, todayISO));
  // La semaine en cours compte seulement si l'objectif est déjà atteint.
  if (doneInWeek(item, week) < goal) week = toISODate(addDays(parseISODate(week), -7));
  let streak = 0;
  while (toISODate(addDays(parseISODate(week), 6)) >= item.date && doneInWeek(item, week) >= goal) {
    streak++;
    week = toISODate(addDays(parseISODate(week), -7));
  }
  return streak;
}

// Meilleure série depuis le début.
export function bestStreak(item, todayISO) {
  const last = lastRelevantDay(item, todayISO);
  let best = 0;
  let run = 0;
  if (item.recurrence?.freq === FREQ.FLEXIBLE) {
    for (let w = weekStart(item.date); w <= last; w = toISODate(addDays(parseISODate(w), 7))) {
      const met = doneInWeek(item, w) >= item.recurrence.timesPerWeek;
      run = met ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }
  for (let d = parseISODate(item.date); toISODate(d) <= last; d = addDays(d, 1)) {
    const iso = toISODate(d);
    if (!isScheduledOn(item, iso) || isSkippedOn(item, iso)) continue;
    if (isDoneOn(item, iso)) best = Math.max(best, ++run);
    else if (iso !== todayISO) run = 0;
  }
  return best;
}

// Bilan sur une période : { done, target, rate }.
// target = jours prévus (jusqu'à aujourd'hui), ou objectif hebdomadaire × semaines.
export function periodSummary(item, fromISO, toISO, todayISO) {
  const from = fromISO > item.date ? fromISO : item.date;
  let to = toISO < todayISO ? toISO : todayISO;
  if (ended(item, to)) to = item.recurrence.until;
  if (from > to) return { done: 0, target: 0, rate: null };

  let done = 0;
  let target = 0;
  for (let d = parseISODate(from); toISODate(d) <= to; d = addDays(d, 1)) {
    const iso = toISODate(d);
    if (isDoneOn(item, iso)) done++;
    if (item.recurrence?.freq !== FREQ.FLEXIBLE && isScheduledOn(item, iso) && !isSkippedOn(item, iso)) target++;
  }
  if (item.recurrence?.freq === FREQ.FLEXIBLE) {
    // Objectif au prorata des semaines entamées dans la période.
    let weeks = 0;
    for (let w = weekStart(from); w <= to; w = toISODate(addDays(parseISODate(w), 7))) weeks++;
    target = weeks * item.recurrence.timesPerWeek;
    done = Math.min(done, target);
  }
  return { done, target, rate: target ? done / target : null };
}

// Cellules pour une grille d'historique de `weeks` semaines finissant cette semaine.
// state : "done" | "missed" | "skipped" | "off" (pas prévu) | "future" | "today"
export function historyGrid(item, todayISO, weeks = 12) {
  const start = addDays(startOfWeek(parseISODate(todayISO)), -7 * (weeks - 1));
  const cells = [];
  for (let k = 0; k < weeks * 7; k++) {
    const iso = toISODate(addDays(start, k));
    let state;
    if (isDoneOn(item, iso)) state = "done";
    else if (iso > todayISO) state = "future";
    else if (!isScheduledOn(item, iso) || item.recurrence?.freq === FREQ.FLEXIBLE) state = "off";
    else if (isSkippedOn(item, iso)) state = "skipped";
    else if (iso === todayISO) state = "today";
    else state = "missed";
    cells.push({ iso, state });
  }
  return cells;
}
