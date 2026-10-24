// Éléments d'un script de séance guidée.
//
// Un script est une liste lue dans l'ordre :
//   "texte"        phrase dite par la voix (et affichée à l'écran)
//   3              pause fixe, en secondes
//   SILENCE(2)     silence « élastique » : se partage le temps restant pour
//                  atteindre la durée choisie (le chiffre est son poids)
//   BELL           son de bol tibétain
//   BREATHE("coherence", 6)  guide visuel de respiration, 6 cycles
//
// Toutes les langues ont exactement la même suite d'éléments (seul le texte
// change) : un test le vérifie. C'est aussi ce qui permettra plus tard de
// remplacer la voix de synthèse par des enregistrements, phrase par phrase.

export const BELL = Object.freeze({ type: "bell" });
export const SILENCE = (weight = 1) => ({ type: "silence", weight });
export const BREATHE = (pattern, cycles) => ({ type: "breathe", pattern, cycles });

export function tokenType(token) {
  if (typeof token === "string") return "say";
  if (typeof token === "number") return "pause";
  return token.type;
}
