import type { Feature, FeatureCollection } from 'geojson';
import type { CityMap } from './map.js';
import { buildings } from './layers.js';
import type { ColorScale } from './scales.js';
import { GeoJSONTileLoader, type GeoJSONTileManifest } from './tiles.js';
export interface DatasetConfig {
  url: string;
  /** Dot-separated path to the records array; omit for a top-level array. */
  records?: string;
  join: {
    feature: string;
    record: string;
    /** For a non-unique key in tiled data, the feature's citywide key-count property. */
    multiplicity?: string;
  };
  aggregate?: { op: 'count' } | { op: 'sum'; field: string; missing?: 0 };
  /** The numeric property added to the geometry. Defaults to "value". */
  property?: string;
}
export interface BuildingDatasetOptions {
  source: string;
  data: DatasetConfig;
  id?: string;
  /** Stable building identity, independent of the data join. */
  featureId?: string;
  color?: string | ColorScale;
  extruded?: boolean;
  attribution?: string;
  onError?: (error: Error) => void;
}
type RecordData = Record<string, unknown>;
const atPath = (input: unknown, path: string): unknown => path.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' && Object.hasOwn(value, part) ? (value as RecordData)[part] : undefined, input);
const key = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
/** Pure configurable JSON join. Ambiguous geometry keys never multiply a record. */
export function createDatasetJoin(input: unknown, config: DatasetConfig) {
  let value: unknown = input;
  for (const part of config.records?.split('.') ?? []) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) throw new Error(`Missing records path: ${config.records}`);
    value = (value as RecordData)[part];
  }
  if (!Array.isArray(value)) throw new Error('The configured records path must resolve to an array.');
  const groups = new Map<string, { value: number; records: RecordData[] }>();
  let missingKeys = 0;
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Dataset records must be objects.');
    const id = key(row[config.join.record]);
    if (!id) { missingKeys++; continue; }
    const amount = config.aggregate?.op === 'sum' ? (atPath(row, config.aggregate.field) ?? config.aggregate.missing) : 1;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new Error('Aggregation requires finite numeric values.');
    const group = groups.get(id) ?? { value: 0, records: [] };
    group.value += amount; group.records.push(row); groups.set(id, group);
  }
  const property = config.property ?? 'value';
  let multiplicities = new Map<string, number>();
  function eligible(feature: Feature) {
    const id = key(feature.properties?.[config.join.feature]);
    const count = config.join.multiplicity ? feature.properties?.[config.join.multiplicity] : multiplicities.get(id);
    return id && count === 1 ? groups.get(id) : undefined;
  }
  function decorate(fc: FeatureCollection): FeatureCollection {
    if (!config.join.multiplicity) {
      const current = new Map<string, number>();
      for (const feature of fc.features) { const id = key(feature.properties?.[config.join.feature]); if (id) current.set(id, (current.get(id) ?? 0) + 1); }
      for (const [id, count] of current) multiplicities.set(id, count);
    }
    return { ...fc, features: fc.features.map(feature => ({ ...feature, properties: { ...feature.properties, [property]: eligible(feature)?.value ?? 0 } })) };
  }
  return { decorate, getValue: (feature?: Feature | null) => feature ? eligible(feature)?.value ?? 0 : 0, getRecords: (feature?: Feature | null) => feature ? eligible(feature)?.records ?? [] : [], recordCount: value.length, missingKeys };
}
/** The application configures data; this helper handles fetching, joining and viewport refreshes. */
export async function addBuildingDataset(city: CityMap, options: BuildingDatasetOptions) {
  const id = options.id ?? 'buildings', featureId = options.featureId ?? 'source_id';
  const read = async (url: URL) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url.pathname} (${response.status}).`);
    return response.json();
  };
  const geometryURL = new URL(options.source, document.baseURI);
  const [rawData, geometry] = await Promise.all([read(new URL(options.data.url, document.baseURI)), read(geometryURL)]) as [unknown, FeatureCollection | GeoJSONTileManifest];
  let join = createDatasetJoin(rawData, options.data);
  const tiles = 'schemaVersion' in geometry ? new GeoJSONTileLoader(geometry, geometryURL.href) : undefined;
  if (tiles && options.data.join.feature !== featureId && !options.data.join.multiplicity) throw new Error('Tiled joins on non-identity keys require a citywide multiplicity property.');
  if (!tiles && (!('features' in geometry) || geometry.type !== 'FeatureCollection')) throw new Error('Expected GeoJSON or a geometry manifest.');
  const version = (rawData as { join?: { geometryVersion?: string } })?.join?.geometryVersion;
  if (tiles && version && version !== tiles.manifest.geometryVersion) throw new Error('Data and geometry versions do not match.');
  await city.ready;
  let disposed = false, removed = false, revision = 0, controller: AbortController | undefined;
  city.addLayer(buildings({ id, source: { type: 'FeatureCollection', features: [] }, promoteId: featureId, color: options.color, extruded: options.extruded, attribution: options.attribution }));
  async function refresh() {
    if (disposed) return;
    const current = ++revision;
    controller?.abort(); controller = new AbortController();
    const bounds = city.map.getBounds();
    const fc = tiles ? await tiles.load([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], controller.signal) : geometry as FeatureCollection;
    if (!disposed && current === revision) city.setData(id, join.decorate(fc), { preserveSelection: true });
  }
  function onMove() { void refresh().catch(error => {
    if (disposed || error?.name === 'AbortError') return;
    const reason = error instanceof Error ? error : new Error(String(error));
    if (options.onError) options.onError(reason); else city.map.fire('error', { error: reason });
  }); }
  function dispose() {
    if (disposed) return;
    disposed = true; controller?.abort(); city.map.off('moveend', onMove); city.map.off('remove', onRemove);
    if (!removed) city.removeLayer(id);
  }
  function onRemove() { removed = true; dispose(); }
  city.map.once('remove', onRemove);
  try { await refresh(); } catch (error) { dispose(); throw error; }
  if (tiles) city.map.on('moveend', onMove);
  const cache = new Map<string, Promise<unknown>>([[new URL(options.data.url, document.baseURI).href, Promise.resolve(rawData)]]);
  let switchRevision = 0;
  async function setDataset(data: DatasetConfig, color?: string | ColorScale) {
    const request = ++switchRevision;
    const url = new URL(data.url, document.baseURI);
    let pending = cache.get(url.href);
    if (!pending) { pending = read(url).catch(error => { cache.delete(url.href); throw error; }); cache.set(url.href, pending); }
    const raw = await pending;
    if (disposed || request !== switchRevision) return false;
    if (tiles && data.join.feature !== featureId && !data.join.multiplicity) throw new Error('Tiled joins on non-identity keys require a citywide multiplicity property.');
    const version = (raw as { join?: { geometryVersion?: string } })?.join?.geometryVersion;
    if (tiles && version && version !== tiles.manifest.geometryVersion) throw new Error('Data and geometry versions do not match.');
    const next = createDatasetJoin(raw, data);
    const bounds = city.map.getBounds();
    const fc = tiles ? await tiles.load([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]) : geometry as FeatureCollection;
    if (disposed || request !== switchRevision) return false;
    const decorated = next.decorate(fc);
    city.setData(id, decorated, { preserveSelection: true });
    if (color) city.setColor(id, color);
    join = next;
    return true;
  }
  return { rawData, getValue: (feature?: Feature | null) => join.getValue(feature), getRecords: (feature?: Feature | null) => join.getRecords(feature), get recordCount() { return join.recordCount; }, get missingKeys() { return join.missingKeys; }, setDataset, refresh, dispose };
}

export interface DatasetDefinition { id: string; label: string; data: DatasetConfig; color?: string | ColorScale }
/** Multiple named datasets share geometry and cached JSON; switching leaves the camera intact. */
export async function addBuildingDatasets(city: CityMap, options: Omit<BuildingDatasetOptions, 'data' | 'color'> & { datasets: DatasetDefinition[]; active?: string }) {
  const definitions = new Map(options.datasets.map(dataset => [dataset.id, dataset]));
  if (!definitions.size || definitions.size !== options.datasets.length) throw new Error('Provide datasets with unique IDs.');
  let active = options.active ?? options.datasets[0].id;
  const initial = definitions.get(active);
  if (!initial) throw new Error(`Unknown dataset: ${active}`);
  const layer = await addBuildingDataset(city, { ...options, data: initial.data, color: initial.color });
  return { ...layer, get recordCount() { return layer.recordCount; }, get missingKeys() { return layer.missingKeys; }, get active() { return active; }, async setDataset(id: string) {
    const next = definitions.get(id);
    if (!next) throw new Error(`Unknown dataset: ${id}`);
    if (await layer.setDataset(next.data, next.color)) active = id;
  } };
}
