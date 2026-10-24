// Découvrir une destination : lieux célèbres à proximité et hôtels des grandes
// chaînes. Tout passe par des services publics et gratuits, appelés depuis le
// navigateur (sans clé ni serveur) :
//  - Wikipédia : articles géolocalisés autour de la destination, classés selon
//    leur nombre de lectures des 30 derniers jours (les lieux les plus connus) ;
//  - OpenStreetMap (Overpass) : tous les hôtels dans un rayon de 25 km ; ceux
//    des chaînes choisies sont reconnus ici, d'après leur marque ou leur nom
//    (une requête simple est rapide ; comparer les noms côté serveur dépassait
//    son temps limite, et il répondait alors une liste vide).
// Les fonctions « parse » sont pures (testées sans Internet).

import { distanceMeters } from "../geo/geo.js";

export const HOTEL_RADIUS_KM = 25;
export const MAX_CHAINS = 2;
const SUGGESTION_RADIUS_M = 10000; // maximum permis par Wikipédia
const MAX_SUGGESTIONS = 12;

// Grandes chaînes et leurs marques (comparées au nom ou à la marque de l'hôtel).
export const HOTEL_CHAINS = [
  { id: "marriott", name: "Marriott", color: "#b91c1c", site: "https://www.marriott.com",
    brands: "Marriott|Courtyard|Residence Inn|Fairfield|SpringHill|Sheraton|Westin|Four Points|Delta Hotels|Renaissance|Le M[eé]ridien|AC Hotel|Aloft|Moxy|St. Regis|Ritz-Carlton|Autograph Collection|TownePlace|Gaylord|Protea" },
  { id: "hilton", name: "Hilton", color: "#1d4ed8", site: "https://www.hilton.com",
    brands: "Hilton|DoubleTree|Hampton Inn|Hampton by Hilton|Embassy Suites|Homewood Suites|Home2 Suites|Conrad|Waldorf Astoria|Canopy by Hilton|Curio Collection|Tru by Hilton|Tapestry Collection|Motto by Hilton" },
  { id: "ihg", name: "IHG (Holiday Inn, Crowne Plaza…)", color: "#15803d", site: "https://www.ihg.com",
    brands: "Holiday Inn|Crowne Plaza|InterContinental|Kimpton|Staybridge|Candlewood|Hotel Indigo|avid hotel|EVEN Hotel|voco" },
  { id: "hyatt", name: "Hyatt", color: "#7c3aed", site: "https://www.hyatt.com",
    brands: "Hyatt|Andaz|Alila|Thompson Hotel" },
  { id: "accor", name: "Accor (Novotel, ibis, Fairmont…)", color: "#0e7490", site: "https://all.accor.com",
    brands: "Novotel|ibis|Mercure|Sofitel|Pullman|Fairmont|Swiss[oô]tel|M[oö]venpick|Adagio|MGallery|Raffles|Mama Shelter" },
  { id: "bestwestern", name: "Best Western", color: "#ca8a04", site: "https://www.bestwestern.com",
    brands: "Best Western|SureStay" },
  { id: "radisson", name: "Radisson", color: "#db2777", site: "https://www.radissonhotels.com",
    brands: "Radisson|Park Inn|Country Inn & Suites|Park Plaza" },
  { id: "wyndham", name: "Wyndham (Days Inn, Ramada…)", color: "#ea580c", site: "https://www.wyndhamhotels.com",
    brands: "Wyndham|Days Inn|Super 8|Ramada|La Quinta|Travelodge|Wingate|Microtel|Baymont|Howard Johnson" },
  { id: "choice", name: "Choice (Comfort Inn, Quality…)", color: "#4d7c0f", site: "https://www.choicehotels.com",
    brands: "Comfort Inn|Comfort Suites|Comfort Hotel|Quality Inn|Quality Hotel|Sleep Inn|Clarion|Econo Lodge|Cambria|Ascend" },
];
const chainById = new Map(HOTEL_CHAINS.map((c) => [c.id, c]));
export const getChain = (id) => chainById.get(id) ?? null;

// ---- Lieux célèbres (Wikipédia) ------------------------------------------------

export function suggestionsUrl({ lat, lng }, lang) {
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", origin: "*",
    generator: "geosearch", ggscoord: `${lat}|${lng}`, ggsradius: String(SUGGESTION_RADIUS_M), ggslimit: "50",
    prop: "coordinates|pageviews|description|info", inprop: "url", colimit: "max", pvipdays: "30",
  });
  return `https://${lang}.wikipedia.org/w/api.php?${params}`;
}

