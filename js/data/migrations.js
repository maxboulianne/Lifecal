// Versions du schéma de données et migrations.
//
// Le document enregistré a la forme :
//   { schemaVersion, items: [...], settings: {...}, grocery: {...} }
//
// Pour faire évoluer le format : incrémenter SCHEMA_VERSION et ajouter une
// fonction dans MIGRATIONS qui transforme la version N-1 en version N.

import { normalizeItem } from "./item.js";
import { emptyGrocery, normalizeGrocery } from "../grocery/grocery.js";

export const SCHEMA_VERSION = 3;

// Clé utilisée par le prototype calendrier.html (un simple tableau d'éléments).
export const LEGACY_KEY = "items";

export const DEFAULT_SETTINGS = Object.freeze({
  language: null, // null = pas encore choisie (écran d'accueil)
  proximityEnabled: false,
  proximityRadiusMeters: 300,
  dismissedNudges: {},
  connectedCalendars: [],
  lastExport: null, // date de la dernière copie exportée
  // Méditation : préférences du lecteur et voix choisie par langue (voiceURI).
  meditation: { voiceOn: true, ambience: "none", interval: 0, minutes: {}, voices: {} },
});

export function emptyDocument() {
  return { schemaVersion: SCHEMA_VERSION, items: [], settings: structuredClone(DEFAULT_SETTINGS), grocery: emptyGrocery() };
}

const MIGRATIONS = {
  // v1 = tableau brut du prototype -> v2 = document versionné.
  2(doc) {
    const items = (doc.items ?? []).map((raw) => {
      // Le prototype utilisait Date.now() comme id : on en déduit la date de création.
      const ts = Number(raw.id);
      const created = Number.isFinite(ts) && ts > 1e12 ? new Date(ts).toISOString() : null;
      return normalizeItem({ ...raw, createdAt: raw.createdAt ?? created, updatedAt: raw.updatedAt ?? created });
    });
    return { schemaVersion: 2, items, settings: { ...structuredClone(DEFAULT_SETTINGS), ...(doc.settings ?? {}) } };
  },
  // v2 -> v3 : carnet de prix et liste d'épicerie.
  3(doc) {
    return { ...doc, schemaVersion: 3, grocery: emptyGrocery() };
  },
};

export function migrate(input) {
  // Refuser tout ce qui n'a pas la forme attendue, plutôt que de le traiter
  // comme un document vide (ce qui effacerait les données à l'import).
  if (!Array.isArray(input) && !(input && typeof input === "object" && Array.isArray(input.items))) {
    throw new Error("Ce ne sont pas des données LifeCal.");
  }
  let doc = Array.isArray(input) ? { schemaVersion: 1, items: input } : { ...input };
  doc.schemaVersion ??= 1;
  if (doc.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Données créées par une version plus récente de LifeCal (v${doc.schemaVersion}).`);
  }
  while (doc.schemaVersion < SCHEMA_VERSION) {
    doc = MIGRATIONS[doc.schemaVersion + 1](doc);
  }
  doc.items = doc.items.map(normalizeItem);
  doc.settings = { ...structuredClone(DEFAULT_SETTINGS), ...doc.settings };
  doc.grocery = normalizeGrocery(doc.grocery);
  return doc;
}

// Récupère les données du prototype, s'il y en a, sans les effacer
// (on garde une copie de sécurité tant que Max n'a pas tout vérifié).
export function readLegacy(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
