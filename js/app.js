import { CONFIG } from './config.js';
import { TYPES, TYPE, PERIODS, esc, fmtMoney, fmtNum, timeAgo, fmtDateTime, monthLabel, toLocalInput,
  ratingClass, normName, avatarHtml, periodSince, processImage, processAvatar } from './util.js';
import * as ST from './stats.js';
import { getPosition, geoGranted, nearbyVenues, knownPlacesNear, fmtDist, round5 } from './geo.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const S = { api: null, me: null, profiles: [], rows: null, rowsAt: 0, cleanup: null, drinks: new Map() };

// ---------- Iconos ----------
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>'),
  back: svg('<path d="M15 18 9 12l6-6"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  pin: svg('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  send: svg('<path d="M4 12 20 4l-6 16-3-7-7-1Z"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
};
const LOGO = `<svg class="logo-glass" viewBox="0 0 32 32" aria-hidden="true"><path d="M8.5 9h15l-1.9 17.2A2 2 0 0 1 19.6 28h-7.2a2 2 0 0 1-2-1.8L8.5 9Z" fill="#FFB000"/><path d="M11 14h10M11.6 19h8.8" stroke="#0F1114" stroke-opacity=".25" stroke-width="1.6" stroke-linecap="round"/><path d="M7.5 9.5C6.4 9.5 6 8.6 6 7.8 6 6.3 7.3 5 9 5c.7-1.5 2.2-2.5 4-2.5 1.3 0 2.5.5 3.3 1.4A4 4 0 0 1 19 3c1.9 0 3.4 1.2 3.9 2.8 1.7.1 3.1 1.1 3.1 2.4 0 .8-.6 1.3-1.5 1.3h-17Z" fill="#FFF6E0"/></svg>`;

// ---------- UI helpers ----------
const view = () => $('#view');
function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3000);
}
const errMsg = (e) => e?.message || String(e);
const loading = () => `<div class="loading"><span class="spinner"></span></div>`;
const empty = (emoji, title, sub = '', cta = '') => `<div class="empty"><div class="empty-e">${emoji}</div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}${cta}</div>`;
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };

function sheet(html) {
  const wrap = document.createElement('div'); wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap); requestAnimationFrame(() => wrap.classList.add('in'));
  const close = () => { wrap.classList.remove('in'); setTimeout(() => wrap.remove(), 250); };
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  return { el: wrap, close };
}
function confirmSheet(msg, ok = 'Borrar', danger = true) {
  return new Promise(res => {
    const s = sheet(`<p class="sheet-msg">${esc(msg)}</p><div class="sheet-btns">
      <button class="btn ghost" data-r="0">Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button></div>`);
    s.el.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) { s.close(); res(b.dataset.r === '1'); } });
  });
}

function setHeader({ back = false, title = '', right = '' } = {}) {
  $('#top-l').innerHTML = back
    ? `<button class="icon-btn" data-action="back" aria-label="Atrás">${I.back}</button>`
    : `<a href="#/feed" class="logo">${LOGO}<span>${esc(CONFIG.APP_NAME)}</span></a>`;
  $('#top-t').textContent = title;
  $('#top-r').innerHTML = right;
}
function renderNav() {
  $('#nav').innerHTML = `
    <a href="#/feed" data-tab="feed">${I.home}<span>Inicio</span></a>
    <a href="#/ranking" data-tab="ranking">${I.trophy}<span>Ranking</span></a>
    <a href="#/new" data-tab="new" class="nav-plus" aria-label="Apuntar ronda">${I.plus}</a>
    <a href="#/pena" data-tab="pena">${I.users}<span>Peña</span></a>
    <a href="#/u/${esc(S.me.username)}" data-tab="me">${avatarHtml(S.me, 24)}<span>Yo</span></a>`;
}
function setTab(tab) { $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab)); }

async function getRows(force = false) {
  if (!force && S.rows && Date.now() - S.rowsAt < 60e3) return S.rows;
  S.rows = await S.api.statsRows(); S.rowsAt = Date.now(); return S.rows;
}
const invalidate = () => { S.rows = null; };
const profileById = (id) => S.profiles.find(p => p.id === id);

// ---------- Piezas reutilizables ----------
function media(d, thumb = false) {
  const src = thumb ? (d.thumb_url || d.photo_url) : d.photo_url;
  if (src) return `<img src="${esc(src)}" alt="${esc(d.name)}" loading="lazy" decoding="async">`;
  const t = TYPE[d.type] || TYPE.otro;
  return `<div class="ph" style="--c:${t.color}"><span>${t.emoji}</span></div>`;
}
const score = (r, cls = '') => `<span class="score ${ratingClass(r)} ${cls}">${r}</span>`;
const tchip = (d) => { const t = TYPE[d.type] || TYPE.otro;
  return `<span class="tchip" style="--c:${t.color}">${t.emoji} ${t.label}${d.quantity > 1 ? ` <b>×${d.quantity}</b>` : ''}</span>`; };
function likeBtn(d) {
  const on = d.like_ids.includes(S.me.id);
  return `<button class="act like ${on ? 'on' : ''}" data-action="like" data-id="${esc(d.id)}" aria-pressed="${on}" aria-label="Brindar">
    <span class="cheers">🍻</span><span class="n">${d.like_ids.length || ''}</span></button>`;
}
function cardHtml(d) {
  S.drinks.set(String(d.id), d);
  return `<article class="card">
    <header class="card-h">
      <a class="who" href="#/u/${esc(d.author?.username)}">${avatarHtml(d.author, 34)}
        <span><b>${esc(d.author?.display_name)}</b><small>${timeAgo(d.created_at)}</small></span></a>
      ${tchip(d)}
    </header>
    <a class="card-media" href="#/d/${esc(d.id)}" data-dbl="${esc(d.id)}">${media(d)}${score(d.rating)}</a>
    <div class="card-b">
      <h3>${esc(d.name)}</h3>
      <div class="meta">${d.place ? `<span>${I.pin}${esc(d.place)}</span>` : ''}${d.price != null ? `<span class="price">${fmtMoney(d.price)}</span>` : ''}</div>
      ${d.note ? `<p class="note">${esc(d.note)}</p>` : ''}
    </div>
    <footer class="card-f">${likeBtn(d)}
      <a class="act" href="#/d/${esc(d.id)}">${I.chat}<span class="n">${d.comment_count || ''}</span></a></footer>
  </article>`;
}
const periodChips = (cur) => `<div class="chips" role="tablist">${PERIODS.map(p =>
  `<button class="chip ${p.id === cur ? 'on' : ''}" data-period="${p.id}">${p.label}</button>`).join('')}</div>`;

