// Page « Mes commissions » : toutes les listes à acheter au même endroit.

import { getModule } from "../../config/modules.js";
import { parseISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { getChecklist, pending } from "../../data/checklist.js";
import { isCancelled } from "../../data/item.js";
import { fmt, t } from "../../i18n/index.js";
import { checklistSection } from "../components/item-detail.js";

const PAST_LISTS = 8;

const when = (item) => `${fmt.longDate(parseISODate(item.date))}${item.time ? ` · ${fmt.time(item.time)}` : ""}`;

function listCard(item) {
  const m = getModule(item.module);
  const left = pending(getChecklist(item)).length;
  return `<article class="card list-card" style="--c:${m.color}">
    <header class="list-head">
      <div>
        <h2>${esc(item.title)}</h2>
        <p class="hint">📅 ${esc(when(item))}${item.place ? ` · 📍 ${esc(item.place)}` : ""}</p>
      </div>
      <button type="button" class="btn link" data-action="edit-item" data-id="${esc(item.id)}">${t("detail.edit")}</button>
    </header>
    ${left ? `<p class="list-left">${t("shopping.left", { count: left })}</p>` : ""}
    ${checklistSection(item)}
    <div class="actions start">
      <button type="button" class="btn soft" data-action="toggle-done" data-id="${esc(item.id)}">✓ ${t("shopping.finish")}</button>
    </div>
  </article>`;
}

export const shoppingPage = {
  id: "shopping",

  title: () => t("nav.shopping"),

  render({ repo }) {
    const lists = repo.all().filter((i) => i.module === "commission" && !i.recurrence && !isCancelled(i));
    const active = lists.filter((i) => !i.done).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    const done = lists.filter((i) => i.done).sort((a, b) => b.date.localeCompare(a.date)).slice(0, PAST_LISTS);

    return `<section class="page lists">
      ${active.length ? active.map(listCard).join("") : `<p class="empty-msg">${t("shopping.empty")}</p>
        <div class="actions center"><button type="button" class="btn primary" data-action="new-item" data-module="commission">🛒 ${t("shopping.add")}</button></div>`}
      ${done.length ? `<h2 class="section-title">${t("shopping.done")}</h2>
        <div class="card past-list">${done.map((i) => `<button type="button" class="past-row" data-action="open-item" data-id="${esc(i.id)}">
          <span>✓ ${esc(i.title)}</span><span class="hint">${esc(fmt.date(parseISODate(i.date)))}</span>
        </button>`).join("")}</div>` : ""}
    </section>`;
  },
};
