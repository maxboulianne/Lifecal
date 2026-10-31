// Fichiers joints (photos et PDF des justificatifs) : rangés dans IndexedDB,
// qui accepte de gros fichiers (localStorage est trop petit pour des photos).
// Ils restent sur l'appareil, comme le reste des données.
//
//   await putFile(id, blob)   await getFile(id) -> Blob | null   await deleteFile(id)
//   await pruneFiles(idsÀGarder)   (efface les fichiers qui ne servent plus)

const DB_NAME = "lifecal-files";
const STORE = "files";
let opening = null;

function db() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("IndexedDB indisponible"));
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

async function run(mode, action) {
  const store = (await db()).transaction(STORE, mode).objectStore(STORE);
  return new Promise((resolve, reject) => {
    const req = action(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const putFile = (id, blob) => run("readwrite", (s) => s.put(blob, id));
export const getFile = async (id) => (await run("readonly", (s) => s.get(id))) ?? null;
export const deleteFile = (id) => run("readwrite", (s) => s.delete(id));
export const fileIds = () => run("readonly", (s) => s.getAllKeys());

// Effacer les fichiers qu'aucune dépense n'utilise plus (dépense ou projet supprimé…)
export async function pruneFiles(keep) {
  const wanted = new Set(keep);
  for (const id of await fileIds()) if (!wanted.has(id)) await deleteFile(id);
}

// Empreinte d'un fichier (SHA-256) : deux justificatifs identiques ont la même, même
// enregistrés séparément (ex. la même photo choisie deux fois).
export async function blobHash(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
