// Utilitaires de dates, toujours en heure locale.
// (Les noms de jours et de mois, selon la langue, sont dans js/i18n/index.js.)
// Les dates des éléments sont stockées au format ISO « AAAA-MM-JJ » (sans fuseau),
// ce qui évite le décalage d'un jour que produisait toISOString() le soir.

const pad = (n) => String(n).padStart(2, "0");

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Midi local : protège des changements d'heure (heure avancée).
export function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function isISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISODate(s).getTime());
}

export function todayISO(now = new Date()) {
  return toISODate(now);
}

export function addDays(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  return r;
}

export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Ajoute des mois sans déborder (31 janvier + 1 mois = 28/29 février).
export function addMonths(d, n) {
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  const target = new Date(y, m, 1, 12);
  target.setDate(Math.min(d.getDate(), daysInMonth(target.getFullYear(), target.getMonth())));
  return target;
}

export function addYears(d, n) {
  return addMonths(d, 12 * n);
}

// La semaine commence le lundi.
export function startOfWeek(d) {
  return addDays(d, -((d.getDay() + 6) % 7));
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
}

export function diffDays(fromISO, toISO) {
  return Math.round((parseISODate(toISO) - parseISODate(fromISO)) / 86400000);
}
