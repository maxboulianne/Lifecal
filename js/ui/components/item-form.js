import { MODULES, MODULE_IDS, hasFeature, moduleLabel } from "../../config/modules.js";
import { esc } from "../../core/dom.js";
import { FREQ, yearlyDate } from "../../data/recurrence.js";
import { todayISO } from "../../core/dates.js";
import { isGeolocationSupported } from "../../geo/geo.js";
import { fmt, t } from "../../i18n/index.js";
import { MONDAY_FIRST } from "./habit-text.js";
import { getChecklist, toLines } from "../../data/checklist.js";
import { EVENT_KINDS, KIND_ICONS, eventKind } from "../../events/events.js";

// Formulaire d'ajout / de modification. `item` est null pour un nouvel élément.
export function itemForm(item, { date, module = "rdv", repeat } = {}) {
  const v = item ?? { title: "", module, date, time: "", place: "", lat: null, lng: null, notes: "", recurrence: null };
  const coords = v.lat !== null && v.lng !== null ? `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}` : "";
  const freq = v.recurrence?.freq ?? repeat ?? "none";
  const days = v.recurrence?.days ?? [parseDay(v.date)];
  const times = v.recurrence?.timesPerWeek ?? 3;
  // Événement : une fête par défaut (qui revient chaque année).
  const kind = item ? eventKind(item) : "birthday";
  const yearly = item ? v.recurrence?.freq === FREQ.YEARLY : kind !== "event";
  // Fête ou anniversaire déjà enregistré : la date montrée est la prochaine
  // (jour et mois), l'année d'origine va dans son propre champ.
  const birthYear = item && yearly && kind !== "event" && !v.data?.yearUnknown ? v.date.slice(0, 4) : "";
  const dateValue = item && yearly ? nextYearly(v.date) : v.date;

  return `<form id="item-form" class="form" data-id="${esc(item?.id ?? "")}" novalidate>
    <h2 id="form-title">${t(item ? "form.editTitle" : "form.newTitle")}</h2>

    <label>${t("form.title")}
      <input name="title" value="${esc(v.title)}" required autocomplete="off" autofocus
        placeholder="${esc(t("form.titlePlaceholder"))}">
    </label>

    <fieldset class="module-picker">
      <legend>${t("form.module")}</legend>
      ${MODULE_IDS.map((id) => {
        const m = MODULES[id];
        return `<label class="module-option" style="--c:${m.color}">
          <input type="radio" name="module" value="${id}" ${v.module === id ? "checked" : ""}>
          <span>${m.icon} ${esc(moduleLabel(id))}</span>
        </label>`;
      }).join("")}
    </fieldset>

    <fieldset class="repeat" data-role="repeat" ${hasFeature(v.module, "recurrence") ? "" : "hidden"}>
      <legend>${t("form.repeat")}</legend>
      <div class="segmented wrap">
        ${["none", FREQ.DAILY, FREQ.WEEKLY, FREQ.FLEXIBLE].map((f) => `<label class="seg-option">
          <input type="radio" name="repeat" value="${f}" ${freq === f ? "checked" : ""}><span>${t(`repeat.${f}`)}</span>
        </label>`).join("")}
      </div>
      <div class="weekday-picker" data-role="weekdays" ${freq === FREQ.WEEKLY ? "" : "hidden"}>
        ${MONDAY_FIRST.map((d) => `<label class="weekday-option">
          <input type="checkbox" name="days" value="${d}" ${days.includes(d) ? "checked" : ""}>
          <span>${fmt.weekdayNameShort(d)}</span>
        </label>`).join("")}
      </div>
      <label class="times" data-role="times" ${freq === FREQ.FLEXIBLE ? "" : "hidden"}>${t("repeat.timesPerWeek")}
        <input type="number" name="timesPerWeek" min="1" max="7" value="${times}" inputmode="numeric">
      </label>
      <p class="hint" data-role="repeat-hint" ${freq === "none" ? "hidden" : ""}>${t("form.repeatHint")}</p>
    </fieldset>

    <fieldset class="repeat" data-role="event" ${hasFeature(v.module, "yearly") ? "" : "hidden"}>
      <legend>${t("event.kind")}</legend>
      <div class="segmented wrap">
        ${EVENT_KINDS.map((k) => `<label class="seg-option">
          <input type="radio" name="eventKind" value="${k}" ${kind === k ? "checked" : ""}><span>${KIND_ICONS[k]} ${t(`event.kind.${k}`)}</span>
        </label>`).join("")}
      </div>
      <label class="switch"><input type="checkbox" name="yearly" ${yearly ? "checked" : ""}><span>${t("event.yearly")}</span></label>
      <label data-role="birth-year" ${kind !== "event" && yearly ? "" : "hidden"}>
        <span data-role="birth-year-label">${t(`event.yearLabel.${kind === "anniversary" ? "anniversary" : "birthday"}`)}</span>
        <span class="hint">${t("form.optional")}</span>
        <input name="birthYear" inputmode="numeric" maxlength="4" autocomplete="off" value="${esc(birthYear)}" placeholder="1964">
      </label>
      <p class="hint" data-role="event-date-hint">${kind === "event" || !yearly ? "" : t(`event.dateHint.${kind}`)}</p>
      <label>${t("event.budget")} <span class="hint">${t("form.optional")}</span>
        <input name="budget" inputmode="decimal" autocomplete="off" value="${esc(v.data?.budget ?? "")}" placeholder="50">
      </label>
    </fieldset>

    <label data-role="checklist" ${hasFeature(v.module, "checklist") ? "" : "hidden"}>${t("checklist.formLabel")}
      <span class="hint">${t("checklist.formHint")}</span>
      <textarea name="checklist" rows="4" placeholder="${esc(t("checklist.formPlaceholder"))}">${esc(toLines(getChecklist(item)))}</textarea>
    </label>

    <div class="row">
      <label><span data-role="date-label">${esc(dateLabel(v.module, kind, yearly))}</span> <input type="date" name="date" value="${esc(dateValue)}" required></label>
      <label>${t("form.time")} <input type="time" name="time" value="${esc(v.time)}"></label>
    </div>
    <label data-role="end-date" ${hasFeature(v.module, "range") ? "" : "hidden"}>${t("form.endDate")} <span class="hint">${t("form.optional")}</span>
      <input type="date" name="endDate" value="${esc(item?.data?.endDate ?? "")}" min="${esc(v.date ?? "")}">
    </label>

    <label>${t("form.place")} <span class="hint">${t("form.optional")}</span>
      <input name="place" value="${esc(v.place)}" placeholder="${esc(t("form.placePlaceholder"))}" autocomplete="off">
    </label>
    <div class="geo-row">
      <input type="hidden" name="lat" value="${v.lat ?? ""}">
      <input type="hidden" name="lng" value="${v.lng ?? ""}">
      <span class="coords" data-role="coords">${coords ? `📍 ${coords}` : ""}</span>
      ${isGeolocationSupported() ? `<button type="button" class="btn link" data-action="use-position">${t("form.usePosition")}</button>` : ""}
      <button type="button" class="btn link" data-action="clear-position" ${coords ? "" : "hidden"}>${t("form.removePosition")}</button>
    </div>

    <label>${t("form.notes")} <span class="hint">${t("form.optional")}</span>
      <textarea name="notes" rows="3">${esc(v.notes)}</textarea>
    </label>

    <p class="form-errors" data-role="errors" role="alert"></p>

    <div class="actions">
      <button type="button" class="btn ghost" data-action="close">${t("form.cancel")}</button>
      <button type="submit" class="btn primary">${t("form.save")}</button>
    </div>
  </form>`;
}

