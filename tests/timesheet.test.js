import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeProjects, addClient, addEntry, addProject, copyDay, dayTotal, hoursToClock, normalizeTimesheet,
  parseHours, periodSummary, previousWorkday, removeEntry, updateEntry, weekTotal, emptyTimesheet,
} from "../js/timesheet/timesheet.js";
import { migrate, SCHEMA_VERSION } from "../js/data/migrations.js";
import { Repository } from "../js/data/repository.js";
import { MemoryAdapter } from "../js/data/storage/adapters.js";

test("heures : virgule, point, 2:45, 2h45, 45 min", () => {
  assert.equal(parseHours("2,75"), 2.75);
  assert.equal(parseHours("2.5"), 2.5);
  assert.equal(parseHours("2:45"), 2.75);
  assert.equal(parseHours("2h45"), 2.75);
  assert.equal(parseHours("2 h 45"), 2.75);
  assert.equal(parseHours("45 min"), 0.75);
  assert.equal(parseHours("8"), 8);
  assert.equal(parseHours("8h"), 8);
  assert.equal(parseHours("2:75"), null);
  assert.equal(parseHours("abc"), null);
  assert.deepEqual(hoursToClock(2.75), { h: 2, m: 45 });
});

function sample() {
  let ts = emptyTimesheet();
  let r = addClient(ts, { name: "Camfil Power Systems", contact: "C. C.", tps: true, tvq: true });
  ts = r.ts;
  const client = r.client;
  r = addProject(ts, { number: "CA15713", name: "MP Comanche", clientId: client.id, rate: 68 });
  ts = r.ts;
  const a = r.project;
  r = addProject(ts, { number: "CA15624", name: "Audit", clientId: client.id, rate: 68 });
  ts = r.ts;
  const b = r.project;
  r = addProject(ts, { number: "X1", name: "Autre client", rate: 50 });
  ts = r.ts;
  const c = r.project;
  ts = addEntry(ts, { date: "2026-10-19", projectId: a.id, hours: 6 });
  ts = addEntry(ts, { date: "2026-10-19", projectId: b.id, hours: 2, note: "réunion" });
  ts = addEntry(ts, { date: "2026-10-20", projectId: a.id, hours: 7.5 });
  ts = addEntry(ts, { date: "2026-10-21", projectId: c.id, hours: 1 });
  ts = addEntry(ts, { date: "2026-10-27", projectId: a.id, hours: 3 });
  return { ts, client, a, b, c };
}

test("totaux du jour et de la semaine, projets récents d'abord", () => {
  const { ts, a, b, c } = sample();
  assert.equal(dayTotal(ts, "2026-10-19"), 8);
  assert.equal(weekTotal(ts, "2026-10-21"), 16.5, "lundi 19 au dimanche 25");
  assert.deepEqual(activeProjects(ts).map((p) => p.number), ["CA15713", "X1", "CA15624"]);
  assert.equal(previousWorkday(ts, "2026-10-27"), "2026-10-21");
});

test("résumé d'une période et filtre par client ; montants au taux du projet", () => {
  const { ts, client } = sample();
  const all = periodSummary(ts, "2026-10-19", "2026-10-25");
  assert.equal(all.hours, 16.5);
  assert.deepEqual(all.days.map((d) => [d.date, d.hours]), [["2026-10-19", 8], ["2026-10-20", 7.5], ["2026-10-21", 1]]);
  const camfil = periodSummary(ts, "2026-10-01", "2026-10-31", client.id);
  assert.deepEqual(camfil.projects.map((r) => [r.project.number, r.hours, r.amount]), [["CA15624", 2, 136], ["CA15713", 16.5, 1122]]);
  assert.equal(camfil.amount, 1258);
});

test("modifier, retirer, copier une journée", () => {
  let { ts } = sample();
  const first = ts.entries[0];
  ts = updateEntry(ts, first.id, { hours: 5.25 });
  assert.equal(dayTotal(ts, "2026-10-19"), 7.25);
  ts = copyDay(ts, "2026-10-19", "2026-10-28");
  assert.equal(dayTotal(ts, "2026-10-28"), 7.25);
  assert.equal(ts.entries.filter((e) => e.date === "2026-10-28")[1].note, "réunion");
  ts = removeEntry(ts, first.id);
  assert.equal(dayTotal(ts, "2026-10-19"), 2);
});

