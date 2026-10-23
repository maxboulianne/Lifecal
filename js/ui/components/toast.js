// Petit message éphémère et bienveillant.
import { $ } from "../../core/dom.js";
import { tList } from "../../i18n/index.js";

let timer;

export function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  el.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => (el.hidden = true), 250);
  }, 2600);
}

export function cheer() {
  const cheers = tList("toast.cheers");
  return cheers[Math.floor(Math.random() * cheers.length)] ?? "✨";
}
