// Page « Santé » : réactions aux aliments. Trois onglets :
//   Journal   — « Je réagis maintenant », repas notés, réactions de chaque repas
//   Aliments  — à privilégier / à limiter / à éviter, avec le statut personnel de chacun
//   Programme — 3 phases : observer, calmer, réintroduire (un aliment à la fois)
// Couleurs des documents Maxxam. Aucun avis médical.

import { addDays, parseISODate, toISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import {
  DRINK_CATEGORIES, GROUPS, LEVELS, MEAL_KINDS, WHERE, drinkOptions, currentPhase, currentTest, foodStats, frequentFoods, journal, mealKindAt, ongoingReaction, programPhases, reactionEnd, toTest, weekSummary,
} from "../../health/health.js";
import { fmt, t } from "../../i18n/index.js";

const TABS = ["journal", "foods", "program"];
const TAB_ICONS = { journal: "📓", foods: "🥦", program: "🗓️" };
const STATUS_ICONS = { ok: "✅", unknown: "❓", react: "❌" };
const WHERE_ICONS = { nose: "👃", mouth: "👄", both: "👃👄" };
const KIND_ICONS = { breakfast: "🥣", lunch: "🥪", dinner: "🍽️", snack: "🍎", drink: "☕" };
const day = (iso) => fmt.longDate(parseISODate(iso));
const short = (iso) => fmt.dayMonth(parseISODate(iso));
const hm = (time) => (time ? fmt.time(time) : "");

function foodChip(food) {
  return `<span class="hl-chip is-${food.level}" title="${esc(t(`health.level.${food.level}`))}">${food.status !== "unknown" ? `${STATUS_ICONS[food.status]} ` : ""}${esc(food.name)}</span>`;
}

function reactionLine(r, ui = {}, meal = null) {
  if (ui.reactionEditing === r.id) return `<li>${reactionForm(meal?.id ?? "", r)}</li>`;
  const end = reactionEnd(r);
  const when = r.time ? `${esc(hm(r.time))} → ${end ? esc(hm(end)) : t("health.ongoing")}` : "";
  return `<li class="hl-reaction">
    <span>${WHERE_ICONS[r.where]} ${t(`health.where.${r.where}`)} · <strong>${r.intensity}/5</strong>${when ? ` · ${when}` : ""}${r.minutes !== null ? ` (${t("health.minutes", { n: r.minutes })})` : r.time ? "" : ` · ${t("health.ongoing")}`}</span>
    <span class="hl-reaction-tools">
      <button type="button" class="btn link" data-action="health-reaction-edit" data-id="${esc(r.id)}">${t("health.edit")}</button>
      <button type="button" class="check-remove" data-action="health-reaction-remove" data-id="${esc(r.id)}" aria-label="${esc(t("health.remove"))}">×</button>
    </span>
  </li>`;
}

// Une boisson du repas : liste déroulante par catégorie (café, thé, jus…) et marque ou produit
function drinkRow(health, d) {
  const options = drinkOptions().filter((o) => health.foods.some((f) => f.id === o.id));
  // Boissons ajoutées par l'utilisateur (groupe « Boissons ») : à la fin
  const own = health.foods.filter((f) => f.group === "drinks" && !options.some((o) => o.id === f.id));
  return `<div class="hl-drink-row">
    <label>${t("health.meal.drinkType")} <select name="drinkType">
      <option value="">${t("health.meal.noDrink")}</option>
      ${DRINK_CATEGORIES.map((c) => `<optgroup label="${esc(t(`health.drinkCat.${c}`))}">${options.filter((o) => o.category === c).map((o) => `<option value="${esc(o.id)}" ${d.foodId === o.id ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</optgroup>`).join("")}
      ${own.length ? `<optgroup label="${esc(t("health.drinkCat.mine"))}">${own.map((f) => `<option value="${esc(f.id)}" ${d.foodId === f.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</optgroup>` : ""}
      <option value="other" ${!d.foodId && d.brand ? "selected" : ""}>${t("health.meal.otherDrink")}</option>
    </select></label>
    <label>${t("health.meal.brand")} <input name="drinkBrand" value="${esc(d.brand)}" autocomplete="off" placeholder="${esc(t("health.meal.brandHint"))}"></label>
  </div>`;
}

// Choix des aliments du repas, comme la liste personnalisée d'épicerie : les plus souvent mangés,
// puis les groupes à ouvrir ; un toucher coche l'aliment ; ajout rapide dans chaque groupe.
function foodPicker(health, picked) {
  const item = (f) => `<label class="hl-pick-item is-${f.level}" data-search="${esc(f.name.toLowerCase())}">
    <input type="checkbox" name="foods" value="${esc(f.id)}" ${picked.has(f.id) ? "checked" : ""}><span>${esc(f.name)}</span></label>`;
  const frequent = frequentFoods(health);
  const names = [...picked].map((id) => health.foods.find((f) => f.id === id)?.name).filter(Boolean);
  return `<div class="hl-picker">
    <p class="hl-picked" data-role="hl-picked">${names.length ? `✓ ${esc(names.join(", "))}` : t("health.meal.noneYet")}</p>
    <input type="search" class="hl-pick-search" data-action="health-pick-filter" placeholder="${esc(t("health.foods.search"))}" autocomplete="off">
    ${frequent.length ? `<details class="hl-group is-frequent" open><summary>⭐ ${t("health.meal.frequent")}</summary>
      <div class="hl-pick-list">${frequent.map((f) => item(f)).join("")}</div></details>` : ""}
    ${GROUPS.map((g) => [g, health.foods.filter((f) => f.group === g)]).filter(([, list]) => list.length).map(([g, list]) => {
      const n = list.filter((f) => picked.has(f.id)).length;
      return `<details class="hl-group" data-group="${g}" ${n ? "open" : ""}>
        <summary><span>${t(`health.group.${g}`)}</span><span class="hint hl-group-count">${n ? `✓ ${n} · ` : ""}${list.length}</span></summary>
        <div class="hl-pick-list">${list.map(item).join("")}</div>
        <div class="hl-pick-add">
          <input data-role="hl-new-food" data-group="${g}" placeholder="${esc(t("health.meal.newFood"))}" autocomplete="off">
          <button type="button" class="btn soft" data-action="health-pick-add" data-group="${g}">＋ ${t("health.foods.addButton")}</button>
        </div>
      </details>`;
    }).join("")}
  </div>`;
}

function mealForm(health, meal, today, now, draft = null) {
  const base = meal ?? { date: today, time: now, kind: mealKindAt(now), foods: [], text: "", drink: "", spicy: false, hot: false, note: "" };
  // Brouillon : ce qui était déjà saisi quand on ajoute un aliment à la liste en cours de route
  const m = draft && draft.mealId === (meal?.id ?? "") ? { ...base, ...draft } : base;
  const picked = new Set(m.foods);
  return `<form class="form hl-form" data-role="health-meal" data-id="${esc(meal?.id ?? "")}">
    <div class="row">
      <label>${t("health.meal.date")} <input name="date" type="date" value="${esc(m.date)}" max="${today}" required></label>
      <label>${t("health.meal.start")} <input name="time" type="time" value="${esc(m.time)}"></label>
      <label>${t("health.meal.kind")} <select name="kind">${MEAL_KINDS.map((k) => `<option value="${k}" ${m.kind === k ? "selected" : ""}>${KIND_ICONS[k]} ${t(`health.kind.${k}`)}</option>`).join("")}</select></label>
    </div>
    <label>${t("health.meal.text")} <input name="text" value="${esc(m.text)}" autocomplete="off" placeholder="${esc(t("health.meal.textHint"))}"></label>
    <fieldset class="hl-drinks"><legend>${t("health.meal.drinks")}</legend>
      ${(m.drinks?.length ? m.drinks : [{ foodId: "", brand: "" }]).map((d) => drinkRow(health, d)).join("")}
      <button type="button" class="btn soft hl-drink-more" data-action="health-drink-add">＋ ${t("health.meal.anotherDrink")}</button>
      ${m.drink ? `<p class="hint">${t("health.meal.oldDrink", { drink: m.drink })}</p><input type="hidden" name="drink" value="${esc(m.drink)}">` : ""}
    </fieldset>
    <div class="hl-flags">
      <label><input type="checkbox" name="spicy" ${m.spicy ? "checked" : ""}> 🌶️ ${t("health.meal.spicy")}</label>
      <label><input type="checkbox" name="hot" ${m.hot ? "checked" : ""}> 🔥 ${t("health.meal.hot")}</label>
      <label><input type="checkbox" name="calm" ${m.calm ? "checked" : ""}> ✅ ${t("health.meal.calm")}</label>
    </div>
    <fieldset class="hl-foods-field"><legend>${t("health.meal.foods")}</legend>${foodPicker(health, picked)}</fieldset>
    <p class="hint">${t("health.meal.autoHint")}</p>
    <label>${t("health.meal.note")} <textarea name="note" rows="2">${esc(m.note)}</textarea></label>
    <div class="actions start">
      <button type="submit" class="btn primary">${t("health.save")}</button>
      <button type="button" class="btn ghost" data-action="health-cancel">${t("form.cancel")}</button>
      ${meal ? `<button type="button" class="btn danger" data-action="health-meal-remove" data-id="${esc(meal.id)}">${t("health.remove")}</button>` : ""}
    </div>
  </form>`;
}

function reactionForm(mealId, r = null, mealTime = "") {
  const start = r?.time ?? mealTime;
  const end = r ? reactionEnd(r) ?? "" : "";
  return `<form class="form hl-react-form" data-role="health-reaction" data-meal="${esc(mealId)}" data-id="${esc(r?.id ?? "")}">
    <div class="row">
      <label>${t("health.react.where")} <select name="where">${WHERE.map((w) => `<option value="${w}" ${(r?.where ?? "nose") === w ? "selected" : ""}>${WHERE_ICONS[w]} ${t(`health.where.${w}`)}</option>`).join("")}</select></label>
      <label>${t("health.react.intensity")} <select name="intensity">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${(r?.intensity ?? 3) === n ? "selected" : ""}>${n}/5</option>`).join("")}</select></label>
    </div>
    <div class="row">
      <label>${t("health.react.start")} <input name="start" type="time" value="${esc(start)}" required></label>
      <label>${t("health.react.end")} <input name="end" type="time" value="${esc(end)}"></label>
    </div>
    <div class="actions start">
      <button type="submit" class="btn primary">${t("health.save")}</button>
      <button type="button" class="btn ghost" data-action="health-cancel">${t("form.cancel")}</button>
    </div>
  </form>`;
}

function ongoingCard(r, now) {
  const since = Math.max(0, (Number(now.slice(0, 2)) * 60 + Number(now.slice(3))) - (Number(r.time.slice(0, 2)) * 60 + Number(r.time.slice(3))));
  return `<section class="hl-ongoing" aria-live="polite">
    <h2>😮‍💨 ${t("health.ongoingTitle", { time: hm(r.time), n: since })}</h2>
    <label class="hl-start-edit">${t("health.react.start")} <input type="time" data-action="health-react-start" data-id="${esc(r.id)}" value="${esc(r.time)}"></label>
    <div class="hl-choice" role="group" aria-label="${esc(t("health.react.where"))}">${WHERE.map((w) => `<button type="button" class="${r.where === w ? "active" : ""}" aria-pressed="${r.where === w}"
      data-action="health-react-set" data-id="${esc(r.id)}" data-field="where" data-value="${w}">${WHERE_ICONS[w]} ${t(`health.where.${w}`)}</button>`).join("")}</div>
    <div class="hl-choice is-scale" role="group" aria-label="${esc(t("health.react.intensity"))}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${r.intensity === n ? "active" : ""}" aria-pressed="${r.intensity === n}"
      data-action="health-react-set" data-id="${esc(r.id)}" data-field="intensity" data-value="${n}">${n}</button>`).join("")}</div>
    <p class="hint">${t("health.scaleHint")}</p>
    <button type="button" class="btn primary hl-stop" data-action="health-react-stop" data-id="${esc(r.id)}">⏹ ${t("health.stop")}</button>
  </section>`;
}

function journalTab(health, ui, today, now) {
  const ongoing = ongoingReaction(health, today, now);
  const w = weekSummary(health, today);
  const days = journal(health, today, 14);
  return `${ongoing ? ongoingCard(ongoing, now) : ""}
    <div class="hl-actions">
      <button type="button" class="btn hl-react-now" data-action="health-react-now">😮‍💨 ${t("health.reactNow")}</button>
      <button type="button" class="btn primary" data-action="health-meal-new">🍽️ ${t("health.addMeal")}</button>
    </div>
    ${ui.editing === "new-meal" ? mealForm(health, null, today, now, ui.draft) : ""}
    <section class="hl-summary">
      <div><span class="hl-value">${w.meals}</span><span>${t("health.sum.meals")}</span></div>
      <div><span class="hl-value">${w.calm}</span><span>${t("health.sum.calm")}</span></div>
      <div><span class="hl-value">${w.reactions}</span><span>${t("health.sum.reactions")}</span></div>
      <div><span class="hl-value">${w.intensity ?? "–"}</span><span>${t("health.sum.intensity")}</span></div>
      <div><span class="hl-value">${w.minutes ?? "–"}</span><span>${t("health.sum.minutes")}</span></div>
    </section>
    ${days.length ? days.map((d) => `<section class="hl-day">
      <h2>${esc(day(d.date))}</h2>
      <ul class="hl-meals">${d.meals.map(({ meal: m, reactions }) => ui.editing === m.id ? `<li class="hl-meal is-editing">${mealForm(health, m, today, now, ui.draft)}</li>` : `<li class="hl-meal ${reactions.length ? "has-reaction" : m.calm ? "is-calm" : ""}">
        <div class="hl-meal-head"><strong>${KIND_ICONS[m.kind]} ${t(`health.kind.${m.kind}`)}</strong><span class="hint">${esc(hm(m.time))}${m.spicy ? " · 🌶️" : ""}${m.hot ? " · 🔥" : ""}</span></div>
        ${m.foods.length ? `<div class="hl-chips">${m.foods.map((id) => health.foods.find((f) => f.id === id)).filter(Boolean).map(foodChip).join("")}</div>` : ""}
        ${m.text ? `<p>${esc(m.text)}</p>` : ""}${m.drinks?.length ? `<p class="hl-drink-line">🥤 ${m.drinks.map((d) => {
          const f = health.foods.find((x) => x.id === d.foodId);
          return `<span class="hl-chip is-${f?.level ?? "limit"}">${esc(f ? f.name : d.brand)}${f && d.brand ? ` — ${esc(d.brand)}` : ""}</span>`;
        }).join(" ")}</p>` : ""}${m.drink ? `<p class="hint">☕ ${esc(m.drink)}</p>` : ""}${m.note ? `<p class="hint">📝 ${esc(m.note)}</p>` : ""}
        ${reactions.length ? `<ul class="hl-reactions">${reactions.map((r) => reactionLine(r, ui, m)).join("")}</ul>`
          : m.calm ? `<p class="hl-calm">✅ ${t("health.calm")} <button type="button" class="btn link" data-action="health-meal-calm" data-id="${esc(m.id)}" data-value="false">${t("health.undo")}</button></p>`
          : `<p class="hint">${t("health.noReactionYet")}</p>`}
        ${ui.reacting === m.id ? reactionForm(m.id, null, m.time) : ""}
        <div class="actions start">
          ${!reactions.length && !m.calm ? `<button type="button" class="btn hl-calm-btn" data-action="health-meal-calm" data-id="${esc(m.id)}" data-value="true">✅ ${t("health.calm")}</button>` : ""}
          <button type="button" class="btn soft" data-action="health-reaction-new" data-id="${esc(m.id)}">＋ ${t("health.addReaction")}</button>
          <button type="button" class="btn link" data-action="health-meal-edit" data-id="${esc(m.id)}">${t("health.edit")}</button>
        </div>
      </li>`).join("")}</ul>
      ${d.loose.length ? `<ul class="hl-reactions is-loose">${d.loose.map((r) => reactionLine(r, ui)).join("")}</ul>` : ""}
    </section>`).join("") : `<p class="hl-empty">${t("health.emptyJournal")}</p>`}`;
}

function foodsTab(health) {
  const stats = foodStats(health);
  const statLine = (f) => {
    const s = stats.get(f.id);
    if (!s) return "";
    return `<span class="hl-stats" title="${esc(t("health.stats.title"))}">🍽️ ${s.eaten} · ✅ ${s.calm} · 😮‍💨 ${s.reacted}</span>
      ${s.hint && f.status === "unknown" ? `<span class="hl-hint-badge is-${s.hint}">${t(`health.stats.${s.hint}`)}</span>` : ""}`;
  };
  return `<div class="hl-food-tools">
      <input type="search" class="hl-food-search" data-action="health-food-filter" placeholder="${esc(t("health.foods.search"))}" autocomplete="off">
      <p class="hint">${t("health.foods.legend")}</p>
      <p class="hint">${t("health.stats.legend")}</p>
    </div>
    ${LEVELS.map((level) => `<section class="hl-level is-${level}">
      <h2>${t(`health.level.${level}`)}</h2>
      <p class="hint">${t(`health.levelHint.${level}`)}</p>
      <ul class="hl-foods">${health.foods.filter((f) => f.level === level).map((f) => `<li class="hl-food is-${f.status}" data-search="${esc(f.name.toLowerCase())}">
        <span class="hl-food-name">${esc(f.name)} <span class="hint">· ${t(`health.group.${f.group}`)}</span>${statLine(f)}</span>
        <span class="hl-choice is-small" role="group" aria-label="${esc(f.name)}">${["ok", "unknown", "react"].map((s) => `<button type="button" class="${f.status === s ? "active" : ""}" aria-pressed="${f.status === s}"
          data-action="health-food-status" data-id="${esc(f.id)}" data-value="${s}" title="${esc(t(`health.status.${s}`))}">${STATUS_ICONS[s]}</button>`).join("")}</span>
        <button type="button" class="hl-icon" data-action="health-food-list" data-id="${esc(f.id)}" aria-label="${esc(t("health.toList"))}" title="${esc(t("health.toList"))}">🛒</button>
        <button type="button" class="check-remove" data-action="health-food-remove" data-id="${esc(f.id)}" aria-label="${esc(t("health.remove"))}">×</button>
      </li>`).join("")}</ul>
    </section>`).join("")}
    <form class="form hl-form" data-role="health-food">
      <h2>＋ ${t("health.foods.add")}</h2>
      <div class="row">
        <label>${t("health.foods.name")} <input name="name" required autocomplete="off"></label>
        <label>${t("health.foods.level")} <select name="level">${LEVELS.map((l) => `<option value="${l}" ${l === "limit" ? "selected" : ""}>${t(`health.level.${l}`)}</option>`).join("")}</select></label>
        <label>${t("health.foods.group")} <select name="group">${GROUPS.map((g) => `<option value="${g}" ${g === "other" ? "selected" : ""}>${t(`health.group.${g}`)}</option>`).join("")}</select></label>
      </div>
      <div class="actions start"><button type="submit" class="btn primary">${t("health.foods.addButton")}</button></div>
    </form>`;
}

function programTab(health, today) {
  const p = health.program;
  const tips = [1, 2, 3, 4, 5].map((n) => `<li>${t(`health.tip.${n}`)}</li>`).join("");
  if (!p.start) {
    return `<section class="hl-intro">
        <h2>${t("health.program.title")}</h2>
        <ol class="hl-phases">${["observe", "calm", "reintro"].map((id) => `<li><strong>${t(`health.phase.${id}`)}</strong><span>${t(`health.phaseHint.${id}`)}</span></li>`).join("")}</ol>
        <form class="form hl-start" data-role="health-start">
          <label>${t("health.program.startDate")} <input name="start" type="date" value="${today}" required></label>
          <button type="submit" class="btn primary">▶ ${t("health.program.start")}</button>
        </form>
      </section>
      <section class="hl-tips"><h2>${t("health.tips")}</h2><ul>${tips}</ul></section>`;
  }
  const phases = programPhases(p);
  const now = currentPhase(p, today);
  const test = currentTest(health);
  const testFood = test && health.foods.find((f) => f.id === test.foodId);
  const candidates = toTest(health);
  const done = p.tests.filter((x) => x.result);
  const dayN = test ? Math.round((parseISODate(today) - parseISODate(test.start)) / 86400000) + 1 : 0;
  const testEnd = test ? toISODate(addDays(parseISODate(test.start), p.testDays - 1)) : null;
  return `<ol class="hl-phases is-timeline">${phases.map((ph) => {
      const state = ph.id === now?.id && !now.upcoming ? "current" : ph.to && ph.to < today ? "done" : "next";
      return `<li class="is-${state}"><strong>${t(`health.phase.${ph.id}`)}</strong>
        <span class="hint">${esc(short(ph.from))}${ph.to ? ` → ${esc(short(ph.to))}` : ` → …`} · ${t(`health.state.${state}`)}</span>
        <span>${t(`health.phaseHint.${ph.id}`)}</span></li>`;
    }).join("")}</ol>
    ${now?.id === "calm" ? `<section class="hl-now"><h2>${t("health.program.avoidNow")}</h2>
      <div class="hl-chips">${health.foods.filter((f) => f.level === "avoid" && f.status !== "ok").map(foodChip).join("")}</div></section>` : ""}
    ${now?.id === "reintro" ? `<section class="hl-now">
      <h2>${t("health.program.reintro")}</h2>
      ${testFood ? `<div class="hl-test">
          <p>${t("health.program.testing", { food: testFood.name, n: Math.min(dayN, p.testDays), total: p.testDays, end: short(testEnd) })}</p>
          <p class="hint">${t("health.program.testHint")}</p>
          <div class="actions start">
            <button type="button" class="btn primary" data-action="health-test-result" data-value="ok">✅ ${t("health.program.tolerated")}</button>
            <button type="button" class="btn hl-react-now" data-action="health-test-result" data-value="react">❌ ${t("health.program.reacted")}</button>
          </div>
        </div>`
        : candidates.length ? `<form class="form hl-start" data-role="health-test">
          <label>${t("health.program.next")} <select name="food">${candidates.map((f) => `<option value="${esc(f.id)}">${esc(f.name)} (${t(`health.level.${f.level}`)})</option>`).join("")}</select></label>
          <button type="submit" class="btn primary">▶ ${t("health.program.startTest")}</button>
        </form>` : `<p>${t("health.program.allTested")}</p>`}
      ${done.length ? `<ul class="hl-tested">${done.map((x) => {
        const f = health.foods.find((y) => y.id === x.foodId);
        return f ? `<li>${STATUS_ICONS[x.result]} ${esc(f.name)} <span class="hint">· ${esc(short(x.start))}</span></li>` : "";
      }).join("")}</ul>` : ""}
    </section>` : ""}
    <section class="hl-tips"><h2>${t("health.tips")}</h2><ul>${tips}</ul></section>
    <div class="actions start"><button type="button" class="btn link" data-action="health-program-stop">${t("health.program.stop")}</button></div>`;
}

export const healthPage = {
  id: "health",
  title: () => t("nav.health"),
  render({ repo, today, healthUi = {} }) {
    const health = repo.health();
    const tab = TABS.includes(healthUi.tab) ? healthUi.tab : "journal";
    const d = new Date();
    const now = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const body = tab === "foods" ? foodsTab(health) : tab === "program" ? programTab(health, today) : journalTab(health, healthUi, today, now);
    return `<div class="page health">
      <nav class="segmented hl-tabs" aria-label="${esc(t("nav.health"))}">${TABS.map((x) => `<button type="button" data-action="health-tab" data-tab="${x}"
        class="${x === tab ? "active" : ""}" aria-pressed="${x === tab}">${TAB_ICONS[x]} ${t(`health.tab.${x}`)}</button>`).join("")}</nav>
      ${body}
      <details class="hl-disclaimer"><summary>⚕️ ${t("health.disclaimer")}</summary><p>${t("health.redFlags")}</p></details>
    </div>`;
  },
};
