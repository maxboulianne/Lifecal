// Santé : analyse des aliments suspects. On compare chaque aliment et boisson (et les repas
// épicés ou très chauds) aux réactions notées après les repas, sur une période.
// Aucun diagnostic : l'analyse montre les liens possibles, à discuter avec un médecin.
//
//   - Un repas « avec réaction » : une réaction lui est rattachée, ou une réaction sans repas
//     commence dans les 3 heures qui suivent (la plus proche).
//   - Taux d'un aliment : repas avec réaction ÷ repas où il a été pris.
//   - Taux moyen : repas avec réaction ÷ tous les repas de la période (le point de comparaison).
//   - Suspect : au moins 2 réactions, taux d'au moins 50 % et plus haut que le taux moyen.
//   - À surveiller : au moins 1 réaction et taux nettement plus haut (au moins 1,5 fois le taux moyen et 25 %) :
//     pas encore assez de cas pour conclure. Un aliment de tous les repas (riz, poulet) suit le taux moyen.
//   - Semble toléré : pris au moins 3 fois, « aucune réaction » confirmé, et jamais de réaction.

import { addDays, parseISODate, toISODate } from "../core/dates.js";
import { mealItems } from "./health.js";

export const LOOSE_WINDOW_MINUTES = 180;
export const PERIODS = [30, 90, 0]; // jours ; 0 = tout
export const TIME_SLOTS = ["morning", "midday", "afternoon", "evening", "night"];
export const FLAG_SPICY = "flag:spicy";
export const FLAG_HOT = "flag:hot";

const toMin = (time) => (time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null);
const absMin = (date, time) => parseISODate(date).getTime() / 60000 + (toMin(time) ?? 12 * 60) - 12 * 60;
const round1 = (n) => Math.round(n * 10) / 10;
const avg = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : null);

// Moment de la journée d'une heure « 14:05 »
export function timeSlot(time) {
  const m = toMin(time);
  if (m === null) return null;
  if (m >= 300 && m < 660) return "morning";
  if (m >= 660 && m < 840) return "midday";
  if (m >= 840 && m < 1020) return "afternoon";
  if (m >= 1020 && m < 1260) return "evening";
  return "night";
}

// Lundi de la semaine d'une date
const mondayOf = (iso) => {
  const d = parseISODate(iso);
  return toISODate(addDays(d, -((d.getDay() + 6) % 7)));
};

// Période : { from, to } ; days = 0 : depuis le premier repas ou la première réaction
export function periodOf(health, today, days) {
  if (days > 0) return { from: toISODate(addDays(parseISODate(today), -(days - 1))), to: today };
  const first = [...health.meals, ...health.reactions].map((x) => x.date).sort()[0];
  return { from: first && first < today ? first : today, to: today };
}

// Réactions de chaque repas : celles qui lui sont rattachées, plus les réactions sans repas
// commencées dans les 3 heures après lui (le repas le plus proche avant la réaction)
export function reactionsByMeal(meals, reactions) {
  const out = new Map(meals.map((m) => [m.id, []]));
  for (const r of reactions) {
    if (r.mealId && out.has(r.mealId)) {
      out.get(r.mealId).push(r);
      continue;
    }
    if (r.mealId || !r.time) continue;
    const at = absMin(r.date, r.time);
    let best = null;
    for (const m of meals) {
      if (!m.time) continue;
      const gap = at - absMin(m.date, m.time);
      if (gap >= 0 && gap <= LOOSE_WINDOW_MINUTES && (!best || gap < best.gap)) best = { meal: m, gap };
    }
    if (best) out.get(best.meal.id).push(r);
  }
  return out;
}

// Délai entre le début du repas et la réaction (minutes), si les deux heures sont connues
const delayOf = (meal, r) => (meal.time && r.time ? Math.round(absMin(r.date, r.time) - absMin(meal.date, meal.time)) : null);

