import { esc } from "../../core/dom.js";
import { isGeolocationSupported } from "../../geo/geo.js";
import { PROVIDERS } from "../../sync/providers.js";

export function settingsPanel(settings, { storageLabel, count }) {
  return `<section class="settings">
    <h2 id="settings-title">Réglages</h2>

    <h3>Rappels de proximité <span class="tag">bêta</span></h3>
    <p class="hint">Quand tu passes près d'un lieu enregistré pour une commission, LifeCal te montre ta liste.
      Fonctionne pendant que l'application est ouverte.</p>
    ${isGeolocationSupported()
      ? `<label class="switch"><input type="checkbox" data-action="toggle-proximity" ${settings.proximityEnabled ? "checked" : ""}>
          <span>Activer les rappels de proximité</span></label>`
      : '<p class="hint">La géolocalisation n\'est pas disponible sur cet appareil.</p>'}

    <h3>Calendriers externes</h3>
    <ul class="provider-list">
      ${PROVIDERS.map((p) => `<li><span>${esc(p.label)}</span><span class="tag">bientôt</span></li>`).join("")}
    </ul>

    <h3>Mes données</h3>
    <p class="hint">${count} élément${count > 1 ? "s" : ""} · enregistrés ${esc(storageLabel)}.
      Pense à faire une copie de temps en temps.</p>
    <div class="actions">
      <button type="button" class="btn soft" data-action="export">Exporter une copie</button>
      <label class="btn soft file-btn">Importer une copie
        <input type="file" accept="application/json,.json" data-action="import" hidden>
      </label>
    </div>

    <div class="actions">
      <button type="button" class="btn ghost" data-action="close">Fermer</button>
    </div>
  </section>`;
}
