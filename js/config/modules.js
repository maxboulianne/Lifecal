import { t } from "../i18n/index.js";

// Registre des modules. Chaque élément du calendrier appartient à un module.
// Ajouter un module = ajouter une entrée ici (et son nom « module.xxx » dans
// les traductions) ; les vues, la légende et le formulaire s'adaptent.
//
// `features` décrit ce que le module saura faire après le pilote. Ces drapeaux
// servent de point d'accroche pour le code futur (ex. afficher une liste à
// cocher seulement pour les modules qui ont `checklist`).

export const MODULES = {
  rdv: {
    id: "rdv",
    color: "#3b82f6", // bleu
    icon: "📅",
    features: ["location"],
  },
  habitude: {
    id: "habitude",
    color: "#22c55e", // vert
    icon: "🌱",
    features: ["recurrence", "streaks", "stats"],
  },
  commission: {
    id: "commission",
    color: "#f59e0b", // orange
    icon: "🛒",
    features: ["location", "checklist", "proximity"],
  },
  evenement: {
    id: "evenement",
    color: "#ec4899", // rose
    icon: "🎉",
    features: ["preparation", "yearly", "checklist", "gifts", "guests"],
  },
  voyage: {
    id: "voyage",
    color: "#8b5cf6", // violet
    icon: "✈️",
    features: ["location", "checklist", "range", "places", "map", "preparation"],
  },
  meditation: {
    id: "meditation",
    color: "#0d9488", // sarcelle
    icon: "🧘",
    features: ["meditation"],
  },
  journal: {
    id: "journal",
    color: "#64748b", // gris
    icon: "📓",
    features: ["writing"],
  },
};

export const MODULE_IDS = Object.keys(MODULES);
export const DEFAULT_MODULE = "rdv";

export function getModule(id) {
  return MODULES[id] ?? MODULES[DEFAULT_MODULE];
}

export function hasFeature(moduleId, feature) {
  return getModule(moduleId).features.includes(feature);
}

export const moduleLabel = (id) => t(`module.${getModule(id).id}`);
