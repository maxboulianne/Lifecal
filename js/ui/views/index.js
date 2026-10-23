import { addDays, addMonths, addYears } from "../../core/dates.js";
import { dayView } from "./day.js";
import { monthView } from "./month.js";
import { weekView } from "./week.js";
import { yearView } from "./year.js";

// Chaque vue : { id, title(cursor), render(ctx) }, plus son pas de navigation.
// Son nom affiché est la traduction « view.<id> ».
export const VIEWS = {
  day: { ...dayView, step: (d, n) => addDays(d, n) },
  week: { ...weekView, step: (d, n) => addDays(d, 7 * n) },
  month: { ...monthView, step: (d, n) => addMonths(d, n) },
  year: { ...yearView, step: (d, n) => addYears(d, n) },
};

export const VIEW_ORDER = ["day", "week", "month", "year"];
export const DEFAULT_VIEW = "week";
