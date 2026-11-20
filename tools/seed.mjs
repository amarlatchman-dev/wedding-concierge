// Builds data/wedding.json from the invitation + resort map.
// Usage: node tools/seed.mjs <admin-password> [links-output-file]
import { writeFileSync } from 'node:fs';
import { buildPublic, toIso, randomToken } from '../js/core.js';
import { areas, amphitheatre } from './areas.mjs';

const [password, linksOut] = process.argv.slice(2);
if (!password) { console.error('usage: node tools/seed.mjs <admin-password> [links-file]'); process.exit(1); }

// Marker positions are pixels on data/map.jpg (1600 x 1131). They were placed by eye and can be refined in the admin.
const M = (id, category, name, x, y, extra = {}) => ({ id, category, name, x, y, ...extra });
const markers = [
  M('jalsa', 'venue', 'Jalsa Garden', 360, 640, { description: 'Open lawn for up to 400 guests. Haldi, Mameru and Sangeet are held here.' }),
  M('mainlawn', 'venue', 'Main Lawn', 1030, 470, { label: 'Main Lawn', description: 'Swimming Pool Side Garden, the resort\'s largest lawn. Baraat, Jaimala and Pheras are held here.' }),
  M('banquet', 'venue', 'Banquet Hall', 1255, 560, { description: 'Indoor hall (120\' x 52\') for up to 500 guests.' }),
  M('courtyard', 'venue', 'Central Courtyard', 910, 215, { description: 'Lawn in the middle of the cottages.' }),
  M('amphi', 'venue', 'Amphitheatre', 165, 625, { description: 'Open-air seating for up to 300 guests.' }),
  M('gazebo', 'venue', 'Gazebo', 262, 585),
  M('temple', 'venue', 'Temple', 105, 700),
  M('nzone', 'venue', "N'-Zone", 1110, 680),
  M('aptgarden', 'venue', 'Apartment Front Garden', 1420, 270),
  M('gate', 'entrance', 'Main Gate', 1305, 1030, { description: 'Entrance from Anand-Borsad Road.' }),
  M('reception', 'reception', 'Reception & Restaurant', 1300, 760, { description: 'Front desk and restaurant. Phone: +91 76228 80002.' }),
  M('help', 'emergency', 'Help Desk (Reception)', 1330, 800, { description: 'For any emergency, go to Reception or call +91 76228 80002.' }),
  M('parking', 'parking', 'Parking', 1365, 520, { description: 'About 18,000 sq. ft.' }),
  M('pool', 'other', 'Swimming Pool, Gym & Spa', 1160, 470),
  M('kids', 'other', "Kids' Zone", 880, 730),
  M('scenic', 'other', 'Scenic Garden & Jogging Track', 1115, 860),
  M('duck', 'other', 'Duck House', 1010, 1075),
];
const cottages = { 1: [830, 612], 2: [672, 612], 3: [628, 572], 4: [757, 578], 5: [892, 577], 6: [835, 516], 7: [672, 522], 8: [628, 490], 9: [757, 460], 10: [892, 466], 11: [838, 403], 12: [728, 418], 14: [758, 340], 15: [908, 339], 16: [1063, 329], 17: [1215, 330], 18: [1294, 285], 19: [1139, 284], 20: [985, 283], 21: [833, 280], 22: [712, 290], 23: [756, 223], 24: [1064, 226], 25: [1214, 229], 26: [1300, 245], 27: [1296, 169], 28: [1141, 169], 29: [985, 170], 30: [835, 170], 31: [718, 178], 33: [868, 135], 34: [1020, 135], 35: [1170, 135], 36: [1338, 215] };
for (const [n, [x, y]] of Object.entries(cottages)) markers.push(M('c' + n, 'cottage', `Cottage ${n}`, x, y, { code: n, description: `Cottages ${n}A–${n}D` }));