async function toggleLike(id) {
  const d = S.drinks.get(String(id)); if (!d) return;
  const on = !d.like_ids.includes(S.me.id);
  const prev = d.like_ids;
  d.like_ids = on ? [...prev, S.me.id] : prev.filter(x => x !== S.me.id);
  const refresh = () => {
    $$(`[data-action="like"][data-id="${CSS.escape(String(id))}"]`).forEach(b => { b.outerHTML = likeBtn(d); });
    const l = $('#likers'); if (l) l.innerHTML = likersText(d);
  };
  refresh();
  if (on) $$(`[data-action="like"][data-id="${CSS.escape(String(id))}"]`).forEach(b => b.classList.add('pop'));
  try { await S.api.setLike(d.id, on); }
  catch (e) { d.like_ids = prev; refresh(); toast('No se pudo brindar: ' + errMsg(e), 'err'); }
}
function likersText(d) {
  const names = d.like_ids.map(id => id === S.me.id ? 'tú' : profileById(id)?.display_name).filter(Boolean);
  if (!names.length) return 'Sé el primero en brindar';
  return `Brindan: <b>${names.map(esc).join(', ')}</b>`;
}

// ============================================================
//  VISTAS
// ============================================================
function viewAuth() {
  document.body.classList.remove('authed');
  const demo = S.api.demo;
  $('#app').innerHTML = `
  <main class="auth">
    <div class="auth-hero">${LOGO}<h1>${esc(CONFIG.APP_NAME)}</h1><p>${esc(CONFIG.TAGLINE)}</p></div>
    <div class="seg" role="tablist"><button class="on" data-auth="login">Entrar</button><button data-auth="register">Crear cuenta</button></div>
    <form id="fLogin" class="auth-form">
      <label class="field"><span class="lbl">Email</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span class="lbl">Contraseña</span><input name="password" type="password" autocomplete="current-password" required minlength="6"></label>
      <button class="btn primary big">Entrar</button>
      <button type="button" class="link" data-action="forgot">¿Has olvidado la contraseña?</button>
    </form>
    <form id="fRegister" class="auth-form" hidden>
      <label class="field"><span class="lbl">Tu nombre</span><input name="display_name" required maxlength="40" placeholder="Pepe" autocomplete="nickname"></label>
      <label class="field"><span class="lbl">Usuario</span><input name="username" required pattern="[a-z0-9_.]{3,20}" maxlength="20" placeholder="pepe" autocapitalize="none" autocomplete="username">
        <small class="hint">3–20 caracteres: minúsculas, números, punto o guion bajo</small></label>
      <label class="field"><span class="lbl">Email</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span class="lbl">Contraseña</span><input name="password" type="password" required minlength="6" autocomplete="new-password"></label>
      <label class="field"><span class="lbl">Código de la peña</span><input name="invite" ${demo ? '' : 'required'} autocapitalize="none" placeholder="${demo ? 'No hace falta en la demo' : 'Te lo pasa el admin'}"></label>
      <button class="btn primary big">Crear cuenta</button>
    </form>
    ${demo ? `<div class="demo-box"><b>Modo demo</b><p>Aún no está conectada a Supabase: los datos se guardan solo en este navegador.</p>
      <button class="btn ghost" data-action="guest">Entrar como invitado</button></div>` : ''}
  </main><div id="toasts"></div>`;

  $$('[data-auth]').forEach(b => b.onclick = () => {
    $$('[data-auth]').forEach(x => x.classList.toggle('on', x === b));
    $('#fLogin').hidden = b.dataset.auth !== 'login'; $('#fRegister').hidden = b.dataset.auth !== 'register';
  });
  const busy = (f, on) => { const b = f.querySelector('.btn.primary'); b.disabled = on; b.classList.toggle('busy', on); };
  $('#fLogin').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; busy(f, true);
    try { S.me = await S.api.signIn(f.email.value.trim(), f.password.value); await enter(); }
    catch (err) { toast(errMsg(err), 'err'); } finally { busy(f, false); }
  };
  $('#fRegister').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    const username = f.username.value.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) return toast('Usuario no válido (3–20: a-z, 0-9, . _)', 'err');
    busy(f, true);
    try {
      const r = await S.api.signUp({ email: f.email.value.trim(), password: f.password.value, username,
        display_name: f.display_name.value.trim(), invite: f.invite.value.trim() });
      if (r.needsConfirm) { toast('Cuenta creada. Revisa tu email para confirmarla y luego entra.'); $('[data-auth="login"]').click(); }
      else { S.me = r.user; await enter(); toast(`¡Bienvenido a los Héroes Locales, ${S.me.display_name}! 🍻`); }
    } catch (err) { toast(errMsg(err), 'err'); } finally { busy(f, false); }
  };
  $('[data-action="forgot"]').onclick = async () => {
    const email = $('#fLogin').email.value.trim();
    if (!email) return toast('Escribe tu email arriba y vuelve a pulsar', 'err');
    try { await S.api.resetPassword(email); toast('Te hemos enviado un correo para cambiarla'); }
    catch (err) { toast(errMsg(err), 'err'); }
  };
  const g = $('[data-action="guest"]');
  if (g) g.onclick = async () => { S.me = await S.api.guest(); await enter(); };
}

function shell() {
  $('#app').innerHTML = `
    <header class="top"><div id="top-l"></div><div id="top-t"></div><div id="top-r"></div></header>
    ${S.api.demo ? `<div class="demo-pill">Modo demo · datos solo en este navegador</div>` : ''}
    <main id="view"></main>
    <nav id="nav" class="nav"></nav>
    <div id="toasts"></div>`;
  renderNav();
}

async function enter() {
  document.body.classList.add('authed');
  shell();
  try { S.profiles = await S.api.listProfiles(); } catch { S.profiles = [S.me]; }
  if (!location.hash || location.hash === '#/' || location.hash === '#') history.replaceState(null, '', '#/feed');
  route();
}

