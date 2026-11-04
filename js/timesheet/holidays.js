// Congés fériés du Québec, calculés pour chaque année (rien à entrer).
// Sur la facture : le nom en anglais ; dans l'application : la traduction « holiday.<clé> ».
// Un congé sans heures paraît sur la facture à 0 h ; un congé travaillé se facture normalement.

const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const weekday = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = dimanche

// Dimanche de Pâques (calendrier grégorien, méthode de Meeus)
function easter(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

const shift = (date, days) => {
  const d = new Date(date.getTime() + days * 86400000);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

// n-ième lundi d'un mois
function nthMonday(y, m, n) {
  const first = (8 - weekday(y, m, 1)) % 7 + 1; // premier lundi
  return iso(y, m, first + 7 * (n - 1));
}

// Lundi qui précède le 25 mai (Journée nationale des patriotes)
function mondayBeforeMay25(y) {
  const back = (weekday(y, 5, 24) + 6) % 7; // jours depuis le lundi, au 24 mai
  return iso(y, 5, 24 - back);
}

// Fête nationale et fête du Canada : un dimanche, le congé est le lundi
const notSunday = (y, m, d) => (weekday(y, m, d) === 0 ? iso(y, m, d + 1) : iso(y, m, d));

export const HOLIDAY_EN = {
  newYear: "New Year's Day",
  goodFriday: "Good Friday",
  easterMonday: "Easter Monday",
  patriots: "National Patriots' Day",
  stJean: "Quebec National Holiday (St-Jean-Baptiste)",
  canada: "Canada Day",
  labour: "Labour Day",
  thanksgiving: "Thanksgiving",
  christmas: "Christmas Day",
};

// [{ date, key }] pour une année, dans l'ordre
export function quebecHolidays(year) {
  const e = easter(year);
  return [
    { date: iso(year, 1, 1), key: "newYear" },
    { date: shift(e, -2), key: "goodFriday" },
    { date: shift(e, 1), key: "easterMonday" },
    { date: mondayBeforeMay25(year), key: "patriots" },
    { date: notSunday(year, 6, 24), key: "stJean" },
    { date: notSunday(year, 7, 1), key: "canada" },
    { date: nthMonday(year, 9, 1), key: "labour" },
    { date: nthMonday(year, 10, 2), key: "thanksgiving" },
    { date: iso(year, 12, 25), key: "christmas" },
  ];
}

const cache = new Map();
// Le congé de ce jour, ou null
export function holidayOn(date) {
  const y = Number(String(date).slice(0, 4));
  if (!cache.has(y)) cache.set(y, quebecHolidays(y));
  return cache.get(y).find((h) => h.date === date) ?? null;
}

// Congés d'une période, du lundi au vendredi (les fins de semaine ne sont pas facturées)
export function holidaysBetween(from, to) {
  const out = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of quebecHolidays(y)) {
      const [yy, mm, dd] = h.date.split("-").map(Number);
      const wd = weekday(yy, mm, dd);
      if (h.date >= from && h.date <= to && wd !== 0 && wd !== 6) out.push(h);
    }
  }
  return out;
}

// Tous les congés d'une période, fins de semaine comprises (calendrier)
export function holidaysBetweenAll(from, to) {
  const out = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of quebecHolidays(y)) if (h.date >= from && h.date <= to) out.push(h);
  }
  return out;
}
