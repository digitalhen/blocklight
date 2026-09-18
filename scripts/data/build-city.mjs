import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { joinRequests, normalizeBBL } from './join-311.mjs';
const cache = new URL('../../.cache/', import.meta.url), output = new URL('../../playground/public/data/', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, cache), 'utf8'));
const buildingManifest = await read('citywide-buildings/manifest.json'), requestManifest = await read('citywide-311/manifest.json'), streetManifest = await read('citywide-streets/manifest.json');
const rows = [];
for (const file of requestManifest.files) {
  const page = await read(`citywide-311/${file}`);
  for (let i = 0; i < page.length; i++) rows.push({ ...page[i], unique_key: `${file}:${i}`, created_date: page[i].latest_created });
}
const expected = await read('citywide-counts.json');
if (buildingManifest.rows !== expected.buildings) throw new Error('Footprint pagination does not reconcile to the source count.');
if (rows.reduce((n, row) => n + Number(row.count), 0) !== expected['311']) throw new Error('311 aggregation does not reconcile to the source count.');
const requestLots = new Set(rows.map(r => normalizeBBL(r.bbl)).filter(Boolean));
const baseCounts = new Map(), plutoCounts = new Map();
const candidates = [], tiles = new Map(), tileCounts = {}, hash = createHash('sha256');
const zoom = 14, n = 2 ** zoom;
const tileX = lng => Math.floor((lng + 180) / 360 * n);
const tileY = lat => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n);
function bounds(geometry) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  function visit(value) {
    if (typeof value[0] === 'number') { b[0] = Math.min(b[0], value[0]); b[1] = Math.min(b[1], value[1]); b[2] = Math.max(b[2], value[0]); b[3] = Math.max(b[3], value[1]); }
    else for (const child of value) visit(child);
  }
  visit(geometry.coordinates); return b;
}
function quantize(value) { return typeof value[0] === 'number' ? value.map(n => Math.round(n * 1e6) / 1e6) : value.map(quantize); }
function storeFeature(feature) {
  const b = bounds(feature.geometry);
  if (!b.every(Number.isFinite)) throw new Error('Invalid geometry bounds');
  const west = tileX(b[0]), east = tileX(b[2]), north = tileY(b[3]), south = tileY(b[1]);
  if ((east-west+1)*(south-north+1) > 100) throw new Error('Unexpected oversized geometry');
  for (let x = west; x <= east; x++) for (let y = north; y <= south; y++) {
    const id = `${x}/${y}`; let list = tiles.get(id); if (!list) { list = []; tiles.set(id, list); } list.push(feature);
  }
}
let count = 0;
for (let page = 0; page < buildingManifest.pages; page++) {
  const text = await readFile(new URL(`citywide-buildings/${page * buildingManifest.pageSize}.json`, cache), 'utf8'); hash.update(text);
  for (const row of JSON.parse(text)) {
    if (!row.the_geom) continue;
    const height = Number(row.height_roof);
    const feature = { type: 'Feature', id: String(row.objectid), properties: { source_id: String(row.objectid), bin: row.bin ?? null, base_bbl: row.base_bbl ?? null, mappluto_bbl: row.mappluto_bbl ?? null, height_m: row.height_roof != null && Number.isFinite(height) ? Math.max(0, Math.round(height * 0.3048 * 10) / 10) : null }, geometry: { ...row.the_geom, coordinates: quantize(row.the_geom.coordinates) } };
    storeFeature(feature); count++;
    for (const [counts, value] of [[baseCounts, row.base_bbl], [plutoCounts, row.mappluto_bbl]]) { const bbl = normalizeBBL(value); if (bbl) counts.set(bbl, (counts.get(bbl) ?? 0) + 1); }
    if (requestLots.has(normalizeBBL(row.base_bbl)) || requestLots.has(normalizeBBL(row.mappluto_bbl))) candidates.push(feature);
  }
  console.log(`Prepared ${count.toLocaleString()} building footprints`);
}
const geometryVersion = hash.digest('hex').slice(0, 20);
async function flush(name) {
  for (const [id, features] of tiles) {
    const [x, y] = id.split('/'); await mkdir(new URL(`city/${name}/${x}/`, output), { recursive: true });
    await writeFile(new URL(`city/${name}/${x}/${y}.geojson`, output), JSON.stringify({ type: 'FeatureCollection', features }));
    tileCounts[id] = features.length;
  }
  const manifest = { schemaVersion: 1, zoom, geometryVersion, featureCount: count, bounds: [-74.35,40.44,-73.65,40.94], template: `./city/${name}/{x}/{y}.geojson`, tiles: { ...tileCounts }, source: name === 'buildings' ? buildingManifest : streetManifest };
  await writeFile(new URL(`city-${name}.json`, output), JSON.stringify(manifest));
  console.log(`${name}: ${count.toLocaleString()} features in ${tiles.size} files`);
  tiles.clear(); for (const id of Object.keys(tileCounts)) delete tileCounts[id];
}
for (const features of tiles.values()) for (const feature of features) { feature.properties.base_bbl_count = baseCounts.get(normalizeBBL(feature.properties.base_bbl)) ?? 0; feature.properties.mappluto_bbl_count = plutoCounts.get(normalizeBBL(feature.properties.mappluto_bbl)) ?? 0; }
await flush('buildings');
const result = joinRequests(candidates, rows);
const data = { schemaVersion: 1, scope: 'citywide', title: 'NYC 311 housing requests by building', agency: 'HPD', period: { from: '2025-01-01', toExclusive: '2026-01-01', dateField: 'created_date' }, source: { dataset: 'https://data.cityofnewyork.us/d/erm2-nwe9', queries: requestManifest.queries, fetchedAt: requestManifest.fetchedAt, terms: 'https://opendata.cityofnewyork.us/overview/#termsofuse' }, join: { featureKey: 'source_id', recordKey: 'buildingId', geometryFile: 'city-buildings.json', geometryVersion, methodology: 'All HPD requests created in 2025, all boroughs, including requests without coordinates. Match BBL to base_bbl or mappluto_bbl. A lot with one footprint maps to that footprint. Multi-footprint lots require a point inside exactly one footprint on the same lot. No nearest-building guesses or duplicated lot counts. Unmatched records remain in summary.' }, ...result };
await writeFile(new URL('311-citywide.json', output), JSON.stringify(data));
console.log(JSON.stringify(result.summary));
count = 0;
for (let page = 0; page < streetManifest.pages; page++) {
  for (const row of await read(`citywide-streets/${page * streetManifest.pageSize}.json`)) {
    if (!row.the_geom) continue;
    storeFeature({ type: 'Feature', id: count, properties: {}, geometry: { ...row.the_geom, coordinates: quantize(row.the_geom.coordinates) } }); count++;
  }
}
await flush('streets');

await writeFile(new URL('city.json', output), JSON.stringify({ schemaVersion: 1, buildings: './city-buildings.json', streets: './city-streets.json', data: './311-citywide.json', geometryVersion }));