// Walking path network (pixels). w = walk only, v = vehicle only, b = both.
const N = {
  gate: [1305, 1025], r1: [1300, 900], r2: [1300, 760], r3: [1300, 655], p1: [1315, 560], p2: [1330, 470],
  j1: [1150, 655], j2: [1000, 660], c0: [910, 662], pg1: [980, 615], pg2: [1030, 470],
  w1: [800, 672], w2: [620, 688], w3: [480, 700], w4: [345, 712], w5: [230, 718], w6: [130, 724],
  jg: [360, 650], a1: [205, 680], amphi: [170, 640], gz1: [262, 610],
  b1: [800, 640], n1: [915, 560], n2: [915, 450], n3: [915, 352], q1: [1063, 352], q2: [1215, 352], q3: [1380, 352], af: [1420, 290],
  cc: [910, 215],
};
for (const [n, [x, y]] of Object.entries(cottages)) N['k' + n] = [x, y];
const E = [
  ['gate', 'r1', 'b'], ['r1', 'r2', 'b'], ['r2', 'r3', 'b'], ['r3', 'p1', 'b'], ['p1', 'p2', 'b'],
  ['r3', 'j1', 'b'], ['j1', 'j2', 'b'], ['j2', 'c0', 'b'], ['j2', 'pg1', 'w'], ['pg1', 'pg2', 'w'],
  ['c0', 'w1', 'b'], ['w1', 'w2', 'b'], ['w2', 'w3', 'b'], ['w3', 'w4', 'b'], ['w4', 'w5', 'w'], ['w5', 'w6', 'w'],
  ['w4', 'jg', 'w'], ['w5', 'a1', 'w'], ['a1', 'amphi', 'w'], ['jg', 'gz1', 'w'], ['a1', 'gz1', 'w'],
  ['c0', 'n1', 'w'], ['n1', 'n2', 'w'], ['n2', 'n3', 'w'], ['n3', 'q1', 'w'], ['q1', 'q2', 'w'], ['q2', 'q3', 'w'], ['q3', 'af', 'w'],
  ['w1', 'b1', 'w'], ['b1', 'k1', 'w'], ['b1', 'k4', 'w'], ['k1', 'k5', 'w'], ['k5', 'n1', 'w'], ['k10', 'n2', 'w'], ['k15', 'n3', 'w'],
  ['k16', 'q1', 'w'], ['k17', 'q2', 'w'], ['k18', 'q3', 'w'],
  ['k2', 'b1', 'w'], ['k2', 'k3', 'w'], ['k3', 'k7', 'w'], ['k7', 'k8', 'w'], ['k7', 'k4', 'w'], ['k7', 'k9', 'w'],
  ['k4', 'k6', 'w'], ['k6', 'k5', 'w'], ['k6', 'k9', 'w'], ['k6', 'k10', 'w'], ['k9', 'k11', 'w'], ['k9', 'k12', 'w'], ['k10', 'k11', 'w'],
  ['k11', 'k14', 'w'], ['k11', 'k15', 'w'], ['k12', 'k14', 'w'], ['k14', 'k21', 'w'], ['k14', 'k22', 'w'], ['k15', 'k21', 'w'], ['k15', 'k20', 'w'],
  ['k21', 'k23', 'w'], ['k21', 'cc', 'w'], ['k22', 'k23', 'w'], ['k23', 'k30', 'w'], ['k23', 'k31', 'w'], ['k30', 'cc', 'w'], ['k30', 'k33', 'w'],
  ['k20', 'cc', 'w'], ['k20', 'k16', 'w'], ['k20', 'k24', 'w'], ['k29', 'cc', 'w'], ['k29', 'k24', 'w'], ['k29', 'k34', 'w'],
  ['k24', 'k28', 'w'], ['k24', 'k19', 'w'], ['k19', 'k16', 'w'], ['k19', 'k17', 'w'], ['k19', 'k25', 'w'],
  ['k25', 'k28', 'w'], ['k25', 'k27', 'w'], ['k25', 'k18', 'w'], ['k25', 'k26', 'w'], ['k18', 'k17', 'w'], ['k18', 'k26', 'w'], ['k28', 'k35', 'w'], ['k27', 'k36', 'w'], ['k26', 'k36', 'w'],
];
const graph = {
  nodes: Object.entries(N).map(([id, [x, y]]) => ({ id, x, y })),
  edges: E.map(([a, b, t], i) => ({ id: 'e' + i, a, b, type: { w: 'walk', v: 'vehicle', b: 'both' }[t], restricted: false })),
};

