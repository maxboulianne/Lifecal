// Fenêtre modale unique, réutilisée par le formulaire, les détails et les réglages.
import { $ } from "../../core/dom.js";

let lastFocus = null;

export function openModal(html, { labelledBy } = {}) {
  const root = $("#modal");
  const sheet = $("#modal .sheet");
  sheet.innerHTML = html;
  if (labelledBy) sheet.setAttribute("aria-labelledby", labelledBy);
  lastFocus = document.activeElement;
  root.hidden = false;
  document.body.classList.add("modal-open");
  ($("[autofocus]", sheet) ?? sheet).focus();
}

export function closeModal() {
  const root = $("#modal");
  if (root.hidden) return;
  root.hidden = true;
  $("#modal .sheet").innerHTML = "";
  document.body.classList.remove("modal-open");
  lastFocus?.focus?.();
}

export function setupModal() {
  const root = $("#modal");
  root.addEventListener("click", (e) => {
    if (e.target === root) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}
