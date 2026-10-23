// Aides DOM minimales.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Tout texte saisi par l'utilisateur passe par esc() avant d'être injecté en HTML.
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

export const $ = (sel, root = document) => root.querySelector(sel);
