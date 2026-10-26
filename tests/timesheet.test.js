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
  let r = addClient(ts, { name: "Entreprise ABC", contact: "J. Dupont", tps: true, tvq: true });
  ts = r.ts;
  const client = r.client;
  r = addProject(ts, { number: "P-200", name: "Projet A", clientId: client.id, rate: 68 });
  ts = r.ts;
  const a = r.project;
  r = addProject(ts, { number: "P-100", name: "Audit", clientId: client.id, rate: 68 });
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
  assert.deepEqual(activeProjects(ts).map((p) => p.number), ["P-200", "X1", "P-100"]);
  assert.equal(previousWorkday(ts, "2026-10-27"), "2026-10-21");
});

test("résumé d'une période et filtre par client ; montants au taux du projet", () => {
  const { ts, client } = sample();
  const all = periodSummary(ts, "2026-10-19", "2026-10-25");
  assert.equal(all.hours, 16.5);
  assert.deepEqual(all.days.map((d) => [d.date, d.hours]), [["2026-10-19", 8], ["2026-10-20", 7.5], ["2026-10-21", 1]]);
  const abc = periodSummary(ts, "2026-10-01", "2026-10-31", client.id);
  assert.deepEqual(abc.projects.map((r) => [r.project.number, r.hours, r.amount]), [["P-100", 2, 136], ["P-200", 16.5, 1122]]);
  assert.equal(abc.amount, 1258);
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
  assert.deepEqual(doc.timesheet, emptyTimesheet());
  const repo = new Repository(new MemoryAdapter(null));
  await repo.init();
  await repo.updateTimesheet(sample().ts);
  assert.equal(repo.timesheet().entries.length, 5);
  assert.match(repo.exportJSON(), /P-200/);
  const clean = normalizeTimesheet({ entries: [{ date: "x", projectId: "p", hours: 1 }, { date: "2026-10-01", projectId: "p", hours: -2 }], projects: [{ name: "" }] });
  assert.deepEqual([clean.entries.length, clean.projects.length], [0, 0]);
});

import { buildXlsx, colName, crc32, excelDate } from "../js/export/xlsx.js";
import { timesheetSheets } from "../js/timesheet/export.js";