// ---------- Feed ----------
async function viewFeed() {
  setTab('feed');
  setHeader({ right: `<button class="icon-btn" data-action="refresh" aria-label="Actualizar">${I.refresh}</button>` });
  view().innerHTML = `<div class="feed" id="feed"></div><div id="sentinel">${loading()}</div>`;
  let offset = 0, done = false, busy = false;
  const PAGE = 10;
  async function more() {
    if (busy || done) return; busy = true;
    try {
      const rows = await S.api.listDrinks({ offset, limit: PAGE });
      if (!$('#feed')) return;
      offset += rows.length; if (rows.length < PAGE) done = true;
      $('#feed').insertAdjacentHTML('beforeend', rows.map(cardHtml).join(''));
      if (done) $('#sentinel').innerHTML = offset ? `<p class="end">Eso es todo. ¡Otra ronda! 🍻</p>` :
        empty('🍺', 'Aún no hay rondas', 'Sube la primera y que empiece el pique.', `<a class="btn primary" href="#/new">Apuntar ronda</a>`);
    } catch (e) {
      $('#sentinel').innerHTML = `<p class="end err">${esc(errMsg(e))}</p>`; done = true;
    } finally { busy = false; }
  }
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) more(); }, { rootMargin: '600px' });
  io.observe($('#sentinel'));
  S.cleanup = () => io.disconnect();
  await more();
}

// ---------- Detalle ----------
async function viewDrink(id) {
  setTab('');
  setHeader({ back: true, title: 'Ronda' });
  view().innerHTML = loading();
  const d = await S.api.getDrink(id);
  if (!d) { view().innerHTML = empty('🤷', 'Esta ronda ya no existe'); return; }
  S.drinks.set(String(d.id), d);
  const mine = d.user_id === S.me.id;
  if (mine) setHeader({ back: true, title: 'Ronda', right:
    `<a class="icon-btn" href="#/edit/${esc(d.id)}" aria-label="Editar">${I.edit}</a>
     <button class="icon-btn" data-action="del-drink" aria-label="Borrar">${I.trash}</button>` });
  const total = d.price != null ? d.price * (d.quantity || 1) : null;
  view().innerHTML = `
  <article class="detail">
    <div class="detail-media">${media(d)}</div>
    <div class="detail-body">
      <a class="who" href="#/u/${esc(d.author.username)}">${avatarHtml(d.author, 40)}<span><b>${esc(d.author.display_name)}</b><small>@${esc(d.author.username)}</small></span></a>
      <div class="detail-title"><div>${tchip(d)}<h1>${esc(d.name)}</h1></div>${score(d.rating, 'big')}</div>
      <dl class="facts">
        <div><dt>Precio</dt><dd>${fmtMoney(d.price)}${d.quantity > 1 && total != null ? `<small>×${d.quantity} = ${fmtMoney(total)}</small>` : ''}</dd></div>
        <div><dt>Sitio</dt><dd>${d.place && d.lat != null ? `<a class="maplink" href="https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}" target="_blank" rel="noopener">${esc(d.place)} ↗</a>` : esc(d.place || '—')}</dd></div>
        <div class="wide"><dt>Cuándo</dt><dd>${esc(fmtDateTime(d.drunk_at))}</dd></div>
      </dl>
      ${d.note ? `<blockquote class="review">${esc(d.note)}</blockquote>` : ''}
      <div class="detail-like">${likeBtn(d)}<span id="likers">${likersText(d)}</span></div>
      <section class="comments">
        <h2>Comentarios</h2>
        <div id="clist">${commentsHtml(d)}</div>
        <form id="cform" class="cform"><input name="body" maxlength="500" placeholder="Escribe un comentario…" autocomplete="off" enterkeyhint="send">
          <button class="icon-btn accent" aria-label="Enviar">${I.send}</button></form>
      </section>
    </div>
  </article>`;

  $('#cform').onsubmit = async (e) => {
    e.preventDefault(); const inp = e.target.body; const body = inp.value.trim(); if (!body) return;
    inp.disabled = true;
    try { await S.api.addComment(d.id, body); const nd = await S.api.getDrink(d.id); Object.assign(d, nd);
      $('#clist').innerHTML = commentsHtml(d); inp.value = ''; }
    catch (err) { toast(errMsg(err), 'err'); } finally { inp.disabled = false; inp.focus(); }
  };
  view().onclick = async (e) => {
    const del = e.target.closest('[data-del-comment]');
    if (del && await confirmSheet('¿Borrar este comentario?')) {
      try { await S.api.deleteComment(del.dataset.delComment); d.comments = d.comments.filter(c => String(c.id) !== del.dataset.delComment);
        $('#clist').innerHTML = commentsHtml(d); } catch (err) { toast(errMsg(err), 'err'); }
    }
  };
  S.cleanup = () => { view().onclick = null; };
}
function commentsHtml(d) {
  if (!d.comments.length) return `<p class="muted small">Nadie ha dicho nada todavía.</p>`;
  return d.comments.map(c => `<div class="comment">${avatarHtml(c.author, 30)}
    <div><div class="c-h"><a href="#/u/${esc(c.author?.username)}"><b>${esc(c.author?.display_name)}</b></a><small>${timeAgo(c.created_at)}</small>
    ${c.user_id === S.me.id ? `<button class="link small" data-del-comment="${esc(c.id)}">borrar</button>` : ''}</div>
    <p>${esc(c.body)}</p></div></div>`).join('');
}

