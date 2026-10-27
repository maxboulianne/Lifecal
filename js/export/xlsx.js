// Petit générateur de fichiers Excel (.xlsx), sans bibliothèque externe :
// un .xlsx est une archive zip de quelques fichiers XML. Fonctionne hors ligne.
//
//   buildXlsx({ sheets: [feuille], styles: { nom: style } }) -> Uint8Array
//   feuille : { name, columns: [largeur | { width, hidden }], rows: [[cellule]], merges: ["A1:D1"],
//               heights: { 5: 6 }, gridLines: false, print: { orientation }, images: [image] }
//   cellule : null | "texte" | 12.5 | { v, s: "style" | {…}, f: "SUM(B2:B5)" }
//             une date ISO (« 2026-10-26 ») dans un style au format date devient une vraie date
//   style   : { font: { name, sz, b, i, color }, fill: "FFEEF2F7", numFmt: "0.00",
//               border: { left|right|top|bottom: { style: "thin", color } }, align: { h, v, wrap } }
//   image   : { data: Uint8Array (PNG ou JPEG), type: "png" | "jpeg", col, row, width, height } (pixels)

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

// ---- Styles ------------------------------------------------------------------------

const THIN = { style: "thin" };
const MONEY = '#,##0.00\ "$"';
export const FORMATS = {
  hours: "0.00",
  money: MONEY,
  moneyDash: '#,##0.00" $";\-#,##0.00" $";"–"',
  hoursDash: '0.00;\-0.00;"–"',
  date: "yyyy-mm-dd",
  percent: "0.000%",
};
const HEADER_FILL = "FFE8EEF4";

// Styles prêts à l'emploi ; une feuille peut aussi donner les siens (buildXlsx({ styles })).
const PRESETS = {
  default: {},
  bold: { font: { b: true } },
  title: { font: { b: true, sz: 16 } },
  header: { font: { b: true }, fill: HEADER_FILL, border: { top: THIN, bottom: THIN } },
  hours: { numFmt: FORMATS.hours },
  money: { numFmt: MONEY },
  moneyBold: { font: { b: true }, numFmt: MONEY },
  date: { numFmt: FORMATS.date },
  dateBold: { font: { b: true }, numFmt: FORMATS.date },
  percent: { numFmt: FORMATS.percent },
  hoursBold: { font: { b: true }, numFmt: FORMATS.hours },
  total: { font: { b: true }, fill: HEADER_FILL, border: { top: THIN, bottom: THIN }, numFmt: MONEY },
  totalHours: { font: { b: true }, fill: HEADER_FILL, border: { top: THIN, bottom: THIN }, numFmt: FORMATS.hours },
  totalText: { font: { b: true }, fill: HEADER_FILL, border: { top: THIN, bottom: THIN } },
};

