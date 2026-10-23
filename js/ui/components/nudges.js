import { esc } from "../../core/dom.js";
import { t } from "../../i18n/index.js";

// Bandeau des « petits coups de pouce » produits par les déclencheurs.
export function nudgesBar(nudges) {
  return nudges
    .map(
      (n) => `<div class="nudge tone-${esc(n.tone)}" role="status">
      <span class="nudge-icon" aria-hidden="true">${n.icon}</span>
      <p>${esc(t(n.messageKey, n.params))}</p>
      ${n.actionItemId ? `<button type="button" class="btn link" data-action="open-item" data-id="${esc(n.actionItemId)}">${esc(t(n.actionKey))}</button>` : ""}
      <button type="button" class="nudge-close" data-action="dismiss-nudge" data-id="${esc(n.id)}" aria-label="${esc(t("nudge.dismiss"))}">×</button>
    </div>`,
    )
    .join("");
}
