import test from 'node:test';
import assert from 'node:assert/strict';
import { buildings, points, toMapLibreLayer, sourceId, steppedScale, themes, createCityMap } from '../packages/blocklight/src/index.js';
const empty = { type: 'FeatureCollection' as const, features: [] };
test('buildings use meter heights, clamp invalid values and keep source IDs stable across themes', () => {
  const layer = buildings({ id: 'skyline', source: empty });
  const dark = toMapLibreLayer(layer, themes.blueprint);
  const light = toMapLibreLayer(layer, themes.paper);
  assert.equal(dark.type, 'fill-extrusion');
  assert.equal(dark.source, sourceId('skyline'));
  assert.equal(light.id, dark.id);
  if (dark.type === 'fill-extrusion') assert.deepEqual(dark.paint?.['fill-extrusion-height'], ['max', 0, ['to-number', ['get', 'height_m'], 0]]);
  assert.notDeepEqual(dark.paint, light.paint);
});
test('scale legend and expression share thresholds and missing values are explicitly neutral', () => {
  const scale = steppedScale('count', [{ value: 1, color: '#7897b6', label: '1–9' }, { value: 10, color: '#d9a44e', label: '10+' }]);
  assert.deepEqual(scale.legend, [{ label: '1–9', color: '#7897b6' }, { label: '10+', color: '#d9a44e' }, { label: 'No data', color: '#7683a0' }]);
  assert.deepEqual(scale.expression, ['case', ['==', ['typeof', ['get', 'count']], 'number'], ['step', ['get', 'count'], '#7897b6', 10, '#d9a44e'], '#7683a0']);
  assert.throws(() => steppedScale('count', []));
  assert.throws(() => steppedScale('count', [{ value: 3, color: 'red' }, { value: 2, color: 'blue' }]));
});
test('invalid IDs are rejected and source attribution / visibility are retained', () => {
  assert.throws(() => points({ id: 'bad/id', source: empty }));
  const layer = points({ id: 'places', source: empty, visible: false, attribution: 'Example source' });
  assert.equal(layer.attribution, 'Example source');
  assert.equal(toMapLibreLayer(layer, themes.blueprint).layout?.visibility, 'none');
});
test('package import works on the server; map creation gives an explicit browser requirement', () => {
  assert.throws(() => createCityMap({ container: 'map' }), /browser/);
});

test('buildings can render as flat footprints without losing their height attributes', () => {
  const flat = toMapLibreLayer(buildings({ id: 'footprints', source: empty, extruded: false }), themes.blueprint);
  assert.equal(flat.type, 'fill');
  assert.equal(flat.id, 'blocklight-layer-footprints');
  assert.equal(flat.source, sourceId('footprints'));
});

test('native vector layers keep source-layer and support joined feature-state colors', () => {
 const layer = buildings({ id: 'vector', source: { type: 'vector', tiles: ['https://example.test/{z}/{x}/{y}.pbf'], sourceLayer: 'buildings' }, promoteId: 'building_id', color: steppedScale('value', [{ value: 0, color: '#000' }, { value: 10, color: '#fff' }]) });
 const spec = toMapLibreLayer(layer, themes.blueprint);
 assert.equal('source-layer' in spec ? spec['source-layer'] : undefined, 'buildings');
 assert.match(JSON.stringify(spec.paint), /feature-state.*value/);
});
