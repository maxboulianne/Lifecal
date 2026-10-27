// Facture Excel, sur le modèle de facture de Max (en-tête bilingue, lignes jour
// par jour, sommaire des heures par projet, TPS / TVQ, montant à payer, termes).
//
// Une ligne par période de travail : Qté (heures), U/M « HR », prix unitaire
// (taux), description (projet, tâche) et prix total (formule). Une colonne
// cachée (L) porte la clé projet|type de chaque ligne : le sommaire l'additionne
// avec SOMME.SI, il reste donc juste si on corrige des heures dans Excel.
// Les colonnes de dépenses (hôtel, repas…) sont prêtes pour l'étape des dépenses.

import { addDays, parseISODate, toISODate } from "../core/dates.js";
import { colName } from "../export/xlsx.js";
import { getClient, getProject, periodEntries, rateFor, TPS_RATE, TVQ_RATE } from "./timesheet.js";

export const EXPENSE_CATEGORIES = ["hotel", "food", "material", "phone", "transport"];

export const INVOICE_LABELS = {
  title: "FACTURE",
  invoice: "FACTURATION / INVOICE",
  date: "DATE DE FACTURATION / INVOICE DATE",
  po: "NO PO CLIENT / CLIENT PO",
  address: "Adresse / Address :",
  phone: "Tél. / Phone :",
  billedTo: "FACTURÉ À / BILLED TO",
  shippedTo: "EXPÉDIÉ À / SHIPPED TO",
  qty: "Qté / Qty",
  unit: "U/M",
  unitPrice: "Prix unit. / Unit price",
  description: "Description",
  totalPrice: "Prix total / Total price",
  overtime: "Surtemps / Overtime",
  summary: "SOMMAIRE DES HEURES / HRS TOTALS FOR THIS INVOICE",
  project: "Projet / Project",
  hours: "Heures / Hours",
  rate: "Taux / Rate",
  hoursAmount: "Heures $ / Hours $",
  hotel: "Hôtel / Hotel",
  food: "Repas / Food",
  material: "Matériel / Material",
  phoneCat: "Cell. / Phone",
  transport: "Transport",
  totals: "TOTAL",
  subtotal: "SOUS-TOTAL / SUB-TOTAL",
  advance: "ACOMPTE / ADVANCE PAYMENT",
  due: "MONTANT DÛ / AMOUNT DUE",
  tps: "TPS / GST (5 %)",
  tvq: "TVQ / QST (9,975 %)",
  freight: "TRANSPORT / FREIGHT",
  included: "INCLUS",
  pay: "PAYER CE MONTANT / AMOUNT TO PAY (CAD)",
  terms: "TERMES / TERMS",
  dueDate: "DATE D'ÉCHÉANCE / DUE DATE",
  requests: "ENVOYEZ VOS DEMANDES À / SEND YOUR REQUESTS TO :",
  cheque: "FAIRE VOTRE CHÈQUE PAYABLE À / MAKE YOUR CHEQUE PAYABLE TO :",
  attn: "Attn : COMPTES À RECEVOIR / ACCOUNTS RECEIVABLE",
  tpsNumber: "No TPS / GST #",
  tvqNumber: "No TVQ / QST #",
  thanks: "MERCI DE FAIRE AFFAIRE AVEC NOUS! / WE APPRECIATE YOUR BUSINESS!",
};
const L = INVOICE_LABELS;
export const CATEGORY_LABELS = { hotel: L.hotel, food: L.food, material: L.material, phone: L.phoneCat, transport: L.transport };

const WIDTH = 12; // colonnes A à L (L : clé cachée)
const WEEKDAY = new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "UTC" });
const weekdayEn = (iso) => WEEKDAY.format(new Date(`${iso}T12:00:00Z`));
const round2 = (n) => Math.round(n * 100) / 100;
const textLines = (text) => String(text ?? "").split(/\n/).map((s) => s.trim()).filter(Boolean);
const keyOf = (projectId, overtime) => `${projectId}|${overtime ? "S" : "R"}`;

