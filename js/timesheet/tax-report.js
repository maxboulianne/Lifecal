// Rapport TPS / TVQ du trimestre, présenté comme la facture (logo, bleu marine et orange) :
//   1. taxes perçues : les factures du trimestre (lignes 101, 103, 203) ;
//   2. taxes payées : crédits (CTI) et remboursements (RTI) par groupe d'achats et la recharge
//      à la maison (lignes 106, 206) ;
//   3. solde à remettre (lignes 109, 209).
// Le même contenu sert à l'aperçu à l'écran, au fichier Excel et au PDF.
//
//   taxReportData(ts, quarter, { today }) -> données
//   taxReportSheets(data) -> { sheets, styles }   (pour buildXlsx)
//   taxReportPdf(data, { logo, measure }) -> Uint8Array

import { PdfWriter } from "../export/pdf.js";
import { FORMATS } from "../export/xlsx.js";
import { COLORS, INVOICE_STYLES, logoImage } from "./invoice.js";
import { purchaseTaxes, purchaseTotals, quarterHomeCharging, quarterPurchases } from "./purchases.js";
import { quarterInvoices, quarterRange, salesTotals } from "./taxes.js";

const round2 = (n) => Math.round(n * 100) / 100;
const lines = (text) => String(text ?? "").split(/\n/).map((s) => s.trim()).filter(Boolean);

// Libellés bilingues (le rapport sert au comptable et aux gouvernements)
export const REPORT_LABELS = {
  title: "RAPPORT TPS / TVQ",
  subtitle: "GST / QST RETURN",
  period: "Période / Period",
  from: "Du / From",
  to: "Au / To",
  generated: "Produit le / Generated",
  tps: "TPS / GST :",
  tvq: "TVQ / QST :",
  collected: "1. TAXES PERÇUES — FACTURES CLIENTS / GST & QST COLLECTED",
  paid: "2. TAXES PAYÉES — CRÉDITS ET REMBOURSEMENTS / INPUT TAX CREDITS & REFUNDS",
  balance: "3. SOLDE À REMETTRE / NET TAX TO REMIT",
  invoice: "Facture / Invoice",
  date: "Date",
  client: "Client",
  subtotal: "Sous-total / Subtotal",
  tpsCol: "TPS / GST",
  tvqCol: "TVQ / QST",
  tpsHstCol: "TPS-TVH / GST-HST",
  total: "Total",
  salesTotal: "Total des ventes / Total sales",
  group: "Catégorie / Category",
  count: "Nb",
  beforeTax: "Montant / Amount",
  paidTotal: "Total des taxes payées / Total paid",
  remit: "À remettre / To remit",
  lineLabels: {
    101: "Ventes et autres revenus / Sales and other revenue",
    103: "TPS perçue / GST collected",
    106: "CTI : TPS-TVH payée / ITCs: GST-HST paid",
    109: "TPS nette à remettre / Net GST to remit",
    203: "TVQ perçue / QST collected",
    206: "RTI : TVQ payée / ITRs: QST paid",
    209: "TVQ nette à remettre / Net QST to remit",
  },
  lines: "Lignes de la déclaration / Return lines",
  line: "Ligne / Line",
  amount: "Montant / Amount",
  toCheck: (n) => `Attention : ${n} achat${n > 1 ? "s" : ""} encore à confirmer dans l'application. / ${n} purchase${n > 1 ? "s" : ""} still to confirm.`,
  noInvoices: "Aucune facture pour ce trimestre. / No invoices this quarter.",
  // Onglets de détail
  purchases: "Achats",
  homeCharging: "Recharge maison",
  paidBy: "Payé par / Paid by",
  description: "Description",
  category: "Catégorie / Category",
  share: "Part / Share",
  region: "Taxe / Tax",
  periodFrom: "Du / From",
  periodTo: "Au / To",
  evAmount: "Part VÉ avant taxes / EV share before tax",
  days: "Jours / Days",
  inQuarter: "Dans le trimestre / In quarter",
  quarterShare: "Part du trimestre / Quarter share",
};
const L = REPORT_LABELS;

