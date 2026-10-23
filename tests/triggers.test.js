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
  assert.equal(nudges[0].messageKey, "nudge.travel");
  assert.deepEqual(nudges[0].params, { title: "Québec", when: "dans 21 jours" });
});

test("habitude manquée : encouragement, et masquage pour la journée", () => {
  const items = [item({ title: "Yoga", module: "habitude", date: "2026-10-22" })];
  const [n] = engine.evaluate({ items, today, settings: {} });
  assert.equal(n.messageKey, "nudge.missedHabit");
  assert.equal(n.params.names, "Yoga");
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
  assert.deepEqual(nudges[0].params, { place: "IGA", list: "Lait et Pain" });
  const far = { lat: 45.6, lng: -73.8 };
  assert.equal(engine.evaluate({ items, today, position: far, settings: {} }).length, 0);
});

test("habitude répétée manquée hier, sauf si sautée", () => {
  const h = item({ title: "Méditer", module: "habitude", date: "2026-10-01", recurrence: { freq: "daily" } });
  assert.equal(engine.evaluate({ items: [h], today, settings: {} })[0].params.names, "Méditer");
  const skipped = { ...h, data: { skipped: { "2026-10-22": true } } };
  assert.equal(engine.evaluate({ items: [skipped], today, settings: {} }).length, 0);
});

test("bilan du lundi pour « X fois par semaine »", () => {
  const h = item({ title: "Course", module: "habitude", date: "2026-10-01", recurrence: { freq: "flexible", timesPerWeek: 3 },
    data: { completions: { "2026-10-13": true } } });
  const [n] = engine.evaluate({ items: [h], today: "2026-10-19", settings: {} });
  assert.deepEqual(n.params, { title: "Course", done: 1, target: 3 });
  assert.equal(engine.evaluate({ items: [h], today: "2026-10-20", settings: {} }).length, 0);
});
