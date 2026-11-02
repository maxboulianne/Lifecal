// Lire le texte d'un PDF, ligne par ligne (relevés de carte en PDF), avec pdf.js de Mozilla.
// Le programme est téléchargé une fois depuis le CDN jsDelivr, puis gardé par le navigateur ;
// le PDF, lui, est lu sur l'appareil et n'est envoyé nulle part.
//
//   const lines = await pdfLines(bytes)   // ["02 06 02 06 001 CSC IBEROSTAR …  167,65", …]

const CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build";
export const PDFJS_URLS = { lib: `${CDN}/pdf.min.mjs`, worker: `${CDN}/pdf.worker.min.mjs` };

let lib = null;
async function pdfjs() {
  lib ??= import(PDFJS_URLS.lib).then((m) => {
    m.GlobalWorkerOptions.workerSrc = PDFJS_URLS.worker;
    return m;
  }).catch((err) => {
    lib = null;
    throw err;
  });
  return lib;
}

// Les morceaux de texte d'une page, regroupés en lignes (même hauteur), de gauche à droite.
// Un grand espace entre deux morceaux devient deux espaces (pour séparer les colonnes).
export function groupLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str?.trim()) continue;
    const [x, y] = [it.transform[4], it.transform[5]];
    let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push({ x, end: x + (it.width ?? 0), str: it.str });
  }
  return rows.sort((a, b) => b.y - a.y).map((r) => {
    const parts = r.parts.sort((a, b) => a.x - b.x);
    return parts.reduce((line, p, i) => {
      if (!i) return p.str;
      const gap = p.x - parts[i - 1].end;
      return `${line}${gap > 8 ? "  " : gap > 0.8 ? " " : ""}${p.str}`;
    }, "").replace(/\s+$/, "");
  });
}

export async function pdfLines(bytes) {
  const { getDocument } = await pdfjs();
  const doc = await getDocument({ data: bytes, isEvalSupported: false }).promise;
  const lines = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    lines.push(...groupLines((await page.getTextContent()).items));
  }
  await doc.destroy();
  return lines;
}
