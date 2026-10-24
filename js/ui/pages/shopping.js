// Page « Mes commissions », en trois onglets :
//  - Liste d'épicerie : regroupée par épicerie la moins chère (prix au kg, au L, à l'unité)
//  - Carnet de prix : les prix notés, la recherche « où est-ce le moins cher », mes épiceries
//  - Liste personnalisée : les articles courants par catégorie, à cocher (ils
//    vont dans la liste d'épicerie, visible aussi dans le calendrier) et mes
//    propres articles

import { parseISODate } from "../../core/dates.js";
import { esc } from "../../core/dom.js";
import { fmt, getLanguage, t } from "../../i18n/index.js";
import { catalog, resolveCategory, sortNames } from "../../grocery/catalog.js";
import {
  KG_PER_LB, UNIT_IDS, isExpired, isListed, productKey, isStale, knownProducts, nextFlyerEnd, planList, priceBook, unitPrice,
} from "../../grocery/grocery.js";
import { STORES, flyerUrl, getStore } from "../../grocery/stores.js";

export const SHOPPING_TABS = ["grocery", "prices", "lists"];

// ---- Textes de prix ------------------------------------------------------------

// « 9,90 $/kg · 4,49 $/lb », « 2,75 $/L », « 2,50 $/unité »
export function perText(per) {
  if (per.dim === "mass") return `${fmt.money(per.value)}/kg · ${fmt.money(per.value * KG_PER_LB)}/lb`;
  if (per.dim === "volume") return `${fmt.money(per.value)}/L`;
  return `${fmt.money(per.value)}${t("grocery.perUnit")}`;
}

const qtyText = (p) => (p.unit === "unit" ? t("grocery.units", { count: p.qty }) : `${fmt.decimal(p.qty)} ${p.unit}`);

// « 3,49 $ pour 450 g · rabais jusqu'au 28 oct. »
function detailText(p, today) {
  const parts = [t("grocery.priceFor", { price: fmt.money(p.price), qty: qtyText(p) })];
  if (p.deal && p.until) parts.push(isExpired(p, today) ? t("grocery.expired") : t("grocery.dealUntil", { date: fmt.dayMonth(parseISODate(p.until)) }));
  if (isStale(p, today)) parts.push(t("grocery.old"));
  return parts.join(" · ");
}

const storeName = (id) => getStore(id)?.name ?? id;
const dot = (store) => `<span class="store-dot" style="--c:${getStore(store)?.color ?? "#999"}" aria-hidden="true"></span>`;

// ---- Onglets -------------------------------------------------------------------

function tabs(current) {
  return `<nav class="segmented tabs no-print" aria-label="${esc(t("nav.shopping"))}">
    ${SHOPPING_TABS.map((tab) => `<button type="button" data-action="shopping-tab" data-tab="${tab}"
      class="${tab === current ? "active" : ""}" aria-pressed="${tab === current}">${t(`grocery.tab.${tab}`)}</button>`).join("")}
  </nav>`;
}

const productList = (grocery) =>
  `<datalist id="grocery-products">${knownProducts(grocery).map((p) => `<option value="${esc(p)}"></option>`).join("")}</datalist>`;

// ---- Liste d'épicerie ------------------------------------------------------------

function compareList(rows) {
  return `<details class="g-compare no-print"><summary>${t("grocery.compare", { count: rows.length })}</summary>
    <ol>${rows.map((r, k) => `<li class="${k === 0 ? "is-best" : ""}">${dot(r.store)}<span>${esc(storeName(r.store))}</span>
      <strong>${esc(perText(r.per))}</strong></li>`).join("")}</ol>
  </details>`;
}

function groceryRow({ entry, best, next, rows }, today) {
  const saving = best && next ? next.per.value - best.per.value : 0;
  return `<li class="${entry.done ? "is-checked" : ""}">
    <label class="check-row">
      <input type="checkbox" data-action="grocery-toggle" data-entry="${esc(entry.id)}" ${entry.done ? "checked" : ""}>
      <span class="g-name">${esc(entry.product)}${entry.qty ? ` <span class="hint">(${esc(entry.qty)})</span>` : ""}</span>
    </label>
    ${best ? `<span class="g-price"><strong>${esc(perText(best.per))}</strong>
      <small>${esc(detailText(best, today))}</small>
      ${saving > 0.005 ? `<small class="g-save">${esc(t("grocery.cheaper", { amount: perText({ ...best.per, value: saving }).split(" · ")[0], store: storeName(next.store) }))}</small>` : ""}
    </span>` : `<button type="button" class="btn link no-print" data-action="grocery-price" data-product="${esc(entry.product)}">${t("grocery.addPrice")}</button>`}
    <button type="button" class="check-remove no-print" data-action="grocery-remove" data-entry="${esc(entry.id)}"
      aria-label="${esc(t("grocery.remove", { name: entry.product }))}">×</button>
    ${rows.length > 1 ? compareList(rows) : ""}
  </li>`;
}

