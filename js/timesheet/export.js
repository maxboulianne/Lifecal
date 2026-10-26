// Feuille de temps -> classeur Excel :
//   « Heures »      une ligne par période de travail, regroupées par jour avec le total de chaque jour
//   « Par projet »  heures, taux et montant par projet (régulier, puis surtemps), avec le total
// Les textes (titres de colonnes, noms des jours) sont fournis par l'interface,
// dans la langue choisie. Les totaux sont des formules Excel (avec leur valeur).

import { colName } from "../export/xlsx.js";
import { getClient, getProject, periodSummary } from "./timesheet.js";

const HOURS_COLUMNS = ["date", "day", "number", "project", "type", "taskCode", "task", "client", "hours", "note"];
const HOURS_WIDTHS = [12, 11, 12, 26, 11, 12, 30, 20, 9, 36];
const PROJECT_COLUMNS = ["number", "project", "type", "client", "hours", "rate", "amount"];

// Lettre de la colonne `key` dans une liste de colonnes.
const letter = (columns, key) => colName(columns.indexOf(key));

export function timesheetSheets(ts, { from, to, clientId = null, labels, weekday }) {
  const s = periodSummary(ts, from, to, clientId);
  const client = clientId ? getClient(ts, clientId) : null;
  const title = [{ v: `${labels.title}${client ? ` — ${client.name}` : ""}`, s: "title" }];
  const period = [`${labels.period} : ${from} → ${to}`];
  const kind = (overtime) => (overtime ? labels.overtime : labels.regular);
  const blank = (n) => Array.from({ length: n }, () => ({ v: "", s: "totalText" }));
  const H = letter(HOURS_COLUMNS, "hours");
  const hoursAt = HOURS_COLUMNS.indexOf("hours");

  // ---- Heures, jour par jour ----
  const rows = [title, period, [], HOURS_COLUMNS.map((k) => ({ v: labels.columns[k], s: "header" }))];
  const dayTotals = [];
  for (const { date, hours } of s.days) {
    const first = rows.length + 1;
    for (const e of s.entries.filter((x) => x.date === date)) {
      const p = getProject(ts, e.projectId);
      const cells = {
        date: { v: date, s: "date" }, day: weekday(date), number: p?.number ?? "", project: p?.name ?? "", type: kind(e.overtime),
        taskCode: e.taskCode, task: e.task, client: getClient(ts, p?.clientId)?.name ?? "", hours: { v: e.hours, s: "hours" }, note: e.note,
      };
      rows.push(HOURS_COLUMNS.map((k) => cells[k]));
    }
    const last = rows.length;
    const row = Array(HOURS_COLUMNS.length).fill(null);
    row[hoursAt - 1] = { v: labels.dayTotal, s: "bold" };
    row[hoursAt] = { f: `SUM(${H}${first}:${H}${last})`, v: hours, s: "hoursBold" };
    rows.push(row);
    dayTotals.push(`${H}${rows.length}`);
    rows.push([]);
  }
  rows.push([{ v: labels.total, s: "totalText" }, ...blank(hoursAt - 1),
    { f: dayTotals.length ? dayTotals.join("+") : "0", v: s.hours, s: "totalHours" }, ...blank(HOURS_COLUMNS.length - hoursAt - 1)]);

  // ---- Par projet ----
  const [PH, PR, PA] = ["hours", "rate", "amount"].map((k) => letter(PROJECT_COLUMNS, k));
  const byProject = [title, period, [], PROJECT_COLUMNS.map((k) => ({ v: labels.columns[k], s: "header" }))];
  const firstProject = byProject.length + 1;
  for (const r of s.projects) {
    const n = byProject.length + 1;
    byProject.push([
      r.project?.number ?? "", r.project?.name ?? "", kind(r.overtime), getClient(ts, r.project?.clientId)?.name ?? "", { v: r.hours, s: "hours" },
      r.rate != null ? { v: r.rate, s: "money" } : "",
      r.rate != null ? { f: `${PH}${n}*${PR}${n}`, v: r.amount, s: "money" } : "",
    ]);
  }
  const lastProject = byProject.length;
  byProject.push([{ v: labels.total, s: "totalText" }, ...blank(3),
    { f: s.projects.length ? `SUM(${PH}${firstProject}:${PH}${lastProject})` : "0", v: s.hours, s: "totalHours" }, ...blank(1),
    { f: s.projects.length ? `SUM(${PA}${firstProject}:${PA}${lastProject})` : "0", v: s.amount, s: "total" }]);

  const lastHoursCol = colName(HOURS_COLUMNS.length - 1);
  const lastProjectCol = colName(PROJECT_COLUMNS.length - 1);
  return [
    { name: labels.sheetHours, columns: HOURS_WIDTHS, rows, merges: [`A1:${lastHoursCol}1`, `A2:${lastHoursCol}2`] },
    { name: labels.sheetProjects, columns: [12, 28, 12, 22, 9, 11, 13], rows: byProject, merges: [`A1:${lastProjectCol}1`, `A2:${lastProjectCol}2`] },
  ];
}
