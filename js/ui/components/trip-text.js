// Textes d'un voyage, partagés par la page Voyage et la fiche du calendrier.
import { parseISODate } from "../../core/dates.js";
import { fmt, t } from "../../i18n/index.js";
import { tripEnd, tripStatus } from "../../travel/trip.js";

export function tripDates(trip) {
  const start = parseISODate(trip.date);
  const end = parseISODate(tripEnd(trip));
  return trip.date === tripEnd(trip) ? fmt.date(start) : fmt.range(start, end);
}

export function tripStatusText(trip, today) {
  const s = tripStatus(trip, today);
  if (s.phase === "before") return t("trip.countdown", { when: fmt.inDays(s.days) });
  if (s.phase === "during") return t("trip.ongoing", { day: s.day, total: s.total });
  return t("trip.past");
}
