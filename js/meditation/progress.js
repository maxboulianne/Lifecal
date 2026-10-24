// Progrès en méditation, calculés à partir des séances enregistrées dans le
// calendrier (éléments du module « meditation » marqués comme faits).
// Une seule source de vérité : supprimer une séance du calendrier la retire
// aussi des statistiques.

import { addDays, parseISODate, toISODate } from "../core/dates.js";
import { PROGRAMS } from "./catalog.js";

export const MEDITATION_MODULE = "meditation";

export const meditationLog = (items) =>
  items.filter((i) => i.module === MEDITATION_MODULE && i.done && i.data?.kind);

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
    minutes: Math.round(log.reduce((sum, i) => sum + (i.data.minutes ?? 0), 0)),
    streak,
    moodLift: moods.length ? moods.reduce((s, i) => s + i.data.moodAfter - i.data.moodBefore, 0) / moods.length : null,
  };
}

export function completedSessions(items) {
  return new Set(meditationLog(items).map((i) => i.data.sessionId).filter(Boolean));
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
