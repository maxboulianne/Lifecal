// Petit bus d'événements, utilisé par le dépôt de données et les services.
export class Emitter {
  #handlers = new Map();

  on(type, fn) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
    this.#handlers.get(type).add(fn);
    return () => this.#handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    this.#handlers.get(type)?.forEach((fn) => fn(payload));
  }
}
