import {
  loadData, openGuest, publishedEvents, nextEvent, eventEnd, fmtTime, fmtDay, dayKey, relTime, markerById,
  cottageMarker, findRoute, routeSteps, geoToMap, announcementsFor, CATEGORIES, esc, themeOf,
} from './core.js';
import { MapView, markerCard } from './map.js';

const $ = (s) => document.querySelector(s);
const view = $('#view');
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
let data, guest = null, tz, mapView = null;

const ICON = { pin: '📍', walk: '🚶', clock: '🕒' };
const venueOf = (e) => markerById(data, e.venue);
const homeMarker = () => (guest ? cottageMarker(data, guest.cottage) : null) || markerById(data, 'gate') || data.markers[0];

async function boot() {
  try {
    data = await loadData();
  } catch (e) {
    view.innerHTML = `<div class="wrap"><div class="empty"><h2>We couldn't load the wedding details</h2><p>Check your connection and try again.</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div></div>`;
    return;
  }
  tz = data.wedding.timezone;
  const m = location.hash.match(/^#\/g\/([\w-]+)/);
  const token = m ? m[1] : store.get('guestToken');
  if (token) {
    try { guest = await openGuest(data, token); } catch { guest = null; }
    if (guest) store.set('guestToken', token);
    else if (m) { view.innerHTML = `<div class="wrap"><div class="empty fade-in"><h2>This link isn't recognised</h2><p>Please ask the family for your personal link. You can still see the schedule and map.</p><a class="btn btn-primary" href="#/home">Continue</a></div></div>`; history.replaceState(null, '', '#/invalid'); return; }
  }
  // Shared link: guests can pick their cottage once and it's remembered on this phone.
  if (!guest && store.get('myCottage')) guest = { cottage: store.get('myCottage'), self: true };
  if (m) history.replaceState(null, '', '#/home');
  window.addEventListener('hashchange', route);
  route();
  setInterval(() => { if (/^#\/(home|schedule)?$/.test(location.hash) || !location.hash) route(); }, 60000);
  refreshLoop();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
}

// Re-fetch every 2 minutes so schedule changes appear without a reload.
function refreshLoop() {
  setInterval(async () => {
    try {
      const fresh = await loadData();
      if (fresh.publishedAt !== data.publishedAt) { data = fresh; if (!location.hash.startsWith('#/map') && !location.hash.startsWith('#/nav')) route(); updateBadge(); }
    } catch {}
  }, 120000);
}

function route() {
  const [, name = 'home', arg] = location.hash.match(/^#\/(\w+)\/?([\w-]*)/) || [];
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (name === 'nav' ? 'map' : name)));
  if (mapView && !['map', 'nav'].includes(name)) mapView = null;
  ({ home, schedule, map: mapScreen, nav, updates }[name] || home)(arg);
  updateBadge();
  window.scrollTo(0, 0);
}

function walkLine(e) {
  const v = venueOf(e), h = homeMarker();
  if (!v || !h) return '';
  const r = findRoute(data, h, v);
  return r ? `${ICON.walk} ${r.minutes} min walk${guest ? ' from your cottage' : ''}` : '';
}
const timeRange = (e) => `${fmtTime(e.start, tz)}${e.end ? ` – ${fmtTime(e.end, tz)}` : ' onwards'}`;

const ORN = `<div class="orn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M12 3c2 3 2 6 0 9-2-3-2-6 0-9Zm0 18c-2-3-2-6 0-9 2 3 2 6 0 9ZM3 12c3-2 6-2 9 0-3 2-6 2-9 0Zm18 0c-3 2-6 2-9 0 3-2 6-2 9 0Z"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg></div>`;
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 < 4 ? n % 10 : 0] || 'th');
const themeStyle = (e) => { const t = themeOf(e); return `--accent:${t.accent}`; };
const splitTime = (iso) => { const t = fmtTime(iso, tz); return { hm: t.replace(/ ?(AM|PM)/, ''), ap: t.slice(-2) }; };

function home() {
  const w = data.wedding, ev = nextEvent(data), v = ev && venueOf(ev);
  const d1 = +w.startDate.slice(8), d2 = +w.endDate.slice(8);
  const month = fmtDay(w.endDate + 'T12:00:00+05:30', tz, { month: 'long', year: 'numeric' });
  const rel = ev && relTime(ev.start), live = ev && new Date(ev.start) <= Date.now();
  const t = ev && splitTime(ev.start), th = ev && themeOf(ev);
  view.innerHTML = `<div class="wrap stack fade-in">
    <header class="hero">
      ${data.wedding.art !== false ? `<img class="wreath" src="art/monogram.jpg" alt="${esc(w.couple)} monogram">` : ''}
      <div class="invite">Welcome to the wedding celebrations of</div>
      <h1>${esc(w.couple)}</h1>
      ${ORN}
      <div class="dates">${ordinal(d1)}${d2 !== d1 ? ` &amp; ${ordinal(d2)}` : ''} ${esc(month)}</div>
      <div class="place">${esc(w.venueName)}</div>
    </header>
    <section class="card welcome center">
      <div class="eyebrow">${guest && !guest.self ? 'A warm welcome to' : 'A warm welcome'}</div>
      <div class="name">${guest && !guest.self ? esc(guest.family || guest.name) : 'Dear Guest'}</div>
      <p class="muted">${esc(w.welcome)}</p>
      ${guest ? `<div class="stay" style="text-align:left"><div class="badge">${esc(guest.cottage)}</div><div style="flex:1"><div class="eyebrow">Your stay</div><div style="font:600 20px var(--serif)">Cottage ${esc(guest.cottage)}</div><a href="#/map/${esc(homeMarker()?.id || '')}" style="font-size:13px">View on resort map →</a></div></div>`
      : cottagePicker()}
      ${guest?.self ? `<p style="font-size:13px;margin-top:8px"><a href="#" id="chgCot">Not your cottage? Change it</a></p>` : ''}
    </section>
    ${ev ? `<section class="card next" style="${themeStyle(ev)}">
      <div class="art" style="${data.wedding.art !== false ? `background-image:url(${th.art})` : `height:70px;background:linear-gradient(135deg, var(--rose-soft), transparent)`}">${rel ? `<span class="pill">${esc(rel)}</span>` : ''}</div>
      <div class="body">
        <div class="eyebrow">${live ? 'Happening now' : 'Your next celebration'}</div>
        <h2>${esc(ev.name)}</h2>
        <div class="time">${esc(t.hm)}<small>${t.ap}</small></div>
        <div class="meta"><span>${esc(fmtDay(ev.start, tz, { weekday: 'long', day: 'numeric', month: 'long' }))}</span></div>
        <div class="meta"><span>${ICON.pin} ${esc(v?.name || 'Venue to be announced')}</span>${walkLine(ev) ? `<span>${walkLine(ev)}</span>` : ''}</div>
        ${ev.dress ? `<div class="meta"><span>Dress: ${esc(ev.dress)}</span></div>` : ''}
        ${ev.change ? `<p class="changed" style="margin-top:8px">Updated: ${esc(ev.change)}</p>` : ''}
        ${v ? `<a class="btn btn-primary btn-block" style="margin-top:18px" href="#/nav/${esc(v.id)}">Navigate to venue</a>` : ''}
      </div>
    </section>` : `<section class="card center"><div class="script" style="font-size:40px">Thank you</div><p class="muted">for celebrating with us.</p></section>`}
    <section class="row" style="gap:10px">
      <a class="btn btn-ghost" style="flex:1" href="#/schedule">Full schedule</a>
      <a class="btn btn-ghost" style="flex:1" href="#/map">Resort map</a>
    </section>
    <section class="card">
      <div class="eyebrow" style="margin-bottom:6px">At your service</div>
      ${(w.contacts || []).map((c) => `<div class="contact"><span style="font:600 18px var(--serif)">${esc(c.name)}</span><span class="row" style="gap:8px"><a class="btn btn-sm btn-ghost" href="tel:${esc(c.phone)}">Call</a><a class="btn btn-sm btn-ghost" href="https://wa.me/${esc(c.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp</a></span></div>`).join('')}
      ${w.mapsQuery ? `<div class="contact"><span style="font:600 18px var(--serif)">Getting to the resort</span><a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(w.mapsQuery)}">Google Maps</a></div>` : ''}
    </section>
    ${w.blessing ? `<p class="blessing">${esc(w.blessing)}</p>` : ''}
    ${w.hosts ? `<div class="hosts"><div class="script">With Love</div><div class="names">${esc(w.hosts)}</div></div>` : ''}
    ${data.wedding.art !== false ? '<img class="leaves" src="art/leaves.jpg" alt="" aria-hidden="true">' : ''}
  </div>`;
  bindHome();
}

function cottagePicker() {
  const blocks = data.markers.filter((m) => m.category === 'cottage').map((m) => m.code).sort((a, b) => parseInt(a) - parseInt(b));
  if (!blocks.length) return '';
  return `<form id="cotForm" class="stay" style="text-align:left;flex-wrap:wrap">
    <div style="flex:1 1 100%"><div class="eyebrow">Where are you staying?</div><p class="muted" style="font-size:13px;margin:2px 0 8px">Choose your cottage to get walking times and directions from your door.</p></div>
    <select id="cotBlock" style="flex:1" required><option value="">Cottage…</option>${blocks.map((b) => `<option>${esc(b)}</option>`).join('')}</select>
    <select id="cotUnit" style="width:90px"><option value="">Unit</option>${['A', 'B', 'C', 'D'].map((u) => `<option>${u}</option>`).join('')}</select>
    <button class="btn btn-primary">Save</button></form>`;
}
function bindHome() {
  const f = $('#cotForm');
  if (f) f.onsubmit = (e) => { e.preventDefault(); const c = $('#cotBlock').value + $('#cotUnit').value; if (!$('#cotBlock').value) return; store.set('myCottage', c); guest = { cottage: c, self: true }; home(); };
  const ch = $('#chgCot');
  if (ch) ch.onclick = (e) => { e.preventDefault(); store.set('myCottage', ''); guest = null; home(); };
}

function schedule() {
  const evs = publishedEvents(data), nx = nextEvent(data);
  if (!evs.length) { view.innerHTML = `<div class="wrap"><div class="empty"><h2>Coming soon</h2><p>The schedule will appear here shortly.</p></div></div>`; return; }
  const byDay = {};
  for (const e of evs) (byDay[dayKey(e.start, tz)] ||= []).push(e);
  const dayNames = ['One', 'Two', 'Three', 'Four', 'Five'];
  view.innerHTML = `<div class="wrap fade-in"><div class="page-title"><h1>The Celebrations</h1>${ORN}<p class="muted" style="font-size:13px">All times are India time (IST)</p></div>
    ${Object.entries(byDay).map(([d, list], i) => `<section>
      <div class="day-head"><div class="script">Day ${dayNames[i] || i + 1}</div><div class="muted">${esc(fmtDay(list[0].start, tz))}</div></div>
      <div class="stack">${list.map((e, j) => {
        const v = venueOf(e), past = new Date(eventEnd(e)) < Date.now(), t = splitTime(e.start), th = themeOf(e);
        const banner = j === 0 || list[j - 1].theme !== e.theme;
        return `<article class="card ev ${past ? 'past' : ''} ${nx?.id === e.id ? 'is-next' : ''}" style="${themeStyle(e)}">
          ${banner && data.wedding.art !== false ? `<div class="ev-art" style="background-image:url(${th.art})"></div>` : ''}
          <div class="t">${esc(t.hm)}<small>${t.ap}${e.end ? `<br>to ${esc(fmtTime(e.end, tz))}` : '<br>onwards'}</small></div>
          <div>
            ${nx?.id === e.id ? '<div class="tag">Up next</div>' : ''}
            <h3>${esc(e.name)}</h3>
            <div class="muted" style="font-size:14px">${ICON.pin} ${esc(v?.name || 'Venue TBA')}${!past && walkLine(e) ? ` · ${walkLine(e).replace(ICON.walk + ' ', '')}` : ''}</div>
            ${e.change ? `<div class="changed">Updated: ${esc(e.change)}</div>` : ''}
            ${e.description ? `<p style="font-size:14px">${esc(e.description)}</p>` : ''}
            ${e.dress ? `<p style="font-size:13px"><span class="tag">Dress</span> ${esc(e.dress)}</p>` : ''}
            ${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy" style="width:100%;border-radius:14px;margin-top:6px">` : ''}
            ${v && !past ? `<a class="btn btn-sm btn-primary" style="margin-top:10px;background:var(--accent)" href="#/nav/${esc(v.id)}">Navigate</a>` : ''}
          </div></article>`;
      }).join('')}</div></section>`).join('')}
    ${data.wedding.art !== false ? '<img class="leaves" src="art/leaves.jpg" alt="" aria-hidden="true">' : ''}
  </div>`;
}

function mountMap() {
  view.innerHTML = `<div class="mapscreen"><div id="mapHost" style="position:absolute;inset:0"></div>
    <div class="map-top" id="mapTop"></div>
    <div class="map-ctrl"><button id="zin" aria-label="Zoom in">+</button><button id="zout" aria-label="Zoom out">−</button><button id="zfit" aria-label="Show whole map">⤢</button>${data.map.style === 'illustrated' ? '<button id="zorig" aria-label="Switch between illustrated and original map" title="Original resort map" style="font-size:15px">◐</button>' : ''}</div>
    <div id="sheet"></div></div>`;
  mapView = new MapView($('#mapHost'), { src: data.map.src, width: data.map.width, height: data.map.height });
  let original = false;
  const base = () => mapView.drawBase(data.map, data.graph, data.markers, { original });
  base();
  $('#zorig') && ($('#zorig').onclick = () => { original = !original; base(); mapView.highlightAreas(mapView._hl || []); });
  $('#zin').onclick = () => mapView.zoomBy(1.4); $('#zout').onclick = () => mapView.zoomBy(1 / 1.4); $('#zfit').onclick = () => mapView.fit();
  return mapView;
}

function mapScreen(focusId) {
  const mv = mountMap();
  const home = guest ? cottageMarker(data, guest.cottage) : null;
  let filter = 'all';
  const cats = ['all', ...Object.keys(CATEGORIES).filter((c) => data.markers.some((m) => m.category === c))];
  const draw = (sel) => {
    const list = data.markers.filter((m) => filter === 'all' ? (m.category !== 'cottage' || m.id === home?.id || m.id === sel) : m.category === filter || m.id === home?.id);
    mv.drawMarkers(list.map((m) => (m.id === home?.id ? { ...m, label: 'Your cottage' } : m)), { highlight: [home?.id, sel], labels: filter === 'all' ? 'venue' : 'all' });
    mv._hl = [home?.id, sel]; mv.highlightAreas(mv._hl);
  };
  $('#mapTop').innerHTML = cats.map((c) => `<span class="chip ${c === 'all' ? 'on' : ''}" data-c="${c}">${c === 'all' ? 'Highlights' : `<span class="dot" style="background:${CATEGORIES[c].color}"></span>${esc(CATEGORIES[c].label)}`}</span>`).join('');
  $('#mapTop').onclick = (e) => { const c = e.target.closest('.chip'); if (!c) return; filter = c.dataset.c; $('#mapTop').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c)); draw(); };
  const show = (id) => {
    const m = markerById(data, id); if (!m) return;
    draw(id);
    const r = home && home.id !== m.id ? findRoute(data, home, m) : null;
    $('#sheet').innerHTML = `<div class="sheet mini">${markerCard(m)}
      ${m.id === home?.id ? '<p class="tag">Your cottage</p>' : ''}
      ${r ? `<p class="muted">${ICON.walk} ${r.minutes} min walk from your cottage</p>` : ''}
      ${m.id !== home?.id ? `<a class="btn btn-primary btn-block" style="margin-top:10px" href="#/nav/${esc(m.id)}">Directions</a>` : ''}</div>`;
  };
  mv.onMarker = show;
  mv.onTap = () => { $('#sheet').innerHTML = ''; draw(); };
  draw();
  requestAnimationFrame(() => {
    const f = markerById(data, focusId) || home;
    if (focusId && f) { mv.focus([f], 80, 1.6, innerHeight * 0.3); show(f.id); } else mv.cover(f || { x: data.map.width / 2, y: 0 });
  });
}

function nav(destId) {
  const dest = markerById(data, destId);
  if (!dest) { location.hash = '#/map'; return; }
  const mv = mountMap();
  const cottage = guest ? cottageMarker(data, guest.cottage) : null;
  const gpsOK = !!(data.map.geo?.length >= 2 && 'geolocation' in navigator);
  let from = cottage ? { ...cottage, label: 'Your cottage', name: guest ? `your cottage (${guest.cottage})` : cottage.name } : markerById(data, 'gate');
  let fromMode = 'cottage', mode = 'walk', watchId = null, gpsNote = '';
  const places = data.markers.filter((m) => m.category !== 'cottage').sort((a, b) => a.name.localeCompare(b.name));
  const render = () => {
    const r = findRoute(data, from, dest, mode);
    mv.drawMarkers([dest, ...(from.id ? [from] : []), ...data.markers.filter((m) => m.category === 'venue' && m.id !== dest.id)], { highlight: [dest.id, from.id], dim: true });
    mv.drawRoute(r?.points);
    mv._hl = [dest.id, from.id]; mv.highlightAreas(mv._hl);
    renderSheet(r);
    focusRoute(r);
  };
  const focusRoute = (r) => {
    const inset = Math.min(innerHeight * 0.45, $('#sheet .sheet')?.offsetHeight || innerHeight * 0.45);
    if (r) mv.focus(r.points, 40, 2.2, inset); else mv.focus([from, dest], 80, 2.2, inset);
  };
  const renderSheet = (r) => {
    const steps = r ? routeSteps(data, r, from.name, dest.name) : [];
    $('#sheet').innerHTML = `<div class="sheet" style="max-height:45%">
      <div class="row between"><div><div class="eyebrow">Directions to</div><h3 style="font-size:26px">${esc(dest.name)}</h3></div><a href="#/map" class="btn btn-sm btn-ghost">Close</a></div>
      ${r ? `<div class="route-sum" style="margin-top:8px"><b>${r.minutes} min</b><span class="muted">${Math.round(r.meters)} m · ${mode === 'walk' ? 'walking' : 'by buggy/car'}</span></div>`
        : `<p class="note">No ${mode === 'walk' ? 'walking' : 'vehicle'} route is mapped between these places yet. Please ask at Reception.</p>`}
      <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px">
        <div class="seg" id="modeSeg"><button data-m="walk" class="${mode === 'walk' ? 'on' : ''}">Walk</button><button data-m="vehicle" class="${mode === 'vehicle' ? 'on' : ''}">Vehicle</button></div>
        ${gpsOK ? `<div class="seg" id="fromSeg"><button data-f="cottage" class="${fromMode === 'cottage' ? 'on' : ''}">From ${cottage ? 'cottage' : 'gate'}</button><button data-f="gps" class="${fromMode === 'gps' ? 'on' : ''}">From my location</button></div>` : ''}
      </div>
      <label class="muted" style="font-size:13px;display:block;margin-top:12px">Starting point
        <select id="fromSel">${cottage ? `<option value="__cottage">Your cottage (${esc(guest.cottage)})</option>` : ''}${places.map((p) => `<option value="${p.id}" ${from.id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}${fromMode === 'gps' ? '<option value="__gps" selected>My location</option>' : ''}</select></label>
      ${gpsNote ? `<p class="note" style="margin-top:10px">${esc(gpsNote)}</p>` : ''}
      ${steps.length ? `<ol class="steps">${steps.map((s) => `<li>${esc(s.text)}</li>`).join('')}</ol>` : ''}
      <p class="note" style="margin-top:12px">${fromMode === 'gps' ? 'Your blue dot comes from your phone\'s GPS and may be off by a few metres.' : 'This route follows the resort\'s mapped paths. It is not live GPS tracking.'}</p>
      ${dest.lat && dest.lng ? `<a class="btn btn-ghost btn-block" style="margin-top:10px" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=walking">Open in Google Maps</a>` : ''}
    </div>`;
    $('#modeSeg').onclick = (e) => { const b = e.target.closest('button'); if (b) { mode = b.dataset.m; render(); } };
    $('#fromSel').onchange = (e) => { const v = e.target.value; stopGps(); fromMode = 'cottage'; from = v === '__cottage' ? { ...cottage, label: 'Your cottage', name: `your cottage (${guest.cottage})` } : markerById(data, v); render(); };
    $('#fromSeg') && ($('#fromSeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.f === 'gps') startGps(); else { stopGps(); fromMode = 'cottage'; from = cottage || markerById(data, 'gate'); render(); } });
  };
  const stopGps = () => { if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null; mv.drawYou(null); gpsNote = ''; };
  const startGps = () => {
    gpsNote = 'Finding your location…'; render();
    watchId = navigator.geolocation.watchPosition((pos) => {
      const p = geoToMap(data.map, pos.coords.latitude, pos.coords.longitude);
      const inside = p && p.x > -50 && p.y > -50 && p.x < data.map.width + 50 && p.y < data.map.height + 50;
      if (!inside || pos.coords.accuracy > 60) {
        gpsNote = inside ? `GPS is not accurate enough right now (±${Math.round(pos.coords.accuracy)} m), so directions start from your cottage.` : "You don't seem to be at the resort, so directions start from your cottage.";
        fromMode = 'cottage'; from = cottage || markerById(data, 'gate'); mv.drawYou(null); render(); return;
      }
      const first = fromMode !== 'gps';
      fromMode = 'gps'; gpsNote = ''; from = { ...p, name: 'your location' };
      mv.drawYou(p, pos.coords.accuracy / (data.map.metersPerPixel || 0.3));
      if (first) render(); else { const r = findRoute(data, from, dest, mode); mv.drawRoute(r?.points); }
    }, () => { gpsNote = 'Location permission was not given, so directions start from your cottage.'; stopGps(); fromMode = 'cottage'; render(); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  };
  requestAnimationFrame(render);
}

function seenKey() { return 'seenUpdates'; }
function updatesList() {
  const anns = announcementsFor(data, guest);
  // Automatic reminders for events in the next 3 hours.
  const soon = publishedEvents(data).filter((e) => { const d = new Date(e.start) - Date.now(); return d > -15 * 60000 && d < 3 * 3600000; })
    .map((e) => ({ id: 'r-' + e.id, kind: 'reminder', title: `${e.name} ${relTime(e.start)?.toLowerCase() || 'soon'}`, body: `${fmtTime(e.start, tz)} at ${venueOf(e)?.name || 'venue TBA'}. ${walkLine(e)}`, link: venueOf(e) ? `#/nav/${venueOf(e).id}` : null, createdAt: e.start }));
  const changes = publishedEvents(data).filter((e) => e.change).map((e) => ({ id: 'c-' + e.id + e.change, kind: 'change', title: `Change: ${e.name}`, body: e.change, createdAt: e.changedAt || data.publishedAt }));
  return [...soon, ...changes, ...anns];
}
function updateBadge() {
  const seen = new Set(JSON.parse(store.get(seenKey()) || '[]'));
  const n = updatesList().filter((u) => !seen.has(u.id)).length;
  const a = document.querySelector('#tabs a[data-tab="updates"]');
  a.querySelector('.badge-n')?.remove();
  if (n && !location.hash.startsWith('#/updates')) a.insertAdjacentHTML('beforeend', `<span class="badge-n">${n}</span>`);
}
function updates() {
  const list = updatesList();
  store.set(seenKey(), JSON.stringify(list.map((u) => u.id)));
  view.innerHTML = `<div class="wrap stack fade-in"><div class="page-title"><h1>Updates</h1>${ORN}</div>
    ${list.length ? list.map((u) => `<article class="card ann k-${u.kind || 'general'}">
      <div class="eyebrow">${{ reminder: 'Reminder', change: 'Schedule change', venue: 'Venue change', general: 'Announcement', important: 'Important' }[u.kind] || 'Announcement'}</div>
      <h3 style="margin:2px 0 4px">${esc(u.title)}</h3><p>${esc(u.body)}</p>
      ${u.link ? `<a class="btn btn-sm btn-primary" href="${esc(u.link)}">Navigate</a>` : ''}</article>`).join('')
    : `<div class="empty"><h3>No updates yet</h3><p>Announcements and reminders from the family will appear here.</p></div>`}
  </div>`;
}

boot();
