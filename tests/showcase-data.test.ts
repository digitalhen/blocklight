import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cities } from '../playground/src/cities.js';
import { createDatasetJoin } from '../packages/blocklight/src/dataset.js';
for (const [id, city] of Object.entries(cities)) test(`${id} extracts have unique joins, finite metrics, and honest missing values`, () => {
  const read = (name: string) => JSON.parse(readFileSync(new URL(`../playground/public/data/cities/${id}/${name}`, import.meta.url), 'utf8'));
  const geometry = read('buildings.geojson'), datasets = read('datasets.json'), attributes = read('attributes.json'), metadata = read('source.json');
  const ids = new Set(geometry.features.map((f: any) => f.properties.building_id));
  assert.equal(ids.size, geometry.features.length);
  assert.equal(metadata.buildings, ids.size);
  assert.equal(metadata.matchedRecords, attributes.length);
  for (const definition of city.datasets) {
    const records = datasets[definition.records!];
    assert.ok(records.length > 100);
    assert.equal(new Set(records.map((r: any) => r.id)).size, records.length);
    assert.ok(records.every((r: any) => ids.has(r.id) && Number.isFinite(r[definition.value!])));
    const join = createDatasetJoin(datasets, { records: definition.records, join: { feature: 'building_id', record: 'id', unique: true }, aggregate: { op: 'sum', field: definition.value! } });
    const decorated = join.decorate(geometry);
    const counts = decorated.features.filter(f => f.properties?.value_status === 'matched').length;
    assert.equal(counts, records.length);
    assert.equal(join.getValue({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { building_id: 'not-in-extract' } }), null);
  }
  if (id === 'atlanta') {
    // A permit reaches at most one footprint, and every permit in the extract is accounted for.
    assert.equal(metadata.permitsMatched + metadata.permitsUnmatched, metadata.permitsInExtract);
    assert.ok(metadata.permitsMatched <= metadata.permitsInsideAFootprint);
    assert.ok(metadata.permitsInsideAFootprint <= metadata.permitsPreciseGeocode);
    assert.ok(metadata.permitsPreciseGeocode <= metadata.permitsInExtract);
    const withPermits = attributes.filter((r: any) => r.permits != null);
    assert.equal(metadata.buildingsWithPermits, withPermits.length);
    assert.equal(withPermits.reduce((total: number, r: any) => total + r.permits, 0), metadata.permitsMatched);
    // No permit is split across categories or counted twice within a building.
    assert.ok(withPermits.every((r: any) => r.newConstruction + r.alteration + r.demolition === r.permits));
    // An unmatched footprint is no data, never a filing count of zero.
    assert.ok(attributes.every((r: any) => (r.permits == null) === (r.topType == null)));
    assert.ok(attributes.every((r: any) => r.permits == null || r.permits > 0));
    // Heights are context for the 3D view here, with provenance kept per building.
    assert.equal(metadata.heightsMeasured + metadata.heightsEstimated + metadata.heightsTagged + metadata.heightsMissing, metadata.buildings);
    assert.ok(attributes.every((r: any) => (r.height == null) === (r.heightSource == null)));
    assert.ok(geometry.features.some((f: any) => f.properties.height_m === 0));
  }
  if (id === 'seattle') {
    assert.equal(metadata.candidateRecords, metadata.matchedRecords + metadata.excludedRecords);
    assert.equal(new Set(attributes.map((r: any) => r.benchmarkId)).size, attributes.length);
    assert.ok(geometry.features.some((f: any) => f.properties.height_m === 0));
  }
});
