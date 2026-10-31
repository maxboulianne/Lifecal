// Petit générateur de PDF, sans bibliothèque externe (comme xlsx.js pour Excel) :
// pages au format Lettre, texte (polices standard Helvetica), rectangles, lignes
// et images JPEG. Fonctionne hors ligne.
//
//   const pdf = new PdfWriter();
//   const page = pdf.addPage();                     // 612 × 792 points (Lettre)
//   page.text("Bonjour", 40, 60, { size: 12, bold: true, color: "#2C4A6E" });   // x, y depuis le haut
//   page.rect(40, 80, 200, 20, { fill: "#EEF2F7", stroke: "#C9D2DE" });
//   page.line(40, 100, 240, 100, { color: "#E0491A", width: 2 });
//   page.image(pdf.addJpeg(bytes), 40, 120, 200, 100);
//   const bytes = pdf.save();                       // Uint8Array
//
// Les polices standard ne connaissent que le jeu de caractères latin (WinAnsi) :
// les autres caractères sont remplacés par « ? ».

// Caractères WinAnsi au-delà du latin-1 : code Unicode -> octet
const WIN_ANSI_EXTRA = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

// Texte -> octets WinAnsi (espaces insécables et fines -> espace ordinaire)
export function winAnsi(text) {
  const out = [];
  for (const ch of String(text ?? "").normalize("NFC")) {
    let code = ch.codePointAt(0);
    if (code === 0x202f || code === 0x2009 || code === 0x00a0) code = 0x20;
    if (code === 0x2212) code = 0x2d; // signe moins
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) out.push(code);
    else if (WIN_ANSI_EXTRA[code]) out.push(WIN_ANSI_EXTRA[code]);
    else if (code === 0x0a || code === 0x09) out.push(0x20);
    else out.push(0x3f); // ?
  }
  return out;
}

// Chaîne PDF littérale : ( … ) avec \ ( ) échappés, octets hors ASCII en octal
const pdfString = (bytes) => `(${bytes.map((b) => (b === 0x28 || b === 0x29 || b === 0x5c ? `\\${String.fromCharCode(b)}`
  : b < 0x20 || b > 0x7e ? `\\${b.toString(8).padStart(3, "0")}` : String.fromCharCode(b))).join("")})`;

const num = (n) => (Math.round(n * 1000) / 1000).toString();
function rgb(color) {
  const hex = String(color ?? "#000000").replace(/^#/, "").replace(/^FF(?=[0-9a-f]{6}$)/i, "");
  const v = parseInt(hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex, 16) || 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => num(c / 255)).join(" ");
}

