// Petit message éphémère et bienveillant.
import { $ } from "../../core/dom.js";

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

const CHEERS = ["Bravo 🌱", "Bien joué ✨", "Un pas de plus 💪", "Super, c'est fait 🌿", "Fier de toi 🙌"];

export const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];