// « Date de la fête » pour une fête qui revient chaque année, sinon « Date ».
function dateLabel(module, kind, yearly) {
  return hasFeature(module, "yearly") && yearly && kind !== "event" ? t(`event.dateLabel.${kind}`) : t("form.date");
}

// Prochaine date (aujourd'hui compris) d'un élément qui revient chaque année.
function nextYearly(startISO) {
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const thisYear = yearlyDate(startISO, year);
  return thisYear >= today ? thisYear : yearlyDate(startISO, year + 1);
}

function parseDay(iso) {
  const [y, m, d] = (iso ?? "").split("-").map(Number);
  return y ? new Date(y, m - 1, d, 12).getDay() : 1;
}

// Affiche ou masque les options de répétition selon les choix en cours.
export function syncRepeatFields(form) {
  const module = form.elements.module.value;
  form.querySelector("[data-role=checklist]").hidden = !hasFeature(module, "checklist");
  form.querySelector("[data-role=end-date]").hidden = !hasFeature(module, "range");
  form.elements.endDate.min = form.elements.date.value;
  const section = form.querySelector("[data-role=repeat]");
  section.hidden = !hasFeature(module, "recurrence");
  const freq = section.hidden ? "none" : form.elements.repeat.value;
  const event = form.querySelector("[data-role=event]");
  event.hidden = !hasFeature(module, "yearly");
  const kind = form.elements.eventKind.value;
  const yearly = form.elements.yearly.checked;
  form.querySelector("[data-role=birth-year]").hidden = kind === "event" || !yearly;
  form.querySelector("[data-role=birth-year-label]").textContent = t(`event.yearLabel.${kind === "anniversary" ? "anniversary" : "birthday"}`);
  form.querySelector("[data-role=event-date-hint]").textContent = kind === "event" || !yearly ? "" : t(`event.dateHint.${kind}`);
  form.querySelector("[data-role=date-label]").textContent = dateLabel(module, kind, yearly);
  form.querySelector("[data-role=weekdays]").hidden = freq !== FREQ.WEEKLY;
  form.querySelector("[data-role=times]").hidden = freq !== FREQ.FLEXIBLE;
  form.querySelector("[data-role=repeat-hint]").hidden = freq === "none";
}

export function readItemForm(form, existing = null) {
  const f = new FormData(form);
  const module = f.get("module");
  const freq = hasFeature(module, "recurrence") ? f.get("repeat") : "none";
  let recurrence = null;
  const isEvent = hasFeature(module, "yearly");
  if (isEvent && f.get("yearly") === "on") recurrence = { freq: FREQ.YEARLY, until: null };
  else if (freq && freq !== "none") {
    recurrence = {
      freq,
      days: f.getAll("days").map(Number),
      timesPerWeek: Number(f.get("timesPerWeek")),
      // Modifier une habitude arrêtée ne la relance pas.
      until: existing?.recurrence?.until ?? null,
    };
  }
  return {
    title: f.get("title"),
    module,
    date: f.get("date"),
    time: f.get("time"),
    place: f.get("place"),
    lat: f.get("lat"),
    lng: f.get("lng"),
    notes: f.get("notes"),
    recurrence,
    // Texte brut ; converti en liste par l'appelant (qui connaît la liste existante).
    checklistText: hasFeature(module, "checklist") ? f.get("checklist") ?? "" : null,
    // Événement : type, année inconnue, budget ; null pour les autres modules.
    event: isEvent ? { kind: f.get("eventKind") ?? "event", birthYear: String(f.get("birthYear") ?? "").trim(), budget: f.get("budget") ?? "" } : null,
    // Date de retour (voyage) : "" = un seul jour ; null = le module n'en a pas.
    endDate: hasFeature(module, "range") ? f.get("endDate") ?? "" : null,
  };
}
