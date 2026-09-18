import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
export interface RecordMatchOptions {
  featureId: string;
  featureKeys: string[];
  recordId: string;
  recordKey: string;
  longitude?: string;
  latitude?: string;
  weight?: string;
  /** Matching needs the complete set of footprints for every supplied join key. */
  completeGeometry: true;
  normalizeKey?: (value: unknown) => string | null;
}
function inRing([x, y]: Position, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-14 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function footprintContainsPoint(geometry: Geometry, point: Position): boolean {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(rings => rings.length > 0 && inRing(point, rings[0]) && !rings.slice(1).some(ring => inRing(point, ring)));
}
/** Preprocess raw records on complete geometry, outside the rendering/viewport loop. */
export function matchBuildingRecords<T extends Record<string, unknown>>(geometry: FeatureCollection, records: T[], options: RecordMatchOptions) {
  if (options.completeGeometry !== true) throw new Error('Matching requires complete geometry for each join key, not viewport tiles.');
  if (!options.featureKeys.length) throw new Error('At least one feature key is required.');
  const normalize = options.normalizeKey ?? ((value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() || null : null);
  const byKey = new Map<string, Feature[]>(), identities = new Set<string>();
  for (const feature of geometry.features) {
    const identity = feature.properties?.[options.featureId];
    if (identity == null || String(identity) === '' || identities.has(String(identity))) throw new Error('Footprints require unique building identities.');
    identities.add(String(identity));
    for (const key of new Set(options.featureKeys.map(field => normalize(feature.properties?.[field])).filter((value): value is string => !!value))) {
      const group = byKey.get(key) ?? []; group.push(feature); byKey.set(key, group);
    }
  }
  const seen = new Set<string>();
  const matched: { recordId: string; buildingId: string; method: 'unique-key' | 'point-within-key'; record: T }[] = [];
  const unmatched: { recordId: string; reason: 'missing-key' | 'no-footprint' | 'ambiguous'; record: T }[] = [];
  let totalWeight = 0, matchedWeight = 0;
  for (const record of records) {
    const id = record[options.recordId];
    if (id == null || String(id) === '' || seen.has(String(id))) throw new Error('Records require unique IDs.');
    const recordId = String(id); seen.add(recordId);
    const weight = options.weight ? Number(record[options.weight]) : 1;
    if (!Number.isSafeInteger(weight) || weight < 1) throw new Error('Weights must be positive safe integers.');
    totalWeight += weight;
    if (!Number.isSafeInteger(totalWeight)) throw new Error('Total weight exceeds safe integer range.');
    const key = normalize(record[options.recordKey]);
    const candidates = key ? byKey.get(key) ?? [] : [];
    let feature = candidates.length === 1 ? candidates[0] : undefined;
    if (!feature && candidates.length > 1 && options.longitude && options.latitude) {
      const x = record[options.longitude], y = record[options.latitude];
      if (x != null && y != null && String(x).trim() && String(y).trim() && Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
        const contained = candidates.filter(f => footprintContainsPoint(f.geometry, [Number(x), Number(y)]));
        if (contained.length === 1) feature = contained[0];
      }
    }
    if (feature) {
      matchedWeight += weight;
      matched.push({ recordId, buildingId: String(feature.properties?.[options.featureId]), method: candidates.length === 1 ? 'unique-key' : 'point-within-key', record });
    } else unmatched.push({ recordId, reason: !key ? 'missing-key' : candidates.length ? 'ambiguous' : 'no-footprint', record });
  }
  return { matched, unmatched, summary: { records: records.length, matchedRecords: matched.length, unmatchedRecords: unmatched.length, totalWeight, matchedWeight, unmatchedWeight: totalWeight - matchedWeight } };
}
