import type { Feature, FeatureCollection } from 'geojson';
import type { CityMap } from './map.js';
import { addBuildingView, type BuildingViewOptions } from './building-view.js';
import type { ColorScale } from './scales.js';
import { GeoJSONTileLoader, type GeoJSONTileManifest } from './tiles.js';
export interface DatasetConfig {
  url?: string;
  /** Already-loaded JSON. Supply exactly one of url or values to the controller. */
  values?: unknown;
  /** Dot-separated path to the records array; omit for a top-level array. */
  records?: string;
  join: {
    feature: string;
    record: string;
    /** For a non-unique key in tiled data, the feature's citywide key-count property. */
    multiplicity?: string;
    /** Assert this is a globally unique building key; checked in each loaded collection. */
    unique?: boolean;
  };
  aggregate?: { op: 'count' } | { op: 'sum'; field: string; missing?: 0 };
  /** The numeric property added to the geometry. Defaults to "value". */
  property?: string;
}
export interface BuildingDatasetOptions extends Omit<BuildingViewOptions, 'transform'> {
  data: DatasetConfig;
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
  const multiplicities = new Map<string, number>();
  function getResult(feature?: Feature | null): { status: 'matched' | 'unmatched' | 'ambiguous' | 'missing-key' | 'unverified'; value: number | null; records: RecordData[] } {
    const id = key(feature?.properties?.[config.join.feature]);
    if (!id) return { status: 'missing-key', value: null, records: [] };
    const count = config.join.multiplicity ? feature?.properties?.[config.join.multiplicity] : config.join.unique ? 1 : multiplicities.get(id);
    if (count === undefined) return { status: 'unverified', value: null, records: [] };
    if (count !== 1) return { status: 'ambiguous', value: null, records: [] };
    const group = groups.get(id);
    return group ? { status: 'matched', ...group } : { status: 'unmatched', value: null, records: [] };
  }
  function decorate(fc: FeatureCollection): FeatureCollection {
    if (!config.join.multiplicity) {
      const current = new Map<string, number>();
      for (const feature of fc.features) {
        const id = key(feature.properties?.[config.join.feature]);
        if (id) current.set(id, (current.get(id) ?? 0) + 1);
      }
      for (const [id, count] of current) {
        if (config.join.unique && count > 1) throw new Error(`Duplicate unique building key: ${id}`);
        multiplicities.set(id, Math.max(count, multiplicities.get(id) ?? 0));
      }
    }
    return { ...fc, features: fc.features.map(feature => {
      const result = getResult(feature);
      return { ...feature, properties: { ...feature.properties, [property]: result.value, [`${property}_status`]: result.status } };
    }) };
  }
  return { decorate, getResult, getValue: (feature?: Feature | null) => getResult(feature).value, getRecords: (feature?: Feature | null) => getResult(feature).records, recordCount: value.length, missingKeys };

}
/** The application configures data; this helper handles fetching, joining and viewport refreshes. */
export async function addBuildingDataset(city: CityMap, options: BuildingDatasetOptions) {
  const id = options.id ?? 'buildings', featureId = options.featureId ?? 'source_id';
  const read = async (url: URL) => {
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok) throw new Error(`Could not load ${url.pathname} (${response.status}).`);
    return response.json();
  };
  const cache = new Map<string, Promise<unknown>>();
  const readData = (data: DatasetConfig): Promise<unknown> => {
    if ((data.url !== undefined) === (data.values !== undefined)) throw new Error('Supply exactly one of data.url or data.values.');
    if (data.values !== undefined) return Promise.resolve(data.values);
    const url = new URL(data.url!, document.baseURI);
    let pending = cache.get(url.href);
    if (!pending) { pending = read(url).catch(error => { cache.delete(url.href); throw error; }); cache.set(url.href, pending); }
    return pending;
  };
  const geometryURL = new URL(typeof options.source === 'string' ? options.source : '.', document.baseURI);
  const [initialData, geometry] = await Promise.all([readData(options.data), typeof options.source === 'string' ? read(geometryURL) : Promise.resolve(options.source)]) as [unknown, FeatureCollection | GeoJSONTileManifest];
  let rawData = initialData;
  const configure = (data: DatasetConfig) => ({ ...data, join: { ...data.join, unique: data.join.unique || data.join.feature === featureId } });
  let join = createDatasetJoin(rawData, configure(options.data));
  const tiles = 'schemaVersion' in geometry ? new GeoJSONTileLoader(geometry, geometryURL.href) : undefined;
  if (tiles && options.data.join.feature !== featureId && !options.data.join.multiplicity) throw new Error('Tiled joins on non-identity keys require a citywide multiplicity property.');
  if (!tiles && (!('features' in geometry) || geometry.type !== 'FeatureCollection')) throw new Error('Expected GeoJSON or a geometry manifest.');
  const version = (rawData as { join?: { geometryVersion?: string } })?.join?.geometryVersion;
  if (tiles && version && version !== tiles.manifest.geometryVersion) throw new Error('Data and geometry versions do not match.');
  let disposed = false;
  const lifetime = new AbortController();
  const onAbort = () => lifetime.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  options.signal?.throwIfAborted();
  const view = await addBuildingView(city, { ...options, source: tiles ? options.source : geometry as FeatureCollection, signal: lifetime.signal, transform: fc => join.decorate(fc) });
  function dispose() { disposed = true; lifetime.abort(); view.dispose(); options.signal?.removeEventListener('abort', onAbort); }
  let switchRevision = 0;
  async function setDataset(data: DatasetConfig, color?: string | ColorScale) {
    const request = ++switchRevision;
    const raw = await readData(data);
    if (disposed || request !== switchRevision) return false;
    if (tiles && data.join.feature !== featureId && !data.join.multiplicity) throw new Error('Tiled joins on non-identity keys require a citywide multiplicity property.');
    const version = (raw as { join?: { geometryVersion?: string } })?.join?.geometryVersion;
    if (tiles && version && version !== tiles.manifest.geometryVersion) throw new Error('Data and geometry versions do not match.');
    const next = createDatasetJoin(raw, configure(data));
    // Prime static-key multiplicities and validate before changing the active dataset.
    next.decorate(view.geometry);
    join = next; rawData = raw;
    view.setColor(color);
    view.setTransform(fc => join.decorate(fc));
    return true;
  }
  return { get rawData() { return rawData; }, getResult: (feature?: Feature | null) => join.getResult(feature), getValue: (feature?: Feature | null) => join.getValue(feature), getRecords: (feature?: Feature | null) => join.getRecords(feature), get recordCount() { return join.recordCount; }, get missingKeys() { return join.missingKeys; }, ...view, get state() { return view.state; }, get geometry() { return view.geometry; }, setDataset, dispose };
}

