// Facture, sur le modèle approuvé par Max (logo, bleu marine et orange, Arial) :
//   « Facture »    en-tête, facturé à / expédié à, lignes jour par jour, sommaire
//                  des heures et frais par projet, totaux et TOTAL À PAYER
//   « Heures »     une ligne par période de travail (la facture s'y réfère)
//   « Par projet » heures régulières / surtemps et montant par projet (SOMME.SI.ENS),
//                  frais à saisir (en bleu) et taux de taxes
// Les trois onglets sont liés par des formules : corriger une heure ou ajouter
// un frais dans Excel met la facture à jour. invoiceData() calcule le même
// contenu pour l'aperçu dans l'application.

import { addDays, parseISODate, toISODate } from "../core/dates.js";
import { FORMATS } from "../export/xlsx.js";
import { getClient, getProject, periodEntries, rateFor, TPS_RATE, TVQ_RATE } from "./timesheet.js";
import { EXPENSE_CATEGORY, expenseTotal, expenseUnitPrice, isMileage, periodExpenses } from "./expenses.js";

export const EXPENSE_CATEGORIES = ["hotel", "food", "material", "phone", "transport"];
// Nom court de chaque colonne de frais (onglets « Frais » et « Par projet »)
export const CATEGORY_SHORT = { hotel: "Hôtel", food: "Repas", material: "Matériel", phone: "Cell.", transport: "Transport" };
// Type de dépense sur une ligne de la facture
export const EXPENSE_LABELS = {
  food: "Repas / Food", hotel: "Hôtel / Hotel", transport: "Transport", mileage: "Kilométrage / Mileage",
  phone: "Cellulaire / Phone", material: "Matériel / Material",
};
// Frais généraux du client (sans projet), ex. le cellulaire du mois
export const GENERAL = "Général";

export const INVOICE_LABELS = {
  title: "FACTURE",
  subtitle: "INVOICE",
  number: "No facture / Invoice #",
  date: "Date de facturation / Invoice date",
  po: "No PO client / Client PO",
  terms: "Termes / Terms",
  dueDate: "Échéance / Due date",
  phone: "Tél. :",
  tps: "TPS / GST :",
  tvq: "TVQ / QST :",
  billedTo: "FACTURÉ À / BILLED TO",
  shippedTo: "EXPÉDIÉ À / SHIPPED TO",
  attn: "Attn :",
  qty: "Qté\nQty",
  unit: "U/M",
  unitPrice: "Prix unit.\nUnit price",
  description: "Description",
  total: "Total",
  overtime: "Surtemps / Overtime",
  summary: "SOMMAIRE DES HEURES ET FRAIS / HOURS & EXPENSES SUMMARY",
  project: "Projet\nProject",
  regHours: "Heures rég.\nReg. hrs",
  otHours: "Surtemps\nOT hrs",
  hoursAmount: "Heures $\nHours $",
  hotel: "Hôtel\nHotel",
  food: "Repas\nFood",
  material: "Matériel\nMaterial",
  phoneCat: "Cell.\nPhone",
  transport: "Transport",
  totals: "TOTAL",
  cheque: "FAIRE VOTRE CHÈQUE PAYABLE À / MAKE YOUR CHEQUE PAYABLE TO",
  receivable: "Attn : Comptes à recevoir / Accounts receivable",
  requests: "ENVOYEZ VOS DEMANDES À / SEND YOUR REQUESTS TO",
  subtotal: "Sous-total / Sub-total",
  advance: "Acompte / Advance payment",
  due: "Montant dû / Amount due",
  tpsLine: "TPS / GST (5 %)",
  tvqLine: "TVQ / QST (9,975 %)",
  freight: "Transport / Freight",
  included: "INCLUS",
  pay: "TOTAL À PAYER (CAD)",
  thanks: "Merci de faire affaire avec nous!  ·  We appreciate your business!",
};
const L = INVOICE_LABELS;
export const CATEGORY_LABELS = { hotel: L.hotel, food: L.food, material: L.material, phone: L.phoneCat, transport: L.transport };

// Couleurs du modèle
export const COLORS = {
  navy: "FF2C4A6E", orange: "FFE0491A", gray: "FF6B7280", ink: "FF1F2937", text: "FF374151",
  light: "FFEEF2F7", head: "FFDCE4EE", line: "FFC9D2DE", white: "FFFFFFFF", input: "FF0000FF",
};

