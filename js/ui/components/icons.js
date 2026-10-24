// Petites icônes dessinées (nettes à toutes les tailles, couleur du texte).

const chevron = (d) =>
  `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const CHEVRON_LEFT = chevron("M15 5l-7 7 7 7");
export const CHEVRON_RIGHT = chevron("M9 5l7 7-7 7");