// Ce qui n'est pas un « lieu à visiter » (descriptions de Wikipédia, plusieurs
// langues) : gares, rues, entreprises, écoles… n'importe où dans la description ;
// villes, quartiers, régions… seulement au début (« ville d'Italie », mais pas
// « musée de New York City »).
const words = (list) => list.join("|");
const ANYWHERE = words(["gare", "station", "métro", "metro", "estación", "estação", "bahnhof", "u-bahn", "aéroport", "airport",
  "aeropuerto", "aeroporto", "flughafen", "rue", "street", "calle", "rua", "straße", "strasse", "entreprise", "company", "empresa",
  "unternehmen", "club de football", "football club", "hôpital", "hospital", "krankenhaus", "école", "school", "escuela", "escola", "schule"]);
const AT_START = words(["ville", "city", "town", "commune", "municipality", "comune", "ciudad", "cidade", "stadt", "gemeinde",
  "quartier", "neighbourhood", "neighborhood", "district", "borough", "barrio", "bairro", "stadtteil", "bezirk", "arrondissement",
  "région", "region", "province", "provincia", "pays", "country", "capitale", "capital"]);
const NOT_A_SIGHT = new RegExp(`(^|[^\\p{L}])(${ANYWHERE})([^\\p{L}]|$)|^\\s*(\\p{L}+\\s)?(${AT_START})([^\\p{L}]|$)`, "iu");

export function parseSuggestions(json, { exclude = [] } = {}) {
  const pages = Array.isArray(json?.query?.pages) ? json.query.pages : Object.values(json?.query?.pages ?? {});
  const skip = new Set(exclude.map((s) => s.toLowerCase()));
  return pages
    .filter((p) => p.coordinates?.length && !skip.has(String(p.title).toLowerCase()))
    .filter((p) => !NOT_A_SIGHT.test(`${p.description ?? ""}`))
    .map((p) => ({
      name: p.title,
      description: p.description ?? "",
      lat: p.coordinates[0].lat,
      lng: p.coordinates[0].lon,
      url: p.fullurl ?? null,
      views: Object.values(p.pageviews ?? {}).reduce((a, n) => a + (Number(n) || 0), 0),
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, MAX_SUGGESTIONS);
}

export async function fetchSuggestions(center, lang, { exclude = [], fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(suggestionsUrl(center, lang));
  if (!response.ok) throw new Error(`Wikipédia ${response.status}`);
  return parseSuggestions(await response.json(), { exclude });
}

// ---- Hôtels (OpenStreetMap) ------------------------------------------------------

export const OVERPASS_SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

// Tous les hôtels autour de la destination (le tri par chaîne se fait ici).
export function hotelsQuery({ lat, lng }, radiusKm = HOTEL_RADIUS_KM) {
  return `[out:json][timeout:60];
nwr["tourism"="hotel"](around:${radiusKm * 1000},${lat},${lng});
out center tags;`;
}

// La chaîne d'un hôtel, d'après sa marque (plus sûre), sinon son nom.
export function classifyChain(tags, chainIds) {
  for (const field of ["brand", "name"]) {
    const value = tags?.[field];
    if (!value) continue;
    const chain = chainIds.map(getChain).find((c) => c && new RegExp(`(${c.brands})`, "i").test(value));
    if (chain) return chain.id;
  }
  return null;
}

export function parseHotels(json, chainIds, center, radiusKm = HOTEL_RADIUS_KM) {
  const seen = new Set();
  const hotels = [];
  for (const el of json?.elements ?? []) {
    const key = `${el.type}/${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    const chain = classifyChain(tags, chainIds);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !chain || !tags.name) continue;
    const km = distanceMeters(center, { lat, lng }) / 1000;
    if (km > radiusKm) continue;
    hotels.push({
      id: key, name: tags.name, chain, lat, lng, km: Math.round(km * 10) / 10,
      url: tags.website ?? tags["contact:website"] ?? tags["brand:website"] ?? getChain(chain).site,
    });
  }
  return hotels.sort((a, b) => a.km - b.km);
}

// Essaie chaque serveur Overpass : un serveur occupé ou qui dépasse son temps
// limite répond parfois « 200 » avec une remarque et aucune donnée.
export async function fetchHotels(chainIds, center, { fetchImpl = globalThis.fetch, servers = OVERPASS_SERVERS } = {}) {
  let lastError = null;
  for (const server of servers) {
    try {
      const response = await fetchImpl(server, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(hotelsQuery(center))}`,
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const json = await response.json();
      if (json.remark && /error|timed out|out of memory/i.test(json.remark)) throw new Error(`Overpass : ${json.remark}`);
      return parseHotels(json, chainIds, center);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
