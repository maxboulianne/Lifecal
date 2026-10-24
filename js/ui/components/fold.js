// Sections repliables : une flèche ▸ dans le titre ouvre ou ferme la section.
// L'état est retenu sur cet appareil (le stockage peut être indisponible,
// ex. navigation privée : la section s'ouvre alors selon sa valeur par défaut).

import { esc } from "../../core/dom.js";

const KEY = "lifecal:folds";
let state = read();

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export const isFoldOpen = (id, byDefault = true) => state[id] ?? byDefault;

export function setFoldOpen(id, open) {
  state = { ...state, [id]: open };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* préférence non retenue : sans conséquence */
  }
}

// Une section repliable. `title` et `extra` (à droite du titre) sont du HTML déjà échappé.
export function foldSection(id, { title, extra = "", body, open = true, tag = "h2", className = "card" }) {
  return `<section class="${className} fold ${open ? "is-open" : ""}" data-fold-id="${esc(id)}">
    <${tag} class="fold-head">
      <button type="button" class="fold-btn" data-action="fold" aria-expanded="${open}" aria-controls="fold-${esc(id)}">
        <span class="fold-arrow" aria-hidden="true">▸</span>
        <span class="fold-title">${title}</span>
        ${extra ? `<span class="hint fold-extra">${extra}</span>` : ""}
      </button>
    </${tag}>
    <div class="fold-body" id="fold-${esc(id)}" ${open ? "" : "hidden"}>${body}</div>
  </section>`;
}
