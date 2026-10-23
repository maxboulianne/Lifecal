import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, diffDays, parseISODate, startOfWeek, toISODate } from "../js/core/dates.js";

test("toISODate utilise l'heure locale (pas de décalage le soir)", () => {
  assert.equal(toISODate(new Date(2026, 9, 23, 23, 30)), "2026-10-23");
});

test("startOfWeek commence le lundi", () => {
  assert.equal(toISODate(startOfWeek(parseISODate("2026-10-25"))), "2026-10-19"); // dimanche
  assert.equal(toISODate(startOfWeek(parseISODate("2026-10-19"))), "2026-10-19"); // lundi
});

test("addMonths ne déborde pas en fin de mois", () => {
  assert.equal(toISODate(addMonths(parseISODate("2026-01-31"), 1)), "2026-02-28");
  assert.equal(toISODate(addMonths(parseISODate("2026-12-15"), 1)), "2027-01-15");
});

test("diffDays", () => {
  assert.equal(diffDays("2026-10-23", "2026-11-13"), 21);
  assert.equal(diffDays("2026-03-01", "2026-03-15"), 14); // traverse le changement d'heure
});