// ---------- Formulario nueva / editar ----------
async function viewForm(editId) {
  setTab(editId ? '' : 'new');
  setHeader({ back: true, title: editId ? 'Editar ronda' : 'Nueva ronda' });
  view().innerHTML = loading();
  let d = null;
  if (editId) {
    d = await S.api.getDrink(editId);
    if (!d || d.user_id !== S.me.id) { view().innerHTML = empty('🙅', 'No puedes editar esta ronda'); return; }
  }
  const st = { type: d?.type || 'cerveza', rating: d?.rating || null, qty: d?.quantity || 1, photo: null, geo: null, nearList: [],
    placeCoords: d && d.lat != null ? { lat: d.lat, lng: d.lng, name: d.place } : null,
    existing: d?.photo_url || null, removeOld: false, when: d ? new Date(d.drunk_at) : null };
  const rows = await getRows().catch(() => []);

  view().innerHTML = `
  <form id="dform" class="dform" novalidate>
    <label class="photo-pick ${st.existing ? 'has' : ''}" id="pp">
      <input type="file" accept="image/*" id="photoIn" hidden>
      <div class="pp-empty">${I.camera}<b>Añadir foto</b><small>Cámara o galería</small></div>
      <img id="photoPrev" alt="" ${st.existing ? `src="${esc(st.existing)}"` : 'hidden'}>
      <button type="button" class="pp-x" id="photoX" aria-label="Quitar foto" ${st.existing ? '' : 'hidden'}>${I.x}</button>
    </label>

    <div class="field"><span class="lbl">¿Qué es?</span>
      <div class="types">${TYPES.map(t => `<button type="button" class="type-btn" data-type="${t.id}" style="--c:${t.color}"><span>${t.emoji}</span>${t.label}</button>`).join('')}</div></div>

    <label class="field"><span class="lbl">Nombre</span>
      <input id="fName" list="dlNames" maxlength="80" autocomplete="off" placeholder="Estrella de Levante, gin tonic…" value="${esc(d?.name || '')}">
      <datalist id="dlNames"></datalist></label>

    <div class="field"><span class="lbl">Nota <b id="rateOut" class="rate-out"></b></span>
      <div class="rate" role="radiogroup">${Array.from({ length: 10 }, (_, i) => `<button type="button" class="${ratingClass(i + 1)}" data-rate="${i + 1}" role="radio">${i + 1}</button>`).join('')}</div></div>

    <div class="row2">
      <label class="field"><span class="lbl">Precio / ud (€)</span>
        <input id="fPrice" inputmode="decimal" placeholder="2,50" value="${d?.price != null ? String(d.price).replace('.', ',') : ''}"></label>
      <div class="field"><span class="lbl">Cantidad</span>
        <div class="stepper"><button type="button" data-step="-1" aria-label="Menos">−</button><output id="qty">${st.qty}</output><button type="button" data-step="1" aria-label="Más">+</button></div></div>
    </div>

    <div class="field"><label class="lbl" for="fPlace">Sitio</label>
      <div class="place-row"><input id="fPlace" list="dlPlaces" maxlength="80" autocomplete="off" placeholder="Bar, terraza, casa de alguien…" value="${esc(d?.place || '')}">
        <button type="button" class="geo-btn" id="geoBtn" aria-label="Usar mi ubicación">${I.pin}</button></div>
      <datalist id="dlPlaces"></datalist>
      <div class="near" id="near"></div></div>

    <label class="field"><span class="lbl">Reseña <small class="muted">(opcional)</small></span>
      <textarea id="fNote" rows="3" maxlength="1000" placeholder="¿Qué tal estaba? ¿Te clavaron?">${esc(d?.note || '')}</textarea></label>

    <details class="when" ${d ? 'open' : ''}><summary>Cuándo: <b id="whenTxt">${d ? esc(fmtDateTime(d.drunk_at)) : 'ahora mismo'}</b></summary>
      <input type="datetime-local" id="fWhen" value="${toLocalInput(st.when || new Date())}"></details>

    <div class="form-foot"><button class="btn primary big" id="saveBtn" type="submit">${d ? 'Guardar cambios' : 'Apuntar ronda 🍻'}</button></div>
  </form>`;

  const freq = (arr) => { const m = new Map(); for (const v of arr) { if (!v) continue; const k = normName(v);
    const x = m.get(k) || { v, n: 0 }; x.n++; m.set(k, x); } return [...m.values()].sort((a, b) => b.n - a.n).map(x => x.v); };
  const opts = (arr) => arr.slice(0, 40).map(v => `<option value="${esc(v)}">`).join('');
  const fillNames = () => { $('#dlNames').innerHTML = opts(freq(rows.filter(r => r.type === st.type).map(r => r.name))); };
  $('#dlPlaces').innerHTML = opts(freq(rows.map(r => r.place)));

  const paintType = () => { $$('.type-btn').forEach(b => b.classList.toggle('on', b.dataset.type === st.type)); fillNames(); };
  const paintRate = () => {
    $$('.rate button').forEach(b => { const v = +b.dataset.rate; b.classList.toggle('on', v === st.rating); b.classList.toggle('fill', st.rating && v <= st.rating); b.setAttribute('aria-checked', v === st.rating); });
    $('#rateOut').textContent = st.rating ? `${st.rating}/10 · ${['', 'Imbebible', 'Horrible', 'Muy mala', 'Mala', 'Pasable', 'Correcta', 'Buena', 'Muy buena', 'Brutal', 'Perfecta'][st.rating]}` : '';
  };
  paintType(); paintRate();

  $('.types').onclick = (e) => { const b = e.target.closest('[data-type]'); if (b) { st.type = b.dataset.type; paintType(); } };
  $('.rate').onclick = (e) => { const b = e.target.closest('[data-rate]'); if (b) { st.rating = +b.dataset.rate; paintRate(); navigator.vibrate?.(8); } };
  $('.stepper').onclick = (e) => { const b = e.target.closest('[data-step]'); if (!b) return;
    st.qty = Math.max(1, Math.min(50, st.qty + +b.dataset.step)); $('#qty').textContent = st.qty; };
  $('#fWhen').onchange = (e) => { st.when = e.target.value ? new Date(e.target.value) : null;
    $('#whenTxt').textContent = st.when ? fmtDateTime(st.when.toISOString()) : 'ahora mismo'; };

  // Sugerir precio de la última vez
  $('#fName').onchange = () => {
    const n = normName($('#fName').value), pl = normName($('#fPlace').value);
    const prev = rows.find(r => normName(r.name) === n && r.price != null && (!pl || normName(r.place) === pl)) ||
                 rows.find(r => normName(r.name) === n && r.price != null);
    $('#fPrice').placeholder = prev ? `última: ${String(prev.price).replace('.', ',')}` : '2,50';
  };

  // Ubicación: sitios guardados por la peña + bares cercanos de OpenStreetMap
  const near = $('#near');
  const pickPlace = (p) => {
    $('#fPlace').value = p.name; st.placeCoords = { lat: p.lat, lng: p.lng, name: p.name };
    $$('.near-chip').forEach(c => c.classList.toggle('on', c.dataset.name === p.name));
  };
  async function locate(auto = false) {
    const btn = $('#geoBtn'); if (!btn) return; btn.classList.add('busy');
    try {
      const pos = await getPosition();
      st.geo = pos;
      near.innerHTML = `<p class="near-msg">Buscando sitios cerca…</p>`;
      const known = knownPlacesNear(rows, pos, 200);
      let osm = [];
      try { osm = await nearbyVenues(pos, 150); } catch { /* sin conexión al mapa: solo sitios de la peña */ }
      if (!$('#near')) return;
      const seen = new Set(known.map(k => normName(k.name)));
      const list = [...known, ...osm.filter(o => !seen.has(normName(o.name)))].slice(0, 8);
      st.nearList = list;
      near.innerHTML = (list.length ? `<div class="near-chips">${list.map((p, i) => `<button type="button" class="near-chip ${p.n ? 'known' : ''}" data-i="${i}" data-name="${esc(p.name)}">${p.n ? '★ ' : ''}${esc(p.name)} <small>${fmtDist(p.dist)}${p.n ? ` · ${p.n}×` : ''}</small></button>`).join('')}</div>` : '')
        + `<p class="near-msg">${list.length ? '¿No está?' : 'No encuentro bares aquí.'} Escribe el nombre (p. ej. «Casa de Javi») y quedará guardado en este punto para la próxima vez.</p>`;
      const cur = $('#fPlace').value.trim();
      const match = list.find(p => normName(p.name) === normName(cur));
      if (match) pickPlace(match);
    } catch (err) {
      if (!auto) toast(err.message, 'err');
    } finally { btn.classList.remove('busy'); }
  }
  near.onclick = (e) => { const c = e.target.closest('.near-chip'); if (c) pickPlace(st.nearList[+c.dataset.i]); };
  $('#geoBtn').onclick = () => locate(false);
  $('#fPlace').addEventListener('input', () => {
    if (st.placeCoords && st.placeCoords.name !== $('#fPlace').value) { st.placeCoords = null; $$('.near-chip').forEach(c => c.classList.remove('on')); }
  });
  if (!d) geoGranted().then(ok => { if (ok) locate(true); });

  $('#photoIn').onchange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    $('#pp').classList.add('busy');
    try { st.photo = await processImage(file);
      $('#photoPrev').src = st.photo.preview; $('#photoPrev').hidden = false; $('#photoX').hidden = false; $('#pp').classList.add('has'); }
    catch { toast('No se pudo leer la imagen. Prueba con otra.', 'err'); }
    finally { $('#pp').classList.remove('busy'); e.target.value = ''; }
  };
  $('#photoX').onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (st.existing) st.removeOld = true;
    st.photo = null; st.existing = null; $('#photoPrev').hidden = true; $('#photoPrev').removeAttribute('src');
    $('#photoX').hidden = true; $('#pp').classList.remove('has');
  };

  $('#dform').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#fName').value.trim();
    if (!name) { $('#fName').focus(); return toast('Pon qué te has tomado', 'err'); }
    if (!st.rating) return toast('Ponle nota del 1 al 10', 'err');
    const rawPrice = $('#fPrice').value.trim().replace(',', '.').replace('€', '');
    const price = rawPrice === '' ? null : Number(rawPrice);
    if (price != null && (isNaN(price) || price < 0 || price > 9999)) return toast('Precio no válido', 'err');
    const placeName = $('#fPlace').value.trim();
    let lat = null, lng = null;
    if (placeName) {
      const known = rows.find(r => r.lat != null && normName(r.place) === normName(placeName));
      const c = (st.placeCoords && st.placeCoords.name === placeName) ? st.placeCoords : (st.geo || known || null);
      if (c) { lat = round5(c.lat); lng = round5(c.lng); }
    }
    const data = { type: st.type, name, place: placeName || null, lat, lng, price, quantity: st.qty,
      rating: st.rating, note: $('#fNote').value.trim() || null,
      drunk_at: (st.when || new Date()).toISOString() };
    const btn = $('#saveBtn'); btn.disabled = true; btn.classList.add('busy');
    try {
      if (d) { await S.api.updateDrink(d.id, data, { photo: st.photo, removeOld: st.removeOld, oldPath: d.photo_path });
        invalidate(); toast('Ronda actualizada'); history.back(); }
      else { await S.api.createDrink(data, st.photo); invalidate(); toast('¡Salud! Ronda apuntada 🍻', 'ok'); go('#/feed'); }
    } catch (err) { toast('Error al guardar: ' + errMsg(err), 'err'); btn.disabled = false; btn.classList.remove('busy'); }
  };
}

