// Fenêtre du scanner : la photo, les quatre coins du document (trouvés tout seuls,
// ajustables du doigt), puis « Document » (noir sur blanc) ou « Couleur ».
//
//   const blob = await scanImage(file)   // JPEG redressé et recadré, ou null si annulé

import { esc } from "../../core/dom.js";
import { t } from "../../i18n/index.js";
import { detectDocument, enhanceDocument, fullFrame, warpDocument } from "../../scan/scan.js";
import { closeModal, openModal } from "./modal.js";

const WORK_SIDE = 2400; // la photo est d'abord réduite à cette taille (mémoire de l'iPhone)
const OUT_SIDE = 1800; // taille du justificatif enregistré (côté le plus long)

// Fichier image -> pixels { data, width, height } (orientation de l'appareil photo respectée)
export async function fileToImage(file, maxSide = WORK_SIDE) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return ctx.getImageData(0, 0, width, height);
}

export function imageToJpeg(img, quality = 0.82) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d").putImageData(img instanceof ImageData ? img : new ImageData(img.data, img.width, img.height), 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

// Tourner d'un quart de tour (sens horaire)
function rotate(img) {
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = (x * h + (h - 1 - y)) * 4;
      out[o] = data[i];
      out[o + 1] = data[i + 1];
      out[o + 2] = data[i + 2];
      out[o + 3] = 255;
    }
  }
  return new ImageData(out, h, w);
}

export function scanImage(file) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      closeModal();
      resolve(value);
    };
    openModal(`<div class="scanner">
        <h2 id="scan-title">📷 ${t("scan.title")}</h2>
        <p class="hint" data-scan="hint">${t("scan.loading")}</p>
        <div class="scan-stage" data-scan="stage">
          <canvas data-scan="canvas"></canvas>
          <svg class="scan-quad" data-scan="svg"><polygon data-scan="poly"></polygon></svg>
          ${[0, 1, 2, 3].map((k) => `<button type="button" class="scan-handle" data-scan="handle" data-k="${k}" aria-label="${esc(t("scan.corner"))}"></button>`).join("")}
        </div>
        <div class="segmented scan-mode" role="radiogroup" aria-label="${esc(t("scan.mode"))}">
          <label><input type="radio" name="scan-mode" value="doc" checked><span>${t("scan.document")}</span></label>
          <label><input type="radio" name="scan-mode" value="color"><span>${t("scan.color")}</span></label>
        </div>
        <div class="actions start">
          <button type="button" class="btn soft" data-scan="full">${t("scan.fullPhoto")}</button>
          <button type="button" class="btn soft" data-scan="rotate">↻ ${t("scan.rotate")}</button>
        </div>
        <div class="actions">
          <button type="button" class="btn ghost" data-scan="cancel">${t("form.cancel")}</button>
          <button type="button" class="btn primary" data-scan="save" disabled>✓ ${t("scan.save")}</button>
        </div>
      </div>`, { labelledBy: "scan-title" });
    const sheet = document.querySelector("#modal .sheet");
    const q = (name) => sheet.querySelector(`[data-scan=${name}]`);
    const canvas = q("canvas");
    const stage = q("stage");
    let img = null;
    let quad = null;
    let view = 1; // pixels de la photo -> pixels à l'écran

    const draw = () => {
      const maxW = stage.clientWidth || 320;
      const maxH = Math.min(window.innerHeight * 0.55, 560);
      view = Math.min(maxW / img.width, maxH / img.height);
      canvas.width = Math.round(img.width * view);
      canvas.height = Math.round(img.height * view);
      const small = document.createElement("canvas");
      small.width = img.width;
      small.height = img.height;
      small.getContext("2d").putImageData(img, 0, 0);
      canvas.getContext("2d").drawImage(small, 0, 0, canvas.width, canvas.height);
      stage.style.height = `${canvas.height}px`;
      q("svg").setAttribute("width", canvas.width);
      q("svg").setAttribute("height", canvas.height);
      place();
    };
    const place = () => {
      const left = canvas.offsetLeft;
      q("poly").setAttribute("points", quad.map((p) => `${p.x * view},${p.y * view}`).join(" "));
      q("svg").style.left = `${left}px`;
      sheet.querySelectorAll("[data-scan=handle]").forEach((h) => {
        const p = quad[Number(h.dataset.k)];
        h.style.left = `${left + p.x * view}px`;
        h.style.top = `${p.y * view}px`;
      });
    };
    const findCorners = () => {
      quad = detectDocument(img);
      q("hint").textContent = t(quad ? "scan.found" : "scan.notFound");
      quad ??= fullFrame(img);
    };

    // Déplacer un coin du doigt
    let dragging = null;
    sheet.addEventListener("pointerdown", (e) => {
      const h = e.target.closest("[data-scan=handle]");
      if (!h || !quad) return;
      dragging = Number(h.dataset.k);
      h.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    sheet.addEventListener("pointermove", (e) => {
      if (dragging === null) return;
      const rect = canvas.getBoundingClientRect();
      quad[dragging] = {
        x: Math.min(img.width, Math.max(0, (e.clientX - rect.left) / view)),
        y: Math.min(img.height, Math.max(0, (e.clientY - rect.top) / view)),
      };
      place();
    });
    const stop = () => {
      dragging = null;
    };
    sheet.addEventListener("pointerup", stop);
    sheet.addEventListener("pointercancel", stop);

    sheet.addEventListener("click", async (e) => {
      const action = e.target.closest("[data-scan]")?.dataset.scan;
      if (action === "cancel") finish(null);
      if (!img) return;
      if (action === "full") {
        quad = fullFrame(img, 0);
        place();
      }
      if (action === "rotate") {
        img = rotate(img);
        findCorners();
        draw();
      }
      if (action === "save") {
        q("save").disabled = true;
        q("hint").textContent = t("scan.saving");
        await new Promise((r) => setTimeout(r, 30)); // laisser s'afficher le message
        let out = warpDocument(img, quad, { maxSide: OUT_SIDE });
        if (sheet.querySelector("[name=scan-mode]:checked")?.value === "doc") out = enhanceDocument(out);
        finish(await imageToJpeg(out));
      }
    });
    // Fermer la fenêtre autrement (touche Échap, toucher à côté) = annuler
    const watch = new MutationObserver(() => {
      if (document.querySelector("#modal").hidden) {
        watch.disconnect();
        if (!done) {
          done = true;
          resolve(null);
        }
      }
    });
    watch.observe(document.querySelector("#modal"), { attributes: true, attributeFilter: ["hidden"] });

    fileToImage(file).then((loaded) => {
      img = loaded;
      findCorners();
      draw();
      q("save").disabled = false;
    }).catch(() => {
      q("hint").textContent = t("scan.error");
    });
  });
}
