import { esc } from "../../core/dom.js";

// Bandeau des « petits coups de pouce » produits par les déclencheurs.
export function nudgesBar(nudges) {
  if (!nudges.length) return "";
  return nudges
    .map(
      (n) => `<div class="nudge tone-${esc(n.tone)}" role="status">
      <span class="nudge-icon" aria-hidden="true">${n.icon}</span>
      <p>${esc(n.message)}</p>
      ${n.actionItemId ? `<button type="button" class="btn link" data-action="open-item" data-id="${esc(n.actionItemId)}">${esc(n.actionLabel)}</button>` : ""}
      <button type="button" class="nudge-close" data-action="dismiss-nudge" data-id="${esc(n.id)}" aria-label="Masquer pour aujourd'hui">×</button>
    </div>`,
    )
    .join("");
}