// Ligne d'adresse et de téléphone sous le nom de l'entreprise ; numéros de taxes.
export const businessLine = (d) => [d.addressLines.length ? `${L.address} ${d.addressLines.join(", ")}` : "", d.business.phone ? `${L.phone} ${d.business.phone}` : ""]
  .filter(Boolean).join("   ");
export const taxNumbersLine = (b) => [b.tpsNumber ? `${L.tpsNumber} : ${b.tpsNumber}` : "", b.tvqNumber ? `${L.tvqNumber} : ${b.tvqNumber}` : ""]
  .filter(Boolean).join("      ");

export const dueDate = (date, terms) => toISODate(addDays(parseISODate(date), Number(terms) || 0));

// Description d'une ligne : projet, tâche (code : description), surtemps.
export function lineDescription(project, entry) {
  const task = [entry.taskCode, entry.task].filter(Boolean).join(" : ");
  const head = project?.number || project?.name || "?";
  const detail = task || (project?.number ? project.name : "");
  return [head, detail, entry.overtime ? L.overtime : ""].filter(Boolean).join(" — ");
}

// Projets du sommaire : ceux du client encore actifs, plus tout projet facturé
// dans la période ; régulier, puis surtemps s'il y en a.
function summaryRows(ts, entries, clientId) {
  const used = new Set(entries.map((e) => keyOf(e.projectId, e.overtime)));
  const projects = ts.projects
    .filter((p) => (p.clientId === clientId && !p.archived) || used.has(keyOf(p.id, false)) || used.has(keyOf(p.id, true)))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }) || a.name.localeCompare(b.name));
  return projects.flatMap((p) => [
    { project: p, overtime: false },
    ...(used.has(keyOf(p.id, true)) ? [{ project: p, overtime: true }] : []),
  ]);
}

// Contenu de la facture (lignes, sommaire, totaux), commun au fichier Excel
// et à l'aperçu dans l'application.
export function invoiceData(ts, { from, to, clientId, number, date, po = "" }) {
  const client = getClient(ts, clientId);
  const business = ts.business;
  const entries = periodEntries(ts, from, to, clientId);
  const byKey = new Map();
  const days = [...new Set(entries.map((e) => e.date))].map((day) => ({
    date: day,
    weekday: weekdayEn(day),
    lines: entries.filter((x) => x.date === day).map((e) => {
      const p = getProject(ts, e.projectId);
      const rate = rateFor(p, e.overtime);
      const amount = round2(e.hours * (rate ?? 0));
      const key = keyOf(e.projectId, e.overtime);
      const sum = byKey.get(key) ?? { hours: 0, amount: 0 };
      byKey.set(key, { hours: round2(sum.hours + e.hours), amount: round2(sum.amount + amount) });
      return { hours: e.hours, unit: "HR", rate, description: lineDescription(p, e), amount, key };
    }),
  }));
  const noExpenses = () => Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0]));
  const summary = summaryRows(ts, entries, clientId).map(({ project, overtime }) => {
    const key = keyOf(project.id, overtime);
    const sum = byKey.get(key) ?? { hours: 0, amount: 0 };
    // Comme sur le modèle : le numéro du projet (ou son nom), « OT » pour le surtemps.
    return {
      key, label: `${project.number || project.name}${overtime ? " OT" : ""}`, hours: sum.hours, rate: rateFor(project, overtime),
      amount: sum.amount, expenses: noExpenses(), total: sum.amount,
    };
  });
  const subtotal = round2(summary.reduce((s, r) => s + r.total, 0));
  const advance = 0;
  const due = round2(subtotal - advance);
  const chargesTps = client?.tps !== false;
  const chargesTvq = client?.tvq !== false;
  const tps = chargesTps ? round2(due * TPS_RATE) : 0;
  const tvq = chargesTvq ? round2(due * TVQ_RATE) : 0;
  return {
    business, client, number, date, po, chargesTps, chargesTvq,
    addressLines: textLines(business.address),
    clientLines: [client?.contact, client?.name, ...textLines(client?.address), client?.email].filter(Boolean),
    days,
    summary,
    summaryTotals: { hours: round2(summary.reduce((s, r) => s + r.hours, 0)), amount: subtotal, expenses: noExpenses(), total: subtotal },
    totals: { hours: round2(summary.reduce((s, r) => s + r.hours, 0)), subtotal, advance, due, tps, tvq, total: round2(due + tps + tvq), terms: business.terms, dueDate: dueDate(date, business.terms) },
  };
}

