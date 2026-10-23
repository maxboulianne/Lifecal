// Dépôt de données : la seule porte d'entrée vers les éléments et les réglages.
// L'interface ne touche jamais au stockage directement.
//
// Les lectures sont synchrones (index en mémoire) pour un rendu rapide ;
// les écritures sont asynchrones et passent par l'adaptateur de stockage.
// Chaque écriture émet "change", ce qui redessine l'interface.

import { Emitter } from "../core/events.js";
import { STATUS, compareItems, createItem, normalizeItem, validateItem } from "./item.js";
import { SCHEMA_VERSION, emptyDocument, migrate, readLegacy } from "./migrations.js";

export class ValidationError extends Error {
  constructor(errors) {
    super(errors.join(" "));
    this.errors = errors;
  }
}

export class Repository extends Emitter {
  #doc = emptyDocument();
  #byId = new Map();

  constructor(adapter, { legacyStorage = null, clock = () => new Date() } = {}) {
    super();
    this.adapter = adapter;
    this.legacyStorage = legacyStorage;
    this.clock = clock;
  }

  async init() {
    let stored = await this.adapter.load();
    let migrated = false;
    if (!stored && this.legacyStorage) {
      const legacy = readLegacy(this.legacyStorage);
      if (legacy) {
        stored = legacy;
        migrated = true;
      }
    }
    if (stored) {
      const before = Array.isArray(stored) ? 1 : stored.schemaVersion;
      this.#doc = migrate(stored);
      migrated ||= before !== SCHEMA_VERSION;
    }
    this.#reindex();
    if (migrated) await this.#persist();
    return { migrated, count: this.#doc.items.length };
  }

  // ---- Lectures ----------------------------------------------------------

  all() {
    return [...this.#doc.items];
  }

  get(id) {
    return this.#byId.get(id) ?? null;
  }

  onDate(iso) {
    return this.#doc.items.filter((i) => i.date === iso).sort(compareItems);
  }

  // Bornes incluses, dates ISO.
  between(fromISO, toISO) {
    return this.#doc.items.filter((i) => i.date >= fromISO && i.date <= toISO).sort(compareItems);
  }

  findBySource(provider, externalId) {
    return this.#doc.items.find((i) => i.source.provider === provider && i.source.externalId === externalId) ?? null;
  }

  get settings() {
    return this.#doc.settings;
  }

  // ---- Écritures ---------------------------------------------------------

  async add(input) {
    const item = createItem(input, this.clock());
    this.#assertValid(item);
    this.#doc.items.push(item);
    this.#byId.set(item.id, item);
    await this.#commit("add", item);
    return item;
  }

  async update(id, patch) {
    const current = this.#require(id);
    const next = normalizeItem({ ...current, ...patch, id, createdAt: current.createdAt, updatedAt: this.clock().toISOString() });
    this.#assertValid(next);
    Object.assign(current, next);
    await this.#commit("update", current);
    return current;
  }

  async remove(id) {
    const item = this.#require(id);
    this.#doc.items = this.#doc.items.filter((i) => i.id !== id);
    this.#byId.delete(id);
    await this.#commit("remove", item);
  }

  toggleDone(id) {
    return this.update(id, { done: !this.#require(id).done });
  }

  cancel(id) {
    return this.update(id, { status: STATUS.CANCELLED });
  }

  restore(id) {
    return this.update(id, { status: STATUS.ACTIVE });
  }

  async updateSettings(patch) {
    Object.assign(this.#doc.settings, patch);
    await this.#commit("settings", this.#doc.settings);
  }

  // ---- Sauvegarde / restauration ----------------------------------------

  exportJSON() {
    return JSON.stringify({ ...this.#doc, exportedAt: this.clock().toISOString(), app: "LifeCal" }, null, 2);
  }

  // Remplace toutes les données par celles d'un fichier exporté.
  async importJSON(text) {
    const parsed = JSON.parse(text);
    const doc = migrate(parsed);
    delete doc.exportedAt;
    delete doc.app;
    this.#doc = doc;
    this.#reindex();
    await this.#commit("import", null);
    return doc.items.length;
  }

  // ---- Interne -----------------------------------------------------------

  #require(id) {
    const item = this.#byId.get(id);
    if (!item) throw new Error(`Élément introuvable : ${id}`);
    return item;
  }

  #assertValid(item) {
    const errors = validateItem(item);
    if (errors.length) throw new ValidationError(errors);
  }

  #reindex() {
    this.#byId = new Map(this.#doc.items.map((i) => [i.id, i]));
  }

  #persist() {
    return this.adapter.save(this.#doc);
  }

  async #commit(type, payload) {
    await this.#persist();
    this.emit("change", { type, payload });
  }
}
