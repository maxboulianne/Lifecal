// Point d'entrée : assemble le stockage, la langue, les déclencheurs et l'interface.

import { LocalStorageAdapter, MemoryAdapter, isLocalStorageAvailable } from "./data/storage/adapters.js";
import { Repository } from "./data/repository.js";
import { detectLanguage, setLanguage, t } from "./i18n/index.js";
import { TriggerEngine } from "./triggers/engine.js";
import { calendarTriggers } from "./triggers/calendar-triggers.js";
import { proximityTriggers } from "./triggers/proximity-triggers.js";
import { App } from "./ui/app.js";
import { toast } from "./ui/components/toast.js";

async function boot() {
  setLanguage(detectLanguage());
  const persistent = isLocalStorageAvailable();
  const adapter = persistent ? new LocalStorageAdapter("lifecal:data") : new MemoryAdapter();
  const repo = new Repository(adapter, { legacyStorage: persistent ? localStorage : null });
  const { migrated, count } = await repo.init();
  if (repo.settings.language) setLanguage(repo.settings.language);

  const triggers = new TriggerEngine().register(...calendarTriggers, ...proximityTriggers);

  const app = new App({ repo, triggers, storageLabel: persistent ? "storage.browser" : "storage.memory" });
  app.start();

  if (migrated && count) toast(t("toast.migrated", { count }));
  if (!persistent) toast(t("toast.noStorage"));
}

boot().catch((err) => {
  console.error(err);
  document.querySelector("#calendar").innerHTML = `<p class="empty-msg">${t("boot.failed")}</p>`;
});