async function deleteCurrentDrink() {
  const id = location.hash.split('/')[2]; const d = S.drinks.get(String(id)); if (!d) return;
  if (!await confirmSheet('¿Borrar esta ronda? No se puede deshacer.')) return;
  try { await S.api.deleteDrink(d); invalidate(); toast('Ronda borrada'); go('#/feed'); }
  catch (e) { toast(errMsg(e), 'err'); }
}

// ---------- Bloques de estadísticas ----------
function statBlock(sum) {
  const parts = TYPES.filter(t => sum.byType[t.id] > 0);
  const maxH = Math.max(1, ...sum.hist.slice(1));
  return `
  <div class="bigstats">
    <div><b>${sum.total}</b><small>Total</small></div>
    <div><b>${sum.byType.cerveza}</b><small>🍺 Cervezas</small></div>
    <div><b>${sum.byType.copa}</b><small>🍹 Cacharros</small></div>
    <div><b>${sum.spent >= 100 ? fmtNum(Math.round(sum.spent), 0) + ' €' : fmtMoney(sum.spent).replace(',00', '')}</b><small>Gastado</small></div>
  </div>
  ${sum.total ? `
  <div class="panel">
    <h4>Por tipo</h4>
    <div class="typebar">${parts.map(t => `<span style="flex:${sum.byType[t.id]};background:${t.color}" title="${t.plural}"></span>`).join('')}</div>
    <ul class="legend">${parts.map(t => `<li><i style="background:${t.color}"></i>${t.emoji} ${t.plural} <b>${sum.byType[t.id]}</b></li>`).join('')}</ul>
  </div>
  <div class="panel">
    <h4>Notas <span class="muted">· media <b class="hl">${fmtNum(sum.avgRating)}</b></span></h4>
    <div class="hist">${sum.hist.slice(1).map((n, i) => `<div class="hcol" title="${n} con un ${i + 1}">
      <span class="hbar ${ratingClass(i + 1)}" style="height:${Math.max(n ? 6 : 2, (n / maxH) * 100)}%"></span><small>${i + 1}</small></div>`).join('')}</div>
  </div>` : ''}`;
}

