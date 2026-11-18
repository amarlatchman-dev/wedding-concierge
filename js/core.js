// Shared logic for the guest app, admin app and node seed script.
const enc = new TextEncoder(), dec = new TextDecoder();
const subtle = globalThis.crypto.subtle;

export const b64 = {
  to: (buf) => { let s = ''; new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b))); return btoa(s); },
  from: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
};
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const randomToken = (bytes = 12) =>
  b64.to(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const uid = () => randomToken(6);

// ---------- Crypto ----------
// Guest records: key = SHA-256("guest:" + token). Lookup id = first 16 hex of SHA-256("id:" + token).
// Admin record: key = PBKDF2(password, salt, 250k).
async function aesKey(raw) { return subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return b64.to(iv) + '.' + b64.to(ct);
}
async function open(key, blob) {
  const [iv, ct] = blob.split('.');
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64.from(iv) }, key, b64.from(ct));
  return JSON.parse(dec.decode(pt));
}
const sha = async (s) => subtle.digest('SHA-256', enc.encode(s));
export const guestId = async (token) => hex(await sha('id:' + token)).slice(0, 16);
const guestKey = async (token) => aesKey(await sha('guest:' + token));
export const sealGuest = async (token, obj) => ({ id: await guestId(token), blob: await seal(await guestKey(token), obj) });
export async function openGuest(data, token) {
  const id = await guestId(token);
  const rec = (data.guests || []).find((g) => g.id === id);
  if (!rec) return null;
  return open(await guestKey(token), rec.blob);
}
async function pwKey(password, salt) {
  const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function sealAdmin(password, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64.to(salt), blob: await seal(await pwKey(password, salt), obj) };
}
export async function openAdmin(admin, password) {
  return open(await pwKey(password, b64.from(admin.salt)), admin.blob);
}

// Builds the public data file from admin state. Guest details only ever leave encrypted.
export async function buildPublic(state, password) {
  const { guests, secrets, ...pub } = state;
  pub.guests = await Promise.all(guests.map((g) =>
    sealGuest(g.token, { name: g.name, family: g.family, cottage: g.cottage, group: g.group, party: g.party })));
  pub.admin = await sealAdmin(password, { guests, secrets: secrets || {} });
  pub.publishedAt = new Date().toISOString();
  return pub;
}

