// Scanner de documents (comme CamScanner) : trouver le reçu dans la photo, le
// redresser et le rendre bien lisible. Fonctions pures sur des images
// { data: RGBA, width, height } : elles marchent dans le navigateur (canvas)
// comme dans les tests.
//
//   detectDocument(image) -> [haut-gauche, haut-droite, bas-droite, bas-gauche] ({ x, y }) ou null
//   warpDocument(image, coins, { maxSide }) -> image redressée, à plat
//   enhanceDocument(image) -> noir sur blanc, ombres effacées (reçus pâles)

const DETECT_SIDE = 360; // la détection travaille sur une petite copie de la photo

// Copie réduite (moyenne des pixels) pour aller vite
export function downscale(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  const step = 1 / scale;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * step);
      const y0 = Math.floor(y * step);
      const x1 = Math.min(img.width, Math.floor((x + 1) * step));
      const y1 = Math.min(img.height, Math.floor((y + 1) * step));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < Math.max(y0 + 1, y1); yy += 2) {
        for (let xx = x0; xx < Math.max(x0 + 1, x1); xx += 2) {
          const i = (yy * img.width + xx) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          n++;
        }
      }
      const o = (y * width + x) * 4;
      data[o] = r / n;
      data[o + 1] = g / n;
      data[o + 2] = b / n;
      data[o + 3] = 255;
    }
  }
  return { data, width, height, scale };
}

// Deux façons de reconnaître le papier dans la photo :
//  - « clair et peu coloré » (un reçu blanc sur un fond foncé ou coloré) ;
//  - « plus froid que le fond » : le papier blanc tire sur le bleu, alors qu'une table
//    de bois ou un comptoir tire sur le jaune-orangé, même là où la lumière est forte.
// On garde celle qui donne la forme la plus nette (voir candidate).
const brightScore = (r, g, b) => {
  const max = Math.max(r, g, b);
  const sat = max ? (max - Math.min(r, g, b)) / max : 0;
  return Math.round(max * Math.max(0, 1 - sat * 2.5));
};
const coolScore = (r, g, b, tint) => Math.max(0, Math.min(255, Math.round(128 + 2 * (b - r - tint))));

// Seuil d'Otsu : sépare au mieux deux groupes de valeurs (papier / fond)
function otsu(values) {
  const hist = new Array(256).fill(0);
  for (const v of values) hist[v]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

// Dilatation / érosion (carré de côté 2r+1) d'un masque 0/1
function morph(mask, w, h, r, dilate) {
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = dilate ? 0 : 1;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        const m = mask[y * w + xx];
        if (dilate ? m : !m) {
          v = dilate ? 1 : 0;
          break;
        }
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = dilate ? 0 : 1;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        const m = tmp[yy * w + x];
        if (dilate ? m : !m) {
          v = dilate ? 1 : 0;
          break;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

// La plus grande tache de papier (pixels voisins), avec la liste de ses pixels
function largestBlob(mask, w, h) {
  const label = new Int32Array(mask.length).fill(-1);
  let best = [];
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    const pixels = [];
    stack.push(start);
    label[start] = start;
    while (stack.length) {
      const i = stack.pop();
      pixels.push(i);
      const x = i % w;
      const y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && mask[j] && label[j] === -1) {
          label[j] = start;
          stack.push(j);
        }
      }
    }
    if (pixels.length > best.length) best = pixels;
  }
  return best;
}

