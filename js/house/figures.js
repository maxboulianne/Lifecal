// Illustrations générales des procédures (piscine) : dessins simples qui conviennent à toutes
// les piscines. Les photos et vidéos de la piscine de l'utilisateur s'ajoutent à chaque étape.
// Couleurs des documents Maxxam : marine #2c4a6e, orange #e0491a ; eau en bleu.

const N = "#2c4a6e";
const O = "#e0491a";
const W = "#5fb0dc";
const WL = "#a9d8f0";
const G = "#9aa5b1";
const D = "#e8dcc4"; // margelle

const svg = (body, label) =>
  `<svg viewBox="0 0 240 150" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
    <rect width="240" height="150" rx="12" fill="#eef2f7"/>${body}</svg>`;

// Bassin vu en coupe, avec le niveau d'eau `level` (y) et l'écumoire à droite
const pool = (level = 52, extra = "") => `
  <rect x="18" y="40" width="204" height="12" fill="${D}"/>
  <path d="M30 52 h180 v68 q0 10 -10 10 h-160 q-10 0 -10 -10 z" fill="#fff" stroke="${N}" stroke-width="3"/>
  <path d="M33 ${level} h174 v${127 - level} h-174 z" fill="${W}" opacity="0.85"/>
  <path d="M33 ${level} q14 -4 29 0 t29 0 t29 0 t29 0 t29 0 t29 0" fill="none" stroke="${WL}" stroke-width="3"/>
  <rect x="186" y="54" width="18" height="12" rx="2" fill="${N}"/>${extra}`;

