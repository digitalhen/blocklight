/** Fetch only public geometry. No Prospect database or exports are used. */
import { mkdir, writeFile } from 'node:fs/promises';
const output = new URL('../../playground/public/data/', import.meta.url);
await mkdir(output, { recursive: true });
const sources = [
  { file: 'buildings', resource: '5zhs-2jue', select: 'objectid,bin,base_bbl,mappluto_bbl,height_roof,the_geom', where: "intersects(the_geom, 'POLYGON ((-74.010 40.725, -73.950 40.725, -73.950 40.785, -74.010 40.785, -74.010 40.725))')" },
  { file: 'streets', resource: 'inkn-q76z', select: 'the_geom', where: 'within_box(the_geom,40.785,-74.010,40.725,-73.950)' },
  { file: 'land', resource: 'gthc-hcne', select: 'simplify_preserve_topology(the_geom,0.00003) as the_geom,boroname' },
];
const manifest = { fetchedAt: new Date().toISOString(), terms: 'https://opendata.cityofnewyork.us/overview/#termsofuse', note: 'Data is governed by source terms, not the library MIT license. Building height_roof converted from feet to meters. Building sample covers a fixed Midtown box, not the whole city.', sources: [] };
await Promise.all(sources.map(async source => {
  const url = new URL(`https://data.cityofnewyork.us/resource/${source.resource}.json`);
  url.searchParams.set('$select', source.select);
  url.searchParams.set('$limit', '5000');
  url.searchParams.set('$order', ':id');
  if (source.where) url.searchParams.set('$where', source.where);
  const rows = [];
  for (let offset = 0; ; offset += 5000) {
    if (offset >= 100000) throw new Error(`${source.file}: sample exceeds 100,000 features; use tiles for larger coverage.`);
    url.searchParams.set('$offset', String(offset));
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${source.file}: HTTP ${response.status} ${await response.text()}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`${source.file}: invalid source response.`);
    rows.push(...page);
    if (page.length < 5000) break;
  }
  if (!rows.length) throw new Error(`${source.file}: empty source response.`);
  url.searchParams.set('$offset', '0');
  const features = rows.filter(r => r.the_geom).map((row, index) => ({
    type: 'Feature', id: index,
    properties: source.file === 'buildings'
      ? { source_id: String(row.objectid), bin: row.bin ?? null, base_bbl: row.base_bbl ?? null, mappluto_bbl: row.mappluto_bbl ?? null, height_m: Number.isFinite(Number(row.height_roof)) ? Math.max(0, Math.round(Number(row.height_roof) * 0.3048 * 10) / 10) : null }
      : source.file === 'land' ? { name: row.boroname } : {},
    geometry: row.the_geom,
  }));
  await writeFile(new URL(`${source.file}.geojson`, output), JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
  manifest.sources.push({ file: `${source.file}.geojson`, url: url.href, dataset: `https://data.cityofnewyork.us/d/${source.resource}`, featureCount: features.length, pagination: { pageSize: 5000, offsetStep: 5000 } });
  console.log(`${source.file}: ${features.length} features`);
}));
manifest.sources.sort((a, b) => a.file.localeCompare(b.file));
await writeFile(new URL('sources.json', output), JSON.stringify(manifest, null, 2) + '\n');
