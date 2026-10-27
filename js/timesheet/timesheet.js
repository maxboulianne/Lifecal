// Feuille de temps : clients, projets et heures travaillées chaque jour.
//
// Rangée dans doc.timesheet :
//   clients   [{ id, name, contact, email, address, po, tps, tvq }]   tps / tvq : taxes facturées ; po : no PO du client
//   projects  [{ id, number, name, clientId, rate, overtimeRate, archived }]
//             rate : taux horaire régulier ($) ; overtimeRate : taux du surtemps
//             (vide : 1,5 × le taux régulier)
//   entries   [{ id, date, projectId, hours, overtime, taskCode, task, note }]
//             une ligne d'heures d'une journée ; taskCode / task : code et description de la tâche
//   expenses, rates : les dépenses à refacturer (voir expenses.js)
//   business  { name, contact, address, phone, email, tpsNumber, tvqNumber, terms, nextInvoice, mileageRate, logo, logoSize }
//             mon entreprise, pour la facture (terms : jours pour payer, ex. 10 = NET10 ;
//             logo : image PNG ou JPEG en data URL, logoSize : { width, height } en pixels)
// Fonctions pures : elles retournent toujours de nouvelles valeurs.

import { addDays, parseISODate, startOfWeek, toISODate } from "../core/dates.js";
import { newId } from "../data/item.js";
import { DEFAULT_MILEAGE_RATE, normalizeExpenses, normalizeRates } from "./expenses.js";

export const TPS_RATE = 0.05;
export const TVQ_RATE = 0.09975;
export const OVERTIME_FACTOR = 1.5;

export const BUSINESS_FIELDS = ["name", "contact", "address", "phone", "email", "tpsNumber", "tvqNumber", "terms", "nextInvoice"];
export const DEFAULT_TERMS = 10;

export function emptyBusiness() {
  return { name: "", contact: "", address: "", phone: "", email: "", tpsNumber: "", tvqNumber: "", terms: DEFAULT_TERMS, nextInvoice: "", mileageRate: DEFAULT_MILEAGE_RATE, logo: "", logoSize: null };
}

export function emptyTimesheet() {
  return { clients: [], projects: [], entries: [], expenses: [], rates: {}, business: emptyBusiness() };
}

const str = (v) => String(v ?? "").trim();
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Un taux : un nombre plus grand que 0, sinon « pas de taux ».
const rateOrNull = (v) => (num(v) !== null && num(v) > 0 && v !== "" ? num(v) : null);

// Logo : une image PNG ou JPEG en data URL (taille raisonnable), avec ses dimensions.
export const LOGO_MAX_LENGTH = 400_000;
function validLogo(b) {
  const ok = typeof b.logo === "string" && /^data:image\/(png|jpeg);base64,/.test(b.logo) && b.logo.length <= LOGO_MAX_LENGTH;
  const w = num(b.logoSize?.width);
  const h = num(b.logoSize?.height);
  return { logo: ok ? b.logo : "", logoSize: ok && w > 0 && h > 0 ? { width: w, height: h } : null };
}

export function normalizeTimesheet(raw) {
  const ts = raw && typeof raw === "object" ? raw : {};
  const clients = (Array.isArray(ts.clients) ? ts.clients : []).filter((c) => c && str(c.name)).map((c) => ({
    id: c.id ?? newId(), name: str(c.name), contact: str(c.contact), email: str(c.email), address: String(c.address ?? ""), po: str(c.po),
    tps: c.tps !== false, tvq: c.tvq !== false,
  }));
  const projects = (Array.isArray(ts.projects) ? ts.projects : []).filter((p) => p && (str(p.number) || str(p.name))).map((p) => ({
    id: p.id ?? newId(), number: str(p.number), name: str(p.name), clientId: p.clientId ?? null,
    rate: rateOrNull(p.rate), overtimeRate: rateOrNull(p.overtimeRate), archived: Boolean(p.archived),
  }));
  const entries = (Array.isArray(ts.entries) ? ts.entries : [])
    .filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.projectId && num(e.hours) !== null && num(e.hours) >= 0)
    .map((e) => ({
      id: e.id ?? newId(), date: e.date, projectId: e.projectId, hours: num(e.hours), overtime: Boolean(e.overtime),
      taskCode: str(e.taskCode), task: str(e.task), note: str(e.note),
    }));
  const b = ts.business && typeof ts.business === "object" ? ts.business : {};
  const terms = num(b.terms);
  const business = {
    ...emptyBusiness(),
    mileageRate: rateOrNull(b.mileageRate) ?? DEFAULT_MILEAGE_RATE,
    ...Object.fromEntries(BUSINESS_FIELDS.filter((k) => k !== "terms").map((k) => [k, k === "address" ? String(b[k] ?? "").trim() : str(b[k])])),
    terms: terms !== null && terms >= 0 && b.terms !== "" ? Math.round(terms) : DEFAULT_TERMS,
    ...validLogo(b),
  };
  const known = new Set(projects.map((p) => p.id));
  const clientIds = new Set(clients.map((c) => c.id));
  const expenses = normalizeExpenses(ts.expenses).filter((e) => (e.projectId ? known.has(e.projectId) : clientIds.has(e.clientId)));
  return { clients, projects, entries, expenses, rates: normalizeRates(ts.rates), business };
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
// Taux appliqué à une ligne : régulier, ou surtemps (1,5 × le régulier si non précisé).
export function rateFor(project, overtime = false) {
  if (!project) return null;
  if (!overtime) return project.rate ?? null;
  if (project.overtimeRate != null) return project.overtimeRate;
  return project.rate != null ? round(project.rate * OVERTIME_FACTOR) : null;
}

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

