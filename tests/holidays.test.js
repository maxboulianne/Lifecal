import { test } from "node:test";
import assert from "node:assert/strict";
import { HOLIDAY_EN, holidayOn, holidaysBetween, quebecHolidays } from "../js/timesheet/holidays.js";
import { emptyTimesheet, normalizeTimesheet } from "../js/timesheet/timesheet.js";
import { invoiceData } from "../js/timesheet/invoice.js";

test("Congés fériés du Québec : dates calculées", () => {
  const y2026 = Object.fromEntries(quebecHolidays(2026).map((h) => [h.key, h.date]));
  assert.deepEqual(y2026, {
    newYear: "2026-01-01", goodFriday: "2026-04-03", easterMonday: "2026-04-06", patriots: "2026-05-18", stJean: "2026-06-24",
    canada: "2026-07-01", labour: "2026-09-07", thanksgiving: "2026-10-12", christmas: "2026-12-25",
  });
  const y2027 = Object.fromEntries(quebecHolidays(2027).map((h) => [h.key, h.date]));
  assert.equal(y2027.goodFriday, "2027-03-26");
  assert.equal(y2027.patriots, "2027-05-24"); // le 24 mai est un lundi
  // Un dimanche, la Fête nationale et la fête du Canada passent au lundi
  assert.equal(Object.fromEntries(quebecHolidays(2029).map((h) => [h.key, h.date])).canada, "2029-07-02");
  assert.equal(holidayOn("2026-10-12").key, "thanksgiving");
  assert.equal(holidayOn("2026-10-13"), null);
  // La facture ne compte pas les fins de semaine (Noël 2027 est un samedi)
  assert.equal(holidaysBetween("2027-12-20", "2027-12-31").length, 0);
  for (const k of Object.keys(y2026)) assert.ok(HOLIDAY_EN[k], k);
});

test("Facture : congé non travaillé à 0 h avec son nom en anglais, congé travaillé facturé", () => {
  const ts = normalizeTimesheet({
    ...emptyTimesheet(),
    clients: [{ id: "c", name: "Client Test" }],
    projects: [{ id: "p", number: "P-100", clientId: "c", rate: 95 }],
    entries: [
      { date: "2026-10-09", projectId: "p", hours: 8 },
      { date: "2026-10-13", projectId: "p", hours: 8 },
    ],
  });
  let d = invoiceData(ts, { from: "2026-10-05", to: "2026-10-18", clientId: "c", number: "T-1", date: "2026-10-19" });
  const day = d.days.find((x) => x.date === "2026-10-12");
  assert.equal(day.holiday, "thanksgiving");
  assert.match(day.weekday, /Thanksgiving/);
  assert.deepEqual(day.lines.map((l) => [l.kind, l.hours, l.amount, l.text]), [["holiday", 0, 0, "Thanksgiving — Statutory holiday (Quebec)"]]);
  assert.equal(d.totals.hours, 16); // le congé ne change pas le total
  // Travaillé exceptionnellement : facturé normalement, le nom du congé reste sur la journée
  const worked = normalizeTimesheet({ ...ts, entries: [...ts.entries, { date: "2026-10-12", projectId: "p", hours: 6 }] });
  d = invoiceData(worked, { from: "2026-10-05", to: "2026-10-18", clientId: "c", number: "T-1", date: "2026-10-19" });
  const w = d.days.find((x) => x.date === "2026-10-12");
  assert.match(w.weekday, /Thanksgiving \(statutory holiday\)/);
  assert.deepEqual(w.lines.map((l) => [l.kind, l.hours, l.amount]), [["hours", 6, 570]]);
  assert.equal(d.totals.hours, 22);
});
