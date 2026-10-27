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

test("facture : lignes par jour, sommaire par projet (rég. / surtemps), TPS et TVQ, échéance", async () => {
  const { invoiceData, invoiceSheets, lineDescription, logoImage } = await import("../js/timesheet/invoice.js");
  const { nextInvoiceNumber, updateBusiness } = await import("../js/timesheet/timesheet.js");
  let { ts, client } = sample();
  ts = updateBusiness(ts, { name: "Mon entreprise inc.", terms: 10, tpsNumber: "123 RT0001", address: "1 rue A\nVille, Qc" });
  const p = ts.projects.find((x) => x.number === "P-200");
  ts = addEntry(ts, { date: "2026-10-20", projectId: p.id, hours: 2, overtime: true, taskCode: "QA", task: "Audit" });
  const options = { from: "2026-10-19", to: "2026-10-25", clientId: client.id, number: "2026-115", date: "2026-10-26", po: "PO-9" };
  const d = invoiceData(ts, options);
  // 15,5 h à 68 $ + 2 h de surtemps à 102 $
  assert.deepEqual(d.totals, { hours: 17.5, subtotal: 1258, advance: 0, due: 1258, tps: 62.9, tvq: 125.49, total: 1446.39, terms: 10, dueDate: "2026-11-05" });
  assert.deepEqual(d.summary.map((r) => [r.project, r.regHours, r.otHours, r.amount]), [["P-100", 2, 0, 136], ["P-200", 13.5, 2, 1122]]);
  assert.equal(d.addressLine, "1 rue A, Ville, Qc");
  assert.equal(d.days[0].weekday, "Lundi / Monday");
  assert.equal(lineDescription({ project: "P-200", taskCode: "QA", description: "Audit", overtime: true }), "P-200  —  QA : Audit  (Surtemps / Overtime)");
  assert.equal(lineDescription({ project: "P-200", taskCode: "", description: "Projet A", overtime: false }), "P-200  —  Projet A");

  const { sheets, styles, totals } = invoiceSheets(ts, options);
  assert.deepEqual(sheets.map((x) => x.name), ["Facture", "Heures", "Frais", "Par projet"]);
  assert.equal(totals.total, 1446.39);
  const [facture, heures, , parProjet] = sheets;
  const cells = facture.rows.flat().filter(Boolean);
  assert.ok(cells.some((c) => c.v === "2026-115") && cells.some((c) => c.v === "PO-9") && cells.some((c) => c.v === "NET10"));
  // Les lignes de la facture se réfèrent à l'onglet « Heures » ; le sommaire à « Par projet »
  assert.ok(cells.some((c) => c.f === "Heures!F2"));
  assert.ok(cells.some((c) => c.f === "'Par projet'!B2" && c.v === 2));
  assert.match(parProjet.rows[2][2].f, /^SUMIFS\(Heures!\$F\$2:\$F\$\d+,Heures!\$C\$2:\$C\$\d+,A3,Heures!\$G\$2:\$G\$\d+,"Surtemps"\)$/);
  assert.equal(heures.rows.length - 4, d.lines.length);
  // TOTAL À PAYER : formule et valeur ; taux de taxes dans « Par projet »
  const pay = facture.rows.find((r) => r[6]?.v === "TOTAL À PAYER (CAD)");
  assert.deepEqual([pay[10].v, pay[10].s], [1446.39, "payValue"]);
  assert.ok(parProjet.rows.some((r) => r[0]?.v === "TPS / GST" && r[1].v === 0.05));
  // Client sans TVQ : taux à 0
  const noTvq = invoiceData({ ...ts, clients: ts.clients.map((c) => ({ ...c, tvq: false })) }, options);
  assert.equal(noTvq.totals.tvq, 0);
  // Logo : image PNG dans la facture
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert.deepEqual(logoImage(png, { width: 300, height: 100 }), { data: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), type: "png", col: 0, row: 0, width: 219, height: 73 });
  assert.equal(logoImage("javascript:alert(1)"), null);
  const withLogo = invoiceSheets(updateBusiness(ts, { logo: png, logoSize: { width: 300, height: 100 } }), options);
  const bytes = buildXlsx({ sheets: withLogo.sheets, styles: withLogo.styles });
  const text = new TextDecoder("latin1").decode(bytes);
  assert.ok(text.includes("xl/media/image1_1.png") && text.includes("xl/drawings/drawing1.xml"));
  assert.ok(buildXlsx({ sheets, styles }).length > 2000);
  assert.equal(nextInvoiceNumber("2026-115"), "2026-116");
});

