import {
  loadData, openAdmin, buildPublic, randomToken, uid, fmtTime, fmtDay, toIso, fromIso, markerById, cottageMarker,
  findRoute, routeSteps, CATEGORIES, esc, b64, publishedEvents, THEMES,
} from './core.js';
import { MapView } from './map.js';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
let S, password, published, dirty = false, tab = 'overview', mapFile = null;

// ---------- Login ----------
$('#login').onsubmit = async (e) => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    published = await loadData();
    const pw = $('#pw').value;
    const priv = await openAdmin(published.admin, pw);
    password = pw;
    const { guests, admin, publishedAt, ...pub } = published;
    S = { ...structuredClone(pub), guests: priv.guests, secrets: priv.secrets || {} };
    S.secrets.publicUrl ||= new URL('index.html', location.href).href;
    window.addEventListener('beforeunload', (ev) => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });
    window.addEventListener('hashchange', () => { tab = location.hash.slice(2) || 'overview'; render(); });
    tab = location.hash.slice(2) || 'overview';
    render();
  } catch (err) {
    $('#loginErr').textContent = err?.name === 'OperationError' ? 'Wrong password.' : 'Could not load the data: ' + err.message;
  }
};

// ---------- Helpers ----------
const toast = (msg) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };
const changed = () => { dirty = true; const d = $('#dirty'); if (d) d.textContent = 'Unpublished changes'; };
const linkFor = (g) => `${S.secrets.publicUrl}#/g/${g.token}`;
const tz = () => S.wedding.timezone || 'Asia/Kolkata';
const loadScript = (src) => new Promise((res, rej) => { if ([...document.scripts].some((s) => s.src === src)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
const LIB = {
  qr: new URL('vendor/qrcode.js', location.href).href,
  xlsx: new URL('vendor/xlsx.full.min.js', location.href).href,
  pdf: new URL('vendor/pdf.min.js', location.href).href,
  pdfWorker: new URL('vendor/pdf.worker.min.js', location.href).href,
};
async function qrSvg(text, cell = 6) { await loadScript(LIB.qr); const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true }); }
function modal(html, onMount) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="card stack">${html}</div>`;
  m.onclick = (e) => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); };
  document.body.appendChild(m); onMount?.(m); return m;
}
const download = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
const formData = (form) => Object.fromEntries(new FormData(form).entries());
const placeOptions = (sel, filter = () => true) => S.markers.filter(filter).sort((a, b) => (a.category === 'venue' ? 0 : 1) - (b.category === 'venue' ? 0 : 1) || a.name.localeCompare(b.name))
  .map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}${m.category !== 'venue' ? ` (${CATEGORIES[m.category]?.label})` : ''}</option>`).join('');

// ---------- Shell ----------
const TABS = [['overview', 'Overview'], ['guests', 'Guests'], ['events', 'Events'], ['places', 'Map & places'], ['paths', 'Walking paths'], ['announce', 'Announcements'], ['settings', 'Settings']];
function render() {
  app.innerHTML = `<div class="shell">
    <nav class="side"><h2>${esc(S.wedding.couple)}</h2>${TABS.map(([k, l]) => `<a href="#/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}
      <a href="index.html" target="_blank">Open guest app ↗</a></nav>
    <div class="main">
      <div class="topbar"><div><b>${TABS.find((t) => t[0] === tab)?.[1] || ''}</b> <span id="dirty" class="dirty">${dirty ? 'Unpublished changes' : ''}</span></div>
        <div class="row"><span class="muted hide-sm" style="font-size:12px">${published.publishedAt ? 'Last published ' + new Date(published.publishedAt).toLocaleString() : ''}</span><button class="btn btn-primary" id="publish">Publish</button></div></div>
      <div class="content" id="content"></div>
    </div></div>`;
  $('#publish').onclick = publish;
  ({ overview, guests, events, places, paths, announce, settings }[tab] || overview)($('#content'));
}

// ---------- Publish ----------
async function ghPut(path, contentB64, message) {
  const { repo, branch = 'main', token } = S.secrets.github;
  const api = `https://api.github.com/repos/${repo}/contents/${path}`;
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const cur = await fetch(`${api}?ref=${branch}`, { headers: h });
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const r = await fetch(api, { method: 'PUT', headers: h, body: JSON.stringify({ message, content: contentB64, branch, sha }) });
  if (!r.ok) throw new Error(`GitHub said ${r.status}: ${(await r.json().catch(() => ({}))).message || ''}`);
}
async function publish() {
  const btn = $('#publish'); btn.disabled = true; btn.textContent = 'Publishing…';
  try {
    if (mapFile) S.map.src = `data/${mapFile.name}`;
    const pub = await buildPublic(S, password);
    const json = JSON.stringify(pub);
    const gh = S.secrets.github;
    if (gh?.token && gh?.repo) {
      if (mapFile) await ghPut(`data/${mapFile.name}`, b64.to(await mapFile.blob.arrayBuffer()), 'Update property map');
      await ghPut('data/wedding.json', b64.to(new TextEncoder().encode(json)), 'Update wedding details');
      toast('Published. Guests will see the changes within about 2 minutes.');
    } else {
      if (mapFile) download(mapFile.name, mapFile.blob);
      download('wedding.json', new Blob([json], { type: 'application/json' }));
      toast('Downloaded wedding.json. Upload it to the site\'s data folder, or set up publishing under Settings.');
    }
    published = pub; mapFile = null; dirty = false; render();
  } catch (e) { toast('Publish failed: ' + e.message); btn.disabled = false; btn.textContent = 'Publish'; }
}

