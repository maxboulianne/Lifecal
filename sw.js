// Service worker : LifeCal fonctionne sans Internet.
//
// Stratégie « réseau d'abord » : avec une connexion, on charge toujours la
// dernière version (les mises à jour arrivent toutes seules) et on en garde
// une copie ; sans connexion, ou si le réseau tarde trop, on sert la copie.
// Chaque fichier est revérifié auprès du serveur (cache: "no-cache") : sans
// cela, le navigateur pouvait resservir une ancienne version jusqu'à 10 minutes
// après une mise à jour (GitHub Pages autorise ce délai).
// Les données (calendrier, journal…) ne passent jamais par ici : elles
// restent dans le stockage du navigateur.

const CACHE = "lifecal-v24";
const NETWORK_TIMEOUT_MS = 4000;

// Le minimum pour ouvrir l'app hors ligne ; le reste des fichiers
// (modules JavaScript, traductions…) est mis en copie au premier chargement.
const SHELL = ["./", "index.html", "css/app.css", "js/main.js", "manifest.webmanifest", "icon.svg", "apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map(fresh))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La page envoie la liste des fichiers déjà chargés (première visite).
self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache") return;
  const urls = (event.data.urls ?? []).filter((u) => new URL(u).origin === self.location.origin);
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(urls.map((u) => cache.match(u).then((hit) => hit || cache.add(fresh(u))).catch(() => {}))),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(fresh(request.url)).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  try {
    return await Promise.race([network, timeout(NETWORK_TIMEOUT_MS)]);
  } catch {
    // Hors ligne ou réseau trop lent : la copie, sinon on attend quand même le réseau.
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = await cache.match("index.html");
      if (shell) return shell;
    }
    return network;
  }
}

// Demande au serveur si le fichier a changé (réponse « pas changé » très
// légère sinon), plutôt que de se fier à la copie du navigateur.
const fresh = (url) => new Request(url, { cache: "no-cache", credentials: "same-origin" });

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
