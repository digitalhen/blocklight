import { mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../../playground/public/data/cities/', import.meta.url);
async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`${r.status}: ${url}`);
  const data = await r.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data;
}
const numeric = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
async function save(city, buildings, records, fields, provenance) {
  if (!buildings.length || !records.length) throw new Error(`Empty ${city} extract`);
  if (new Set(buildings.map(f => f.properties.building_id)).size !== buildings.length || new Set(records.map(r => r.id)).size !== records.length) throw new Error(`Duplicate ${city} identifiers`);
  const dir = new URL(`${city}/`, root); await mkdir(dir, { recursive: true });
  await writeFile(new URL('buildings.geojson', dir), JSON.stringify({ type: 'FeatureCollection', features: buildings }));
  await writeFile(new URL('attributes.json', dir), JSON.stringify(records));
  await writeFile(new URL('datasets.json', dir), JSON.stringify(Object.fromEntries(fields.map(field => [field, records.filter(r => typeof r[field] === 'number' && Number.isFinite(r[field]))]))));
  await writeFile(new URL('source.json', dir), JSON.stringify({ ...provenance, fetchedAt: new Date().toISOString(), buildings: buildings.length, matchedRecords: records.length }, null, 2) + '\n');
  console.log(`${city}: ${buildings.length} footprints, ${records.length} matched records`);
}

async function chicago() {
  const bounds = [-87.648, 41.867, -87.615, 41.899];
  const url = new URL('https://data.cityofchicago.org/resource/syp8-uezg.json');
  url.searchParams.set('$where', `intersects(the_geom, 'POLYGON ((${bounds[0]} ${bounds[1]}, ${bounds[2]} ${bounds[1]}, ${bounds[2]} ${bounds[3]}, ${bounds[0]} ${bounds[3]}, ${bounds[0]} ${bounds[1]}))')`);
  url.searchParams.set('$order', 'bldg_id'); url.searchParams.set('$limit', '5000');
  const rows = [];
  for (let offset = 0; ; offset += 5000) { url.searchParams.set('$offset', String(offset)); const page = await json(url); if (!Array.isArray(page)) throw new Error(JSON.stringify(page)); rows.push(...page); if (page.length < 5000) break; }
  const records = rows.map(row => {
    const year = numeric(row.year_built), floors = numeric(row.stories);
    return { id: String(row.bldg_id), name: [row.f_add1, row.pre_dir1, row.st_name1, row.st_type1].filter(Boolean).join(' ') || `Building ${row.bldg_id}`, year: year > 1700 && year <= new Date().getUTCFullYear() ? year : null, floors: floors > 0 ? floors : null };
  });
  const byId = new Map(records.map(r => [r.id, r]));
  const buildings = rows.map(row => ({ type: 'Feature', id: String(row.bldg_id), properties: { building_id: String(row.bldg_id), height_m: (byId.get(String(row.bldg_id)).floors ?? 0) * 3 }, geometry: row.the_geom }));
  await save('chicago', buildings, records, ['year', 'floors'], { sources: ['https://data.cityofchicago.org/d/syp8-uezg'], query: url.href, bounds, coverage: 'Downtown Chicago extract', terms: 'https://www.chicago.gov/city/en/narr/foia/data_disclaimer.html', notes: 'Historical footprint attributes, not verified current conditions. Join by original bldg_id. Height estimated as reported stories × 3 meters; unknown heights remain flat. Invalid/missing year and story values stay null, never zero.' });
}

