import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addBuildingDatasets, type DatasetConfig } from '../packages/blocklight/src/dataset.js';
import type { CityMap } from '../packages/blocklight/src/map.js';
import type { FeatureCollection } from 'geojson';
const geometry: FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'a', properties: { source_id: 'a' }, geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } }] };
function fakeCity() {
 const events = new Map<string, Set<(...args: any[]) => void>>();
 const layers = new Set<string>();
 return { layers, city: {
  ready: Promise.resolve(), getSelection: () => null, clearSelection() {},
  addLayer(layer: { id: string }) { layers.add(layer.id); }, removeLayer(id: string) { layers.delete(id); },
  setVisible() {}, setData() {}, setColor() {},
  map: {
   getZoom: () => 15, getBounds: () => ({ getWest: () => 0, getEast: () => 1, getSouth: () => 0, getNorth: () => 1 }),
   on(name: string, handler: (...args: any[]) => void) { if (!events.has(name)) events.set(name, new Set()); events.get(name)!.add(handler); },
   once(name: string, handler: (...args: any[]) => void) { this.on(name, handler); },
   off(name: string, handler: (...args: any[]) => void) { events.get(name)?.delete(handler); },
  },
 } as unknown as CityMap, events };
}
const data = (values: unknown): DatasetConfig => ({ values, join: { feature: 'source_id', record: 'id' }, aggregate: { op: 'sum', field: 'count' } });
test('latest dataset switch wins, invalid input leaves active data intact, teardown removes owned layers', async () => {
 const saved = globalThis.fetch, document = Object.getOwnPropertyDescriptor(globalThis, 'document');
 Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.test/' } });
 let resolve!: (response: Response) => void;
 globalThis.fetch = () => new Promise<Response>(r => { resolve = r; });
 try {
  const { city, layers, events } = fakeCity();
  const slow = { ...data(undefined), url: '/slow.json' };
  const layer = await addBuildingDatasets(city, { source: geometry, datasets: [
   { id: 'a', label: 'A', data: data([{ id: 'a', count: 2 }]) },
   { id: 'slow', label: 'Slow', data: slow },
   { id: 'bad', label: 'Bad', data: data([{ id: 'a', count: 'bad' }]) },
  ] });
  assert.equal(layers.size, 3);
  const pending = layer.setDataset('slow');
  await layer.setDataset('a');
  resolve(new Response(JSON.stringify([{ id: 'a', count: 9 }]))); await pending;
  assert.equal(layer.active, 'a'); assert.equal(layer.getValue(geometry.features[0]), 2);
  await assert.rejects(layer.setDataset('bad'), /finite numeric/);
  assert.equal(layer.active, 'a'); assert.equal(layer.getValue(geometry.features[0]), 2);
  layer.dispose(); layer.dispose(); assert.equal(layers.size, 0);
  assert.equal(events.get('moveend')?.size, 0);
  await assert.rejects(layer.setDataset('a'), /disposed/);
 } finally { globalThis.fetch = saved; if (document) Object.defineProperty(globalThis, 'document', document); else Reflect.deleteProperty(globalThis, 'document'); }
});

test('aborting an initial request cancels fetch and removes lifecycle listeners', async () => {
 const saved = globalThis.fetch, document = Object.getOwnPropertyDescriptor(globalThis, 'document');
 Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.test/' } });
 const abort = new AbortController();
 globalThis.fetch = (_input, init) => new Promise<Response>((_resolve, reject) => {
  init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
 });
 try {
  const { city, layers, events } = fakeCity();
  const pending = addBuildingDatasets(city, { source: geometry, signal: abort.signal, datasets: [{ id: 'a', label: 'A', data: { ...data(undefined), url: '/slow.json' } }] });
  abort.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(layers.size, 0); assert.equal(events.get('remove')?.size, 0);
 } finally { globalThis.fetch = saved; if (document) Object.defineProperty(globalThis, 'document', document); else Reflect.deleteProperty(globalThis, 'document'); }
});
