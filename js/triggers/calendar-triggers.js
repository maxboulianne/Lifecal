// Déclencheurs basés sur le calendrier. Ton : doux, jamais culpabilisant.
// Les messages sont des clés de traduction ; l'interface les traduit.

import { getModule } from "../config/modules.js";
import { addDays, diffDays, parseISODate, startOfWeek, toISODate } from "../core/dates.js";
import { isCancelled } from "../data/item.js";
import { FREQ, doneInWeek, occurrencesBetween } from "../data/recurrence.js";
import { getChecklist, progress } from "../data/checklist.js";
import { fmt } from "../i18n/index.js";
import { kindIcon, reminderPhase, upcomingEvents } from "../events/events.js";

const upcoming = (items, today, moduleId, maxDays) =>
  items
    .filter((i) => i.module === moduleId && !i.recurrence && !isCancelled(i) && !i.done)
    .map((i) => ({ item: i, days: diffDays(today, i.date) }))
    .filter(({ days }) => days >= 0 && days <= maxDays);

// Valise pas encore prête à quelques jours du départ : un rappel doux.
export const packingReminder = {
  id: "voyage-valise",
  kind: "calendar",
  windowDays: 3,
  applies(item, days) {
    const p = progress(getChecklist(item));
    return days <= this.windowDays && p.total > 0 && !p.complete;
  },
  evaluate({ items, today }) {
    return upcoming(items, today, "voyage", this.windowDays)
      .filter(({ item, days }) => this.applies(item, days))
      .map(({ item, days }) => {
        const p = progress(getChecklist(item));
        return {
          id: `voyage-valise:${item.id}:${today}`,
          tone: "info",
          icon: "🧳",
          messageKey: "nudge.packing",
          params: { title: item.title, when: fmt.inDays(days), percent: fmt.percent(p.done / p.total) },
          itemIds: [item.id],
          actionKey: "nudge.travelAction",
          action: "open-trip",
          actionId: item.id,
        };
      });
  },
};

// Un voyage dans 3 semaines ou moins lance sa préparation
// (sauf si le rappel de valise, plus précis, s'en charge déjà).
export const travelPreparation = {
  id: "voyage-preparation",
  kind: "calendar",
  windowDays: 21,
  evaluate({ items, today }) {
    return upcoming(items, today, "voyage", this.windowDays)
      .filter(({ item, days }) => !packingReminder.applies(item, days))
      .map(({ item, days }) => ({
      id: `voyage-preparation:${item.id}`,
      tone: "info",
      icon: getModule("voyage").icon,
      messageKey: "nudge.travel",
      params: { title: item.title, when: fmt.inDays(days) },
      itemIds: [item.id],
      actionKey: "nudge.travelAction",
      action: "open-trip",
      actionId: item.id,
    }));
  },
};

// Fêtes, anniversaires et événements : un rappel doux 2 semaines avant
// (idée cadeau), 2 jours avant, puis le jour même.
export const eventReminders = {
  id: "evenement-rappel",
  kind: "calendar",
  evaluate({ items, today }) {
    return upcomingEvents(items, today, 14)
      .map((e) => ({ ...e, phase: reminderPhase(e.days) }))
      .filter((e) => e.phase && !e.item.done)
      .map(({ item, date, days, age, phase }) => ({
        id: `evenement-rappel:${item.id}:${date}:${phase}`,
        tone: phase === "ahead" ? "info" : "soft",
        icon: kindIcon(item),
        messageKey: `nudge.event.${phase}${age ? "Age" : ""}`,
        params: { title: item.title, when: fmt.inDays(days), ...(age ? { count: age } : {}) },
        itemIds: [item.id],
        actionKey: "nudge.eventAction",
        action: "open-item",
        actionId: item.id,
        actionDate: date,
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

// En semaine, à partir de 16 h : les heures du jour ne sont pas encore notées
// (seulement si des projets sont en cours dans « Mes heures »).
export const timesheetReminder = {
  id: "heures-jour",
  kind: "calendar",
  fromHour: 16,
  evaluate({ timesheet, today, hour }) {
    if (!timesheet || hour === undefined || hour < this.fromHour) return [];
    const day = parseISODate(today).getDay();
    if (day === 0 || day === 6) return [];
    if (!timesheet.projects.some((p) => !p.archived)) return [];
    if (timesheet.entries.some((e) => e.date === today)) return [];
    return [
      {
        id: `heures-jour:${today}`,
        tone: "soft",
        icon: "⏱️",
        messageKey: "nudge.timesheet",
        params: {},
        itemIds: [],
        actionKey: "nudge.timesheetAction",
        action: "open-timesheet",
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
  packingReminder, travelPreparation, eventReminders, missedHabitEncouragement, flexibleWeekReview, eveningJournal, timesheetReminder, backupReminder,
];
