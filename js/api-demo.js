// Backend de demostración: todo se guarda en este navegador (localStorage).
// Se usa automáticamente mientras config.js no tenga las claves de Supabase.
const KEY = 'rondas_demo_v1';
const uidGen = () => Math.random().toString(36).slice(2, 10);

const blobToDataURL = (b) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b);
});

function seed() {
  const people = [
    ['alvaro', 'Álvaro'], ['lucia', 'Lucía'], ['javi', 'Javi'], ['marta', 'Marta'],
    ['nacho', 'Nacho'], ['paula', 'Paula'], ['dani', 'Dani'],
  ].map(([username, display_name], i) => ({ id: 'u' + i, username, display_name, avatar_url: null,
    bio: ['Siempre la última ronda', 'Team gin tonic', 'Si no es Estrella, no es cerveza', '', 'Vermú de domingo', '', 'El que invita'][i],
    email: username + '@demo', created_at: new Date(Date.now() - 90 * 864e5).toISOString() }));
  const cat = {
    cerveza: [['Estrella de Levante', 1.8], ['Mahou Cinco Estrellas', 2.2], ['Alhambra Reserva 1925', 2.8], ['Caña de grifo', 1.5], ['Estrella Galicia', 2.3], ['IPA artesana', 4.5]],
    copa: [['Gin tonic Puerto de Indias', 8], ['Ron Barceló con Coca-Cola', 7], ['Whisky con Coca-Cola', 7], ['Gin tonic Tanqueray', 9]],
    vino: [['Tinto de Jumilla', 2.5], ['Verdejo', 3], ['Tinto de verano', 2.5]],
    coctel: [['Mojito', 8], ['Espresso martini', 9], ['Margarita', 8.5]],
    chupito: [['Jägermeister', 2.5], ['Licor 43', 2.5], ['Tequila', 3]],
    otro: [['Vermú de grifo', 2.5]],
  };
  const places = ['Bar Manolo', 'La Cervecería de la Plaza', 'Pub El Sótano', 'Terraza Las Flores', 'El Rincón de Paco', 'Casa', 'Discoteca Luna'];
  const weights = ['cerveza', 'cerveza', 'cerveza', 'cerveza', 'copa', 'copa', 'vino', 'coctel', 'chupito', 'otro'];
  const notes = ['Fresquita, como tiene que ser', 'Me la cobraron a precio de oro', '', 'La mejor de la noche', '', 'Demasiado hielo', 'Repetiría sin dudar', '', 'Aguada…'];
  let seedN = 7; const rnd = () => (seedN = (seedN * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const drinks = [];
  for (let i = 0; i < 70; i++) {
    const type = pick(weights); const [name, base] = pick(cat[type]); const u = pick(people);
    const when = new Date(Date.now() - rnd() * 75 * 864e5);
    when.setHours(19 + Math.floor(rnd() * 6), Math.floor(rnd() * 60));
    drinks.push({ id: 'd' + i, user_id: u.id, type, name, place: pick(places),
      price: Math.round((base + (rnd() - 0.4)) * 10) / 10, quantity: type === 'cerveza' && rnd() > 0.6 ? 2 + Math.floor(rnd() * 3) : 1,
      rating: Math.max(1, Math.min(10, Math.round(5 + rnd() * 5 + (rnd() > 0.85 ? -4 : 0)))),
      note: pick(notes), photo_url: null, thumb_url: null, photo_path: null,
      drunk_at: when.toISOString(), created_at: when.toISOString() });
  }
  const likes = []; const comments = [];
  drinks.forEach((d, i) => {
    people.forEach(p => { if (p.id !== d.user_id && rnd() > 0.72) likes.push({ drink_id: d.id, user_id: p.id }); });
    if (i % 5 === 0) comments.push({ id: 'c' + i, drink_id: d.id, user_id: pick(people).id,
      body: pick(['¡Esa ronda la pagaba yo!', 'Ese sitio es un robo', 'Vamos el viernes otra vez', '¿Un 10? Venga ya 😂', 'Qué buena pinta']),
      created_at: new Date(new Date(d.created_at).getTime() + 3600e3).toISOString() });
  });
  return { users: people, drinks, likes, comments, session: null };
}

export function createDemoApi() {
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db) db = seed();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch { throw new Error('Memoria del modo demo llena: borra alguna foto o resetea la demo'); }
  };
  save();
  const pub = u => u && ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url, bio: u.bio, created_at: u.created_at });
  const me = () => db.users.find(u => u.id === db.session);
  const full = d => {
    const likes = db.likes.filter(l => l.drink_id === d.id);
    const comments = db.comments.filter(c => c.drink_id === d.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(c => ({ ...c, author: pub(db.users.find(u => u.id === c.user_id)) }));
    return { ...d, author: pub(db.users.find(u => u.id === d.user_id)),
      like_ids: likes.map(l => l.user_id), likers: likes.map(l => pub(db.users.find(u => u.id === l.user_id))).filter(Boolean),
      comment_count: comments.length, comments };
  };
  const wait = (v) => new Promise(r => setTimeout(() => r(v), 120));
  async function photoFields(photo) {
    return { photo_url: await blobToDataURL(photo.full), thumb_url: await blobToDataURL(photo.thumb), photo_path: 'demo' };
  }

  return {
    demo: true,
    onPasswordRecovery() {},
    async currentUser() { return wait(pub(me()) || null); },
    async signIn(email) {
      const u = db.users.find(u => u.email === email.trim().toLowerCase());
      if (!u) throw new Error('En la demo, crea una cuenta o usa "Entrar como invitado"');
      db.session = u.id; save(); return pub(u);
    },
    async signUp({ email, username, display_name }) {
      if (db.users.some(u => u.username === username)) throw new Error('Ese nombre de usuario ya está cogido');
      if (db.users.some(u => u.email === email.toLowerCase())) throw new Error('Ese email ya tiene cuenta');
      const u = { id: 'u' + uidGen(), username, display_name, email: email.toLowerCase(), avatar_url: null, bio: '', created_at: new Date().toISOString() };
      db.users.push(u); db.session = u.id; save(); return { user: pub(u) };
    },
    async guest() {
      let u = db.users.find(u => u.username === 'yo');
      if (!u) { u = { id: 'u-yo', username: 'yo', display_name: 'Yo (demo)', email: 'yo@demo', avatar_url: null, bio: 'Probando la app', created_at: new Date().toISOString() }; db.users.push(u); }
      db.session = u.id; save(); return pub(u);
    },
    async signOut() { db.session = null; save(); },
    async resetPassword() { throw new Error('En modo demo no hay correos'); },
    async setPassword() {},
    reset() { localStorage.removeItem(KEY); },

    async listProfiles() { return wait(db.users.map(pub).sort((a, b) => a.display_name.localeCompare(b.display_name))); },
    async getProfile(username) { return wait(pub(db.users.find(u => u.username === username)) || null); },
    async updateProfile(patch, avatarBlob) {
      const u = me(); Object.assign(u, patch);
      if (avatarBlob) u.avatar_url = await blobToDataURL(avatarBlob);
      save(); return pub(u);
    },
    async listDrinks({ offset = 0, limit = 12 } = {}) {
      return wait([...db.drinks].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(offset, offset + limit).map(full));
    },
    async getDrink(id) { const d = db.drinks.find(d => d.id === id); return wait(d ? full(d) : null); },
    async createDrink(d, photo) {
      const row = { id: 'd' + uidGen(), user_id: db.session, created_at: new Date().toISOString(),
        photo_url: null, thumb_url: null, photo_path: null, ...d, ...(photo ? await photoFields(photo) : {}) };
      db.drinks.push(row); save(); return { id: row.id };
    },
    async updateDrink(id, d, { photo, removeOld } = {}) {
      const row = db.drinks.find(x => x.id === id);
      Object.assign(row, d);
      if (photo) Object.assign(row, await photoFields(photo));
      else if (removeOld) Object.assign(row, { photo_url: null, thumb_url: null, photo_path: null });
      save();
    },
    async deleteDrink(drink) {
      db.drinks = db.drinks.filter(d => d.id !== drink.id);
      db.likes = db.likes.filter(l => l.drink_id !== drink.id);
      db.comments = db.comments.filter(c => c.drink_id !== drink.id); save();
    },
    async setLike(drinkId, on) {
      db.likes = db.likes.filter(l => !(l.drink_id === drinkId && l.user_id === db.session));
      if (on) db.likes.push({ drink_id: drinkId, user_id: db.session }); save();
    },
    async addComment(drinkId, body) {
      db.comments.push({ id: 'c' + uidGen(), drink_id: drinkId, user_id: db.session, body, created_at: new Date().toISOString() }); save();
    },
    async deleteComment(id) { db.comments = db.comments.filter(c => c.id !== id); save(); },
    async statsRows() {
      return wait([...db.drinks].sort((a, b) => b.drunk_at.localeCompare(a.drunk_at))
        .map(({ id, user_id, type, name, place, lat, lng, price, quantity, rating, drunk_at, thumb_url }) =>
          ({ id, user_id, type, name, place, lat, lng, price, quantity, rating, drunk_at, thumb_url })));
    },
  };
}