const BASE_FONT = { name: "Calibri", sz: 11 };
const fontXml = (f) => `<font>${f.b ? "<b/>" : ""}${f.i ? "<i/>" : ""}<sz val="${f.sz}"/>${f.color ? `<color rgb="${f.color}"/>` : ""}<name val="${xml(f.name)}"/></font>`;
const fillXml = (rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
const sideXml = (name, side) => (side?.style
  ? `<${name} style="${side.style}">${side.color ? `<color rgb="${side.color}"/>` : ""}</${name}>`
  : `<${name}/>`);
const borderXml = (b = {}) => `<border>${["left", "right", "top", "bottom"].map((k) => sideXml(k, b[k])).join("")}<diagonal/></border>`;

// Rassemble les styles utilisés et produit styles.xml ; retourne aussi l'index de chaque style.
function styleTable(custom = {}) {
  const fonts = [fontXml(BASE_FONT)];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = [borderXml()];
  const numFmts = [];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const index = new Map([["{}", 0]]);
  const formats = new Map();
  const add = (list, item) => {
    const at = list.indexOf(item);
    if (at >= 0) return at;
    list.push(item);
    return list.length - 1;
  };
  const resolve = (s) => (typeof s === "string" ? custom[s] ?? PRESETS[s] ?? {} : s ?? {});

  function id(s) {
    const style = resolve(s);
    const key = JSON.stringify(style);
    if (index.has(key)) return index.get(key);
    const font = add(fonts, fontXml({ ...BASE_FONT, ...style.font }));
    const fill = style.fill ? add(fills, fillXml(style.fill)) : 0;
    const border = style.border ? add(borders, borderXml(style.border)) : 0;
    let fmt = 0;
    if (style.numFmt) {
      if (!formats.has(style.numFmt)) {
        formats.set(style.numFmt, 164 + formats.size);
        numFmts.push(`<numFmt numFmtId="${formats.get(style.numFmt)}" formatCode="${xml(style.numFmt)}"/>`);
      }
      fmt = formats.get(style.numFmt);
    }
    const a = style.align;
    const align = a ? `<alignment${a.h ? ` horizontal="${a.h}"` : ""}${a.v ? ` vertical="${a.v}"` : ""}${a.wrap ? ' wrapText="1"' : ""}/>` : "";
    xfs.push(`<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1"${fill ? ' applyFill="1"' : ""}${border ? ' applyBorder="1"' : ""}${fmt ? ' applyNumberFormat="1"' : ""}${align ? ` applyAlignment="1">${align}</xf>` : "/>"}`);
    index.set(key, xfs.length - 1);
    return xfs.length - 1;
  }

  const isDate = (s) => /y/.test(resolve(s).numFmt ?? "");
  const xmlText = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.join("")}</numFmts>` : ""}<fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="${borders.length}">${borders.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return { id, isDate, xml: xmlText };
}

// ---- Feuilles ----------------------------------------------------------------------

function cellXml(cell, ref, styles) {
  if (cell === null || cell === undefined || cell === "") return "";
  const c = typeof cell === "object" ? cell : { v: cell };
  const style = c.s ? styles.id(c.s) : 0;
  const s = style ? ` s="${style}"` : "";
  if (c.f) {
    const value = typeof c.v === "number" ? `<v>${c.v}</v>` : typeof c.v === "string" ? `<v>${xml(c.v)}</v>` : "";
    return `<c r="${ref}"${s}${typeof c.v === "string" ? ' t="str"' : ""}><f>${xml(c.f)}</f>${value}</c>`;
  }
  if (c.v === null || c.v === undefined || c.v === "") return style ? `<c r="${ref}"${s}/>` : "";
  if (typeof c.v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.v) && styles.isDate(c.s)) return `<c r="${ref}"${s}><v>${excelDate(c.v)}</v></c>`;
  if (typeof c.v === "number" && Number.isFinite(c.v)) return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
}

function sheetXml({ columns = [], rows = [], merges = [], heights = {}, gridLines = true, print = null, images = [] }, styles) {
  const cols = columns.length
    ? `<cols>${columns.map((col, i) => {
      const { width, hidden } = typeof col === "object" ? col : { width: col };
      return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"${hidden ? ' hidden="1"' : ""}/>`;
    }).join("")}</cols>`
    : "";
  const sheetPr = print ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : "";
  const view = gridLines ? "" : '<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>';
  const data = rows.map((row, r) => {
    const ht = heights[r + 1] ? ` ht="${heights[r + 1]}" customHeight="1"` : "";
    return `<row r="${r + 1}"${ht}>${(row ?? []).map((cell, c) => cellXml(cell, `${colName(c)}${r + 1}`, styles)).join("")}</row>`;
  }).join("");
  const merged = merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  const page = print
    ? `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="1" orientation="${print.orientation ?? "portrait"}" fitToWidth="1" fitToHeight="0"/>`
    : "";
  const drawing = images.length ? '<drawing r:id="rId1"/>' : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${sheetPr}${view}${cols}<sheetData>${data}</sheetData>${merged}${page}${drawing}</worksheet>`;
}

// Images d'une feuille, posées à partir d'une cellule, à leur taille en pixels.
const EMU = 9525;
const drawingXml = (images) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${images.map((img, i) => `<xdr:oneCellAnchor><xdr:from><xdr:col>${img.col ?? 0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${img.row ?? 0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(img.width * EMU)}" cy="${Math.round(img.height * EMU)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Image ${i + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(img.width * EMU)}" cy="${Math.round(img.height * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`).join("")}</xdr:wsDr>`;
const rels = (items) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join("")}</Relationships>`;

// Nom de feuille permis par Excel : 31 caractères, sans []:*?/\
const sheetName = (name, i) => (String(name ?? "").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || `Feuille ${i + 1}`);

export function buildXlsx({ sheets, styles: custom = {} }) {
  const names = sheets.map((s, i) => sheetName(s.name, i));
  const styles = styleTable(custom);
  const sheetFiles = sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s, styles)]);
  const media = [];
  const extra = [];
  sheets.forEach((s, i) => {
    if (!s.images?.length) return;
    const n = i + 1;
    extra.push([`xl/worksheets/_rels/sheet${n}.xml.rels`, rels([["rId1", "drawing", `../drawings/drawing${n}.xml`]])]);
    extra.push([`xl/drawings/drawing${n}.xml`, drawingXml(s.images)]);
    extra.push([`xl/drawings/_rels/drawing${n}.xml.rels`, rels(s.images.map((img, k) => {
      const file = `image${n}_${k + 1}.${img.type === "jpeg" ? "jpeg" : "png"}`;
      media.push({ name: `xl/media/${file}`, data: img.data });
      return [`rId${k + 1}`, "image", `../media/${file}`];
    }))]);
  });
  const drawings = sheets.map((s, i) => (s.images?.length ? `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : "")).join("");
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}${drawings}</Types>`],
    ["_rels/.rels", rels([["rId1", "officeDocument", "xl/workbook.xml"]])],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", rels([...sheets.map((_, i) => [`rId${i + 1}`, "worksheet", `worksheets/sheet${i + 1}.xml`]), [`rId${sheets.length + 1}`, "styles", "styles.xml"]])],
    ["xl/styles.xml", styles.xml()],
    ...sheetFiles,
    ...extra,
  ];
  return zip([...files.map(([name, text]) => ({ name, data: enc.encode(text) })), ...media]);
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
