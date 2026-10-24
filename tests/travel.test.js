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
