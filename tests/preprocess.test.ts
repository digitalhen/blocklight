import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchBuildingRecords } from '../packages/blocklight/src/preprocess.js';
import type { FeatureCollection } from 'geojson';
const geometry: FeatureCollection = { type: 'FeatureCollection', features: [0, 2].map((x, i) => ({ type: 'Feature', properties: { id: String(i), lot: 'shared' }, geometry: { type: 'Polygon', coordinates: [[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]] } })) };
test('portable raw-record matching conserves totals and refuses to duplicate shared-lot records', () => {
 const result = matchBuildingRecords(geometry, [
  { id: 'a', lot: 'shared', x: .5, y: .5, count: 3 },
  { id: 'b', lot: 'shared', count: 2 },
  { id: 'c', lot: 'absent', count: 1 },
  { id: 'd', count: 1 },
 ], { featureId: 'id', featureKeys: ['lot'], recordId: 'id', recordKey: 'lot', longitude: 'x', latitude: 'y', weight: 'count', completeGeometry: true });
 assert.equal(result.matched[0].buildingId, '0');
 assert.deepEqual(result.unmatched.map(r => r.reason), ['ambiguous', 'no-footprint', 'missing-key']);
 assert.deepEqual(result.summary, { records: 4, matchedRecords: 1, unmatchedRecords: 3, totalWeight: 7, matchedWeight: 3, unmatchedWeight: 4 });
});

test('holes, overlapping footprints, and duplicate records stay conservative', () => {
 const outer = [[0,0],[4,0],[4,4],[0,4],[0,0]], hole = [[1,1],[2,1],[2,2],[1,2],[1,1]];
 const overlapping: FeatureCollection = { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { id: 'a', lot: 'x' }, geometry: { type: 'Polygon', coordinates: [outer, hole] } },
  { type: 'Feature', properties: { id: 'b', lot: 'x' }, geometry: { type: 'MultiPolygon', coordinates: [[outer]] } },
 ] };
 const options = { featureId: 'id', featureKeys: ['lot'], recordId: 'id', recordKey: 'lot', longitude: 'x', latitude: 'y', completeGeometry: true as const };
 const result = matchBuildingRecords(overlapping, [{ id: 'inside-hole', lot: 'x', x: 1.5, y: 1.5 }, { id: 'overlap', lot: 'x', x: 3, y: 3 }], options);
 assert.equal(result.matched[0].buildingId, 'b'); assert.equal(result.unmatched[0].reason, 'ambiguous');
 assert.throws(() => matchBuildingRecords(overlapping, [{ id: 'same' }, { id: 'same' }], options), /unique IDs/);
});