const ev = (id, name, date, start, end, venue, description, extra = {}) =>
  ({ id, name, start: toIso(date, start), end: end ? toIso(date, end) : null, venue, description, published: true, theme: { ganesh: 'haldi', muhurat: 'haldi', haldi: 'haldi', sangeet: 'sangeet' }[id] || 'wedding', ...extra });
const events = [
  ev('ganesh', 'Ganesh Pujan', '2026-12-04', '08:00', '09:00', 'jalsa', 'A morning prayer to Lord Ganesha to bless the celebrations ahead.'),
  ev('muhurat', 'Ghehu-Channa Muhurat', '2026-12-04', '09:00', '10:30', 'jalsa', 'The traditional Mandva Mahurat ceremony.'),
  ev('haldi', 'Haldi & Mameru', '2026-12-04', '10:30', '14:00', 'jalsa', 'Haldi, followed by the Mameru ceremony and lunch.', { dress: 'Yellow / bright festive' }),
  ev('sangeet', 'Sangeet', '2026-12-04', '19:00', null, 'jalsa', 'Celebrate the rhythm of love as the couple dances into their new beginnings.'),
  ev('baraat', 'Baraat', '2026-12-05', '09:00', '10:00', 'mainlawn', 'The groom\'s procession. Join in the dancing!'),
  ev('pheras', 'Jaimala & Pheras', '2026-12-05', '10:00', '13:00', 'mainlawn', 'Exchange of garlands and the sacred pheras, followed by lunch.'),
];

const sample = [
  ['Mehta Family', 'Rajesh Mehta', '15B', 'Groom side', 4], ['Shah Family', 'Priya Shah', '21A', 'Bride side', 3],
  ['Patel Family', 'Kiran Patel', '9C', 'Groom side', 5], ['Jain Family', 'Anil Jain', '28D', 'Bride side', 2],
  ['Desai Family', 'Meera Desai', '4A', 'Friends', 2], ['Joshi Family', 'Vikram Joshi', '18B', 'Friends', 3],
];
const guests = sample.map(([family, name, cottage, group, party]) => ({ id: randomToken(6), token: randomToken(12), family, name, cottage, group, party, phone: '' }));

const state = {
  version: 1,
  wedding: {
    couple: 'Rohan & Gazal', title: "Rohan & Gazal's Wedding", startDate: '2026-12-04', endDate: '2026-12-05', timezone: 'Asia/Kolkata',
    venueName: 'Neejanand Luxurious Resort', venueAddress: 'Anand-Borsad Road, Nr. Andharia Chakla, Khandhali, Anand, Gujarat 388560',
    hosts: 'Mr. Navin Doshi · Mrs. Savita Doshi · Ms. Alpa Doshi',
    blessing: 'Your presence and blessings would bring immense joy to us as Rohan and Gazal begin their new journey together.',
    welcome: 'We are so happy you are here. Everything you need for the celebrations is in this app.',
    contacts: [{ name: 'Navin Doshi', phone: '+919227160644' }, { name: 'Rohan', phone: '+918780466533' }, { name: 'Resort reception', phone: '+917622880002' }],
    mapsQuery: 'Neejanand Resort, Anand-Borsad Road, Anand, Gujarat',
  },
  map: { src: 'data/map.jpg', width: 1600, height: 1131, metersPerPixel: 0.3, geo: null, style: 'illustrated', areas, amphitheatre, title: 'Neejanand', subtitle: 'LUXURIOUS RESORT · ANAND' },
  markers, graph, events,
  announcements: [{ id: 'a1', title: 'Welcome to Neejanand!', body: 'Check in at Reception near the main gate. Lunch is served after Haldi on Dec 4 and after the Pheras on Dec 5.', audience: { type: 'all' }, kind: 'general', published: true, createdAt: '2026-11-18T00:00:00.000Z' }],
  guests, secrets: {},
};

const pub = await buildPublic(state, password);
writeFileSync(new URL('../rohan-gazal/data/wedding.json', import.meta.url), JSON.stringify(pub));
if (linksOut) writeFileSync(linksOut, guests.map((g) => `${g.family} (${g.cottage}): #/g/${g.token}`).join('\n') + '\n');
console.log(`wrote data/wedding.json: ${markers.length} markers, ${graph.edges.length} paths, ${events.length} events, ${guests.length} guests`);
