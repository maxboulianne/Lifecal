// Progrès en méditation, calculés à partir des séances enregistrées dans le
// calendrier (éléments du module « meditation » marqués comme faits).
// Une seule source de vérité : supprimer une séance du calendrier la retire
// aussi des statistiques.
//
// item.data d'une séance : { kind, sessionId, exercise, seconds, minutes,
//   planned, completed, moodBefore, moodAfter }
// (les séances enregistrées avant l'ajout de `seconds` et `completed` sont
// comptées avec leurs minutes, et comme terminées).

import { addDays, addMonths, daysInMonth, parseISODate, startOfWeek, toISODate } from "../core/dates.js";
import { PROGRAMS } from "./catalog.js";

export const MEDITATION_MODULE = "meditation";

export const meditationLog = (items) =>
  items.filter((i) => i.module === MEDITATION_MODULE && i.done && i.data?.kind);

export const secondsOf = (item) => item.data?.seconds ?? (item.data?.minutes ?? 0) * 60;
export const isCompleted = (item) => item.data?.completed !== false;

export function meditationStats(items, todayISO) {
  const log = meditationLog(items);
  const days = new Set(log.map((i) => i.date));
  // Série : jours consécutifs avec au moins une séance (aujourd'hui pas encore
  // fait ne casse pas la série d'hier).
  let streak = 0;
  let d = parseISODate(todayISO);
  if (!days.has(todayISO)) d = addDays(d, -1);
  while (days.has(toISODate(d))) {
    streak++;
    d = addDays(d, -1);
  }
  const moods = log.filter((i) => Number.isInteger(i.data.moodBefore) && Number.isInteger(i.data.moodAfter));
  return {
    sessions: log.length,
    minutes: Math.round(log.reduce((sum, i) => sum + secondsOf(i), 0) / 60),
    streak,
    moodLift: moods.length ? moods.reduce((s, i) => s + i.data.moodAfter - i.data.moodBefore, 0) / moods.length : null,
  };
}

// Séances guidées terminées au complet (pour la progression des parcours).
export function completedSessions(items) {
  return new Set(meditationLog(items).filter(isCompleted).map((i) => i.data.sessionId).filter(Boolean));
}

// Séance suggérée pour un parcours : la première pas encore faite.
export function nextSession(program, completed) {
  return program.sessions.find((s) => !completed.has(s)) ?? null;
}

// Pour la carte « Continuer » : le parcours séquentiel commencé et pas fini,
// sinon le premier parcours.
export function suggestion(items) {
  const done = completedSessions(items);
  const started = PROGRAMS.find((p) => p.sequential && p.sessions.some((s) => done.has(s)) && nextSession(p, done));
  const program = started ?? PROGRAMS.find((p) => p.sequential && nextSession(p, done));
  return program ? { program, sessionId: nextSession(program, done) } : null;
}

// ---- Statistiques détaillées ---------------------------------------------------

// Progression de chaque parcours : séances terminées au complet, temps écouté.
export function programProgress(items) {
  const log = meditationLog(items);
  const done = completedSessions(items);
  return PROGRAMS.map((program) => {
    const own = log.filter((i) => program.sessions.includes(i.data.sessionId));
    const completed = program.sessions.filter((s) => done.has(s)).length;
    return {
      program,
      completed,
      total: program.sessions.length,
      ratio: completed / program.sessions.length,
      seconds: own.reduce((sum, i) => sum + secondsOf(i), 0),
      sessions: program.sessions.map((id) => ({ id, completed: done.has(id), times: own.filter((i) => i.data.sessionId === id && isCompleted(i)).length })),
    };
  });
}

// Temps écouté par type : séances guidées, respiration, silence.
export function secondsByKind(items, fromISO, toISO) {
  const out = { session: 0, breathing: 0, timer: 0 };
  for (const i of meditationLog(items)) {
    if (i.date >= fromISO && i.date <= toISO && i.data.kind in out) out[i.data.kind] += secondsOf(i);
  }
  return out;
}

function secondsPerDay(items, fromISO, toISO) {
  const map = new Map();
  for (const i of meditationLog(items)) {
    if (i.date < fromISO || i.date > toISO) continue;
    map.set(i.date, (map.get(i.date) ?? 0) + secondsOf(i));
  }
  return map;
}

// Série de barres pour une période, `offset` périodes avant l'actuelle
// (0 = cette semaine / ce mois / cette année).
//   week  : 7 barres (lundi → dimanche)
//   month : une barre par jour du mois
//   year  : 12 barres (une par mois)
// Retourne { from, to, bars: [{ key, date, seconds }], total, best }.
export function periodSeries(items, period, todayISO, offset = 0) {
  const today = parseISODate(todayISO);
  let bars;
  if (period === "week") {
    const start = addDays(startOfWeek(today), -7 * offset);
    bars = Array.from({ length: 7 }, (_, k) => {
      const d = addDays(start, k);
      return { key: toISODate(d), date: d, from: toISODate(d), to: toISODate(d) };
    });
  } else if (period === "month") {
    const first = addMonths(new Date(today.getFullYear(), today.getMonth(), 1, 12), -offset);
    bars = Array.from({ length: daysInMonth(first.getFullYear(), first.getMonth()) }, (_, k) => {
      const d = new Date(first.getFullYear(), first.getMonth(), k + 1, 12);
      return { key: toISODate(d), date: d, from: toISODate(d), to: toISODate(d) };
    });
  } else {
    const y = today.getFullYear() - offset;
    bars = Array.from({ length: 12 }, (_, m) => {
      const d = new Date(y, m, 1, 12);
      return { key: `${y}-${String(m + 1).padStart(2, "0")}`, date: d, from: toISODate(d), to: toISODate(new Date(y, m, daysInMonth(y, m), 12)) };
    });
  }
  const from = bars[0].from;
  const to = bars.at(-1).to;
  const perDay = secondsPerDay(items, from, to);
  for (const bar of bars) {
    bar.seconds = 0;
    for (const [iso, s] of perDay) if (iso >= bar.from && iso <= bar.to) bar.seconds += s;
  }
  const total = bars.reduce((sum, b) => sum + b.seconds, 0);
  const best = bars.reduce((b, x) => (x.seconds > (b?.seconds ?? 0) ? x : b), null);
  return { period, offset, from, to, bars, total, best };
}
