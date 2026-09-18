import { readFile, writeFile } from 'node:fs/promises';
import { joinRequests } from './join-311.mjs';
const output = new URL('../../playground/public/data/', import.meta.url);
const geometryText = await readFile(new URL('buildings.geojson', output), 'utf8');
const geometry = JSON.parse(geometryText);
if (!geometry.features.some(f => f.properties.base_bbl)) throw new Error('Run npm run data:nyc first to load building lot IDs.');
const url = new URL('https://data.cityofnewyork.us/resource/erm2-nwe9.json');
url.searchParams.set('$select', 'unique_key,created_date,agency,complaint_type,status,incident_address,bbl,latitude,longitude');
url.searchParams.set('$where', "created_date >= '2025-01-01T00:00:00' AND created_date < '2026-01-01T00:00:00' AND agency = 'HPD' AND latitude >= 40.725 AND latitude < 40.785 AND longitude >= -74.010 AND longitude < -73.950");
url.searchParams.set('$order', 'unique_key'); url.searchParams.set('$limit', '5000');
const rows = [];
for (let offset = 0; ; offset += 5000) {
  if (offset >= 100000) throw new Error('Sample exceeded 100,000 rows; narrow coverage or add a larger-data pipeline.');
  url.searchParams.set('$offset', String(offset));
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`311 source: HTTP ${response.status} ${await response.text()}`);
  const page = await response.json();
  if (!Array.isArray(page)) throw new Error('Invalid 311 response.');
  rows.push(...page); console.log(`311: ${rows.length} requests fetched`);
  if (page.length < 5000) break;
}
if (!rows.length) throw new Error('Empty source response; previous data left untouched.');
url.searchParams.set('$offset', '0');
const result = joinRequests(geometry.features, rows);
const data = {
  schemaVersion: 1, title: '311 housing requests by building', agency: 'HPD',
  period: { from: '2025-01-01', toExclusive: '2026-01-01', dateField: 'created_date' },
  source: { dataset: 'https://data.cityofnewyork.us/d/erm2-nwe9', query: url.href, fetchedAt: new Date().toISOString(), pageSize: 5000, terms: 'https://opendata.cityofnewyork.us/overview/#termsofuse' },
  join: { featureKey: 'source_id', recordKey: 'buildingId', geometryFile: 'buildings.geojson',
    methodology: 'Match BBL to base_bbl or mappluto_bbl. Assign a single-footprint lot to that footprint. For lots with multiple footprints, require the request point to fall inside exactly one footprint on the same lot. Do not duplicate across buildings or guess the nearest building. Unresolved matches are excluded from building counts and included in summary. Coordinates restrict the source to the sample bounds, so requests without coordinates are outside this extract. Request counts are not confirmed violations or measures of building quality.' },
  ...result,
};
await writeFile(new URL('311-buildings.json', output), JSON.stringify(data) + '\n');
console.log(JSON.stringify(data.summary, null, 2));
