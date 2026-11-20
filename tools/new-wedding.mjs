// Creates a new wedding site in its own folder, sharing the app code at the repo root.
// Usage: node tools/new-wedding.mjs <folder> "<Couple>" <first-day> <last-day> "<Venue>" <admin-password> ["<Venue address>"]
//   e.g. node tools/new-wedding.mjs priya-arjun "Priya & Arjun" 2027-02-12 2027-02-13 "Leela Palace, Udaipur" 'long-secret-pass'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildPublic, toIso } from '../js/core.js';

const [slug, couple, start, end, venue, password, address = ''] = process.argv.slice(2);
if (!slug || !couple || !start || !end || !venue || !password) { console.error('usage: node tools/new-wedding.mjs <folder> "<Couple>" <first-day> <last-day> "<Venue>" <admin-password> ["<address>"]'); process.exit(1); }
if (!/^[a-z0-9-]+$/.test(slug)) { console.error('folder must be lowercase letters, numbers and dashes'); process.exit(1); }
if (password.length < 10) { console.error('use an admin password of at least 10 characters'); process.exit(1); }
const root = new URL('../', import.meta.url), dir = new URL(`${slug}/`, root);
if (existsSync(dir)) { console.error(`${slug}/ already exists`); process.exit(1); }
mkdirSync(new URL('data/', dir), { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const tpl = (f) => readFileSync(new URL(`rohan-gazal/${f}`, root), 'utf8');
writeFileSync(new URL('index.html', dir), tpl('index.html')
  .replace(/<title>.*<\/title>/, `<title>${esc(couple)} · Wedding Concierge</title>`)
  .replace(/<div class="splash">.*?<\/div>/, `<div class="splash"><div class="script" style="font-size:52px">${esc(couple)}</div></div>`));
writeFileSync(new URL('admin.html', dir), tpl('admin.html').replace(/<img src="art\/monogram.jpg"[^>]*>/, `<div class="script center" style="font-size:44px">${esc(couple)}</div>`));
writeFileSync(new URL('manifest.webmanifest', dir), tpl('manifest.webmanifest').replace(/"name": "[^"]*"/, `"name": "${couple} · Wedding"`).replace(/"short_name": "[^"]*"/, `"short_name": "${couple.slice(0, 12)}"`));
// Placeholder map until the organizer uploads the venue's map in Admin → Map & places.
writeFileSync(new URL('data/map.svg', dir), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1131"><rect width="1600" height="1131" fill="#f7efe2"/><rect x="60" y="60" width="1480" height="1011" rx="40" fill="none" stroke="#b38a45" stroke-width="4" stroke-dasharray="4 14"/><text x="800" y="540" text-anchor="middle" font-family="Georgia,serif" font-size="56" fill="#8b7a75">Venue map coming soon</text><text x="800" y="610" text-anchor="middle" font-family="Georgia,serif" font-size="28" fill="#b38a45">Admin → Map &amp; places → Replace map</text></svg>`);

const state = {
  version: 1,
  wedding: { couple, title: `${couple}'s Wedding`, startDate: start, endDate: end, timezone: 'Asia/Kolkata', venueName: venue, venueAddress: address,
    welcome: 'We are so happy you are here. Everything you need for the celebrations is in this app.', contacts: [], mapsQuery: [venue, address].filter(Boolean).join(', '), art: false },
  map: { src: 'data/map.svg', width: 1600, height: 1131, metersPerPixel: 0.3, geo: null, style: 'image' },
  markers: [
    { id: 'gate', category: 'entrance', name: 'Main Entrance', x: 800, y: 1000 },
    { id: 'venue', category: 'venue', name: 'Main Venue', x: 800, y: 400, description: 'Move this pin onto the real venue once the map is uploaded.' },
  ],
  graph: { nodes: [{ id: 'n1', x: 800, y: 1000 }, { id: 'n2', x: 800, y: 400 }], edges: [{ id: 'e1', a: 'n1', b: 'n2', type: 'both', restricted: false }] },
  events: [
    { id: 'welcome', name: 'Welcome & Mehendi', start: toIso(start, '16:00'), end: toIso(start, '19:00'), venue: 'venue', description: 'Edit this event in Admin → Events.', published: true, theme: 'haldi' },
    { id: 'wedding', name: 'Wedding Ceremony', start: toIso(end, '10:00'), end: toIso(end, '13:00'), venue: 'venue', description: 'Edit this event in Admin → Events.', published: true, theme: 'wedding' },
  ],
  announcements: [], guests: [], secrets: {},
};
writeFileSync(new URL('data/wedding.json', dir), JSON.stringify(await buildPublic(state, password)));
console.log(`Created ${slug}/  → guest app: ${slug}/index.html, admin: ${slug}/admin.html`);
