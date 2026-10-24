import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeItem } from "../js/data/item.js";
import {
  entryContent, entryFor, entryTitle, isEmptyContent, moodOfDay, moodSeries, pastEntries, promptIndex, weekTrend,
} from "../js/journal/journal.js";
import { eveningJournal } from "../js/triggers/calendar-triggers.js";

const entry = (date, data, extra = {}) => normalizeItem({ id: `j${date}`, title: "x", module: "journal", date, data, ...extra });
const med = (date, moodAfter) => normalizeItem({ id: `m${date}${moodAfter}`, title: "m", module: "meditation", date, done: true, data: { kind: "session", moodAfter } });

test("contenu d'une entrée, y compris les anciennes entrées (notes)", () => {
  assert.deepEqual(entryContent(entry("2026-10-20", { text: "Bonjour", mood: 3, gratitude: ["café"] })),
    { text: "Bonjour", mood: 3, gratitude: ["café", "", ""] });
  assert.equal(entryContent(entry("2026-10-20", {}, { notes: "Ancien texte" })).text, "Ancien texte");
  assert.equal(entryContent(null).mood, null);
  assert.ok(isEmptyContent({ text: "  ", mood: null, gratitude: ["", " ", ""] }));
  assert.ok(!isEmptyContent({ text: "", mood: 0, gratitude: ["", "", ""] })); // humeur « très difficile » = 0, pas vide
});

test("titre : première ligne, raccourcie", () => {
  assert.equal(entryTitle({ text: "Belle journée\nsuite" }, "Journal"), "Belle journée");
  assert.equal(entryTitle({ text: "" }, "Journal"), "Journal");
  assert.equal(entryTitle({ text: "Une question ?\nMa réponse" }, "Journal", ["Une question ?"]), "Ma réponse");
  assert.equal(entryTitle({ text: "Une question ?\n" }, "Journal", ["Une question ?"]), "Journal");
  assert.ok(entryTitle({ text: "x".repeat(80) }, "J").length <= 50);
});

test("question du jour : stable dans la journée, varie avec « une autre question »", () => {
  assert.equal(promptIndex("2026-10-24", 12), promptIndex("2026-10-24", 12));
  assert.notEqual(promptIndex("2026-10-24", 12, 0), promptIndex("2026-10-24", 12, 1));
  const days = new Set(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"].map((d) => promptIndex(d, 12)));
  assert.ok(days.size >= 3);
});

test("humeur : le journal d'abord, sinon la moyenne des méditations", () => {
  const items = [entry("2026-10-22", { mood: 1 }), med("2026-10-22", 4), med("2026-10-23", 3), med("2026-10-23", 4)];
  assert.equal(moodOfDay(items, "2026-10-22"), 1);
  assert.equal(moodOfDay(items, "2026-10-23"), 3.5);
  assert.equal(moodOfDay(items, "2026-10-24"), null);
  const series = moodSeries(items, "2026-10-24", 3);
  assert.deepEqual(series.map((d) => d.mood), [1, 3.5, null]);
  assert.equal(entryFor(items, "2026-10-22").id, "j2026-10-22");
});

test("tendance de la semaine", () => {
  const last = ["2026-10-12", "2026-10-13", "2026-10-14"].map((d) => entry(d, { mood: 1 }));
  assert.equal(weekTrend([...last, entry("2026-10-19", { mood: 3 })], "2026-10-21"), "up");
  assert.equal(weekTrend([...last, entry("2026-10-19", { mood: 1 })], "2026-10-21"), "steady");
  assert.equal(weekTrend([entry("2026-10-12", { mood: 4 }), entry("2026-10-20", { mood: 2 })], "2026-10-21"), "down");
  assert.equal(weekTrend([entry("2026-10-20", { mood: 2 })], "2026-10-21"), null);
});

test("entrées précédentes : récentes d'abord, vides ignorées", () => {
  const items = [entry("2026-10-20", { text: "a" }), entry("2026-10-22", { text: "b" }), entry("2026-10-21", {}), entry("2026-10-24", { text: "c" })];
  assert.deepEqual(pastEntries(items, "2026-10-24").map((e) => e.date), ["2026-10-22", "2026-10-20"]);
});

test("invitation du soir à écrire, seulement s'il n'y a rien aujourd'hui", () => {
  assert.equal(eveningJournal.evaluate({ items: [], today: "2026-10-24", hour: 20 }).length, 1);
  assert.equal(eveningJournal.evaluate({ items: [], today: "2026-10-24", hour: 10 }).length, 0);
  assert.equal(eveningJournal.evaluate({ items: [entry("2026-10-24", { text: "ok" })], today: "2026-10-24", hour: 21 }).length, 0);
});
