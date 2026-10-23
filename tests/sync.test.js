import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryAdapter } from "../js/data/storage/adapters.js";
import { Repository } from "../js/data/repository.js";
import { SyncService } from "../js/sync/sync-service.js";
import { CalendarProvider } from "../js/sync/providers.js";

class FakeProvider extends CalendarProvider {
  constructor(events) { super({ id: "google", label: "Faux" }); this.events = events; }
  async listEvents() { return this.events; }
}

test("pull : ajoute, met à jour, ignore l'inchangé, garde module et « fait »", async () => {
  const repo = new Repository(new MemoryAdapter());
  await repo.init();
  const sync = new SyncService(repo);
  const ev = { externalId: "g1", etag: "1", title: "Dentiste", date: "2026-10-23", time: "09:00" };

  assert.deepEqual(await sync.pull(new FakeProvider([ev]), {}), { added: 1, updated: 0, unchanged: 0 });
  const local = repo.findBySource("google", "g1");
  await repo.update(local.id, { module: "habitude", done: true });

  assert.deepEqual(await sync.pull(new FakeProvider([ev]), {}), { added: 0, updated: 0, unchanged: 1 });
  await sync.pull(new FakeProvider([{ ...ev, etag: "2", time: "10:00" }]), {});
  const after = repo.get(local.id);
  assert.equal(after.time, "10:00");
  assert.equal(after.module, "habitude");
  assert.equal(after.done, true);
});
