import test from 'node:test';
import assert from 'node:assert/strict';
import { buildings, points, toMapLibreLayer, sourceId, steppedScale, themes, createCityMap, terrainSky, resolveTerrain, outsideMask } from '../packages/blocklight/src/index.js';
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

test('ground elevation lifts the whole building, and terrain suppresses it to avoid double counting', () => {
  const layer = buildings({ id: 'hills', source: empty, elevationProperty: 'ground_elev_m', baseHeightProperty: 'base_m' });
  const height = ['max', 0, ['to-number', ['get', 'height_m'], 0]];
  const ground = ['max', 0, ['to-number', ['get', 'ground_elev_m'], 0]];
  const flat = toMapLibreLayer(layer, themes.blueprint);
  if (flat.type !== 'fill-extrusion') throw new Error('expected an extrusion');
  assert.deepEqual(flat.paint?.['fill-extrusion-height'], ['+', ground, height]);
  assert.deepEqual(flat.paint?.['fill-extrusion-base'], ['+', ground, ['min', height, ['max', 0, ['to-number', ['get', 'base_m'], 0]]]]);
  // MapLibre already raises extrusions onto terrain, so the property must drop out.
  const raised = toMapLibreLayer(layer, themes.blueprint, { terrain: true });
  if (raised.type !== 'fill-extrusion') throw new Error('expected an extrusion');
  assert.deepEqual(raised.paint?.['fill-extrusion-height'], height);
  assert.deepEqual(raised.paint?.['fill-extrusion-base'], ['min', height, ['max', 0, ['to-number', ['get', 'base_m'], 0]]]);
});

test('buildings without an elevation property keep their plain ground-plane expressions', () => {
  const plain = toMapLibreLayer(buildings({ id: 'plain', source: empty }), themes.blueprint, { terrain: true });
  if (plain.type !== 'fill-extrusion') throw new Error('expected an extrusion');
  assert.deepEqual(plain.paint?.['fill-extrusion-height'], ['max', 0, ['to-number', ['get', 'height_m'], 0]]);
  assert.equal(plain.paint?.['fill-extrusion-base'], 0);
});

test('terrain needs a raster-dem source the caller supplies, with a plausible exaggeration', () => {
  const dem = { type: 'raster-dem' as const, tiles: ['https://example.test/{z}/{x}/{y}.png'], attribution: 'Example elevation' };
  assert.throws(() => resolveTerrain({ source: { type: 'raster' } as never }), /raster-dem/);
  assert.throws(() => resolveTerrain({ source: { type: 'raster-dem' } }), /url or tile URLs/);
  assert.throws(() => resolveTerrain({ source: dem, exaggeration: -1 } ), /exaggeration/);
  assert.deepEqual(resolveTerrain({ source: dem, exaggeration: 1.4 }), { source: dem, exaggeration: 1.4 });
  assert.equal(resolveTerrain({ source: dem }).source.attribution, 'Example elevation');
});

test('the sky follows the theme so terrain reads in both palettes', () => {
  assert.equal(terrainSky(themes.blueprint)['sky-color'], themes.blueprint.sky);
  assert.equal(terrainSky(themes.paper)['sky-color'], themes.paper.sky);
  assert.notEqual(terrainSky(themes.paper)['horizon-color'], terrainSky(themes.blueprint)['horizon-color']);
});

test('an outside mask punches the landmass out of a covering rectangle', () => {
  const land = {
    type: 'FeatureCollection' as const,
    features: [
      { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]], [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2], [-0.2, -0.2]]] } },
      { type: 'Feature' as const, properties: {}, geometry: { type: 'MultiPolygon' as const, coordinates: [[[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]], [[[4, 4], [5, 4], [5, 5], [4, 5], [4, 4]]]] } },
    ],
  };
  const mask = outsideMask(land, [-10, -10, 10, 10]);
  const rings = mask.geometry.coordinates;
  assert.deepEqual(rings[0], [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]);
  // One hole per landmass outer ring; a lake inside a landmass is water and stays covered.
  assert.equal(rings.length, 4);
  assert.deepEqual(rings[1], [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]);
  assert.deepEqual(rings[3], [[4, 4], [5, 4], [5, 5], [4, 5], [4, 4]]);
  assert.throws(() => outsideMask(land, [10, -10, -10, 10]), /west, south, east, north/);
  assert.throws(() => outsideMask(land, [-10, 10, 10, -10]), /west, south, east, north/);
  assert.throws(() => outsideMask(land, [-10, -10, NaN, 10]), /west, south, east, north/);
});

test('a flat building layer can be filtered and made solid, for footprints draped on terrain', () => {
  const flat = toMapLibreLayer(buildings({
    id: 'grounded', source: empty, extruded: false, opacity: 1,
    filter: ['!', ['>', ['to-number', ['get', 'height_m'], 0], 0]],
  }), themes.blueprint);
  if (flat.type !== 'fill') throw new Error('expected a fill');
  assert.equal(flat.paint?.['fill-opacity'], 1);
  assert.deepEqual(flat.filter, ['!', ['>', ['to-number', ['get', 'height_m'], 0], 0]]);
  // Unfiltered layers stay unfiltered, and flat buildings keep their translucent default.
  const plain = toMapLibreLayer(buildings({ id: 'plainflat', source: empty, extruded: false }), themes.blueprint);
  if (plain.type !== 'fill') throw new Error('expected a fill');
  assert.equal(plain.filter, undefined);
  assert.equal(plain.paint?.['fill-opacity'], 0.55);
});
