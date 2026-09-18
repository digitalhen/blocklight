import test from 'node:test';
import assert from 'node:assert/strict';
import { GeoJSONTileLoader, tileKeys, type Bounds } from '../packages/blocklight/src/tiles.js';
test('viewport tile loading deduplicates stable IDs, caches responses, and honors cancellation', async t => {
  const bounds: Bounds = [-74.0, 40.74, -73.97, 40.76];
  const keys = tileKeys(bounds, 14);
  assert.ok(keys.length > 1);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response(JSON.stringify({ type: 'FeatureCollection', features: [
      { type: 'Feature', id: 'building-1', properties: {}, geometry: { type: 'Point', coordinates: [-73.98,40.75] } },
    ] }));
  });
  const loader = new GeoJSONTileLoader({ schemaVersion: 1, geometryVersion: 'test', zoom: 14, featureCount: 1, template: './{x}/{y}.json', tiles: Object.fromEntries(keys.map(key => [key,1])) }, 'https://example.test/city.json');
  assert.equal((await loader.load(bounds)).features.length, 1);
  assert.equal(requests, keys.length);
  await loader.load(bounds); assert.equal(requests, keys.length);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loader.load(bounds, controller.signal));
});
test('city overview is bounded instead of accidentally loading a million footprints', () => {
  assert.throws(() => tileKeys([-74.35,40.44,-73.65,40.94], 14), /Zoom in/);
  assert.throws(() => tileKeys([0,0,-1,1], 14), /Invalid/);
});
