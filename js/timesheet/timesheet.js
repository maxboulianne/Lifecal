// Feuille de temps : clients, projets et heures travaillées chaque jour.
//
// Rangée dans doc.timesheet :
//   clients   [{ id, name, contact, email, address, tps, tvq }]   tps / tvq : taxes facturées
//   projects  [{ id, number, name, clientId, rate, archived }]     rate : taux horaire ($)
//   entries   [{ id, date, projectId, hours, note }]               une ligne d'heures d'une journée
// Fonctions pures : elles retournent toujours de nouvelles valeurs.

import { addDays, parseISODate, startOfWeek, toISODate } from "../core/dates.js";
import { newId } from "../data/item.js";

export const TPS_RATE = 0.05;
export const TVQ_RATE = 0.09975;

export function emptyTimesheet() {
  return { clients: [], projects: [], entries: [] };
}

const str = (v) => String(v ?? "").trim();
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function normalizeTimesheet(raw) {
  const ts = raw && typeof raw === "object" ? raw : {};
  const clients = (Array.isArray(ts.clients) ? ts.clients : []).filter((c) => c && str(c.name)).map((c) => ({
    id: c.id ?? newId(), name: str(c.name), contact: str(c.contact), email: str(c.email), address: String(c.address ?? ""),
    tps: c.tps !== false, tvq: c.tvq !== false,
  }));
  const projects = (Array.isArray(ts.projects) ? ts.projects : []).filter((p) => p && (str(p.number) || str(p.name))).map((p) => ({
    id: p.id ?? newId(), number: str(p.number), name: str(p.name), clientId: p.clientId ?? null,
    rate: num(p.rate) !== null && num(p.rate) >= 0 ? num(p.rate) : null, archived: Boolean(p.archived),
  }));
  const entries = (Array.isArray(ts.entries) ? ts.entries : [])
    .filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.projectId && num(e.hours) !== null && num(e.hours) >= 0)
    .map((e) => ({ id: e.id ?? newId(), date: e.date, projectId: e.projectId, hours: num(e.hours), note: str(e.note) }));
  return { clients, projects, entries };
}

// « 2,75 », « 2.75 », « 2:45 », « 2h45 », « 2 h 45 », « 45 min » -> heures décimales (ou null).
export function parseHours(input) {
  const s = str(input).toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let m = s.match(/^(\d+)(?::|h)(\d{1,2})(?:m(?:in)?)?$/);
  if (m) return Number(m[2]) < 60 ? round(Number(m[1]) + Number(m[2]) / 60) : null;
  m = s.match(/^(\d+)m(?:in)?$/);
  if (m) return round(Number(m[1]) / 60);
  m = s.match(/^(\d+(?:[.,]\d+)?)h?$/);
  if (m) return round(Number(m[1].replace(",", ".")));
  return null;
}

const round = (n) => Math.round(n * 100) / 100;

// « 2 h 45 » pour l'affichage (heures décimales -> heures et minutes)
export function hoursToClock(hours) {
  const total = Math.round(hours * 60);
  return { h: Math.floor(total / 60), m: total % 60 };
}

// ---- Lectures -------------------------------------------------------------------

export const getProject = (ts, id) => ts.projects.find((p) => p.id === id) ?? null;
export const getClient = (ts, id) => ts.clients.find((c) => c.id === id) ?? null;
export const projectLabel = (p) => (p ? [p.number, p.name].filter(Boolean).join(" · ") : "?");

export const dayEntries = (ts, date) => ts.entries.filter((e) => e.date === date);
export const sumHours = (entries) => round(entries.reduce((s, e) => s + e.hours, 0));
export const dayTotal = (ts, date) => sumHours(dayEntries(ts, date));

export function weekTotal(ts, date) {
  const start = toISODate(startOfWeek(parseISODate(date)));
  const end = toISODate(addDays(parseISODate(start), 6));
  return sumHours(ts.entries.filter((e) => e.date >= start && e.date <= end));
}

