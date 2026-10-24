// Carte des lieux d'un voyage, avec Leaflet et les tuiles d'OpenStreetMap.
// La bibliothèque n'est chargée que lorsqu'une carte est affichée ; sans
// Internet, la carte est remplacée par un message (les lieux restent listés).

const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist";
let loading = null;

function loadLeaflet() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  loading ??= new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${LEAFLET}/leaflet.css`;
    document.head.append(css);
    const script = document.createElement("script");
    script.src = `${LEAFLET}/leaflet.js`;
    script.onload = () => resolve(globalThis.L);
    script.onerror = () => {
      loading = null;
      reject(new Error("Leaflet indisponible"));
    };
    document.head.append(script);
  });
  return loading;
}

// places : [{ name, lat, lng, visited }] ; color : couleur du module Voyage.
export async function mountMap(element, places, { color = "#8b5cf6" } = {}) {
  const L = await loadLeaflet();
  if (!element.isConnected) return null;
  const map = L.map(element, { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const markers = places.map((p) =>
    L.circleMarker([p.lat, p.lng], {
      radius: 9, color: "#fff", weight: 2, fillColor: color, fillOpacity: p.visited ? 0.45 : 0.95,
    }).addTo(map).bindPopup(`${p.visited ? "✓ " : ""}${escapeHtml(p.name)}`),
  );
  if (markers.length === 1) map.setView(markers[0].getLatLng(), 14);
  else map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
  return map;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