const LABELS = {
  title: "Feuille de temps", period: "Période", regular: "Régulier", overtime: "Surtemps", dayTotal: "Total du jour", total: "Total", sheetHours: "Heures", sheetProjects: "Par projet",
  columns: { date: "Date", day: "Jour", number: "N° projet", project: "Projet", type: "Type", taskCode: "Code", task: "Tâche", client: "Client", hours: "Heures", note: "Note", rate: "Taux", amount: "Montant" },
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
  const days = hours.rows.filter((r) => r[7]?.v === "Total du jour").map((r) => [r[8].f, r[8].v]);
  assert.deepEqual(days, [["SUM(I5:I6)", 8], ["SUM(I9:I9)", 7.5]]);
  const total = hours.rows.at(-1);
  assert.deepEqual([total[0].v, total[8].f, total[8].v], ["Total", "I7+I10", 15.5]);
  assert.deepEqual(projects.rows.slice(4, 6).map((r) => [r[0], r[2], r[4].v, r[6].f, r[6].v]), [["P-100", "Régulier", 2, "E5*F5", 136], ["P-200", "Régulier", 13.5, "E6*F6", 918]]);
  assert.deepEqual([projects.rows.at(-1)[6].f, projects.rows.at(-1)[6].v], ["SUM(G5:G6)", 1054]);
  assert.match(hours.rows[0][0].v, /ABC/);
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

test("surtemps : taux distinct (ou 1,5 × le régulier), lignes séparées", async () => {
  const { rateFor, deleteProject, deleteClient, updateProject } = await import("../js/timesheet/timesheet.js");
  let { ts, client } = sample();
  const p = ts.projects.find((x) => x.number === "P-200");
  assert.equal(rateFor(p, true), 102);
  ts = addEntry(ts, { date: "2026-10-20", projectId: p.id, hours: 2, overtime: true });
  let s = periodSummary(ts, "2026-10-19", "2026-10-25");
  assert.deepEqual(s.projects.filter((r) => r.project.id === p.id).map((r) => [r.overtime, r.hours, r.rate, r.amount]), [[false, 13.5, 68, 918], [true, 2, 102, 204]]);
  assert.equal(s.overtimeHours, 2);
  ts = updateProject(ts, p.id, { overtimeRate: 95 });
  s = periodSummary(ts, "2026-10-19", "2026-10-25");
  assert.equal(s.projects.find((r) => r.overtime).amount, 190);
  const [hours, projects] = timesheetSheets(ts, { from: "2026-10-19", to: "2026-10-25", labels: LABELS, weekday: () => "mar." });
  assert.ok(hours.rows.some((r) => r[4] === "Surtemps"));
  assert.deepEqual(projects.rows.find((r) => r[2] === "Surtemps").slice(4).map((c) => c.v), [2, 95, 190]);
  // copier une journée garde le surtemps ; normaliser aussi
  assert.ok(copyDay(ts, "2026-10-20", "2026-10-30").entries.some((e) => e.date === "2026-10-30" && e.overtime));
  assert.equal(normalizeTimesheet(ts).entries.filter((e) => e.overtime).length, 1);
  // supprimer
  const without = deleteProject(ts, p.id);
  assert.ok(!without.projects.some((x) => x.id === p.id) && !without.entries.some((e) => e.projectId === p.id));
  const noClient = deleteClient(ts, client.id);
  assert.equal(noClient.clients.length, 0);
  assert.ok(noClient.projects.every((x) => x.clientId === null));
  assert.equal(normalizeTimesheet({ projects: [{ number: "1", rate: 0 }] }).projects[0].rate, null);
});

test("tâches : code et description, proposées à nouveau", async () => {
  const { knownTasks, lastTask } = await import("../js/timesheet/timesheet.js");
  let { ts } = sample();
  const p = ts.projects[0];
  ts = addEntry(ts, { date: "2026-10-20", projectId: p.id, hours: 1, taskCode: "QA-01", task: "Audit fournisseur" });
  ts = addEntry(ts, { date: "2026-10-21", projectId: p.id, hours: 1, taskCode: "QA-02", task: "Rapport" });
  assert.deepEqual(lastTask(ts, p.id), { code: "QA-02", task: "Rapport" });
  assert.deepEqual(knownTasks(ts).map((x) => x.code), ["QA-01", "QA-02"]);
  assert.equal(normalizeTimesheet(ts).entries.find((e) => e.taskCode === "QA-01").task, "Audit fournisseur");
  assert.ok(copyDay(ts, "2026-10-21", "2026-10-22").entries.some((e) => e.date === "2026-10-22" && e.taskCode === "QA-02"));
  const [hours] = timesheetSheets(ts, { from: "2026-10-20", to: "2026-10-21", labels: LABELS, weekday: () => "" });
  assert.ok(hours.rows.some((r) => r[5] === "QA-01" && r[6] === "Audit fournisseur"));
});

test("facture : lignes par jour, sommaire par projet, TPS et TVQ, échéance", async () => {
  const { invoiceSheet, lineDescription } = await import("../js/timesheet/invoice.js");
  const { nextInvoiceNumber, updateBusiness } = await import("../js/timesheet/timesheet.js");
  let { ts, client } = sample();
  ts = updateBusiness(ts, { name: "Mon entreprise inc.", terms: 10, tpsNumber: "123 RT0001" });
  const p = ts.projects.find((x) => x.number === "P-200");
  ts = addEntry(ts, { date: "2026-10-20", projectId: p.id, hours: 2, overtime: true, taskCode: "QA", task: "Audit" });
  const { sheet, totals } = invoiceSheet(ts, { from: "2026-10-19", to: "2026-10-25", clientId: client.id, number: "2026-115", date: "2026-10-26", po: "PO-9" });
  // 15,5 h à 68 $ + 2 h de surtemps à 102 $
  assert.deepEqual(totals, { hours: 17.5, subtotal: 1258, due: 1258, tps: 62.9, tvq: 125.49, total: 1446.39, dueDate: "2026-11-05" });
  const cells = sheet.rows.flat().filter(Boolean);
  const find = (v) => cells.find((c) => c.v === v || c === v);
  assert.ok(find("2026-115") && find("PO-9") && find("Mon entreprise inc.") && find("NET10"));
  assert.ok(cells.some((c) => typeof c === "string" && c === "P-200 — QA : Audit — Surtemps / Overtime"));
  // une ligne de sommaire par projet du client (+ surtemps), avec SOMME.SI sur la clé cachée
  const summary = sheet.rows.filter((r) => typeof r[0]?.v === "string" && /^P-\d/.test(r[0].v));
  assert.deepEqual(summary.map((r) => [r[0].v, r[2].v, r[4].v]), [["P-100", 2, 136], ["P-200", 13.5, 918], ["P-200 OT", 2, 204]]);
  assert.match(summary[0][2].f, /^SUMIF\(\$L\$\d+:\$L\$\d+,"[^"]+\|R",\$A\$\d+:\$A\$\d+\)$/);
  assert.equal(sheet.columns.at(-1).hidden, true);
  // client sans TVQ
  const noTvq = invoiceSheet({ ...ts, clients: ts.clients.map((c) => ({ ...c, tvq: false })) }, { from: "2026-10-19", to: "2026-10-25", clientId: client.id, number: "1", date: "2026-10-26" });
  assert.equal(noTvq.totals.tvq, 0);
  assert.equal(lineDescription(p, { overtime: false }), "P-200 — Projet A");
  assert.equal(nextInvoiceNumber("2026-115"), "2026-116");
  assert.ok(buildXlsx({ sheets: [sheet] }).length > 1000);
});
