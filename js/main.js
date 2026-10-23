// Point d'entrée : assemble le stockage, les déclencheurs et l'interface.

import { LocalStorageAdapter, MemoryAdapter, isLocalStorageAvailable } from "./data/storage/adapters.js";
import { Repository } from "./data/repository.js";
import { TriggerEngine } from "./triggers/engine.js";
import { calendarTriggers } from "./triggers/calendar-triggers.js";
import { proximityTriggers } from "./triggers/proximity-triggers.js";
import { App } from "./ui/app.js";
import { toast } from "./ui/components/toast.js";

async function boot() {
  const persistent = isLocalStorageAvailable();
  const adapter = persistent ? new LocalStorageAdapter("lifecal:data") : new MemoryAdapter();
  const repo = new Repository(adapter, { legacyStorage: persistent ? localStorage : null });
  const { migrated, count } = await repo.init();

  const triggers = new TriggerEngine().register(...calendarTriggers, ...proximityTriggers);

  const app = new App({
    repo,
    triggers,
    storageLabel: persistent ? "dans ce navigateur" : "temporairement (stockage du navigateur indisponible)",
  });
  app.start();

  if (migrated && count) toast(`Tes ${count} éléments du prototype ont été récupérés 🌿`);
  if (!persistent) toast("Attention : tes données ne seront pas conservées dans ce mode de navigation.");
}

boot().catch((err) => {
  console.error(err);
  document.querySelector("#calendar").innerHTML =
    '<p class="empty-msg">LifeCal n\'a pas pu démarrer. Recharge la page ; tes données sont en sécurité.</p>';
});