test("dépenses : devises, kilométrage, frais généraux ; facture et sommaire", async () => {
  const { addExpense, expenseTotal, periodExpenses, removeExpense } = await import("../js/timesheet/expenses.js");
  const { invoiceData, invoiceSheets } = await import("../js/timesheet/invoice.js");
  let { ts, client } = sample();
  const p = ts.projects.find((x) => x.number === "P-200");
  let r = addExpense(ts, { date: "2026-10-20", type: "food", description: "Dinner", projectId: p.id, amount: 2924738, currency: "VND", rate: 0.000053931 });
  ts = r.ts;
  assert.equal(expenseTotal(r.expense), 157.73);
  assert.equal(ts.rates.VND, 0.000053931, "taux retenu");
  ts = addExpense(ts, { date: "2026-10-20", type: "hotel", description: "Hotel Indigo", projectId: p.id, amount: 532.09, currency: "CAD" }).ts;
  ts = addExpense(ts, { date: "2026-10-19", type: "mileage", description: "Aéroport", projectId: p.id, qty: 128, unitPrice: 0.65 }).ts;
  ts = addExpense(ts, { date: "2026-10-21", type: "phone", description: "SIM Card Asia", projectId: p.id, amount: 75, currency: "CAD" }).ts;
  ts = addExpense(ts, { date: "2026-10-25", type: "phone", description: "Cell phone fees", clientId: client.id, amount: 65, currency: "CAD" }).ts;
  // invalides : refusées
  assert.equal(addExpense(ts, { date: "2026-10-20", type: "food", projectId: p.id, amount: 10, currency: "VND" }).expense, null, "sans taux");
  assert.equal(addExpense(ts, { date: "2026-10-20", type: "food", amount: 10 }).expense, null, "sans projet ni client");
  assert.equal(periodExpenses(ts, "2026-10-19", "2026-10-25", client.id).length, 5);
  assert.equal(normalizeTimesheet(ts).expenses.length, 5);

  const options = { from: "2026-10-19", to: "2026-10-25", clientId: client.id, number: "1", date: "2026-10-26" };
  const d = invoiceData(ts, options);
  const p200 = d.summary.find((x) => x.project === "P-200");
  assert.deepEqual(p200.expenses, { hotel: 532.09, food: 157.73, material: 0, phone: 75, transport: 83.2 });
  const general = d.summary.at(-1);
  assert.deepEqual([general.project, general.expenses.phone, general.total], ["Général", 65, 65]);
  // heures 15,5 h × 68 $ = 1054 $ + frais 913,02 $
  assert.equal(d.totals.subtotal, 1967.02);
  assert.equal(d.totals.tps, 98.35);
  // dans la journée : les dépenses avant les heures
  const day = d.days.find((x) => x.date === "2026-10-20");
  assert.deepEqual(day.lines.map((l) => l.kind), ["expense", "expense", "hours"]);
  assert.equal(day.lines[0].text, "P-200  —  Repas / Food : Dinner  (2 924 738 VND @ 0,000053931)");
  const mileage = d.days[0].lines[0];
  assert.deepEqual([mileage.qty, mileage.unit, mileage.unitPrice, mileage.amount], [128, "KM", 0.65, 83.2]);

  const { sheets } = invoiceSheets(ts, options);
  const frais = sheets[2];
  assert.equal(frais.rows.length - 4, 5);
  const fCells = sheets[0].rows.flat().filter(Boolean);
  assert.ok(fCells.some((c) => c.f === "Frais!G2" && c.v === 128));
  const par = sheets[3].rows.find((row) => row[0]?.v === "P-200");
  assert.match(par[4].f, /^SUMIFS\(Frais!\$M\$2:\$M\$6,Frais!\$C\$2:\$C\$6,A\d,Frais!\$D\$2:\$D\$6,"Hôtel"\)$/);
  assert.equal(par[4].v, 532.09);

  ts = removeExpense(ts, ts.expenses[0].id);
  assert.equal(ts.expenses.length, 4);
});

test("modifier une dépense ; codes de tâche affichés ou non sur la facture", async () => {
  const { addExpense, updateExpense, expenseTotal, CURRENCIES } = await import("../js/timesheet/expenses.js");
  const { invoiceData, invoiceSheets } = await import("../js/timesheet/invoice.js");
  const { updateBusiness } = await import("../js/timesheet/timesheet.js");
  assert.ok(["AED", "BRL", "CNY"].every((c) => CURRENCIES.includes(c)));
  let { ts, client } = sample();
  const p = ts.projects.find((x) => x.number === "P-200");
  const r = addExpense(ts, { date: "2026-10-20", type: "food", description: "Lunch", projectId: p.id, amount: 20, currency: "CAD" });
  ts = r.ts;
  // montant et devise
  ts = updateExpense(ts, r.expense.id, { amount: 100, currency: "AED", rate: 0.37 });
  let e = ts.expenses[0];
  assert.deepEqual([e.id, e.amount, e.currency, expenseTotal(e)], [r.expense.id, 100, "AED", 37]);
  // devient du kilométrage, puis frais général, puis autre date
  ts = updateExpense(ts, e.id, { type: "mileage", qty: 50, unitPrice: 0.65 });
  e = ts.expenses[0];
  assert.deepEqual([e.type, e.qty, e.amount, expenseTotal(e)], ["mileage", 50, null, 32.5]);
  ts = updateExpense(ts, e.id, { type: "phone", amount: 65, currency: "CAD", projectId: null, clientId: client.id, date: "2026-10-22" });
  e = ts.expenses[0];
  assert.deepEqual([e.qty, e.projectId, e.clientId, e.date, expenseTotal(e)], [1, null, client.id, "2026-10-22", 65]);
  // une modification invalide ne change rien
  assert.deepEqual(updateExpense(ts, e.id, { amount: -5 }).expenses[0], e);

  ts = addEntry(ts, { date: "2026-10-21", projectId: p.id, hours: 1, taskCode: "QA", task: "Audit" });
  const options = { from: "2026-10-19", to: "2026-10-25", clientId: client.id, number: "1", date: "2026-10-26" };
  const shown = invoiceData(ts, options).lines.find((l) => l.code === "QA");
  assert.equal(shown.text, "P-200  —  QA : Audit");
  const hiddenTs = updateBusiness(ts, { showTaskCodes: false });
  assert.equal(invoiceData(hiddenTs, options).lines.find((l) => l.code === "QA").text, "P-200  —  Audit");
  const { sheets } = invoiceSheets(hiddenTs, options);
  assert.ok(sheets[1].rows.some((row) => row[3]?.v === "QA"), "le code reste dans « Heures »");
  assert.ok(!sheets[0].rows.flat().some((c) => c?.f?.includes("Heures!D")), "la facture n'affiche pas le code");
  assert.equal(normalizeTimesheet(hiddenTs).business.showTaskCodes, false);
});
