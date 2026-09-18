import { writeFile, mkdir } from 'node:fs/promises';
import { aggregateComplaints, grid } from './aggregate-crime.mjs';
const url = new URL('https://data.cityofnewyork.us/resource/qgea-i56i.json');
url.searchParams.set('$select', 'latitude,longitude,count(*) as count');
url.searchParams.set('$where', `rpt_dt >= '2025-01-01T00:00:00' AND rpt_dt < '2026-01-01T00:00:00' AND latitude >= ${grid.south} AND latitude < ${grid.north} AND longitude >= ${grid.west} AND longitude < ${grid.east}`);
url.searchParams.set('$group', 'latitude,longitude');
url.searchParams.set('$order', 'latitude,longitude');
url.searchParams.set('$limit', '50000');
const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`NYPD: HTTP ${response.status} ${await response.text()}`);
const rows = await response.json();
if (!rows.length || rows.length >= 50000) throw new Error('Empty or potentially truncated result; do not publish.');
const data = aggregateComplaints(rows);
const total = data.features.reduce((sum, feature) => sum + feature.properties.count, 0);
const output = new URL('../../playground/public/data/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('crime.geojson', output), JSON.stringify(data) + '\n');
await writeFile(new URL('crime-source.json', output), JSON.stringify({
  title: 'NYPD reported complaints · Midtown sample', dataset: 'https://data.cityofnewyork.us/d/qgea-i56i', query: url.href, fetchedAt: new Date().toISOString(),
  dateField: 'rpt_dt', from: '2025-01-01', toExclusive: '2026-01-01', total, cells: data.features.length, grid,
  methodology: 'Each source row is a complaint. All offense categories included; filtered by report date, not occurrence date. Records with missing or out-of-bounds coordinates are excluded. Counts are aggregated into approximately 200m cells. No population or foot-traffic denominator. Blank areas have no included records, not proof of no crime. Location accuracy and reporting practices affect the result. Cell centers are not incident locations.',
  terms: 'https://opendata.cityofnewyork.us/overview/#termsofuse',
}, null, 2) + '\n');
console.log(`${total} complaints in ${data.features.length} cells; maximum ${Math.max(...data.features.map(f => f.properties.count))}`);
