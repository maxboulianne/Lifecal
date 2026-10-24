// Épiceries suivies. Ajouter une épicerie = ajouter une ligne ici.
// La couleur sert seulement à repérer l'épicerie (bordure, pastille).

export const STORES = [
  { id: "maxi", name: "Maxi", color: "#eab308" },
  { id: "superc", name: "Super C", color: "#f97316" },
  { id: "iga", name: "IGA", color: "#dc2626" },
  { id: "metro", name: "Metro", color: "#7c3aed" },
  { id: "mayrand", name: "Mayrand", color: "#16a34a" },
  { id: "5saveurs", name: "5 Saveurs", color: "#0d9488" },
  { id: "aubut", name: "Aubut", color: "#0ea5e9" },
  { id: "bourassa", name: "Bourassa", color: "#db2777" },
  { id: "walmart", name: "Walmart", color: "#2563eb" },
];

const byId = new Map(STORES.map((s) => [s.id, s]));
export const getStore = (id) => byId.get(id) ?? null;
export const ALL_STORE_IDS = STORES.map((s) => s.id);

// Lien vers la circulaire de la semaine (une recherche : fonctionne même si
// l'épicerie change l'adresse de sa page).
export const flyerUrl = (store) => `https://www.google.com/search?q=${encodeURIComponent(`circulaire ${store.name} cette semaine`)}`;
