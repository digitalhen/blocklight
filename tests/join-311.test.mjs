import test from 'node:test';
import assert from 'node:assert/strict';
import { joinRequests, containsPoint } from '../scripts/data/join-311.mjs';
const square = (x, id, bbl) => ({ type: 'Feature', properties: { source_id: id, bin: id, base_bbl: bbl }, geometry: { type: 'Polygon', coordinates: [[[x, 0], [x+1, 0], [x+1, 1], [x, 1], [x, 0]]] } });
const request = (id, bbl, x) => ({ unique_key: id, bbl, longitude: x, latitude: 0.5, complaint_type: 'HEAT/HOT WATER', status: 'Closed' });
test('does not duplicate a 311 request across a multi-building lot', () => {
  const buildings = [square(0, 'A', '1000010001'), square(2, 'B', '1000010001'), square(4, 'C', '1000020001')];
  const result = joinRequests(buildings, [request('1', '1000010001', .5), request('2', '1000010001', 1.5), request('3', '1000020001', 5.1), request('4', null, 4.5), request('5', '1999999999', .5)]);
  assert.deepEqual(result.buildings.map(b => [b.buildingId, b.count]), [['A', 1], ['C', 1]]);
  assert.equal(result.summary.totalRequests, 5);
  assert.equal(result.summary.matchedRequests, 2);
  assert.equal(result.summary.unmatchedRequests, 3);
  assert.equal(result.summary.matchMethods.footprint_within_lot, 1);
  assert.equal(result.summary.matchMethods.single_building_lot, 1);
  assert.equal(result.summary.unmatchedReasons.ambiguous_multi_building_lot, 1);
});
test('courtyard holes, multipolygons, boundaries and duplicate IDs are handled explicitly', () => {
  const geometry = square(0, 'A', '1000010001').geometry;
  geometry.coordinates.push([[.2,.2],[.8,.2],[.8,.8],[.2,.8],[.2,.2]]);
  assert.equal(containsPoint(geometry, [.5,.5]), false);
  assert.equal(containsPoint(geometry, [0,.5]), true);
  assert.equal(containsPoint({ type: 'MultiPolygon', coordinates: [geometry.coordinates] }, [.1,.1]), true);
  assert.throws(() => joinRequests([], [request('1', null, 0), request('1', null, 0)]), /duplicate/);
});

test('server-aggregated rows preserve original request counts, including unmatched requests', () => {
  const result = joinRequests([square(0, 'A', '1000010001')], [
    { ...request('g1', '1000010001', .5), count: '12' },
    { ...request('g2', null, .5), count: '7' },
  ]);
  assert.equal(result.summary.totalRequests, 19);
  assert.equal(result.summary.matchedRequests, 12);
  assert.equal(result.summary.unmatchedRequests, 7);
  assert.equal(result.buildings[0].categories['HEAT/HOT WATER'], 12);
});
