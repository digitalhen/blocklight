import type { FeatureCollection } from 'geojson';
export interface BuildingRecord {
  buildingId: string;
  bin?: string | null;
  count: number;
  categories: Record<string, number>;
  statuses: Record<string, number>;
  addresses: string[];
  latestCreatedAt: string | null;
  matchMethods: { single_building_lot: number; footprint_within_lot: number };
}
export interface BuildingDataset {
  schemaVersion: 1;
  title: string;
  agency: string;
  scope?: 'citywide';
  period: { from: string; toExclusive: string; dateField: string };
  source: { dataset: string; fetchedAt: string };
  join: { featureKey: string; recordKey: string; geometryFile: string; geometryVersion?: string; methodology: string };
  summary: { totalRequests: number; matchedRequests: number; unmatchedRequests: number; matchedBuildings: number };
  buildings: BuildingRecord[];
}
/** Validate the portable demo format before it changes any visible data. */
export function parseBuildingDataset(input: unknown, geometry?: FeatureCollection, geometryVersion?: string): BuildingDataset {
  const fail = (message: string): never => { throw new Error(`Invalid building JSON: ${message}`); };
  if (!input || typeof input !== 'object') return fail('expected an object.');
  const d = input as BuildingDataset;
  if (d.schemaVersion !== 1 || typeof d.title !== 'string' || typeof d.agency !== 'string' || !Array.isArray(d.buildings)) return fail('expected schemaVersion 1, title, agency and buildings.');
  if (d.join?.featureKey !== 'source_id' || d.join?.recordKey !== 'buildingId') return fail('join must use source_id → buildingId.');
  for (const key of ['from', 'toExclusive'] as const) if (!/^\d{4}-\d{2}-\d{2}$/.test(d.period?.[key] ?? '') || !Number.isFinite(Date.parse(d.period[key]))) return fail('period dates must be YYYY-MM-DD.');
  if (d.period.from >= d.period.toExclusive) return fail('period must have a positive duration.');
  if (typeof d.source?.dataset !== 'string' || typeof d.source?.fetchedAt !== 'string') return fail('source metadata is required.');
  if (geometryVersion && d.join.geometryVersion !== geometryVersion) return fail('the geometry version does not match the loaded city files.');
  const keys = geometry ? new Set(geometry.features.map(f => String(f.properties?.source_id))) : undefined, seen = new Set<string>();
  let total = 0;
  function count(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
  for (const record of d.buildings) {
    if (!record || typeof record.buildingId !== 'string' || (keys && !keys.has(record.buildingId))) return fail('a buildingId is absent from the loaded footprints.');
    if (seen.has(record.buildingId)) return fail(`duplicate buildingId ${record.buildingId}.`);
    seen.add(record.buildingId);
    if (!count(record.count) || record.count === 0) return fail('building counts must be positive integers; omit zero-count records.');
    for (const field of ['categories', 'statuses', 'matchMethods'] as const) {
      const values = record[field];
      if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.values(values).every(count) || Object.values(values).reduce((a, b) => a + b, 0) !== record.count) return fail(`${field} must sum to the building count.`);
    }
    if (!count(record.matchMethods.single_building_lot) || !count(record.matchMethods.footprint_within_lot)) return fail('unknown match methods.');
    if (!Array.isArray(record.addresses) || record.addresses.some(a => typeof a !== 'string')) return fail('addresses must be strings.');
    if (record.latestCreatedAt !== null && (typeof record.latestCreatedAt !== 'string' || !Number.isFinite(Date.parse(record.latestCreatedAt)))) return fail('invalid latestCreatedAt.');
    total += record.count;
  }
  const s = d.summary;
  if (!s || ![s.totalRequests, s.matchedRequests, s.unmatchedRequests, s.matchedBuildings].every(count) || total !== s.matchedRequests || s.totalRequests !== s.matchedRequests + s.unmatchedRequests || s.matchedBuildings !== d.buildings.length) return fail('summary counts do not reconcile.');
  return d;
}
export function decorateBuildings(geometry: FeatureCollection, dataset: BuildingDataset): FeatureCollection {
  const records = new Map(dataset.buildings.map(record => [record.buildingId, record]));
  return { ...geometry, features: geometry.features.map(feature => ({ ...feature, properties: { ...feature.properties, requests: records.get(String(feature.properties?.source_id))?.count ?? 0 } })) };
}
