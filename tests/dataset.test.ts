import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatasetJoin, type DatasetConfig } from '../packages/blocklight/src/dataset.js';
import type { FeatureCollection, Feature } from 'geojson';
const feature = (id: string, lot = id): Feature => ({ type: 'Feature', properties: { id, lot }, geometry: { type: 'Point', coordinates: [0, 0] } });
const fc = (...features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });
const config: DatasetConfig = { url: 'data.json', records: 'buildings', join: { feature: 'id', record: 'buildingId' }, aggregate: { op: 'sum', field: 'categories.HEAT/HOT WATER', missing: 0 } };
test('nested dataset aggregation, absent categories and selection outside viewport', () => {
 const join = createDatasetJoin({ buildings: [{ buildingId: 'a', categories: { 'HEAT/HOT WATER': 7 } }, { buildingId: 'b', categories: {} }] }, config);
 const a = feature('a'), b = feature('b');
 assert.deepEqual(join.decorate(fc(a, b)).features.map(f => f.properties?.value), [7, 0]);
 join.decorate(fc(b));
 assert.equal(join.getValue(a), 7);
 assert.equal(join.getRecords(a).length, 1);
 assert.throws(() => createDatasetJoin({ buildings: [{ buildingId: 'a' }] }, { ...config, aggregate: { op: 'sum', field: 'count' } }), /finite numeric/);
});
test('raw records count once and ambiguous lots never duplicate requests', () => {
 const join = createDatasetJoin([{ bbl: '1' }, { bbl: '1' }, { bbl: '2' }, {}], { url: '', join: { feature: 'lot', record: 'bbl' } });
 assert.deepEqual(join.decorate(fc(feature('a', '1'), feature('b', '1'), feature('c', '2'))).features.map(f => f.properties?.value), [0, 0, 1]);
 assert.equal(join.missingKeys, 1);
 const citywide = createDatasetJoin([{ bbl: '1' }], { url: '', join: { feature: 'lot', record: 'bbl', multiplicity: 'lot_count' } });
 assert.equal(citywide.decorate(fc({ ...feature('a', '1'), properties: { lot: '1', lot_count: 2 } })).features[0].properties?.value, 0);
});

test('multiple datasets cache shared JSON, switch palette, preserve selection, and reject unknown IDs', async () => {
 const { addBuildingDatasets } = await import('../packages/blocklight/src/dataset.js');
 const previousFetch = globalThis.fetch;
 const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
 Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.test/' } });
 const reads: string[] = [], updates: { data: FeatureCollection; preserve: boolean }[] = [], colors: unknown[] = [];
 let removed = false;
 globalThis.fetch = async input => {
   const url = String(input); reads.push(url);
   return new Response(JSON.stringify(url.endsWith('geometry.json') ? fc(feature('a')) : { buildings: [{ buildingId: 'a', count: 12, categories: { 'HEAT/HOT WATER': 7 } }] }));
 };
 const map = {
   ready: Promise.resolve(),
   addLayer() {}, removeLayer() { removed = true; },
   setData(_id: string, data: FeatureCollection, options: { preserveSelection: boolean }) { updates.push({ data, preserve: options.preserveSelection }); },
   setColor(_id: string, color: unknown) { colors.push(color); },
   map: { getBounds: () => ({ getWest: () => 0, getSouth: () => 0, getEast: () => 1, getNorth: () => 1 }), once() {}, off() {} },
 };
 try {
   const layer = await addBuildingDatasets(map as unknown as import('../packages/blocklight/src/map.js').CityMap, {
     source: '/geometry.json', featureId: 'id', datasets: [
       { id: 'housing', label: 'Housing', data: { ...config, aggregate: { op: 'sum', field: 'count' } }, color: '#aabbcc' },
       { id: 'heat', label: 'Heat', data: config, color: '#ff8800' },
     ],
   });
   assert.equal(layer.getValue(feature('a')), 12);
   await layer.setDataset('heat');
   assert.equal(layer.active, 'heat'); assert.equal(layer.getValue(feature('a')), 7);
   assert.equal(updates.at(-1)?.data.features[0].properties?.value, 7);
   assert.ok(updates.every(update => update.preserve)); assert.equal(colors.at(-1), '#ff8800');
   await layer.setDataset('housing');
   assert.equal(layer.getValue(feature('a')), 12);
   assert.equal(reads.filter(url => url.endsWith('data.json')).length, 1);
   await assert.rejects(layer.setDataset('absent'), /Unknown dataset/);
   assert.equal(layer.active, 'housing'); layer.dispose(); assert.equal(removed, true);
 } finally {
   globalThis.fetch = previousFetch;
   if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
   else Reflect.deleteProperty(globalThis, 'document');
 }
});