const FONTS = { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique", boldItalic: "Helvetica-BoldOblique" };
const fontKey = (o) => (o.bold && o.italic ? "boldItalic" : o.bold ? "bold" : o.italic ? "italic" : "regular");
const FONT_REF = { regular: "F1", bold: "F2", italic: "F3", boldItalic: "F4" };

// Largeur approximative du texte (Helvetica) si aucune mesure n'est fournie
const approxWidth = (text, size, bold) => String(text).length * size * (bold ? 0.56 : 0.52);

// Dimensions d'un JPEG (marqueur SOF) et nombre de composantes (1 gris, 3 couleur)
// Tolère les octets de remplissage (FF FF…) et les marqueurs sans longueur ; tous les types
// de trame (SOF0 à SOF15, sauf DHT C4, JPG C8 et DAC CC).
export function jpegInfo(bytes) {
  if (bytes?.[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8], components: bytes[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}

class PdfPage {
  constructor(writer, width, height) {
    this.writer = writer;
    this.width = width;
    this.height = height;
    this.ops = [];
    this.images = new Set();
  }

  // y : distance depuis le haut de la page (ligne de base du texte)
  text(str, x, y, o = {}) {
    const size = o.size ?? 10;
    const key = fontKey(o);
    let left = x;
    if (o.align === "right") left = x - this.measure(str, o);
    if (o.align === "center") left = x - this.measure(str, o) / 2;
    this.ops.push(`BT /${FONT_REF[key]} ${num(size)} Tf ${rgb(o.color)} rg ${num(left)} ${num(this.height - y)} Td ${pdfString(winAnsi(str))} Tj ET`);
    return this;
  }

  measure(str, o = {}) {
    return this.writer.measure(String(str ?? ""), o.size ?? 10, Boolean(o.bold), Boolean(o.italic));
  }

  // Texte coupé en lignes pour tenir dans `width` ; retourne le nombre de lignes
  wrap(str, width, o = {}) {
    const lines = [];
    for (const paragraph of String(str ?? "").split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && this.measure(next, o) > width) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }

  rect(x, y, w, h, o = {}) {
    const box = `${num(x)} ${num(this.height - y - h)} ${num(w)} ${num(h)} re`;
    if (o.fill && o.stroke) this.ops.push(`${rgb(o.fill)} rg ${rgb(o.stroke)} RG ${num(o.lineWidth ?? 0.5)} w ${box} B`);
    else if (o.fill) this.ops.push(`${rgb(o.fill)} rg ${box} f`);
    else this.ops.push(`${rgb(o.stroke)} RG ${num(o.lineWidth ?? 0.5)} w ${box} S`);
    return this;
  }

  line(x1, y1, x2, y2, o = {}) {
    this.ops.push(`${rgb(o.color)} RG ${num(o.width ?? 0.5)} w ${num(x1)} ${num(this.height - y1)} m ${num(x2)} ${num(this.height - y2)} l S`);
    return this;
  }

  // Image (référence de addJpeg) dans le cadre x, y (haut), w, h
  image(img, x, y, w, h) {
    this.images.add(img);
    this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.height - y - h)} cm /${img.name} Do Q`);
    return this;
  }
}

export class PdfWriter {
  // measure(text, size, bold, italic) -> largeur en points ; par défaut, une approximation
  constructor({ measure, title = "" } = {}) {
    this.pages = [];
    this.imageList = [];
    this.title = title;
    this.measure = measure ?? ((text, size, bold) => approxWidth(text, size, bold));
  }

  addPage(width = 612, height = 792) {
    const page = new PdfPage(this, width, height);
    this.pages.push(page);
    return page;
  }

  addJpeg(bytes) {
    const info = jpegInfo(bytes);
    if (!info) throw new Error("Image JPEG illisible");
    const img = { name: `Im${this.imageList.length + 1}`, bytes, ...info };
    this.imageList.push(img);
    return img;
  }

  save() {
    const chunks = [];
    const offsets = [];
    let length = 0;
    const push = (part) => {
      const bytes = typeof part === "string" ? latin1(part) : part;
      chunks.push(bytes);
      length += bytes.length;
    };
    const object = (n, body) => {
      offsets[n] = length;
      push(`${n} 0 obj\n`);
      for (const part of [].concat(body)) push(part);
      push("\nendobj\n");
    };

    // Numérotation : 1 catalogue, 2 pages, 3-6 polices, 7 infos, puis images, puis pages et contenus
    const fontIds = { regular: 3, bold: 4, italic: 5, boldItalic: 6 };
    let next = 8;
    const imageIds = new Map(this.imageList.map((img) => [img, next++]));
    const pageIds = this.pages.map(() => {
      const ids = [next, next + 1];
      next += 2;
      return ids;
    });

    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    object(2, `<< /Type /Pages /Count ${this.pages.length} /Kids [${pageIds.map(([p]) => `${p} 0 R`).join(" ")}] >>`);
    for (const [key, id] of Object.entries(fontIds)) {
      object(id, `<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[key]} /Encoding /WinAnsiEncoding >>`);
    }
    object(7, `<< /Producer (LifeCal) /Title ${utf16Hex(this.title)} >>`);
    for (const [img, id] of imageIds) {
      const space = img.components === 1 ? "/DeviceGray" : img.components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
      const decode = img.components === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : "";
      object(id, [`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace ${space}${decode} /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`, img.bytes, "\nendstream"]);
    }
    this.pages.forEach((page, i) => {
      const [pageId, contentId] = pageIds[i];
      const fonts = Object.entries(fontIds).map(([key, id]) => `/${FONT_REF[key]} ${id} 0 R`).join(" ");
      const xobjects = [...page.images].map((img) => `/${img.name} ${imageIds.get(img)} 0 R`).join(" ");
      object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Contents ${contentId} 0 R /Resources << /Font << ${fonts} >>${xobjects ? ` /XObject << ${xobjects} >>` : ""} >> >>`);
      const content = latin1(page.ops.join("\n"));
      object(contentId, [`<< /Length ${content.length} >>\nstream\n`, content, "\nendstream"]);
    });

    const xref = length;
    push(`xref\n0 ${next}\n0000000000 65535 f \n`);
    for (let n = 1; n < next; n++) push(`${String(offsets[n] ?? 0).padStart(10, "0")} 00000 n \n`);
    push(`trailer\n<< /Size ${next} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

    const out = new Uint8Array(length);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

// Texte des métadonnées (titre) : UTF-16 en hexadécimal, lu correctement partout
function utf16Hex(text) {
  let hex = "FEFF";
  for (const unit of String(text ?? "")) {
    for (let i = 0; i < unit.length; i++) hex += unit.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
}

// Chaîne (déjà en octets 0-255) -> Uint8Array
function latin1(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 255;
  return out;
}

export const PDF_TYPE = "application/pdf";
