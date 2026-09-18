import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aggregateComplaints, grid } from '../scripts/data/aggregate-crime.mjs';
const read = name => JSON.parse(readFileSync(new URL(`../playground/public/data/${name}`, import.meta.url)));
test('complaint aggregation conserves included counts and excludes out-of-bounds data', () => {
  const data = aggregateComplaints([{ latitude: grid.south + .0001, longitude: grid.west + .0001, count: 2 }, { latitude: grid.south + .0002, longitude: grid.west + .0002, count: 3 }, { latitude: 0, longitude: 0, count: 100 }]);
  assert.equal(data.features.length, 1);
  assert.equal(data.features[0].properties.count, 5);
  assert.equal(data.features[0].id, '0-0');
  assert.throws(() => aggregateComplaints([{ latitude: 'bad', longitude: 0, count: 1 }]));
});
test('shipped crime sample reconciles to its source manifest and exposes only cell aggregates', () => {
  const data = read('crime.geojson'), metadata = read('crime-source.json');
  assert.equal(data.features.length, metadata.cells);
  assert.equal(data.features.reduce((n, f) => n + f.properties.count, 0), metadata.total);
  for (const f of data.features) { assert.deepEqual(Object.keys(f.properties).sort(), ['cell', 'count', 'year']); assert.equal(f.properties.year, 2025); }
});
test('shipped buildings contain geometry and nonnegative metric heights, without Prospect fields', () => {
  const data = read('buildings.geojson');
  assert.ok(data.features.length > 1000);
  for (const f of data.features) {
    assert.deepEqual(Object.keys(f.properties).sort(), ['base_bbl', 'bin', 'height_m', 'mappluto_bbl', 'source_id']);
    assert.ok(f.properties.height_m === null || f.properties.height_m >= 0);
    assert.ok(['Polygon', 'MultiPolygon'].includes(f.geometry.type));
  }
});
