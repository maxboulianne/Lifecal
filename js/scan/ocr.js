// Lecture du texte d'un reçu (OCR) avec Tesseract, directement sur l'appareil :
// la photo n'est envoyée nulle part. Le programme et le modèle de chaque langue
// (1 à 3 Mo) sont téléchargés une fois depuis le CDN jsDelivr, puis gardés par le navigateur.
//
//   readText(image, onProgress, lang)   lang : « fra », « vie+eng », « chi_sim+eng »…

const CDN = "https://cdn.jsdelivr.net/npm";
export const OCR_URLS = {
  lib: `${CDN}/tesseract.js@5.1.1/dist/tesseract.esm.min.js`,
  worker: `${CDN}/tesseract.js@5.1.1/dist/worker.min.js`,
  core: `${CDN}/tesseract.js-core@5.1.1`,
};

// Langues de reçus proposées (modèles Tesseract)
export const OCR_LANGUAGES = ["fra", "eng", "spa", "por", "deu", "vie", "chi_sim", "chi_tra", "jpn", "kor", "tha", "ara", "ind"];
// Code de langue pour afficher son nom (Intl.DisplayNames)
export const OCR_LANGUAGE_TAGS = { fra: "fr", eng: "en", spa: "es", por: "pt", deu: "de", vie: "vi", chi_sim: "zh-Hans", chi_tra: "zh-Hant", jpn: "ja", kor: "ko", tha: "th", ara: "ar", ind: "id" };

// Langue probable d'un reçu selon la devise payée (en voyage, la devise du pays)
const BY_CURRENCY = {
  CAD: "fra", USD: "eng", GBP: "eng", AUD: "eng", NZD: "eng", SGD: "eng", INR: "eng", PHP: "eng", MYR: "eng", HKD: "chi_tra",
  EUR: "fra", CHF: "deu", MXN: "spa", BRL: "por", AED: "ara", SAR: "ara", CNY: "chi_sim", TWD: "chi_tra",
  JPY: "jpn", KRW: "kor", VND: "vie", THB: "tha", IDR: "ind",
};
export const languageForCurrency = (currency) => BY_CURRENCY[currency] ?? "eng";

// Modèles à charger : la langue du reçu, plus l'anglais (souvent présent sur les reçus à
// l'étranger : « TOTAL », « VISA »…). Le français et l'anglais se lisent seuls.
export const ocrModels = (lang) => (lang === "fra" || lang === "eng" ? lang : `${lang}+eng`);

let current = null; // { models, promise } : un seul lecteur à la fois (mémoire de l'iPhone)

async function worker(models, onProgress) {
  if (current?.models !== models) {
    const previous = current;
    current = {
      models,
      promise: (async () => {
        const { default: Tesseract } = await import(OCR_URLS.lib);
        // Sans langPath, chaque langue vient de son paquet : @tesseract.js-data/<langue>/4.0.0_best_int
        return Tesseract.createWorker(models, 1, {
          workerPath: OCR_URLS.worker,
          corePath: OCR_URLS.core,
          logger: (m) => current?.onProgress?.(m),
        });
      })(),
    };
    previous?.promise.then((w) => w.terminate()).catch(() => {});
  }
  const mine = current;
  mine.onProgress = onProgress;
  try {
    return await mine.promise;
  } catch (err) {
    if (current === mine) current = null;
    throw err;
  }
}

// Texte lu dans une image (Blob) ; une erreur si l'outil n'a pas pu être chargé (hors ligne…)
export async function readText(image, onProgress, lang = "fra") {
  const w = await worker(ocrModels(lang), onProgress);
  const { data } = await w.recognize(image);
  return data.text ?? "";
}
