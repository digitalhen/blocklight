import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
const kind = process.argv[2];
if (!['buildings','311','streets'].includes(kind)) throw new Error('Specify buildings, streets or 311');
const cache = new URL(`../../.cache/citywide-${kind}/`, import.meta.url);
await mkdir(cache, { recursive: true });
const url = new URL(`https://data.cityofnewyork.us/resource/${kind === 'buildings' ? '5zhs-2jue' : kind === 'streets' ? 'inkn-q76z' : 'erm2-nwe9'}.json`);
if (kind === '311') {
  url.searchParams.set('$where', "created_date >= '2025-01-01T00:00:00' AND created_date < '2026-01-01T00:00:00' AND agency = 'HPD'");
  url.searchParams.set('$group', 'bbl,latitude,longitude,complaint_type,status,incident_address');
  url.searchParams.set('$select', 'bbl,latitude,longitude,complaint_type,status,incident_address,count(*) as count,max(created_date) as latest_created');
  url.searchParams.set('$order', 'bbl,latitude,longitude,complaint_type,status,incident_address');
} else if (kind === 'streets') {
  url.searchParams.set('$select', 'the_geom'); url.searchParams.set('$order', ':id');
} else {
  url.searchParams.set('$select', 'objectid,bin,base_bbl,mappluto_bbl,height_roof,simplify_preserve_topology(the_geom,0.000005) as the_geom');
  url.searchParams.set('$order', 'objectid');
}
const pageSize = 20000;
url.searchParams.set('$limit', String(pageSize));
let pages = 0, rows = 0, lastObjectId;
for (let offset = 0; ; offset += pageSize) {
  if (offset > 2000000) throw new Error('Unexpected citywide size; inspect source before continuing.');
  const file = new URL(`${offset}.json`, cache);
  let data;
  try { data = JSON.parse(await readFile(file, 'utf8')); }
  catch {
    if (kind === 'buildings') {
      url.searchParams.delete('$offset');
      if (lastObjectId != null) url.searchParams.set('$where', `objectid > ${lastObjectId}`);
    } else url.searchParams.set('$offset', String(offset));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
        data = await response.json();
        if (!Array.isArray(data)) throw new Error('Expected array');
        await writeFile(file, JSON.stringify(data));
        break;
      } catch (error) { if (attempt === 2) throw error; console.warn(`${kind}: retrying offset ${offset}: ${error.message}`); }
    }
  }
  if (kind === 'buildings' && data.length) lastObjectId = Number(data.at(-1).objectid);
  pages++; rows += data.length; console.log(`${kind}: ${rows.toLocaleString()} ${kind === '311' ? 'aggregate rows' : 'footprints'}`);
  if (data.length < pageSize) break;
}
url.searchParams.set('$offset', '0');
if (kind === 'buildings') url.searchParams.delete('$where');
await writeFile(new URL('manifest.json', cache), JSON.stringify({ kind, rows, pages, pageSize, query: url.href, fetchedAt: new Date().toISOString() }, null, 2));