export const GROUP_LABELS = {
  taxable: "Achats taxables (100 %) / Taxable purchases",
  mixed: "Usage mixte (50 %) / Mixed use",
  meal: "Repas et représentation (50 %) / Meals & entertainment",
  taxableOn: "Ontario, TVH 13 % (100 %) / Ontario HST",
  mixedOn: "Ontario, TVH 13 % — mixte (50 %) / Ontario HST, mixed",
  mealOn: "Ontario, TVH 13 % — repas (50 %) / Ontario HST, meals",
  persoTaxable: "Payé personnellement — taxables / Paid personally",
  persoMixed: "Payé personnellement — mixte (50 %) / Paid personally, mixed",
  persoMeal: "Payé personnellement — repas (50 %) / Paid personally, meals",
  persoTaxableOn: "Payé personnellement — Ontario TVH / Paid personally, HST",
  persoMixedOn: "Payé personnellement — Ontario TVH mixte / HST, mixed",
  persoMealOn: "Payé personnellement — Ontario TVH repas / HST, meals",
  persoExempt: "Payé personnellement — sans TPS/TVQ / No GST/QST",
  exempt: "Sans TPS/TVQ (pour mémoire) / No GST/QST (for reference)",
  homeCharging: "Recharge à la maison (Hydro-Québec) / Home EV charging",
};
const GROUP_ORDER = Object.keys(GROUP_LABELS);
const CATEGORY_LABELS = { taxable: "Taxable", meal: "Repas / Meal", exempt: "Sans taxes / No tax", excluded: "Exclu / Excluded" };
const SOURCE_LABELS = { visa: "Visa", caisse: "Caisse", manual: "Entreprise / Business", perso: "Personnel / Personal" };
// Colonnes étroites du détail en PDF
const SOURCE_SHORT = { visa: "Visa", caisse: "Caisse", manual: "Entreprise", perso: "Perso" };
const CATEGORY_SHORT = { taxable: "Taxable", meal: "Repas", exempt: "Sans taxes", excluded: "Exclu" };

