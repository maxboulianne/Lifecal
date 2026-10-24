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

// center : la destination { lat, lng } (ou null) ; places : [{ name, lat, lng, visited }] ;
// hotels : [{ name, lat, lng, km, url, color, chainName }] ; color : couleur du module Voyage.
// Sans lieux ni hôtels, la carte montre la destination.
export async function mountMap(element, { center = null, places = [], hotels = [], color = "#8b5cf6", labels = {} } = {}) {
  const L = await loadLeaflet();
  if (!element.isConnected) return null;
  const map = L.map(element, { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const markers = [
    ...places.map((p) =>
      L.circleMarker([p.lat, p.lng], {
        radius: 9, color: "#fff", weight: 2, fillColor: color, fillOpacity: p.visited ? 0.45 : 0.95,
      }).addTo(map).bindPopup(`${p.visited ? "✓ " : ""}${escapeHtml(p.name)}`)),
    ...hotels.map((h) =>
      L.circleMarker([h.lat, h.lng], { radius: 7, color: "#fff", weight: 2, fillColor: h.color, fillOpacity: 0.9 })
        .addTo(map)
        .bindPopup(`<strong>🏨 ${escapeHtml(h.name)}</strong><br>${escapeHtml(h.chainName)} · ${escapeHtml(h.distance)}<br>`
          + `<a href="${escapeHtml(h.url)}" target="_blank" rel="noopener">${escapeHtml(labels.website ?? "Site web")} ↗</a>`)),
  ];
  if (!markers.length && center) map.setView([center.lat, center.lng], 12);
  else if (markers.length === 1 && !center) map.setView(markers[0].getLatLng(), 14);
  else {
    const bounds = L.featureGroup(markers).getBounds();
    if (center) bounds.extend([center.lat, center.lng]);
    map.fitBounds(bounds.pad(0.15), { maxZoom: 15 });
  }
  return map;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
