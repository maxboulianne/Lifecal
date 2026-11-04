import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBackup, isBackupZip, readBackup } from "../js/data/backup.js";
import { MemoryAdapter } from "../js/data/storage/adapters.js";
import { Repository } from "../js/data/repository.js";

test("Copie complète : données et fichiers (photos, PDF, vidéos) aller-retour", async () => {
  const repo = new Repository(new MemoryAdapter());
  await repo.init();
  await repo.add({ title: "Rendez-vous test", module: "rdv", date: "2026-11-04" });
  const photo = new Uint8Array(5000).map((_, i) => i % 251);
  const video = new Uint8Array(200000).map((_, i) => (i * 7) % 256);
  const bytes = buildBackup(repo.exportJSON(), [
    { id: "photo-1", type: "image/jpeg", bytes: photo },
    { id: "video-1", type: "video/mp4", bytes: video },
  ]);
  assert.ok(isBackupZip(bytes));
  assert.equal(isBackupZip(new TextEncoder().encode('{"items":[]}')), false); // ancien export JSON
  const back = await readBackup(bytes);
  assert.deepEqual(back.files.map((f) => [f.id, f.type, f.bytes.length]), [["photo-1", "image/jpeg", 5000], ["video-1", "video/mp4", 200000]]);
  assert.deepEqual(back.files[1].bytes, video);
  const other = new Repository(new MemoryAdapter());
  await other.init();
  assert.equal(await other.importJSON(back.json), 1);
  assert.equal(other.all()[0].title, "Rendez-vous test");
  await assert.rejects(readBackup(buildBackup("{}", []).subarray(0, 10)));
});
