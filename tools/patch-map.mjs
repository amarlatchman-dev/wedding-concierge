// Adds the illustrated map shapes to an existing data/wedding.json without touching guests or the admin record.
import { readFileSync, writeFileSync } from 'node:fs';
import { areas, amphitheatre } from './areas.mjs';
const f = new URL('../rohan-gazal/data/wedding.json', import.meta.url);
const d = JSON.parse(readFileSync(f, 'utf8'));
Object.assign(d.map, { style: 'illustrated', areas, amphitheatre: { ...amphitheatre }, title: 'Neejanand', subtitle: 'LUXURIOUS RESORT · ANAND' });
writeFileSync(f, JSON.stringify(d));
console.log('map patched:', areas.length, 'areas');
