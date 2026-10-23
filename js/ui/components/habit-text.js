import { FREQ } from "../../data/recurrence.js";
import { fmt, t } from "../../i18n/index.js";

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

// « Tous les jours », « Lun., mer. et ven. », « 3 fois par semaine »
export function describeRule(recurrence) {
  if (!recurrence) return "";
  if (recurrence.freq === FREQ.DAILY) return t("rule.daily");
  if (recurrence.freq === FREQ.FLEXIBLE) return t("rule.flexible", { count: recurrence.timesPerWeek });
  const days = MONDAY_FIRST.filter((d) => recurrence.days.includes(d));
  return days.length === 7 ? t("rule.daily") : fmt.list(days.map(fmt.weekdayNameShort));
}

// « 5 jours » ou « 2 semaines » selon le type d'habitude.
export function streakText(recurrence, count) {
  return t(recurrence?.freq === FREQ.FLEXIBLE ? "count.weeks" : "count.days", { count });
}

export { MONDAY_FIRST };
