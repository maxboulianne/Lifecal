// Déclencheurs basés sur le calendrier. Ton : doux, jamais culpabilisant.
// Les messages sont des clés de traduction ; l'interface les traduit.

import { getModule } from "../config/modules.js";
import { addDays, diffDays, parseISODate, startOfWeek, toISODate } from "../core/dates.js";
import { isCancelled } from "../data/item.js";
import { FREQ, doneInWeek, occurrencesBetween } from "../data/recurrence.js";
import { fmt } from "../i18n/index.js";

const upcoming = (items, today, moduleId, maxDays) =>
  items
    .filter((i) => i.module === moduleId && !i.recurrence && !isCancelled(i) && !i.done)
    .map((i) => ({ item: i, days: diffDays(today, i.date) }))
    .filter(({ days }) => days >= 0 && days <= maxDays);

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
      messageKey: "nudge.travel",
      params: { title: item.title, when: fmt.inDays(days) },
      itemIds: [item.id],
      actionKey: "nudge.travelAction",
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
      messageKey: "nudge.event",
      params: { title: item.title, when: fmt.inDays(days) },
      itemIds: [item.id],
      actionKey: "nudge.eventAction",
      actionItemId: item.id,
    }));
  },
};

// Habitude manquée hier : un encouragement, pas un reproche.
// (Les habitudes « X fois par semaine » ont leur propre bilan, plus bas.)
export const missedHabitEncouragement = {
  id: "habitude-encouragement",
  kind: "calendar",
  evaluate({ items, today }) {
    const yesterday = toISODate(addDays(parseISODate(today), -1));
    const missed = occurrencesBetween(items, yesterday, yesterday).filter(
      (i) => i.module === "habitude" && !i.done && !isCancelled(i) && i.recurrence?.freq !== FREQ.FLEXIBLE,
    );
    if (!missed.length) return [];
    return [
      {
        id: `habitude-encouragement:${yesterday}`,
        tone: "soft",
        icon: getModule("habitude").icon,
        messageKey: "nudge.missedHabit",
        params: { count: missed.length, names: fmt.list(missed.map((i) => i.title)) },
        itemIds: missed.map((i) => i.id),
      },
    ];
  },
};

// Le lundi, bilan doux de la semaine passée pour les habitudes « X fois par semaine ».
export const flexibleWeekReview = {
  id: "habitude-bilan-semaine",
  kind: "calendar",
  evaluate({ items, today }) {
    const thisWeek = startOfWeek(parseISODate(today));
    if (toISODate(thisWeek) !== today) return [];
    const lastWeek = toISODate(addDays(thisWeek, -7));
    const lastSunday = toISODate(addDays(thisWeek, -1));
    return items
      .filter((i) => i.recurrence?.freq === FREQ.FLEXIBLE && !isCancelled(i) && i.date <= lastSunday)
      .filter((i) => !i.recurrence.until || i.recurrence.until >= lastWeek)
      .map((i) => ({ item: i, done: doneInWeek(i, lastWeek), target: i.recurrence.timesPerWeek }))
      .filter(({ done, target }) => done > 0 && done < target)
      .map(({ item, done, target }) => ({
        id: `habitude-bilan-semaine:${item.id}:${lastWeek}`,
        tone: "soft",
        icon: getModule("habitude").icon,
        messageKey: "nudge.weekReview",
        params: { title: item.title, done, target },
        itemIds: [item.id],
      }));
  },
};

// Le soir, si rien n'est encore écrit aujourd'hui : une invitation au journal.
export const eveningJournal = {
  id: "journal-soir",
  kind: "calendar",
  fromHour: 19,
  evaluate({ items, today, hour }) {
    if (hour === undefined || hour < this.fromHour) return [];
    if (items.some((i) => i.module === "journal" && i.date === today && !i.recurrence)) return [];
    return [
      {
        id: `journal-soir:${today}`,
        tone: "soft",
        icon: getModule("journal").icon,
        messageKey: "nudge.journal",
        params: {},
        itemIds: [],
        actionKey: "nudge.journalAction",
        action: "open-journal",
      },
    ];
  },
};

// Le dimanche, si la dernière copie des données date de plus d'un mois
// (ou n'existe pas) : un rappel doux d'en faire une. Les données ne vivent
// que sur l'appareil ; une copie les met à l'abri.
export const backupReminder = {
  id: "copie-donnees",
  kind: "calendar",
  minItems: 10,
  everyDays: 30,
  evaluate({ items, today, settings }) {
    if (parseISODate(today).getDay() !== 0 || items.length < this.minItems) return [];
    const last = settings?.lastExport;
    if (last && diffDays(last, today) < this.everyDays) return [];
    return [
      {
        id: `copie-donnees:${today}`,
        tone: "info",
        icon: "💾",
        messageKey: "nudge.backup",
        params: {},
        itemIds: [],
        actionKey: "nudge.backupAction",
        action: "open-settings",
      },
    ];
  },
};

export const calendarTriggers = [
  travelPreparation, specialEventPreparation, missedHabitEncouragement, flexibleWeekReview, eveningJournal, backupReminder,
];
