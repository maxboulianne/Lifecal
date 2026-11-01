import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { buildXlsx, crc32 } from "../js/export/xlsx.js";
import { readXlsxCells, readZip } from "../js/export/xlsx-read.js";
import { invoiceFromCells } from "../js/timesheet/invoice-import.js";
import { addClient, addEntry, addProject, emptyTimesheet } from "../js/timesheet/timesheet.js";
import { invoiceSheets } from "../js/timesheet/invoice.js";

// Une facture « à l'ancienne », faite à la main dans Excel (données inventées)
function oldStyleInvoice({ number, total = 5678, calculated = true }) {
  const row = (cells) => cells;
  const rows = [];
  rows[1] = row([null, null, null, null, null, null, null, null, { v: "FACTURATION - INVOICE" }, null, null, null, null, null, null, { v: number }]);
  rows[2] = row([null, null, null, null, null, null, null, null, { v: "DATE FACTURATION/ INVOICE DATE" }, null, null, null, null, null, { v: 46136 }]); // 2026-04-24
  rows[7] = row([null, { v: "Expédié à: / Shipped to:" }, null, null, null, null, null, null, { v: "Facturé à: / \nBilled to:" }, { v: "compta@exemple.com" },
    null, null, null, null, null, null, null, null, null, null, { v: "MX to CDN" }]);
  rows[8] = row([null, null, { v: "Entreprise ABC" }, null, null, null, null, null, null, { v: "Entreprise ABC" }]);
  const amount = (v) => (calculated ? { f: "SUM(P1:P2)", v } : { f: "SUM(P1:P2)" });
  rows[20] = row([null, null, null, null, null, null, null, null, { v: "SOUS-TOTAL/ SUB-TOTAL" }, null, null, null, null, null, null, amount(total), null, { v: 28.4 }]);
  rows[22] = row([null, null, null, null, null, null, null, null, { v: "Montant DÛ/ Amount due" }, null, null, null, null, null, null, amount(total)]);
  rows[23] = row([null, null, null, null, null, null, null, null, { v: "TPS/ GST" }, { v: 0.05 }, null, null, null, null, null, amount(total * 0.05)]);
  rows[24] = row([null, null, null, null, null, null, null, null, { v: "TVQ/ PST" }, { v: 0.09975 }, null, null, null, null, null, amount(total * 0.09975)]);
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  return buildXlsx({ sheets: [{ name: "FMS-2026-0101", rows: rows.map((r) => r.map((c) => c ?? undefined)) }] });
}

// Même fichier, compressé comme le fait Excel (deflate)
async function deflated(bytes) {
  const enc = new TextEncoder();
  const chunks = []; const central = []; let offset = 0;
  for (const [name, get] of readZip(bytes)) {
    const data = await get(); const packed = deflateRawSync(data); const nameBytes = enc.encode(name); const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(packed.length, 20); dir.writeUInt32LE(data.length, 24); dir.writeUInt16LE(nameBytes.length, 28); dir.writeUInt32LE(offset, 42);
    chunks.push(local, nameBytes, packed); central.push(dir, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const endRec = Buffer.alloc(22);
  endRec.writeUInt32LE(0x06054b50, 0); endRec.writeUInt16LE(central.length / 2, 8); endRec.writeUInt16LE(central.length / 2, 10);
  endRec.writeUInt32LE(size, 12); endRec.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, ...central, endRec]));
}

test("Import : facture Excel faite à la main (montants calculés, fichier compressé)", async () => {
  const cells = await readXlsxCells(await deflated(oldStyleInvoice({ number: "2026-007" })));
  const inv = invoiceFromCells(cells, "2026-0007_ABC.xlsx");
  assert.deepEqual(inv, { number: "2026-007", date: "2026-04-24", client: "Entreprise ABC", subtotal: 5678, tps: 283.9, tvq: 566.38, problems: [] });
});

test("Import : fichier pas recalculé ou numéro différent du nom du fichier", async () => {
  const stale = invoiceFromCells(await readXlsxCells(oldStyleInvoice({ number: "2026-011", calculated: false })), "2026-0010_ABC.xlsx");
  assert.deepEqual(stale.problems.map((p) => p.code), ["number", "uncalculated"]);
  assert.ok(Number.isNaN(stale.subtotal)); // jamais le 28,40 d'une autre colonne
  assert.equal(invoiceFromCells(new Map([["1,1", "Bonjour"]]), "notes.xlsx"), null);
});

test("Import : facture créée par l'application, relue", async () => {
  let ts = emptyTimesheet();
  let r = addClient(ts, { name: "Entreprise ABC" });
  ts = r.ts;
  const clientId = r.client.id;
  r = addProject(ts, { number: "P-100", name: "Projet", clientId, rate: 68 });
  ts = addEntry(r.ts, { date: "2026-10-05", projectId: r.project.id, hours: 10 });
  const { sheets, styles } = invoiceSheets(ts, { from: "2026-10-01", to: "2026-10-31", clientId, number: "2026-200", date: "2026-10-31" });
  const inv = invoiceFromCells(await readXlsxCells(buildXlsx({ sheets, styles })), "2026-200.xlsx");
  assert.deepEqual(inv, { number: "2026-200", date: "2026-10-31", client: "Entreprise ABC", subtotal: 680, tps: 34, tvq: 67.83, problems: [] });
});