// Projets actifs, les plus récemment utilisés d'abord (puis par numéro).
export function activeProjects(ts) {
  const lastUse = new Map();
  for (const e of ts.entries) if ((lastUse.get(e.projectId) ?? "") < e.date) lastUse.set(e.projectId, e.date);
  return ts.projects
    .filter((p) => !p.archived)
    .sort((a, b) => (lastUse.get(b.id) ?? "").localeCompare(lastUse.get(a.id) ?? "") || a.number.localeCompare(b.number, undefined, { numeric: true }));
}

// Dernière journée (avant `date`) où des heures ont été notées.
export function previousWorkday(ts, date) {
  return ts.entries.reduce((best, e) => (e.date < date && e.date > (best ?? "") ? e.date : best), null);
}

// Lignes d'une période, triées par date, pour un client (ou tous).
export function periodEntries(ts, from, to, clientId = null) {
  return ts.entries
    .filter((e) => e.date >= from && e.date <= to)
    .filter((e) => !clientId || getProject(ts, e.projectId)?.clientId === clientId)
    .sort((a, b) => a.date.localeCompare(b.date) || projectLabel(getProject(ts, a.projectId)).localeCompare(projectLabel(getProject(ts, b.projectId))));
}

// Résumé d'une période : par projet (heures, taux, montant) et par jour.
export function periodSummary(ts, from, to, clientId = null) {
  const entries = periodEntries(ts, from, to, clientId);
  const byProject = new Map();
  for (const e of entries) {
    const p = getProject(ts, e.projectId);
    const row = byProject.get(e.projectId) ?? { project: p, hours: 0 };
    row.hours = round(row.hours + e.hours);
    byProject.set(e.projectId, row);
  }
  const projects = [...byProject.values()]
    .map((r) => ({ ...r, rate: r.project?.rate ?? null, amount: r.project?.rate != null ? round(r.hours * r.project.rate) : null }))
    .sort((a, b) => (a.project?.number ?? "").localeCompare(b.project?.number ?? "", undefined, { numeric: true }));
  const byDay = new Map();
  for (const e of entries) byDay.set(e.date, round((byDay.get(e.date) ?? 0) + e.hours));
  return {
    entries,
    projects,
    days: [...byDay.entries()].map(([date, hours]) => ({ date, hours })),
    hours: sumHours(entries),
    amount: round(projects.reduce((s, r) => s + (r.amount ?? 0), 0)),
  };
}

// ---- Modifications ------------------------------------------------------------------

export function addEntry(ts, { date, projectId, hours, note = "" }) {
  return { ...ts, entries: [...ts.entries, { id: newId(), date, projectId, hours: round(hours), note: str(note) }] };
}

export const updateEntry = (ts, id, patch) => ({ ...ts, entries: ts.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
export const removeEntry = (ts, id) => ({ ...ts, entries: ts.entries.filter((e) => e.id !== id) });

// Recopier les lignes d'une journée (mêmes projets et heures) sur une autre.
export function copyDay(ts, from, to) {
  return dayEntries(ts, from).reduce((acc, e) => addEntry(acc, { date: to, projectId: e.projectId, hours: e.hours, note: e.note }), ts);
}

export function addProject(ts, { number, name, clientId = null, rate = null }) {
  const project = { id: newId(), number: str(number), name: str(name), clientId, rate: num(rate), archived: false };
  return { ts: { ...ts, projects: [...ts.projects, project] }, project };
}

export const updateProject = (ts, id, patch) => ({ ...ts, projects: ts.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

export function addClient(ts, fields) {
  const client = { id: newId(), name: str(fields.name), contact: str(fields.contact), email: str(fields.email), address: String(fields.address ?? ""), tps: fields.tps !== false, tvq: fields.tvq !== false };
  return { ts: { ...ts, clients: [...ts.clients, client] }, client };
}

export const updateClient = (ts, id, patch) => ({ ...ts, clients: ts.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
