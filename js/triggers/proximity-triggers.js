// Déclencheurs de proximité : « tu passes près de l'épicerie, voici ta liste ».

import { getModule, hasFeature } from "../config/modules.js";
import { distanceMeters } from "../geo/geo.js";
import { hasCoordinates, isCancelled } from "../data/item.js";
import { fmt } from "../i18n/index.js";

// Regroupe les commissions à faire (aujourd'hui ou en retard) situées près
// de la position actuelle, par lieu.
export const nearbyErrands = {
  id: "commissions-proximite",
  kind: "proximity",
  evaluate({ items, today, position, settings }) {
    const radius = settings?.proximityRadiusMeters ?? 300;
    const nearby = items.filter(
      (i) =>
        hasFeature(i.module, "proximity") &&
        !i.recurrence &&
        hasCoordinates(i) &&
        !i.done &&
        !isCancelled(i) &&
        i.date <= today &&
        distanceMeters(position, i) <= radius,
    );

    const byPlace = new Map();
    for (const item of nearby) {
      const key = item.place || `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
      if (!byPlace.has(key)) byPlace.set(key, []);
      byPlace.get(key).push(item);
    }

    return [...byPlace].map(([place, list]) => ({
      id: `commissions-proximite:${place}`,
      tone: "info",
      icon: getModule("commission").icon,
      messageKey: "nudge.nearby",
      params: { place, list: fmt.list(list.map((i) => i.title)) },
      itemIds: list.map((i) => i.id),
    }));
  },
};

export const proximityTriggers = [nearbyErrands];
