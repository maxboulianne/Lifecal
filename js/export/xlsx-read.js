// Lire un classeur Excel (.xlsx) : les cellules de sa première feuille, avec les valeurs
// calculées des formules (Excel les garde dans le fichier).
//
//   const cells = await readXlsxCells(bytes)   // Map « ligne,colonne » -> texte ou nombre
//   Une formule enregistrée sans son résultat (classeur pas recalculé) vaut null : on
//   sait qu'il y a quelque chose, mais pas combien.
//
// Un .xlsx est un ZIP de fichiers XML ; les entrées compressées (deflate) sont ouvertes
// avec DecompressionStream, présent dans les navigateurs récents et Node.

const decoder = new TextDecoder();
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ZIP -> Map(nom -> () => Promise<Uint8Array>)
export function readZip(bytes) {
  let end = bytes.length - 22;
  while (end >= 0 && u32(bytes, end) !== 0x06054b50) end--; // fin du répertoire central
  if (end < 0) throw new Error("Fichier ZIP illisible");
  const count = u16(bytes, end + 10);
  let p = u32(bytes, end + 16);
  const entries = new Map();
  for (let i = 0; i < count && u32(bytes, p) === 0x02014b50; i++) {
    const method = u16(bytes, p + 10);
    const size = u32(bytes, p + 20);
    const nameLength = u16(bytes, p + 28);
    const extra = u16(bytes, p + 30);
    const comment = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    entries.set(name, async () => {
      const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflate(data);
      throw new Error(`Compression ZIP non prise en charge (${method})`);
    });
    p += 46 + nameLength + extra + comment;
  }
  return entries;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(#x?[\da-f]+|\w+);/gi, (m, e) => (e[0] === "#"
  ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
  : ENTITIES[e] ?? m));
const texts = (xml) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join("");

// « P322 » -> { row: 322, col: 16 }
export function cellRef(ref) {
  const [, letters, row] = /^([A-Z]+)(\d+)$/.exec(ref);
  return { row: Number(row), col: [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) };
}

export async function readXlsxCells(bytes) {
  const zip = readZip(bytes);
  const text = async (name) => (zip.has(name) ? decoder.decode(await zip.get(name)()) : "");
  // La première feuille du classeur (ordre de workbook.xml)
  const workbook = await text("xl/workbook.xml");
  const rels = await text("xl/_rels/workbook.xml.rels");
  const firstId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((tag) => firstId && tag.includes(`Id="${firstId}"`));
  const target = rel ? /Target="([^"]+)"/.exec(rel)?.[1] : null;
  const sheetPath = target ? `xl/${target.replace(/^\/?xl\//, "").replace(/^\//, "")}` : "xl/worksheets/sheet1.xml";
  const shared = [...(await text("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const sheet = await text(sheetPath) || (await text("xl/worksheets/sheet1.xml"));
  const cells = new Map();
  for (const m of sheet.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = /\br="([A-Z]+\d+)"/.exec(m[1])?.[1];
    const type = /\bt="(\w+)"/.exec(m[1])?.[1];
    const inner = m[2] ?? "";
    if (!ref) continue;
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    let value;
    if (v === undefined && /<f\b/.test(inner) && type !== "inlineStr") {
      const { row, col } = cellRef(ref);
      cells.set(`${row},${col}`, null);
      continue;
    }
    if (type === "s") value = shared[Number(v)];
    else if (type === "inlineStr") value = texts(inner);
    else if (type === "str" || type === "e") value = v === undefined ? undefined : unxml(v);
    else if (type === "b") value = v === "1";
    else if (v !== undefined) value = Number(v);
    if (value === undefined || value === "") continue;
    const { row, col } = cellRef(ref);
    cells.set(`${row},${col}`, value);
  }
  return cells;
}

// Date Excel (nombre de jours depuis le 30 décembre 1899) -> « AAAA-MM-JJ »
export const excelDateToISO = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
