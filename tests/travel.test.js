import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeItem } from "../js/data/item.js";
import { occurrencesBetween } from "../js/data/recurrence.js";
import { addPlace, getPlaces, located, placeMapUrl, removePlace, setPlaceCoords, toggleVisited, tripEnd, tripLength, tripStatus } from "../js/travel/trip.js";
import { geocode } from "../js/travel/geocode.js";

const trip = (data = {}) => normalizeItem({ id: "t1", title: "Lisbonne", module: "voyage", date: "2026-11-02", data });

test("un voyage avec date de retour apparaît chaque jour du séjour", () => {
  const occ = occurrencesBetween([trip({ endDate: "2026-11-05" })], "2026-11-01", "2026-11-30");
  assert.deepEqual(occ.map((o) => o.date), ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
  assert.deepEqual(occ[1].span, { start: "2026-11-02", end: "2026-11-05", day: 2, days: 4 });
  assert.ok(occ.every((o) => o.id === "t1"));
});

test("une semaine coupe le voyage à ses bornes", () => {
  const occ = occurrencesBetween([trip({ endDate: "2026-11-10" })], "2026-11-09", "2026-11-15");
  assert.deepEqual(occ.map((o) => [o.date, o.span.day]), [["2026-11-09", 8], ["2026-11-10", 9]]);
});

test("sans date de retour (ou date invalide) : un seul jour", () => {
  for (const data of [{}, { endDate: "2026-11-01" }, { endDate: "2026-11-02" }]) {
    const occ = occurrencesBetween([trip(data)], "2026-11-01", "2026-11-30");
    assert.equal(occ.length, 1);
    assert.equal(occ[0].span, undefined);
  }
});

test("compte à rebours, voyage en cours, voyage passé", () => {
  const t = trip({ endDate: "2026-11-05" });
  assert.equal(tripEnd(t), "2026-11-05");
  assert.equal(tripLength(t), 4);
  assert.deepEqual(tripStatus(t, "2026-10-24"), { phase: "before", days: 9, total: 4 });
  assert.deepEqual(tripStatus(t, "2026-11-03"), { phase: "during", day: 2, total: 4 });
  assert.deepEqual(tripStatus(t, "2026-11-06"), { phase: "after", total: 4 });
  assert.equal(tripLength(trip()), 1);
});

test("lieux à visiter : ajouter, cocher, situer, retirer", () => {
  let list = addPlace(getPlaces(trip()), "  Belém  ");
  list = addPlace(list, "   ");
  list = addPlace(list, "Alfama");
  assert.deepEqual(list.map((p) => p.name), ["Belém", "Alfama"]);
  list = toggleVisited(list, list[0].id);
  assert.equal(list[0].visited, true);
  list = setPlaceCoords(list, list[1].id, { lat: 38.71, lng: -9.13 });
  assert.deepEqual(located(list).map((p) => p.name), ["Alfama"]);
  assert.match(placeMapUrl(list[1]), /mlat=38.71&mlon=-9.13/);
  assert.match(placeMapUrl(list[0], "Lisbonne"), /search\?query=Bel%C3%A9m%2C%20Lisbonne/);
  assert.equal(removePlace(list, list[0].id).length, 1);
});

test("recherche d'un lieu : résultat, aucun résultat", async () => {
  let url = "";
  const fetchOk = async (u) => {
    url = u;
    return { ok: true, json: async () => [{ lat: "38.6916", lon: "-9.2160", display_name: "Belém, Lisboa" }] };
  };
  assert.deepEqual(await geocode("Belém", "fr", fetchOk), { lat: 38.6916, lng: -9.216, label: "Belém, Lisboa" });
  assert.match(url, /nominatim/);
  const fetchEmpty = async () => ({ ok: true, json: async () => [] });
  assert.equal(await geocode("zzz", "fr", fetchEmpty), null);
});

import { HOTEL_CHAINS, classifyChain, fetchHotels, fetchSuggestions, hotelsQuery, parseHotels, parseSuggestions, suggestionsUrl } from "../js/travel/discover.js";

const milan = { lat: 45.4642, lng: 9.19 };

test("lieux célèbres : classés par lectures, sans gares, rues ni la ville elle-même", async () => {
  const json = { query: { pages: [
    { title: "Milan", description: "ville d'Italie", coordinates: [{ lat: 45.46, lon: 9.19 }], pageviews: { a: 90000 } },
    { title: "Cathédrale de Milan", description: "cathédrale gothique", coordinates: [{ lat: 45.4641, lon: 9.1919 }], pageviews: { a: 5000, b: 4000 }, fullurl: "https://fr.wikipedia.org/wiki/Cath%C3%A9drale_de_Milan" },
    { title: "Gare de Milan-Centrale", description: "gare ferroviaire", coordinates: [{ lat: 45.48, lon: 9.2 }], pageviews: { a: 8000 } },
    { title: "La Scala", description: "opéra", coordinates: [{ lat: 45.4674, lon: 9.1895 }], pageviews: { a: 7000, b: null } },
    { title: "Sans position", description: "musée", pageviews: { a: 99999 } },
  ] } };
  const list = parseSuggestions(json, { exclude: ["Milan"] });
  assert.deepEqual(list.map((s) => [s.name, s.views]), [["Cathédrale de Milan", 9000], ["La Scala", 7000]]);
  assert.equal(list[0].url, "https://fr.wikipedia.org/wiki/Cath%C3%A9drale_de_Milan");
  assert.deepEqual([list[0].lat, list[0].lng], [45.4641, 9.1919]);
  // Ancien format (pages en objet) accepté aussi
  assert.equal(parseSuggestions({ query: { pages: { 1: json.query.pages[1] } } }).length, 1);
  const url = new URL(suggestionsUrl(milan, "fr"));
  assert.equal(url.host, "fr.wikipedia.org");
  assert.equal(url.searchParams.get("ggscoord"), "45.4642|9.19");
  assert.equal(url.searchParams.get("origin"), "*");
  let asked = "";
  const out = await fetchSuggestions(milan, "en", { fetchImpl: async (u) => { asked = u; return { ok: true, json: async () => json }; } });
  assert.match(asked, /^https:\/\/en\.wikipedia\.org/);
  assert.equal(out.length, 2, "la ville elle-même est écartée par sa description");
});

test("hôtels : chaîne reconnue par la marque ou le nom, 25 km, triés par distance", async () => {
  assert.equal(classifyChain({ brand: "Courtyard", name: "Courtyard Milan Linate" }, ["marriott", "hilton"]), "marriott");
  assert.equal(classifyChain({ name: "Hampton by Hilton Milan Bicocca" }, ["marriott", "hilton"]), "hilton");
  assert.equal(classifyChain({ name: "Hotel Rosa" }, ["marriott", "hilton"]), null);
  assert.equal(classifyChain({ name: "Hilton Milan" }, ["marriott"]), null, "chaîne non choisie");
  const json = { elements: [
    { type: "node", id: 1, lat: 45.47, lon: 9.2, tags: { tourism: "hotel", name: "Hilton Milan", brand: "Hilton", website: "https://hilton.example/milan" } },
    { type: "way", id: 2, center: { lat: 45.4645, lon: 9.191 }, tags: { tourism: "hotel", name: "DoubleTree by Hilton Milan" } },
    { type: "node", id: 1, lat: 45.47, lon: 9.2, tags: { tourism: "hotel", name: "Hilton Milan", brand: "Hilton" } }, // doublon
    { type: "node", id: 3, lat: 46.2, lon: 9.2, tags: { tourism: "hotel", name: "Hilton Lontano" } }, // > 25 km
    { type: "node", id: 4, lat: 45.47, lon: 9.2, tags: { tourism: "hotel", name: "Albergo Rosa" } },
  ] };
  const hotels = parseHotels(json, ["hilton"], milan);
  assert.deepEqual(hotels.map((h) => [h.name, h.chain]), [["DoubleTree by Hilton Milan", "hilton"], ["Hilton Milan", "hilton"]]);
  assert.equal(hotels[1].url, "https://hilton.example/milan");
  assert.equal(hotels[0].url, "https://www.hilton.com", "sans site : le site de la chaîne");
  assert.ok(hotels[0].km < hotels[1].km);
  const q = hotelsQuery(milan);
  assert.match(q, /nwr\["tourism"="hotel"\]\(around:25000,45.4642,9.19\)/);
  assert.doesNotMatch(q, /~/, "aucune comparaison de noms côté serveur (trop lente)");
  // Un serveur qui dépasse son temps limite (200 + remarque) : on essaie le suivant.
  const asked = [];
  const answers = [{ remark: "runtime error: Query timed out in \"query\" at line 2 after 61 seconds.", elements: [] }, json];
  const found = await fetchHotels(["hilton"], milan, {
    servers: ["https://a.example", "https://b.example"],
    fetchImpl: async (u, o) => { asked.push(u); assert.match(decodeURIComponent(o.body), /tourism"="hotel/); return { ok: true, json: async () => answers.shift() }; },
  });
  assert.deepEqual(asked, ["https://a.example", "https://b.example"]);
  assert.equal(found.length, 2);
  await assert.rejects(fetchHotels(["hilton"], milan, { servers: ["https://a.example"], fetchImpl: async () => ({ ok: false, status: 504 }) }));
  assert.equal(HOTEL_CHAINS.length, 9);
  for (const c of HOTEL_CHAINS) assert.doesNotThrow(() => new RegExp(c.brands), c.id);
});

import { RAW_PACKING, packingCatalog } from "../js/travel/packing.js";
import { productKey } from "../js/grocery/grocery.js";

test("liste à emporter : 7 langues, sans doublon, triée", () => {
  for (const c of RAW_PACKING) {
    assert.equal(c.name.length, 7, c.id);
    for (const item of c.items) assert.equal(item.length, 7, item[0]);
  }
  for (const lang of ["fr", "en", "es", "pt", "de", "vi", "ko"]) {
    const keys = packingCatalog(lang).flatMap((c) => c.items).map(productKey);
    assert.equal(new Set(keys).size, keys.length, `doublon en ${lang}`);
  }
  const docs = packingCatalog("fr").find((c) => c.id === "documents").items;
  assert.ok(docs.includes("Passeport"));
  assert.deepEqual(docs, [...docs].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })));
});
