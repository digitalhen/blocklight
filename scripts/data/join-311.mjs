/** Conservative lot/footprint matching. Never assign a request to every building on a lot. */
export function normalizeBBL(value) {
  const n = String(value ?? '').trim().replace(/\.0+$/, '');
  return /^[1-5]\d{9}$/.test(n) ? n : null;
}
function inRing(point, ring) {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-14 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function containsPoint(geometry, point) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(rings => inRing(point, rings[0]) && !rings.slice(1).some(hole => inRing(point, hole)));
}
export function joinRequests(features, rows) {
  const byLot = new Map();
  for (const feature of features) {
    for (const bbl of new Set([normalizeBBL(feature.properties.base_bbl), normalizeBBL(feature.properties.mappluto_bbl)])) {
      if (!bbl) continue;
      const existing = byLot.get(bbl) ?? []; existing.push(feature); byLot.set(bbl, existing);
    }
  }
  const stats = new Map(), unmatched = [], seen = new Set();
  let totalRequests = 0;
  const methods = { single_building_lot: 0, footprint_within_lot: 0 };
  for (const row of rows) {
    if (!row.unique_key || seen.has(row.unique_key)) throw new Error(`Missing or duplicate 311 request ID: ${row.unique_key}`);
    seen.add(row.unique_key);
    const weight = Number(row.count ?? 1);
    if (!Number.isSafeInteger(weight) || weight < 1) throw new Error('Invalid request count');
    totalRequests += weight;
    const bbl = normalizeBBL(row.bbl), candidates = bbl ? byLot.get(bbl) ?? [] : [];
    let feature, method;
    if (candidates.length === 1) { feature = candidates[0]; method = 'single_building_lot'; }
    else if (candidates.length > 1) {
      const lat = Number(row.latitude), lng = Number(row.longitude);
      const contained = row.latitude != null && row.longitude != null && Number.isFinite(lat) && Number.isFinite(lng)
        ? candidates.filter(f => containsPoint(f.geometry, [lng, lat])) : [];
      if (contained.length === 1) { feature = contained[0]; method = 'footprint_within_lot'; }
    }
    if (!feature) { unmatched.push({ requestId: row.unique_key, count: weight, reason: !bbl ? 'missing_bbl' : candidates.length === 0 ? 'no_footprint_for_lot' : 'ambiguous_multi_building_lot' }); continue; }
    const id = String(feature.properties.source_id);
    let record = stats.get(id);
    if (!record) {
      record = { buildingId: id, bin: feature.properties.bin, count: 0, categories: {}, statuses: {}, addresses: [], latestCreatedAt: null, matchMethods: { single_building_lot: 0, footprint_within_lot: 0 } };
      stats.set(id, record);
    }
    record.count += weight; methods[method] += weight; record.matchMethods[method] += weight;
    const category = row.complaint_type || 'Unspecified'; record.categories[category] = (record.categories[category] ?? 0) + weight;
    const status = row.status || 'Unknown'; record.statuses[status] = (record.statuses[status] ?? 0) + weight;
    if (row.incident_address && !record.addresses.includes(row.incident_address)) record.addresses.push(row.incident_address);
    if (row.created_date && (!record.latestCreatedAt || row.created_date > record.latestCreatedAt)) record.latestCreatedAt = row.created_date;
  }
  const reasons = {}; for (const row of unmatched) reasons[row.reason] = (reasons[row.reason] ?? 0) + row.count;
  return {
    buildings: [...stats.values()].sort((a, b) => a.buildingId.localeCompare(b.buildingId)),
    summary: { totalRequests, matchedRequests: totalRequests - unmatched.reduce((n, r) => n + r.count, 0), unmatchedRequests: unmatched.reduce((n, r) => n + r.count, 0), matchedBuildings: stats.size, matchMethods: methods, unmatchedReasons: reasons },
  };
}