// ---------- Perfil ----------
async function viewProfile(username) {
  const isMe = username === S.me.username;
  setTab(isMe ? 'me' : '');
  setHeader({ back: !isMe, title: isMe ? '' : '', right: isMe ? `<a class="icon-btn" href="#/ajustes" aria-label="Ajustes">${I.gear}</a>` : '' });
  view().innerHTML = loading();
  const p = isMe ? S.me : await S.api.getProfile(username);
  if (!p) { view().innerHTML = empty('🤷', 'Este perfil no existe'); return; }
  const all = (await getRows()).filter(r => r.user_id === p.id);
  let period = 'all', tab = 'diario';

  const favs = ST.topDrinks(all, { limit: 4 }).filter(f => f.avg >= 7);
  view().innerHTML = `
  <section class="profile">
    <div class="p-head">${avatarHtml(p, 84)}
      <div><h1>${esc(p.display_name)}</h1><p class="muted">@${esc(p.username)}</p>${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}
      ${isMe ? `<a class="btn ghost sm" href="#/ajustes">Editar perfil</a>` : ''}</div></div>
    <div id="pPeriod">${periodChips(period)}</div>
    <div id="pStats"></div>
    ${favs.length ? `<div class="panel"><h4>${isMe ? 'Tus' : 'Sus'} favoritas</h4><div class="favs">${favs.map(f => {
      const r = all.find(x => x.type === f.type && normName(x.name) === normName(f.name) && x.thumb_url) || all.find(x => normName(x.name) === normName(f.name));
      return `<a class="fav" href="#/d/${esc(r.id)}">${media(r, true)}${score(Math.round(f.avg))}<span>${esc(f.name)}</span></a>`; }).join('')}</div></div>` : ''}
    <div class="seg tabs"><button class="on" data-ptab="diario">Diario</button><button data-ptab="fotos">Fotos</button></div>
    <div id="pList"></div>
  </section>`;

  const paintStats = () => { $('#pStats').innerHTML = statBlock(ST.summarize(ST.since(all, periodSince(period)))); };
  const paintList = () => {
    const rs = ST.since(all, periodSince(period));
    if (!rs.length) { $('#pList').innerHTML = empty('🫗', 'Nada por aquí', isMe ? '¿A qué esperas para apuntar una ronda?' : 'Este periodo ha estado tranquilo.'); return; }
    if (tab === 'fotos') {
      const ph = rs.filter(r => r.thumb_url);
      $('#pList').innerHTML = ph.length ? `<div class="grid">${ph.map(r => `<a href="#/d/${esc(r.id)}">${media(r, true)}</a>`).join('')}</div>`
        : empty('📷', 'Sin fotos', 'Las rondas con foto aparecerán aquí.');
      return;
    }
    let html = '', cur = '';
    for (const r of rs) {
      const dt = new Date(r.drunk_at); const m = monthLabel(dt);
      if (m !== cur) { html += `<h3 class="month">${m}</h3>`; cur = m; }
      html += `<a class="drow" href="#/d/${esc(r.id)}">
        <span class="dday"><b>${dt.getDate()}</b><small>${dt.toLocaleDateString('es-ES', { weekday: 'short' })}</small></span>
        <span class="dthumb">${media(r, true)}</span>
        <span class="dmain"><b>${esc(r.name)}</b><small>${TYPE[r.type]?.emoji || ''} ${r.quantity > 1 ? `×${r.quantity} · ` : ''}${esc(r.place || '')}${r.price != null ? ` · ${fmtMoney(r.price)}` : ''}</small></span>
        ${score(r.rating)}</a>`;
    }
    $('#pList').innerHTML = `<div class="diary">${html}</div>`;
  };
  paintStats(); paintList();
  view().onclick = (e) => {
    const pc = e.target.closest('[data-period]');
    if (pc) { period = pc.dataset.period; $('#pPeriod').innerHTML = periodChips(period); paintStats(); paintList(); }
    const tb = e.target.closest('[data-ptab]');
    if (tb) { tab = tb.dataset.ptab; $$('[data-ptab]').forEach(b => b.classList.toggle('on', b === tb)); paintList(); }
  };
  S.cleanup = () => { view().onclick = null; };
}