// ---------- Overview ----------
function overview(c) {
  const evs = publishedEvents(S);
  const unplaced = S.guests.filter((g) => !cottageMarker(S, g.cottage));
  c.innerHTML = `<div class="stack">
    <div class="grid3">
      <div class="card"><div class="eyebrow">Guests</div><h1>${S.guests.length}</h1><p class="muted">${S.guests.reduce((s, g) => s + (+g.party || 1), 0)} people</p></div>
      <div class="card"><div class="eyebrow">Events</div><h1>${evs.length}</h1><p class="muted">${S.events.length - evs.length} unpublished</p></div>
      <div class="card"><div class="eyebrow">Places on map</div><h1>${S.markers.length}</h1><p class="muted">${S.graph.edges.length} path segments</p></div>
    </div>
    ${unplaced.length ? `<div class="card"><b>${unplaced.length} guest(s) have a cottage that isn't on the map:</b> ${unplaced.map((g) => esc(`${g.family || g.name} (${g.cottage || 'none'})`)).join(', ')}. Add the cottage under Map & places, or fix the cottage number.</div>` : ''}
    ${!S.secrets.github?.token ? `<div class="card"><b>One-click publishing is off.</b> Right now Publish downloads a file. Go to <a href="#/settings">Settings</a> to connect GitHub so Publish updates the live site straight away.</div>` : ''}
    <div class="card"><h3>Schedule at a glance</h3><table style="margin-top:10px"><tbody>${evs.map((e) => `<tr><td>${esc(fmtDay(e.start, tz(), { weekday: 'short', day: 'numeric', month: 'short' }))}</td><td>${esc(fmtTime(e.start, tz()))}</td><td><b>${esc(e.name)}</b></td><td>${esc(markerById(S, e.venue)?.name || '—')}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
}

// ---------- Guests ----------
function guests(c) {
  let q = '', grp = '';
  const groups = [...new Set(S.guests.map((g) => g.group).filter(Boolean))];
  c.innerHTML = `<div class="toolbar">
      <input id="gq" placeholder="Search name, family or cottage" style="max-width:280px">
      <select id="gg" style="max-width:180px"><option value="">All groups</option>${groups.map((g) => `<option>${esc(g)}</option>`).join('')}</select>
      <button class="btn btn-primary btn-sm" id="gadd">Add guest</button>
      <label class="btn btn-ghost btn-sm">Import CSV / Excel<input type="file" id="gimp" accept=".csv,.xlsx,.xls" hidden></label>
      <button class="btn btn-ghost btn-sm" id="gprint">Print QR cards</button>
      <button class="btn btn-ghost btn-sm" id="gexport">Export links (CSV)</button>
    </div><div id="glist"></div>
    <p class="muted" style="margin-top:10px;font-size:12px">Import columns (any order, header row needed): name, family, cottage, group, phone, party. Guest links are private. Anyone with a link sees that guest's cottage.</p>`;
  const list = () => {
    const rows = S.guests.filter((g) => (!grp || g.group === grp) && (!q || `${g.name} ${g.family} ${g.cottage}`.toLowerCase().includes(q)));
    $('#glist').innerHTML = rows.length ? `<table><thead><tr><th>Family / guest</th><th>Cottage</th><th class="hide-sm">Group</th><th class="hide-sm">Party</th><th></th></tr></thead><tbody>${rows.map((g) => `<tr data-id="${g.id}">
      <td><b>${esc(g.family || g.name)}</b><div class="muted" style="font-size:12px">${esc(g.family ? g.name : '')}${g.phone ? ' · ' + esc(g.phone) : ''}</div></td>
      <td>${esc(g.cottage)}${cottageMarker(S, g.cottage) ? '' : ' <span class="changed" title="Not on map">!</span>'}</td><td class="hide-sm">${esc(g.group || '')}</td><td class="hide-sm">${esc(g.party || '')}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn btn-sm btn-ghost" data-a="link">Link & QR</button> <button class="btn btn-sm btn-ghost" data-a="edit">Edit</button></td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">No guests match. Add one or import a list.</div>`;
  };
  list();
  $('#gq').oninput = (e) => { q = e.target.value.toLowerCase(); list(); };
  $('#gg').onchange = (e) => { grp = e.target.value; list(); };
  $('#gadd').onclick = () => editGuest(null, list);
  $('#glist').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const g = S.guests.find((x) => x.id === b.closest('tr').dataset.id);
    if (b.dataset.a === 'edit') editGuest(g, list); else guestLink(g);
  };
  $('#gimp').onchange = (e) => importGuests(e.target.files[0]).then(list);
  $('#gexport').onclick = () => {
    const csv = [['family', 'name', 'cottage', 'group', 'phone', 'link'], ...S.guests.map((g) => [g.family, g.name, g.cottage, g.group, g.phone, linkFor(g)])]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    download('guest-links.csv', new Blob([csv], { type: 'text/csv' }));
  };
  $('#gprint').onclick = printCards;
}
function editGuest(g, after) {
  const isNew = !g; g ||= { id: uid(), token: randomToken(12), party: 1 };
  modal(`<h3>${isNew ? 'Add guest' : 'Edit guest'}</h3>
    <form class="stack" id="gf">
      <div class="grid2"><label class="f">Family name<input name="family" value="${esc(g.family || '')}" placeholder="Mehta Family"></label><label class="f">Main guest<input name="name" value="${esc(g.name || '')}" required></label></div>
      <div class="grid2"><label class="f">Cottage<input name="cottage" value="${esc(g.cottage || '')}" placeholder="15B" required></label><label class="f">Group<input name="group" value="${esc(g.group || '')}" placeholder="Bride side" list="grps"></label></div>
      <datalist id="grps">${[...new Set(S.guests.map((x) => x.group).filter(Boolean))].map((x) => `<option>${esc(x)}</option>`).join('')}</datalist>
      <div class="grid2"><label class="f">WhatsApp / phone (with country code)<input name="phone" value="${esc(g.phone || '')}" placeholder="+91 98765 43210"></label><label class="f">People in party<input name="party" type="number" min="1" value="${esc(g.party || 1)}"></label></div>
      <div class="row between"><div>${isNew ? '' : '<button type="button" class="btn btn-ghost btn-sm" id="gdel" style="color:var(--danger)">Delete</button> <button type="button" class="btn btn-ghost btn-sm" id="greset">New link</button>'}</div>
      <div class="row"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Save</button></div></div>
    </form>`, (m) => {
    $('#gf', m).onsubmit = (e) => { e.preventDefault(); Object.assign(g, formData(e.target)); g.cottage = g.cottage.toUpperCase().replace(/\s/g, ''); if (isNew) S.guests.push(g); changed(); m.remove(); after(); };
    $('#gdel', m) && ($('#gdel', m).onclick = () => { if (confirm(`Delete ${g.family || g.name}?`)) { S.guests = S.guests.filter((x) => x !== g); changed(); m.remove(); after(); } });
    $('#greset', m) && ($('#greset', m).onclick = () => { if (confirm('Make a new link? The old link will stop working after you publish.')) { g.token = randomToken(12); changed(); toast('New link created. Publish to activate it.'); } });
  });
}
async function guestLink(g) {
  const link = linkFor(g), svg = await qrSvg(link);
  const msg = `Hi ${g.name?.split(' ')[0] || ''}! Here's your personal guide for ${S.wedding.title}: your cottage, the schedule and directions to every event. ${link}`;
  const phone = (g.phone || '').replace(/\D/g, '');
  modal(`<h3>${esc(g.family || g.name)} · Cottage ${esc(g.cottage)}</h3>
    <div style="width:220px;margin:0 auto">${svg}</div>
    <input readonly value="${esc(link)}" onclick="this.select()">
    <div class="row" style="flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="cp">Copy link</button>
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${encodeURIComponent(msg)}">Send on WhatsApp</a>
      <button class="btn btn-ghost btn-sm" id="dl">Download QR</button><button class="btn btn-ghost btn-sm" data-close>Close</button></div>
    ${dirty ? '<p class="note">Publish first. New guests\' links only work after publishing.</p>' : ''}`, (m) => {
    $('#cp', m).onclick = () => navigator.clipboard.writeText(link).then(() => toast('Link copied'));
    $('#dl', m).onclick = () => download(`QR-${(g.family || g.name).replace(/\W+/g, '-')}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
  });
}
async function printCards() {
  await loadScript(LIB.qr);
  const cards = await Promise.all(S.guests.map(async (g) => `<div class="c"><div class="n">${esc(S.wedding.couple)}</div><div class="q">${await qrSvg(linkFor(g), 4)}</div><b>${esc(g.family || g.name)}</b><div>Cottage ${esc(g.cottage)}</div><small>Scan for your schedule, map & directions</small></div>`));
  const w = window.open('', '_blank');
  w.document.write(`<title>QR cards</title><style>body{font-family:Georgia,serif;margin:0}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:0}.c{border:1px dashed #ccc;padding:18px;text-align:center;page-break-inside:avoid}.n{font-size:20px;color:#2f5d46;margin-bottom:6px}.q svg{width:150px;height:150px}small{color:#666}</style><div class="g">${cards.join('')}</div><script>setTimeout(()=>print(),400)<\/script>`);
  w.document.close();
}
async function importGuests(file) {
  if (!file) return;
  let rows;
  try {
    if (/\.xlsx?$/i.test(file.name)) { await loadScript(LIB.xlsx); const wb = XLSX.read(await file.arrayBuffer()); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }); }
    else rows = parseCsv(await file.text());
  } catch (e) { toast('Could not read file: ' + e.message); return; }
  const pick = (r, ...keys) => { for (const k of Object.keys(r)) if (keys.includes(k.toLowerCase().trim())) return String(r[k]).trim(); return ''; };
  let added = 0, updated = 0;
  for (const r of rows) {
    const g = { name: pick(r, 'name', 'guest', 'guest name', 'main guest'), family: pick(r, 'family', 'family name'), cottage: pick(r, 'cottage', 'cottage number', 'room').toUpperCase().replace(/\s/g, ''), group: pick(r, 'group', 'side'), phone: pick(r, 'phone', 'whatsapp', 'mobile'), party: pick(r, 'party', 'people', 'count') || 1 };
    if (!g.name && !g.family) continue;
    const ex = S.guests.find((x) => (x.name || '').toLowerCase() === g.name.toLowerCase() && (x.family || '').toLowerCase() === g.family.toLowerCase());
    if (ex) { Object.assign(ex, g); updated++; } else { S.guests.push({ id: uid(), token: randomToken(12), ...g }); added++; }
  }
  changed(); toast(`Imported: ${added} added, ${updated} updated`);
}
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// ---------- Events ----------
function events(c) {
  const evs = [...S.events].sort((a, b) => a.start.localeCompare(b.start));
  c.innerHTML = `<div class="toolbar"><button class="btn btn-primary btn-sm" id="eadd">Add event</button><span class="muted">Times are in ${esc(tz())}.</span></div>
    ${evs.length ? `<table><thead><tr><th>When</th><th>Event</th><th class="hide-sm">Venue</th><th>Status</th><th></th></tr></thead><tbody>${evs.map((e) => `<tr data-id="${e.id}">
      <td>${esc(fmtDay(e.start, tz(), { weekday: 'short', day: 'numeric', month: 'short' }))}<div class="muted">${esc(fmtTime(e.start, tz()))}${e.end ? ' – ' + esc(fmtTime(e.end, tz())) : ' onwards'}</div></td>
      <td><b>${esc(e.name)}</b>${e.change ? `<div class="changed">${esc(e.change)}</div>` : ''}</td><td class="hide-sm">${esc(markerById(S, e.venue)?.name || '—')}</td>
      <td>${e.published === false ? '<span class="muted">Hidden</span>' : '<span class="tag">Live</span>'}</td><td style="text-align:right"><button class="btn btn-sm btn-ghost">Edit</button></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">No events yet.</div>'}`;
  $('#eadd').onclick = () => editEvent(null, () => events(c));
  c.querySelector('tbody')?.addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr && e.target.closest('button')) editEvent(S.events.find((x) => x.id === tr.dataset.id), () => events(c)); });
}
function editEvent(ev, after) {
  const isNew = !ev; ev ||= { id: uid(), published: true, start: toIso(S.wedding.startDate, '10:00') };
  const s = fromIso(ev.start, tz()), en = ev.end ? fromIso(ev.end, tz()) : null;
  const old = { start: ev.start, venue: ev.venue };
  modal(`<h3>${isNew ? 'Add event' : 'Edit event'}</h3><form class="stack" id="ef">
    <label class="f">Event name<input name="name" value="${esc(ev.name || '')}" required></label>
    <div class="grid3"><label class="f">Date<input type="date" name="date" value="${s.date}" required></label><label class="f">Starts<input type="time" name="start" value="${s.time}" required></label><label class="f">Ends (optional)<input type="time" name="end" value="${en?.time || ''}"></label></div>
    <label class="f">Look (artwork from the invitation)<select name="theme">${Object.entries(THEMES).map(([k, t]) => `<option value="${k}" ${(ev.theme || 'wedding') === k ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
    <label class="f">Venue<select name="venue" required><option value="">Choose a place on the map…</option>${placeOptions(ev.venue)}</select></label>
    <label class="f">Description<textarea name="description" rows="3">${esc(ev.description || '')}</textarea></label>
    <div class="grid2"><label class="f">Dress code (optional)<input name="dress" value="${esc(ev.dress || '')}"></label><label class="f">Venue image URL (optional)<input name="image" value="${esc(ev.image || '')}"></label></div>
    <label class="f">Change note shown to guests (optional)<input name="change" value="${esc(ev.change || '')}" placeholder="Now starting at 11:30 AM"></label>
    <label class="row" style="gap:8px"><input type="checkbox" name="published" style="width:auto" ${ev.published !== false ? 'checked' : ''}> Show to guests</label>
    <div class="row between"><div>${isNew ? '' : '<button type="button" class="btn btn-ghost btn-sm" id="edel" style="color:var(--danger)">Delete</button>'}</div><div class="row"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Save</button></div></div>
  </form>`, (m) => {
    $('#ef', m).onsubmit = (e) => {
      e.preventDefault();
      const d = formData(e.target);
      Object.assign(ev, { name: d.name, theme: d.theme, venue: d.venue, description: d.description, dress: d.dress, image: d.image, change: d.change, published: !!d.published,
        start: toIso(d.date, d.start), end: d.end ? toIso(d.date, d.end) : null });
      if (!isNew && !d.change && (ev.start !== old.start || ev.venue !== old.venue)) {
        // Make sure guests hear about time/venue moves even if the admin forgets a note.
        ev.change = ev.venue !== old.venue ? `Venue changed to ${markerById(S, ev.venue)?.name}` : `Time changed to ${fmtTime(ev.start, tz())}`;
      }
      if (ev.change !== (old.change ?? ev.change)) ev.changedAt = new Date().toISOString();
      if (ev.change) ev.changedAt ||= new Date().toISOString();
      if (isNew) S.events.push(ev);
      changed(); m.remove(); after();
    };
    $('#edel', m) && ($('#edel', m).onclick = () => { if (confirm('Delete this event?')) { S.events = S.events.filter((x) => x !== ev); changed(); m.remove(); after(); } });
  });
}

// ---------- Map & places ----------
function mapEditor(c, { toolbar, panel, legend = '' }) {
  c.innerHTML = `<div class="toolbar">${toolbar}</div>${legend}<div class="editor"><div class="mapbox" id="emap"></div><div class="panel card" id="epanel">${panel}</div></div>`;
  const mv = new MapView($('#emap'), { src: mapFile?.url || S.map.src, width: S.map.width, height: S.map.height });
  return mv;
}
function places(c) {
  let sel = null, adding = false, drag = null;
  const mv = mapEditor(c, {
    toolbar: `<button class="btn btn-primary btn-sm" id="padd">+ Add place</button>
      <label class="btn btn-ghost btn-sm">Replace map (PDF or image)<input type="file" id="pmap" accept="application/pdf,image/*" hidden></label>
      <button class="btn btn-ghost btn-sm" id="pscale">Set scale</button><button class="btn btn-ghost btn-sm" id="pgeo">GPS setup</button>
      <select id="pfind" style="max-width:220px"><option value="">Find a place…</option>${placeOptions(null)}</select>`,
    panel: '<p class="muted">Click a place to edit it. Drag places to move them. Click <b>+ Add place</b>, then click the map to drop a new one.</p>',
  });
  const draw = () => mv.drawMarkers(S.markers, { highlight: [sel], labels: 'all' });
  const edit = (m) => {
    sel = m.id; draw();
    $('#epanel').innerHTML = `<form class="stack" id="pf"><h3>Edit place</h3>
      <label class="f">Name<input name="name" value="${esc(m.name)}" required></label>
      <label class="f">Category<select name="category">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${k === m.category ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label class="f">Cottage number (cottages only)<input name="code" value="${esc(m.code || '')}" placeholder="15 or 15B"></label>
      <label class="f">Description<textarea name="description" rows="3">${esc(m.description || '')}</textarea></label>
      <div class="grid2"><label class="f">Latitude (optional)<input name="lat" value="${esc(m.lat || '')}"></label><label class="f">Longitude<input name="lng" value="${esc(m.lng || '')}"></label></div>
      <p class="muted" style="font-size:12px">With latitude/longitude set, guests also get an "Open in Google Maps" button.</p>
      <div class="row between"><button type="button" class="btn btn-ghost btn-sm" id="pdel" style="color:var(--danger)">Delete</button><button class="btn btn-primary btn-sm">Save</button></div></form>`;
    $('#pf').onsubmit = (e) => { e.preventDefault(); const d = formData(e.target); Object.assign(m, d, { lat: d.lat ? +d.lat : undefined, lng: d.lng ? +d.lng : undefined }); changed(); draw(); toast('Saved'); };
    $('#pdel').onclick = () => {
      const used = S.events.filter((e) => e.venue === m.id);
      if (used.length) return toast(`Used by ${used.map((e) => e.name).join(', ')}. Change those events first.`);
      if (confirm(`Delete ${m.name}?`)) { S.markers = S.markers.filter((x) => x !== m); sel = null; changed(); draw(); $('#epanel').innerHTML = '<p class="muted">Deleted.</p>'; }
    };
  };
  mv.onMarker = (id) => edit(markerById(S, id));
  mv.onTap = (p) => {
    if (!adding) return;
    adding = false; $('#padd').classList.remove('on');
    const m = { id: uid(), category: 'other', name: 'New place', x: Math.round(p.x), y: Math.round(p.y) };
    S.markers.push(m); changed(); edit(m);
  };
  mv.onPointer = (phase, e, p, moved) => {
    if (phase === 'down') { const t = e.target.closest('[data-marker]'); if (!t) return false; drag = markerById(S, t.dataset.marker); return true; }
    if (phase === 'move' && drag) { drag.x = Math.round(p.x); drag.y = Math.round(p.y); draw(); }
    if (phase === 'up' && drag) { const m = drag; drag = null; if (moved > 4) changed(); edit(m); }
  };
  draw(); requestAnimationFrame(() => mv.fit());
  $('#padd').onclick = (e) => { adding = true; e.target.classList.add('on'); toast('Click on the map to place it'); };
  $('#pfind').onchange = (e) => { const m = markerById(S, e.target.value); if (m) { mv.focus([m], 80, 2); edit(m); } };
  $('#pmap').onchange = (e) => replaceMap(e.target.files[0]).then(() => places(c));
  $('#pscale').onclick = () => pickPoints(mv, 2, 'Click two points you know the real distance between (e.g. the two ends of the Banquet Hall).', ([a, b]) => {
    const m = parseFloat(prompt('Real distance between them in metres?', '36'));
    if (m > 0) { S.map.metersPerPixel = +(m / Math.hypot(a.x - b.x, a.y - b.y)).toFixed(4); changed(); toast(`Scale set: 1 px = ${S.map.metersPerPixel} m`); }
  });
  $('#pgeo').onclick = () => modal(`<h3>GPS setup (optional)</h3><p>This lets guests see their live position on the map. You need the real latitude/longitude of two spots far apart on the map, such as the main gate and the Temple. Get them by long-pressing each spot in Google Maps.</p>
    <p class="note">${S.map.geo ? 'GPS is set up.' : 'Not set up. Directions start from the guest\'s cottage, which is fine.'}</p>
    <div class="row"><button class="btn btn-primary btn-sm" id="gstart" data-close>Pick two points</button>${S.map.geo ? '<button class="btn btn-ghost btn-sm" id="goff" data-close>Turn off GPS</button>' : ''}<button class="btn btn-ghost btn-sm" data-close>Cancel</button></div>`, (m) => {
    $('#gstart', m).onclick = () => pickPoints(mv, 2, 'Click the first known spot, then the second.', (pts) => {
      const geo = [];
      for (const [i, p] of pts.entries()) {
        const v = prompt(`Latitude, longitude of point ${i + 1} (e.g. 22.5134, 72.8790)`); if (!v) return;
        const [lat, lng] = v.split(',').map(Number); if (!isFinite(lat) || !isFinite(lng)) return toast('Could not read that.');
        geo.push({ x: Math.round(p.x), y: Math.round(p.y), lat, lng });
      }
      S.map.geo = geo; changed(); toast('GPS set up');
    });
    $('#goff', m) && ($('#goff', m).onclick = () => { S.map.geo = null; changed(); });
  });
}
function pickPoints(mv, n, msg, done) {
  toast(msg);
  const pts = [], prevTap = mv.onTap, prevMk = mv.onMarker;
  const take = (p) => { pts.push(p); if (pts.length === n) { mv.onTap = prevTap; mv.onMarker = prevMk; done(pts); } };
  mv.onTap = take; mv.onMarker = (id, e) => take(mv.toMap(e.clientX, e.clientY));
}
async function replaceMap(file) {
  if (!file) return;
  toast('Processing map…');
  let canvas;
  try {
    if (file.type === 'application/pdf') {
      await loadScript(LIB.pdf);
      pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.pdfWorker;
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(4, 3200 / Math.max(base.width, base.height)) });
      canvas = Object.assign(document.createElement('canvas'), { width: vp.width, height: vp.height });
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    } else {
      const img = await createImageBitmap(file);
      const k = Math.min(1, 3200 / Math.max(img.width, img.height));
      canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    }
  } catch (e) { toast('Could not read that file: ' + e.message); return; }
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
  const { width: W, height: H } = canvas;
  if (S.markers.length && confirm('Keep existing places and paths, scaled to the new map? (Choose OK if it\'s the same layout.)')) {
    const kx = W / S.map.width, ky = H / S.map.height;
    for (const p of [...S.markers, ...S.graph.nodes, ...(S.map.geo || [])]) { p.x = Math.round(p.x * kx); p.y = Math.round(p.y * ky); }
    S.map.metersPerPixel = +(S.map.metersPerPixel / ((kx + ky) / 2)).toFixed(4);
  }
  mapFile = { name: `map-${Date.now()}.jpg`, blob, url: URL.createObjectURL(blob) };
  Object.assign(S.map, { width: W, height: H });
  changed(); toast('Map replaced. Publish to make it live.');
}

// ---------- Walking paths ----------
function paths(c) {
  let sel = null, drag = null, testRoute = null;
  const mv = mapEditor(c, {
    toolbar: `<span class="muted">Click empty map to add a point. Click a point, then another, to connect them. Drag points to move them. Click a line to edit it.</span>`,
    legend: `<div class="legend" style="margin-bottom:10px"><span><i style="background:#1a73e8"></i>Walk & vehicle</span><span><i style="background:#2f9e5b"></i>Walk only</span><span><i style="background:#7a4fd6"></i>Vehicle only</span><span><i style="background:#b3261e"></i>Closed / restricted</span></div>`,
    panel: '',
  });
  const nodeById = (id) => S.graph.nodes.find((n) => n.id === id);
  const draw = () => { mv.drawGraph(S.graph, { selected: sel }); mv.drawMarkers(S.markers.filter((m) => m.category !== 'cottage' || testRoute), { labels: 'venue' }); mv.drawRoute(testRoute?.points); };
  const panel = () => {
    const e = S.graph.edges.find((x) => x.id === sel), n = nodeById(sel);
    $('#epanel').innerHTML = `${e ? `<h3>Path segment</h3><div class="stack" style="margin-top:10px">
        <label class="f">Who can use it<select id="etype">${[['both', 'Walk & vehicle'], ['walk', 'Walk only'], ['vehicle', 'Vehicle only']].map(([k, l]) => `<option value="${k}" ${e.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="row" style="gap:8px"><input type="checkbox" id="erest" style="width:auto" ${e.restricted ? 'checked' : ''}> Closed / restricted (never used for routes)</label>
        <button class="btn btn-ghost btn-sm" id="edel" style="color:var(--danger)">Delete segment</button></div>`
      : n ? `<h3>Path point</h3><p class="muted">Click another point to connect it, or click empty map to extend the path from here.</p><button class="btn btn-ghost btn-sm" id="ndel" style="color:var(--danger)">Delete point</button> <button class="btn btn-ghost btn-sm" id="ndesel">Done</button>`
      : '<p class="muted">Nothing selected.</p>'}
      <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
      <h3>Test a route</h3><div class="stack" style="margin-top:8px">
        <label class="f">From<select id="tfrom">${placeOptions(testRoute?.from)}</select></label>
        <label class="f">To<select id="tto">${placeOptions(testRoute?.to || 'jalsa')}</select></label>
        <button class="btn btn-primary btn-sm" id="tgo">Show route</button>
        ${testRoute ? (testRoute.points ? `<p><b>${testRoute.minutes} min</b> · ${Math.round(testRoute.meters)} m</p><ol class="steps">${testRoute.steps.map((s) => `<li>${esc(s.text)}</li>`).join('')}</ol>` : '<p class="changed">No route found. Connect these places to the path network.</p>') : ''}
      </div>`;
    $('#etype') && ($('#etype').onchange = (ev) => { e.type = ev.target.value; changed(); draw(); });
    $('#erest') && ($('#erest').onchange = (ev) => { e.restricted = ev.target.checked; changed(); draw(); });
    $('#edel') && ($('#edel').onclick = () => { S.graph.edges = S.graph.edges.filter((x) => x !== e); sel = null; changed(); draw(); panel(); });
    $('#ndel') && ($('#ndel').onclick = () => { S.graph.nodes = S.graph.nodes.filter((x) => x !== n); S.graph.edges = S.graph.edges.filter((x) => x.a !== n.id && x.b !== n.id); sel = null; changed(); draw(); panel(); });
    $('#ndesel') && ($('#ndesel').onclick = () => { sel = null; draw(); panel(); });
    $('#tgo').onclick = () => {
      const f = markerById(S, $('#tfrom').value), t = markerById(S, $('#tto').value);
      const r = findRoute(S, f, t);
      testRoute = { from: f.id, to: t.id, ...(r ? { ...r, steps: routeSteps(S, r, f.name, t.name) } : {}) };
      draw(); panel(); if (r) mv.focus(r.points, 40);
    };
  };
  mv.onPointer = (phase, e, p, moved) => {
    if (phase === 'down') {
      const t = e.target.closest('[data-node]');
      if (t) { drag = nodeById(t.dataset.node); return true; }
      const ed = e.target.closest('[data-edge]');
      if (ed) { sel = ed.dataset.edge; draw(); panel(); return true; }
      return false;
    }
    if (phase === 'move' && drag) { drag.x = Math.round(p.x); drag.y = Math.round(p.y); draw(); }
    if (phase === 'up' && drag) {
      const n = drag; drag = null;
      if (moved > 4) { changed(); return; }
      const prev = nodeById(sel);
      if (prev && prev !== n && !S.graph.edges.some((x) => (x.a === prev.id && x.b === n.id) || (x.b === prev.id && x.a === n.id))) {
        S.graph.edges.push({ id: uid(), a: prev.id, b: n.id, type: 'walk', restricted: false }); changed();
      }
      sel = n.id; testRoute = null; draw(); panel();
    }
  };
  mv.onTap = (p) => {
    const n = { id: uid(), x: Math.round(p.x), y: Math.round(p.y) };
    S.graph.nodes.push(n);
    const prev = nodeById(sel);
    if (prev) S.graph.edges.push({ id: uid(), a: prev.id, b: n.id, type: 'walk', restricted: false });
    sel = n.id; testRoute = null; changed(); draw(); panel();
  };
  draw(); panel(); requestAnimationFrame(() => mv.fit());
}

// ---------- Announcements ----------
function announce(c) {
  const list = [...S.announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const aud = (a) => a.audience?.type === 'cottages' ? `Cottages: ${a.audience.values.join(', ')}` : a.audience?.type === 'groups' ? `Groups: ${a.audience.values.join(', ')}` : 'All guests';
  c.innerHTML = `<div class="toolbar"><button class="btn btn-primary btn-sm" id="aadd">New announcement</button><span class="muted">Guests see these under Updates. Schedule changes and reminders show there automatically.</span></div>
    ${list.length ? `<div class="stack">${list.map((a) => `<div class="card ann k-${a.kind}" data-id="${a.id}"><div class="row between"><div><div class="eyebrow">${esc(aud(a))} · ${new Date(a.createdAt).toLocaleString()}</div><h3>${esc(a.title)}</h3></div><button class="btn btn-sm btn-ghost">Edit</button></div><p>${esc(a.body)}</p>${a.published === false ? '<span class="muted">Hidden</span>' : ''}</div>`).join('')}</div>` : '<div class="empty">No announcements yet.</div>'}
    <div class="card" style="margin-top:18px"><h3>WhatsApp</h3><p class="muted">Guests can't get automatic WhatsApp messages yet. For now, use "Send on WhatsApp" on each guest's Link & QR to share their personal link.</p></div>`;
  $('#aadd').onclick = () => editAnn(null, () => announce(c));
  c.querySelectorAll('[data-id] button').forEach((b) => (b.onclick = () => editAnn(S.announcements.find((x) => x.id === b.closest('[data-id]').dataset.id), () => announce(c))));
}
function editAnn(a, after) {
  const isNew = !a; a ||= { id: uid(), kind: 'general', audience: { type: 'all', values: [] }, published: true };
  const groups = [...new Set(S.guests.map((g) => g.group).filter(Boolean))];
  modal(`<h3>${isNew ? 'New announcement' : 'Edit announcement'}</h3><form class="stack" id="af">
    <label class="f">Title<input name="title" value="${esc(a.title || '')}" required></label>
    <label class="f">Message<textarea name="body" rows="4" required>${esc(a.body || '')}</textarea></label>
    <div class="grid2"><label class="f">Type<select name="kind">${[['general', 'General'], ['important', 'Important'], ['change', 'Time change'], ['venue', 'Venue change']].map(([k, l]) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f">Send to<select name="atype" id="atype">${[['all', 'All guests'], ['cottages', 'Selected cottages'], ['groups', 'Guest groups']].map(([k, l]) => `<option value="${k}" ${a.audience.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <label class="f" id="avals">Cottages or groups (comma separated)<input name="avals" value="${esc((a.audience.values || []).join(', '))}" placeholder="15, 21A  or  ${esc(groups.join(', ') || 'Bride side')}"></label>
    <label class="row" style="gap:8px"><input type="checkbox" name="published" style="width:auto" ${a.published !== false ? 'checked' : ''}> Visible to guests</label>
    <div class="row between"><div>${isNew ? '' : '<button type="button" class="btn btn-ghost btn-sm" id="adel" style="color:var(--danger)">Delete</button>'}</div><div class="row"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Save</button></div></div></form>`, (m) => {
    const sync = () => ($('#avals', m).style.display = $('#atype', m).value === 'all' ? 'none' : '');
    $('#atype', m).onchange = sync; sync();
    $('#af', m).onsubmit = (e) => {
      e.preventDefault(); const d = formData(e.target);
      Object.assign(a, { title: d.title, body: d.body, kind: d.kind, published: !!d.published, audience: { type: d.atype, values: d.atype === 'all' ? [] : d.avals.split(',').map((s) => s.trim()).filter(Boolean) } });
      a.createdAt ||= new Date().toISOString();
      // Delivery channels: in-app today. A WhatsApp sender can read these later.
      a.channels ||= ['in_app'];
      if (isNew) S.announcements.push(a);
      changed(); m.remove(); after();
    };
    $('#adel', m) && ($('#adel', m).onclick = () => { S.announcements = S.announcements.filter((x) => x !== a); changed(); m.remove(); after(); });
  });
}

// ---------- Settings ----------
function settings(c) {
  const w = S.wedding, gh = S.secrets.github || {};
  c.innerHTML = `<div class="stack" style="max-width:720px">
    <form class="card stack" id="sw"><h3>Wedding details</h3>
      <div class="grid2"><label class="f">Couple<input name="couple" value="${esc(w.couple)}"></label><label class="f">Title<input name="title" value="${esc(w.title)}"></label></div>
      <div class="grid2"><label class="f">First day<input type="date" name="startDate" value="${esc(w.startDate)}"></label><label class="f">Last day<input type="date" name="endDate" value="${esc(w.endDate)}"></label></div>
      <div class="grid2"><label class="f">Venue name<input name="venueName" value="${esc(w.venueName)}"></label><label class="f">Google Maps search for the resort<input name="mapsQuery" value="${esc(w.mapsQuery || '')}"></label></div>
      <label class="f">Welcome message<textarea name="welcome" rows="2">${esc(w.welcome)}</textarea></label>
      <label class="f">Blessing (shown at the bottom of the home screen)<textarea name="blessing" rows="2">${esc(w.blessing || '')}</textarea></label>
      <label class="f">"With Love" from<input name="hosts" value="${esc(w.hosts || '')}"></label>
      <label class="f">Help contacts (one per line: Name, +91 phone)<textarea name="contacts" rows="3">${esc((w.contacts || []).map((x) => `${x.name}, ${x.phone}`).join('\n'))}</textarea></label>
      <div><button class="btn btn-primary btn-sm">Save</button></div></form>
    <form class="card stack" id="sl"><h3>Guest links</h3><label class="f">Guest app address<input name="publicUrl" value="${esc(S.secrets.publicUrl)}"></label><p class="muted" style="font-size:12px">Personal links and QR codes are built from this address.</p><div><button class="btn btn-primary btn-sm">Save</button></div></form>
    <form class="card stack" id="sg"><h3>One-click publishing (GitHub)</h3>
      <p class="muted" style="font-size:13px">Paste a GitHub fine-grained token that has <b>Contents: read & write</b> on this site's repository only. It's stored encrypted with your admin password.</p>
      <div class="grid2"><label class="f">Repository<input name="repo" value="${esc(gh.repo || '')}" placeholder="owner/wedding-concierge"></label><label class="f">Branch<input name="branch" value="${esc(gh.branch || 'main')}"></label></div>
      <label class="f">Token<input name="token" type="password" value="${esc(gh.token || '')}" autocomplete="off"></label>
      <div><button class="btn btn-primary btn-sm">Save</button></div></form>
    <form class="card stack" id="sp"><h3>Admin password</h3><label class="f">New password (at least 10 characters)<input name="pw" type="password" minlength="10" autocomplete="new-password"></label><p class="muted" style="font-size:12px">Takes effect when you publish.</p><div><button class="btn btn-primary btn-sm">Change</button></div></form>
  </div>`;
  $('#sw').onsubmit = (e) => { e.preventDefault(); const d = formData(e.target); Object.assign(w, d, { contacts: d.contacts.split('\n').map((l) => l.split(',')).filter((p) => p[0]?.trim() && p[1]).map(([n, ...p]) => ({ name: n.trim(), phone: p.join(',').trim() })) }); changed(); toast('Saved'); };
  $('#sl').onsubmit = (e) => { e.preventDefault(); S.secrets.publicUrl = formData(e.target).publicUrl.trim(); changed(); toast('Saved'); };
  $('#sg').onsubmit = (e) => { e.preventDefault(); S.secrets.github = formData(e.target); changed(); toast('Saved. Publish to store it.'); };
  $('#sp').onsubmit = (e) => { e.preventDefault(); const p = formData(e.target).pw; if (p.length < 10) return toast('Use at least 10 characters'); password = p; changed(); toast('Password changed. Publish to apply it.'); };
}