const arrow = (x1, y1, x2, y2, c = O) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="${x2}" cy="${y2}" r="6" fill="${c}"/>`;

export const FIGURES = {
  // Analyser et équilibrer l'eau
  balance: svg(`${pool(60)}
    <rect x="60" y="14" width="34" height="72" rx="6" fill="#fff" stroke="${N}" stroke-width="3"/>
    <rect x="66" y="24" width="22" height="10" fill="#f6d94a"/><rect x="66" y="40" width="22" height="10" fill="${O}"/><rect x="66" y="56" width="22" height="10" fill="#7bc47f"/>
    <text x="120" y="30" font-family="sans-serif" font-size="16" font-weight="700" fill="${N}">pH 7,2–7,6</text>`, "Analyser l'eau"),
  // Brosser et aspirer
  brush: svg(`${pool(56)}
    <line x1="150" y1="12" x2="70" y2="110" stroke="${N}" stroke-width="5" stroke-linecap="round"/>
    <rect x="52" y="104" width="40" height="12" rx="3" fill="${O}" transform="rotate(-50 72 110)"/>
    <path d="M44 120 q8 -10 16 0 q8 -10 16 0" fill="none" stroke="#fff" stroke-width="2"/>`, "Brosser et aspirer"),
  // Traitement choc / produit d'hivernage
  shock: svg(`${pool(64)}
    <path d="M128 10 h36 l6 14 v40 q0 6 -6 6 h-36 q-6 0 -6 -6 v-40 z" fill="#fff" stroke="${N}" stroke-width="3"/>
    <rect x="128" y="34" width="36" height="16" fill="${O}"/>
    <path d="M122 60 q-14 6 -20 22" fill="none" stroke="${N}" stroke-width="3" stroke-dasharray="4 5"/>
    <circle cx="100" cy="90" r="4" fill="#fff"/><circle cx="110" cy="98" r="3" fill="#fff"/><circle cx="92" cy="100" r="3" fill="#fff"/>`, "Traitement choc"),
  // Baisser le niveau d'eau sous l'écumoire
  lower: svg(`${pool(80)}
    <line x1="30" y1="56" x2="210" y2="56" stroke="${O}" stroke-width="2" stroke-dasharray="6 5"/>
    ${arrow(120, 54, 120, 74)}`, "Baisser le niveau d'eau"),
  // Remonter le niveau (ouverture)
  fill: svg(`${pool(60)}
    <path d="M10 14 q40 0 52 26" fill="none" stroke="#3f8f4d" stroke-width="6" stroke-linecap="round"/>
    <path d="M62 42 q4 8 2 16" fill="none" stroke="${W}" stroke-width="4" stroke-linecap="round"/>
    ${arrow(150, 100, 150, 66, N)}`, "Remonter le niveau d'eau"),
  // Laver le filtre à contre-courant / nettoyer la cartouche
  backwash: svg(`
    <rect x="70" y="34" width="70" height="96" rx="30" fill="#fff" stroke="${N}" stroke-width="3"/>
    <rect x="80" y="84" width="50" height="34" rx="10" fill="${D}"/>
    <rect x="88" y="16" width="34" height="22" rx="4" fill="${N}"/><circle cx="105" cy="27" r="6" fill="${O}"/>
    ${arrow(160, 110, 160, 50)}${arrow(176, 50, 176, 110, N)}
    <text x="150" y="140" font-family="sans-serif" font-size="12" fill="${N}">contre-courant</text>`, "Laver le filtre"),
  // Couper le courant au panneau
  power: svg(`
    <rect x="70" y="16" width="100" height="120" rx="6" fill="#fff" stroke="${N}" stroke-width="3"/>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="84" y="${28 + i * 20}" width="30" height="12" rx="2" fill="${G}"/><rect x="126" y="${28 + i * 20}" width="30" height="12" rx="2" fill="${i === 2 ? O : G}"/>`).join("")}
    <text x="178" y="80" font-family="sans-serif" font-size="14" font-weight="700" fill="${O}">OFF</text>`, "Couper le courant"),
  // Démarrer la pompe (ouverture)
  start: svg(`
    <rect x="40" y="62" width="110" height="56" rx="12" fill="#fff" stroke="${N}" stroke-width="3"/>
    <circle cx="95" cy="90" r="18" fill="${W}"/><path d="M150 82 h40 v16 h-40" fill="${G}"/>
    <circle cx="190" cy="40" r="22" fill="#3f8f4d"/><path d="M180 40 l8 8 l14 -16" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    <text x="40" y="40" font-family="sans-serif" font-size="14" font-weight="700" fill="${N}">ON</text>`, "Démarrer la pompe"),
  // Vidanger la pompe, le filtre, le chauffe-eau
  drain: svg(`
    <rect x="40" y="50" width="120" height="56" rx="12" fill="#fff" stroke="${N}" stroke-width="3"/>
    <circle cx="100" cy="78" r="18" fill="${WL}"/>
    <rect x="62" y="106" width="14" height="10" fill="${O}"/>
    <path d="M69 120 q-4 8 0 12 q4 -4 0 -12z M69 134 q-4 8 0 12 q4 -4 0 -12z" fill="${W}"/>
    <text x="150" y="134" font-family="sans-serif" font-size="12" fill="${N}">bouchon</text>`, "Vidanger"),
  // Souffler les conduites et poser les bouchons d'hivernage
  blow: svg(`${pool(76)}
    <path d="M204 60 h24 M228 60 v70" stroke="${G}" stroke-width="8" fill="none"/>
    ${arrow(232, 120, 232, 72, O)}
    <circle cx="36" cy="96" r="7" fill="${O}"/><text x="48" y="100" font-family="sans-serif" font-size="12" fill="#fff">bouchon</text>`, "Souffler les conduites"),
  // Retirer les bouchons, réinstaller les raccords (ouverture)
  plugs: svg(`${pool(60)}
    <circle cx="40" cy="96" r="7" fill="${O}"/>${arrow(48, 92, 80, 76, N)}
    <circle cx="198" cy="100" r="7" fill="${O}"/>`, "Retirer les bouchons"),
  // Ranger l'échelle et les accessoires
  store: svg(`
    <path d="M60 20 v110 M100 20 v110" stroke="${N}" stroke-width="6" fill="none"/>
    ${[0, 1, 2, 3].map((i) => `<line x1="60" y1="${40 + i * 24}" x2="100" y2="${40 + i * 24}" stroke="${N}" stroke-width="5"/>`).join("")}
    <rect x="130" y="70" width="80" height="56" rx="6" fill="${D}" stroke="${N}" stroke-width="3"/>
    <line x1="130" y1="86" x2="210" y2="86" stroke="${N}" stroke-width="3"/>`, "Ranger l'échelle et les accessoires"),
  // Installer la toile d'hivernage (avec coussin d'air)
  cover: svg(`${pool(76)}
    <ellipse cx="120" cy="66" rx="34" ry="12" fill="#fff" stroke="${N}" stroke-width="2"/>
    <path d="M14 44 q106 34 212 0" fill="none" stroke="#3a6b4a" stroke-width="7"/>
    <circle cx="20" cy="46" r="5" fill="${O}"/><circle cx="220" cy="46" r="5" fill="${O}"/>`, "Installer la toile"),
  // Enlever l'eau sur la toile, puis la toile (ouverture)
  uncover: svg(`${pool(60)}
    <path d="M14 44 q106 28 212 0" fill="none" stroke="#3a6b4a" stroke-width="7"/>
    <path d="M100 56 q20 8 40 0" fill="${W}"/>
    ${arrow(120, 40, 120, 14, N)}`, "Retirer la toile"),
  // Thermopompe : la détacher (ou la rattacher) de l'assemblage de tuyauterie de dérivation
  heatpump: svg(`
    <rect x="120" y="30" width="96" height="96" rx="8" fill="#fff" stroke="${N}" stroke-width="3"/>
    <circle cx="168" cy="72" r="28" fill="none" stroke="${N}" stroke-width="3"/>
    ${[0, 1, 2, 3].map((k) => `<line x1="168" y1="72" x2="${168 + 24 * Math.cos(k * 1.57 + 0.4)}" y2="${72 + 24 * Math.sin(k * 1.57 + 0.4)}" stroke="${N}" stroke-width="5" stroke-linecap="round"/>`).join("")}
    <path d="M20 100 h60" stroke="#d9534f" stroke-width="8"/><path d="M20 118 h60" stroke="#4a90d9" stroke-width="8"/>
    <rect x="80" y="94" width="12" height="12" rx="2" fill="${O}"/><rect x="80" y="112" width="12" height="12" rx="2" fill="${O}"/>
    <path d="M104 100 h16 M104 118 h16" stroke="${G}" stroke-width="8" stroke-dasharray="4 4"/>
    <text x="16" y="84" font-family="sans-serif" font-size="12" fill="${N}">raccords</text>`, "Thermopompe"),
  // Vidanger la thermopompe
  heatpumpDrain: svg(`
    <rect x="70" y="20" width="100" height="96" rx="8" fill="#fff" stroke="${N}" stroke-width="3"/>
    <circle cx="120" cy="62" r="28" fill="none" stroke="${N}" stroke-width="3"/>
    <rect x="86" y="116" width="14" height="10" fill="${O}"/><rect x="140" y="116" width="14" height="10" fill="${O}"/>
    <path d="M93 130 q-4 8 0 12 q4 -4 0 -12z M147 130 q-4 8 0 12 q4 -4 0 -12z" fill="${W}"/>
    <text x="180" y="130" font-family="sans-serif" font-size="12" fill="${N}">bouchons</text>`, "Vidanger la thermopompe"),
  // Assemblage de tuyauterie de dérivation (by-pass) entre le filtre et la thermopompe
  bypass: svg(`
    <rect x="12" y="40" width="44" height="80" rx="20" fill="#fff" stroke="${N}" stroke-width="3"/>
    <path d="M56 70 h40 v-30 h80 v30 h40 M96 70 h80 M56 100 h40 v20 h80 v-20 h40" fill="none" stroke="${G}" stroke-width="8"/>
    ${[[96, 55], [176, 55], [136, 70], [136, 120]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${O}"/><line x1="${x - 8}" y1="${y}" x2="${x + 8}" y2="${y}" stroke="#fff" stroke-width="3"/>`).join("")}
    <text x="14" y="138" font-family="sans-serif" font-size="11" fill="${N}">filtre</text>
    <text x="232" y="138" text-anchor="end" font-family="sans-serif" font-size="11" fill="${N}">thermopompe</text>
    <text x="96" y="24" font-family="sans-serif" font-size="12" font-weight="700" fill="${N}">dérivation</text>`, "Assemblage de dérivation"),
  // Tuyaux souterrains d'eau chaude et d'eau froide jusqu'à la thermopompe
  underground: svg(`
    <rect x="0" y="54" width="240" height="96" fill="#cdb48f"/>
    <rect x="0" y="48" width="240" height="8" fill="#6aa84f"/>
    <rect x="6" y="20" width="40" height="30" rx="4" fill="#fff" stroke="${N}" stroke-width="2"/>
    <rect x="190" y="14" width="44" height="36" rx="4" fill="#fff" stroke="${N}" stroke-width="2"/>
    <path d="M30 50 v40 h180 v-40" fill="none" stroke="#d9534f" stroke-width="7"/>
    <path d="M18 50 v58 h204 v-58" fill="none" stroke="#4a90d9" stroke-width="7"/>
    ${arrow(60, 128, 160, 128, "#fff")}
    <text x="80" y="146" font-family="sans-serif" font-size="12" font-weight="700" fill="${N}">≈ 30 pi</text>
    <text x="8" y="14" font-family="sans-serif" font-size="11" fill="${N}">filtre</text>
    <text x="172" y="10" font-family="sans-serif" font-size="11" fill="${N}">thermopompe</text>`, "Tuyaux souterrains"),
  // Faire analyser l'eau en magasin
  analyze: svg(`
    <path d="M70 20 h40 v20 l26 70 q4 14 -10 14 h-72 q-14 0 -10 -14 l26 -70 z" fill="#fff" stroke="${N}" stroke-width="3"/>
    <path d="M58 90 h86 l8 20 q4 14 -10 14 h-82 q-14 0 -10 -14 z" fill="${W}"/>
    <rect x="150" y="40" width="78" height="44" rx="6" fill="${O}"/>
    <text x="189" y="67" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#fff">ANALYSE</text>`, "Faire analyser l'eau"),
};
