// Backend real: Supabase (Auth + Postgres + Storage)
import { CONFIG } from './config.js';

const AUTHOR = 'author:profiles!drinks_user_id_fkey(id,username,display_name,avatar_url)';
const LIST_SELECT = `*, ${AUTHOR}, likes(user_id), comments(count)`;
const DETAIL_SELECT = `*, ${AUTHOR}, likes(user_id, profile:profiles(id,username,display_name,avatar_url)),
  comments(id, body, created_at, user_id, author:profiles(id,username,display_name,avatar_url))`;
const STATS_COLS = 'id,user_id,type,name,place,lat,lng,price,quantity,rating,drunk_at,thumb_url';

function norm(r) {
  return {
    ...r,
    price: r.price == null ? null : Number(r.price),
    like_ids: (r.likes || []).map(l => l.user_id),
    likers: (r.likes || []).map(l => l.profile).filter(Boolean),
    comment_count: Array.isArray(r.comments) ? (r.comments[0]?.count ?? r.comments.length) : 0,
    comments: Array.isArray(r.comments) && r.comments[0]?.body !== undefined
      ? [...r.comments].sort((a, b) => a.created_at.localeCompare(b.created_at)) : [],
  };
}
const fail = (error) => { if (error) throw error; };

export async function createSupabaseApi() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  let uid = null;
  let onRecovery = null;

  sb.auth.onAuthStateChange((event, session) => {
    uid = session?.user?.id ?? null;
    if (event === 'PASSWORD_RECOVERY' && onRecovery) onRecovery();
  });

  async function upload(path, blob) {
    const { error } = await sb.storage.from('photos').upload(path, blob, {
      contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    fail(error);
    return sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
  }
  async function uploadPhoto(photo) {
    const base = `${uid}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const [photo_url, thumb_url] = await Promise.all([
      upload(`${base}.jpg`, photo.full), upload(`${base}_t.jpg`, photo.thumb)]);
    return { photo_url, thumb_url, photo_path: base };
  }
  async function removePhoto(base) {
    if (base) await sb.storage.from('photos').remove([`${base}.jpg`, `${base}_t.jpg`]);
  }

  return {
    demo: false,
    onPasswordRecovery(fn) { onRecovery = fn; },

    // ---------- Auth ----------
    async currentUser() {
      const { data } = await sb.auth.getSession();
      uid = data.session?.user?.id ?? null;
      if (!uid) return null;
      const { data: p, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (error || !p) return null;
      return p;
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message.includes('Invalid login') ? 'Email o contraseña incorrectos' :
        error.message.includes('not confirmed') ? 'Confirma tu email antes de entrar (revisa el correo)' : error.message);
      return this.currentUser();
    },
    async signUp({ email, password, username, display_name, invite }) {
      const { data: free, error: e1 } = await sb.rpc('username_available', { u: username });
      if (e1) throw new Error('No se pudo comprobar el usuario: ' + e1.message);
      if (!free) throw new Error('Ese nombre de usuario ya está cogido');
      const { data, error } = await sb.auth.signUp({ email, password,
        options: { data: { username, display_name, invite }, emailRedirectTo: location.origin + location.pathname } });
      if (error) {
        if (/database error/i.test(error.message)) throw new Error('Código de invitación incorrecto');
        if (/already registered/i.test(error.message)) throw new Error('Ese email ya tiene cuenta');
        throw new Error(error.message);
      }
      if (!data.session) return { needsConfirm: true };
      return { user: await this.currentUser() };
    },
    async signOut() { await sb.auth.signOut(); uid = null; },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      fail(error);
    },
    async setPassword(password) { const { error } = await sb.auth.updateUser({ password }); fail(error); },

    // ---------- Perfiles ----------
    async listProfiles() {
      const { data, error } = await sb.from('profiles').select('*').order('display_name'); fail(error); return data;
    },
    async getProfile(username) {
      const { data, error } = await sb.from('profiles').select('*').eq('username', username).maybeSingle();
      fail(error); return data;
    },
    async updateProfile(patch, avatarBlob) {
      const upd = { ...patch };
      if (avatarBlob) upd.avatar_url = await upload(`${uid}/avatar_${Date.now()}.jpg`, avatarBlob);
      const { data, error } = await sb.from('profiles').update(upd).eq('id', uid).select().single();
      fail(error); return data;
    },

    // ---------- Consumiciones ----------
    async listDrinks({ offset = 0, limit = 12 } = {}) {
      const { data, error } = await sb.from('drinks').select(LIST_SELECT)
        .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      fail(error); return data.map(norm);
    },
    async getDrink(id) {
      const { data, error } = await sb.from('drinks').select(DETAIL_SELECT).eq('id', id).maybeSingle();
      fail(error); return data ? norm(data) : null;
    },
    async createDrink(d, photo) {
      const row = { ...d };
      if (photo) Object.assign(row, await uploadPhoto(photo));
      const { data, error } = await sb.from('drinks').insert(row).select('id').single();
      if (error && row.photo_path) await removePhoto(row.photo_path);
      fail(error); return data;
    },
    async updateDrink(id, d, { photo, removeOld, oldPath } = {}) {
      const row = { ...d };
      if (photo) Object.assign(row, await uploadPhoto(photo));
      else if (removeOld) Object.assign(row, { photo_url: null, thumb_url: null, photo_path: null });
      const { error } = await sb.from('drinks').update(row).eq('id', id);
      fail(error);
      if ((photo || removeOld) && oldPath) await removePhoto(oldPath).catch(() => {});
    },
    async deleteDrink(drink) {
      const { error } = await sb.from('drinks').delete().eq('id', drink.id); fail(error);
      await removePhoto(drink.photo_path).catch(() => {});
    },
    async setLike(drinkId, on) {
      const q = on ? sb.from('likes').insert({ drink_id: drinkId })
                   : sb.from('likes').delete().eq('drink_id', drinkId).eq('user_id', uid);
      const { error } = await q;
      if (error && error.code !== '23505') throw error;
    },
    async addComment(drinkId, body) {
      const { error } = await sb.from('comments').insert({ drink_id: drinkId, body }); fail(error);
    },
    async deleteComment(id) { const { error } = await sb.from('comments').delete().eq('id', id); fail(error); },

    // Todas las filas (paginando de 1000 en 1000) para estadísticas
    async statsRows() {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('drinks').select(STATS_COLS)
          .order('drunk_at', { ascending: false }).range(from, from + 999);
        fail(error);
        out.push(...data.map(r => ({ ...r, price: r.price == null ? null : Number(r.price) })));
        if (data.length < 1000) break;
      }
      return out;
    },
  };
}
