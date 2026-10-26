// Facture Excel, sur le modèle de facture de Max (en-tête bilingue, lignes jour
// par jour, sommaire des heures par projet, TPS / TVQ, montant à payer, termes).
//
// Une ligne par période de travail : Qté (heures), U/M « HR », prix unitaire
// (taux), description (projet, tâche) et prix total (formule). Une colonne
// cachée (L) porte la clé projet|type de chaque ligne : le sommaire l'additionne
// avec SOMME.SI, il reste donc juste si on corrige des heures dans Excel.
// Les colonnes de dépenses (hôtel, repas…) sont prêtes pour l'étape des dépenses.

import { addDays, parseISODate, toISODate } from "../core/dates.js";
import { getClient, getProject, periodEntries, rateFor, TPS_RATE, TVQ_RATE } from "./timesheet.js";

export const EXPENSE_CATEGORIES = ["hotel", "food", "material", "phone", "transport"];

const L = {
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
const CATEGORY_LABELS = { hotel: L.hotel, food: L.food, material: L.material, phone: L.phoneCat, transport: L.transport };

const WIDTH = 12; // colonnes A à L (L : clé cachée)
const WEEKDAY = new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "UTC" });
const weekdayEn = (iso) => WEEKDAY.format(new Date(`${iso}T12:00:00Z`));
const round2 = (n) => Math.round(n * 100) / 100;
const textLines = (text) => String(text ?? "").split(/\n/).map((s) => s.trim()).filter(Boolean);
const keyOf = (projectId, overtime) => `${projectId}|${overtime ? "S" : "R"}`;

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

