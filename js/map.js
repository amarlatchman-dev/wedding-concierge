// Pan/zoom SVG map viewer used by both the guest app and the admin editor.
import { CATEGORIES, esc } from './core.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};

export class MapView {
  constructor(host, { src, width, height, onTap, onMarker, onPointer } = {}) {
    this.host = host; this.W = width; this.H = height;
    this.onTap = onTap; this.onMarker = onMarker; this.onPointer = onPointer;
    host.classList.add('mapview');
    this.svg = el('svg', { width: '100%', height: '100%' }, host);
    this.g = el('g', {}, this.svg);
    this.img = el('image', { href: src, x: 0, y: 0, width, height, preserveAspectRatio: 'none' }, this.g);
    this.layers = {};
    for (const n of ['base', 'under', 'route', 'markers', 'top']) this.layers[n] = el('g', { class: 'layer-' + n }, this.g);
    this.s = 1; this.tx = 0; this.ty = 0;
    this._pointers = new Map();
    this._bind();
    new ResizeObserver(() => { if (!this._fitted) this.fit(); else this._apply(); }).observe(host);
  }
  setSource(src, width, height) {
    this.W = width; this.H = height;
    Object.entries({ href: src, width, height }).forEach(([k, v]) => this.img.setAttribute(k, v));
    this.fit();
  }
  get minScale() { const r = this.host.getBoundingClientRect(); return Math.min(r.width / this.W, r.height / this.H) || 0.1; }
  fit() {
    const r = this.host.getBoundingClientRect();
    if (!r.width) return;
    this.s = this.minScale;
    this.tx = (r.width - this.W * this.s) / 2; this.ty = (r.height - this.H * this.s) / 2;
    this._fitted = true; this._apply();
  }
  // Frame a set of map points with padding.
  focus(points, pad = 60, maxScale = 2.2, insetBottom = 0) {
    const b = this.host.getBoundingClientRect();
    const r = { width: b.width, height: b.height - insetBottom };
    if (!r.width || !points.length) return;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    this.s = Math.min(maxScale, (r.width - pad * 2) / Math.max(1, x1 - x0), (r.height - pad * 2) / Math.max(1, y1 - y0));
    this.s = Math.max(this.s, this.minScale);
    this.tx = r.width / 2 - ((x0 + x1) / 2) * this.s; this.ty = r.height / 2 - ((y0 + y1) / 2) * this.s;
    this._fitted = true; this._apply(true);
  }
  // Fill the screen height (portrait phones) centred on a point.
  cover(p) {
    const r = this.host.getBoundingClientRect();
    this.s = Math.max(this.minScale, Math.min(r.height / this.H, r.width / this.W * 2.2));
    this.tx = Math.min(0, Math.max(r.width - this.W * this.s, r.width / 2 - p.x * this.s));
    this.ty = (r.height - this.H * this.s) / 2;
    this._fitted = true; this._apply();
  }
  zoomBy(f, cx, cy) {
    const r = this.host.getBoundingClientRect();
    cx ??= r.width / 2; cy ??= r.height / 2;
    const ns = Math.max(this.minScale * 0.9, Math.min(6, this.s * f));
    this.tx = cx - ((cx - this.tx) * ns) / this.s; this.ty = cy - ((cy - this.ty) * ns) / this.s; this.s = ns;
    this._apply();
  }
  toMap(clientX, clientY) {
    const r = this.host.getBoundingClientRect();
    return { x: (clientX - r.left - this.tx) / this.s, y: (clientY - r.top - this.ty) / this.s };
  }
  _apply(animate) {
    this.g.style.transition = animate ? 'transform .45s cubic-bezier(.2,.8,.2,1)' : 'none';
    this.g.style.transform = `translate(${this.tx}px,${this.ty}px) scale(${this.s})`;
    // Keep markers a constant on-screen size.
    this.svg.style.setProperty('--inv', 1 / this.s);
    this.g.querySelectorAll('[data-fixed]').forEach((n) => n.setAttribute('transform', `translate(${n.dataset.x},${n.dataset.y}) scale(${1 / this.s})`));
    this.g.querySelectorAll('[data-stroke]').forEach((n) => n.setAttribute('stroke-width', n.dataset.stroke / this.s));
  }
  _bind() {
    const h = this.host;
    h.addEventListener('wheel', (e) => { e.preventDefault(); const r = h.getBoundingClientRect(); this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    h.addEventListener('pointerdown', (e) => {
      h.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._moved = 0; this._downTarget = e.target;
      if (this.onPointer?.('down', e, this.toMap(e.clientX, e.clientY))) { this._dragHandled = true; return; }
      this._dragHandled = false;
    });
    h.addEventListener('pointermove', (e) => {
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      const np = { x: e.clientX, y: e.clientY };
      if (this._dragHandled) { this._moved += Math.hypot(np.x - p.x, np.y - p.y); this._pointers.set(e.pointerId, np); this.onPointer?.('move', e, this.toMap(e.clientX, e.clientY)); return; }
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        const other = a === p ? b : a;
        const d0 = Math.hypot(p.x - other.x, p.y - other.y), d1 = Math.hypot(np.x - other.x, np.y - other.y);
        const r = h.getBoundingClientRect();
        this.zoomBy(d1 / (d0 || 1), (np.x + other.x) / 2 - r.left, (np.y + other.y) / 2 - r.top);
      } else {
        this.tx += np.x - p.x; this.ty += np.y - p.y; this._apply();
      }
      this._moved += Math.hypot(np.x - p.x, np.y - p.y);
      this._pointers.set(e.pointerId, np);
    });
    const up = (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      this._pointers.delete(e.pointerId);
      if (this._dragHandled) { this.onPointer?.('up', e, this.toMap(e.clientX, e.clientY), this._moved); return; }
      if (this._moved < 6 && this._pointers.size === 0) {
        const m = this._downTarget?.closest?.('[data-marker]');
        if (m && this.onMarker) this.onMarker(m.dataset.marker, e);
        else this.onTap?.(this.toMap(e.clientX, e.clientY), e);
      }
    };
    h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  }

  // ---------- Overlays ----------
  drawMarkers(markers, { highlight = [], dim = false, labels = 'venue' } = {}) {
    const L = this.layers.markers; L.innerHTML = '';
    const hl = new Set(highlight.filter(Boolean));
    // Highlighted markers last, so they sit on top.
    const list = [...markers].sort((a, b) => hl.has(a.id) - hl.has(b.id));
    for (const m of list) {
      const cat = CATEGORIES[m.category] || CATEGORIES.other;
      const on = hl.has(m.id);
      const g = el('g', { 'data-marker': m.id, 'data-fixed': '', 'data-x': m.x, 'data-y': m.y, class: 'mk' + (on ? ' mk-on' : '') + (dim && !on ? ' mk-dim' : '') }, L);
      const r = on ? 15 : m.category === 'cottage' ? 9 : 12;
      if (on) el('circle', { r: 26, class: 'mk-pulse', fill: cat.color }, g);
      el('circle', { r: r + 2, fill: '#fff' }, g);
      el('circle', { r, fill: cat.color }, g);
      const t = el('text', { 'text-anchor': 'middle', dy: '0.35em', class: 'mk-ic', 'font-size': m.category === 'cottage' ? (m.code?.length > 2 ? 7 : 9) : 11 }, g);
      t.textContent = m.category === 'cottage' ? (m.code || cat.icon) : cat.icon;
      if (on || labels === 'all' || (labels === 'venue' && m.category === 'venue')) {
        const lt = el('text', { y: r + 15, 'text-anchor': 'middle', class: 'mk-label' + (on ? ' mk-label-on' : '') }, g);
        lt.textContent = m.label || m.name;
      }
    }
    this._apply();
  }
  drawRoute(points) {
    const L = this.layers.route; L.innerHTML = '';
    if (!points?.length) return;
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
    el('path', { d, class: 'route-casing', 'data-stroke': 11, fill: 'none' }, L);
    el('path', { d, class: 'route-line', 'data-stroke': 6, fill: 'none' }, L);
    el('path', { d, class: 'route-dash', 'data-stroke': 2.5, fill: 'none' }, L);
    this._apply();
  }
  drawYou(p, accuracyPx) {
    const L = this.layers.top; L.querySelector('.you')?.remove();
    if (!p) return;
    const g = el('g', { class: 'you' }, L);
    if (accuracyPx) el('circle', { cx: p.x, cy: p.y, r: accuracyPx, class: 'you-acc' }, g);
    const d = el('g', { 'data-fixed': '', 'data-x': p.x, 'data-y': p.y }, g);
    el('circle', { r: 10, fill: '#fff' }, d); el('circle', { r: 7, class: 'you-dot' }, d);
    this._apply();
  }
  // Admin: draw the path network.
  drawGraph(graph, { selected } = {}) {
    const L = this.layers.under; L.innerHTML = '';
    if (!graph) return;
    const pos = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
    for (const e of graph.edges) {
      const a = pos[e.a], b = pos[e.b];
      if (!a || !b) continue;
      el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'data-edge': e.id, 'data-stroke': 5, class: `edge edge-${e.restricted ? 'restricted' : e.type || 'both'}` + (selected === e.id ? ' sel' : '') }, L);
    }
    for (const n of graph.nodes) {
      const g = el('g', { 'data-node': n.id, 'data-fixed': '', 'data-x': n.x, 'data-y': n.y, class: 'node' + (selected === n.id ? ' sel' : '') }, L);
      el('circle', { r: 6 }, g);
    }
    this._apply();
  }
  clear(name) { this.layers[name].innerHTML = ''; }

  // Illustrated base map in the invitation style. Falls back to the uploaded image when no shapes exist.
  drawBase(map, graph, markers, { interactive = true, original = false } = {}) {
    const L = this.layers.base; L.innerHTML = '';
    const illustrated = map.style === 'illustrated' && map.areas?.length && !original;
    this.img.style.display = illustrated ? 'none' : '';
    this.host.classList.toggle('illustrated', !!illustrated);
    if (!illustrated) return;
    const link = (g, a) => { if (interactive && a.marker) { g.setAttribute('data-marker', a.marker); g.setAttribute('data-area', a.marker); } };
    // Speckled lawn texture like the invitation's watercolour greens.
    const defs = el('defs', {}, L);
    const pat = el('pattern', { id: 'speck', width: 18, height: 18, patternUnits: 'userSpaceOnUse' }, defs);
    [[3, 4, 1.1], [11, 2, .8], [7, 11, 1.2], [15, 14, .9], [2, 15, .7]].forEach(([x, y, r]) => el('circle', { cx: x, cy: y, r, class: 'speck' }, pat));
    const hatch = el('pattern', { id: 'hatch', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 10, class: 'hatch' }, hatch);
    const shape = (a, parent) => a.circle ? el('circle', { cx: a.circle[0], cy: a.circle[1], r: a.circle[2] }, parent) : el('polygon', { points: a.pts }, parent);
    const order = ['grounds', 'lawn-soft', 'paving', 'track', 'lawn', 'parking', 'plaza', 'building', 'venue-building', 'water'];
    const areas = [...map.areas].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    // Paths go above lawns but below buildings and cottage gardens, so they read as walkways between them.
    let pathsDrawn = false;
    const drawPaths = () => {
      if (pathsDrawn || !graph) return; pathsDrawn = true;
      const pos = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
      const g = el('g', { class: 'paths' }, L);
      for (const cls of ['path-edge', 'path-fill']) for (const e of graph.edges) {
        const a = pos[e.a], b = pos[e.b]; if (!a || !b || e.restricted) continue;
        const w = e.type === 'walk' ? 9 : 15;
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls, 'stroke-width': cls === 'path-edge' ? w + 3 : w }, g);
      }
    };
    for (const a of areas) {
      if (order.indexOf(a.kind) >= order.indexOf('lawn') && a.id !== 'scenic' && a.id !== 'poolgarden' && a.id !== 'jalsa' && a.id !== 'courtyard') drawPaths();
      const g = el('g', { class: `area area-${a.kind}` }, L);
      link(g, a);
      if (a.kind === 'grounds') { const sh = shape(a, g); sh.setAttribute('class', 'grounds-shadow'); }
      shape(a, g);
      if (a.kind === 'lawn' || a.kind === 'lawn-soft') shape(a, g).setAttribute('class', 'speckle');
      if (a.kind === 'parking') shape(a, g).setAttribute('class', 'hatching');
      if (a.label) {
        const [x, y] = a.circle ? a.circle : centroid(a.pts);
        const t = el('text', { x, y: y + 4, 'text-anchor': 'middle', class: 'area-label' }, g); t.textContent = a.label;
      }
    }
    drawPaths();
    // Amphitheatre rows
    const am = map.amphitheatre;
    if (am) {
      const g = el('g', { class: 'area area-amphi' }, L); link(g, am);
      const r0 = am.radii.at(-1) + 8;
      el('path', { d: sector(am.cx, am.cy, r0, am.from, am.to), class: 'amphi-bg' }, g);
      for (const r of am.radii) el('path', { d: arc(am.cx, am.cy, r, am.from, am.to), class: 'amphi-row' }, g);
    }
    // Cottage blocks: a diamond garden with four cottages at its points.
    for (const m of markers.filter((x) => x.category === 'cottage' && /^\d{1,2}$/.test(x.code || ''))) {
      const g = el('g', { class: 'cot' }, L); if (interactive) g.setAttribute('data-marker', m.id), g.setAttribute('data-area', m.id);
      el('polygon', { points: `${m.x},${m.y - 30} ${m.x + 39},${m.y} ${m.x},${m.y + 30} ${m.x - 39},${m.y}`, class: 'cot-lawn' }, g);
      for (const [dx, dy] of [[0, -30], [39, 0], [0, 30], [-39, 0]]) el('rect', { x: m.x + dx - 7, y: m.y + dy - 7, width: 14, height: 14, rx: 2.5, transform: `rotate(45 ${m.x + dx} ${m.y + dy})`, class: 'cot-unit' }, g);
      const t = el('text', { x: m.x, y: m.y + 5, 'text-anchor': 'middle', class: 'cot-num' }, g); t.textContent = m.code;
    }
    // Boundary in gold, drawn twice like a foil border.
    const gr = map.areas.find((a) => a.kind === 'grounds');
    if (gr) { el('polygon', { points: gr.pts, class: 'boundary-outer' }, L); el('polygon', { points: gr.pts, class: 'boundary-inner' }, L); }
    // Cartouche, compass and road signs fill the empty corners.
    const c = el('g', { class: 'cartouche' }, L);
    const tt = el('text', { x: 300, y: 150, 'text-anchor': 'middle', class: 'carto-title' }, c); tt.textContent = map.title || 'Neejanand';
    const st = el('text', { x: 300, y: 196, 'text-anchor': 'middle', class: 'carto-sub' }, c); st.textContent = map.subtitle || 'LUXURIOUS RESORT · ANAND';
    el('path', { d: 'M180 222 H280 M320 222 H420', class: 'carto-rule' }, c);
    el('path', { d: 'M300 210 l8 12 l-8 12 l-8 -12 z', class: 'carto-orn' }, c);
    const cp = el('g', { class: 'compass', transform: 'translate(300 330)' }, L);
    el('circle', { r: 46, class: 'compass-ring' }, cp); el('circle', { r: 38, class: 'compass-ring thin' }, cp);
    el('path', { d: 'M0 -40 L9 0 L0 40 L-9 0 Z', class: 'compass-needle' }, cp);
    el('path', { d: 'M-40 0 L0 7 L40 0 L0 -7 Z', class: 'compass-needle light' }, cp);
    const n = el('text', { y: -54, 'text-anchor': 'middle', class: 'compass-n' }, cp); n.textContent = 'N';
    const road = el('text', { x: 1440, y: 1060, 'text-anchor': 'middle', class: 'road-label' }, L); road.textContent = 'Anand-Borsad Road  ⟶';
    const road2 = el('text', { x: 1310, y: 1052, 'text-anchor': 'end', class: 'road-label' }, L); road2.textContent = 'Main Gate ↑';
    this._apply();
  }
  highlightAreas(ids = []) {
    const on = new Set(ids.filter(Boolean));
    this.layers.base.querySelectorAll('[data-area]').forEach((g) => g.classList.toggle('area-on', on.has(g.dataset.area)));
  }
}

function centroid(pts) { const p = pts.split(' ').map((q) => q.split(',').map(Number)); return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]; }
const pol = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
function arc(cx, cy, r, a0, a1) { const [x0, y0] = pol(cx, cy, r, a0), [x1, y1] = pol(cx, cy, r, a1); return `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}`; }
function sector(cx, cy, r, a0, a1) { return `M${cx},${cy} L${pol(cx, cy, r, a0).join(',')} ${arc(cx, cy, r, a0, a1).replace(/^M[^A]+/, '')} Z`; }

export const markerCard = (m) => {
  const cat = CATEGORIES[m.category] || CATEGORIES.other;
  return `<div class="eyebrow" style="color:${cat.color}">${esc(cat.label)}</div><h3>${esc(m.name)}</h3>${m.description ? `<p class="muted">${esc(m.description)}</p>` : ''}`;
};
