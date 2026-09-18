import type { FeatureCollection } from 'geojson';
import type { CityMap, Selection } from './map.js';
import { buildings, polygons } from './layers.js';
import type { ColorScale } from './scales.js';
import { GeoJSONTileLoader, type Bounds, type GeoJSONTileManifest } from './tiles.js';

export type GeometrySource = string | FeatureCollection;
export interface BuildingViewState {
  mode: 'overview' | 'buildings';
  perspective: '2d' | '3d';
  featureCount: number;
}
export interface BuildingViewOptions {
  source: GeometrySource;
  /** A simplified footprint source, fetched only when the camera enters overview. */
  overview?: GeometrySource;
  /** Enables zoom-dependent representations. Defaults to 14 when overview is supplied. */
  detailZoom?: number;
  id?: string;
  featureId?: string;
  heightProperty?: string;
  color?: string | ColorScale;
  extruded?: boolean;
  attribution?: string;
  transform?: (geometry: FeatureCollection) => FeatureCollection;
  onChange?: (state: BuildingViewState) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}
const empty = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

/** Fetch GeoJSON or a static manifest once, then load only the visible tiles. */
export function geometryLoader(source: GeometrySource) {
  let pending: Promise<FeatureCollection | GeoJSONTileLoader> | undefined;
  async function load(bounds: Bounds, signal?: AbortSignal): Promise<FeatureCollection> {
    if (!pending) pending = (async () => {
      if (typeof source !== 'string') return source;
      const url = new URL(source, document.baseURI);
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Could not load ${url.pathname} (${response.status}).`);
      const value = await response.json();
      if (value?.type === 'FeatureCollection' && Array.isArray(value.features)) return value as FeatureCollection;
      if (value?.schemaVersion === 1) return new GeoJSONTileLoader(value as GeoJSONTileManifest, url.href);
      throw new Error('Expected GeoJSON or a geometry manifest.');
    })().catch(error => { pending = undefined; throw error; });
    const value = await pending;
    signal?.throwIfAborted();
    return value instanceof GeoJSONTileLoader ? value.load(bounds, signal) : value;
  }
  return { load };
}

/** Owns geometry loading, overview/plan/extrusion representations, and stable selection. */
export async function addBuildingView(city: CityMap, options: BuildingViewOptions) {
  const id = options.id ?? 'buildings', featureId = options.featureId ?? 'source_id';
  const layerIds = { buildings: id, footprints: `${id}-footprints`, overview: `${id}-overview` };
  const owned = Object.values(layerIds);
  const detailZoom = options.detailZoom ?? (options.overview ? 14 : 0);
  if (!Number.isFinite(detailZoom) || detailZoom < 0 || detailZoom > 24) throw new Error('detailZoom must be between 0 and 24.');
  let perspective: '2d' | '3d' = options.extruded === false ? '2d' : '3d';
  let visible = true, disposed = false, removed = false, revision = 0;
  let transform = options.transform ?? ((fc: FeatureCollection) => fc);
  let detail = empty(), overview = empty();
  let controller: AbortController | undefined;
  const detailLoader = geometryLoader(options.source);
  const overviewLoader = options.overview ? geometryLoader(options.overview) : undefined;
  const mode = () => detailZoom > 0 && city.map.getZoom() < detailZoom ? 'overview' as const : 'buildings' as const;
  const activeLayer = () => mode() === 'overview' ? layerIds.overview : perspective === '3d' ? layerIds.buildings : layerIds.footprints;
  const state = (): BuildingViewState => ({ mode: mode(), perspective, featureCount: (mode() === 'overview' ? overview : detail).features.length });
  const owns = (selection: Selection | null) => !!selection && owned.includes(selection.layerId);
  function validate(fc: FeatureCollection) {
    const ids = new Set<string | number>();
    for (const feature of fc.features) {
      const value = feature.properties?.[featureId];
      if ((typeof value !== 'string' && typeof value !== 'number') || value === '' || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`Every building needs a stable ${featureId} property.`);
      if (ids.has(value)) throw new Error(`Duplicate building identity: ${value}`);
      ids.add(value);
    }
    return fc;
  }
  function transfer() {
    const selection = city.getSelection();
    if (!visible || !owns(selection)) return;
    const collection = mode() === 'overview' ? overview : detail;
    const feature = collection.features.find(f => f.properties?.[featureId] === selection!.feature.properties[featureId]) ?? selection!.feature;
    const decorated = transform({ type: 'FeatureCollection', features: [feature] }).features[0];
    city.selectFeature(activeLayer(), { ...decorated, id: decorated.properties?.[featureId] } as Selection['feature'], selection!.lngLat);
  }
  function syncVisibility() {
    if (disposed) return;
    city.setVisible(layerIds.buildings, visible && perspective === '3d', { preserveSelection: true });
    city.setVisible(layerIds.footprints, visible && perspective === '2d', { preserveSelection: true });
    city.setVisible(layerIds.overview, visible, { preserveSelection: true });
    transfer();
  }
  function apply() {
    const nextDetail = transform(detail), nextOverview = transform(overview);
    city.setData(layerIds.buildings, nextDetail, { preserveSelection: true });
    city.setData(layerIds.footprints, nextDetail, { preserveSelection: true });
    city.setData(layerIds.overview, nextOverview, { preserveSelection: true });
    transfer(); options.onChange?.(state());
  }
  async function refresh() {
    if (disposed) return;
    const current = ++revision;
    controller?.abort(); controller = new AbortController();
    const bounds = city.map.getBounds();
    const bbox: Bounds = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    const lowZoom = mode() === 'overview';
    const geometry = lowZoom && overviewLoader ? await overviewLoader.load(bbox, controller.signal) : await detailLoader.load(bbox, controller.signal);
    if (disposed || current !== revision) return;
    if (lowZoom) overview = validate(geometry);
    else detail = validate(geometry);
    apply();
  }
  function onMove() { syncVisibility(); void refresh().catch(error => {
    if (disposed || error?.name === 'AbortError') return;
    if (options.onError) options.onError(error instanceof Error ? error : new Error(String(error)));
    else city.map.fire('error', { error });
  }); }
  function dispose() {
    if (disposed) return;
    disposed = true; controller?.abort(); ++revision;
    city.map.off('moveend', onMove); city.map.off('remove', onRemove);
    options.signal?.removeEventListener('abort', dispose);
    if (!removed) for (const layer of installed) city.removeLayer(layer);
  }
  function onRemove() { removed = true; dispose(); }
  const installed: string[] = [];
  await city.ready; options.signal?.throwIfAborted();
  city.map.once('remove', onRemove);
  options.signal?.addEventListener('abort', dispose, { once: true });
  try {
    for (const layer of [
      buildings({ id: layerIds.buildings, source: empty(), promoteId: featureId, color: options.color, minzoom: detailZoom, heightProperty: options.heightProperty, attribution: options.attribution, visible: perspective === '3d' }),
      buildings({ id: layerIds.footprints, source: empty(), promoteId: featureId, color: options.color, minzoom: detailZoom, extruded: false, attribution: options.attribution, visible: perspective === '2d' }),
      polygons({ id: layerIds.overview, source: empty(), promoteId: featureId, color: options.color, maxzoom: detailZoom, opacity: 0.75, attribution: options.attribution }),
    ]) { city.addLayer(layer); installed.push(layer.id); }
    await refresh();
    options.signal?.throwIfAborted();
  } catch (error) { dispose(); throw error; }
  city.map.on('moveend', onMove);
  return {
    layerIds, get state() { return state(); }, get geometry() { return detail; }, refresh, dispose,
    setTransform(next: typeof transform) { transform = next; apply(); },
    setColor(color?: string | ColorScale) { for (const layer of owned) city.setColor(layer, color); },
    setVisible(next: boolean) { visible = next; if (!visible && owns(city.getSelection())) city.clearSelection(); syncVisibility(); },
    setPerspective(next: '2d' | '3d', camera: { pitch?: number; bearing?: number; duration?: number } = {}) {
      perspective = next; syncVisibility();
      city.map.easeTo({ pitch: next === '3d' ? camera.pitch ?? 57 : 0, bearing: next === '3d' ? camera.bearing ?? -28 : 0, duration: camera.duration ?? 700 });
    },
  };
}