// ---------- Ranking ----------
const SORTS = [
  { id: 'total', label: 'Total', val: u => u.total, fmt: v => v },
  { id: 'cerveza', label: '🍺 Cervezas', val: u => u.byType.cerveza, fmt: v => v },
  { id: 'copa', label: '🍹 Cacharros', val: u => u.byType.copa, fmt: v => v },
  { id: 'spent', label: '€ Gasto', val: u => u.spent, fmt: v => fmtMoney(v) },
  { id: 'avg', label: '★ Nota media', val: u => u.avgRating ?? -1, fmt: v => v < 0 ? '—' : fmtNum(v) },
];
async function viewRanking() {
  setTab('ranking'); setHeader({});
  view().innerHTML = loading();
  const all = await getRows();
  let period = 'month', sort = 'total';
  view().innerHTML = `<section class="ranking"><h1 class="page-h">Ranking</h1><div id="rPeriod"></div><div id="rBody"></div></section>`;
  const paint = () => {
    $('#rPeriod').innerHTML = periodChips(period);
    const rs = ST.since(all, periodSince(period));
    const sum = ST.summarize(rs);
    const users = ST.perUser(rs, S.profiles);
    const so = SORTS.find(s => s.id === sort);
    users.sort((a, b) => so.val(b) - so.val(a) || b.total - a.total);
    const maxT = Math.max(1, ...users.map(u => u.total));
    const tops = ST.topDrinks(rs, { limit: 8 });
    const places = ST.topPlaces(rs, 8);
    const ex = ST.extremes(rs);
    const who = (r) => profileById(r.user_id)?.display_name || '¿?';
    $('#rBody').innerHTML = `
      <div class="tiles">
        <div class="tile"><small>Rondas</small><b>${sum.total}</b></div>
        <div class="tile"><small>Gastado</small><b>${fmtMoney(sum.spent)}</b></div>
        <div class="tile"><small>🍺 Precio medio</small><b>${fmtMoney(ST.avgPrice(rs, 'cerveza'))}</b></div>
        <div class="tile"><small>🍹 Precio medio</small><b>${fmtMoney(ST.avgPrice(rs, 'copa'))}</b></div>
      </div>
      <div class="panel">
        <h4>La tabla</h4>
        <div class="chips sm">${SORTS.map(s => `<button class="chip ${s.id === sort ? 'on' : ''}" data-sort="${s.id}">${s.label}</button>`).join('')}</div>
        <ol class="board">${users.map((u, i) => `<li>
          <span class="pos ${i < 3 && so.val(u) > 0 ? 'p' + i : ''}">${i + 1}</span>
          <a href="#/u/${esc(u.profile.username)}" class="b-who">${avatarHtml(u.profile, 32)}<span><b>${esc(u.profile.display_name)}</b>
            <span class="minibar">${TYPES.filter(t => u.byType[t.id]).map(t => `<i style="width:${(u.byType[t.id] / maxT) * 100}%;background:${t.color}"></i>`).join('')}</span></span></a>
          <span class="b-val">${so.fmt(so.val(u))}</span></li>`).join('')}</ol>
      </div>
      <div class="panel"><h4>Mejor valoradas</h4>
        ${tops.length ? `<ol class="list">${tops.map(t => `<li><span class="l-e">${TYPE[t.type].emoji}</span>
          <span class="l-main"><b>${esc(t.name)}</b><small>${t.n} ${t.n === 1 ? 'vez' : 'veces'} · ${t.people} ${t.people === 1 ? 'persona' : 'personas'}${t.avgPrice != null ? ` · ${fmtMoney(t.avgPrice)}` : ''}</small></span>
          ${score(Math.round(t.avg))}</li>`).join('')}</ol>` : `<p class="muted small">Sin datos en este periodo.</p>`}</div>
      <div class="panel"><h4>Los bares</h4>
        ${places.length ? `<ol class="list">${places.map(p => `<li><span class="l-e">${I.pin}</span>
          <span class="l-main"><b>${esc(p.place)}</b><small>${p.drinks} consumiciones${p.beerPrice != null ? ` · 🍺 ${fmtMoney(p.beerPrice)}` : ''}${p.copaPrice != null ? ` · 🍹 ${fmtMoney(p.copaPrice)}` : ''}</small></span>
          ${score(Math.round(p.avg))}</li>`).join('')}</ol>` : `<p class="muted small">Apuntad el sitio para ver el ranking de bares.</p>`}</div>
      ${ex.priciest || ex.cheapestBeer ? `<div class="panel"><h4>Récords</h4><div class="records">
        ${ex.priciest ? `<a href="#/d/${esc(ex.priciest.id)}" class="rec"><small>💸 La más cara</small><b>${fmtMoney(ex.priciest.price)}</b><span>${esc(ex.priciest.name)} · ${esc(who(ex.priciest))}${ex.priciest.place ? ` en ${esc(ex.priciest.place)}` : ''}</span></a>` : ''}
        ${ex.cheapestBeer ? `<a href="#/d/${esc(ex.cheapestBeer.id)}" class="rec"><small>🪙 La caña más barata</small><b>${fmtMoney(ex.cheapestBeer.price)}</b><span>${esc(ex.cheapestBeer.name)} · ${esc(who(ex.cheapestBeer))}${ex.cheapestBeer.place ? ` en ${esc(ex.cheapestBeer.place)}` : ''}</span></a>` : ''}
      </div></div>` : ''}`;
  };
  paint();
  view().onclick = (e) => {
    const pc = e.target.closest('[data-period]'); if (pc) { period = pc.dataset.period; paint(); }
    const sc = e.target.closest('[data-sort]'); if (sc) { sort = sc.dataset.sort; paint(); }
  };
  S.cleanup = () => { view().onclick = null; };
}

// ---------- La peña ----------
async function viewPeople() {
  setTab('pena'); setHeader({});
  view().innerHTML = loading();
  const [profiles, rows] = await Promise.all([S.api.listProfiles(), getRows()]);
  S.profiles = profiles;
  const users = ST.perUser(rows, profiles).sort((a, b) => (b.last || '').localeCompare(a.last || ''));
  view().innerHTML = `<section><h1 class="page-h">Héroes Locales <span class="muted">· ${profiles.length}</span></h1>
    <div class="people">${users.map(u => `<a class="person" href="#/u/${esc(u.profile.username)}">${avatarHtml(u.profile, 48)}
      <span class="pm"><b>${esc(u.profile.display_name)}</b><small>${u.last ? 'Última: ' + timeAgo(u.last) : 'Aún sin estrenarse'}</small></span>
      <span class="pc"><span>🍺 ${u.byType.cerveza}</span><span>🍹 ${u.byType.copa}</span><span class="muted">Σ ${u.total}</span></span></a>`).join('')}</div></section>`;
}

