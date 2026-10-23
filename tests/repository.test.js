import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryAdapter } from "../js/data/storage/adapters.js";
import { Repository, ValidationError } from "../js/data/repository.js";
import { SCHEMA_VERSION, migrate } from "../js/data/migrations.js";

const fakeStorage = (data = {}) => ({
  getItem: (k) => data[k] ?? null,
  setItem: (k, v) => (data[k] = v),
  removeItem: (k) => delete data[k],
});

test("migration des données du prototype", async () => {
  const legacy = [
    { id: "1761200000000", title: "Épicerie", module: "commission", date: "2026-10-23", time: "", place: "IGA Laval", lat: null, lng: null, done: false },
    { id: "1761200000001", title: "Course", module: "inconnu", date: "2026-10-24", time: "07:00", done: true },
  ];
  const adapter = new MemoryAdapter();
  const repo = new Repository(adapter, { legacyStorage: fakeStorage({ items: JSON.stringify(legacy) }) });
  const res = await repo.init();
  assert.deepEqual(res, { migrated: true, count: 2 });
  assert.equal(repo.get("1761200000000").place, "IGA Laval");
  assert.equal(repo.get("1761200000001").module, "rdv"); // module inconnu -> défaut
  assert.equal(repo.get("1761200000001").status, "active");
  assert.ok(repo.get("1761200000000").createdAt.startsWith("2025-"));
  const saved = await adapter.load();
  assert.equal(saved.schemaVersion, SCHEMA_VERSION);
});

test("ajout, fait, annulation, suppression", async () => {
  const repo = new Repository(new MemoryAdapter());
  await repo.init();
  let changes = 0;
  repo.on("change", () => changes++);

  const a = await repo.add({ title: "Méditation", module: "habitude", date: "2026-10-23", time: "07:30" });
  await repo.add({ title: "Dentiste", module: "rdv", date: "2026-10-23", time: "06:00" });
  assert.deepEqual(repo.onDate("2026-10-23").map((i) => i.title), ["Dentiste", "Méditation"]);

  assert.equal((await repo.toggleDone(a.id)).done, true);
  assert.equal((await repo.cancel(a.id)).status, "cancelled");
  assert.equal((await repo.restore(a.id)).status, "active");
  await repo.remove(a.id);
  assert.equal(repo.get(a.id), null);
  assert.equal(changes, 6);
});

test("validation douce", async () => {
  const repo = new Repository(new MemoryAdapter());
  await repo.init();
  await assert.rejects(repo.add({ title: "  ", date: "" }), ValidationError);
});

test("export / import", async () => {
  const repo = new Repository(new MemoryAdapter());
  await repo.init();
  await repo.add({ title: "Voyage à Québec", module: "voyage", date: "2026-11-10" });
  const json = repo.exportJSON();
  const other = new Repository(new MemoryAdapter());
  await other.init();
  assert.equal(await other.importJSON(json), 1);
  assert.equal(other.all()[0].title, "Voyage à Québec");
});

test("refuse des données d'une version future", () => {
  assert.throws(() => migrate({ schemaVersion: SCHEMA_VERSION + 1, items: [] }));
});
