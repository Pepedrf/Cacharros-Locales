// Ubicación: GPS del móvil + bares cercanos (OpenStreetMap) + sitios guardados por la peña
import { normName } from './util.js';

export function getPosition({ timeout = 12000, maximumAge = 60000 } = {}) {
  return new Promise((res, rej) => {
    if (!('geolocation' in navigator)) return rej(new Error('Tu navegador no permite ubicación. Escribe el sitio a mano'));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      e => rej(new Error(e.code === 1
        ? 'Sin permiso de ubicación: actívalo en los ajustes del navegador o escribe el sitio a mano'
        : 'No se pudo obtener tu ubicación. Escribe el sitio a mano')),
      { enableHighAccuracy: true, timeout, maximumAge });
  });
}

export async function geoGranted() {
  try { return (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted'; }
  catch { return false; }
}

export function distance(a, b) {
  const R = 6371e3, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtDist = (m) => m < 1000 ? `${Math.max(5, Math.round(m / 5) * 5)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
export const round5 = (x) => Math.round(x * 1e5) / 1e5;

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

// Bares, pubs, cafeterías, restaurantes… con nombre en un radio dado
export async function nearbyVenues(pos, radius = 150) {
  const q = `[out:json][timeout:8];nwr(around:${radius},${pos.lat},${pos.lng})["name"]` +
    `["amenity"~"^(bar|pub|cafe|restaurant|biergarten|nightclub|fast_food|ice_cream)$"];out center 40;`;
  let lastErr;
  for (const url of OVERPASS) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const seen = new Set();
      return j.elements
        .map(e => ({ name: e.tags.name, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon }))
        .filter(v => v.lat != null && !seen.has(normName(v.name)) && seen.add(normName(v.name)))
        .map(v => ({ ...v, dist: distance(pos, v) }))
        .sort((a, b) => a.dist - b.dist);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// Sitios que la peña ya ha usado cerca (incluye "Casa de Javi" y similares)
export function knownPlacesNear(rows, pos, radius = 200) {
  const g = new Map();
  for (const r of rows) {
    if (r.lat == null || r.lng == null || !r.place) continue;
    const dist = distance(pos, r);
    if (dist > radius) continue;
    const k = normName(r.place);
    const x = g.get(k) || { name: r.place, lat: r.lat, lng: r.lng, dist, n: 0 };
    x.n++;
    if (dist < x.dist) Object.assign(x, { lat: r.lat, lng: r.lng, dist });
    g.set(k, x);
  }
  return [...g.values()].sort((a, b) => a.dist - b.dist);
}
