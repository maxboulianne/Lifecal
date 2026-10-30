// Facture en PDF pour le client : même présentation que la facture Excel approuvée
// (logo, bleu marine et orange, lignes jour par jour, sommaire par projet, totaux).
// Le contenu vient de invoiceData() ; le texte est dessiné (net et sélectionnable).
//
//   invoicePdf(data, { logo: { bytes, width, height } (JPEG), measure }) -> Uint8Array

import { PdfWriter } from "../export/pdf.js";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, INVOICE_LABELS as L } from "./invoice.js";

const C = { navy: "#2C4A6E", orange: "#E0491A", gray: "#6B7280", ink: "#1F2937", text: "#374151", light: "#EEF2F7", head: "#DCE4EE", line: "#C9D2DE", white: "#FFFFFF" };
const PAGE_W = 612;
const PAGE_H = 792;
const M = 36; // marge
const RIGHT = PAGE_W - M;

// Montants comme sur la facture : « 1,075.02 $ », « – » pour zéro
const money = (n) => `${Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const moneyDash = (n) => (n ? money(n) : "–");
const hours = (n) => Number(n).toFixed(2);
const hoursDash = (n) => (n ? hours(n) : "–");
const oneLine = (s) => String(s ?? "").replace(/\n/g, " ");

export function invoicePdf(d, { logo = null, measure } = {}) {
  const pdf = new PdfWriter({ measure, title: `Facture ${d.number}` });
  const logoImg = logo ? pdf.addJpeg(logo.bytes) : null;
  let page;
  let y;

  // Tronquer un texte trop long pour sa colonne
  const fit = (text, width, o) => {
    let s = oneLine(text);
    if (page.measure(s, o) <= width) return s;
    while (s.length > 1 && page.measure(`${s}…`, o) > width) s = s.slice(0, -1);
    return `${s}…`;
  };

  // ---- En-tête (première page) ----
  page = pdf.addPage(PAGE_W, PAGE_H);
  if (logoImg) {
    const scale = Math.min(170 / logoImg.width, 66 / logoImg.height);
    page.image(logoImg, M, M, logoImg.width * scale, logoImg.height * scale);
  }
  page.text(L.title, RIGHT, M + 40, { size: 26, bold: true, color: C.navy, align: "right" });
  page.text(L.subtitle, RIGHT, M + 54, { size: 9, bold: true, color: C.orange, align: "right" });
  y = M + 74;
  page.line(M, y, RIGHT, y, { color: C.orange, width: 2.5 });
  y += 18;

  // Mon entreprise (gauche) et références (droite)
  const b = d.business;
  const from = [
    [b.name, { size: 11, bold: true, color: C.navy }],
    [d.addressLine, { size: 8.5, color: C.text }],
    [d.contactLine, { size: 8.5, color: C.text }],
    [b.tpsNumber ? `${L.tps} ${b.tpsNumber}` : "", { size: 8, color: C.gray }],
    [b.tvqNumber ? `${L.tvq} ${b.tvqNumber}` : "", { size: 8, color: C.gray }],
  ];
  from.forEach(([text, o], i) => text && page.text(fit(text, 300, o), M, y + i * 14, o));
  const refs = [
    [L.number, d.number, { size: 11, bold: true, color: C.orange }],
    [L.date, d.date, { size: 9, color: C.ink }],
    [L.po, d.po, { size: 9, color: C.ink }],
    [L.terms, `NET${d.totals.terms}`, { size: 9, color: C.ink }],
    [L.dueDate, d.totals.dueDate, { size: 9.5, bold: true, color: C.navy }],
  ];
  refs.forEach(([label, value, o], i) => {
    const top = y - 10 + i * 15;
    page.rect(RIGHT - 92, top, 92, 14, { fill: C.light });
    page.text(label, RIGHT - 100, top + 10, { size: 8, bold: true, color: C.gray, align: "right" });
    page.text(value ?? "", RIGHT - 5, top + 10.5, { ...o, align: "right" });
  });
  y += 5 * 15 + 10;

  // Facturé à / Expédié à
  const c = d.client;
  const party = (x, title, withEmail) => {
    page.text(title, x, y, { size: 8, bold: true, color: C.orange });
    page.line(x, y + 4, x + 250, y + 4, { color: C.line });
    let yy = y + 18;
    page.text(fit(c.name, 250, { size: 10.5, bold: true }), x, yy, { size: 10.5, bold: true, color: C.navy });
    for (const l of [c.attn, ...c.lines]) {
      if (!l) continue;
      yy += 13;
      page.text(fit(l, 250, { size: 8.5 }), x, yy, { size: 8.5, color: C.ink });
    }
    if (withEmail && c.email) {
      yy += 13;
      page.text(fit(c.email, 250, { size: 8.5 }), x, yy, { size: 8.5, color: C.gray });
    }
    return yy;
  };
  y = Math.max(party(M, L.billedTo, true), party(PAGE_W / 2 + 10, L.shippedTo, false)) + 22;

  // ---- Lignes, jour par jour ----
  const col = { qty: M + 30, unit: M + 52, price: M + 112, desc: M + 120, total: RIGHT - 4 };
  const descWidth = RIGHT - 80 - col.desc;
  const tableHead = () => {
    page.rect(M, y, RIGHT - M, 24, { fill: C.navy });
    const o = { size: 8, bold: true, color: C.white };
    page.text("Qté", col.qty, y + 10, { ...o, align: "right" });
    page.text("Qty", col.qty, y + 19, { ...o, align: "right" });
    page.text(L.unit, col.unit, y + 15, { ...o, align: "center" });
    page.text("Prix unit.", col.price, y + 10, { ...o, align: "right" });
    page.text("Unit price", col.price, y + 19, { ...o, align: "right" });
    page.text(L.description, col.desc, y + 15, o);
    page.text(L.total, col.total, y + 15, { ...o, align: "right" });
    y += 24;
  };
  const newPage = () => {
    page = pdf.addPage(PAGE_W, PAGE_H);
    y = M + 10;
    page.text(`${L.title} ${d.number}`, M, y, { size: 9, bold: true, color: C.navy });
    page.text(b.name, RIGHT, y, { size: 8, color: C.gray, align: "right" });
    y += 14;
  };
  const room = (h) => {
    if (y + h > PAGE_H - M - 20) {
      newPage();
      tableHead();
    }
  };
  tableHead();
  for (const day of d.days) {
    room(18 + 16);
    page.rect(M, y, RIGHT - M, 16, { fill: C.light });
    page.rect(M, y, 3, 16, { fill: C.orange });
    page.text(day.date, M + 8, y + 11.5, { size: 9, bold: true, color: C.navy });
    page.text(day.weekday, col.desc, y + 11.5, { size: 8.5, bold: true, color: C.gray });
    y += 16;
    for (const l of day.lines) {
      const expense = l.kind === "expense";
      const lines = page.wrap(l.text, descWidth, { size: 8.5 });
      const h = Math.max(15, 4 + lines.length * 11);
      room(h);
      page.text(hours(expense ? l.qty : l.hours), col.qty, y + 10.5, { size: 8.5, color: C.ink, align: "right" });
      page.text(expense ? l.unit : "HR", col.unit, y + 10.5, { size: 8, color: C.gray, align: "center" });
      page.text(moneyDash(expense ? l.unitPrice : l.rate), col.price, y + 10.5, { size: 8.5, color: C.ink, align: "right" });
      lines.forEach((t, i) => page.text(t, col.desc, y + 10.5 + i * 11, { size: 8.5, color: C.ink }));
      page.text(moneyDash(l.amount), col.total, y + 10.5, { size: 8.5, bold: true, color: C.ink, align: "right" });
      y += h;
      page.line(M, y, RIGHT, y, { color: C.line });
    }
  }
  y += 16;

  // ---- Sommaire des heures et frais ----
  const sumRows = d.summary.length + 3;
  if (y + sumRows * 15 + 20 > PAGE_H - M - 20) newPage();
  page.text(L.summary, M, y, { size: 8.5, bold: true, color: C.navy });
  page.line(M, y + 4, RIGHT, y + 4, { color: C.navy });
  y += 8;
  const heads = [L.project, L.regHours, L.otHours, L.hoursAmount, ...EXPENSE_CATEGORIES.map((k) => CATEGORY_LABELS[k]), L.total];
  const widths = [64, 50, 46, 58, 48, 46, 50, 44, 50, 0];
  widths[9] = RIGHT - M - widths.slice(0, 9).reduce((s, w) => s + w, 0);
  const xs = widths.reduce((acc, w) => [...acc, acc.at(-1) + w], [M]);
  page.rect(M, y, RIGHT - M, 24, { fill: C.head });
  heads.forEach((h, i) => {
    const [l1, l2] = h.split("\n");
    const cx = xs[i] + widths[i] / 2;
    page.text(l1, cx, y + (l2 ? 10 : 15), { size: 7.5, bold: true, color: C.navy, align: "center" });
    if (l2) page.text(l2, cx, y + 19, { size: 7.5, bold: true, color: C.navy, align: "center" });
  });
  y += 24;
  const cells = (r) => [r.project ?? L.totals, hoursDash(r.regHours), hoursDash(r.otHours), moneyDash(r.amount),
    ...EXPENSE_CATEGORIES.map((k) => moneyDash(r.expenses[k])), moneyDash(r.total)];
  for (const r of d.summary) {
    cells(r).forEach((v, i) => page.text(i === 0 ? fit(v, widths[0] - 6, { size: 8.5 }) : v, i === 0 ? xs[0] + 4 : xs[i + 1] - 4, y + 11, { size: 8.5, color: C.ink, align: i === 0 ? "left" : "right" }));
    y += 15;
    page.line(M, y, RIGHT, y, { color: C.line });
  }
  const st = d.summaryTotals;
  page.rect(M, y, RIGHT - M, 16, { fill: C.light });
  page.line(M, y, RIGHT, y, { color: C.navy, width: 1.2 });
  cells({ ...st, project: L.totals, regHours: st.regHours || 0, otHours: st.otHours || 0 }).forEach((v, i) => {
    const text = i === 1 ? hours(st.regHours) : i === 2 ? hours(st.otHours) : v;
    page.text(text, i === 0 ? xs[0] + 4 : xs[i + 1] - 4, y + 11.5, { size: 8.5, bold: true, color: C.navy, align: i === 0 ? "left" : "right" });
  });
  y += 30;

  // ---- Paiement (gauche) et totaux (droite) ----
  if (y + 150 > PAGE_H - M) newPage();
  const x = d.totals;
  const left = [
    [L.cheque, { size: 7.5, bold: true, color: C.orange }], [b.name, { size: 9.5, bold: true, color: C.navy }],
    [L.receivable, { size: 8.5, color: C.ink }], [d.addressLine, { size: 8.5, color: C.ink }], ["", {}],
    [L.requests, { size: 7.5, bold: true, color: C.orange }], [d.requestsLine, { size: 8.5, color: C.ink }],
  ];
  left.forEach(([t, o], i) => t && page.text(fit(t, 290, o), M, y + i * 15, o));
  const labelX = RIGHT - 96;
  const rows = [
    [L.subtotal, money(x.subtotal), false], [L.advance, moneyDash(x.advance), false], [L.due, money(x.due), true],
    [L.tpsLine, money(x.tps), false], [L.tvqLine, money(x.tvq), false], [L.freight, L.included, false],
  ];
  rows.forEach(([label, value, bold], i) => {
    const yy = y + i * 15;
    page.text(label, labelX, yy, { size: 8.5, bold, color: C.text, align: "right" });
    page.text(value, RIGHT - 4, yy, { size: 9, bold, color: C.ink, align: "right" });
    page.line(RIGHT - 90, yy + 4, RIGHT, yy + 4, { color: C.line });
  });
  const payY = y + rows.length * 15 - 4;
  page.rect(RIGHT - 300, payY, 208, 26, { fill: C.navy });
  page.rect(RIGHT - 92, payY, 92, 26, { fill: C.orange });
  page.text(L.pay, RIGHT - 100, payY + 17, { size: 10.5, bold: true, color: C.white, align: "right" });
  page.text(money(x.total), RIGHT - 5, payY + 17.5, { size: 12, bold: true, color: C.white, align: "right" });
  page.text(`${L.dueDate} : ${x.dueDate}  ·  NET${x.terms}`, RIGHT, payY + 40, { size: 8, bold: true, color: C.gray, align: "right" });
  y = Math.max(y + left.length * 15, payY + 48) + 12;
  page.line(M, y, RIGHT, y, { color: C.orange });
  page.text(L.thanks, PAGE_W / 2, y + 18, { size: 9, bold: true, italic: true, color: C.navy, align: "center" });

  return pdf.save();
}
