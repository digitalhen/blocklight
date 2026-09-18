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
  if (id === 'seattle') {
    assert.equal(metadata.candidateRecords, metadata.matchedRecords + metadata.excludedRecords);
    assert.equal(new Set(attributes.map((r: any) => r.benchmarkId)).size, attributes.length);
    assert.ok(geometry.features.some((f: any) => f.properties.height_m === 0));
  }
});
