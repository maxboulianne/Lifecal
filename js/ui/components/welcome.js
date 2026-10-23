import { t } from "../../i18n/index.js";
import { languagePicker } from "../pages/settings.js";

// Accueil, au premier lancement : choix de la langue.
export function welcome() {
  return `<section class="welcome">
    <img src="apple-touch-icon.png" alt="" width="64" height="64">
    <h2 id="welcome-title">${t("welcome.title")}</h2>
    <p>${t("welcome.chooseLanguage")}</p>
    ${languagePicker()}
    <p class="hint">${t("welcome.later")}</p>
    <div class="actions">
      <button type="button" class="btn primary" data-action="finish-welcome">${t("welcome.start")}</button>
    </div>
  </section>`;
}
