import { writeFile } from 'node:fs/promises';
const result = {};
await Promise.all(['buildings', '311'].map(async kind => {
  const url = new URL(`https://data.cityofnewyork.us/resource/${kind === 'buildings' ? '5zhs-2jue' : 'erm2-nwe9'}.json`);
  url.searchParams.set('$select', 'count(*) as count');
  if (kind === '311') url.searchParams.set('$where', "created_date >= '2025-01-01T00:00:00' AND created_date < '2026-01-01T00:00:00' AND agency = 'HPD'");
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Count ${kind}: HTTP ${response.status}`);
  const data = await response.json(); result[kind] = Number(data[0].count);
  console.log(`${kind}: ${result[kind].toLocaleString()} source rows`);
}));
await writeFile(new URL('../../.cache/citywide-counts.json', import.meta.url), JSON.stringify(result));
