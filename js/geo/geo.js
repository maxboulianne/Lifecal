// Géolocalisation : position de l'appareil et calcul de distances.
// Utilisé par le formulaire (« Utiliser ma position ») et par les
// déclencheurs de proximité.

const EARTH_RADIUS_M = 6371000;
const rad = (deg) => (deg * Math.PI) / 180;

// Distance à vol d'oiseau en mètres (formule de haversine).
export function distanceMeters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export const isGeolocationSupported = () => typeof navigator !== "undefined" && "geolocation" in navigator;

const toPosition = (p) => ({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });

export function getCurrentPosition(options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }) {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) return reject(new Error("La géolocalisation n'est pas disponible sur cet appareil."));
    navigator.geolocation.getCurrentPosition((p) => resolve(toPosition(p)), reject, options);
  });
}

// Suit la position ; retourne une fonction pour arrêter le suivi.
export function watchPosition(onPosition, onError = () => {}) {
  if (!isGeolocationSupported()) {
    onError(new Error("La géolocalisation n'est pas disponible sur cet appareil."));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition((p) => onPosition(toPosition(p)), onError, {
    enableHighAccuracy: false,
    maximumAge: 120000,
  });
  return () => navigator.geolocation.clearWatch(id);
}

// Lien vers une carte (OpenStreetMap fonctionne partout, sans clé d'API).
export function mapUrl({ lat, lng }) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}
