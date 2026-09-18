import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBuildingDataset, decorateBuildings } from '../playground/src/building-data.js';
const geometry = JSON.parse(readFileSync(new URL('../playground/public/data/buildings.geojson', import.meta.url), 'utf8'));
const raw = JSON.parse(readFileSync(new URL('../playground/public/data/311-buildings.json', import.meta.url), 'utf8'));
test('311 JSON reconciles totals and decorates each footprint exactly once', () => {
  const dataset = parseBuildingDataset(raw, geometry), joined = decorateBuildings(geometry, dataset);
  assert.equal(joined.features.length, geometry.features.length);
  assert.equal(joined.features.reduce((sum, f) => sum + f.properties!.requests, 0), dataset.summary.matchedRequests);
  assert.equal(dataset.summary.totalRequests, dataset.summary.matchedRequests + dataset.summary.unmatchedRequests);
  assert.ok(joined.features.some(f => f.properties!.requests === 0));
});
test('rejects mismatched geometry, duplicate IDs and inconsistent JSON before loading', () => {
  let invalid = structuredClone(raw); invalid.buildings[0].buildingId = 'not-in-map';
  assert.throws(() => parseBuildingDataset(invalid, geometry), /absent/);
  invalid = structuredClone(raw); invalid.buildings.push(invalid.buildings[0]);
  assert.throws(() => parseBuildingDataset(invalid, geometry), /duplicate/);
  invalid = structuredClone(raw); invalid.buildings[0].count++;
  assert.throws(() => parseBuildingDataset(invalid, geometry), /sum/);
  invalid = structuredClone(raw); invalid.summary.unmatchedRequests++;
  assert.throws(() => parseBuildingDataset(invalid, geometry), /reconcile/);
});
