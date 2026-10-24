// Journal : une entrée par jour, rangée dans le calendrier (module « journal »).
//
// item.data d'une entrée :
//   text        le texte libre
//   mood        humeur du jour, 0 à 4 (mêmes visages que la méditation)
//   gratitude   ["…", "…", "…"] trois petites choses qui ont fait du bien
//
// L'humeur du journal et celle notée après les méditations forment ensemble
// la courbe « Mon humeur ».

import { addDays, parseISODate, startOfWeek, toISODate } from "../core/dates.js";

export const JOURNAL_MODULE = "journal";
export const GRATITUDE_SLOTS = 3;

const isEntry = (i) => i.module === JOURNAL_MODULE && !i.recurrence;

export const entryFor = (items, iso) => items.find((i) => isEntry(i) && i.date === iso) ?? null;

// Contenu d'une entrée (les anciennes entrées créées par le formulaire ont leur texte dans « notes »).
export function entryContent(item) {
  const d = item?.data ?? {};
  const gratitude = Array.from({ length: GRATITUDE_SLOTS }, (_, k) => d.gratitude?.[k] ?? "");
  return { text: d.text ?? item?.notes ?? "", mood: Number.isInteger(d.mood) ? d.mood : null, gratitude };
}

export const isEmptyContent = (c) => !c.text.trim() && c.mood === null && c.gratitude.every((g) => !g.trim());

// Titre affiché dans le calendrier : la première ligne écrite par la personne
// (les questions d'inspiration insérées dans le texte sont ignorées), raccourcie.
export function entryTitle(content, fallback, prompts = []) {
  const first = content.text.split("\n").map((l) => l.trim()).find((l) => l && !prompts.includes(l)) ?? "";
  if (!first) return fallback;
  return first.length > 50 ? `${first.slice(0, 48).trimEnd()}…` : first;
}

export function pastEntries(items, beforeISO, limit = 30) {
  return items
    .filter((i) => isEntry(i) && i.date < beforeISO && !isEmptyContent(entryContent(i)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

// Question du jour : la même toute la journée, différente d'un jour à l'autre.
export function promptIndex(iso, count, shift = 0) {
  let h = 0;
  for (const c of iso) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h + shift) % count;
}

// ---- Humeur ------------------------------------------------------------------

// Humeur d'une journée : celle du journal si elle existe, sinon la moyenne des
// humeurs notées après les méditations du jour.
export function moodOfDay(items, iso) {
  const entry = entryFor(items, iso);
  const mood = entry ? entryContent(entry).mood : null;
  if (mood !== null) return mood;
  const after = items
    .filter((i) => i.date === iso && i.module === "meditation" && Number.isInteger(i.data?.moodAfter))
    .map((i) => i.data.moodAfter);
  return after.length ? after.reduce((a, b) => a + b, 0) / after.length : null;
}

export function moodSeries(items, todayISO, days = 30) {
  const end = parseISODate(todayISO);
  return Array.from({ length: days }, (_, k) => {
    const iso = toISODate(addDays(end, k - days + 1));
    return { iso, mood: moodOfDay(items, iso) };
  });
}

const average = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

// Tendance : semaine en cours comparée à la précédente.
// "up" | "down" | "steady" | null (pas assez de données)
export function weekTrend(items, todayISO) {
  const monday = startOfWeek(parseISODate(todayISO));
  const week = (start) =>
    Array.from({ length: 7 }, (_, k) => toISODate(addDays(start, k)))
      .filter((iso) => iso <= todayISO)
      .map((iso) => moodOfDay(items, iso))
      .filter((m) => m !== null);
  const now = average(week(monday));
  const before = average(week(addDays(monday, -7)));
  if (now === null || before === null) return null;
  if (now - before >= 0.5) return "up";
  if (before - now >= 0.5) return "down";
  return "steady";
}