const REGULAR = "Régulier";
const OVERTIME = "Surtemps";
const SEP = "  ·  ";
const WEEKDAY_FR = new Intl.DateTimeFormat("fr-CA", { weekday: "long", timeZone: "UTC" });
const WEEKDAY_EN = new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "UTC" });
const noon = (iso) => new Date(`${iso}T12:00:00Z`);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const weekdayFr = (iso) => capital(WEEKDAY_FR.format(noon(iso)));
export const weekdayEn = (iso) => WEEKDAY_EN.format(noon(iso));
const round2 = (n) => Math.round(n * 100) / 100;
const textLines = (text) => String(text ?? "").split(/\n/).map((s) => s.trim()).filter(Boolean);
const letter = (i) => String.fromCharCode(65 + i);

export const dueDate = (date, terms) => toISODate(addDays(parseISODate(date), Number(terms) || 0));

// Projet tel qu'il paraît sur la facture : son numéro (ou son nom).
const projectKey = (p) => p?.number || p?.name || "?";

// « CA15713  —  QA04 : Painting specification review  —  Reviewed galvanizing requirements  (Surtemps / Overtime) »
export function lineDescription(line) {
  const work = line.work ? `  —  ${line.work}` : "";
  return `${line.project}  —  ${line.taskCode ? `${line.taskCode} : ` : ""}${line.description}${work}${line.overtime ? `  (${L.overtime})` : ""}`;
}

const NUMBER_FR = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
const rateText = (rate) => String(rate).replace(".", ",");

// « P-200  —  Repas / Food : Dinner  (2 924 738 VND @ 0,000053931) »
export function expenseDescription(line) {
  const foreign = line.currency && line.currency !== "CAD" ? `  (${NUMBER_FR.format(line.origAmount).replace(/\s/g, " ")} ${line.currency} @ ${rateText(line.rate)})` : "";
  return `${line.project}  —  ${EXPENSE_LABELS[line.type]}${line.description ? ` : ${line.description}` : ""}${foreign}`;
}

// Contenu de la facture (lignes, sommaire, totaux), commun au fichier Excel
// et à l'aperçu dans l'application.
export function invoiceData(ts, { from, to, clientId, number, date, po = "" }) {
  const client = getClient(ts, clientId);
  const business = ts.business;
  const lines = periodEntries(ts, from, to, clientId).map((e) => {
    const p = getProject(ts, e.projectId);
    const rate = rateFor(p, e.overtime);
    const line = {
      // Le code de tâche paraît sur la facture seulement si l'option est cochée.
      date: e.date, weekday: weekdayFr(e.date), project: projectKey(p), taskCode: business.showTaskCodes ? e.taskCode : "",
      description: e.task || p?.name || "", work: e.work, hours: e.hours, overtime: e.overtime, rate, amount: round2(e.hours * (rate ?? 0)),
    };
    return { ...line, kind: "hours", code: e.taskCode, text: lineDescription(line) };
  });
  const expenseLines = periodExpenses(ts, from, to, clientId).map((e) => {
    const line = {
      kind: "expense", date: e.date, weekday: weekdayFr(e.date), project: e.projectId ? projectKey(getProject(ts, e.projectId)) : GENERAL,
      type: e.type, category: EXPENSE_CATEGORY[e.type], description: e.description, qty: e.qty, unit: isMileage(e) ? "KM" : "EA",
      unitPrice: expenseUnitPrice(e), amount: expenseTotal(e), currency: e.currency, origAmount: e.amount, rate: e.rate,
    };
    return { ...line, text: expenseDescription(line) };
  });
  // Chaque journée : ses dépenses, puis ses heures (comme sur la facture d'août)
  const days = [...new Set([...lines, ...expenseLines].map((l) => l.date))].sort().map((day) => ({
    date: day, weekday: `${weekdayFr(day)} / ${weekdayEn(day)}`,
    lines: [...expenseLines.filter((l) => l.date === day), ...lines.filter((l) => l.date === day)],
  }));
  const noExpenses = () => Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0]));
  const projects = [...new Set([...lines, ...expenseLines].map((l) => l.project))]
    .sort((a, b) => (a === GENERAL) - (b === GENERAL) || a.localeCompare(b, undefined, { numeric: true }));
  const summary = projects.map((project) => {
    const of = lines.filter((l) => l.project === project);
    const ex = expenseLines.filter((l) => l.project === project);
    const amount = round2(of.reduce((s, l) => s + l.amount, 0));
    const expenses = noExpenses();
    for (const l of ex) expenses[l.category] = round2(expenses[l.category] + l.amount);
    return {
      project,
      regHours: round2(of.filter((l) => !l.overtime).reduce((s, l) => s + l.hours, 0)),
      otHours: round2(of.filter((l) => l.overtime).reduce((s, l) => s + l.hours, 0)),
      amount, expenses, total: round2(amount + ex.reduce((s, l) => s + l.amount, 0)),
    };
  });
  const sum = (k) => round2(summary.reduce((s, r) => s + r[k], 0));
  const sumExpenses = () => Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, round2(summary.reduce((s, r) => s + r.expenses[c], 0))]));
  const subtotal = sum("total");
  const advance = 0;
  const due = round2(subtotal - advance);
  const tpsRate = client?.tps === false ? 0 : TPS_RATE;
  const tvqRate = client?.tvq === false ? 0 : TVQ_RATE;
  const tps = round2(due * tpsRate);
  const tvq = round2(due * tvqRate);
  const addressLines = textLines(business.address);
  return {
    business, number, date, po, tpsRate, tvqRate,
    logo: business.logo || "",
    addressLine: addressLines.join(", "),
    addressLines,
    contactLine: [business.phone ? `${L.phone} ${business.phone}` : "", business.email].filter(Boolean).join(SEP),
    requestsLine: [business.contact, business.phone, business.email].filter(Boolean).join(SEP),
    client: {
      name: client?.name ?? "", attn: client?.contact ? `${L.attn} ${client.contact}` : "", lines: textLines(client?.address), email: client?.email ?? "",
    },
    lines,
    expenseLines,
    days,
    summary,
    summaryTotals: { regHours: sum("regHours"), otHours: sum("otHours"), amount: sum("amount"), expenses: sumExpenses(), total: subtotal },
    totals: {
      hours: round2(sum("regHours") + sum("otHours")), subtotal, advance, due, tps, tvq, total: round2(due + tps + tvq),
      terms: business.terms, dueDate: dueDate(date, business.terms),
    },
  };
}

