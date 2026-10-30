// PDF des justificatifs d'une facture, envoyé au client dans un fichier séparé :
//   1. un sommaire : chaque dépense facturée (date, projet, type, montant) et ses pièces ;
//   2. une page par dépense : sa facture et sa preuve de transaction côte à côte.
// Les justificatifs reçus en PDF (ex. CamScanner) sont envoyés à part, à côté : le
// sommaire les nomme.
//
//   receiptsPdf(data, files, { measure }) -> Uint8Array
//     data  : invoiceData() (data.expenseLines)
//     files : { [idDuFichier]: { bytes, width, height } }  (JPEG prêts à insérer)

import { PdfWriter } from "../export/pdf.js";
import { EXPENSE_LABELS } from "./invoice.js";

const C = { navy: "#2C4A6E", orange: "#E0491A", gray: "#6B7280", ink: "#1F2937", light: "#EEF2F7", line: "#C9D2DE", white: "#FFFFFF" };
const PAGE_W = 612;
const PAGE_H = 792;
const M = 36;
const RIGHT = PAGE_W - M;
const money = (n) => `${Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
export const KIND_LABELS = { invoice: "Facture / Invoice", proof: "Preuve de transaction / Proof of payment", other: "Justificatif / Receipt" };
const KIND_ORDER = { invoice: 0, proof: 1, other: 2 };

export function receiptsPdf(d, files = {}, { measure } = {}) {
  const pdf = new PdfWriter({ measure, title: `Justificatifs — Facture ${d.number}` });
  const lines = d.expenseLines;
  const images = new Map(Object.entries(files).map(([id, f]) => [id, pdf.addJpeg(f.bytes)]));
  const fit = (page, text, width, o) => {
    let s = String(text ?? "");
    if (page.measure(s, o) <= width) return s;
    while (s.length > 1 && page.measure(`${s}…`, o) > width) s = s.slice(0, -1);
    return `${s}…`;
  };
  const describe = (l) => `${EXPENSE_LABELS[l.type]}${l.description ? ` : ${l.description}` : ""}`;

  // ---- Sommaire ----
  let page = pdf.addPage(PAGE_W, PAGE_H);
  let y = M + 24;
  page.text("JUSTIFICATIFS", M, y, { size: 22, bold: true, color: C.navy });
  page.text("RECEIPTS", M, y + 14, { size: 9, bold: true, color: C.orange });
  page.text(`Facture / Invoice ${d.number}`, RIGHT, y, { size: 12, bold: true, color: C.orange, align: "right" });
  page.text(d.date, RIGHT, y + 14, { size: 9, color: C.ink, align: "right" });
  y += 30;
  page.line(M, y, RIGHT, y, { color: C.orange, width: 2.5 });
  y += 20;
  page.text(d.business.name, M, y, { size: 10, bold: true, color: C.navy });
  page.text(d.client.name, RIGHT, y, { size: 10, bold: true, color: C.navy, align: "right" });
  y += 24;

  const cols = [
    { title: "Date", x: M + 4, w: 60 }, { title: "Projet / Project", x: M + 66, w: 62 },
    { title: "Description", x: M + 132, w: 220 }, { title: "Pièces / Files", x: M + 360, w: 110 },
    { title: "Montant / Amount", x: RIGHT - 4, w: 70, right: true },
  ];
  const head = () => {
    page.rect(M, y, RIGHT - M, 18, { fill: C.navy });
    for (const c of cols) page.text(c.title, c.x, y + 12, { size: 8, bold: true, color: C.white, align: c.right ? "right" : "left" });
    y += 18;
  };
  head();
  let total = 0;
  for (const l of lines) {
    if (y > PAGE_H - M - 40) {
      page = pdf.addPage(PAGE_W, PAGE_H);
      y = M + 10;
      head();
    }
    const pics = l.attachments.filter((a) => a.type !== "application/pdf").length;
    const pdfs = l.attachments.filter((a) => a.type === "application/pdf");
    const filesText = !l.attachments.length ? "Manquant / Missing" : [pics ? `${pics} photo${pics > 1 ? "s" : ""}` : "", ...pdfs.map((a) => a.name || "PDF")].filter(Boolean).join(", ");
    const o = { size: 8.5, color: C.ink };
    page.text(l.date, cols[0].x, y + 12, o);
    page.text(fit(page, l.project, cols[1].w, o), cols[1].x, y + 12, o);
    page.text(fit(page, describe(l), cols[2].w, o), cols[2].x, y + 12, o);
    page.text(fit(page, filesText, cols[3].w, o), cols[3].x, y + 12, { ...o, color: l.attachments.length ? C.ink : C.orange, bold: !l.attachments.length });
    page.text(money(l.amount), cols[4].x, y + 12, { ...o, align: "right" });
    total += l.amount;
    y += 17;
    page.line(M, y, RIGHT, y, { color: C.line });
  }
  page.rect(M, y, RIGHT - M, 18, { fill: C.light });
  page.text("TOTAL", cols[0].x, y + 12.5, { size: 9, bold: true, color: C.navy });
  page.text(money(Math.round(total * 100) / 100), cols[4].x, y + 12.5, { size: 9, bold: true, color: C.navy, align: "right" });
  y += 34;
  const sentApart = lines.flatMap((l) => l.attachments.filter((a) => a.type === "application/pdf"));
  if (sentApart.length) {
    page.text("Justificatifs en PDF joints séparément / PDF receipts attached separately :", M, y, { size: 8, italic: true, color: C.gray });
    sentApart.forEach((a, i) => page.text(`• ${a.name || "PDF"}`, M + 10, y + 13 + i * 12, { size: 8, color: C.gray }));
  }

  // ---- Une page par dépense : ses images, côte à côte (deux par page) ----
  for (const l of lines) {
    const pics = l.attachments.filter((a) => images.has(a.id)).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    for (let k = 0; k < pics.length; k += 2) {
      page = pdf.addPage(PAGE_W, PAGE_H);
      page.rect(M, M, RIGHT - M, 30, { fill: C.light });
      page.rect(M, M, 3, 30, { fill: C.orange });
      page.text(`${l.date}  ·  ${l.project}`, M + 10, M + 13, { size: 9, bold: true, color: C.navy });
      page.text(fit(page, describe(l), 380, { size: 8.5 }), M + 10, M + 25, { size: 8.5, color: C.ink });
      page.text(money(l.amount), RIGHT - 8, M + 19, { size: 11, bold: true, color: C.navy, align: "right" });
      const pair = pics.slice(k, k + 2);
      const top = M + 52;
      const boxW = (RIGHT - M - (pair.length - 1) * 16) / pair.length;
      const boxH = PAGE_H - M - top - 14;
      pair.forEach((a, i) => {
        const img = images.get(a.id);
        const x0 = M + i * (boxW + 16);
        page.text(KIND_LABELS[a.kind], x0, top - 6, { size: 8, bold: true, color: C.orange });
        const scale = Math.min(boxW / img.width, boxH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        page.image(img, x0 + (boxW - w) / 2, top, w, h);
        page.rect(x0 + (boxW - w) / 2, top, w, h, { stroke: C.line });
      });
    }
  }
  return pdf.save();
}
