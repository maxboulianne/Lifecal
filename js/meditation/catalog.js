// Catalogue du module Méditation : parcours, séances, respirations, ambiances.
// Les textes (titres, scripts) sont dans scripts/<langue>.js.

// Rythmes de respiration, en secondes : inspire, retiens, expire, retiens.
export const BREATH_PATTERNS = {
  coherence: { in: 5, hold: 0, out: 5, hold2: 0 }, // cohérence cardiaque
  calm: { in: 4, hold: 0, out: 6, hold2: 0 }, // expiration longue, apaisante
  box: { in: 4, hold: 4, out: 4, hold2: 4 }, // respiration carrée
  sleep: { in: 4, hold: 7, out: 8, hold2: 0 }, // 4-7-8, pour s'endormir
};

export const cycleSeconds = (p) => p.in + p.hold + p.out + p.hold2;

export const PROGRAMS = [
  {
    id: "premiers-pas",
    icon: "🌱",
    color: "#14b8a6",
    sessions: ["pp1", "pp2", "pp3", "pp4", "pp5", "pp6", "pp7"],
    durations: [5, 10, 15],
    sequential: true, // une séance par jour, dans l'ordre suggéré
  },
  {
    id: "moments-difficiles",
    icon: "🆘",
    color: "#f97316",
    sessions: ["sos1", "sos2", "sos3"],
    durations: [3, 5, 10],
    sequential: false,
  },
];

export const SESSION_PROGRAM = Object.fromEntries(PROGRAMS.flatMap((p) => p.sessions.map((s) => [s, p.id])));

export const getProgram = (id) => PROGRAMS.find((p) => p.id === id) ?? null;

// Exercices de respiration autonomes (sans script).
export const BREATHING_EXERCISES = [
  { id: "coherence", pattern: "coherence", icon: "💚", durations: [3, 5, 10] },
  { id: "box", pattern: "box", icon: "🟦", durations: [2, 4, 6] },
  { id: "sleep", pattern: "sleep", icon: "🌙", durations: [2, 4, 6] },
];

// Ambiances sonores générées dans le navigateur (aucun fichier à télécharger).
export const AMBIENCES = ["none", "rain", "ocean", "forest"];

export const TIMER_DURATIONS = [5, 10, 15, 20, 30];
export const TIMER_INTERVALS = [0, 1, 5]; // minutes entre deux sons de bol (0 = aucun)

export const MOODS = ["😣", "😕", "😐", "🙂", "😌"];
