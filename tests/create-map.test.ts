import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMap, defineMapDataset, createDatasetJoin } from '../packages/blocklight/src/index.js';
test('high-level dataset configuration preserves zero, sums records and rejects invalid breaks', () => {
  const definition = defineMapDataset({ id: 'housing', label: 'Housing', source: [{ id: 'a', count: 0 }, { id: 'b', count: 3 }, { id: 'b', count: 2 }], join: { building: 'id', record: 'id', unique: true }, value: 'count', colors: 'teal' });
  const join = createDatasetJoin(definition.data.values, definition.data);
  const feature = (id: string) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [0, 0] }, properties: { id } });
  assert.equal(join.getResult(feature('a')).value, 0);
  assert.equal(join.getResult(feature('b')).value, 5);
  assert.equal(join.getResult(feature('c')).value, null);
  assert.throws(() => defineMapDataset({ id: 'bad', label: 'Bad', source: [], join: { building: 'id', record: 'id' }, breaks: [5, 1, 0] }), /increasing/);
});
test('high-level factory can be imported on the server without browser side effects', () => {
  assert.throws(() => createMap({ container: '#map', buildings: '/buildings.json' }), /browser/);
});
