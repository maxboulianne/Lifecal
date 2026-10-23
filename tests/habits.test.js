import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryAdapter } from "../js/data/storage/adapters.js";
import { Repository } from "../js/data/repository.js";
import { normalizeItem } from "../js/data/item.js";
import { bestStreak, currentStreak, historyGrid, periodSummary } from "../js/data/habit-stats.js";

const habit = (recurrence, completions = {}, skipped = {}, date = "2026-10-01") =>
  normalizeItem({ id: "h", title: "Méditer", module: "habitude", date, recurrence, data: { completions, skipped } });
const days = (...isos) => Object.fromEntries(isos.map((d) => [d, true]));

test("occurrences : tous les jours, certains jours, arrêt", async () => {
  const repo = new Repository(new MemoryAdapter());
  await repo.init();
  const daily = await repo.add({ title: "Méditer", module: "habitude", date: "2026-10-19", recurrence: { freq: "daily" } });
  await repo.add({ title: "Course", module: "habitude", date: "2026-10-19", recurrence: { freq: "weekly", days: [1, 3, 5] } });
  assert.equal(repo.between("2026-10-19", "2026-10-25").length, 7 + 3);
  assert.equal(repo.onDate("2026-10-18").length, 0); // avant le début

  await repo.toggleDone(daily.id, "2026-10-20");
  assert.equal(repo.getOn(daily.id, "2026-10-20").done, true);
  assert.equal(repo.getOn(daily.id, "2026-10-21").done, false);

  await repo.toggleSkip(daily.id, "2026-10-21");
  assert.equal(repo.getOn(daily.id, "2026-10-21").status, "cancelled");

  await repo.stopRecurrence(daily.id, "2026-10-23");
  assert.deepEqual(repo.between("2026-10-22", "2026-10-25").filter((o) => o.title === "Méditer").map((o) => o.date), ["2026-10-22"]);
});

test("certains jours : au moins un jour requis", async () => {
  const repo = new Repository(new MemoryAdapter());
  await repo.init();
  await assert.rejects(repo.add({ title: "X", module: "habitude", date: "2026-10-19", recurrence: { freq: "weekly", days: [] } }));
});

test("série : aujourd'hui pas encore fait ne casse rien, un jour sauté est neutre", () => {
  const h = habit({ freq: "daily" }, days("2026-10-19", "2026-10-20", "2026-10-22"), days("2026-10-21"));
  assert.equal(currentStreak(h, "2026-10-23"), 3);
  assert.equal(currentStreak(habit({ freq: "daily" }, days("2026-10-20")), "2026-10-23"), 0);
  assert.equal(bestStreak(h, "2026-10-23"), 3);
});

test("série : certains jours ignore les jours non prévus", () => {
  // lun 19, mer 21, ven 23
  const h = habit({ freq: "weekly", days: [1, 3, 5] }, days("2026-10-16", "2026-10-19", "2026-10-21"));
  assert.equal(currentStreak(h, "2026-10-23"), 3);
});

test("X fois par semaine : séries en semaines, jours facultatifs une fois l'objectif atteint", async () => {
  const h = habit({ freq: "flexible", timesPerWeek: 2 }, days("2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15", "2026-10-20"));
  assert.equal(currentStreak(h, "2026-10-23"), 2); // semaine en cours : 1/2, pas encore comptée
  const met = habit({ freq: "flexible", timesPerWeek: 1 }, days("2026-10-20"));
  const repo = new Repository(new MemoryAdapter({ schemaVersion: 2, items: [met], settings: {} }));
  await repo.init();
  assert.equal(repo.getOn("h", "2026-10-22").occurrence.optional, true);
  assert.equal(repo.getOn("h", "2026-10-20").occurrence.optional, false);
});

test("bilan de période et grille", () => {
  const h = habit({ freq: "daily" }, days("2026-10-19", "2026-10-20", "2026-10-21"), {}, "2026-10-19");
  assert.deepEqual(periodSummary(h, "2026-10-19", "2026-10-25", "2026-10-23"), { done: 3, target: 5, rate: 0.6 });
  const grid = historyGrid(h, "2026-10-23", 1);
  assert.deepEqual(grid.map((c) => c.state), ["done", "done", "done", "missed", "today", "future", "future"]);
});