test("migration v3 -> v4 et dépôt ; données invalides écartées", async () => {
  const doc = migrate({ schemaVersion: 3, items: [], settings: {}, grocery: {} });
  assert.equal(doc.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(doc.timesheet, { clients: [], projects: [], entries: [] });
  const repo = new Repository(new MemoryAdapter(null));
  await repo.init();
  await repo.updateTimesheet(sample().ts);
  assert.equal(repo.timesheet().entries.length, 5);
  assert.match(repo.exportJSON(), /CA15713/);
  const clean = normalizeTimesheet({ entries: [{ date: "x", projectId: "p", hours: 1 }, { date: "2026-10-01", projectId: "p", hours: -2 }], projects: [{ name: "" }] });
  assert.deepEqual([clean.entries.length, clean.projects.length], [0, 0]);
});

import { buildXlsx, colName, crc32, excelDate } from "../js/export/xlsx.js";
import { timesheetSheets } from "../js/timesheet/export.js";

const LABELS = {
  title: "Feuille de temps", period: "Période", dayTotal: "Total du jour", total: "Total", sheetHours: "Heures", sheetProjects: "Par projet",
  columns: { date: "Date", day: "Jour", number: "N° projet", project: "Projet", client: "Client", hours: "Heures", note: "Note", rate: "Taux", amount: "Montant" },
};

test("Excel : zip valide (CRC), colonnes, dates", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.deepEqual([0, 25, 26, 27, 701].map(colName), ["A", "Z", "AA", "AB", "ZZ"]);
  assert.equal(excelDate("2026-10-26"), 46321);
  const bytes = buildXlsx({ sheets: [{ name: "A", rows: [["x", 1]] }] });
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], "signature zip");
});

test("export de la feuille de temps : jours, sous-totaux, projets, formules", () => {
  const { ts, client } = sample();
  const [hours, projects] = timesheetSheets(ts, { from: "2026-10-19", to: "2026-10-25", clientId: client.id, labels: LABELS, weekday: () => "lun." });
  const days = hours.rows.filter((r) => r[4]?.v === "Total du jour").map((r) => [r[5].f, r[5].v]);
  assert.deepEqual(days, [["SUM(F5:F6)", 8], ["SUM(F9:F9)", 7.5]]);
  const total = hours.rows.at(-1);
  assert.deepEqual([total[0].v, total[5].f, total[5].v], ["Total", "F7+F10", 15.5]);
  assert.deepEqual(projects.rows.slice(4, 6).map((r) => [r[0], r[3].v, r[5].f, r[5].v]), [["CA15624", 2, "D5*E5", 136], ["CA15713", 13.5, "D6*E6", 918]]);
  assert.deepEqual([projects.rows.at(-1)[5].f, projects.rows.at(-1)[5].v], ["SUM(F5:F6)", 1054]);
  assert.match(hours.rows[0][0].v, /Camfil/);
  assert.ok(buildXlsx({ sheets: [hours, projects] }).length > 1000);
});

test("rappel : heures pas notées en semaine après 16 h", async () => {
  const { timesheetReminder } = await import("../js/triggers/calendar-triggers.js");
  const ts = { ...emptyTimesheet(), projects: [{ id: "p1", number: "1", name: "A", clientId: null, rate: null, archived: false }] };
  // 2026-10-26 est un lundi.
  assert.equal(timesheetReminder.evaluate({ timesheet: ts, today: "2026-10-26", hour: 17 }).length, 1);
  assert.equal(timesheetReminder.evaluate({ timesheet: ts, today: "2026-10-26", hour: 10 }).length, 0);
  assert.equal(timesheetReminder.evaluate({ timesheet: ts, today: "2026-10-25", hour: 17 }).length, 0);
  const logged = { ...ts, entries: [{ id: "e", date: "2026-10-26", projectId: "p1", hours: 2, note: "" }] };
  assert.equal(timesheetReminder.evaluate({ timesheet: logged, today: "2026-10-26", hour: 17 }).length, 0);
  assert.equal(timesheetReminder.evaluate({ timesheet: emptyTimesheet(), today: "2026-10-26", hour: 17 }).length, 0);
});