export function analyzeFoods(health, { from, to }) {
  const meals = health.meals.filter((m) => m.date >= from && m.date <= to);
  const reactions = health.reactions.filter((r) => r.date >= from && r.date <= to);
  const byMeal = reactionsByMeal(meals, reactions);
  const reactedMeals = meals.filter((m) => byMeal.get(m.id).length);
  const baseline = meals.length ? reactedMeals.length / meals.length : 0;

  // Bilan par aliment, boisson ou particularité du repas (épicé, très chaud)
  const stats = new Map();
  for (const m of meals) {
    const list = byMeal.get(m.id);
    const keys = [...mealItems(m), ...(m.spicy ? [FLAG_SPICY] : []), ...(m.hot ? [FLAG_HOT] : [])];
    for (const id of keys) {
      const s = stats.get(id) ?? { id, eaten: 0, reacted: 0, calm: 0, intensities: [], delays: [], last: null };
      s.eaten++;
      if (list.length) {
        s.reacted++;
        s.intensities.push(Math.max(...list.map((r) => r.intensity)));
        const d = list.map((r) => delayOf(m, r)).filter((x) => x !== null && x >= 0);
        if (d.length) s.delays.push(Math.min(...d));
      } else if (m.calm) s.calm++;
      s.last = m.date;
      stats.set(id, s);
    }
  }
  const items = [...stats.values()].map(({ intensities, delays, ...s }) => {
    const rate = s.reacted / s.eaten;
    const level = s.reacted >= 2 && rate >= 0.5 && rate > baseline ? "suspect"
      : s.reacted >= 1 && rate > baseline && rate >= Math.max(0.25, baseline * 1.5) ? "watch"
      : !s.reacted && s.calm >= 3 ? "safe" : null;
    const delay = avg(delays);
    return { ...s, rate, level, intensity: intensities.length ? round1(avg(intensities)) : null, delay: delay === null ? null : Math.round(delay) };
  });
  const byRisk = (a, b) => b.rate - a.rate || b.reacted - a.reacted || b.eaten - a.eaten;
  const suspects = items.filter((x) => x.level === "suspect").sort(byRisk);
  const watch = items.filter((x) => x.level === "watch").sort(byRisk);
  const safe = items.filter((x) => x.level === "safe").sort((a, b) => b.calm - a.calm || b.eaten - a.eaten);

  // Tendances
  const timed = reactions.filter((r) => r.minutes !== null);
  const delays = reactedMeals.flatMap((m) => {
    const d = byMeal.get(m.id).map((r) => delayOf(m, r)).filter((x) => x !== null && x >= 0);
    return d.length ? [Math.min(...d)] : [];
  });
  const weeks = [];
  for (let w = mondayOf(from); w <= to; w = toISODate(addDays(parseISODate(w), 7))) {
    const end = toISODate(addDays(parseISODate(w), 6));
    const inWeek = (x) => x.date >= w && x.date <= end;
    const rs = reactions.filter(inWeek);
    const tm = rs.filter((r) => r.minutes !== null);
    weeks.push({ from: w, meals: meals.filter(inWeek).length, reactions: rs.length,
      minutes: tm.length ? Math.round(avg(tm.map((r) => r.minutes))) : null });
  }
  const slots = Object.fromEntries(TIME_SLOTS.map((s) => [s, 0]));
  for (const r of reactions) if (timeSlot(r.time)) slots[timeSlot(r.time)]++;
  const where = { nose: 0, mouth: 0, both: 0 };
  for (const r of reactions) where[r.where]++;

  // Repas les plus parlants : ceux avec la réaction la plus forte, puis les plus récents
  const notable = reactedMeals.map((m) => ({ meal: m, reactions: byMeal.get(m.id), intensity: Math.max(...byMeal.get(m.id).map((r) => r.intensity)) }))
    .sort((a, b) => b.intensity - a.intensity || b.meal.date.localeCompare(a.meal.date) || (b.meal.time || "").localeCompare(a.meal.time || ""))
    .slice(0, 8);

  return {
    from, to,
    totals: {
      meals: meals.length, reactedMeals: reactedMeals.length, calmMeals: meals.filter((m) => m.calm && !byMeal.get(m.id).length).length,
      reactions: reactions.length, reactionDays: new Set(reactions.map((r) => r.date)).size,
      intensity: reactions.length ? round1(avg(reactions.map((r) => r.intensity))) : null,
      minutes: timed.length ? Math.round(avg(timed.map((r) => r.minutes))) : null,
      delay: delays.length ? Math.round(avg(delays)) : null,
    },
    baseline, suspects, watch, safe, weeks, slots, where, notable,
    enough: meals.length >= 5,
  };
}
