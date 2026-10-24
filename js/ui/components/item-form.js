import { MODULES, MODULE_IDS, hasFeature, moduleLabel } from "../../config/modules.js";
import { esc } from "../../core/dom.js";
import { FREQ } from "../../data/recurrence.js";
import { isGeolocationSupported } from "../../geo/geo.js";
import { fmt, t } from "../../i18n/index.js";
import { MONDAY_FIRST } from "./habit-text.js";
import { getChecklist, toLines } from "../../data/checklist.js";

// Formulaire d'ajout / de modification. `item` est null pour un nouvel élément.
export function itemForm(item, { date, module = "rdv", repeat } = {}) {
  const v = item ?? { title: "", module, date, time: "", place: "", lat: null, lng: null, notes: "", recurrence: null };
  const coords = v.lat !== null && v.lng !== null ? `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}` : "";
  const freq = v.recurrence?.freq ?? repeat ?? "none";
  const days = v.recurrence?.days ?? [parseDay(v.date)];
  const times = v.recurrence?.timesPerWeek ?? 3;

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

    <label data-role="checklist" ${hasFeature(v.module, "checklist") ? "" : "hidden"}>${t("checklist.formLabel")}
      <span class="hint">${t("checklist.formHint")}</span>
      <textarea name="checklist" rows="4" placeholder="${esc(t("checklist.formPlaceholder"))}">${esc(toLines(getChecklist(item)))}</textarea>
    </label>

    <div class="row">
      <label>${t("form.date")} <input type="date" name="date" value="${esc(v.date)}" required></label>
      <label>${t("form.time")} <input type="time" name="time" value="${esc(v.time)}"></label>
    </div>

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

function parseDay(iso) {
  const [y, m, d] = (iso ?? "").split("-").map(Number);
  return y ? new Date(y, m - 1, d, 12).getDay() : 1;
}

// Affiche ou masque les options de répétition selon les choix en cours.
export function syncRepeatFields(form) {
  const module = form.elements.module.value;
  form.querySelector("[data-role=checklist]").hidden = !hasFeature(module, "checklist");
  const section = form.querySelector("[data-role=repeat]");
  section.hidden = !hasFeature(module, "recurrence");
  const freq = section.hidden ? "none" : form.elements.repeat.value;
  form.querySelector("[data-role=weekdays]").hidden = freq !== FREQ.WEEKLY;
  form.querySelector("[data-role=times]").hidden = freq !== FREQ.FLEXIBLE;
  form.querySelector("[data-role=repeat-hint]").hidden = freq === "none";
}

export function readItemForm(form, existing = null) {
  const f = new FormData(form);
  const module = f.get("module");
  const freq = hasFeature(module, "recurrence") ? f.get("repeat") : "none";
  let recurrence = null;
  if (freq && freq !== "none") {
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
  };
}