// ---- Styles Excel du modèle ----------------------------------------------------------

const C = COLORS;
const font = (sz, color, extra = {}) => ({ name: "Arial", sz, color, ...extra });
const under = (color = C.line, style = "thin") => ({ bottom: { style, color } });
const topLine = { top: { style: "medium", color: C.navy } };
const MONEY = FORMATS.moneyDash;
const STYLES = {
  title: { font: font(24, C.navy, { b: true }), align: { h: "right", v: "bottom" } },
  subtitle: { font: font(9, C.orange, { b: true }), align: { h: "right", v: "top" } },
  rule: { border: under(C.orange, "thick") },
  ruleThin: { border: under(C.orange) },
  company: { font: font(10, C.navy, { b: true }), align: { v: "center" } },
  info: { font: font(8.5, C.text), align: { v: "center" } },
  infoSmall: { font: font(8, C.gray), align: { v: "center" } },
  metaLabel: { font: font(8, C.gray, { b: true }), align: { h: "right", v: "center" } },
  metaValue: { font: font(9, C.ink), fill: C.light, border: under(C.white), align: { h: "right", v: "center" } },
  metaNumber: { font: font(11, C.orange, { b: true }), fill: C.light, border: under(C.white), align: { h: "right", v: "center" } },
  metaDate: { font: font(9, C.ink), fill: C.light, border: under(C.white), align: { h: "right", v: "center" }, numFmt: FORMATS.date },
  metaDue: { font: font(9.5, C.navy, { b: true }), fill: C.light, border: under(C.white), align: { h: "right", v: "center" }, numFmt: FORMATS.date },
  partyTitle: { font: font(8, C.orange, { b: true }), border: under(), align: { v: "center" } },
  partyLine: { border: under() },
  partyName: { font: font(10, C.navy, { b: true }), align: { v: "center" } },
  party: { font: font(8.5, C.ink), align: { v: "center" } },
  partyMuted: { font: font(8.5, C.gray), align: { v: "center" } },
  head: { font: font(8.5, C.white, { b: true }), fill: C.navy, align: { h: "center", v: "center", wrap: true } },
  headLeft: { font: font(8.5, C.white, { b: true }), fill: C.navy, align: { h: "left", v: "center" } },
  day: { font: font(9, C.navy, { b: true }), fill: C.light, border: { left: { style: "thick", color: C.orange } }, align: { h: "left", v: "center" } },
  dayFill: { fill: C.light },
  weekday: { font: font(8.5, C.gray, { b: true }), fill: C.light, align: { h: "left", v: "center" } },
  qty: { font: font(9, C.ink), border: under(), numFmt: FORMATS.hours, align: { h: "right", v: "center" } },
  unit: { font: font(8.5, C.gray), border: under(), align: { h: "center", v: "center" } },
  price: { font: font(9, C.ink), border: under(), numFmt: MONEY, align: { h: "right", v: "center" } },
  desc: { font: font(9, C.ink), border: under(), align: { h: "left", v: "center" } },
  lineTotal: { font: font(9, C.ink, { b: true }), border: under(), numFmt: MONEY, align: { h: "right", v: "center" } },
  lineBorder: { border: under() },
  section: { font: font(8.5, C.navy, { b: true }), border: under(C.navy), align: { v: "center" } },
  sumHead: { font: font(8, C.navy, { b: true }), fill: C.head, align: { h: "center", v: "center", wrap: true } },
  sumProject: { font: font(9, C.ink), border: under(), align: { h: "left", v: "center" } },
  sumHours: { font: font(9, C.ink), border: under(), numFmt: FORMATS.hoursDash, align: { h: "right", v: "center" } },
  sumMoney: { font: font(9, C.ink), border: under(), numFmt: MONEY, align: { h: "right", v: "center" } },
  sumTotal: { font: font(9, C.navy, { b: true }), fill: C.light, border: topLine, align: { h: "left", v: "center" } },
  sumTotalHours: { font: font(9, C.navy, { b: true }), fill: C.light, border: topLine, numFmt: FORMATS.hours, align: { h: "right", v: "center" } },
  sumTotalMoney: { font: font(9, C.navy, { b: true }), fill: C.light, border: topLine, numFmt: MONEY, align: { h: "right", v: "center" } },
  footTitle: { font: font(7.5, C.orange, { b: true }), align: { v: "center" } },
  footCompany: { font: font(9.5, C.navy, { b: true }), align: { v: "center" } },
  foot: { font: font(8.5, C.ink), align: { v: "center" } },
  totLabel: { font: font(8.5, C.text), align: { h: "right", v: "center" } },
  totLabelBold: { font: font(8.5, C.text, { b: true }), align: { h: "right", v: "center" } },
  totValue: { font: font(9, C.ink), border: under(), numFmt: MONEY, align: { h: "right", v: "center" } },
  totValueBold: { font: font(9, C.ink, { b: true }), border: under(), numFmt: MONEY, align: { h: "right", v: "center" } },
  payLabel: { font: font(10.5, C.white, { b: true }), fill: C.navy, align: { h: "right", v: "center" } },
  payValue: { font: font(12, C.white, { b: true }), fill: C.orange, numFmt: MONEY, align: { h: "right", v: "center" } },
  dueLine: { font: font(8, C.gray, { b: true }), align: { h: "right", v: "center" } },
  thanks: { font: font(9, C.navy, { b: true, i: true }), align: { h: "center", v: "center" } },
  // Onglets « Heures » et « Par projet »
  tHead: { font: font(9, C.white, { b: true }), fill: C.navy, align: { h: "center", v: "center", wrap: true } },
  tCell: { font: font(9, C.ink), border: under(), align: { h: "center", v: "center" } },
  tText: { font: font(9, C.ink), border: under(), align: { v: "center" } },
  tDate: { font: font(9, C.ink), border: under(), numFmt: FORMATS.date, align: { h: "center", v: "center" } },
  tHours: { font: font(9, C.ink), border: under(), numFmt: FORMATS.hours },
  tMoney: { font: font(9, C.ink), border: under(), numFmt: MONEY },
  tInput: { font: font(9, C.input), border: under(), numFmt: MONEY },
  tTotal: { font: font(9, C.ink, { b: true }), fill: C.light, border: topLine },
  tTotalCenter: { font: font(9, C.ink, { b: true }), fill: C.light, border: topLine, align: { h: "center" } },
  tTotalHours: { font: font(9, C.ink, { b: true }), fill: C.light, border: topLine, numFmt: FORMATS.hours },
  tTotalMoney: { font: font(9, C.ink, { b: true }), fill: C.light, border: topLine, numFmt: MONEY },
  tSection: { font: font(9, C.navy, { b: true }) },
  tLabel: { font: font(9, C.ink) },
  tRate: { font: font(9, C.input), numFmt: FORMATS.percent },
  tAmount: { font: font(9, C.ink), border: under(), numFmt: "#,##0.00" },
  tRateValue: { font: font(9, C.ink), border: under(), numFmt: "0.000000000" },
  tNote: { font: font(8, C.gray, { i: true }) },
};
export const INVOICE_STYLES = STYLES;