export function invoiceSheet(ts, { from, to, clientId, number, date, po = "" }) {
  const client = getClient(ts, clientId);
  const b = ts.business;
  const entries = periodEntries(ts, from, to, clientId);
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
  r[0] = { v: [b.address ? `${L.address} ${textLines(b.address).join(", ")}` : "", b.phone ? `${L.phone} ${b.phone}` : ""].filter(Boolean).join("   "), s: "small" };
  r[6] = { v: L.po, s: "labelBox" }; merge("G", "J");
  r[10] = { v: po, s: "boxRight" };
  if (b.email) row()[0] = { v: b.email, s: "small" };
  row();

  // ---- Facturé à / Expédié à ----
  r = row();
  r[0] = { v: L.billedTo, s: "smallBold" };
  r[6] = { v: L.shippedTo, s: "smallBold" };
  const clientLines = [client?.contact, client?.name, ...textLines(client?.address), client?.email].filter(Boolean);
  for (const line of clientLines) {
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
  let subtotal = 0;
  const byKey = new Map();
  const dates = [...new Set(entries.map((e) => e.date))];
  for (const day of dates) {
    r = row();
    r[3] = { v: day, s: "dateBold" };
    r[4] = { v: weekdayEn(day), s: "bold" };
    for (const e of entries.filter((x) => x.date === day)) {
      const p = getProject(ts, e.projectId);
      const rate = rateFor(p, e.overtime);
      const amount = round2(e.hours * (rate ?? 0));
      subtotal = round2(subtotal + amount);
      const key = keyOf(e.projectId, e.overtime);
      const sum = byKey.get(key) ?? { hours: 0, amount: 0 };
      byKey.set(key, { hours: round2(sum.hours + e.hours), amount: round2(sum.amount + amount) });
      r = row();
      r[0] = { v: e.hours, s: "hours" };
      r[1] = { v: "HR", s: "center" };
      r[2] = rate != null ? { v: rate, s: "money" } : "";
      r[3] = lineDescription(p, e);
      merge("D", "J");
      r[10] = { f: `A${at()}*C${at()}`, v: amount, s: "money" };
      r[11] = key;
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
  const summary = summaryRows(ts, entries, clientId);
  for (const { project, overtime } of summary) {
    const key = keyOf(project.id, overtime);
    const sum = byKey.get(key) ?? { hours: 0, amount: 0 };
    const rate = rateFor(project, overtime);
    r = row();
    // Comme sur le modèle : le numéro du projet (ou son nom), « OT » pour le surtemps.
    r[0] = { v: `${project.number || project.name}${overtime ? " OT" : ""}`, s: "box" };
    r[1] = { v: "", s: "box" };
    merge("A", "B");
    r[2] = { f: `SUMIF(${range("L")},"${key}",${range("A")})`, v: sum.hours, s: "boxHours" };
    r[3] = rate != null ? { v: rate, s: "boxMoney" } : { v: "", s: "box" };
    r[4] = { f: `SUMIF(${range("L")},"${key}",${range("K")})`, v: sum.amount, s: "boxMoney" };
    EXPENSE_CATEGORIES.forEach((_, i) => { r[5 + i] = { v: 0, s: "boxMoney" }; });
    r[10] = { f: `SUM(E${at()}:J${at()})`, v: sum.amount, s: "boxMoney" };
  }
  const lastSummary = at();
  const hours = round2([...byKey.values()].reduce((s, x) => s + x.hours, 0));
  r = row();
  r[0] = { v: L.totals, s: "boxTotalText" };
  r[1] = { v: "", s: "boxTotalText" };
  merge("A", "B");
  const sumCol = (col, v, s = "boxTotal") => (summary.length ? { f: `SUM(${col}${firstSummary}:${col}${lastSummary})`, v, s } : { v, s });
  r[2] = sumCol("C", hours, "boxTotalHours");
  r[3] = { v: "", s: "boxTotalText" };
  ["E", "F", "G", "H", "I", "J", "K"].forEach((col, i) => { r[4 + i] = sumCol(col, i === 0 || i === 6 ? subtotal : 0); });
  const summaryTotalRow = at();
  row();

  // ---- Totaux (à droite) et coordonnées (à gauche) ----
  const advance = 0;
  const due = round2(subtotal - advance);
  const tps = client?.tps === false ? 0 : round2(due * TPS_RATE);
  const tvq = client?.tvq === false ? 0 : round2(due * TVQ_RATE);
  const total = round2(due + tps + tvq);
  const start = at() + 1;
  const R = (k) => `K${start + k}`;
  const totals = [
    [L.subtotal, { f: `K${summaryTotalRow}`, v: subtotal, s: "moneyBox" }],
    [L.advance, { v: advance, s: "moneyBox" }],
    [L.due, { f: `${R(0)}-${R(1)}`, v: due, s: "moneyBox" }],
    [L.tps, client?.tps === false ? { v: 0, s: "moneyBox" } : { f: `ROUND(${R(2)}*${TPS_RATE},2)`, v: tps, s: "moneyBox" }],
    [L.tvq, client?.tvq === false ? { v: 0, s: "moneyBox" } : { f: `ROUND(${R(2)}*${TVQ_RATE},2)`, v: tvq, s: "moneyBox" }],
    [L.freight, { v: "INCLUS", s: "boxRight" }],
    [L.pay, { f: `${R(2)}+${R(3)}+${R(4)}`, v: total, s: "grandTotal" }],
    [L.terms, { v: `NET${b.terms}`, s: "boxRight" }],
    [L.dueDate, { v: dueDate(date, b.terms), s: "dateBox" }],
  ];
  const left = [
    { v: L.requests, s: "smallBold" }, b.contact, b.phone, b.email, "",
    { v: L.cheque, s: "smallBold" }, b.name, L.attn, ...textLines(b.address),
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
  r[0] = { v: [b.tpsNumber ? `${L.tpsNumber} : ${b.tpsNumber}` : "", b.tvqNumber ? `${L.tvqNumber} : ${b.tvqNumber}` : ""].filter(Boolean).join("      "), s: "small" };
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
    totals: { hours, subtotal, due, tps, tvq, total, dueDate: dueDate(date, b.terms) },
  };
}
