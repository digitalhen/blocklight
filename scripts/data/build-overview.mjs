import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { buildingPoints } from '../../packages/blocklight/dist/overview.js';
const output = new URL('../../playground/public/data/', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, output), 'utf8'));
const manifest = await read('city-buildings.json'), data = await read('311-citywide.json');
const linked = new Set(data.buildings.map(record => record.buildingId));
const seen = new Set(), features = [];
for (const key of Object.keys(manifest.tiles)) {
  const [x, y] = key.split('/');
  const tile = await read(manifest.template.replace('{x}', x).replace('{y}', y));
  const selected = tile.features.filter(feature => {
    const id = String(feature.properties.source_id);
    if (seen.has(id) || (!linked.has(id) && Number(id) % 32 !== 0)) return false;
    seen.add(id); return true;
  });
  features.push(...selected.map(feature => ({ ...feature, properties: { source_id: feature.properties.source_id, bin: feature.properties.bin, height_m: feature.properties.height_m, base_bbl: feature.properties.base_bbl } })));

}
await writeFile(new URL('city-overview.geojson', output), JSON.stringify({
  type: 'FeatureCollection', geometryVersion: manifest.geometryVersion,
  description: 'All buildings with linked housing requests plus one in 32 other footprint IDs. Each footprint represents one building, not a cluster.', features,
}));
console.log(`Overview: ${features.length.toLocaleString()} building footprints, including all ${linked.size.toLocaleString()} linked buildings.`);

const metrics = { ...data, buildings: data.buildings.map(({ buildingId, count, categories }) => ({ buildingId, count, heat: categories['HEAT/HOT WATER'] ?? 0, plumbing: categories.PLUMBING ?? 0 })) };
await writeFile(new URL('311-metrics.json', output), JSON.stringify(metrics));
const buckets = new Map();
for (const record of data.buildings) {
  const key = Number(record.buildingId) % 128;
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(record);
}
await mkdir(new URL('city/details/', output), { recursive: true });
for (const [key, records] of buckets) await writeFile(new URL(`city/details/${key}.json`, output), JSON.stringify(records));
console.log('Prepared compact metrics and 128 detail shards; the full download remains unchanged.');
