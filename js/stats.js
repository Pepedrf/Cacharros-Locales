// Cálculo de estadísticas en el cliente (13 personas → datos pequeños)
import { TYPES, normName } from './util.js';

export const since = (rows, date) => date ? rows.filter(r => new Date(r.drunk_at) >= date) : rows;

export function summarize(rows) {
  const byType = Object.fromEntries(TYPES.map(t => [t.id, 0]));
  const hist = Array(11).fill(0);
  let total = 0, spent = 0, ratingSum = 0;
  for (const r of rows) {
    const q = r.quantity || 1;
    byType[r.type] = (byType[r.type] || 0) + q;
    total += q;
    if (r.price != null) spent += Number(r.price) * q;
    ratingSum += r.rating; hist[r.rating]++;
  }
  return { entries: rows.length, total, byType, spent, avgRating: rows.length ? ratingSum / rows.length : null, hist };
}

export function perUser(rows, profiles) {
  const map = new Map(profiles.map(p => [p.id, []]));
  for (const r of rows) { if (!map.has(r.user_id)) map.set(r.user_id, []); map.get(r.user_id).push(r); }
  return [...map.entries()].map(([id, rs]) => ({
    profile: profiles.find(p => p.id === id) || { id, username: '?', display_name: '¿?' },
    last: rs.reduce((m, r) => (!m || r.drunk_at > m) ? r.drunk_at : m, null),
    ...summarize(rs),
  }));
}

// Agrupa por nombre normalizado + tipo
export function topDrinks(rows, { min = 1, limit = 10 } = {}) {
  const g = new Map();
  for (const r of rows) {
    const k = r.type + '|' + normName(r.name);
    if (!g.has(k)) g.set(k, { name: r.name, type: r.type, sum: 0, n: 0, people: new Set(), prices: [] });
    const x = g.get(k); x.sum += r.rating; x.n++; x.people.add(r.user_id);
    if (r.price != null) x.prices.push(Number(r.price));
  }
  return [...g.values()].filter(x => x.n >= min)
    .map(x => ({ ...x, avg: x.sum / x.n, people: x.people.size,
      avgPrice: x.prices.length ? x.prices.reduce((a, b) => a + b, 0) / x.prices.length : null }))
    .sort((a, b) => b.avg - a.avg || b.n - a.n).slice(0, limit);
}

export function topPlaces(rows, limit = 10) {
  const g = new Map();
  for (const r of rows) {
    if (!r.place) continue;
    const k = normName(r.place);
    if (!g.has(k)) g.set(k, { place: r.place, visits: 0, drinks: 0, sum: 0, beer: [], copa: [] });
    const x = g.get(k); x.visits++; x.drinks += r.quantity || 1; x.sum += r.rating;
    if (r.price != null && r.type === 'cerveza') x.beer.push(Number(r.price));
    if (r.price != null && r.type === 'copa') x.copa.push(Number(r.price));
  }
  const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  return [...g.values()].map(x => ({ ...x, avg: x.sum / x.visits, beerPrice: avg(x.beer), copaPrice: avg(x.copa) }))
    .sort((a, b) => b.drinks - a.drinks).slice(0, limit);
}

export function avgPrice(rows, type) {
  const p = rows.filter(r => r.type === type && r.price != null).map(r => Number(r.price));
  return p.length ? p.reduce((a, b) => a + b, 0) / p.length : null;
}

export function extremes(rows) {
  const priced = rows.filter(r => r.price != null);
  const beers = priced.filter(r => r.type === 'cerveza');
  const by = (arr, f) => arr.reduce((m, r) => (!m || f(r, m)) ? r : m, null);
  return {
    priciest: by(priced, (a, b) => Number(a.price) > Number(b.price)),
    cheapestBeer: by(beers, (a, b) => Number(a.price) < Number(b.price)),
  };
}