const service = 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Building_Outlines_2023/FeatureServer/0/query';
async function outlines(params) {
  const results = [];
  for (let offset = 0; ; offset += 2000) {
    const url = new URL(service);
    for (const [key, value] of Object.entries({ where: '1=1', outFields: 'OBJECTID,OUTLINE_ID,PIN', outSR: '4326', f: 'geojson', orderByFields: 'OBJECTID', resultRecordCount: '2000', resultOffset: String(offset), ...params })) url.searchParams.set(key, value);
    const data = await json(url); if (!Array.isArray(data.features)) throw new Error('Missing outline features');
    results.push(...data.features); if (data.features.length < 2000) break;
  }
  return results;
}
async function seattle() {
  const bounds = [-122.353, 47.595, -122.321, 47.623];
  const energyUrl = new URL('https://data.seattle.gov/resource/teqw-tu6e.json');
  energyUrl.searchParams.set('$where', "datayear = '2024'"); energyUrl.searchParams.set('$limit', '10000'); energyUrl.searchParams.set('$order', 'osebuildingid');
  const all = await json(energyUrl);
  if (!Array.isArray(all) || all.length >= 10000) throw new Error('Truncated energy response');
  const rows = all.filter(r => Number(r.longitude) >= bounds[0] && Number(r.longitude) <= bounds[2] && Number(r.latitude) >= bounds[1] && Number(r.latitude) <= bounds[3]);
  const footprints = await outlines({ geometry: bounds.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' });
  const pin = value => /^\d{1,10}$/.test(value ?? '') ? String(value).padStart(10, '0') : null;
  const pins = [...new Set(rows.map(r => pin(r.taxparcelidentificationnumber)).filter(Boolean))];
  // Check the WHOLE parcel, including outlines outside the map extract, before joining.
  const parcelBuildings = new Map();
  for (let i = 0; i < pins.length; i += 80) {
    for (const f of await outlines({ where: `PIN IN (${pins.slice(i, i + 80).map(p => `'${p}'`).join(',')})` })) {
      const key = pin(f.properties.PIN); const ids = parcelBuildings.get(key) ?? new Set(); ids.add(String(f.properties.OBJECTID)); parcelBuildings.set(key, ids);
    }
  }
  const parcelReports = new Map();
  for (const r of all) { const key = pin(r.taxparcelidentificationnumber); if (key) parcelReports.set(key, (parcelReports.get(key) ?? 0) + 1); }
  const visible = new Set(footprints.map(f => String(f.properties.OBJECTID)));
  const records = [];
  for (const r of rows) {
    const key = pin(r.taxparcelidentificationnumber), ids = parcelBuildings.get(key);
    if (!key || ids?.size !== 1 || parcelReports.get(key) !== 1 || Number(r.numberofbuildings) !== 1 || r.demolished === true || r.compliancestatus !== 'Compliant' || r.complianceissue !== 'No Issue') continue;
    const id = [...ids][0]; if (!visible.has(id)) continue;
    const eui = numeric(r.siteeui_kbtu_sf), ghg = numeric(r.ghgemissionsintensity), floors = numeric(r.numberoffloors);
    records.push({ id, name: r.buildingname, address: r.address, use: r.epapropertytype, year: numeric(r.yearbuilt), floors: floors > 0 ? floors : null, eui: eui >= 0 ? eui : null, ghg: ghg >= 0 ? ghg : null, reportingYear: 2024, benchmarkId: r.osebuildingid, match: 'One reporting property and one footprint on the entire tax parcel.' });
  }
  const byId = new Map(records.map(r => [r.id, r]));
  const buildings = footprints.map(f => ({ type: 'Feature', id: String(f.properties.OBJECTID), properties: { building_id: String(f.properties.OBJECTID), height_m: (byId.get(String(f.properties.OBJECTID))?.floors ?? 0) * 3 }, geometry: f.geometry }));
  await save('seattle', buildings, records, ['eui', 'ghg'], { sources: ['https://data.seattle.gov/d/teqw-tu6e', 'https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::building-outlines-2023'], energyQuery: energyUrl.href, geometryService: service, bounds, coverage: 'Downtown Seattle extract', reportingYear: 2024, candidateRecords: rows.length, excludedRecords: rows.length - records.length, terms: 'https://www.seattle.gov/tech/initiatives/open-data', notes: '2024 self-reported energy data; 2023 outlines. Only compliant reports with No Issue, one reported building, one record per parcel, and exactly one footprint across the entire parcel are joined. No nearest-building guesses. Heights estimated as floors × 3 meters for matched records; unknown heights stay flat. EUI: annual kBtu/ft². GHG intensity: annual kgCO₂e/ft². Different property uses are not directly comparable; no quality score is implied.' });
}
await chicago();
await seattle();
