import { test } from "node:test";
import assert from "node:assert/strict";
import { PdfWriter, jpegInfo, winAnsi } from "../js/export/pdf.js";
import { detectDocument, enhanceDocument, warpDocument } from "../js/scan/scan.js";

// Plus petit JPEG valide (1 × 1 gris), pour les tests
const TINY_JPEG = Uint8Array.from(atob(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
), (c) => c.charCodeAt(0));

test("PDF : texte WinAnsi, structure, images JPEG", () => {
  assert.deepEqual(winAnsi("é—·✓"), [0xe9, 0x97, 0xb7, 0x3f]);
  assert.deepEqual(jpegInfo(TINY_JPEG), { width: 1, height: 1, components: 1 });
  const pdf = new PdfWriter({ title: "Essai" });
  const page = pdf.addPage();
  page.text("Bonjour (été) \\", 40, 60, { bold: true, color: "#2C4A6E" }).rect(40, 80, 100, 20, { fill: "#EEF2F7", stroke: "#C9D2DE" }).line(40, 110, 200, 110);
  page.image(pdf.addJpeg(TINY_JPEG), 40, 120, 50, 50);
  pdf.addPage().text("2", 40, 60);
  const bytes = pdf.save();
  const text = new TextDecoder("latin1").decode(bytes);
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.match(text, /\/Count 2/);
  assert.match(text, /\(Bonjour \\\(\\351t\\351\\\) \\\\\) Tj/);
  assert.match(text, /\/Filter \/DCTDecode/);
  // la table xref pointe bien sur les objets
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(xref, xref + 4), "xref");
  const first = Number(text.slice(xref).split("\n")[3].slice(0, 10));
  assert.equal(text.slice(first, first + 7), "1 0 obj");
  assert.deepEqual(page.wrap("un deux trois quatre", 30, { size: 10 }).length > 1, true);
});

// Photo synthétique : fond « bois » (chaud), reçu blanc légèrement penché, quelques lignes de texte
function synthetic() {
  const width = 400;
  const height = 300;
  const data = new Uint8ClampedArray(width * height * 4);
  const corners = [{ x: 150, y: 40 }, { x: 250, y: 50 }, { x: 240, y: 270 }, { x: 140, y: 260 }];
  const inside = (x, y) => corners.every((a, i) => {
    const b = corners[(i + 1) % 4];
    return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
  });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const paper = inside(x, y);
      const ink = paper && y % 20 < 3 && x % 7 < 5;
      const [r, g, b] = paper ? (ink ? [40, 40, 45] : [200, 207, 215]) : [190, 165, 120];
      data.set([r, g, b, 255], i);
    }
  }
  return { img: { data, width, height }, corners };
}

test("scanner : trouve le reçu, le redresse et le rend noir sur blanc", () => {
  const { img, corners } = synthetic();
  const quad = detectDocument(img);
  assert.ok(quad, "document trouvé");
  quad.forEach((p, k) => {
    assert.ok(Math.hypot(p.x - corners[k].x, p.y - corners[k].y) < 8, `coin ${k} : ${JSON.stringify(p)}`);
  });
  const flat = warpDocument(img, quad);
  assert.ok(flat.height > flat.width * 2 && flat.width > 90, `${flat.width}×${flat.height}`);
  const doc = enhanceDocument(flat);
  // le papier devient blanc, l'encre reste foncée
  const at = (x, y) => doc.data[(y * doc.width + x) * 4];
  const values = Array.from({ length: doc.height }, (_, y) => at(Math.round(doc.width / 2), y));
  assert.ok(values.filter((v) => v > 230).length > values.length * 0.6, "fond blanc");
  assert.ok(values.some((v) => v < 60), "texte noir");
  // une photo uniforme : rien à trouver
  assert.equal(detectDocument({ data: new Uint8ClampedArray(200 * 100 * 4).fill(128), width: 200, height: 100 }), null);
});

test("facture PDF et justificatifs PDF", async () => {
  const { emptyTimesheet, addClient, addProject, addEntry } = await import("../js/timesheet/timesheet.js");
  const { addExpense, addAttachment } = await import("../js/timesheet/expenses.js");
  const { invoiceData } = await import("../js/timesheet/invoice.js");
  const { invoicePdf } = await import("../js/timesheet/invoice-pdf.js");
  const { receiptsPdf } = await import("../js/timesheet/receipts-pdf.js");
  let ts = emptyTimesheet();
  let r = addClient(ts, { name: "Entreprise ABC" });
  ts = r.ts;
  const client = r.client;
  r = addProject(ts, { number: "P-1", name: "Projet", clientId: client.id, rate: 68 });
  ts = r.ts;
  for (let d = 1; d <= 25; d++) ts = addEntry(ts, { date: `2026-10-${String(d).padStart(2, "0")}`, projectId: r.project.id, hours: 2, work: "Travail" });
  const e = addExpense(ts, { date: "2026-10-15", type: "food", description: "Pho", projectId: r.project.id, amount: 99.65, currency: "CAD" });
  ts = addAttachment(e.ts, e.expense.id, { id: "a1", kind: "invoice", type: "image/jpeg" });
  ts = addAttachment(ts, e.expense.id, { id: "a2", kind: "proof", type: "image/jpeg" });
  ts = addAttachment(ts, e.expense.id, { id: "a3", kind: "other", type: "application/pdf", name: "scan.pdf" });
  ts = addExpense(ts, { date: "2026-10-16", type: "transport", description: "Taxi", projectId: r.project.id, amount: 30, currency: "CAD" }).ts;
  const d = invoiceData(ts, { from: "2026-10-01", to: "2026-10-31", clientId: client.id, number: "2026-117", date: "2026-10-31" });
  const latin = (bytes) => new TextDecoder("latin1").decode(bytes);
  const inv = latin(invoicePdf(d));
  assert.match(inv, /\/Count [2-9]/, "la facture continue sur une autre page");
  assert.match(inv, /\(TOTAL \\300 PAYER \(CAD\)\)|TOTAL \\300 PAYER/);
  const tiny = { bytes: TINY_JPEG, width: 1, height: 1, components: 1 };
  const rec = latin(receiptsPdf(d, { a1: tiny, a2: tiny }));
  assert.match(rec, /\/Count 2/, "sommaire + une page (facture et preuve côte à côte)");
  assert.match(rec, /Manquant \/ Missing/, "le taxi n'a pas de justificatif");
  assert.match(rec, /scan\.pdf/, "le PDF joint à part est nommé");
});

test("JPEG : octets de remplissage, marqueurs sans longueur, trames progressives", () => {
  // SOI, remplissage FF FF, APP0 (longueur 4), RST0, SOF2 (progressif) 30 × 20, 3 composantes
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd0,
    0xff, 0xc2, 0x00, 0x11, 0x08, 0x00, 0x14, 0x00, 0x1e, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(jpegInfo(bytes), { width: 30, height: 20, components: 3 });
  assert.equal(jpegInfo(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), null); // un PNG n'est pas un JPEG
});
