import {
  loadData, openGuest, publishedEvents, nextEvent, eventEnd, fmtTime, fmtDay, dayKey, relTime, markerById,
  cottageMarker, findRoute, routeSteps, geoToMap, announcementsFor, CATEGORIES, esc,
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
  if (m) history.replaceState(null, '', '#/home');
  window.addEventListener('hashchange', route);
  route();
  setInterval(() => { if (/^#\/(home|schedule)?$/.test(location.hash) || !location.hash) route(); }, 60000);
  refreshLoop();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
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

function home() {
  const w = data.wedding, ev = nextEvent(data), v = ev && venueOf(ev);
  const days = `${fmtDay(w.startDate + 'T12:00:00+05:30', tz, { day: 'numeric' })} & ${fmtDay(w.endDate + 'T12:00:00+05:30', tz, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const rel = ev && relTime(ev.start);
  const live = ev && new Date(ev.start) <= Date.now();
  view.innerHTML = `<div class="wrap stack fade-in">
    <header class="hero">
      <div class="mono">${esc(w.couple.split('&').map((s) => s.trim()[0]).join(' · '))}</div>
      <h1>${esc(w.couple)}</h1>
      <div class="dates">${esc(days)} · ${esc(w.venueName)}</div>
    </header>
    <section class="card">
      <div class="eyebrow">${guest ? 'Welcome' : 'Welcome, guest'}</div>
      <h2 style="margin:4px 0 6px">${guest ? esc(guest.family || guest.name) : 'to the celebrations'}</h2>
      <p class="muted">${esc(w.welcome)}</p>
      ${guest ? `<div class="stay" style="margin-top:14px"><div class="badge">${esc(guest.cottage)}</div><div><div class="eyebrow">Your stay</div><div style="font-weight:600">Cottage ${esc(guest.cottage)}</div><a href="#/map/${esc(homeMarker()?.id || '')}" class="muted" style="font-size:13px">Show on map →</a></div></div>`
      : `<p class="note" style="margin-top:12px">Opened from your personal link? It shows your cottage and walking directions from it.</p>`}
    </section>
    ${ev ? `<section class="card next">
      <div class="row between"><span class="eyebrow">${live ? 'Happening now' : 'Your next event'}</span>${rel ? `<span class="pill">${esc(rel)}</span>` : ''}</div>
      <div class="time">${esc(fmtTime(ev.start, tz))}</div>
      <h2>${esc(ev.name)}</h2>
      <div class="meta"><span>${esc(fmtDay(ev.start, tz, { weekday: 'short', day: 'numeric', month: 'short' }))}</span><span>${ICON.pin} ${esc(v?.name || 'Venue to be announced')}</span><span>${walkLine(ev)}</span></div>
      ${ev.change ? `<p style="margin-top:8px"><span class="pill">Updated</span> ${esc(ev.change)}</p>` : ''}
      ${v ? `<a class="btn btn-primary btn-block" style="margin-top:16px" href="#/nav/${esc(v.id)}">Navigate to venue</a>` : ''}
    </section>` : `<section class="card"><h3>That's a wrap!</h3><p class="muted">Thank you for celebrating with us.</p></section>`}
    <section class="row" style="gap:10px">
      <a class="btn btn-ghost" style="flex:1" href="#/schedule">Full schedule</a>
      <a class="btn btn-ghost" style="flex:1" href="#/map">Resort map</a>
    </section>
    <section class="card">
      <div class="eyebrow" style="margin-bottom:6px">Need help?</div>
      ${(w.contacts || []).map((c) => `<div class="contact"><span>${esc(c.name)}</span><span class="row" style="gap:8px"><a class="btn btn-sm btn-ghost" href="tel:${esc(c.phone)}">Call</a><a class="btn btn-sm btn-ghost" href="https://wa.me/${esc(c.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp</a></span></div>`).join('')}
      ${w.mapsQuery ? `<div class="contact"><span>Getting to the resort</span><a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(w.mapsQuery)}">Google Maps</a></div>` : ''}
    </section>
  </div>`;
}

function schedule() {
  const evs = publishedEvents(data), nx = nextEvent(data);
  if (!evs.length) { view.innerHTML = `<div class="wrap"><div class="empty"><h2>Schedule coming soon</h2><p>Check back shortly.</p></div></div>`; return; }
  const byDay = {};
  for (const e of evs) (byDay[dayKey(e.start, tz)] ||= []).push(e);
  view.innerHTML = `<div class="wrap fade-in"><h1 style="margin:6px 0 4px">Schedule</h1><p class="muted">All times are India time (IST).</p>
    ${Object.entries(byDay).map(([d, list], i) => `<section>
      <div class="day-head"><h2>Day ${i + 1}</h2><span class="muted">${esc(fmtDay(list[0].start, tz))}</span></div>
      <div class="stack">${list.map((e) => {
        const v = venueOf(e), past = new Date(eventEnd(e)) < Date.now();
        return `<article class="card ev ${past ? 'past' : ''} ${nx?.id === e.id ? 'is-next' : ''}">
          <div class="t">${esc(fmtTime(e.start, tz).replace(/ (AM|PM)/, ''))}<small>${esc(fmtTime(e.start, tz).slice(-2))}${e.end ? ` – ${esc(fmtTime(e.end, tz))}` : ' onwards'}</small></div>
          <div>
            ${nx?.id === e.id ? '<div class="tag">Up next</div>' : ''}
            <h3>${esc(e.name)}</h3>
            <div class="muted" style="font-size:14px">${ICON.pin} ${esc(v?.name || 'Venue TBA')}${!past ? ` · ${walkLine(e).replace(ICON.walk + ' ', '')}` : ''}</div>
            ${e.change ? `<div class="changed">Updated: ${esc(e.change)}</div>` : ''}
            ${e.description ? `<p style="font-size:14px">${esc(e.description)}</p>` : ''}
            ${e.dress ? `<p style="font-size:13px"><b>Dress code:</b> ${esc(e.dress)}</p>` : ''}
            ${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy" style="width:100%;border-radius:12px;margin-top:6px">` : ''}
            ${v && !past ? `<a class="btn btn-sm btn-primary" style="margin-top:8px" href="#/nav/${esc(v.id)}">Navigate</a>` : ''}
          </div></article>`;
      }).join('')}</div></section>`).join('')}
  </div>`;
}

function mountMap() {
  view.innerHTML = `<div class="mapscreen"><div id="mapHost" style="position:absolute;inset:0"></div>
    <div class="map-top" id="mapTop"></div>
    <div class="map-ctrl"><button id="zin" aria-label="Zoom in">+</button><button id="zout" aria-label="Zoom out">−</button><button id="zfit" aria-label="Show whole map">⤢</button></div>
    <div id="sheet"></div></div>`;
  mapView = new MapView($('#mapHost'), { src: data.map.src, width: data.map.width, height: data.map.height });
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
      <div class="row between"><div><div class="eyebrow">Directions to</div><h3>${esc(dest.name)}</h3></div><a href="#/map" class="btn btn-sm btn-ghost">Close</a></div>
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
  view.innerHTML = `<div class="wrap stack fade-in"><h1 style="margin-top:6px">Updates</h1>
    ${list.length ? list.map((u) => `<article class="card ann k-${u.kind || 'general'}">
      <div class="eyebrow">${{ reminder: 'Reminder', change: 'Schedule change', venue: 'Venue change', general: 'Announcement', important: 'Important' }[u.kind] || 'Announcement'}</div>
      <h3 style="margin:2px 0 4px">${esc(u.title)}</h3><p>${esc(u.body)}</p>
      ${u.link ? `<a class="btn btn-sm btn-primary" href="${esc(u.link)}">Navigate</a>` : ''}</article>`).join('')
    : `<div class="empty"><h3>No updates yet</h3><p>Announcements and reminders from the family will appear here.</p></div>`}
  </div>`;
}

boot();
