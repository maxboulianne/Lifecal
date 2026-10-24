// Point d'entrée : assemble le stockage, la langue, les déclencheurs et l'interface.

import { LocalStorageAdapter, MemoryAdapter, isLocalStorageAvailable } from "./data/storage/adapters.js";
import { Repository } from "./data/repository.js";
import { detectLanguage, setLanguage, t } from "./i18n/index.js";
import { TriggerEngine } from "./triggers/engine.js";
import { calendarTriggers } from "./triggers/calendar-triggers.js";
import { proximityTriggers } from "./triggers/proximity-triggers.js";
import { App } from "./ui/app.js";
import { toast } from "./ui/components/toast.js";

// Copie de l'application pour fonctionner sans Internet (voir sw.js).
function registerServiceWorker() {
  const secure = location.protocol === "https:" || location.hostname === "localhost";
  if (!("serviceWorker" in navigator) || !secure) return;
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("LifeCal : mode hors ligne indisponible", err));
  // À la toute première visite, les fichiers sont chargés avant que le service
  // worker soit actif : on lui envoie la liste pour qu'il en garde une copie.
  navigator.serviceWorker.ready.then((reg) => {
    const loaded = performance.getEntriesByType("resource").map((e) => e.name);
    const urls = [location.href.split("#")[0], ...loaded].filter((u) => u.startsWith(location.origin));
    reg.active?.postMessage({ type: "cache", urls });
  });
}

// Demande au navigateur de ne pas effacer les données automatiquement
// (Safari peut le faire pour un site peu visité).
async function protectStorage() {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return Boolean(await navigator.storage?.persist?.());
  } catch {
    return false;
  }
}

async function boot() {
  registerServiceWorker();
  setLanguage(detectLanguage());
  const persistent = isLocalStorageAvailable();
  const adapter = persistent ? new LocalStorageAdapter("lifecal:data") : new MemoryAdapter();
  const repo = new Repository(adapter, { legacyStorage: persistent ? localStorage : null });
  const { migrated, count } = await repo.init();
  if (repo.settings.language) setLanguage(repo.settings.language);

  const triggers = new TriggerEngine().register(...calendarTriggers, ...proximityTriggers);

  const app = new App({ repo, triggers, storageLabel: persistent ? "storage.browser" : "storage.memory" });
  app.start();
  protectStorage().then((ok) => app.setStorageProtected(ok));

  if (migrated && count) toast(t("toast.migrated", { count }));
  if (!persistent) toast(t("toast.noStorage"));
}

boot().catch((err) => {
  console.error(err);
  document.querySelector("#calendar").innerHTML = `<p class="empty-msg">${t("boot.failed")}</p>`;
});
