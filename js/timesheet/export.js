// Feuille de temps -> classeur Excel :
//   « Heures »      une ligne par période de travail, regroupées par jour avec le total de chaque jour
//   « Par projet »  heures, taux et montant par projet, avec le total
// Les textes (titres de colonnes, noms des jours) sont fournis par l'interface,
// dans la langue choisie. Les totaux sont des formules Excel (avec leur valeur).

import { getClient, getProject, periodSummary } from "./timesheet.js";

export function timesheetSheets(ts, { from, to, clientId = null, labels, weekday }) {
  const s = periodSummary(ts, from, to, clientId);
  const client = clientId ? getClient(ts, clientId) : null;
  const title = [{ v: `${labels.title}${client ? ` — ${client.name}` : ""}`, s: "title" }];
  const period = [`${labels.period} : ${from} → ${to}`];

  // ---- Heures, jour par jour ----
  const rows = [title, period, [], ["date", "day", "number", "project", "client", "hours", "note"].map((k) => ({ v: labels.columns[k], s: "header" }))];
  const dayTotals = [];
  for (const { date } of s.days) {
    const first = rows.length + 1;
    for (const e of s.entries.filter((x) => x.date === date)) {
      const p = getProject(ts, e.projectId);
      rows.push([{ v: date, s: "date" }, weekday(date), p?.number ?? "", p?.name ?? "", getClient(ts, p?.clientId)?.name ?? "", { v: e.hours, s: "hours" }, e.note]);
    }
    const last = rows.length;
    const hours = s.days.find((d) => d.date === date).hours;
    rows.push([null, null, null, null, { v: labels.dayTotal, s: "bold" }, { f: `SUM(F${first}:F${last})`, v: hours, s: "hoursBold" }]);
    dayTotals.push(`F${rows.length}`);
    rows.push([]);
  }
  rows.push([{ v: labels.total, s: "totalText" }, { v: "", s: "totalText" }, { v: "", s: "totalText" }, { v: "", s: "totalText" }, { v: "", s: "totalText" },
    { f: dayTotals.length ? dayTotals.join("+") : "0", v: s.hours, s: "totalHours" }, { v: "", s: "totalText" }]);

  // ---- Par projet ----
  const byProject = [title, period, [], ["number", "project", "client", "hours", "rate", "amount"].map((k) => ({ v: labels.columns[k], s: "header" }))];
  const firstProject = byProject.length + 1;
  for (const r of s.projects) {
    const n = byProject.length + 1;
    byProject.push([
      r.project?.number ?? "", r.project?.name ?? "", getClient(ts, r.project?.clientId)?.name ?? "", { v: r.hours, s: "hours" },
      r.rate != null ? { v: r.rate, s: "money" } : "",
      r.rate != null ? { f: `D${n}*E${n}`, v: r.amount, s: "money" } : "",
    ]);
  }
  const lastProject = byProject.length;
  byProject.push([{ v: labels.total, s: "totalText" }, { v: "", s: "totalText" }, { v: "", s: "totalText" },
    { f: s.projects.length ? `SUM(D${firstProject}:D${lastProject})` : "0", v: s.hours, s: "totalHours" }, { v: "", s: "totalText" },
    { f: s.projects.length ? `SUM(F${firstProject}:F${lastProject})` : "0", v: s.amount, s: "total" }]);

  return [
    { name: labels.sheetHours, columns: [12, 11, 12, 28, 22, 9, 40], rows, merges: ["A1:G1", "A2:G2"] },
    { name: labels.sheetProjects, columns: [12, 28, 22, 9, 11, 13], rows: byProject, merges: ["A1:F1", "A2:F2"] },
  ];
}
