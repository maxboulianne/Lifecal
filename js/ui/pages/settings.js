import { esc } from "../../core/dom.js";
import { isGeolocationSupported } from "../../geo/geo.js";
import { LANGUAGES, getLanguage, t } from "../../i18n/index.js";
import { PROVIDERS } from "../../sync/providers.js";
import { isSpeechSupported, pickVoice, voicesFor } from "../../meditation/voice.js";

function voiceSection(settings, voices) {
  if (!isSpeechSupported()) return "";
  const lang = getLanguage();
  const list = voicesFor(lang, voices);
  const chosen = pickVoice(lang, settings.meditation?.voices?.[lang], voices);
  return `<div class="card">
    <h2>${t("settings.voice")}</h2>
    <p class="hint">${t("settings.voiceHint")}</p>
    ${list.length
      ? `<div class="voice-row">
          <select data-action="pick-voice" aria-label="${esc(t("settings.voice"))}">
            ${list.map((v) => `<option value="${esc(v.voiceURI)}" ${v === chosen ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")}
          </select>
          <button type="button" class="btn soft" data-action="test-voice">${t("settings.voiceTest")}</button>
        </div>`
      : `<p class="hint">${t("settings.voiceNone")}</p>`}
    <p class="hint small">${t("settings.voiceTip")}</p>
  </div>`;
}

export function languagePicker() {
  const current = getLanguage();
  return `<div class="language-list" role="group" aria-label="${esc(t("settings.language"))}">
    ${LANGUAGES.map((l) => `<button type="button" class="language-option ${l.code === current ? "active" : ""}"
      data-action="pick-language" data-lang="${l.code}" lang="${l.code}" aria-pressed="${l.code === current}">
      ${esc(l.name)}${l.code === current ? ' <span aria-hidden="true">✓</span>' : ""}
    </button>`).join("")}
  </div>`;
}

// Page Paramètres. Chaque réglage futur s'ajoute comme une nouvelle section.
export const settingsPage = {
  id: "settings",

  title: () => t("settings.title"),

  render({ settings, voices, storageLabel, count }) {
    return `<section class="page settings">
      <div class="card">
        <h2>${t("settings.language")}</h2>
        ${languagePicker()}
      </div>

      ${voiceSection(settings, voices)}

      <div class="card">
        <h2>${t("settings.proximity")} <span class="tag">${t("settings.beta")}</span></h2>
        <p class="hint">${t("settings.proximityHint")}</p>
        ${isGeolocationSupported()
          ? `<label class="switch"><input type="checkbox" data-action="toggle-proximity" ${settings.proximityEnabled ? "checked" : ""}>
              <span>${t("settings.proximityToggle")}</span></label>`
          : `<p class="hint">${t("settings.noGeolocation")}</p>`}
      </div>

      <div class="card">
        <h2>${t("settings.calendars")}</h2>
        <ul class="provider-list">
          ${PROVIDERS.map((p) => `<li><span>${esc(t(`provider.${p.id}`))}</span><span class="tag">${t("settings.soon")}</span></li>`).join("")}
        </ul>
      </div>

      <div class="card">
        <h2>${t("settings.data")}</h2>
        <p class="hint">${t("settings.dataHint", { count, where: t(storageLabel) })}</p>
        <div class="actions start">
          <button type="button" class="btn soft" data-action="export">${t("settings.export")}</button>
          <label class="btn soft file-btn">${t("settings.import")}
            <input type="file" accept="application/json,.json" data-action="import" hidden>
          </label>
        </div>
      </div>
    </section>`;
  },
};