// ---------- Time (all event times are wall-clock in the wedding's time zone) ----------
export const TZ_DEFAULT = 'Asia/Kolkata';
export function fmtTime(iso, tz = TZ_DEFAULT) {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).format(new Date(iso)).toUpperCase();
}
export function fmtDay(iso, tz = TZ_DEFAULT, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: tz }).format(new Date(iso));
}
export const dayKey = (iso, tz = TZ_DEFAULT) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
// "2026-12-04" + "08:00" in IST -> ISO string
export const toIso = (date, time, offset = '+05:30') => new Date(`${date}T${time}:00${offset}`).toISOString();
export function fromIso(iso, tz = TZ_DEFAULT) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
export function relTime(iso, now = Date.now()) {
  const m = Math.round((new Date(iso) - now) / 60000);
  if (m < -1) return null;
  if (m <= 0) return 'Starting now';
  if (m < 60) return `In ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `In ${h} hr${m % 60 ? ` ${m % 60} min` : ''}`;
  const d = Math.round(h / 24);
  return `In ${d} day${d > 1 ? 's' : ''}`;
}
export const eventEnd = (e) => e.end || new Date(new Date(e.start).getTime() + 90 * 60000).toISOString();
export function publishedEvents(data) {
  return (data.events || []).filter((e) => e.published !== false).sort((a, b) => a.start.localeCompare(b.start));
}
// Next event = first one that hasn't ended yet.
export function nextEvent(data, now = Date.now()) {
  return publishedEvents(data).find((e) => new Date(eventEnd(e)) > now) || null;
}

// ---------- Places ----------
export const CATEGORIES = {
  venue: { label: 'Wedding venue', color: '#b02a5b', icon: '♥' },
  cottage: { label: 'Cottage', color: '#a8813f', icon: '⌂' },
  entrance: { label: 'Main entrance', color: '#1f4e79', icon: '⇥' },
  reception: { label: 'Reception', color: '#1f4e79', icon: 'i' },
  restaurant: { label: 'Restaurant', color: '#a0522d', icon: '☕' },
  parking: { label: 'Parking', color: '#555', icon: 'P' },
  restroom: { label: 'Restrooms', color: '#4a6fa5', icon: 'WC' },
  emergency: { label: 'Emergency help', color: '#b3261e', icon: '+' },
  other: { label: 'Other facility', color: '#6b6b6b', icon: '•' },
};
// Visual themes taken from the invitation pages.
export const THEMES = {
  haldi: { label: 'Haldi (saffron)', art: 'art/haldi.jpg', accent: '#c96a12', soft: '#fdf0dc' },
  sangeet: { label: 'Sangeet (night blue)', art: 'art/sangeet.jpg', accent: '#24407a', soft: '#e6ecf7' },
  wedding: { label: 'Wedding (rose)', art: 'art/wedding.jpg', accent: '#b02a5b', soft: '#fbe6ee' },
  welcome: { label: 'Welcome (terracotta)', art: 'art/welcome.jpg', accent: '#b3583a', soft: '#fbe9e1' },
};
export const themeOf = (e) => THEMES[e?.theme] || THEMES.wedding;
export const markerById = (data, id) => (data.markers || []).find((m) => m.id === id);
// Guest cottage "15B" matches marker code "15B", otherwise block "15".
export function cottageMarker(data, cottage) {
  if (!cottage) return null;
  const c = String(cottage).toUpperCase().replace(/[\s-]/g, '');
  const cots = (data.markers || []).filter((m) => m.category === 'cottage');
  return cots.find((m) => (m.code || '').toUpperCase() === c)
    || cots.find((m) => (m.code || '').toUpperCase() === (c.match(/^\d+/) || [''])[0]) || null;
}

// ---------- Routing ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Nearest point on any usable edge, so a place can join the network anywhere along a path.
function attach(graph, p, ok) {
  const nodes = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
  let best = null;
  for (const e of graph.edges) {
    if (!ok(e)) continue;
    const a = nodes[e.a], b = nodes[e.b];
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = dist(p, q);
    if (!best || d < best.d) best = { d, q, e, a, b };
  }
  return best;
}
export function findRoute(data, from, to, mode = 'walk') {
  const graph = data.graph || { nodes: [], edges: [] };
  const ok = (e) => !e.restricted && (mode === 'walk' ? e.type !== 'vehicle' : e.type !== 'walk');
  const A = attach(graph, from, ok), B = attach(graph, to, ok);
  if (!A || !B) return null;
  const adj = {};
  const add = (u, v, w) => { (adj[u] ||= []).push([v, w]); (adj[v] ||= []).push([u, w]); };
  const pos = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
  for (const e of graph.edges) if (ok(e) && pos[e.a] && pos[e.b]) add(e.a, e.b, dist(pos[e.a], pos[e.b]));
  pos.__S = A.q; pos.__T = B.q;
  add('__S', A.a.id, dist(A.q, A.a)); add('__S', A.b.id, dist(A.q, A.b));
  add('__T', B.a.id, dist(B.q, B.a)); add('__T', B.b.id, dist(B.q, B.b));
  if (A.e === B.e) add('__S', '__T', dist(A.q, B.q));
  // Dijkstra (graphs are small, a linear scan is fine)
  const D = { __S: 0 }, prev = {}, done = new Set();
  for (;;) {
    let u = null;
    for (const k in D) if (!done.has(k) && (u === null || D[k] < D[u])) u = k;
    if (u === null || u === '__T') break;
    done.add(u);
    for (const [v, w] of adj[u] || []) if (!(v in D) || D[u] + w < D[v]) { D[v] = D[u] + w; prev[v] = u; }
  }
  if (!('__T' in D)) return null;
  const path = [];
  for (let u = '__T'; u; u = prev[u]) path.unshift(pos[u]);
  const pts = [from, ...path, to].filter((p, i, arr) => i === 0 || dist(p, arr[i - 1]) > 0.5);
  const px = pts.reduce((s, p, i) => (i ? s + dist(p, pts[i - 1]) : 0), 0);
  const meters = px * (data.map?.metersPerPixel || 0.45);
  const speed = mode === 'walk' ? 1.2 : 4; // m/s; walking with a slow, dressed-up pace / buggy
  return { points: pts, meters, minutes: Math.max(1, Math.round(meters / speed / 60)), mode };
}
// Turn-by-turn steps from the polyline, naming the nearest landmark at each turn.
export function routeSteps(data, route, fromName, toName) {
  const pts = route.points, mpp = data.map?.metersPerPixel || 0.45;
  const near = (p) => {
    let best = null;
    for (const m of data.markers || []) { const d = dist(m, p); if (d < 45 && (!best || d < best.d)) best = { d, m }; }
    return best ? ` near ${best.m.name}` : '';
  };
  const steps = [{ text: `Start at ${fromName}` }];
  let run = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    run += dist(pts[i], pts[i - 1]);
    const a1 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    const a2 = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
    let turn = ((a2 - a1) * 180) / Math.PI;
    turn = ((turn + 540) % 360) - 180;
    if (Math.abs(turn) < 35) continue;
    // Ignore tiny jogs in the path; only call out turns after a real stretch of walking.
    if (run * mpp < 25 && steps.length > 1) continue;
    const dir = turn > 0 ? 'right' : 'left'; // screen y points down, so positive = clockwise = right
    const slight = Math.abs(turn) < 60 ? 'slight ' : '';
    steps.push({ text: `Walk ${roundM(run * mpp)}, then turn ${slight}${dir}${near(pts[i])}`, at: pts[i] });
    run = 0;
  }
  run += dist(pts.at(-1), pts.at(-2) || pts.at(-1));
  steps.push({ text: run * mpp < 25 ? `${toName} is just ahead` : `Walk ${roundM(run * mpp)} to arrive at ${toName}`, at: pts.at(-1) });
  return steps;
}
export const roundM = (m) => (m < 100 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : m < 1000 ? `${Math.round(m / 25) * 25} m` : `${(m / 1000).toFixed(1)} km`);

// ---------- GPS (only when the admin has calibrated two real-world anchors) ----------
// Maps lat/lng to image pixels with a similarity transform fitted on two anchor points.
export function geoToMap(map, lat, lng) {
  const a = map?.geo;
  if (!a || a.length < 2) return null;
  const [p, q] = a;
  const k = Math.cos((p.lat * Math.PI) / 180);
  const P = { x: p.lng * k, y: -p.lat }, Q = { x: q.lng * k, y: -q.lat }, X = { x: lng * k, y: -lat };
  const gx = Q.x - P.x, gy = Q.y - P.y, mx = q.x - p.x, my = q.y - p.y;
  const g2 = gx * gx + gy * gy || 1;
  // complex division: s = m / g
  const sr = (mx * gx + my * gy) / g2, si = (my * gx - mx * gy) / g2;
  const dx = X.x - P.x, dy = X.y - P.y;
  return { x: p.x + sr * dx - si * dy, y: p.y + si * dx + sr * dy };
}

// ---------- Announcements ----------
export function announcementsFor(data, guest) {
  return (data.announcements || []).filter((a) => {
    if (a.published === false) return false;
    const t = a.audience || { type: 'all' };
    if (t.type === 'all' || !guest) return t.type === 'all';
    const vals = (t.values || []).map((v) => String(v).toUpperCase().trim());
    if (t.type === 'cottages') {
      const c = String(guest.cottage || '').toUpperCase();
      return vals.includes(c) || vals.includes((c.match(/^\d+/) || [''])[0]);
    }
    if (t.type === 'groups') return vals.includes(String(guest.group || '').toUpperCase());
    return false;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function loadData() {
  const r = await fetch(`data/wedding.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('Could not load wedding details');
  return r.json();
}
