import { readFile, writeFile } from 'node:fs/promises';
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
  features.push(...buildingPoints({ type: 'FeatureCollection', features: selected }).features);
}
await writeFile(new URL('city-overview.geojson', output), JSON.stringify({
  type: 'FeatureCollection', geometryVersion: manifest.geometryVersion,
  description: 'All buildings with linked housing requests plus one in 32 other footprint IDs. Each dot represents one building, not a cluster.', features,
}));
console.log(`Overview: ${features.length.toLocaleString()} building dots, including all ${linked.size.toLocaleString()} linked buildings.`);