function storeGroup(store, lines, today) {
  const s = getStore(store);
  const left = lines.filter((l) => !l.entry.done).length;
  return `<article class="card store-group" style="--c:${s.color}">
    <header class="store-head">
      ${dot(store)}<h2>${esc(s.name)}</h2>
      ${left ? `<span class="hint">${t("grocery.itemsLeft", { count: left })}</span>` : `<span class="hint">✓</span>`}
      <a class="btn link no-print" href="${flyerUrl(s)}" target="_blank" rel="noopener">${t("grocery.flyer")} ↗</a>
    </header>
    <ul class="grocery-list">${lines.map((l) => groceryRow(l, today)).join("")}</ul>
  </article>`;
}

function groceryTab(grocery, today) {
  const plan = planList(grocery, today);
  const total = grocery.list.length;
  return `${productList(grocery)}
    <p class="print-only print-title">${t("grocery.tab.grocery")} · ${esc(fmt.longDate(parseISODate(today)))}</p>
    <form class="card grocery-add no-print" data-role="grocery-add">
      <input name="product" list="grocery-products" placeholder="${esc(t("grocery.productPlaceholder"))}"
        aria-label="${esc(t("grocery.form.product"))}" autocomplete="off" required>
      <input name="qty" class="g-qty" placeholder="${esc(t("grocery.qtyPlaceholder"))}" aria-label="${esc(t("grocery.qtyPlaceholder"))}" autocomplete="off">
      <button type="submit" class="btn primary">${t("checklist.add")}</button>
    </form>
    ${total ? `<div class="grocery-tools no-print">
        <span class="hint">${t("grocery.summary", { count: total })} · ${t("grocery.storesCount", { count: plan.groups.length })}</span>
        <div class="actions start">
          <button type="button" class="btn soft" data-action="grocery-print">🖨️ ${t("grocery.print")}</button>
          ${grocery.list.some((e) => e.done) ? `<button type="button" class="btn soft" data-action="grocery-clear">${t("grocery.clearDone")}</button>` : ""}
        </div>
      </div>
      ${plan.groups.map((g) => storeGroup(g.store, g.entries, today)).join("")}
      ${plan.unknown.length ? `<article class="card store-group unknown">
        <header class="store-head"><h2>${t("grocery.unknown")}</h2><span class="hint no-print">${t("grocery.unknownHint")}</span></header>
        <ul class="grocery-list">${plan.unknown.map((l) => groceryRow(l, today)).join("")}</ul>
      </article>` : ""}`
    : `<p class="empty-msg">${t("grocery.empty")}</p>`}`;
}

// ---- Carnet de prix ------------------------------------------------------------

function priceRow(p, today, best) {
  return `<li class="${best ? "is-best" : ""} ${isExpired(p, today) ? "is-expired" : ""}">
    ${dot(p.store)}
    <span class="pr-store"><span>${esc(storeName(p.store))}</span>${best ? `<span class="badge-best">${t("grocery.best")}</span>` : ""}</span>
    <span class="pr-price"><strong>${esc(perText(unitPrice(p)))}</strong><small>${esc(detailText(p, today))}</small></span>
    <button type="button" class="check-remove" data-action="grocery-price-remove" data-id="${esc(p.id)}"
      aria-label="${esc(t("grocery.removePrice"))}">×</button>
  </li>`;
}

