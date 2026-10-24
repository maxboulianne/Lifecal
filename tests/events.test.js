import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeItem } from "../js/data/item.js";
import { isScheduledOn, occurrencesBetween, yearlyDate } from "../js/data/recurrence.js";
import { Repository } from "../js/data/repository.js";
import { MemoryAdapter } from "../js/data/storage/adapters.js";

const event = (o) => normalizeItem({ id: o.title, module: "evenement", recurrence: { freq: "yearly" }, ...o });

test("chaque année : une occurrence par an, à la même date", () => {
  const julie = event({ title: "Fête de Julie", date: "1964-10-29" });
  const occ = occurrencesBetween([julie], "2026-01-01", "2028-12-31");
  assert.deepEqual(occ.map((o) => o.date), ["2026-10-29", "2027-10-29", "2028-10-29"]);
  assert.equal(occ[0].occurrence.start, "1964-10-29");
  assert.equal(isScheduledOn(julie, "2026-10-29"), true);
  assert.equal(isScheduledOn(julie, "2026-10-30"), false);
  assert.equal(occurrencesBetween([julie], "1960-01-01", "1964-10-28").length, 0, "pas avant la date de départ");
});

test("29 février : le 28 les années non bissextiles", () => {
  assert.equal(yearlyDate("2000-02-29", 2027), "2027-02-28");
  assert.equal(yearlyDate("2000-02-29", 2028), "2028-02-29");
  const leap = event({ title: "Léo", date: "2000-02-29" });
  assert.deepEqual(occurrencesBetween([leap], "2027-01-01", "2028-12-31").map((o) => o.date), ["2027-02-28", "2028-02-29"]);
});

test("les fêtes ne sont pas des habitudes", async () => {
  const repo = new Repository(new MemoryAdapter({ schemaVersion: 3, items: [
    event({ title: "Fête de Julie", date: "1964-10-29" }),
    normalizeItem({ id: "yoga", title: "Yoga", module: "habitude", date: "2026-10-01", recurrence: { freq: "daily" } }),
  ], settings: {} }));
  await repo.init();
  assert.deepEqual(repo.habits().map((h) => h.title), ["Yoga"]);
});

import { ageOn, budgetOf, eventKind, reminderPhase, upcomingEvents } from "../js/events/events.js";
import { TriggerEngine } from "../js/triggers/engine.js";
import { calendarTriggers } from "../js/triggers/calendar-triggers.js";

const today = "2026-10-24";

test("âge, type et budget", () => {
  const julie = event({ title: "Fête de Julie", date: "1964-10-29", data: { kind: "birthday", budget: "50" } });
  const [occ] = occurrencesBetween([julie], "2026-10-29", "2026-10-29");
  assert.equal(ageOn(occ, occ.date), 62);
  assert.equal(ageOn({ ...occ, data: { ...occ.data, yearUnknown: true } }, occ.date), null, "année inconnue");
  assert.equal(ageOn(event({ title: "Souper", date: "2020-10-29", data: { kind: "event" } }), "2026-10-29"), null);
  assert.equal(eventKind(julie), "birthday");
  assert.equal(eventKind(normalizeItem({ module: "evenement", title: "x", date: today })), "event", "anciens événements");
  assert.equal(budgetOf(julie), 50);
  assert.equal(budgetOf({ data: { budget: "" } }), null);
});

test("à venir : 12 mois, du plus proche au plus lointain, annulés exclus", () => {
  const items = [
    event({ title: "Noces", date: "2001-06-16", data: { kind: "anniversary" } }),
    event({ title: "Fête de Julie", date: "1964-10-29", data: { kind: "birthday" } }),
    normalizeItem({ id: "s", title: "Souper", module: "evenement", date: "2026-11-07", data: { kind: "event" } }),
    normalizeItem({ id: "x", title: "Annulé", module: "evenement", date: "2026-11-08", status: "cancelled" }),
    normalizeItem({ id: "r", title: "Dentiste", module: "rdv", date: "2026-10-25" }),
  ];
  const list = upcomingEvents(items, today);
  assert.deepEqual(list.map((e) => [e.item.title, e.date, e.days, e.age]), [
    ["Fête de Julie", "2026-10-29", 5, 62],
    ["Souper", "2026-11-07", 14, null],
    ["Noces", "2027-06-16", 235, 26],
  ]);
});

test("rappels : 2 semaines avant, 2 jours avant, le jour même", () => {
  assert.deepEqual([0, 1, 2, 3, 14, 15].map(reminderPhase), ["today", "soon", "soon", "ahead", "ahead", null]);
  const engine = new TriggerEngine().register(...calendarTriggers);
  const julie = event({ title: "Fête de Julie", date: "1964-10-29", data: { kind: "birthday" } });
  const at = (day) => engine.evaluate({ items: [julie], today: day, settings: {} }).filter((n) => n.id.startsWith("evenement"));
  const [ahead] = at("2026-10-20");
  assert.equal(ahead.messageKey, "nudge.event.aheadAge");
  assert.deepEqual(ahead.params, { title: "Fête de Julie", when: "dans 9 jours", count: 62 });
  assert.equal(ahead.action, "open-item");
  assert.equal(ahead.actionDate, "2026-10-29");
  assert.equal(at("2026-10-28")[0].messageKey, "nudge.event.soonAge");
  assert.equal(at("2026-10-29")[0].messageKey, "nudge.event.todayAge");
  assert.equal(at("2026-10-01").length, 0);
  // Fermer le rappel de 2 semaines n'empêche pas celui de 2 jours.
  assert.notEqual(at("2026-10-20")[0].id, at("2026-10-28")[0].id);
});
