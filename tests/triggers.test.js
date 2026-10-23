import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeItem } from "../js/data/item.js";
import { TriggerEngine } from "../js/triggers/engine.js";
import { calendarTriggers } from "../js/triggers/calendar-triggers.js";
import { proximityTriggers } from "../js/triggers/proximity-triggers.js";
import { distanceMeters } from "../js/geo/geo.js";

const item = (o) => normalizeItem({ id: o.title, ...o });
const engine = new TriggerEngine().register(...calendarTriggers, ...proximityTriggers);
const today = "2026-10-23";

test("voyage dans 3 semaines : préparation", () => {
  const items = [
    item({ title: "Québec", module: "voyage", date: "2026-11-13" }),
    item({ title: "Paris", module: "voyage", date: "2026-12-20" }),
  ];
  const nudges = engine.evaluate({ items, today, settings: {} });
  assert.equal(nudges.length, 1);
  assert.match(nudges[0].message, /Québec.*dans 21 jours/);
});

test("habitude manquée : encouragement, et masquage pour la journée", () => {
  const items = [item({ title: "Yoga", module: "habitude", date: "2026-10-22" })];
  const [n] = engine.evaluate({ items, today, settings: {} });
  assert.match(n.message, /nouvelle chance/);
  assert.equal(engine.evaluate({ items, today, settings: { dismissedNudges: { [n.id]: today } } }).length, 0);
});

test("proximité : liste de commissions près de l'épicerie", () => {
  const iga = { lat: 45.5701, lng: -73.7512 };
  const items = [
    item({ title: "Lait", module: "commission", date: today, place: "IGA", ...iga }),
    item({ title: "Pain", module: "commission", date: "2026-10-20", place: "IGA", ...iga }),
    item({ title: "Plus tard", module: "commission", date: "2026-10-30", place: "IGA", ...iga }),
  ];
  const near = { lat: 45.5712, lng: -73.7515 };
  assert.ok(distanceMeters(near, iga) < 300);
  const nudges = engine.evaluate({ items, today, position: near, settings: { proximityRadiusMeters: 300 } });
  assert.equal(nudges.length, 1);
  assert.match(nudges[0].message, /près de IGA.*Lait, Pain/);
  const far = { lat: 45.6, lng: -73.8 };
  assert.equal(engine.evaluate({ items, today, position: far, settings: {} }).length, 0);
});