function productCard(book, today, inList) {
  const shown = new Set(book.rows.map((r) => r.id));
  const others = book.all.filter((p) => !shown.has(p.id));
  return `<article class="card price-card" data-key="${esc(book.key)}">
    <header class="store-head">
      <h3>${esc(book.product)}</h3>
      ${inList ? `<span class="hint">✓ ${t("grocery.inList")}</span>`
        : `<button type="button" class="btn link" data-action="grocery-add-product" data-product="${esc(book.product)}">+ ${t("grocery.toList")}</button>`}
    </header>
    ${book.rows.length ? `<ul class="price-rows">${book.rows.map((p, k) => priceRow(p, today, k === 0 && book.rows.length > 1)).join("")}</ul>` : ""}
    ${others.length ? `<details class="g-compare"><summary>${t("grocery.otherPrices", { count: others.length })}</summary>
      <ul class="price-rows">${others.map((p) => priceRow({ ...p }, today, false)).join("")}</ul></details>` : ""}
  </article>`;
}

function priceForm(grocery, today, { prefill, store }) {
  const stores = STORES.filter((s) => grocery.stores.includes(s.id));
  const chosen = stores.some((s) => s.id === store) ? store : stores[0]?.id;
  return `<form class="card form price-form" data-role="price-add" novalidate>
    <h2>${t("grocery.form.title")}</h2>
    <label>${t("grocery.form.product")}
      <input name="product" list="grocery-products" value="${esc(prefill ?? "")}" autocomplete="off" required
        placeholder="${esc(t("grocery.productPlaceholder"))}">
    </label>
    <div class="row">
      <label>${t("grocery.form.store")}
        <select name="store">${stores.map((s) => `<option value="${s.id}" ${s.id === chosen ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
      </label>
      <label>${t("grocery.form.price")} <input name="price" inputmode="decimal" autocomplete="off" required placeholder="4,99"></label>
    </div>
    <div class="row">
      <label>${t("grocery.form.for")} <input name="qty" inputmode="decimal" value="1" autocomplete="off" required></label>
      <label>${t("grocery.form.unit")}
        <select name="unit">${UNIT_IDS.map((u) => `<option value="${u}" ${u === "lb" ? "selected" : ""}>${t(`grocery.unit.${u}`)}</option>`).join("")}</select>
      </label>
    </div>
    <label class="switch"><input type="checkbox" name="deal" data-action="grocery-deal" checked><span>${t("grocery.form.deal")}</span></label>
    <label data-role="until">${t("grocery.form.until")} <input type="date" name="until" value="${nextFlyerEnd(today)}"></label>
    <p class="hint">${t("grocery.form.hint")}</p>
    <p class="form-errors" data-role="errors" role="alert"></p>
    <div class="actions"><button type="submit" class="btn primary">${t("grocery.form.save")}</button></div>
  </form>`;
}

function storesCard(grocery) {
  return `<article class="card">
    <h2>${t("grocery.stores")}</h2>
    <p class="hint">${t("grocery.storesHint")}</p>
    <ul class="store-list">${STORES.map((s) => `<li>
      <label class="check-row"><input type="checkbox" data-action="grocery-store" value="${s.id}" ${grocery.stores.includes(s.id) ? "checked" : ""}>
        ${dot(s.id)}<span>${esc(s.name)}</span></label>
      <a class="btn link" href="${flyerUrl(s)}" target="_blank" rel="noopener">${t("grocery.flyer")} ↗</a>
    </li>`).join("")}</ul>
    <p class="hint">${t("grocery.weekHint")}</p>
  </article>`;
}

function pricesTab(grocery, today, options) {
  const book = priceBook(grocery, today);
  const listed = new Set(grocery.list.filter((e) => !e.done).map((e) => e.key));
  return `${productList(grocery)}
    ${priceForm(grocery, today, options)}
    ${book.length ? `<input type="search" class="grocery-search" data-role="grocery-search" placeholder="${esc(t("grocery.search"))}"
        aria-label="${esc(t("grocery.search"))}" autocomplete="off">
      ${book.map((b) => productCard(b, today, listed.has(b.key))).join("")}
      <p class="empty-msg small" data-role="no-match" hidden>${t("grocery.noMatch")}</p>`
    : `<p class="empty-msg small">${t("grocery.noPrices")}</p>`}
    ${storesCard(grocery)}`;
}

// ---- Liste personnalisée : catalogue à cocher -------------------------------------

function catalogItem(name, list, customId = null) {
  const on = isListed(list, name);
  return `<li class="catalog-item ${on ? "is-on" : ""}">
    <label><input type="checkbox" data-action="catalog-toggle" data-name="${esc(name)}" ${on ? "checked" : ""}><span>${esc(name)}</span></label>
    ${customId ? `<button type="button" class="check-remove" data-action="catalog-remove" data-id="${esc(customId)}"
      aria-label="${esc(t("grocery.remove", { name }))}">×</button>` : ""}
  </li>`;
}

// Catégories ouvertes : `open` (Set d'identifiants), retenu par l'application.
function customTab(repo, open) {
  const grocery = repo.grocery();
  const list = grocery.list;
  const lang = getLanguage();
  const categories = catalog(lang);
  const everywhere = new Set(categories.flatMap((c) => c.items).map(productKey)); // déjà au catalogue
  const checked = list.filter((e) => !e.done).length;
  return `<p class="hint catalog-intro">${t("grocery.custom.intro")}</p>
    <div class="grocery-tools">
      <span class="hint">${t("grocery.custom.checked", { count: checked })}</span>
      <div class="actions start">
        ${checked ? `<button type="button" class="btn soft" data-action="shopping-tab" data-tab="grocery">🧺 ${t("grocery.custom.seeList")}</button>` : ""}
        <button type="button" class="btn soft" data-action="catalog-fold-all" data-open="true">${t("grocery.custom.openAll")}</button>
        <button type="button" class="btn soft" data-action="catalog-fold-all" data-open="false">${t("grocery.custom.closeAll")}</button>
      </div>
    </div>
    <input type="search" class="grocery-search" data-role="catalog-search" placeholder="${esc(t("grocery.custom.search"))}"
      aria-label="${esc(t("grocery.custom.search"))}" autocomplete="off">
    ${categories.map((c) => {
      // Mes articles, mêlés au catalogue (sauf s'ils y sont déjà, dans n'importe
      // quelle catégorie) et triés avec lui.
      const own = grocery.custom.filter((x) => resolveCategory(x.category) === c.id && !everywhere.has(productKey(x.name)));
      const ownId = new Map(own.map((x) => [x.name, x.id]));
      const names = sortNames([...c.items, ...own.map((x) => x.name)], lang);
      const count = names.filter((n) => isListed(list, n)).length;
      const isOpen = open.has(c.id);
      return `<article class="card catalog-cat ${isOpen ? "is-open" : ""}" data-category="${c.id}">
        <h2 class="catalog-head">
          <button type="button" class="catalog-fold" data-action="catalog-fold" data-category="${c.id}"
            aria-expanded="${isOpen}" aria-controls="catalog-${c.id}">
            <span class="catalog-arrow" aria-hidden="true">▸</span>
            <span aria-hidden="true">${c.icon}</span> <span class="catalog-name">${esc(c.name)}</span>
            <span class="hint catalog-count">${count ? `✓ ${count} · ` : ""}${names.length}</span>
          </button>
        </h2>
        <div class="catalog-body" id="catalog-${c.id}" ${isOpen ? "" : "hidden"}>
          <ul class="catalog-grid">${names.map((name) => catalogItem(name, list, ownId.get(name))).join("")}</ul>
          <form class="check-add" data-role="catalog-add" data-category="${c.id}">
            <input name="name" placeholder="${esc(t("grocery.custom.addPlaceholder"))}" aria-label="${esc(t("grocery.custom.addPlaceholder"))} · ${esc(c.name)}" autocomplete="off">
            <button type="submit" class="btn soft">${t("checklist.add")}</button>
          </form>
        </div>
      </article>`;
    }).join("")}
    <p class="empty-msg small" data-role="catalog-no-match" hidden>${t("grocery.noMatch")}</p>`;
}

export const shoppingPage = {
  id: "shopping",

  title: () => t("nav.shopping"),

  render({ repo, today, shoppingTab = "grocery", groceryPrefill = null, lastStore = null, catalogOpen = new Set() }) {
    const grocery = repo.grocery();
    const tab = SHOPPING_TABS.includes(shoppingTab) ? shoppingTab : "grocery";
    return `<section class="page lists">
      ${tabs(tab)}
      ${tab === "grocery" ? groceryTab(grocery, today)
        : tab === "prices" ? pricesTab(grocery, today, { prefill: groceryPrefill, store: lastStore })
        : customTab(repo, catalogOpen)}
    </section>`;
  },
};
