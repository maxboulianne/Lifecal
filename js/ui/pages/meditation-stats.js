// Page « Mes statistiques » de méditation : temps écouté par semaine, mois et
// année (graphiques en barres avec les chiffres) et progression des parcours.

import { parseISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { fmt, t } from "../../i18n/index.js";
import { meditationLog, periodSeries, programProgress, secondsByKind } from "../../meditation/progress.js";
import { programContent, sessionContent } from "../../meditation/scripts/index.js";

export const PERIODS = ["week", "month", "year"];

// « 1 h 25 min », « 40 min », « < 1 min »
export function formatDuration(seconds) {
  const total = Math.round(seconds / 60);
  if (seconds > 0 && total === 0) return t("duration.lt1");
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return t("duration.min", { m });
  return m ? t("duration.hm", { h, m }) : t("duration.h", { h });
}

// Version courte pour les étiquettes des barres.
function shortDuration(seconds) {
  const m = Math.round(seconds / 60);
  if (!m) return seconds > 0 ? "<1" : "";
  return m < 60 ? t("duration.min", { m }) : t("duration.h", { h: fmt.decimal(m / 60) });
}

function periodLabel(series) {
  const from = parseISODate(series.from);
  if (series.period === "week") return fmt.range(from, parseISODate(series.to));
  if (series.period === "month") return fmt.monthYear(from);
  return String(from.getFullYear());
}

function barLabel(series, bar, k) {
  if (series.period === "week") return fmt.weekdayNarrow(bar.date.getDay());
  if (series.period === "year") return fmt.monthName(k).charAt(0);
  const day = k + 1;
  return day === 1 || day % 5 === 0 ? String(day) : "";
}

function barTitle(series, bar, k) {
  const when = series.period === "year" ? `${fmt.monthName(k)} ${bar.date.getFullYear()}` : fmt.longDate(bar.date);
  return `${when} : ${formatDuration(bar.seconds)}`;
}

// Graphique en barres (une seule série, une seule couleur). Les valeurs sont
// écrites au-dessus des barres quand il y en a peu ; pour un mois, seule la
// meilleure journée l'est. Toucher une barre affiche son détail.
function barChart(series) {
  const n = series.bars.length;
  const w = 320;
  const h = 150;
  const top = 18;
  const bottom = 18;
  const gap = n > 12 ? 2 : 6;
  const bw = (w - gap * (n - 1)) / n;
  const max = Math.max(...series.bars.map((b) => b.seconds), 60);
  const scale = (s) => ((h - top - bottom) * s) / max;
  const labelAll = n <= 12;
  return `<svg class="stats-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(periodLabel(series))}">
    <line x1="0" x2="${w}" y1="${h - bottom + 0.5}" y2="${h - bottom + 0.5}" class="baseline"/>
    ${series.bars.map((bar, k) => {
      const x = k * (bw + gap);
      const bh = scale(bar.seconds);
      const y = h - bottom - bh;
      const r = Math.min(4, bw / 2, bh);
      const showValue = bar.seconds > 0 && (labelAll || bar === series.best);
      const title = barTitle(series, bar, k);
      return `<g class="bar-group" data-action="stats-bar" data-readout="${esc(title)}" tabindex="0" role="button" aria-label="${esc(title)}">
        <rect class="hit" x="${x - gap / 2}" y="0" width="${bw + gap}" height="${h}"/>
        ${bh > 0 ? `<path class="bar" d="M${x},${h - bottom} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${h - bottom} Z"/>` : ""}
        ${showValue ? `<text class="value" x="${x + bw / 2}" y="${y - 4}">${esc(shortDuration(bar.seconds))}</text>` : ""}
        <text class="axis" x="${x + bw / 2}" y="${h - 4}">${esc(barLabel(series, bar, k))}</text>
        <title>${esc(title)}</title>
      </g>`;
    }).join("")}
  </svg>`;
}

function kindRows(series, items) {
  const kinds = secondsByKind(items, series.from, series.to);
  const max = Math.max(...Object.values(kinds), 1);
  return Object.entries(kinds).map(([kind, seconds]) => `<div class="kind-row">
    <span class="kind-label">${t(`stats.kind.${kind}`)}</span>
    <span class="kind-bar" aria-hidden="true"><span style="width:${(seconds / max) * 100}%"></span></span>
    <span class="kind-value">${seconds ? formatDuration(seconds) : "–"}</span>
  </div>`).join("");
}

function programCard(p) {
  const c = programContent(p.program.id);
  return `<article class="card program-progress" style="--pc:${p.program.color}">
    <header>
      <span class="med-program-icon" aria-hidden="true">${p.program.icon}</span>
      <div>
        <h3>${esc(c.title)}</h3>
        <p class="hint">${t("stats.programDone", { done: p.completed, total: p.total })}</p>
      </div>
      <strong class="program-pct">${fmt.percent(p.ratio)}</strong>
    </header>
    <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.completed}"
      aria-label="${esc(c.title)}"><span style="width:${p.ratio * 100}%"></span></div>
    <p class="hint">${t("stats.listened", { time: formatDuration(p.seconds) })}</p>
    <ol class="session-steps">${p.sessions.map((s, k) => {
      const title = sessionContent(s.id).title;
      return `<li class="${s.completed ? "is-done" : ""}">
        <span class="step-dot" aria-hidden="true">${s.completed ? "✓" : k + 1}</span>
        <span class="step-title">${esc(title)}</span>
        ${s.times > 1 ? `<span class="hint">×${s.times}</span>` : ""}
      </li>`;
    }).join("")}</ol>
  </article>`;
}

export const meditationStatsPage = {
  id: "medstats",
  parent: "meditation",

  title: () => t("stats.title"),

  render({ repo, today, statsPeriod = "week", statsOffset = 0 }) {
    const items = repo.all();
    const series = periodSeries(items, statsPeriod, today, statsOffset);
    const inPeriod = meditationLog(items).filter((i) => i.date >= series.from && i.date <= series.to);
    const days = new Set(inPeriod.map((i) => i.date)).size;
    const bestKey = statsPeriod === "year" ? "stats.bestMonth" : "stats.bestDay";
    const bestIndex = series.best ? series.bars.indexOf(series.best) : -1;

    return `<section class="page medstats-page">
      <div class="card stats-card">
        <nav class="segmented stats-periods" aria-label="${esc(t("nav.views"))}">
          ${PERIODS.map((p) => `<button type="button" data-action="stats-period" data-period="${p}"
            class="${p === statsPeriod ? "active" : ""}" aria-pressed="${p === statsPeriod}">${t(`view.${p}`)}</button>`).join("")}
        </nav>
        <div class="stats-nav">
          <button type="button" class="icon-btn" data-action="stats-shift" data-step="1" aria-label="${esc(t("nav.prev"))}">‹</button>
          <h2>${esc(periodLabel(series))}</h2>
          <button type="button" class="icon-btn" data-action="stats-shift" data-step="-1" aria-label="${esc(t("nav.next"))}"
            ${statsOffset === 0 ? "disabled" : ""}>›</button>
        </div>

        <div class="stats-hero">
          <div><span class="hero-number">${esc(formatDuration(series.total))}</span><span class="hint">${t("stats.total")}</span></div>
          <div><span class="hero-small">${inPeriod.length}</span><span class="hint">${t("stats.sessions", { count: inPeriod.length })}</span></div>
          <div><span class="hero-small">${days}</span><span class="hint">${t("stats.days", { count: days })}</span></div>
        </div>

        ${series.total
          ? `${barChart(series)}
            <p class="stats-readout" data-role="readout" aria-live="polite">${series.best
              ? esc(t(bestKey, { label: barTitle(series, series.best, bestIndex) }))
              : ""}</p>
            <p class="hint small">${t("stats.tapHint")}</p>`
          : `<p class="empty-msg small">${t("stats.empty")}</p>`}
      </div>

      ${series.total ? `<div class="card">
        <h2>${t("stats.byKind")}</h2>
        ${kindRows(series, items)}
      </div>` : ""}

      <h2 class="section-title">${t("stats.programs")}</h2>
      ${programProgress(items).map(programCard).join("")}
    </section>`;
  },
};
