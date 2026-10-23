// Déclencheurs basés sur le calendrier. Ton : doux, jamais culpabilisant.

import { getModule } from "../config/modules.js";
import { addDays, diffDays, parseISODate, toISODate } from "../core/dates.js";
import { isCancelled } from "../data/item.js";

const upcoming = (items, today, moduleId, maxDays) =>
  items
    .filter((i) => i.module === moduleId && !isCancelled(i) && !i.done)
    .map((i) => ({ item: i, days: diffDays(today, i.date) }))
    .filter(({ days }) => days >= 0 && days <= maxDays);

const inDays = (n) => (n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`);

// Un voyage dans 3 semaines ou moins lance sa préparation.
export const travelPreparation = {
  id: "voyage-preparation",
  kind: "calendar",
  windowDays: 21,
  evaluate({ items, today }) {
    return upcoming(items, today, "voyage", this.windowDays).map(({ item, days }) => ({
      id: `voyage-preparation:${item.id}`,
      tone: "info",
      icon: getModule("voyage").icon,
      message: `${item.title}, c'est ${inDays(days)}. Envie de commencer à préparer tranquillement ?`,
      itemIds: [item.id],
      actionLabel: "Voir le voyage",
      actionItemId: item.id,
    }));
  },
};

// Un événement spécial dans la semaine : rappel de préparation.
export const specialEventPreparation = {
  id: "evenement-preparation",
  kind: "calendar",
  windowDays: 7,
  evaluate({ items, today }) {
    return upcoming(items, today, "evenement", this.windowDays).map(({ item, days }) => ({
      id: `evenement-preparation:${item.id}`,
      tone: "info",
      icon: getModule("evenement").icon,
      message: `${item.title} arrive ${inDays(days)}. Un petit mot ou un cadeau à prévoir ?`,
      itemIds: [item.id],
      actionLabel: "Voir",
      actionItemId: item.id,
    }));
  },
};

// Habitude manquée hier : un encouragement, pas un reproche.
export const missedHabitEncouragement = {
  id: "habitude-encouragement",
  kind: "calendar",
  evaluate({ items, today }) {
    const yesterday = toISODate(addDays(parseISODate(today), -1));
    const missed = items.filter((i) => i.module === "habitude" && i.date === yesterday && !i.done && !isCancelled(i));
    if (!missed.length) return [];
    const names = missed.map((i) => i.title).join(", ");
    return [
      {
        id: `habitude-encouragement:${yesterday}`,
        tone: "soft",
        icon: getModule("habitude").icon,
        message: `Hier, ${names} n'a pas eu lieu, et c'est correct. Chaque jour est une nouvelle chance 🌿`,
        itemIds: missed.map((i) => i.id),
      },
    ];
  },
};

export const calendarTriggers = [travelPreparation, specialEventPreparation, missedHabitEncouragement];
