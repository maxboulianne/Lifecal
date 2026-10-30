// Lecture du texte d'un reçu (OCR) avec Tesseract, directement sur l'appareil :
// la photo n'est envoyée nulle part. Le programme (et le modèle français, ~2 Mo)
// est téléchargé une fois depuis le CDN jsDelivr, puis gardé par le navigateur.

const CDN = "https://cdn.jsdelivr.net/npm";
export const OCR_URLS = {
  lib: `${CDN}/tesseract.js@5.1.1/dist/tesseract.esm.min.js`,
  worker: `${CDN}/tesseract.js@5.1.1/dist/worker.min.js`,
  core: `${CDN}/tesseract.js-core@5.1.1`,
  lang: `${CDN}/@tesseract.js-data/fra@1.0.0/4.0.0_best_int`,
};

let workerPromise = null;

async function worker(onProgress) {
  workerPromise ??= (async () => {
    const { default: Tesseract } = await import(OCR_URLS.lib);
    return Tesseract.createWorker("fra", 1, {
      workerPath: OCR_URLS.worker,
      corePath: OCR_URLS.core,
      langPath: OCR_URLS.lang,
      logger: (m) => onProgress?.(m),
    });
  })().catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

// Texte lu dans une image (Blob) ; une erreur si l'outil n'a pas pu être chargé (hors ligne…)
export async function readText(image, onProgress) {
  const w = await worker(onProgress);
  const { data } = await w.recognize(image);
  return data.text ?? "";
}
