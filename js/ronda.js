// Modo ronda (tipo Strava): seguimiento GPS, estadísticas, mapa e imagen para compartir
import { esc, TYPE, TYPES, ratingClass } from './util.js';
import { distance } from './geo.js';

// ---------- Estado local de la ronda en curso ----------
const KEY = 'cl_outing';
export const loadLocal = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
export const saveLocal = (o) => { try { o ? localStorage.setItem(KEY, JSON.stringify(o)) : localStorage.removeItem(KEY); } catch { } };

const P = (p) => ({ lat: p[0], lng: p[1] });
export function pathDistance(path = []) {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += distance(P(path[i - 1]), P(path[i]));
  return Math.round(d);
}

// Graba la ruta mientras la app está abierta (los móviles pausan el GPS con la pantalla bloqueada)
export class Tracker {
  constructor(outing, onPoint) { this.o = outing; this.onPoint = onPoint; this.watch = null; }
  start() {
    if (!('geolocation' in navigator) || this.watch != null) return;
    this.watch = navigator.geolocation.watchPosition(
      p => this.add(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
      () => { }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
  }
  stop() { if (this.watch != null) navigator.geolocation.clearWatch(this.watch); this.watch = null; }
  last() { const p = this.o.path; return p.length ? p[p.length - 1] : null; }
  add(lat, lng, acc = 0, force = false) {
    if (!force && acc > 80) return false;
    const last = this.last();
    if (!force && last && distance(P(last), { lat, lng }) < 25) return false;
    this.o.path.push([Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5, Math.round(Date.now() / 1000)]);
    saveLocal(this.o); this.onPoint?.();
    return true;
  }
}

// ---------- Estadísticas ----------
export function outingStats(o, drinks = o.drinks || []) {
  const start = new Date(o.started_at), end = o.ended_at ? new Date(o.ended_at) : new Date();
  const mins = Math.max(1, (end - start) / 60000);
  const n = drinks.reduce((s, d) => s + (d.quantity || 1), 0);
  const rated = drinks.filter(d => d.rating);
  const avg = rated.length ? rated.reduce((s, d) => s + d.rating, 0) / rated.length : null;
  const byType = {};
  drinks.forEach(d => { byType[d.type] = (byType[d.type] || 0) + (d.quantity || 1); });
  return { start, end, mins, n, pace: n ? mins / n : null, dist: o.distance_m || pathDistance(o.path), avg, byType };
}
export const fmtDur = (mins) => {
  const h = Math.floor(mins / 60), m = Math.floor(mins % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
};
export const fmtClock = (mins) => {
  const h = Math.floor(mins / 60), m = Math.floor(mins % 60), s = Math.floor((mins * 60) % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
export const fmtPace = (p) => p == null ? '—' : `${Math.floor(p)}:${String(Math.round((p % 1) * 60) % 60).padStart(2, '0')}`;
export const fmtKm = (m) => `${(m / 1000).toFixed(m < 10000 ? 2 : 1).replace('.', ',')} km`;
export const hhmm = (d) => new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
export function outingTitle(o) {
  const d = new Date(o.started_at), h = d.getHours();
  const part = h < 6 ? 'de madrugada' : h < 14 ? 'por la mañana' : h < 20 ? 'por la tarde' : 'por la noche';
  return `Ronda del ${d.toLocaleDateString('es-ES', { weekday: 'long' })} ${part}`;
}

// ---------- Mini mapa en SVG (sin teselas) para tarjetas ----------
function project(pts, w, h, pad) {
  const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length, k = Math.cos(lat0 * Math.PI / 180);
  const xs = pts.map(p => p[1] * k), ys = pts.map(p => -p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = maxX - minX || 1e-9, dy = maxY - minY || 1e-9;
  const s = Math.min((w - 2 * pad) / dx, (h - 2 * pad) / dy);
  const ox = (w - dx * s) / 2, oy = (h - dy * s) / 2;
  const single = maxX - minX < 1e-7 && maxY - minY < 1e-7;
  return (p) => single ? [w / 2, h / 2] : [ox + (p[1] * k - minX) * s, oy + (-p[0] - minY) * s];
}
export function routeSvg(path = [], drinks = [], w = 320, h = 150) {
  const dp = drinks.filter(d => d.lat != null).map(d => [d.lat, d.lng, d.type]);
  const all = [...path.map(p => [p[0], p[1]]), ...dp];
  if (!all.length) return `<div class="route-empty">🗺️ Ronda sin ubicación</div>`;
  const f = project(all, w, h, 16);
  const line = path.map(p => f(p).map(v => v.toFixed(1)).join(',')).join(' ');
  const s = path.length ? f(path[0]) : null, e = path.length > 1 ? f(path[path.length - 1]) : null;
  return `<svg class="route-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    ${path.length > 1 ? `<polyline points="${line}" fill="none" stroke="#FFB000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    ${dp.map(p => { const [x, y] = f(p); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${(TYPE[p[2]] || TYPE.otro).color}" stroke="#0E1013" stroke-width="2"/>`; }).join('')}
    ${s ? `<circle cx="${s[0].toFixed(1)}" cy="${s[1].toFixed(1)}" r="5" fill="#fff" stroke="#2EC4B6" stroke-width="3"/>` : ''}
    ${e ? `<circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="5" fill="#0E1013" stroke="#fff" stroke-width="3"/>` : ''}
  </svg>`;
}

// ---------- Mapa interactivo (Leaflet + OpenStreetMap) ----------
let leafletP = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return leafletP ||= new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => res(window.L);
    s.onerror = () => { leafletP = null; rej(new Error('No se pudo cargar el mapa')); };
    document.head.appendChild(s);
  });
}
function popupHtml(d, i, start) {
  const t = TYPE[d.type] || TYPE.otro, img = d.thumb_url || d.photo_url;
  const since = start ? Math.round((new Date(d.drunk_at) - start) / 60000) : null;
  return `<a class="mpop" href="#/d/${esc(d.id)}">${img ? `<img src="${esc(img)}" alt="">` : `<span class="mpop-e">${t.emoji}</span>`}
    <span class="mpop-b"><b>#${i + 1} ${t.emoji} ${esc(d.place || d.name || t.label)}</b>
    <small>${hhmm(d.drunk_at)}${since != null ? ` · +${fmtDur(Math.max(0, since))}` : ''}</small>
    ${d.note ? `<em>${esc(d.note)}</em>` : ''}</span>
    <span class="score ${ratingClass(d.rating)}">${d.rating}</span></a>`;
}
export async function renderMap(el, o, drinks = []) {
  const L = await loadLeaflet();
  if (el._map) { el._map.remove(); el._map = null; }
  const map = L.map(el, { zoomControl: false, attributionControl: true, tap: true });
  el._map = map;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const line = (o.path || []).map(p => [p[0], p[1]]);
  const bounds = [...line];
  const poly = L.polyline(line, { color: '#FFB000', weight: 5, opacity: .95 }).addTo(map);
  if (line.length) L.circleMarker(line[0], { radius: 8, color: '#fff', weight: 3, fillColor: '#2EC4B6', fillOpacity: 1 })
    .addTo(map).bindTooltip(`Salida · ${hhmm(o.started_at)}`);
  if (o.ended_at && line.length > 1) L.circleMarker(line[line.length - 1], { radius: 8, color: '#fff', weight: 3, fillColor: '#0E1013', fillOpacity: 1 })
    .addTo(map).bindTooltip(`Fin · ${hhmm(o.ended_at)}`);
  const start = new Date(o.started_at);
  drinks.forEach((d, i) => {
    if (d.lat == null) return;
    const t = TYPE[d.type] || TYPE.otro;
    const icon = L.divIcon({ className: 'dmark', html: `<span style="--c:${t.color}">${t.emoji}<i>${i + 1}</i></span>`, iconSize: [38, 38], iconAnchor: [19, 19] });
    L.marker([d.lat, d.lng], { icon }).addTo(map).bindPopup(popupHtml(d, i, start), { maxWidth: 260, minWidth: 220 });
    bounds.push([d.lat, d.lng]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
  else map.setView([37.9922, -1.1307], 13);
  return { map, poly };
}

// ---------- Imagen para compartir (tipo Strava) ----------
export async function shareCard(o, drinks, author, appName) {
  const st = outingStats(o, drinks);
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  try { await document.fonts?.ready; } catch { }
  const F = (w, s) => `${w} ${s}px 'Bricolage Grotesque', 'DM Sans', system-ui, sans-serif`;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1d1a12'); bg.addColorStop(.45, '#0E1013'); bg.addColorStop(1, '#0E1013');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = '#FFB000'; g.font = F(800, 34); g.fillText(`🍻 ${appName}`.toUpperCase(), 70, 100);
  g.fillStyle = '#EEF1F4'; g.font = F(800, 64); g.fillText(outingTitle(o), 70, 185, W - 140);
  g.fillStyle = '#8E99A6'; g.font = F(500, 34);
  g.fillText(`${author?.display_name || ''} · ${st.start.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} · ${hhmm(st.start)}–${hhmm(st.end)}`, 70, 240, W - 140);
  // Ruta
  const box = { x: 70, y: 290, w: W - 140, h: 560 };
  g.fillStyle = '#171A1F'; roundRect(g, box.x, box.y, box.w, box.h, 36); g.fill();
  const dp = drinks.filter(d => d.lat != null);
  const pts = [...(o.path || []).map(p => [p[0], p[1]]), ...dp.map(d => [d.lat, d.lng])];
  if (pts.length) {
    const f = project(pts, box.w, box.h, 70), T = (p) => { const [x, y] = f(p); return [x + box.x, y + box.y]; };
    const path = o.path || [];
    if (path.length > 1) {
      g.strokeStyle = 'rgba(255,176,0,.25)'; g.lineWidth = 26; g.lineCap = g.lineJoin = 'round';
      g.beginPath(); path.forEach((p, i) => { const [x, y] = T(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      g.strokeStyle = '#FFB000'; g.lineWidth = 10; g.stroke();
    }
    dp.forEach((d) => {
      const [x, y] = T([d.lat, d.lng]), t = TYPE[d.type] || TYPE.otro;
      g.fillStyle = t.color; g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#0E1013'; g.lineWidth = 6; g.stroke();
      g.font = '28px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t.emoji, x, y + 2);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    });
    if (path.length) { const [x, y] = T(path[0]); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2EC4B6'; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); }
  } else {
    g.fillStyle = '#8E99A6'; g.font = F(600, 40); g.textAlign = 'center'; g.fillText('Ronda sin ubicación 🗺️', W / 2, box.y + box.h / 2); g.textAlign = 'left';
  }
  // Estadísticas
  const stats = [['Bebidas', String(st.n)], ['Min/bebida', fmtPace(st.pace)], ['Duración', fmtDur(st.mins)],
    ['Distancia', fmtKm(st.dist)], ['Nota media', st.avg == null ? '—' : st.avg.toFixed(1).replace('.', ',')], ['Empezó', hhmm(st.start)]];
  stats.forEach(([k, v], i) => {
    const col = i % 3, row = Math.floor(i / 3), x = 70 + col * ((W - 140) / 3), y = 940 + row * 170;
    g.fillStyle = '#8E99A6'; g.font = F(600, 30); g.fillText(k, x, y);
    g.fillStyle = '#EEF1F4'; g.font = F(800, 72); g.fillText(v, x, y + 80, (W - 140) / 3 - 20);
  });
  // Barra de tipos
  const total = st.n || 1; let x = 70; const y = 1265;
  TYPES.forEach(t => { const n = st.byType[t.id]; if (!n) return; const w = (W - 140) * n / total; g.fillStyle = t.color; g.fillRect(x, y, Math.max(4, w - 4), 18); x += w; });
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'ronda.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: outingTitle(o) }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancel'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ronda.png';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
