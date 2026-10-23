// Traductions et formatage selon la langue choisie.
//
// t("cle", { param }) cherche le texte dans la langue courante, puis en
// français (langue de référence), puis retourne la clé elle-même.
// Un texte peut avoir des formes plurielles : { one: "...", other: "..." },
// choisies avec le paramètre `count` (règles de pluriel de chaque langue).
//
// Les dates, heures, listes et « dans 3 jours » passent par Intl : aucune
// traduction manuelle des jours et des mois n'est nécessaire.
//
// Ajouter une langue : créer locales/xx.js (copie de fr.js) et l'ajouter à LANGUAGES.

import de from "./locales/de.js";
import en from "./locales/en.js";
import es from "./locales/es.js";
import fr from "./locales/fr.js";
import ko from "./locales/ko.js";
import pt from "./locales/pt.js";
import vi from "./locales/vi.js";

// `intl` : variante régionale pour les dates et heures.
export const LANGUAGES = [
  { code: "fr", name: "Français", intl: "fr-CA", dict: fr },
  { code: "en", name: "English", intl: "en-CA", dict: en },
  { code: "es", name: "Español", intl: "es", dict: es },
  { code: "pt", name: "Português", intl: "pt-BR", dict: pt },
  { code: "de", name: "Deutsch", intl: "de-DE", dict: de },
  { code: "vi", name: "Tiếng Việt", intl: "vi-VN", dict: vi },
  { code: "ko", name: "한국어", intl: "ko-KR", dict: ko },
];

export const DEFAULT_LANGUAGE = "fr";
const byCode = new Map(LANGUAGES.map((l) => [l.code, l]));

let lang = byCode.get(DEFAULT_LANGUAGE);
let cache = new Map();

export function setLanguage(code) {
  lang = byCode.get(code) ?? byCode.get(DEFAULT_LANGUAGE);
  cache = new Map();
  if (typeof document !== "undefined") document.documentElement.lang = lang.code;
}

export const getLanguage = () => lang.code;
export const isSupported = (code) => byCode.has(code);

// Première langue de l'appareil que LifeCal connaît (ex. "pt-BR" → "pt").
export function detectLanguage(preferred = globalThis.navigator?.languages ?? []) {
  for (const tag of preferred) {
    const code = String(tag).toLowerCase().split("-")[0];
    if (byCode.has(code)) return code;
  }
  return DEFAULT_LANGUAGE;
}

function lookup(key) {
  return lang.dict[key] ?? fr[key];
}

function interpolate(text, params) {
  return text.replace(/\{(\w+)\}/g, (m, name) => (params[name] ?? m));
}

const pluralRules = () => memo("plural", () => new Intl.PluralRules(lang.intl));

export function t(key, params = {}) {
  let value = lookup(key);
  if (value === undefined) return key;
  if (typeof value === "object" && !Array.isArray(value)) {
    const form = params.count === undefined ? "other" : pluralRules().select(params.count);
    value = value[form] ?? value.other;
  }
  return interpolate(String(value), params);
}

// Pour les listes de textes (ex. encouragements variés).
export function tList(key) {
  const value = lookup(key);
  return Array.isArray(value) ? value : [];
}

// ---- Formatage -----------------------------------------------------------

function memo(name, make) {
  if (!cache.has(name)) cache.set(name, make());
  return cache.get(name);
}

const dtf = (name, options) => memo(name, () => new Intl.DateTimeFormat(lang.intl, options));

const capitalize = (s) => s.charAt(0).toLocaleUpperCase(lang.intl) + s.slice(1);

// Un dimanche de référence : weekdayDate(0) = dimanche, (1) = lundi…
const weekdayDate = (index) => new Date(2026, 9, 18 + index, 12);

export const fmt = {
  // « Vendredi 23 octobre »
  longDate: (d) => capitalize(dtf("long", { weekday: "long", day: "numeric", month: "long" }).format(d)),
  // « Octobre 2026 »
  monthYear: (d) => capitalize(dtf("monthYear", { month: "long", year: "numeric" }).format(d)),
  // « Octobre »
  monthName: (month) => capitalize(dtf("month", { month: "long" }).format(new Date(2026, month, 1, 12))),
  // « Ven. » pour une date
  weekdayShort: (d) => capitalize(dtf("wdShort", { weekday: "short" }).format(d)),
  // Par numéro de jour (0 = dimanche)
  weekdayNameShort: (index) => capitalize(dtf("wdShort", { weekday: "short" }).format(weekdayDate(index))),
  weekdayNarrow: (index) => dtf("wdNarrow", { weekday: "narrow" }).format(weekdayDate(index)),
  // « 9 h 30 », « 9:30 a.m. », « 오전 9:30 »…
  time(hhmm) {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":").map(Number);
    return dtf("time", { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 0, 1, h, m));
  },
  // « 23 octobre 2026 »
  date: (d) => dtf("date", { day: "numeric", month: "long", year: "numeric" }).format(d),
  // « 19 – 25 octobre 2026 »
  range(start, end) {
    const f = dtf("range", { day: "numeric", month: "long", year: "numeric" });
    return f.formatRange ? f.formatRange(start, end) : `${f.format(start)} – ${f.format(end)}`;
  },
  // « aujourd'hui », « demain », « dans 13 jours »
  inDays: (n) => memo("rel", () => new Intl.RelativeTimeFormat(lang.intl, { numeric: "auto" })).format(n, "day"),
  // « Yoga, Course et Lecture »
  list(items) {
    const lf = memo("list", () => (Intl.ListFormat ? new Intl.ListFormat(lang.intl, { type: "conjunction" }) : null));
    return lf ? lf.format(items) : items.join(", ");
  },
  percent: (ratio) => memo("pct", () => new Intl.NumberFormat(lang.intl, { style: "percent" })).format(ratio),
};