// Logo enregistré (data URL) -> image pour Excel, à la hauteur de l'en-tête.
export function logoImage(dataUrl, size) {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl ?? "");
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
  const ratio = size?.width && size?.height ? size.width / size.height : 1.5;
  const height = Math.min(96, Math.round(220 / ratio));
  return { data: bytes, type: m[1], col: 0, row: 0, width: Math.round(height * ratio), height };
}

// ---- Les trois onglets ----------------------------------------------------------------

export function invoiceSheets(ts, options) {
  const d = invoiceData(ts, options);
  const b = d.business;
  const x = d.totals;
  const st = d.summaryTotals;
  const W = 11; // colonnes A à K

  // ---- « Heures » : la source des lignes de la facture ----
  // A Date · B Jour · C Projet · D Tâche · E Description · F Travail effectué · G Heures · H Type · I Taux · J Montant
  const hoursRows = [["Date", "Jour", "Projet", "Tâche", "Description", "Travail effectué", "Heures", "Type", "Taux", "Montant"].map((v) => ({ v, s: "tHead" }))];
  d.lines.forEach((l, i) => {
    const r = i + 2;
    hoursRows.push([
      { v: l.date, s: "tDate" }, { v: l.weekday, s: "tCell" }, { v: l.project, s: "tCell" }, { v: l.code, s: "tCell" },
      { v: l.description, s: "tText" }, { v: l.work, s: "tText" }, { v: l.hours, s: "tHours" }, { v: l.overtime ? OVERTIME : REGULAR, s: "tCell" },
      { v: l.rate ?? 0, s: "tMoney" }, { f: `G${r}*I${r}`, v: l.amount, s: "tMoney" },
    ]);
  });
  const lastHour = Math.max(2, hoursRows.length);
  const any = d.lines.length > 0;
  hoursRows.push([
    ...Array.from({ length: 5 }, () => ({ v: "", s: "tTotal" })), { v: "TOTAL", s: "tTotal" },
    { f: any ? `SUM(G2:G${lastHour})` : "0", v: x.hours, s: "tTotalHours" }, { v: "", s: "tTotal" }, { v: "", s: "tTotal" },
    { f: any ? `SUM(J2:J${lastHour})` : "0", v: st.amount, s: "tTotalMoney" },
  ]);
  hoursRows.push([], [{ v: "Saisir les heures ici : la facture et le sommaire par projet se mettent à jour automatiquement.", s: "tNote" }]);

  // ---- « Frais » : les dépenses, converties en $ CA ----
  const expenseRows = [["Date", "Jour", "Projet", "Catégorie", "Type", "Description", "Qté", "U/M", "Montant d'origine", "Devise", "Taux ($ CA)", "Prix unit. ($ CA)", "Total ($ CA)"]
    .map((v) => ({ v, s: "tHead" }))];
  d.expenseLines.forEach((l, i) => {
    const r = i + 2;
    const mileage = l.unit === "KM";
    expenseRows.push([
      { v: l.date, s: "tDate" }, { v: l.weekday, s: "tCell" }, { v: l.project, s: "tCell" }, { v: CATEGORY_SHORT[l.category], s: "tCell" },
      { v: EXPENSE_LABELS[l.type], s: "tText" }, { v: l.description, s: "tText" }, { v: l.qty, s: "tHours" }, { v: l.unit, s: "tCell" },
      mileage ? { v: "", s: "tText" } : { v: l.origAmount, s: "tAmount" }, { v: l.currency, s: "tCell" },
      mileage ? { v: "", s: "tText" } : { v: l.rate, s: "tRateValue" },
      mileage ? { v: l.unitPrice, s: "tMoney" } : { f: `ROUND(I${r}*K${r},2)`, v: l.unitPrice, s: "tMoney" },
      { f: `G${r}*L${r}`, v: l.amount, s: "tMoney" },
    ]);
  });
  const lastExpense = Math.max(2, expenseRows.length);
  const expensesTotal = round2(d.expenseLines.reduce((s, l) => s + l.amount, 0));
  expenseRows.push([
    ...Array.from({ length: 11 }, (_, i) => ({ v: i === 5 ? "TOTAL" : "", s: "tTotal" })), { v: "", s: "tTotal" },
    { f: d.expenseLines.length ? `SUM(M2:M${lastExpense})` : "0", v: expensesTotal, s: "tTotalMoney" },
  ]);
  expenseRows.push([], [{ v: "Les dépenses notées dans LifeCal ; le sommaire par projet les additionne par catégorie.", s: "tNote" }]);

  // ---- « Par projet » : sommaire, frais par catégorie, taux de taxes ----
  const range = (col) => `Heures!$${col}$2:$${col}$${lastHour}`;
  const fees = (col) => `Frais!$${col}$2:$${col}$${lastExpense}`;
  const projRows = [["Projet", "Heures rég.", "Heures surtemps", "Heures $", "Hôtel", "Repas", "Matériel", "Cell.", "Transport", "Total"].map((v) => ({ v, s: "tHead" }))];
  d.summary.forEach((p, i) => {
    const r = i + 2;
    projRows.push([
      { v: p.project, s: "tCell" },
      { f: `SUMIFS(${range("G")},${range("C")},A${r},${range("H")},"${REGULAR}")`, v: p.regHours, s: "tHours" },
      { f: `SUMIFS(${range("G")},${range("C")},A${r},${range("H")},"${OVERTIME}")`, v: p.otHours, s: "tHours" },
      { f: `SUMIFS(${range("J")},${range("C")},A${r})`, v: p.amount, s: "tMoney" },
      ...EXPENSE_CATEGORIES.map((c) => ({ f: `SUMIFS(${fees("M")},${fees("C")},A${r},${fees("D")},"${CATEGORY_SHORT[c]}")`, v: p.expenses[c], s: "tMoney" })),
      { f: `SUM(D${r}:I${r})`, v: p.total, s: "tMoney" },
    ]);
  });
  const lastProj = projRows.length;
  const sumOf = (col, v, s) => ({ f: d.summary.length ? `SUM(${col}2:${col}${lastProj})` : "0", v, s });
  projRows.push([
    { v: "TOTAL", s: "tTotalCenter" }, sumOf("B", st.regHours, "tTotalHours"), sumOf("C", st.otHours, "tTotalHours"), sumOf("D", st.amount, "tTotalMoney"),
    ...EXPENSE_CATEGORIES.map((c, i) => sumOf(letter(4 + i), st.expenses[c], "tTotalMoney")), sumOf("J", st.total, "tTotalMoney"),
  ]);
  projRows.push([], [{ v: "Taux de taxes", s: "tSection" }]);
  const tpsRow = projRows.length + 1;
  projRows.push([{ v: "TPS / GST", s: "tLabel" }, { v: d.tpsRate, s: "tRate" }]);
  const tvqRow = projRows.length + 1;
  projRows.push([{ v: "TVQ / QST", s: "tLabel" }, { v: d.tvqRate, s: "tRate" }]);
  projRows.push([], [{ v: "Les heures viennent de l'onglet « Heures », les frais de l'onglet « Frais ».", s: "tNote" }]);

  // ---- « Par tâche » : heures et montants regroupés par code de tâche ----
  const taskKeys = [...new Set(d.lines.map((l) => l.code))].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b, undefined, { numeric: true }));
  const taskRows = [["Tâche", "Description", "Heures", "Montant"].map((v) => ({ v, s: "tHead" }))];
  taskKeys.forEach((code, i) => {
    const r = i + 2;
    const of = d.lines.filter((l) => l.code === code);
    const description = code ? (ts.tasks?.find((t) => t.code === code)?.description ?? of[0].description) : "Sans code / No code";
    // Critère « = » : les lignes sans code
    const crit = code ? `D${r}` : `"="`;
    taskRows.push([
      { v: code, s: "tCell" }, { v: description, s: "tText" },
      { f: `SUMIFS(${range("G")},${range("D")},${crit})`, v: round2(of.reduce((s2, l) => s2 + l.hours, 0)), s: "tHours" },
      { f: `SUMIFS(${range("J")},${range("D")},${crit})`, v: round2(of.reduce((s2, l) => s2 + l.amount, 0)), s: "tMoney" },
    ]);
  });
  const lastTask = Math.max(2, taskRows.length);
  taskRows.push([{ v: "TOTAL", s: "tTotalCenter" }, { v: "", s: "tTotal" },
    { f: taskKeys.length ? `SUM(C2:C${lastTask})` : "0", v: x.hours, s: "tTotalHours" },
    { f: taskKeys.length ? `SUM(D2:D${lastTask})` : "0", v: st.amount, s: "tTotalMoney" }]);

  // ---- « Facture » ----
  const rows = [];
  const merges = [];
  const heights = {};
  const row = (height) => {
    const r = Array(W).fill(null);
    rows.push(r);
    if (height) heights[rows.length] = height;
    return r;
  };
  const at = () => rows.length;
  const merge = (a, z) => merges.push(`${a}${at()}:${z}${at()}`);
  const fill = (r, from, to, s) => { for (let i = from; i <= to; i++) r[i] ??= { v: "", s }; };

  // En-tête : logo (A1), FACTURE / INVOICE, filet orange
  let r = row(19.5);
  r[6] = { v: L.title, s: "title" };
  row(19.5);
  merges.push("G1:K2");
  r = row(15.75);
  r[6] = { v: L.subtitle, s: "subtitle" };
  merge("G", "K");
  row(15.75);
  fill(row(6), 0, W - 1, "rule");
  row(6);

  // Mon entreprise (à gauche) et références de la facture (à droite)
  const dateRow = at() + 2;
  const meta = [
    [{ v: b.name, s: "company" }, L.number, { v: d.number, s: "metaNumber" }],
    [{ v: d.addressLine, s: "info" }, L.date, { v: d.date, s: "metaDate" }],
    [{ v: d.contactLine, s: "info" }, L.po, { v: d.po, s: "metaValue" }],
    [{ v: b.tpsNumber ? `${L.tps} ${b.tpsNumber}` : "", s: "infoSmall" }, L.terms, { v: `NET${x.terms}`, s: "metaValue" }],
    [{ v: b.tvqNumber ? `${L.tvq} ${b.tvqNumber}` : "", s: "infoSmall" }, L.dueDate, { f: `K${dateRow}+${Number(x.terms) || 0}`, v: x.dueDate, s: "metaDue" }],
  ];
  for (const [left, label, value] of meta) {
    r = row(15);
    r[0] = left;
    merge("A", "E");
    r[6] = { v: label, s: "metaLabel" };
    merge("G", "J");
    r[10] = value;
  }
  row(9.75);

  // Facturé à / Expédié à
  r = row(15);
  r[0] = { v: L.billedTo, s: "partyTitle" };
  r[6] = { v: L.shippedTo, s: "partyTitle" };
  fill(r, 1, 4, "partyLine");
  fill(r, 7, 10, "partyLine");
  const c = d.client;
  const party = [
    [{ v: c.name, s: "partyName" }, { v: c.name, s: "partyName" }],
    ...(c.attn ? [[{ v: c.attn, s: "party" }, { v: c.attn, s: "party" }]] : []),
    ...c.lines.map((l) => [{ v: l, s: "party" }, { v: l, s: "party" }]),
    ...(c.email ? [[{ v: c.email, s: "partyMuted" }, null]] : []),
  ];
  for (const [left, right] of party) {
    r = row(15);
    r[0] = left;
    merge("A", "E");
    if (right) {
      r[6] = right;
      merge("G", "K");
    }
  }
  row(9.75);

  // Lignes, jour par jour (chacune se réfère à sa ligne de l'onglet « Heures »)
  r = row(25.5);
  r[0] = { v: L.qty, s: "head" };
  r[1] = { v: L.unit, s: "head" };
  r[2] = { v: L.unitPrice, s: "head" };
  r[3] = { v: L.description, s: "headLeft" };
  fill(r, 4, 9, "headLeft");
  r[10] = { v: L.total, s: "head" };
  merge("D", "J");
  let source = 2; // ligne correspondante dans « Heures »
  let feeRow = 2; // ligne correspondante dans « Frais »
  for (const day of d.days) {
    r = row(18);
    r[0] = { v: day.date, s: "day" };
    fill(r, 1, 2, "dayFill");
    merge("A", "C");
    r[3] = { v: day.weekday, s: "weekday" };
    fill(r, 4, 10, "weekday");
    merge("D", "K");
    for (const l of day.lines) {
      if (l.kind === "expense") {
        const f = feeRow++;
        r = row(16.5);
        r[0] = { f: `Frais!G${f}`, v: l.qty, s: "qty" };
        r[1] = { f: `Frais!H${f}`, v: l.unit, s: "unit" };
        r[2] = { f: `Frais!L${f}`, v: l.unitPrice, s: "price" };
        r[3] = { v: l.text, s: "desc" };
        fill(r, 4, 9, "lineBorder");
        merge("D", "J");
        r[10] = { f: `A${at()}*C${at()}`, v: l.amount, s: "lineTotal" };
        continue;
      }
      const h = source++;
      r = row(16.5);
      r[0] = { f: `Heures!G${h}`, v: l.hours, s: "qty" };
      r[1] = { v: "HR", s: "unit" };
      r[2] = { f: `Heures!I${h}`, v: l.rate ?? 0, s: "price" };
      r[3] = {
        f: `Heures!C${h}&"  —  "&${b.showTaskCodes ? `IF(Heures!D${h}="","",Heures!D${h}&" : ")&` : ""}Heures!E${h}&IF(Heures!F${h}="","","  —  "&Heures!F${h})&IF(Heures!H${h}="${OVERTIME}","  (${L.overtime})","")`,
        v: l.text, s: "desc",
      };
      fill(r, 4, 9, "lineBorder");
      merge("D", "J");
      r[10] = { f: `A${at()}*C${at()}`, v: l.amount, s: "lineTotal" };
    }
  }
  row();

  // Sommaire des heures et frais (se réfère à l'onglet « Par projet »)
  r = row(15);
  r[0] = { v: L.summary, s: "section" };
  fill(r, 1, W - 1, "section");
  merge("A", "K");
  r = row(25.5);
  [L.project, "", L.regHours, L.otHours, L.hoursAmount, ...EXPENSE_CATEGORIES.map((k) => CATEGORY_LABELS[k]), L.total]
    .forEach((v, i) => { r[i] = { v, s: "sumHead" }; });
  merge("A", "B");
  const firstSum = at() + 1;
  d.summary.forEach((p, i) => {
    const src = i + 2;
    r = row(15);
    r[0] = { f: `'Par projet'!A${src}`, v: p.project, s: "sumProject" };
    r[1] = { v: "", s: "sumProject" };
    merge("A", "B");
    r[2] = { f: `'Par projet'!B${src}`, v: p.regHours, s: "sumHours" };
    r[3] = { f: `'Par projet'!C${src}`, v: p.otHours, s: "sumHours" };
    r[4] = { f: `'Par projet'!D${src}`, v: p.amount, s: "sumMoney" };
    EXPENSE_CATEGORIES.forEach((k, j) => { r[5 + j] = { f: `'Par projet'!${letter(4 + j)}${src}`, v: p.expenses[k], s: "sumMoney" }; });
    r[10] = { f: `'Par projet'!J${src}`, v: p.total, s: "sumMoney" };
  });
  const lastSum = at();
  r = row(15);
  r[0] = { v: L.totals, s: "sumTotal" };
  r[1] = { v: "", s: "sumTotal" };
  merge("A", "B");
  const colSum = (i, v, s) => ({ f: d.summary.length ? `SUM(${letter(i)}${firstSum}:${letter(i)}${lastSum})` : "0", v, s });
  r[2] = colSum(2, st.regHours, "sumTotalHours");
  r[3] = colSum(3, st.otHours, "sumTotalHours");
  r[4] = colSum(4, st.amount, "sumTotalMoney");
  EXPENSE_CATEGORIES.forEach((k, j) => { r[5 + j] = colSum(5 + j, st.expenses[k], "sumTotalMoney"); });
  r[10] = colSum(10, st.total, "sumTotalMoney");
  const totalRow = at();
  row();

  // Paiement (à gauche) et totaux (à droite)
  const first = at() + 1;
  const K = (k) => `K${first + k}`;
  const left = [
    { v: L.cheque, s: "footTitle" }, { v: b.name, s: "footCompany" }, { v: L.receivable, s: "foot" }, { v: d.addressLine, s: "foot" },
    null, { v: L.requests, s: "footTitle" }, { v: d.requestsLine, s: "foot" },
  ];
  const right = [
    [L.subtotal, "totLabel", { f: `K${totalRow}`, v: x.subtotal, s: "totValue" }],
    [L.advance, "totLabel", { v: x.advance, s: "totValue" }],
    [L.due, "totLabelBold", { f: `${K(0)}-${K(1)}`, v: x.due, s: "totValueBold" }],
    [L.tpsLine, "totLabel", { f: `ROUND(${K(2)}*'Par projet'!$B$${tpsRow},2)`, v: x.tps, s: "totValue" }],
    [L.tvqLine, "totLabel", { f: `ROUND(${K(2)}*'Par projet'!$B$${tvqRow},2)`, v: x.tvq, s: "totValue" }],
    [L.freight, "totLabel", { v: L.included, s: "totValue" }],
    [L.pay, "payLabel", { f: `${K(2)}+${K(3)}+${K(4)}`, v: x.total, s: "payValue" }],
  ];
  right.forEach(([label, style, value], i) => {
    r = row(i === 6 ? 27.75 : 15.75);
    if (left[i]) {
      r[0] = left[i];
      merge("A", "F");
    }
    r[6] = { v: label, s: style };
    fill(r, 7, 9, style);
    merge("G", "J");
    r[10] = value;
  });
  r = row(15);
  r[6] = { f: `"${L.dueDate} : "&TEXT(K${dateRow + 3},"yyyy-mm-dd")&"  ·  NET${x.terms}"`, v: `${L.dueDate} : ${x.dueDate}  ·  NET${x.terms}`, s: "dueLine" };
  merge("G", "K");
  fill(row(9.75), 0, W - 1, "ruleThin");
  r = row(19.5);
  r[0] = { v: L.thanks, s: "thanks" };
  merge("A", "K");

  const logo = logoImage(d.logo, b.logoSize);
  return {
    sheets: [
      { name: "Facture", columns: [7, 5, 10, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 12.5], rows, merges, heights, gridLines: false, print: { orientation: "portrait" }, images: logo ? [logo] : [] },
      { name: "Heures", columns: [12, 10, 11, 9, 34, 40, 9, 11, 10, 13], rows: hoursRows, gridLines: false, print: { orientation: "portrait" } },
      { name: "Par tâche", columns: [10, 46, 10, 14], rows: taskRows, gridLines: false, print: { orientation: "portrait" } },
      { name: "Frais", columns: [12, 10, 11, 10, 18, 30, 7, 6, 14, 7, 12, 13, 13], rows: expenseRows, gridLines: false, print: { orientation: "landscape" } },
      { name: "Par projet", columns: [12, 11, 11, 12, 10, 10, 10, 10, 10, 13], rows: projRows, heights: { 1: 22.35 }, gridLines: false, print: { orientation: "landscape" } },
    ],
    styles: STYLES,
    totals: { hours: x.hours, subtotal: x.subtotal, due: x.due, tps: x.tps, tvq: x.tvq, total: x.total, dueDate: x.dueDate },
  };
}