// Enveloppe convexe (chaîne monotone) des bords gauche et droit de la tache, ligne par ligne
function hullOf(pixels, w) {
  const rows = new Map();
  for (const i of pixels) {
    const x = i % w;
    const y = (i - x) / w;
    const r = rows.get(y);
    if (!r) rows.set(y, [x, x]);
    else {
      if (x < r[0]) r[0] = x;
      if (x > r[1]) r[1] = x;
    }
  }
  const pts = [];
  for (const [y, [x0, x1]] of rows) pts.push({ x: x0, y }, { x: x1 + 1, y }, { x: x0, y: y + 1 }, { x: x1 + 1, y: y + 1 });
  pts.sort((p, q) => p.x - q.x || p.y - q.y);
  const cross = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const polyArea = (q) => Math.abs(q.reduce((s, p, i) => {
  const n = q[(i + 1) % q.length];
  return s + p.x * n.y - n.x * p.y;
}, 0)) / 2;
const triArea = (a, b, c) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;

// Le plus grand quadrilatère dont les sommets sont sur l'enveloppe : les coins du document
function largestQuad(hull) {
  let pts = hull;
  // Alléger l'enveloppe (au plus ~60 points) : le résultat reste précis
  if (pts.length > 60) {
    const step = pts.length / 60;
    pts = Array.from({ length: 60 }, (_, k) => pts[Math.floor(k * step)]);
  }
  const n = pts.length;
  if (n < 4) return null;
  let best = null;
  let bestArea = -1;
  for (let i = 0; i < n; i++) {
    for (let k = i + 2; k < n; k++) {
      // Meilleur sommet de chaque côté de la diagonale i–k
      let j = -1;
      let aj = -1;
      for (let t = i + 1; t < k; t++) {
        const a = triArea(pts[i], pts[t], pts[k]);
        if (a > aj) {
          aj = a;
          j = t;
        }
      }
      let l = -1;
      let al = -1;
      for (let t = k + 1; t < n + i; t++) {
        const a = triArea(pts[i], pts[k], pts[t % n]);
        if (a > al) {
          al = a;
          l = t % n;
        }
      }
      if (j >= 0 && l >= 0 && aj + al > bestArea) {
        bestArea = aj + al;
        best = [pts[i], pts[j], pts[k], pts[l]];
      }
    }
  }
  return best;
}

// Remettre les coins dans l'ordre : haut-gauche, haut-droite, bas-droite, bas-gauche
function orderCorners(q) {
  const cx = q.reduce((s, p) => s + p.x, 0) / 4;
  const cy = q.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = [...q].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // sens horaire (y vers le bas) à partir du coin le plus près du haut-gauche
  const start = sorted.reduce((bi, p, i) => (p.x + p.y < sorted[bi].x + sorted[bi].y ? i : bi), 0);
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]);
}

// Une tache de papier trouvée avec un critère : ses coins et sa « netteté » (la tache
// remplit-elle son enveloppe, et le quadrilatère couvre-t-il l'enveloppe ?)
function candidate(scores, w, h, minThreshold) {
  const t = Math.max(otsu(scores), minThreshold);
  let mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = scores[i] > t ? 1 : 0;
  // Boucher les lettres et les petits trous, puis enlever les poussières
  mask = morph(morph(mask, w, h, 2, true), w, h, 2, false);
  mask = morph(morph(mask, w, h, 1, false), w, h, 1, true);
  const blob = largestBlob(mask, w, h);
  if (blob.length < w * h * 0.04 || blob.length > w * h * 0.95) return null;
  const hull = hullOf(blob, w);
  const quad = largestQuad(hull);
  if (!quad) return null;
  const hullArea = polyArea(hull);
  const quality = Math.min(1, blob.length / hullArea) * (polyArea(quad) / hullArea);
  return { corners: orderCorners(quad), quality };
}

