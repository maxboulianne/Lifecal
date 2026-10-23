import { getModule } from "../../config/modules.js";
import { capitalize, formatLong, formatTime, parseISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { hasCoordinates, isCancelled } from "../../data/item.js";
import { mapUrl } from "../../geo/geo.js";
import { getProvider } from "../../sync/providers.js";

export function itemDetail(item) {
  const m = getModule(item.module);
  const when = `${capitalize(formatLong(parseISODate(item.date)))}${item.time ? ` · ${formatTime(item.time)}` : ""}`;
  const place = item.place || hasCoordinates(item)
    ? `<p class="detail-line">📍 ${esc(item.place || "Position enregistrée")}
        ${hasCoordinates(item) ? `<a href="${mapUrl(item)}" target="_blank" rel="noopener">Voir sur la carte</a>` : ""}</p>`
    : "";
  const source = item.source.provider !== "local"
    ? `<p class="detail-line hint">Synchronisé avec ${esc(getProvider(item.source.provider)?.label ?? item.source.provider)}</p>`
    : "";
  const status = isCancelled(item)
    ? '<p class="badge">Annulé</p>'
    : item.done ? '<p class="badge done">Fait ✓</p>' : "";

  return `<article class="detail" style="--c:${m.color}">
    <p class="detail-module">${m.icon} ${m.label}</p>
    <h2 id="detail-title">${esc(item.title)}</h2>
    ${status}
    <p class="detail-line">🕒 ${when}</p>
    ${place}
    ${item.notes ? `<p class="detail-notes">${esc(item.notes)}</p>` : ""}
    ${source}

    <div class="actions stack">
      ${isCancelled(item) ? "" : `<button type="button" class="btn primary" data-action="toggle-done" data-id="${esc(item.id)}">
        ${item.done ? "Marquer comme non fait" : "✅ Marquer comme fait"}</button>`}
      <button type="button" class="btn soft" data-action="edit-item" data-id="${esc(item.id)}">Modifier</button>
      ${isCancelled(item)
        ? `<button type="button" class="btn soft" data-action="restore-item" data-id="${esc(item.id)}">Rétablir</button>`
        : `<button type="button" class="btn soft" data-action="cancel-item" data-id="${esc(item.id)}">Annuler l'élément</button>`}
      <button type="button" class="btn danger" data-action="delete-item" data-id="${esc(item.id)}">Supprimer</button>
      <button type="button" class="btn ghost" data-action="close">Fermer</button>
    </div>
  </article>`;
}