// « Avril – juin 2026 / April – June 2026 »
export function periodLabel(quarter) {
  const { from, to } = quarterRange(quarter);
  const month = (iso, lang) => new Intl.DateTimeFormat(lang, { month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const y = from.slice(0, 4);
  return `${cap(month(from, "fr-CA"))} – ${month(to, "fr-CA")} ${y} / ${month(from, "en-CA")} – ${month(to, "en-CA")} ${y}`;
}

export function taxReportData(ts, quarter, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const { from, to } = quarterRange(quarter);
  const b = ts.business ?? {};
  const invoices = quarterInvoices(ts, quarter);
  const sales = salesTotals(invoices);
  const all = quarterPurchases(ts, quarter);
  const counted = all.filter((p) => !(p.source === "perso" && p.category === "excluded") && p.category !== "excluded");
  const totals = purchaseTotals(all);
  const hc = quarterHomeCharging(ts, quarter);
  const paid = GROUP_ORDER.flatMap((key) => {
    if (key === "homeCharging") return hc.rows.length ? [{ key, label: GROUP_LABELS[key], count: hc.rows.length, amount: hc.base, tps: hc.tps, tvq: hc.tvq }] : [];
    const g = totals.groups[key];
    return g ? [{ key, label: GROUP_LABELS[key], count: g.count, amount: g.amount, tps: g.tps, tvq: g.tvq }] : [];
  });
  const paidTps = round2(paid.reduce((s, r) => s + r.tps, 0));
  const paidTvq = round2(paid.reduce((s, r) => s + r.tvq, 0));
  const balance = { tps: round2(sales.tps - paidTps), tvq: round2(sales.tvq - paidTvq) };
  balance.total = round2(balance.tps + balance.tvq);
  return {
    quarter, from, to, period: periodLabel(quarter), generated: today,
    business: { name: b.name ?? "", addressLine: lines(b.address).join(", "), contactLine: [b.phone, b.email].filter(Boolean).join("  ·  "),
      tpsNumber: b.tpsNumber ?? "", tvqNumber: b.tvqNumber ?? "", logo: b.logo ?? "", logoSize: b.logoSize ?? null },
    invoices, sales, paid, paidTotals: { tps: paidTps, tvq: paidTvq }, balance,
    lines: { 101: sales.subtotal, 103: sales.tps, 106: paidTps, 109: balance.tps, 203: sales.tvq, 206: paidTvq, 209: balance.tvq },
    purchases: counted.map((p) => ({ ...p, ...purchaseTaxes(p) })),
    homeCharging: hc.rows.map((r) => ({ ...r, tps: round2(r.share * 0.05), tvq: round2(r.share * 0.09975) })),
    toCheck: all.filter((p) => p.status === "check").length,
  };
}

// ---- Excel ----

const C = COLORS;
const font = (sz, color, extra = {}) => ({ name: "Arial", sz, color, ...extra });
const MONEY = FORMATS.moneyDash;
export const REPORT_STYLES = {
  ...INVOICE_STYLES,
  balLabel: { font: font(11, C.white, { b: true }), fill: C.navy, align: { h: "left", v: "center" } },
  balValue: { font: font(12, C.white, { b: true }), fill: C.navy, numFmt: MONEY, align: { h: "right", v: "center" } },
  balTotal: { font: font(12, C.white, { b: true }), fill: C.orange, numFmt: MONEY, align: { h: "right", v: "center" } },
  lineNo: { font: font(9, C.orange, { b: true }), border: { bottom: { style: "thin", color: C.line } }, align: { h: "center", v: "center" } },
  warn: { font: font(9, C.orange, { b: true, i: true }), align: { v: "center" } },
};

export function taxReportSheets(d) {
  const rows = [];
  const merges = [];
  const heights = {};
  const row = (height) => {
    const r = [];
    rows.push(r);
    if (height) heights[rows.length] = height;
    return r;
  };
  const at = () => rows.length;
  const merge = (a, z) => merges.push(`${a}${at()}:${z}${at()}`);
  const fill = (r, from, to, s) => { for (let i = from; i <= to; i++) r[i] ??= { v: "", s }; };
  const b = d.business;

  // En-tête : logo, titre, filet orange
  let r = row(19.5);
  r[3] = { v: L.title, s: "title" };
  row(19.5);
  merges.push("D1:G2");
  r = row(15.75);
  r[3] = { v: L.subtitle, s: "subtitle" };
  merge("D", "G");
  row(15.75);
  fill(row(6), 0, 6, "rule");
  row(6);

  // Mon entreprise (gauche) ; période (droite)
  const meta = [
    [{ v: b.name, s: "company" }, L.period, { v: d.period, s: "metaNumber" }],
    [{ v: b.addressLine, s: "info" }, L.from, { v: d.from, s: "metaDate" }],
    [{ v: b.contactLine, s: "info" }, L.to, { v: d.to, s: "metaDate" }],
    [{ v: b.tpsNumber ? `${L.tps} ${b.tpsNumber}` : "", s: "infoSmall" }, L.generated, { v: d.generated, s: "metaDate" }],
    [{ v: b.tvqNumber ? `${L.tvq} ${b.tvqNumber}` : "", s: "infoSmall" }, "", null],
  ];
  for (const [left, label, value] of meta) {
    r = row(15);
    r[0] = left;
    merge("A", "C");
    if (label) {
      r[3] = { v: label, s: "metaLabel" };
      r[4] = value;
      merge("E", "G");
    }
  }
  row(9.75);

  // 1. Taxes perçues
  r = row(18);
  r[0] = { v: L.collected, s: "section" };
  fill(r, 1, 6, "section");
  r = row(25.5);
  [L.invoice, L.date, L.client, L.subtotal, L.tpsCol, L.tvqCol, L.total].forEach((v, i) => { r[i] = { v, s: "head" }; });
  const first = at() + 1;
  for (const i of d.invoices) {
    r = row(15.75);
    const n = at();
    r[0] = { v: i.number, s: "tCell" };
    r[1] = { v: i.date, s: "tDate" };
    r[2] = { v: i.client, s: "tText" };
    r[3] = { v: i.subtotal, s: "price" };
    r[4] = { v: i.tps, s: "price" };
    r[5] = { v: i.tvq, s: "price" };
    r[6] = { f: `D${n}+E${n}+F${n}`, v: round2(i.subtotal + i.tps + i.tvq), s: "lineTotal" };
  }
  if (!d.invoices.length) {
    r = row(15.75);
    r[0] = { v: L.noInvoices, s: "tNote" };
    merge("A", "G");
  }
  const last = at();
  r = row(18);
  const salesRow = at();
  r[0] = { v: L.salesTotal, s: "sumTotal" };
  fill(r, 1, 2, "sumTotal");
  const sum = (col, v) => ({ f: d.invoices.length ? `SUM(${col}${first}:${col}${last})` : "0", v, s: "sumTotalMoney" });
  r[3] = sum("D", d.sales.subtotal);
  r[4] = sum("E", d.sales.tps);
  r[5] = sum("F", d.sales.tvq);
  r[6] = sum("G", d.sales.total);
  r = row(13);
  r[3] = { v: "Ligne 101", s: "dueLine" };
  r[4] = { v: "Ligne 103", s: "dueLine" };
  r[5] = { v: "Ligne 203", s: "dueLine" };
  row(9.75);

  // 2. Taxes payées
  r = row(18);
  r[0] = { v: L.paid, s: "section" };
  fill(r, 1, 6, "section");
  r = row(25.5);
  r[0] = { v: L.group, s: "headLeft" };
  merge("A", "C");
  fill(r, 1, 2, "headLeft");
  [L.count, L.beforeTax, L.tpsHstCol, L.tvqCol].forEach((v, i) => { r[3 + i] = { v, s: "head" }; });
  const pFirst = at() + 1;
  for (const g of d.paid) {
    r = row(15.75);
    r[0] = { v: g.label, s: "sumProject" };
    merge("A", "C");
    fill(r, 1, 2, "sumProject");
    r[3] = { v: g.count, s: "tCell" };
    r[4] = { v: g.amount, s: "sumMoney" };
    r[5] = { v: g.tps, s: "sumMoney" };
    r[6] = { v: g.tvq, s: "sumMoney" };
  }
  const pLast = at();
  r = row(18);
  const paidRow = at();
  r[0] = { v: L.paidTotal, s: "sumTotal" };
  merge("A", "C");
  fill(r, 1, 4, "sumTotal");
  r[5] = { f: d.paid.length ? `SUM(F${pFirst}:F${pLast})` : "0", v: d.paidTotals.tps, s: "sumTotalMoney" };
  r[6] = { f: d.paid.length ? `SUM(G${pFirst}:G${pLast})` : "0", v: d.paidTotals.tvq, s: "sumTotalMoney" };
  r = row(13);
  r[5] = { v: "Ligne 106", s: "dueLine" };
  r[6] = { v: "Ligne 206", s: "dueLine" };
  row(9.75);

  // 3. Solde à remettre
  r = row(18);
  r[0] = { v: L.balance, s: "section" };
  fill(r, 1, 6, "section");
  r = row(15);
  r[4] = { v: L.tpsCol, s: "sumHead" };
  r[5] = { v: L.tvqCol, s: "sumHead" };
  r[6] = { v: L.total, s: "sumHead" };
  r = row(24);
  const balRow = at();
  r[0] = { v: L.remit, s: "balLabel" };
  fill(r, 1, 3, "balLabel");
  r[4] = { f: `E${salesRow}-F${paidRow}`, v: d.balance.tps, s: "balValue" };
  r[5] = { f: `F${salesRow}-G${paidRow}`, v: d.balance.tvq, s: "balValue" };
  r[6] = { f: `E${balRow}+F${balRow}`, v: d.balance.total, s: "balTotal" };
  r = row(13);
  r[4] = { v: "Ligne 109", s: "dueLine" };
  r[5] = { v: "Ligne 209", s: "dueLine" };
  row(9.75);

  // Lignes de la déclaration
  r = row(18);
  r[0] = { v: L.lines, s: "section" };
  fill(r, 1, 6, "section");
  const refs = { 101: `D${salesRow}`, 103: `E${salesRow}`, 106: `F${paidRow}`, 109: `E${balRow}`, 203: `F${salesRow}`, 206: `G${paidRow}`, 209: `F${balRow}` };
  for (const no of [101, 103, 106, 109, 203, 206, 209]) {
    r = row(15.75);
    r[0] = { v: no, s: "lineNo" };
    r[1] = { v: L.lineLabels[no], s: "desc" };
    merge("B", "F");
    fill(r, 2, 5, "desc");
    r[6] = { f: refs[no], v: d.lines[no], s: no === 109 || no === 209 ? "totValueBold" : "totValue" };
  }
  if (d.toCheck) {
    row(9.75);
    r = row(15);
    r[0] = { v: L.toCheck(d.toCheck), s: "warn" };
    merge("A", "G");
  }

  // Onglet « Achats » : le détail de ce qui est compté
  const pRows = [[L.date, L.paidBy, L.description, L.amount, L.category, L.share, L.region, L.beforeTax, L.tpsHstCol, L.tvqCol]
    .map((v) => ({ v, s: "tHead" }))];
  for (const p of d.purchases) {
    pRows.push([
      { v: p.date, s: "tDate" }, { v: SOURCE_LABELS[p.source] ?? p.source, s: "tCell" }, { v: p.description, s: "tText" },
      { v: p.amount, s: "tMoney" }, { v: CATEGORY_LABELS[p.category] ?? p.category, s: "tCell" }, { v: `${Math.round(p.pct * 100)} %`, s: "tCell" },
      { v: p.tax === "on" ? "TVH ON 13 %" : "TPS + TVQ", s: "tCell" }, { v: round2(p.base), s: "tMoney" }, { v: round2(p.tps), s: "tMoney" }, { v: round2(p.tvq), s: "tMoney" },
    ]);
  }
  const n = pRows.length;
  const total = (k) => round2(d.purchases.reduce((s, p) => s + round2(p[k]), 0));
  const sumCol = (col, k) => ({ f: n > 1 ? `SUM(${col}2:${col}${n})` : "0", v: total(k), s: "tTotalMoney" });
  pRows.push([{ v: L.total, s: "tTotal" }, { v: "", s: "tTotal" }, { v: "", s: "tTotal" }, sumCol("D", "amount"), { v: "", s: "tTotal" }, { v: "", s: "tTotal" },
    { v: "", s: "tTotal" }, sumCol("H", "base"), sumCol("I", "tps"), sumCol("J", "tvq")]);

  // Onglet « Recharge maison »
  const hRows = [[L.periodFrom, L.periodTo, L.evAmount, L.days, L.inQuarter, L.quarterShare, L.tpsCol, L.tvqCol].map((v) => ({ v, s: "tHead" }))];
  for (const c of d.homeCharging) {
    const k = hRows.length + 1;
    hRows.push([{ v: c.from, s: "tDate" }, { v: c.to, s: "tDate" }, { v: c.amount, s: "tMoney" }, { v: c.days, s: "tCell" }, { v: c.inQuarter, s: "tCell" },
      { f: `ROUND(C${k}*E${k}/D${k},2)`, v: c.share, s: "tMoney" }, { f: `ROUND(F${k}*0.05,2)`, v: c.tps, s: "tMoney" }, { f: `ROUND(F${k}*0.09975,2)`, v: c.tvq, s: "tMoney" }]);
  }

  const logo = logoImage(b.logo, b.logoSize);
  return {
    sheets: [
      { name: "Rapport", columns: [13, 11, 26, 18, 15, 13, 14], rows, merges, heights, gridLines: false, print: { orientation: "portrait" }, images: logo ? [logo] : [] },
      { name: L.purchases, columns: [11, 16, 42, 12, 15, 8, 13, 13, 13, 12], rows: pRows, gridLines: false, print: { orientation: "landscape" } },
      { name: L.homeCharging, columns: [12, 12, 16, 9, 12, 14, 11, 11], rows: hRows, gridLines: false, print: { orientation: "landscape" } },
    ],
    styles: REPORT_STYLES,
  };
}

// ---- PDF ----

const P = { navy: "#2C4A6E", orange: "#E0491A", gray: "#6B7280", ink: "#1F2937", text: "#374151", light: "#EEF2F7", line: "#C9D2DE", white: "#FFFFFF" };
const PAGE_W = 612;
const PAGE_H = 792;
const M = 36;
const RIGHT = PAGE_W - M;
const pdfMoney = (n) => `${Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

export function taxReportPdf(d, { logo = null, measure } = {}) {
  const pdf = new PdfWriter({ measure, title: `Rapport TPS-TVQ ${d.period}` });
  const logoImg = logo ? pdf.addJpeg(logo.bytes) : null;
  let page = pdf.addPage(PAGE_W, PAGE_H);
  let y;
  const fit = (text, width, o) => {
    let s = String(text ?? "");
    if (page.measure(s, o) <= width) return s;
    while (s.length > 1 && page.measure(`${s}…`, o) > width) s = s.slice(0, -1);
    return `${s}…`;
  };
  const newPage = () => {
    page = pdf.addPage(PAGE_W, PAGE_H);
    y = M + 10;
  };
  const room = (h) => { if (y + h > PAGE_H - M) newPage(); };
  const section = (title) => {
    room(60);
    y += 4;
    page.text(title, M, y, { size: 8.5, bold: true, color: P.navy });
    page.line(M, y + 4, RIGHT, y + 4, { color: P.navy });
    y += 12;
  };
  // Tableau : colonnes { title, x, w, right }, lignes de cellules (texte), styles optionnels
  const table = (cols, data, { total = null } = {}) => {
    const head = () => {
      page.rect(M, y, RIGHT - M, 16, { fill: P.navy });
      for (const c of cols) page.text(c.title, c.right ? c.x + c.w - 3 : c.x + 3, y + 11, { size: 7.5, bold: true, color: P.white, align: c.right ? "right" : "left" });
      y += 16;
    };
    head();
    for (const cells of data) {
      if (y + 14 > PAGE_H - M) {
        newPage();
        head();
      }
      const o = { size: 8.5, color: P.ink };
      cols.forEach((c, i) => page.text(fit(cells[i], c.w - 6, o), c.right ? c.x + c.w - 3 : c.x + 3, y + 10.5, { ...o, align: c.right ? "right" : "left" }));
      y += 14;
      page.line(M, y, RIGHT, y, { color: P.line });
    }
    if (total) {
      room(20);
      page.rect(M, y, RIGHT - M, 18, { fill: P.light });
      const o = { size: 8.5, bold: true, color: P.navy };
      cols.forEach((c, i) => total[i] && page.text(total[i], c.right ? c.x + c.w - 3 : c.x + 3, y + 12, { ...o, align: c.right ? "right" : "left" }));
      y += 18;
    }
  };
  const lineNotes = (notes) => {
    for (const [x, text] of notes) page.text(text, x, y + 9, { size: 7, italic: true, color: P.gray, align: "right" });
    y += 16;
  };

  // En-tête
  if (logoImg) {
    const scale = Math.min(170 / logoImg.width, 66 / logoImg.height);
    page.image(logoImg, M, M, logoImg.width * scale, logoImg.height * scale);
  }
  page.text(L.title, RIGHT, M + 40, { size: 22, bold: true, color: P.navy, align: "right" });
  page.text(L.subtitle, RIGHT, M + 54, { size: 9, bold: true, color: P.orange, align: "right" });
  y = M + 74;
  page.line(M, y, RIGHT, y, { color: P.orange, width: 2.5 });
  y += 18;
  const b = d.business;
  [[b.name, { size: 11, bold: true, color: P.navy }], [b.addressLine, { size: 8.5, color: P.text }], [b.contactLine, { size: 8.5, color: P.text }],
    [b.tpsNumber ? `${L.tps} ${b.tpsNumber}` : "", { size: 8, color: P.gray }], [b.tvqNumber ? `${L.tvq} ${b.tvqNumber}` : "", { size: 8, color: P.gray }]]
    .forEach(([text, o], i) => text && page.text(fit(text, 290, o), M, y + i * 14, o));
  [[L.period, d.period.split(" / ")[0], { size: 10, bold: true, color: P.orange }], [L.from, d.from, { size: 9, color: P.ink }], [L.to, d.to, { size: 9, color: P.ink }],
    [L.generated, d.generated, { size: 9, color: P.ink }]].forEach(([label, value, o], i) => {
    const top = y - 10 + i * 15;
    page.rect(RIGHT - 130, top, 130, 14, { fill: P.light });
    page.text(label, RIGHT - 136, top + 10, { size: 8, bold: true, color: P.gray, align: "right" });
    page.text(value, RIGHT - 5, top + 10.5, { ...o, align: "right" });
  });
  y += 5 * 14 + 4;
  // Achats encore à confirmer : en haut, pour ne pas l'oublier
  if (d.toCheck) {
    page.rect(M, y, RIGHT - M, 18, { fill: "#FFF4E5" });
    page.text(fit(L.toCheck(d.toCheck), RIGHT - M - 16, { size: 8.5, bold: true }), M + 8, y + 12, { size: 8.5, bold: true, color: P.orange });
    y += 26;
  }

  // 1. Taxes perçues
  section(L.collected);
  const inv = [
    { title: L.invoice, x: M, w: 70 }, { title: L.date, x: M + 70, w: 62 }, { title: L.client, x: M + 132, w: 140 },
    { title: L.subtotal, x: M + 272, w: 80, right: true }, { title: L.tpsCol, x: M + 352, w: 62, right: true },
    { title: L.tvqCol, x: M + 414, w: 62, right: true }, { title: L.total, x: M + 476, w: 64, right: true },
  ];
  table(inv, d.invoices.length ? d.invoices.map((i) => [i.number, i.date, i.client, pdfMoney(i.subtotal), pdfMoney(i.tps), pdfMoney(i.tvq), pdfMoney(i.subtotal + i.tps + i.tvq)])
    : [[L.noInvoices, "", "", "", "", "", ""]], { total: [L.salesTotal.split(" / ")[0], "", "", pdfMoney(d.sales.subtotal), pdfMoney(d.sales.tps), pdfMoney(d.sales.tvq), pdfMoney(d.sales.total)] });
  lineNotes([[M + 352 - 3, "Ligne 101"], [M + 414 - 3, "Ligne 103"], [M + 476 - 3, "Ligne 203"]]);

  // 2. Taxes payées
  section(L.paid);
  const grp = [{ title: L.group, x: M, w: 268 }, { title: L.count, x: M + 268, w: 34, right: true }, { title: L.beforeTax, x: M + 302, w: 98, right: true },
    { title: "TPS-TVH", x: M + 400, w: 70, right: true }, { title: "TVQ", x: M + 470, w: 70, right: true }];
  table(grp, d.paid.map((g) => [g.label, String(g.count), pdfMoney(g.amount), pdfMoney(g.tps), pdfMoney(g.tvq)]),
    { total: [L.paidTotal.split(" / ")[0], "", "", pdfMoney(d.paidTotals.tps), pdfMoney(d.paidTotals.tvq)] });
  lineNotes([[M + 470 - 3, "Ligne 106"], [M + 540 - 3, "Ligne 206"]]);

  // 3. Solde à remettre
  section(L.balance);
  room(60);
  page.rect(M, y, RIGHT - M, 34, { fill: P.navy });
  page.text(L.remit, M + 10, y + 21, { size: 11, bold: true, color: P.white });
  page.text("TPS / GST", M + 300, y + 12, { size: 7.5, bold: true, color: P.white, align: "right" });
  page.text(pdfMoney(d.balance.tps), M + 300, y + 27, { size: 11, bold: true, color: P.white, align: "right" });
  page.text("TVQ / QST", M + 400, y + 12, { size: 7.5, bold: true, color: P.white, align: "right" });
  page.text(pdfMoney(d.balance.tvq), M + 400, y + 27, { size: 11, bold: true, color: P.white, align: "right" });
  page.rect(M + 420, y, RIGHT - M - 420, 34, { fill: P.orange });
  page.text("TOTAL", RIGHT - 8, y + 12, { size: 7.5, bold: true, color: P.white, align: "right" });
  page.text(pdfMoney(d.balance.total), RIGHT - 8, y + 27, { size: 12, bold: true, color: P.white, align: "right" });
  y += 34;
  lineNotes([[M + 300, "Ligne 109"], [M + 400, "Ligne 209"]]);

  // Lignes de la déclaration
  section(L.lines);
  table([{ title: L.line, x: M, w: 50 }, { title: L.description, x: M + 50, w: 390 }, { title: L.amount, x: M + 440, w: 100, right: true }],
    [101, 103, 106, 109, 203, 206, 209].map((no) => [String(no), L.lineLabels[no], pdfMoney(d.lines[no])]));

  // Détail des achats comptés
  if (d.purchases.length) {
    newPage();
    page.text(`${L.purchases.toUpperCase()} — ${d.period}`, M, y + 6, { size: 12, bold: true, color: P.navy });
    y += 22;
    table([{ title: "Date", x: M, w: 56 }, { title: "Payé par", x: M + 56, w: 50 }, { title: L.description, x: M + 106, w: 206 },
      { title: "Catégorie", x: M + 312, w: 80 }, { title: "Montant", x: M + 392, w: 52, right: true }, { title: "TPS-TVH", x: M + 444, w: 48, right: true },
      { title: "TVQ", x: M + 492, w: 48, right: true }],
    d.purchases.map((p) => [p.date, SOURCE_SHORT[p.source] ?? p.source, p.description,
      `${CATEGORY_SHORT[p.category] ?? p.category}${p.pct !== 1 ? ` ${Math.round(p.pct * 100)} %` : ""}${p.tax === "on" ? " TVH" : ""}`,
      pdfMoney(p.amount), pdfMoney(p.tps), pdfMoney(p.tvq)]),
    { total: [L.total, "", "", "", pdfMoney(d.purchases.reduce((s, p) => s + p.amount, 0)), pdfMoney(d.purchases.reduce((s, p) => s + p.tps, 0)), pdfMoney(d.purchases.reduce((s, p) => s + p.tvq, 0))] });
  }
  return pdf.save();
}