export interface DatasetDefinition { id: string; label: string; data: DatasetConfig; color?: string | ColorScale }
/** Multiple named datasets share geometry and cached JSON; switching leaves the camera intact. */
export async function addBuildingDatasets(city: CityMap, options: Omit<BuildingDatasetOptions, 'data' | 'color'> & { datasets: DatasetDefinition[]; active?: string }) {
  let definitions = new Map(options.datasets.map(dataset => [dataset.id, dataset]));
  if (!definitions.size || definitions.size !== options.datasets.length) throw new Error('Provide datasets with unique IDs.');
  let active = options.active ?? options.datasets[0].id;
  const initial = definitions.get(active);
  if (!initial) throw new Error(`Unknown dataset: ${active}`);
  const layer = await addBuildingDataset(city, { ...options, data: initial.data, color: initial.color });
  return { ...layer, get state() { return layer.state; }, get geometry() { return layer.geometry; }, get rawData() { return layer.rawData; }, get recordCount() { return layer.recordCount; }, get missingKeys() { return layer.missingKeys; }, get active() { return active; }, async replaceDatasets(datasets: DatasetDefinition[], nextId = active) {
    const next = new Map(datasets.map(dataset => [dataset.id, dataset]));
    if (!next.size || next.size !== datasets.length || !next.has(nextId)) throw new Error('Provide unique datasets and a valid active ID.');
    const definition = next.get(nextId)!;
    if (await layer.setDataset(definition.data, definition.color)) { definitions = next; active = nextId; }
  }, async setDataset(id: string) {
    const next = definitions.get(id);
    if (!next) throw new Error(`Unknown dataset: ${id}`);
    if (await layer.setDataset(next.data, next.color)) active = id;
  } };
}