export function invoiceSheet(ts, options) {
  const d = invoiceData(ts, options);
  const { business: b, number, date, po } = d;
  const rows = [];
  const merges = [];
  const row = () => {
    const r = Array(WIDTH).fill(null);
    rows.push(r);
    return r;
  };
  const at = () => rows.length; // numéro (Excel) de la dernière ligne ajoutée
  const merge = (from, to) => merges.push(`${from}${at()}:${to}${at()}`);

  // ---- En-tête ----
  let r = row();
  r[0] = { v: L.title, s: "title" };
  r[6] = { v: L.invoice, s: "labelBox" }; merge("G", "J");
  r[10] = { v: number, s: "boxBoldRight" };
  r = row();
  r[0] = { v: b.name, s: "big" };
  r[6] = { v: L.date, s: "labelBox" }; merge("G", "J");
  r[10] = { v: date, s: "dateBox" };
  r = row();
  r[0] = { v: businessLine(d), s: "small" };
  r[6] = { v: L.po, s: "labelBox" }; merge("G", "J");
  r[10] = { v: po, s: "boxRight" };
  if (b.email) row()[0] = { v: b.email, s: "small" };
  row();

  // ---- Facturé à / Expédié à ----
  r = row();
  r[0] = { v: L.billedTo, s: "smallBold" };
  r[6] = { v: L.shippedTo, s: "smallBold" };
  for (const line of d.clientLines) {
    r = row();
    r[0] = line;
    r[6] = line;
  }
  row();

  // ---- Lignes, jour par jour ----
  r = row();
  [L.qty, L.unit, L.unitPrice, L.description, null, null, null, null, null, null, L.totalPrice]
    .forEach((v, i) => { r[i] = { v: v ?? "", s: "headerCenter" }; });
  merge("D", "J");
  const firstLine = at() + 1;
  for (const day of d.days) {
    r = row();
    r[3] = { v: day.date, s: "dateBold" };
    r[4] = { v: day.weekday, s: "bold" };
    for (const line of day.lines) {
      r = row();
      r[0] = { v: line.hours, s: "hours" };
      r[1] = { v: line.unit, s: "center" };
      r[2] = line.rate != null ? { v: line.rate, s: "money" } : "";
      r[3] = line.description;
      merge("D", "J");
      r[10] = { f: `A${at()}*C${at()}`, v: line.amount, s: "money" };
      r[11] = line.key;
    }
    row();
  }
  const lastLine = Math.max(firstLine, at());

  // ---- Sommaire des heures par projet ----
  r = row();
  r[0] = { v: L.summary, s: "bold" };
  merge("A", "K");
  r = row();
  [L.project, null, L.hours, L.rate, L.hoursAmount, ...EXPENSE_CATEGORIES.map((c) => CATEGORY_LABELS[c]), L.totals]
    .forEach((v, i) => { r[i] = { v: v ?? "", s: "headerCenter" }; });
  merge("A", "B");
  const firstSummary = at() + 1;
  const range = (col) => `$${col}$${firstLine}:$${col}$${lastLine}`;
  for (const line of d.summary) {
    r = row();
    r[0] = { v: line.label, s: "box" };
    r[1] = { v: "", s: "box" };
    merge("A", "B");
    r[2] = { f: `SUMIF(${range("L")},"${line.key}",${range("A")})`, v: line.hours, s: "boxHours" };
    r[3] = line.rate != null ? { v: line.rate, s: "boxMoney" } : { v: "", s: "box" };
    r[4] = { f: `SUMIF(${range("L")},"${line.key}",${range("K")})`, v: line.amount, s: "boxMoney" };
    EXPENSE_CATEGORIES.forEach((c, i) => { r[5 + i] = { v: line.expenses[c], s: "boxMoney" }; });
    r[10] = { f: `SUM(E${at()}:J${at()})`, v: line.total, s: "boxMoney" };
  }
  const lastSummary = at();
  const t = d.summaryTotals;
  r = row();
  r[0] = { v: L.totals, s: "boxTotalText" };
  r[1] = { v: "", s: "boxTotalText" };
  merge("A", "B");
  const sumCol = (col, v, s = "boxTotal") => (d.summary.length ? { f: `SUM(${col}${firstSummary}:${col}${lastSummary})`, v, s } : { v, s });
  r[2] = sumCol("C", t.hours, "boxTotalHours");
  r[3] = { v: "", s: "boxTotalText" };
  r[4] = sumCol("E", t.amount);
  EXPENSE_CATEGORIES.forEach((c, i) => { r[5 + i] = sumCol(colName(5 + i), t.expenses[c]); });
  r[10] = sumCol("K", t.total);
  const summaryTotalRow = at();
  row();

  // ---- Totaux (à droite) et coordonnées (à gauche) ----
  const x = d.totals;
  const start = at() + 1;
  const R = (k) => `K${start + k}`;
  const totals = [
    [L.subtotal, { f: `K${summaryTotalRow}`, v: x.subtotal, s: "moneyBox" }],
    [L.advance, { v: x.advance, s: "moneyBox" }],
    [L.due, { f: `${R(0)}-${R(1)}`, v: x.due, s: "moneyBox" }],
    [L.tps, d.chargesTps ? { f: `ROUND(${R(2)}*${TPS_RATE},2)`, v: x.tps, s: "moneyBox" } : { v: 0, s: "moneyBox" }],
    [L.tvq, d.chargesTvq ? { f: `ROUND(${R(2)}*${TVQ_RATE},2)`, v: x.tvq, s: "moneyBox" } : { v: 0, s: "moneyBox" }],
    [L.freight, { v: L.included, s: "boxRight" }],
    [L.pay, { f: `${R(2)}+${R(3)}+${R(4)}`, v: x.total, s: "grandTotal" }],
    [L.terms, { v: `NET${x.terms}`, s: "boxRight" }],
    [L.dueDate, { v: x.dueDate, s: "dateBox" }],
  ];
  const left = [
    { v: L.requests, s: "smallBold" }, b.contact, b.phone, b.email, "",
    { v: L.cheque, s: "smallBold" }, b.name, L.attn, ...d.addressLines,
  ];
  for (let i = 0; i < Math.max(totals.length, left.length); i++) {
    r = row();
    if (left[i]) r[0] = left[i];
    if (totals[i]) {
      r[6] = { v: totals[i][0], s: "labelBox" };
      merge("G", "J");
      r[10] = totals[i][1];
    }
  }
  row();
  r = row();
  r[0] = { v: taxNumbersLine(b), s: "small" };
  row();
  r = row();
  r[0] = { v: L.thanks, s: "center" };
  merge("A", "K");

  return {
    sheet: {
      name: "Facture",
      columns: [8, 6, 11, 12, 12, 11, 11, 11, 11, 11, 15, { width: 12, hidden: true }],
      rows,
      merges,
      print: { orientation: "portrait" },
    },
    totals: { hours: x.hours, subtotal: x.subtotal, due: x.due, tps: x.tps, tvq: x.tvq, total: x.total, dueDate: x.dueDate },
  };
}
