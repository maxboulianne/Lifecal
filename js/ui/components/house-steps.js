// Procédure pas à pas (ex. fermeture de la piscine) : une étape à la fois, avec l'illustration
// générale, la case « faite », puis « Chez moi » : les photos, vidéos et la note de l'utilisateur.

import { esc } from "../../core/dom.js";
import { FIGURES } from "../../house/figures.js";
import { t } from "../../i18n/index.js";

export function mediaTag(m, attrs) {
  return m.type === "video"
    ? `<video data-house-video="${esc(m.id)}" controls playsinline preload="metadata" ${attrs}></video>`
    : `<img data-house-photo="${esc(m.id)}" alt="" ${attrs}>`;
}

export function houseSteps(list, index, done) {
  const total = list.entries.length;
  const i = Math.min(Math.max(0, index), total - 1);
  const e = list.entries[i];
  const ids = `data-list="${esc(list.id)}" data-entry="${esc(e.id)}"`;
  const doneCount = list.entries.filter((x) => done[x.id]).length;
  return `<div class="house-steps">
    <header class="house-steps-head">
      <h2 id="house-steps-title">${esc(list.title)}</h2>
      <p class="hint">${t("house.steps.of", { n: i + 1, total })} · ${t("house.steps.progress", { done: doneCount, total })}</p>
      <div class="house-steps-bar" aria-hidden="true">${list.entries.map((x, k) => `<button type="button" class="${k === i ? "is-current" : ""} ${done[x.id] ? "is-done" : ""}"
        data-action="house-step-go" data-index="${k}" tabindex="-1"></button>`).join("")}</div>
    </header>
    ${e.figure && FIGURES[e.figure] ? `<figure class="house-step-figure">${FIGURES[e.figure]}<figcaption>${t("house.steps.generic")}</figcaption></figure>` : ""}
    <label class="house-step-check ${done[e.id] ? "is-done" : ""}">
      <input type="checkbox" data-action="house-check" ${ids} ${done[e.id] ? "checked" : ""}>
      <span><strong>${i + 1}.</strong> ${esc(e.text)}</span>
    </label>
    <section class="house-step-mine">
      <h3>🏡 ${t("house.steps.mine")}</h3>
      ${e.media.length ? `<div class="house-step-media">${e.media.map((m) => `<span class="house-photo-wrap">${mediaTag(m, 'class="house-step-file"')}
        <button type="button" class="house-photo-remove" data-action="house-step-media-remove" ${ids} data-media="${esc(m.id)}" aria-label="${esc(t("house.remove"))}">×</button></span>`).join("")}</div>`
        : `<p class="hint">${t("house.steps.mineHint")}</p>`}
      <label class="btn soft house-step-add">📷 ${t("house.steps.addMedia")}
        <input type="file" accept="image/*,video/*" multiple data-action="house-step-media" ${ids} hidden></label>
      <label>${t("house.steps.note")}
        <textarea rows="2" data-action="house-step-note" ${ids} placeholder="${esc(t("house.steps.notePlaceholder"))}">${esc(e.note)}</textarea></label>
    </section>
    <div class="actions house-steps-nav">
      <button type="button" class="btn soft" data-action="house-step-go" data-index="${i - 1}" ${i === 0 ? "disabled" : ""}>‹ ${t("house.steps.prev")}</button>
      ${i < total - 1
        ? `<button type="button" class="btn primary" data-action="house-step-go" data-index="${i + 1}">${t("house.steps.next")} ›</button>`
        : `<button type="button" class="btn primary" data-action="close">${t("house.steps.finish")}</button>`}
      <button type="button" class="btn ghost" data-action="close">${t("detail.close")}</button>
    </div>
  </div>`;
}
