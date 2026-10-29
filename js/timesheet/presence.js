// Heures de présence d'une journée : début, fin et pause (ex. le dîner). Elles servent
// de référence pour balancer les heures notées par projet ; elles ne vont pas sur la facture.
//
// Rangées dans doc.timesheet.days : { "2026-10-29": { start: "08:00", end: "17:30", pause: 1 } }
//   start / end : « HH:MM » (24 h) ; pause : en heures (1 = 1 h, 0.75 = 45 min)
// Une fin plus tôt que le début : la journée se termine après minuit.

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const round = (n) => Math.round(n * 100) / 100;

// « 8h », « 8:5 », « 830 », « 8.30 » → « 08:00 », « 08:05 », « 08:30 » ; sinon "".
export function normalizeTime(value) {
  const s = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return "";
  const m = s.match(/^(\d{1,2})(?:[:h.](\d{1,2})?)?$/) ?? s.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// Pause : « 1 », « 1:00 », « 1h », « 0,75 » en heures ; « 45 », « 45 min », « 30m » en minutes.
export function parsePause(value) {
  const s = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "").replace(",", ".");
  if (!s) return 0;
  let m = s.match(/^(\d+)(?:min|m)$/);
  if (m) return round(Number(m[1]) / 60);
  m = s.match(/^(\d+)[:h](\d{1,2})?$/);
  if (m) return Number(m[2] ?? 0) < 60 ? round(Number(m[1]) + Number(m[2] ?? 0) / 60) : null;
  m = s.match(/^\d+(?:\.\d+)?$/);
  if (!m) return null;
  const n = Number(s);
  // Un nombre seul : des heures jusqu'à 12 (« 1 », « 0.5 ») ; au-delà, des minutes (« 45 »).
  return round(n > 12 ? n / 60 : n);
}

const minutes = (time) => {
  const [, h, m] = TIME.exec(time) ?? [];
  return h === undefined ? null : Number(h) * 60 + Number(m);
};

export function normalizeDays(raw) {
  const out = {};
  for (const [date, d] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !d) continue;
    const start = TIME.test(d.start) ? d.start : "";
    const end = TIME.test(d.end) ? d.end : "";
    const pause = Number(d.pause) > 0 ? round(Number(d.pause)) : 0;
    if (start || end || pause) out[date] = { start, end, pause };
  }
  return out;
}

export const getPresence = (ts, date) => ts.days?.[date] ?? { start: "", end: "", pause: 0 };

// Heures travaillées : fin − début − pause ; null tant que le début ou la fin manque.
export function presenceHours(p) {
  const a = minutes(p.start);
  const b = minutes(p.end);
  if (a === null || b === null) return null;
  const span = (b - a + 1440) % 1440;
  return round(Math.max(0, span / 60 - (p.pause || 0)));
}

export function setPresence(ts, date, patch) {
  const days = normalizeDays({ ...ts.days, [date]: { ...getPresence(ts, date), ...patch } });
  return { ...ts, days };
}

// Recopier la présence d'une journée sur une autre (si l'autre n'en a pas encore).
export function copyPresence(ts, from, to) {
  if (!ts.days?.[from] || ts.days?.[to]) return ts;
  return { ...ts, days: { ...ts.days, [to]: { ...ts.days[from] } } };
}