export function detectDocument(img) {
  const small = downscale(img, DETECT_SIDE);
  const { width: w, height: h, data } = small;
  // Teinte typique de la photo (médiane de bleu − rouge) : surtout le fond
  const tints = [];
  for (let i = 0; i < w * h; i += 3) tints.push(data[i * 4 + 2] - data[i * 4]);
  tints.sort((a, b) => a - b);
  const tint = tints[Math.floor(tints.length / 2)];
  const bright = new Uint8Array(w * h);
  const cool = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    bright[i] = brightScore(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    cool[i] = coolScore(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], tint);
  }
  // « Plus froid » que le fond (plusieurs seuils), ou « clair et peu coloré » : on garde
  // la tache la plus nette (un document est un quadrilatère bien rempli).
  const all = [35, 25, 50].map((k) => candidate(cool, w, h, 128 + 2 * k)).concat(candidate(bright, w, h, 0));
  const found = all.filter(Boolean)
    .sort((a, b) => b.quality - a.quality);
  if (!found.length || found[0].quality < 0.75) return null;
  return found[0].corners.map((p) => ({ x: p.x / small.scale, y: p.y / small.scale }));
}

// Coins par défaut (toute la photo, avec une petite marge)
export const fullFrame = (img, margin = 0.04) => {
  const mx = img.width * margin;
  const my = img.height * margin;
  return [{ x: mx, y: my }, { x: img.width - mx, y: my }, { x: img.width - mx, y: img.height - my }, { x: mx, y: img.height - my }];
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Homographie qui envoie le rectangle (0,0)-(W,H) sur les quatre coins
function homography(quad, W, H) {
  const src = [[0, 0], [W, 0], [W, H], [0, H]];
  const A = [];
  const B = [];
  src.forEach(([x, y], k) => {
    const { x: u, y: v } = quad[k];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    B.push(v);
  });
  // Élimination de Gauss
  for (let i = 0; i < 8; i++) {
    let p = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [B[i], B[p]] = [B[p], B[i]];
    for (let r = 0; r < 8; r++) {
      if (r === i || !A[i][i]) continue;
      const f = A[r][i] / A[i][i];
      for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c];
      B[r] -= f * B[i];
    }
  }
  const h = B.map((b, i) => b / A[i][i]);
  return [...h, 1];
}

// Redresser : le contenu des quatre coins devient un rectangle à plat
export function warpDocument(img, quad, { maxSide = 2000 } = {}) {
  const [tl, tr, br, bl] = quad;
  let W = Math.max(dist(tl, tr), dist(bl, br));
  let H = Math.max(dist(tl, bl), dist(tr, br));
  const scale = Math.min(1, maxSide / Math.max(W, H));
  W = Math.max(1, Math.round(W * scale));
  H = Math.max(1, Math.round(H * scale));
  const m = homography(quad, W, H);
  const data = new Uint8ClampedArray(W * H * 4);
  const sw = img.width;
  const sh = img.height;
  const src = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = m[6] * x + m[7] * y + 1;
      const u = (m[0] * x + m[1] * y + m[2]) / d;
      const v = (m[3] * x + m[4] * y + m[5]) / d;
      const x0 = Math.min(sw - 2, Math.max(0, Math.floor(u)));
      const y0 = Math.min(sh - 2, Math.max(0, Math.floor(v)));
      const fx = Math.min(1, Math.max(0, u - x0));
      const fy = Math.min(1, Math.max(0, v - y0));
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        data[o + c] = (src[i00 + c] * (1 - fx) + src[i10 + c] * fx) * (1 - fy) + (src[i01 + c] * (1 - fx) + src[i11 + c] * fx) * fy;
      }
      data[o + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

// Mode « document » : niveaux de gris, ombres effacées (on divise par le fond
// local), puis contraste : fond blanc, texte bien noir.
export function enhanceDocument(img) {
  const { width: w, height: h } = img;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2];
  // Image intégrale -> moyenne locale (le « fond ») sur un grand carré
  const r = Math.max(8, Math.round(Math.max(w, h) / 40));
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const area = (y1 - y0) * (x1 - x0);
      const mean = (sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]) / area;
      // Le fond local est un peu plus clair que la moyenne (qui inclut le texte)
      const ratio = gray[y * w + x] / Math.max(1, mean * 1.04);
      const v = Math.max(0, Math.min(255, ((ratio - 0.6) / 0.32) * 255));
      const o = (y * w + x) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}
