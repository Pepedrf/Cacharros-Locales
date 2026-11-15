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

const VENUE_TAGS = ['bar', 'pub', 'cafe', 'restaurant', 'biergarten', 'nightclub', 'fast_food', 'ice_cream'];
const OVERPASS = 'https://overpass-api.de/api/interpreter';

async function fetchJson(url, opts = {}, ms = 7000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
function finish(pos, venues, radius) {
  const seen = new Set();
  return venues
    .filter(v => v.name && v.lat != null && !seen.has(normName(v.name)) && seen.add(normName(v.name)))
    .map(v => ({ ...v, dist: distance(pos, v) }))
    .filter(v => v.dist <= radius * 1.5)
    .sort((a, b) => a.dist - b.dist);
}

// Bares, pubs, cafeterías, restaurantes… cercanos (Photon/OpenStreetMap; Overpass de respaldo)
export async function nearbyVenues(pos, radius = 150) {
  try {
    const tags = VENUE_TAGS.map(t => `&osm_tag=amenity:${t}`).join('');
    const j = await fetchJson(`https://photon.komoot.io/reverse?lat=${pos.lat}&lon=${pos.lng}&limit=20&radius=${(radius / 1000).toFixed(2)}${tags}`, {}, 6000);
    const list = finish(pos, (j.features || []).map(f => ({ name: f.properties?.name, lat: f.geometry?.coordinates?.[1], lng: f.geometry?.coordinates?.[0] })), radius);
    if (list.length) return list;
  } catch { /* probamos el respaldo */ }
  const q = `[out:json][timeout:8];nwr(around:${radius},${pos.lat},${pos.lng})["name"]` +
    `["amenity"~"^(${VENUE_TAGS.join('|')})$"];out center 40;`;
  const j = await fetchJson(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 8000);
  return finish(pos, j.elements.map(e => ({ name: e.tags.name, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon })), radius);
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
