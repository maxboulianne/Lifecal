import { MODULES, MODULE_IDS } from "../../config/modules.js";
import { esc } from "../../core/dom.js";
import { isGeolocationSupported } from "../../geo/geo.js";

// Formulaire d'ajout / de modification. `item` est null pour un nouvel élément.
export function itemForm(item, { date, module = "rdv" } = {}) {
  const v = item ?? { title: "", module, date, time: "", place: "", lat: null, lng: null, notes: "" };
  const coords = v.lat !== null && v.lng !== null ? `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}` : "";
  return `<form id="item-form" class="form" data-id="${esc(item?.id ?? "")}" novalidate>
    <h2 id="form-title">${item ? "Modifier" : "Nouvel élément"}</h2>

    <label>Titre
      <input name="title" value="${esc(v.title)}" required autocomplete="off" autofocus
        placeholder="ex. Méditation, épicerie, dentiste…">
    </label>

    <fieldset class="module-picker">
      <legend>Module</legend>
      ${MODULE_IDS.map((id) => {
        const m = MODULES[id];
        return `<label class="module-option" style="--c:${m.color}">
          <input type="radio" name="module" value="${id}" ${v.module === id ? "checked" : ""}>
          <span>${m.icon} ${m.label}</span>
        </label>`;
      }).join("")}
    </fieldset>

    <div class="row">
      <label>Date <input type="date" name="date" value="${esc(v.date)}" required></label>
      <label>Heure <input type="time" name="time" value="${esc(v.time)}"></label>
    </div>

    <label>Lieu <span class="hint">(facultatif)</span>
      <input name="place" value="${esc(v.place)}" placeholder="ex. IGA Laval" autocomplete="off">
    </label>
    <div class="geo-row">
      <input type="hidden" name="lat" value="${v.lat ?? ""}">
      <input type="hidden" name="lng" value="${v.lng ?? ""}">
      <span class="coords" data-role="coords">${coords ? `📍 ${coords}` : ""}</span>
      ${isGeolocationSupported() ? '<button type="button" class="btn link" data-action="use-position">Utiliser ma position</button>' : ""}
      <button type="button" class="btn link" data-action="clear-position" ${coords ? "" : "hidden"}>Retirer</button>
    </div>

    <label>Notes <span class="hint">(facultatif)</span>
      <textarea name="notes" rows="3">${esc(v.notes)}</textarea>
    </label>

    <p class="form-errors" data-role="errors" role="alert"></p>

    <div class="actions">
      <button type="button" class="btn ghost" data-action="close">Annuler</button>
      <button type="submit" class="btn primary">Enregistrer</button>
    </div>
  </form>`;
}

export function readItemForm(form) {
  const f = new FormData(form);
  return {
    title: f.get("title"),
    module: f.get("module"),
    date: f.get("date"),
    time: f.get("time"),
    place: f.get("place"),
    lat: f.get("lat"),
    lng: f.get("lng"),
    notes: f.get("notes"),
  };
}
