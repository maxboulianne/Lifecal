// Page « Méditation » : accueil, parcours, respirations, minuteur.

import { esc } from "../../core/dom.js";
import { AMBIENCES, BREATHING_EXERCISES, PROGRAMS, TIMER_DURATIONS, TIMER_INTERVALS, getProgram, SESSION_PROGRAM } from "../../meditation/catalog.js";
import { completedSessions, meditationStats, suggestion } from "../../meditation/progress.js";
import { programContent, sessionContent } from "../../meditation/scripts/index.js";
import { isSpeechSupported } from "../../meditation/voice.js";
import { t } from "../../i18n/index.js";

function greeting() {
  const h = new Date().getHours();
  return t(h < 12 ? "med.greeting.morning" : h < 18 ? "med.greeting.afternoon" : "med.greeting.evening");
}

const stat = (value, label) => `<div class="med-stat"><span class="stat-value">${value}</span><span class="stat-label">${label}</span></div>`;

function sessionRow(program, id, index, done) {
  const c = sessionContent(id);
  const label = program.sequential ? `${t("med.day", { n: index + 1 })} · ${c.title}` : c.title;
  return `<button type="button" class="med-session ${done ? "is-done" : ""}" data-action="med-setup" data-kind="session" data-id="${id}">
    <span class="med-session-check" aria-hidden="true">${done ? "✓" : index + 1}</span>
    <span class="med-session-text"><strong>${esc(label)}</strong><span>${esc(c.subtitle)}</span></span>
    ${done ? `<span class="visually-hidden">${t("med.done")}</span>` : ""}
  </button>`;
}

function programCard(program, done) {
  const c = programContent(program.id);
  const count = program.sessions.filter((s) => done.has(s)).length;
  return `<article class="card med-program" style="--pc:${program.color}">
    <header>
      <span class="med-program-icon" aria-hidden="true">${program.icon}</span>
      <div><h3>${esc(c.title)}</h3><p class="hint">${esc(c.description)}</p></div>
    </header>
    <div class="bar" aria-hidden="true"><span style="width:${(count / program.sessions.length) * 100}%"></span></div>
    <p class="hint">${t("med.progress", { done: count, total: program.sessions.length })}</p>
    <div class="med-session-list">${program.sessions.map((id, k) => sessionRow(program, id, k, done.has(id))).join("")}</div>
  </article>`;
}

export const meditationPage = {
  id: "meditation",

  title: () => t("med.title"),

  render({ repo, today }) {
    const items = repo.all();
    const stats = meditationStats(items, today);
    const done = completedSessions(items);
    const next = suggestion(items);
    const nextContent = next && sessionContent(next.sessionId);

    return `<section class="page meditation">
      <div class="med-hero">
        <p class="med-greeting">${greeting()}</p>
        <h2>${t("med.subtitle")}</h2>
        <div class="med-stats">
          ${stat(stats.minutes, t("med.stats.minutes", { count: stats.minutes }))}
          ${stat(stats.sessions, t("med.stats.sessions", { count: stats.sessions }))}
          ${stat(stats.streak, t("med.stats.streak", { count: stats.streak }))}
        </div>
        ${next ? `<button type="button" class="med-continue" data-action="med-setup" data-kind="session" data-id="${next.sessionId}">
          <span class="hint">${t(done.size ? "med.continue" : "med.begin")} · ${esc(programContent(next.program.id).title)}</span>
          <strong>${esc(nextContent.title)}</strong>
          <span class="med-play" aria-hidden="true">▶</span>
        </button>` : ""}
      </div>

      <h2 class="section-title">${t("med.programs")}</h2>
      ${PROGRAMS.map((p) => programCard(p, done)).join("")}

      <h2 class="section-title">${t("med.breathing")}</h2>
      <div class="med-grid">
        ${BREATHING_EXERCISES.map((b) => `<button type="button" class="card med-tile" data-action="med-setup" data-kind="breathing" data-id="${b.id}">
          <span class="med-tile-icon" aria-hidden="true">${b.icon}</span>
          <strong>${t(`med.breath.${b.id}.title`)}</strong>
          <span class="hint">${t(`med.breath.${b.id}.desc`)}</span>
        </button>`).join("")}
      </div>

      <h2 class="section-title">${t("med.timer.title")}</h2>
      <button type="button" class="card med-tile wide" data-action="med-setup" data-kind="timer" data-id="timer">
        <span class="med-tile-icon" aria-hidden="true">🔔</span>
        <strong>${t("med.timer.title")}</strong>
        <span class="hint">${t("med.timer.desc")}</span>
      </button>

      <p class="med-safety">${t("med.safety")}</p>
    </section>`;
  },
};

// ---- Fenêtre de préparation (durée, ambiance, voix) -------------------------

const chips = (name, values, current, label) =>
  `<div class="segmented wrap">${values.map((v) => `<label class="seg-option">
    <input type="radio" name="${name}" value="${v}" ${String(v) === String(current) ? "checked" : ""}><span>${label(v)}</span>
  </label>`).join("")}</div>`;

export function setupContent(kind, id) {
  if (kind === "session") {
    const program = getProgram(SESSION_PROGRAM[id]);
    const c = sessionContent(id);
    return { title: c.title, subtitle: c.subtitle, kicker: `${program.icon} ${programContent(program.id).title}`, durations: program.durations, color: program.color };
  }
  if (kind === "breathing") {
    const b = BREATHING_EXERCISES.find((x) => x.id === id);
    return { title: t(`med.breath.${id}.title`), subtitle: t(`med.breath.${id}.desc`), kicker: `${b.icon} ${t("med.breathing")}`, durations: b.durations, color: "#0ea5e9" };
  }
  return { title: t("med.timer.title"), subtitle: t("med.timer.desc"), kicker: "🔔", durations: TIMER_DURATIONS, color: "#6366f1" };
}

export function setupSheet(kind, id, prefs) {
  const c = setupContent(kind, id);
  const minutes = c.durations.includes(prefs.minutes?.[kind]) ? prefs.minutes[kind] : c.durations[Math.min(1, c.durations.length - 1)];
  return `<form id="med-setup" class="form med-setup" data-kind="${kind}" data-id="${esc(id)}" style="--pc:${c.color}">
    <p class="detail-module">${esc(c.kicker)}</p>
    <h2 id="med-setup-title">${esc(c.title)}</h2>
    <p class="hint">${esc(c.subtitle)}</p>

    <fieldset class="repeat"><legend>${t("med.duration")}</legend>
      ${chips("minutes", c.durations, minutes, (m) => t("med.minutes", { count: m }))}
    </fieldset>

    ${kind === "timer" ? `<fieldset class="repeat"><legend>${t("med.timer.bell")}</legend>
      ${chips("interval", TIMER_INTERVALS, prefs.interval ?? 0, (v) => t(`med.timer.interval.${v}`))}
    </fieldset>` : ""}

    <fieldset class="repeat"><legend>${t("med.ambience")}</legend>
      ${chips("ambience", AMBIENCES, prefs.ambience ?? "none", (a) => t(`med.ambience.${a}`))}
    </fieldset>

    ${kind !== "timer" ? (isSpeechSupported()
      ? `<label class="switch"><input type="checkbox" name="voice" ${prefs.voiceOn !== false ? "checked" : ""}><span>${t("med.voiceOn")}</span></label>`
      : `<p class="hint">${t("med.noVoice")}</p>`) : ""}

    <div class="actions">
      <button type="button" class="btn ghost" data-action="close">${t("form.cancel")}</button>
      <button type="submit" class="btn primary">${t("med.start")}</button>
    </div>
  </form>`;
}
