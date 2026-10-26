// Petit générateur de fichiers Excel (.xlsx), sans bibliothèque externe :
// un .xlsx est une archive zip de quelques fichiers XML. Fonctionne hors ligne.
//
//   buildXlsx({ sheets: [{ name, columns: [largeurs], rows: [[cellule]], merges: ["A1:D1"] }] })
//     -> Uint8Array
//   cellule : null | "texte" | 12.5 | { v, s: "style", f: "SUM(B2:B5)" } ; date : { v: "2026-10-26", s: "date" }
//   styles : bold, title, header, hours, money, moneyBold, date, dateBold, percent, total

const enc = new TextEncoder();

// ---- Zip (fichiers stockés sans compression : accepté par Excel, Numbers…) ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // noms en UTF-8
    local.setUint16(8, 0, true); // stocké
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(12, 0, true);
    dir.setUint16(14, 0x21, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---- Feuilles de calcul ------------------------------------------------------------

const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export function colName(index) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

// Date ISO -> numéro de série Excel (jours depuis le 1899-12-30)
export const excelDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
};

// Styles : [police, remplissage, bordure, format de nombre, alignement]
// Polices : 0 normale, 1 grasse, 2 titre, 3 petite, 4 grande grasse.
// Bordures : 1 haut et bas, 2 cadre. Formats : 164 heures, 165 argent, 166 date,
// 167 pourcentage, 168 argent avec « - » pour zéro.
const STYLES = {
  default: [0, 0, 0, 0],
  bold: [1, 0, 0, 0],
  title: [2, 0, 0, 0],
  header: [1, 2, 1, 0],
  hours: [0, 0, 0, 164],
  money: [0, 0, 0, 165],
  moneyBold: [1, 0, 0, 165],
  date: [0, 0, 0, 166],
  dateBold: [1, 0, 0, 166],
  percent: [0, 0, 0, 167],
  hoursBold: [1, 0, 0, 164],
  total: [1, 2, 1, 165],
  totalHours: [1, 2, 1, 164],
  totalText: [1, 2, 1, 0],
  right: [0, 0, 0, 0, "right"],
  boldRight: [1, 0, 0, 0, "right"],
  small: [3, 0, 0, 0],
  smallBold: [5, 0, 0, 0],
  center: [0, 0, 0, 0, "center"],
  big: [4, 0, 0, 0],
  headerCenter: [1, 2, 2, 0, "wrapCenter"],
  box: [0, 0, 2, 0],
  boxBold: [1, 0, 2, 0],
  boxHours: [0, 0, 2, 164],
  boxMoney: [0, 0, 2, 168],
  boxTotal: [1, 2, 2, 168],
  boxTotalHours: [1, 2, 2, 164],
  boxTotalText: [1, 2, 2, 0],
  labelBox: [1, 2, 2, 0, "right"],
  moneyBox: [0, 0, 2, 165],
  grandTotal: [4, 2, 2, 165],
  dateBox: [0, 0, 2, 166],
  boxRight: [0, 0, 2, 0, "right"],
  boxBoldRight: [1, 0, 2, 0, "right"],
};
const STYLE_INDEX = Object.fromEntries(Object.keys(STYLES).map((k, i) => [k, i]));
const ALIGN = {
  right: '<alignment horizontal="right"/>',
  center: '<alignment horizontal="center"/>',
  wrapCenter: '<alignment horizontal="center" vertical="center" wrapText="1"/>',
};

const stylesXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="5"><numFmt numFmtId="164" formatCode="0.00"/><numFmt numFmtId="165" formatCode="#,##0.00\\ &quot;$&quot;"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd"/><numFmt numFmtId="167" formatCode="0.000%"/><numFmt numFmtId="168" formatCode="#,##0.00\\ &quot;$&quot;;-#,##0.00\\ &quot;$&quot;;&quot;-&quot;"/></numFmts>
<fonts count="6"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/></font><font><sz val="9"/><color rgb="FF555555"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font><font><b/><sz val="9"/><color rgb="FF555555"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF4"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"/><bottom style="thin"/><diagonal/></border><border><left style="thin"><color rgb="FFB0B7BF"/></left><right style="thin"><color rgb="FFB0B7BF"/></right><top style="thin"><color rgb="FFB0B7BF"/></top><bottom style="thin"><color rgb="FFB0B7BF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${Object.keys(STYLES).length}">${Object.values(STYLES).map(([font, fill, border, fmt, align]) =>
  `<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${font ? ' applyFont="1"' : ""}${fill ? ' applyFill="1"' : ""}${border ? ' applyBorder="1"' : ""}${fmt ? ' applyNumberFormat="1"' : ""}${align ? ' applyAlignment="1">' + ALIGN[align] + "</xf>" : "/>"}`).join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(cell, ref) {
  if (cell === null || cell === undefined || cell === "") return "";
  const c = typeof cell === "object" ? cell : { v: cell };
  const style = STYLE_INDEX[c.s ?? (c.f ? "default" : "default")] ?? 0;
  const s = style ? ` s="${style}"` : "";
  if (c.f) {
    const value = typeof c.v === "number" ? `<v>${c.v}</v>` : "";
    return `<c r="${ref}"${s}><f>${xml(c.f)}</f>${value}</c>`;
  }
  if (["date", "dateBold", "dateBox"].includes(c.s) && typeof c.v === "string") return `<c r="${ref}"${s}><v>${excelDate(c.v)}</v></c>`;
  if (typeof c.v === "number" && Number.isFinite(c.v)) return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
}

// columns : largeurs, ou { width, hidden } ; print : mise en page pour l'impression (une page de large).
function sheetXml({ columns = [], rows = [], merges = [], print = null }) {
  const cols = columns.length
    ? `<cols>${columns.map((col, i) => {
      const { width, hidden } = typeof col === "object" ? col : { width: col };
      return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"${hidden ? ' hidden="1"' : ""}/>`;
    }).join("")}</cols>`
    : "";
  const sheetPr = print ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : "";
  const page = print
    ? `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="1" orientation="${print.orientation ?? "portrait"}" fitToWidth="1" fitToHeight="0"/>`
    : "";
  const data = rows.map((row, r) => `<row r="${r + 1}">${(row ?? []).map((cell, c) => cellXml(cell, `${colName(c)}${r + 1}`)).join("")}</row>`).join("");
  const merged = merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sheetPr}${cols}<sheetData>${data}</sheetData>${merged}${page}</worksheet>`;
}

// Nom de feuille permis par Excel : 31 caractères, sans []:*?/\
const sheetName = (name, i) => (String(name ?? "").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || `Feuille ${i + 1}`);

export function buildXlsx({ sheets }) {
  const names = sheets.map((s, i) => sheetName(s.name, i));
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", stylesXml()],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
  return zip(files.map(([name, text]) => ({ name, data: enc.encode(text) })));
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
