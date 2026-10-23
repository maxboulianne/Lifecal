// Service de synchronisation : fait le lien entre le format pivot des
// fournisseurs (ExternalEvent) et les éléments LifeCal.
//
// La logique de fusion est déjà en place et testée ; elle n'attend que des
// fournisseurs fonctionnels (voir providers.js).

import { STATUS } from "../data/item.js";

// Module attribué par défaut aux événements importés.
const IMPORTED_MODULE = "rdv";

export function eventToItemFields(event, providerId) {
  return {
    title: event.title || "(sans titre)",
    date: event.date,
    time: event.time || "",
    place: event.location || "",
    lat: event.lat ?? null,
    lng: event.lng ?? null,
    notes: event.notes || "",
    status: event.cancelled ? STATUS.CANCELLED : STATUS.ACTIVE,
    source: { provider: providerId, externalId: event.externalId, etag: event.etag ?? null },
  };
}

export function itemToEvent(item) {
  return {
    externalId: item.source.externalId,
    etag: item.source.etag,
    title: item.title,
    date: item.date,
    time: item.time,
    location: item.place,
    lat: item.lat,
    lng: item.lng,
    notes: item.notes,
    cancelled: item.status === STATUS.CANCELLED,
  };
}

export class SyncService {
  constructor(repository) {
    this.repository = repository;
  }

  // Importe les événements d'un fournisseur sur une période.
  // Le module et l'état « fait », propres à LifeCal, sont conservés.
  async pull(provider, range) {
    const events = await provider.listEvents(range);
    const result = { added: 0, updated: 0, unchanged: 0 };
    for (const event of events) {
      const existing = this.repository.findBySource(provider.id, event.externalId);
      const fields = eventToItemFields(event, provider.id);
      if (!existing) {
        await this.repository.add({ ...fields, module: IMPORTED_MODULE });
        result.added++;
      } else if (existing.source.etag && existing.source.etag === event.etag) {
        result.unchanged++;
      } else {
        await this.repository.update(existing.id, fields);
        result.updated++;
      }
    }
    return result;
  }

  // Envoie un élément local vers un fournisseur.
  async push(provider, item) {
    const { externalId, etag } = await provider.upsertEvent(itemToEvent(item));
    return this.repository.update(item.id, { source: { provider: provider.id, externalId, etag } });
  }
}
