// Utilidades compartidas
export const TYPES = [
  { id: 'cerveza', label: 'Cerveza', plural: 'Cervezas', emoji: '🍺', color: '#FFB000' },
  { id: 'copa',    label: 'Cacharro', plural: 'Cacharros',    emoji: '🍹', color: '#2EC4B6' },
  { id: 'vino',    label: 'Vino',    plural: 'Vinos',    emoji: '🍷', color: '#E8506A' },
  { id: 'coctel',  label: 'Cóctel',  plural: 'Cócteles', emoji: '🍸', color: '#B57BFF' },
  { id: 'chupito', label: 'Chupito', plural: 'Chupitos', emoji: '🥃', color: '#FF7A3D' },
  { id: 'otro',    label: 'Otro',    plural: 'Otros',    emoji: '🥤', color: '#8A96A3' },
];
export const TYPE = Object.fromEntries(TYPES.map(t => [t.id, t]));

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const fmtMoney = (n) => (n == null || isNaN(n)) ? '—' : money.format(n);
export const fmtNum = (n, d = 1) => (n == null || isNaN(n)) ? '—' :
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n);

export function timeAgo(iso) {
  const d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('es-ES', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const monthLabel = (d) => {
  const s = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function toLocalInput(date) {
  const d = new Date(date), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const ratingClass = (r) => r >= 9 ? 'r-top' : r >= 7 ? 'r-good' : r >= 5 ? 'r-mid' : 'r-low';

export const normName = (s) => String(s || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const AV_COLORS = ['#FFB000', '#2EC4B6', '#E8506A', '#B57BFF', '#FF7A3D', '#4EA8DE', '#7BD389'];
export function avatarHtml(p, size = 36) {
  if (!p) return '';
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (p.avatar_url) return `<img class="av" src="${esc(p.avatar_url)}" alt="" style="${style}" loading="lazy">`;
  const name = p.display_name || p.username || '?';
  const initials = (name.split(/\s+/).filter(w => /\p{L}|\d/u.test(w[0])).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase();
  let h = 0; for (const c of (p.username || name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="av av-txt" style="${style};--c:${AV_COLORS[h % AV_COLORS.length]}">${esc(initials)}</span>`;
}

export function periodSince(period) {
  const now = new Date();
  if (period === 'week') return new Date(Date.now() - 7 * 86400e3);
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'year') return new Date(now.getFullYear(), 0, 1);
  return null;
}
export const PERIODS = [
  { id: 'all', label: 'Siempre' }, { id: 'year', label: 'Este año' },
  { id: 'month', label: 'Este mes' }, { id: 'week', label: '7 días' },
];

// ---------- Imágenes: se comprimen en el móvil antes de subirlas ----------
async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url;
      await img.decode(); return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}
function drawTo(img, maxW, maxH, square, quality) {
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  if (square) { const m = Math.min(iw, ih); sx = (iw - m) / 2; sy = (ih - m) / 2; sw = sh = m; }
  const scale = Math.min(1, maxW / sw, maxH / sh);
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/jpeg', quality));
}
export async function processImage(file, { maxSide = 1280 } = {}) {
  const img = await loadBitmap(file);
  const full = await drawTo(img, maxSide, maxSide, false, 0.8);
  const thumb = await drawTo(img, 400, 400, true, 0.72);
  return { full, thumb, preview: URL.createObjectURL(full) };
}
export async function processAvatar(file) {
  const img = await loadBitmap(file);
  return drawTo(img, 320, 320, true, 0.8);
}
