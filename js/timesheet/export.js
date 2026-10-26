// Feuille de temps -> classeur Excel :
//   « Heures »      une ligne par période de travail, regroupées par jour avec le total de chaque jour
//   « Par projet »  heures, taux et montant par projet (régulier, puis surtemps), avec le total
// Les textes (titres de colonnes, noms des jours) sont fournis par l'interface,
// dans la langue choisie. Les totaux sont des formules Excel (avec leur valeur).

import { getClient, getProject, periodSummary } from "./timesheet.js";

export function timesheetSheets(ts, { from, to, clientId = null, labels, weekday }) {
  const s = periodSummary(ts, from, to, clientId);
  const client = clientId ? getClient(ts, clientId) : null;
  const title = [{ v: `${labels.title}${client ? ` — ${client.name}` : ""}`, s: "title" }];
  const period = [`${labels.period} : ${from} → ${to}`];

  // ---- Heures, jour par jour ----
  const kind = (overtime) => (overtime ? labels.overtime : labels.regular);
  const rows = [title, period, [], ["date", "day", "number", "project", "type", "client", "hours", "note"].map((k) => ({ v: labels.columns[k], s: "header" }))];
  const dayTotals = [];
  for (const { date } of s.days) {
    const first = rows.length + 1;
    for (const e of s.entries.filter((x) => x.date === date)) {
      const p = getProject(ts, e.projectId);
      rows.push([{ v: date, s: "date" }, weekday(date), p?.number ?? "", p?.name ?? "", kind(e.overtime), getClient(ts, p?.clientId)?.name ?? "", { v: e.hours, s: "hours" }, e.note]);
    }
    const last = rows.length;
    const hours = s.days.find((d) => d.date === date).hours;
    rows.push([null, null, null, null, null, { v: labels.dayTotal, s: "bold" }, { f: `SUM(G${first}:G${last})`, v: hours, s: "hoursBold" }]);
    dayTotals.push(`G${rows.length}`);
    rows.push([]);
  }
  const blank = (n) => Array.from({ length: n }, () => ({ v: "", s: "totalText" }));
  rows.push([{ v: labels.total, s: "totalText" }, ...blank(5), { f: dayTotals.length ? dayTotals.join("+") : "0", v: s.hours, s: "totalHours" }, ...blank(1)]);

  // ---- Par projet ----
  const byProject = [title, period, [], ["number", "project", "type", "client", "hours", "rate", "amount"].map((k) => ({ v: labels.columns[k], s: "header" }))];
  const firstProject = byProject.length + 1;
  for (const r of s.projects) {
    const n = byProject.length + 1;
    byProject.push([
      r.project?.number ?? "", r.project?.name ?? "", kind(r.overtime), getClient(ts, r.project?.clientId)?.name ?? "", { v: r.hours, s: "hours" },
      r.rate != null ? { v: r.rate, s: "money" } : "",
      r.rate != null ? { f: `E${n}*F${n}`, v: r.amount, s: "money" } : "",
    ]);
  }
  const lastProject = byProject.length;
  byProject.push([{ v: labels.total, s: "totalText" }, ...blank(3),
    { f: s.projects.length ? `SUM(E${firstProject}:E${lastProject})` : "0", v: s.hours, s: "totalHours" }, ...blank(1),
    { f: s.projects.length ? `SUM(G${firstProject}:G${lastProject})` : "0", v: s.amount, s: "total" }]);

  return [
    { name: labels.sheetHours, columns: [12, 11, 12, 28, 12, 22, 9, 40], rows, merges: ["A1:H1", "A2:H2"] },
    { name: labels.sheetProjects, columns: [12, 28, 12, 22, 9, 11, 13], rows: byProject, merges: ["A1:G1", "A2:G2"] },
  ];
}
