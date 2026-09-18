import { mkdir, readFile, writeFile } from 'node:fs/promises';
const cache = new URL('../../.cache/citywide-311/', import.meta.url);
await mkdir(cache, { recursive: true });
const months = Array.from({ length: 12 }, (_, i) => i + 1);
const files = [], queries = [];
let rows = 0;
async function monthData(month) {
  const from = `2025-${String(month).padStart(2,'0')}-01`, to = month === 12 ? '2026-01-01' : `2025-${String(month + 1).padStart(2,'0')}-01`;
  const url = new URL('https://data.cityofnewyork.us/resource/erm2-nwe9.json');
  url.searchParams.set('$where', `created_date >= '${from}T00:00:00' AND created_date < '${to}T00:00:00' AND agency = 'HPD'`);
  url.searchParams.set('$select', 'bbl,latitude,longitude,complaint_type,status,incident_address,count(*) as count,max(created_date) as latest_created');
  url.searchParams.set('$group', 'bbl,latitude,longitude,complaint_type,status,incident_address');
  url.searchParams.set('$order', 'bbl,latitude,longitude,complaint_type,status,incident_address');
  url.searchParams.set('$limit', '20000');
  queries.push(url.href);
  for (let offset = 0; ; offset += 20000) {
    const name = `${from}-${offset}.json`, file = new URL(name, cache);
    let data;
    try { data = JSON.parse(await readFile(file, 'utf8')); }
    catch {
      url.searchParams.set('$offset', String(offset));
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
          data = await response.json(); if (!Array.isArray(data)) throw new Error('Expected array');
          await writeFile(file, JSON.stringify(data)); break;
        } catch (error) { if (attempt === 2) throw error; console.warn(`Retrying ${name}: ${error.message}`); }
      }
    }
    files.push(name); rows += data.length; console.log(`311 ${from}: page ${offset}; ${rows.toLocaleString()} total groups`);
    if (data.length < 20000) break;
  }
}
await Promise.all(Array.from({ length: 3 }, async () => { while (months.length) await monthData(months.shift()); }));
await writeFile(new URL('manifest.json', cache), JSON.stringify({ kind: '311', files: files.sort(), rows, queries, fetchedAt: new Date().toISOString(), scope: 'All HPD requests created in 2025, all boroughs, including rows without usable coordinates.' }, null, 2));
