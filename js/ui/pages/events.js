// Page « Événements » : fêtes, anniversaires et événements des 12 prochains
// mois, mois par mois, avec le compte à rebours, l'âge et les préparatifs.

import { getModule } from "../../config/modules.js";
import { parseISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { getChecklist, progress } from "../../data/checklist.js";
import { budgetOf, eventKind, kindIcon, upcomingEvents } from "../../events/events.js";
import { fmt, t } from "../../i18n/index.js";

const capitalize = (s) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

function eventCard({ item, date, days, age }) {
  const m = getModule(item.module);
  const kind = eventKind(item);
  const gifts = progress(getChecklist(item, "gifts"));
  const guests = progress(getChecklist(item, "guests"));
  const budget = budgetOf(item);
  const meta = [
    gifts.total ? `🎁 ${t("events.gifts", { done: gifts.done, total: gifts.total })}` : "",
    budget ? `💰 ${fmt.amount(budget)}` : "",
    guests.total ? `👥 ${t("events.guests", { done: guests.done, total: guests.total })}` : "",
  ].filter(Boolean);
  return `<button type="button" class="card event-card ${days === 0 ? "is-today" : ""}" style="--c:${m.color}"
    data-action="open-item" data-id="${esc(item.id)}" data-date="${esc(date)}">
    <span class="event-icon" aria-hidden="true">${kindIcon(item)}</span>
    <span class="event-text">
      <strong>${esc(item.title)}</strong>
      <span class="hint">${esc(fmt.longDate(parseISODate(date)))}${age ? ` · ${esc(t(`event.age.${kind}`, { count: age }))}` : ""}</span>
      ${meta.length ? `<span class="event-meta">${meta.map(esc).join(" · ")}</span>` : ""}
    </span>
    <span class="event-when">${days === 0 ? `${t("events.today")} 🎉` : esc(capitalize(fmt.inDays(days)))}</span>
  </button>`;
}

export const eventsPage = {
  id: "events",

  title: () => t("nav.events"),

  render({ repo, today }) {
    const upcoming = upcomingEvents(repo.all(), today);
    if (!upcoming.length) {
      return `<section class="page events">
        <p class="empty-msg">${t("events.empty")}</p>
        <div class="actions center"><button type="button" class="btn primary" data-action="new-item" data-module="evenement">🎂 ${t("events.add")}</button></div>
      </section>`;
    }
    // Regroupés par mois : « Octobre 2026 », « Novembre 2026 »…
    const months = new Map();
    for (const e of upcoming) {
      const key = e.date.slice(0, 7);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(e);
    }
    return `<section class="page events">
      <p class="hint events-intro">${t("events.intro")}</p>
      ${[...months.entries()].map(([key, list]) => `<h2 class="section-title">${esc(fmt.monthYear(parseISODate(`${key}-01`)))}</h2>
        ${list.map(eventCard).join("")}`).join("")}
    </section>`;
  },
};
