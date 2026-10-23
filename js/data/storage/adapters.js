// Adaptateurs de stockage.
//
// Le dépôt (repository.js) ne parle qu'à cette interface asynchrone :
//   load()      -> Promise<document | null>
//   save(doc)   -> Promise<void>
//   clear()     -> Promise<void>
//
// Pour passer plus tard à IndexedDB, à un serveur ou à une base synchronisée,
// il suffit d'écrire un nouvel adaptateur qui respecte ces trois méthodes.

export class LocalStorageAdapter {
  constructor(key = "lifecal:data", storage = globalThis.localStorage) {
    this.key = key;
    this.storage = storage;
  }

  async load() {
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      console.warn("LifeCal : données illisibles, elles sont conservées sous", `${this.key}:corrompu`);
      this.storage.setItem(`${this.key}:corrompu`, raw);
      return null;
    }
  }

  async save(doc) {
    this.storage.setItem(this.key, JSON.stringify(doc));
  }

  async clear() {
    this.storage.removeItem(this.key);
  }
}

// Stockage en mémoire : tests, ou repli si localStorage est indisponible
// (navigation privée stricte).
export class MemoryAdapter {
  constructor(initial = null) {
    this.doc = initial ? structuredClone(initial) : null;
  }

  async load() {
    return this.doc ? structuredClone(this.doc) : null;
  }

  async save(doc) {
    this.doc = structuredClone(doc);
  }

  async clear() {
    this.doc = null;
  }
}

export function isLocalStorageAvailable() {
  try {
    const k = "__lifecal_test__";
    localStorage.setItem(k, k);
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