// Résumé d'une période : par projet et par type d'heures (régulières, puis
// surtemps : heures, taux, montant) et par jour.
export function periodSummary(ts, from, to, clientId = null) {
  const entries = periodEntries(ts, from, to, clientId);
  const byProject = new Map();
  for (const e of entries) {
    const key = `${e.projectId}|${e.overtime ? 1 : 0}`;
    const row = byProject.get(key) ?? { project: getProject(ts, e.projectId), overtime: Boolean(e.overtime), hours: 0 };
    row.hours = round(row.hours + e.hours);
    byProject.set(key, row);
  }
  const projects = [...byProject.values()]
    .map((r) => {
      const rate = rateFor(r.project, r.overtime);
      return { ...r, rate, amount: rate != null ? round(r.hours * rate) : null };
    })
    .sort((a, b) => (a.project?.number ?? "").localeCompare(b.project?.number ?? "", undefined, { numeric: true })
      || (a.project?.name ?? "").localeCompare(b.project?.name ?? "") || Number(a.overtime) - Number(b.overtime));
  const byDay = new Map();
  for (const e of entries) byDay.set(e.date, round((byDay.get(e.date) ?? 0) + e.hours));
  return {
    entries,
    projects,
    days: [...byDay.entries()].map(([date, hours]) => ({ date, hours })),
    hours: sumHours(entries),
    overtimeHours: sumHours(entries.filter((e) => e.overtime)),
    amount: round(projects.reduce((s, r) => s + (r.amount ?? 0), 0)),
  };
}

// ---- Modifications ------------------------------------------------------------------

export function addEntry(ts, { date, projectId, hours, overtime = false, taskCode = "", task = "", note = "" }) {
  const entry = { id: newId(), date, projectId, hours: round(hours), overtime: Boolean(overtime), taskCode: str(taskCode), task: str(task), note: str(note) };
  return { ...ts, entries: [...ts.entries, entry] };
}

export const updateEntry = (ts, id, patch) => ({ ...ts, entries: ts.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
export const removeEntry = (ts, id) => ({ ...ts, entries: ts.entries.filter((e) => e.id !== id) });

// Recopier les lignes d'une journée (mêmes projets et heures) sur une autre.
export function copyDay(ts, from, to) {
  return dayEntries(ts, from).reduce((acc, e) => addEntry(acc, { ...e, date: to }), ts);
}

export function addProject(ts, { number, name, clientId = null, rate = null, overtimeRate = null }) {
  const project = { id: newId(), number: str(number), name: str(name), clientId, rate: rateOrNull(rate), overtimeRate: rateOrNull(overtimeRate), archived: false };
  return { ts: { ...ts, projects: [...ts.projects, project] }, project };
}

export const updateProject = (ts, id, patch) => ({ ...ts, projects: ts.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

// Tâches déjà utilisées (code -> description la plus récente), pour les proposer.
export function knownTasks(ts) {
  const tasks = new Map();
  for (const e of [...ts.entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.taskCode || e.task) tasks.set(e.taskCode || e.task, { code: e.taskCode, task: e.task });
  }
  return [...tasks.values()].sort((a, b) => (a.code || a.task).localeCompare(b.code || b.task, undefined, { numeric: true }));
}

// Dernière tâche notée sur un projet (pour la proposer à nouveau).
export function lastTask(ts, projectId) {
  const last = ts.entries.filter((e) => e.projectId === projectId && (e.taskCode || e.task)).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return { code: last?.taskCode ?? "", task: last?.task ?? "" };
}

export const updateBusiness = (ts, patch) => ({ ...ts, business: { ...ts.business, ...patch } });

// « 2026-115 » -> « 2026-116 » ; « F009 » -> « F010 » ; sans chiffre : inchangé.
export function nextInvoiceNumber(number) {
  const m = String(number ?? "").match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return String(number ?? "");
  const n = String(Number(m[2]) + 1).padStart(m[2].length, "0");
  return `${m[1]}${n}${m[3]}`;
}

// Supprimer un projet efface aussi ses heures.
export const deleteProject = (ts, id) => ({
  ...ts,
  projects: ts.projects.filter((p) => p.id !== id),
  entries: ts.entries.filter((e) => e.projectId !== id),
  expenses: ts.expenses.filter((e) => e.projectId !== id),
});
export const projectEntryCount = (ts, id) => ts.entries.filter((e) => e.projectId === id).length + ts.expenses.filter((e) => e.projectId === id).length;

// Supprimer un client garde ses projets (sans client) ; ses frais généraux sont effacés.
export const deleteClient = (ts, id) => ({
  ...ts,
  clients: ts.clients.filter((c) => c.id !== id),
  projects: ts.projects.map((p) => (p.clientId === id ? { ...p, clientId: null } : p)),
  expenses: ts.expenses.filter((e) => e.clientId !== id),
});

export function addClient(ts, fields) {
  const client = { id: newId(), name: str(fields.name), contact: str(fields.contact), email: str(fields.email), address: String(fields.address ?? ""), tps: fields.tps !== false, tvq: fields.tvq !== false };
  return { ts: { ...ts, clients: [...ts.clients, client] }, client };
}

export const updateClient = (ts, id, patch) => ({ ...ts, clients: ts.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
