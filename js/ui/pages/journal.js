// Page « Mon journal » : écrire la journée, noter son humeur, voir son évolution.

import { addDays, parseISODate, toISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { fmt, t, tList } from "../../i18n/index.js";
import {
  GRATITUDE_SLOTS, entryContent, entryFor, moodSeries, pastEntries, promptIndex, weekTrend,
} from "../../journal/journal.js";
import { MOODS } from "../../meditation/catalog.js";

const MOOD_COLORS = ["#ef4444", "#f59e0b", "#a3a3a3", "#22c55e", "#0d9488"];

export function moodPicker(selected, action) {
  return `<div class="moods light" role="radiogroup" aria-label="${esc(t("journal.mood"))}">${MOODS.map((m, k) =>
    `<button type="button" class="mood ${selected === k ? "selected" : ""}" data-action="${action}" data-mood="${k}"
      role="radio" aria-checked="${selected === k}" aria-label="${esc(t(`mood.level.${k}`))}">${m}</button>`).join("")}</div>`;
}

// Courbe des 30 derniers jours : un point par jour où l'humeur est connue.
function moodChart(series) {
  const w = 300;
  const h = 90;
  const step = w / (series.length - 1);
  const y = (m) => h - 10 - (m / 4) * (h - 20);
  const points = series.map((d, k) => (d.mood === null ? null : [k * step, y(d.mood), d]));
  const known = points.filter(Boolean);
  const path = known.map(([x, yy], k) => `${k ? "L" : "M"}${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  return `<svg class="mood-chart" viewBox="-6 0 ${w + 12} ${h}" role="img" aria-label="${esc(t("mood.last30"))}">
    ${[0, 2, 4].map((m) => `<line x1="0" x2="${w}" y1="${y(m)}" y2="${y(m)}" class="grid-line"/>`).join("")}
    ${known.length > 1 ? `<path d="${path}" class="mood-line"/>` : ""}
    ${known.map(([x, yy, d]) => `<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="4.5" fill="${MOOD_COLORS[Math.round(d.mood)]}">
      <title>${esc(fmt.date(parseISODate(d.iso)))} · ${MOODS[Math.round(d.mood)]}</title></circle>`).join("")}
  </svg>`;
}

function moodCard(items, today) {
  const series = moodSeries(items, today, 30);
  const hasData = series.some((d) => d.mood !== null);
  const trend = weekTrend(items, today);
  return `<div class="card mood-card">
    <h2>${t("mood.title")}</h2>
    ${hasData ? `${moodChart(series)}
      <p class="hint chart-caption"><span>${t("mood.last30")}</span><span>${MOODS[0]} → ${MOODS[4]}</span></p>
      ${trend ? `<p class="mood-trend">${t(`mood.${trend}`)}</p>` : ""}
      ${trend === "down" ? `<button type="button" class="btn soft" data-action="open-meditation">🆘 ${t("mood.sos")}</button>` : ""}`
      : `<p class="hint">${t("mood.noData")}</p>`}
  </div>`;
}

export const journalPage = {
  id: "journal",

  title: () => t("journal.title"),

  render({ repo, today, cursor, promptShift = 0 }) {
    const items = repo.all();
    const iso = toISODate(cursor) > today ? today : toISODate(cursor);
    const content = entryContent(entryFor(items, iso));
    const prompts = tList("journal.prompts");
    const prompt = prompts[promptIndex(iso, prompts.length, promptShift)];
    const date = parseISODate(iso);
    const past = pastEntries(items, iso);

    return `<section class="page journal">
      <article class="card journal-entry" data-date="${iso}">
        <header class="journal-nav">
          <button type="button" class="icon-btn" data-action="journal-day" data-date="${toISODate(addDays(date, -1))}" aria-label="${esc(t("nav.prev"))}">‹</button>
          <h2>${esc(iso === today ? t("nav.today") : fmt.longDate(date))}</h2>
          ${iso < today
            ? `<button type="button" class="icon-btn" data-action="journal-day" data-date="${toISODate(addDays(date, 1))}" aria-label="${esc(t("nav.next"))}">›</button>`
            : '<span class="icon-btn" aria-hidden="true"></span>'}
        </header>

        <p class="journal-question">${t("journal.mood")}</p>
        ${moodPicker(content.mood, "journal-mood")}

        <div class="prompt-card">
          <p class="hint">${t("journal.prompt")}</p>
          <p class="prompt-text">${esc(prompt)}</p>
          <div class="prompt-actions">
            <button type="button" class="btn link" data-action="journal-use-prompt" data-prompt="${esc(prompt)}">${t("journal.usePrompt")}</button>
            <button type="button" class="btn link" data-action="journal-next-prompt">${t("journal.otherPrompt")}</button>
          </div>
        </div>

        <label class="visually-hidden" for="journal-text">${t("journal.title")}</label>
        <textarea id="journal-text" class="journal-text" data-journal="text" rows="8"
          placeholder="${esc(t("journal.placeholder"))}">${esc(content.text)}</textarea>

        <p class="journal-question">${t("journal.gratitude")}</p>
        <div class="gratitude">
          ${Array.from({ length: GRATITUDE_SLOTS }, (_, k) => `<label class="gratitude-row">
            <span aria-hidden="true">${k + 1}</span>
            <input data-journal="gratitude" data-index="${k}" value="${esc(content.gratitude[k])}"
              placeholder="${esc(t("journal.gratitudePlaceholder"))}" aria-label="${esc(t("journal.gratitude"))} ${k + 1}" autocomplete="off">
          </label>`).join("")}
        </div>

        <p class="journal-footer"><span class="hint">🔒 ${t("journal.private")}</span><span class="save-status" data-role="save-status" aria-live="polite"></span></p>
      </article>

      ${moodCard(items, today)}

      <div class="card">
        <h2>${t("journal.past")}</h2>
        ${past.length
          ? `<div class="past-list">${past.map((e) => {
              const c = entryContent(e);
              const excerpt = c.text.trim() || c.gratitude.filter(Boolean).join(" · ");
              return `<button type="button" class="past-entry" data-action="journal-day" data-date="${e.date}">
                <span class="past-mood" aria-hidden="true">${c.mood !== null ? MOODS[c.mood] : "📓"}</span>
                <span class="past-text"><strong>${esc(fmt.longDate(parseISODate(e.date)))}</strong>
                  <span>${esc(excerpt.slice(0, 120))}</span></span>
              </button>`;
            }).join("")}</div>`
          : `<p class="hint">${t("journal.empty")}</p>`}
      </div>
    </section>`;
  },
};

// Lit le contenu saisi dans la page.
export function readJournal(root) {
  const text = root.querySelector("[data-journal=text]").value;
  const gratitude = [...root.querySelectorAll("[data-journal=gratitude]")].map((i) => i.value);
  const selected = root.querySelector(".journal-entry .mood.selected");
  return { text, gratitude, mood: selected ? Number(selected.dataset.mood) : null };
}
