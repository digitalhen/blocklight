import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { promisify } from 'node:util';

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

// Atlanta joins two public sources: city permit records supply the measures, Overture
// supplies footprints and their heights. duckdb reads Overture's S3 parquet and runs the
// point-in-polygon join without downloading the planet.
const OVERTURE_RELEASE = '2026-08-19.0';
const overtureParquet = `s3://overturemaps-us-west-2/release/${OVERTURE_RELEASE}/theme=buildings/type=building/*`;
const PERMITS_ITEM = '655f985f43cc40b4bf2ab7bc73d2169b';
const permitsCsvUrl = `https://www.arcgis.com/sharing/rest/content/items/${PERMITS_ITEM}/data`;
const run = promisify(execFile);
// Overture names the dataset that supplied each property; keep the distinction visible.
const heightSources = { 'USGS Lidar': 'USGS 3DEP lidar (measured)', 'Microsoft ML Buildings': 'Microsoft ML estimate' };

async function duckdb(sql) {
  try {
    await run('duckdb', ['-c', sql], { maxBuffer: 1 << 28 });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Atlanta needs the duckdb CLI: brew install duckdb');
    throw error;
  }
}

const round = value => Math.round(value * 1e6) / 1e6;
const trim = geometry => JSON.parse(JSON.stringify(geometry, (_, v) => typeof v === 'number' ? round(v) : v));
async function atlanta() {
  const bounds = [-84.4, 33.748, -84.37, 33.79];
  const [minLon, minLat, maxLon, maxLat] = bounds;
  const dir = await mkdtemp(joinPath(tmpdir(), 'blocklight-atlanta-'));
  const at = name => joinPath(dir, name);

  const response = await fetch(permitsCsvUrl, { signal: AbortSignal.timeout(300000) });
  if (!response.ok) throw new Error(`${response.status}: Atlanta permits CSV`);
  await writeFile(at('permits.csv'), Buffer.from(await response.arrayBuffer()));

  // Only geocodes resolved to a specific address are eligible; a street- or ZIP-level point
  // says nothing about which building filed the permit. A permit inside two overlapping
  // footprints stays unmatched rather than being counted twice.
  await duckdb(`INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';
SET preserve_insertion_order=false;
CREATE TABLE b AS SELECT id, height, num_floors, names.primary AS name, class, subtype,
  list_filter(sources, s -> s.property = '/properties/height')[1].dataset AS height_source, geometry
FROM read_parquet('${overtureParquet}', hive_partitioning=1)
WHERE bbox.xmin < ${maxLon} AND bbox.xmax > ${minLon} AND bbox.ymin < ${maxLat} AND bbox.ymax > ${minLat};
CREATE TABLE p AS SELECT "RECORD ID" AS permit, "RECORD TYPE" AS rtype, "RECORD STATUS" AS status,
  addr_type, CAST(TRY(strptime("DATE OPENED", '%-m/%-d/%Y')) AS DATE) AS opened,
  ST_Point(TRY_CAST(longitude AS DOUBLE), TRY_CAST(latitude AS DOUBLE)) AS geom
FROM read_csv('${at('permits.csv')}', header=true, all_varchar=true)
WHERE TRY_CAST(longitude AS DOUBLE) BETWEEN ${minLon} AND ${maxLon}
  AND TRY_CAST(latitude AS DOUBLE) BETWEEN ${minLat} AND ${maxLat};
CREATE TABLE precise AS SELECT * FROM p WHERE addr_type IN ('PointAddress','Subaddress');
CREATE TABLE hits AS SELECT precise.permit, precise.rtype, precise.opened, b.id AS bid
  FROM precise JOIN b ON ST_Within(precise.geom, b.geometry);
CREATE TABLE matched AS SELECT * FROM hits WHERE permit IN (SELECT permit FROM hits GROUP BY 1 HAVING count(*) = 1);
COPY (SELECT bid AS id, count(*) AS permits,
    count(*) FILTER (WHERE rtype ILIKE '%New%') AS newConstruction,
    count(*) FILTER (WHERE rtype ILIKE '%Demolition%') AS demolition,
    count(*) FILTER (WHERE rtype NOT ILIKE '%New%' AND rtype NOT ILIKE '%Demolition%') AS alteration,
    mode(rtype) AS topType,
    max(CASE WHEN opened BETWEEN DATE '2019-01-01' AND DATE '2025-12-31' THEN opened END) AS latestPermit
  FROM matched GROUP BY 1) TO '${at('permits.json')}' (FORMAT JSON, ARRAY true);
COPY (SELECT id, height, num_floors, name, class, subtype, height_source,
    ST_AsGeoJSON(geometry) AS geom FROM b) TO '${at('buildings.json')}' (FORMAT JSON, ARRAY true);
COPY (SELECT (SELECT count(*) FROM p) AS inExtract, (SELECT count(*) FROM precise) AS preciseGeocode,
    (SELECT count(DISTINCT permit) FROM hits) AS insideAFootprint, (SELECT count(*) FROM matched) AS matched)
  TO '${at('summary.json')}' (FORMAT JSON, ARRAY true);`);

  const [rows, permits, [summary]] = await Promise.all(['buildings.json', 'permits.json', 'summary.json']
    .map(async name => JSON.parse(await readFile(at(name), 'utf8'))));
  await rm(dir, { recursive: true, force: true });

  const byBuilding = new Map(permits.map(r => [String(r.id), r]));
  // Every footprint gets a record so any building can be inspected, but a footprint with no
  // matched permit keeps null: no permit was linked here, which is not a filing count of zero.
  const records = rows.map(row => {
    const id = String(row.id), permit = byBuilding.get(id), height = numeric(row.height), floors = numeric(row.num_floors);
    return {
      id,
      name: row.name ?? null,
      class: row.subtype ? [row.subtype, row.class].filter(Boolean).join(' · ') : row.class ?? null,
      permits: permit?.permits ?? null,
      newConstruction: permit?.newConstruction ?? null,
      demolition: permit?.demolition ?? null,
      alteration: permit?.alteration ?? null,
      topType: permit?.topType ?? null,
      latestPermit: permit?.latestPermit ?? null,
      height: height > 0 ? round(height) : null,
      floors: floors > 0 ? floors : null,
      heightSource: height > 0 ? heightSources[row.height_source] ?? 'OpenStreetMap contributor tag' : null,
      match: permit ? 'Permit point falls inside this footprint and no other.' : 'No permit matched to this footprint.',
    };
  });
  const byId = new Map(records.map(r => [r.id, r]));
  const buildings = rows.map(row => ({
    type: 'Feature', id: String(row.id),
    properties: { building_id: String(row.id), height_m: byId.get(String(row.id)).height ?? 0 },
    geometry: trim(typeof row.geom === 'string' ? JSON.parse(row.geom) : row.geom),
  }));
  const withPermits = records.filter(r => r.permits != null).length;
  if (summary.matched !== permits.reduce((total, r) => total + r.permits, 0)) throw new Error('Atlanta permit totals do not reconcile');
  await save('atlanta', buildings, records, ['permits', 'newConstruction'], {
    sources: [`https://dpcd-coaplangis.opendata.arcgis.com/datasets/${PERMITS_ITEM}`, 'https://docs.overturemaps.org/guides/buildings/', 'https://www.openstreetmap.org/copyright', 'https://www.usgs.gov/3d-elevation-program'],
    permitsCsv: permitsCsvUrl, release: OVERTURE_RELEASE, parquet: overtureParquet, bounds,
    coverage: 'Downtown and Midtown Atlanta extract', period: 'Permits opened 2019 through 2024',
    permitsInExtract: summary.inExtract, permitsPreciseGeocode: summary.preciseGeocode,
    permitsInsideAFootprint: summary.insideAFootprint, permitsMatched: summary.matched,
    permitsUnmatched: summary.inExtract - summary.matched, buildingsWithPermits: withPermits,
    heightsMeasured: records.filter(r => r.heightSource?.startsWith('USGS')).length,
    heightsEstimated: records.filter(r => r.heightSource?.startsWith('Microsoft')).length,
    heightsTagged: records.filter(r => r.heightSource && !r.heightSource.startsWith('USGS') && !r.heightSource.startsWith('Microsoft')).length,
    heightsMissing: records.filter(r => r.height == null).length,
    license: 'Geometry ODbL; permit records under City of Atlanta open data terms',
    attribution: '© OpenStreetMap contributors. Available under the Open Database License',
    terms: 'https://opendatacommons.org/licenses/odbl/',
    notes: 'Permit counts come from the City of Atlanta Accela extract, 2019 through 2024. A permit joins a footprint only when its geocode resolved to a specific address (PointAddress or Subaddress) and its point falls inside exactly one footprint; street-, ZIP- and city-level geocodes and points inside overlapping footprints stay unmatched. No nearest-building fallback and no duplication across footprints. A footprint with no matched permit is null, not zero: permits may have been filed and geocoded elsewhere. Permits are applications and approvals, not construction that happened, and not a measure of building quality. Footprints and heights come from the Overture buildings theme under ODbL; height provenance is per building and is context here, not a published measure.',
  });
  console.log(`atlanta: ${summary.matched} of ${summary.inExtract} permits matched to ${withPermits} footprints`);
}

const builders = { chicago, seattle, atlanta };
const requested = process.argv.slice(2);
const unknown = requested.filter(name => !(name in builders));
if (unknown.length) throw new Error(`Unknown city: ${unknown.join(', ')}. Known: ${Object.keys(builders).join(', ')}`);
for (const name of requested.length ? requested : Object.keys(builders)) await builders[name]();
