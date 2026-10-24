// Trouver la position d'un lieu à partir de son nom, avec Nominatim
// (le service de recherche gratuit d'OpenStreetMap). Utilisé seulement quand
// on touche « Placer sur la carte », une recherche à la fois, comme le
// demandent ses règles d'utilisation.

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

// -> { lat, lng, label } ou null si rien n'est trouvé.
export async function geocode(query, language = "fr", fetchImpl = globalThis.fetch) {
  const url = `${ENDPOINT}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}&accept-language=${encodeURIComponent(language)}`;
  const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  const [hit] = await response.json();
  if (!hit) return null;
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name };
}