// ---------- Ajustes ----------
function viewSettings() {
  setTab('me'); setHeader({ back: true, title: 'Ajustes' });
  let avatar = null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  view().innerHTML = `
  <section class="settings">
    <form id="sform" class="dform">
      <div class="av-edit"><label class="av-pick">${avatarHtml(S.me, 96)}<input type="file" accept="image/*" id="avIn" hidden><span>Cambiar foto</span></label></div>
      <label class="field"><span class="lbl">Nombre</span><input name="display_name" maxlength="40" required value="${esc(S.me.display_name)}"></label>
      <label class="field"><span class="lbl">Bio</span><input name="bio" maxlength="160" value="${esc(S.me.bio || '')}" placeholder="Team gin tonic"></label>
      <button class="btn primary big">Guardar</button>
    </form>
    <div class="panel"><h4>📲 Instalar en el móvil</h4>
      <p class="small">${ios ? 'En Safari: botón <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>.' : 'En Chrome: menú <b>⋮</b> → <b>Instalar aplicación</b> (o "Añadir a pantalla de inicio").'}
      Se abrirá a pantalla completa como una app normal.</p>
      <button class="btn ghost sm" id="installBtn" hidden>Instalar ahora</button></div>
    ${S.api.demo ? `<div class="panel"><h4>Modo demo</h4><p class="small">Los datos son de ejemplo y viven solo en este navegador.</p>
      <button class="btn ghost sm" data-action="reset-demo">Resetear datos de ejemplo</button></div>` : ''}
    <button class="btn danger-ghost big" data-action="logout">Cerrar sesión</button>
    <p class="muted small center">${esc(CONFIG.APP_NAME)} · hecho para los Héroes Locales 🍻</p>
  </section>`;
  if (window.__installPrompt) { const b = $('#installBtn'); b.hidden = false; b.onclick = async () => { window.__installPrompt.prompt(); window.__installPrompt = null; b.hidden = true; }; }
  $('#avIn').onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { avatar = await processAvatar(f); $('.av-pick .av').outerHTML = `<img class="av" src="${URL.createObjectURL(avatar)}" style="width:96px;height:96px">`; }
    catch { toast('No se pudo leer la imagen', 'err'); }
  };
  $('#sform').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; const b = f.querySelector('.btn'); b.disabled = true;
    try { S.me = await S.api.updateProfile({ display_name: f.display_name.value.trim(), bio: f.bio.value.trim() }, avatar);
      S.profiles = S.profiles.map(p => p.id === S.me.id ? S.me : p); renderNav(); setTab('me'); toast('Perfil guardado', 'ok'); avatar = null; }
    catch (err) { toast(errMsg(err), 'err'); } finally { b.disabled = false; }
  };
}

// ============================================================
//  Router y eventos globales
// ============================================================
const routes = [
  [/^#\/feed$/, () => viewFeed()],
  [/^#\/new$/, () => viewForm()],
  [/^#\/edit\/([\w-]+)$/, m => viewForm(m[1])],
  [/^#\/d\/([\w-]+)$/, m => viewDrink(m[1])],
  [/^#\/ranking$/, () => viewRanking()],
  [/^#\/pena$/, () => viewPeople()],
  [/^#\/u\/([\w.]+)$/, m => viewProfile(decodeURIComponent(m[1]))],
  [/^#\/ajustes$/, () => viewSettings()],
];
async function route() {
  if (!S.me || !$('#view')) return;
  S.cleanup?.(); S.cleanup = null;
  const h = location.hash || '#/feed';
  const r = routes.find(([re]) => re.test(h));
  window.scrollTo(0, 0);
  if (!r) return go('#/feed');
  try { await r[1](h.match(r[0])); }
  catch (e) {
    console.error(e);
    view().innerHTML = empty('😵', 'Algo ha fallado', esc(errMsg(e)), `<button class="btn ghost" data-action="retry">Reintentar</button>`);
  }
}
window.addEventListener('hashchange', route);

let lastTap = 0;
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-action]');
  // Doble toque en la foto = brindis
  const dbl = e.target.closest('[data-dbl]');
  if (dbl && !a) {
    const now = Date.now();
    if (now - lastTap < 320) { e.preventDefault(); lastTap = 0;
      const d = S.drinks.get(dbl.dataset.dbl); if (d && !d.like_ids.includes(S.me.id)) toggleLike(dbl.dataset.dbl);
      dbl.classList.remove('burst'); void dbl.offsetWidth; dbl.classList.add('burst'); return; }
    lastTap = now; e.preventDefault();
    const href = dbl.getAttribute('href');
    setTimeout(() => { if (lastTap === now) location.hash = href; }, 330);
    return;
  }
  if (!a) return;
  const act = a.dataset.action;
  if (act === 'back') { history.length > 1 ? history.back() : go('#/feed'); }
  else if (act === 'like') { e.preventDefault(); toggleLike(a.dataset.id); }
  else if (act === 'refresh') { invalidate(); route(); }
  else if (act === 'retry') route();
  else if (act === 'del-drink') deleteCurrentDrink();
  else if (act === 'logout') { if (await confirmSheet('¿Cerrar sesión?', 'Cerrar sesión')) { await S.api.signOut(); S.me = null; location.hash = ''; viewAuth(); } }
  else if (act === 'reset-demo') { if (await confirmSheet('¿Borrar todo y volver a los datos de ejemplo?', 'Resetear')) { S.api.reset(); location.hash = ''; location.reload(); } }
});

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - S.rowsAt > 120e3) invalidate(); });
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__installPrompt = e; });

function showSetPassword() {
  const s = sheet(`<form id="npw"><h3>Nueva contraseña</h3>
    <label class="field"><input type="password" name="p" minlength="6" required placeholder="Mínimo 6 caracteres" autocomplete="new-password"></label>
    <div class="sheet-btns"><button class="btn primary">Guardar</button></div></form>`);
  s.el.querySelector('#npw').onsubmit = async (e) => {
    e.preventDefault();
    try { await S.api.setPassword(e.target.p.value); s.close(); toast('Contraseña cambiada', 'ok'); } catch (err) { toast(errMsg(err), 'err'); }
  };
}

// ---------- Arranque ----------
async function boot() {
  document.title = CONFIG.APP_NAME;
  const demo = !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY;
  try {
    if (demo) { const { createDemoApi } = await import('./api-demo.js'); S.api = createDemoApi(); }
    else { const { createSupabaseApi } = await import('./api-supabase.js'); S.api = await createSupabaseApi(); }
  } catch (e) {
    $('#app').innerHTML = `<div class="empty"><div class="empty-e">📡</div><h3>Sin conexión</h3><p>No se pudo cargar la app. Comprueba tu conexión y recarga.</p><button class="btn primary" onclick="location.reload()">Recargar</button></div>`;
    return;
  }
  S.api.onPasswordRecovery(() => setTimeout(showSetPassword, 300));
  S.me = await S.api.currentUser().catch(() => null);
  if (!S.me) return viewAuth();
  await enter();
}
boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
