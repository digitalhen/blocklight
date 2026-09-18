import type { Feature, Geometry } from 'geojson';
import { Map as LibreMap, NavigationControl, type MapOptions, type GeoJSONSource, type MapMouseEvent, type StyleSpecification } from 'maplibre-gl';
import { resolveTheme, type Theme, type ThemeName } from './themes.js';
import { sourceId, renderId, toMapLibreLayer, type LayerDefinition, type GeoJSONData } from './layers.js';
export interface City { id: string; name: string; center: [number, number]; zoom?: number; bounds?: [[number, number], [number, number]] }
export interface CityMapOptions {
  container: string | HTMLElement;
  city?: City;
  theme?: ThemeName | Theme;
  center?: [number, number];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  navigation?: boolean;
  /** Advanced engine options; Blocklight owns the container and base style. */
  mapOptions?: Omit<MapOptions, 'container' | 'style'>;
}
export interface Selection { layerId: string; feature: Feature<Geometry, Record<string, unknown>>; lngLat: { lng: number; lat: number } }
interface Events { select: Selection | null; hover: Selection | null; error: Error }
type FeatureRef = { source: string; id: string | number };
export function baseStyle(theme: Theme): StyleSpecification {
  return { version: 8, name: 'blocklight', sources: {}, light: { anchor: 'viewport', color: '#ffffff', intensity: 0.35, position: [1.5, 210, 35] }, layers: [{ id: 'blocklight-background', type: 'background', paint: { 'background-color': theme.background } }] };
}
/** Framework-independent map lifecycle. Data URLs always belong to the caller. */
export class CityMap {
  readonly map: LibreMap;
  readonly ready: Promise<void>;
  private theme: Theme;
  private layers = new Map<string, LayerDefinition>();
  private loaded = false;
  private destroyed = false;
  private selected?: FeatureRef;
  private selection: Selection | null = null;
  private hovered?: FeatureRef;
  private listeners = new Map<keyof Events, Set<(value: never) => void>>();
  private rejectReady!: (error: Error) => void;
  constructor(options: CityMapOptions) {
    if (typeof document === 'undefined') throw new Error('Create a Blocklight map in the browser, after mounting its container.');
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) throw new Error('Blocklight requires a browser with WebGL 2 enabled.');
    probe.getExtension('WEBGL_lose_context')?.loseContext();
    this.theme = resolveTheme(options.theme);
    this.map = new LibreMap({
      center: options.center ?? options.city?.center ?? [0, 0], zoom: options.zoom ?? options.city?.zoom ?? 12,
      pitch: options.pitch ?? 50, bearing: options.bearing ?? -25,
      maxBounds: options.city?.bounds,
      ...options.mapOptions, container: options.container, style: baseStyle(this.theme),
    });
    this.ready = new Promise((resolve, reject) => {
      this.rejectReady = reject;
      this.map.once('load', () => {
        if (this.destroyed) return;
        try {
          this.loaded = true;
          this.map.setPaintProperty('blocklight-background', 'background-color', this.theme.background);
          for (const layer of this.layers.values()) this.install(layer);
          resolve();
        } catch (error) { reject(error); }
      });
    });
    // Consumers may use events without awaiting ready; still make rejection observable to awaiters.
    void this.ready.catch(() => {});
    this.map.on('error', event => {
      const error = event.error instanceof Error ? event.error : new Error(String(event.error));
      if (!this.loaded) this.rejectReady(error);
      this.emit('error', error);
    });
    this.map.on('click', event => this.pick(event, 'select'));
    this.map.on('mousemove', event => this.pick(event, 'hover'));
    this.map.getCanvas().addEventListener('mouseleave', this.clearHover);
    if (options.navigation !== false) this.map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
  }
  private assertLive() { if (this.destroyed) throw new Error('This Blocklight map has been destroyed.'); }
  private install(layer: LayerDefinition) {
    this.map.addSource(sourceId(layer.id), { type: 'geojson', data: layer.source, ...(layer.promoteId ? { promoteId: layer.promoteId } : { generateId: layer.generateId ?? false }), attribution: layer.attribution });
    this.map.addLayer(toMapLibreLayer(layer, this.theme));
  }
  addLayer(layer: LayerDefinition): this {
    this.assertLive();
    if (this.layers.has(layer.id)) throw new Error(`Layer "${layer.id}" already exists.`);
    this.layers.set(layer.id, { ...layer });
    if (this.loaded) this.install(layer);
    return this;
  }
  removeLayer(id: string): this {
    this.assertLive();
    this.resetLayerState(id);
    if (this.loaded && this.map.getLayer(renderId(id))) this.map.removeLayer(renderId(id));
    if (this.loaded && this.map.getSource(sourceId(id))) this.map.removeSource(sourceId(id));
    this.layers.delete(id);
    return this;
  }
  setVisible(id: string, visible: boolean, options: { preserveSelection?: boolean } = {}): this {
    this.assertLive();
    const layer = this.getLayer(id);
    layer.visible = visible;
    if (!visible && !options.preserveSelection) this.resetLayerState(id);
    if (this.loaded) this.map.setLayoutProperty(renderId(id), 'visibility', visible ? 'visible' : 'none');
    return this;
  }
  setData(id: string, data: GeoJSONData, options: { preserveSelection?: boolean } = {}): this {
    this.assertLive();
    const layer = this.getLayer(id);
    if (options.preserveSelection && !layer.promoteId) throw new Error('Preserving selection requires promoteId on the layer.');
    if (!options.preserveSelection) this.resetLayerState(id);
    layer.source = data;
    if (this.loaded) (this.map.getSource(sourceId(id)) as GeoJSONSource).setData(data);
    return this;
  }
  /** Change thematic coloring without replacing geometry, camera, or selection. */
  setColor(id: string, color?: LayerDefinition['color']): this {
    this.assertLive();
    const layer = this.getLayer(id);
    layer.color = color;
    if (this.loaded) {
      const spec = toMapLibreLayer(layer, this.theme);
      for (const [property, value] of Object.entries(spec.paint ?? {})) this.map.setPaintProperty(spec.id, property as Parameters<LibreMap['setPaintProperty']>[1], value);
    }
    return this;
  }
  /** Select a known feature, including transferring selection between representations. */
  selectFeature(layerId: string, feature: Selection['feature'], lngLat: { lng: number; lat: number } = this.map.getCenter()): this {
    this.assertLive();
    const layer = this.getLayer(layerId);
    if (!this.loaded || layer.visible === false) throw new Error('Select a feature only after its layer is loaded and visible.');
    if (feature.id == null) throw new Error('Selecting a feature requires a stable feature ID.');
    this.clearState(this.selected, 'selected');
    this.selected = { source: sourceId(layerId), id: feature.id };
    this.map.setFeatureState(this.selected, { selected: true });
    this.emit('select', { layerId, feature: { type: 'Feature', id: feature.id, properties: feature.properties, geometry: feature.geometry }, lngLat: { lng: lngLat.lng, lat: lngLat.lat } });
    return this;
  }
  getSelection(): Selection | null { return this.selection; }
  clearSelection(): this {
    this.assertLive();
    this.clearState(this.selected, 'selected'); this.selected = undefined;
    this.emit('select', null);
    return this;
  }
  setTheme(theme: ThemeName | Theme): this {
    this.assertLive();
    this.theme = resolveTheme(theme);
    if (this.loaded) {
      this.map.setPaintProperty('blocklight-background', 'background-color', this.theme.background);
      for (const layer of this.layers.values()) {
        const spec = toMapLibreLayer(layer, this.theme);
        for (const [property, value] of Object.entries(spec.paint ?? {})) this.map.setPaintProperty(spec.id, property as Parameters<LibreMap['setPaintProperty']>[1], value);
      }
    }
    return this;
  }
  on<K extends keyof Events>(event: K, listener: (value: Events[K]) => void): () => void {
    this.assertLive();
    let set = this.listeners.get(event);
    if (!set) { set = new Set(); this.listeners.set(event, set); }
    set.add(listener as (value: never) => void);
    return () => { set.delete(listener as (value: never) => void); };
  }
  private emit<K extends keyof Events>(event: K, value: Events[K]) { if (event === 'select') this.selection = value as Selection | null; for (const listener of this.listeners.get(event) ?? []) listener(value as never); }
  private getLayer(id: string) { const layer = this.layers.get(id); if (!layer) throw new Error(`Unknown layer "${id}".`); return layer; }
  private clearState(ref: FeatureRef | undefined, state: string) { if (ref && this.map.getSource(ref.source)) this.map.removeFeatureState(ref, state); }
  private clearHover = () => { this.clearState(this.hovered, 'hover'); this.hovered = undefined; this.map.getCanvas().style.cursor = ''; this.emit('hover', null); };
  private resetLayerState(id: string) {
    if (this.selected?.source === sourceId(id)) { this.clearState(this.selected, 'selected'); this.selected = undefined; this.emit('select', null); }
    if (this.hovered?.source === sourceId(id)) this.clearHover();
  }
  private pick(event: MapMouseEvent, type: 'select' | 'hover') {
    if (!this.loaded || this.destroyed) return;
    const layers = [...this.layers.values()].filter(l => l.interactive !== false && l.visible !== false).map(l => renderId(l.id));
    const feature = layers.length ? this.map.queryRenderedFeatures(event.point, { layers })[0] : undefined;
    const state = type === 'select' ? 'selected' : 'hover';
    this.clearState(type === 'select' ? this.selected : this.hovered, state);
    const ref = feature?.id != null ? { source: feature.source, id: feature.id } : undefined;
    if (type === 'select') this.selected = ref; else { this.hovered = ref; this.map.getCanvas().style.cursor = feature ? 'pointer' : ''; }
    if (ref) this.map.setFeatureState(ref, { [state]: true });
    this.emit(type, feature ? { layerId: feature.layer.id.slice('blocklight-layer-'.length), feature, lngLat: { lng: event.lngLat.lng, lat: event.lngLat.lat } } : null);
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.loaded) this.rejectReady(new Error('Blocklight map destroyed before loading.'));
    this.map.getCanvas().removeEventListener('mouseleave', this.clearHover);
    this.selection = null; this.listeners.clear(); this.layers.clear(); this.map.remove();
  }
}
export function createCityMap(options: CityMapOptions) { return new CityMap(options); }
