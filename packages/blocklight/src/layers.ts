import type { GeoJSONSourceSpecification, LayerSpecification, ExpressionSpecification, FilterSpecification, VectorSourceSpecification } from 'maplibre-gl';
import type { Theme } from './themes.js';
import type { ColorScale } from './scales.js';
export type VectorGeometrySource = VectorSourceSpecification & { sourceLayer: string };
export const isVectorSource = (source: unknown): source is VectorGeometrySource => !!source && typeof source === 'object' && 'type' in source && source.type === 'vector';
export type GeoJSONData = GeoJSONSourceSpecification['data'];
export interface LayerOptions {
  id: string;
  source: GeoJSONData | VectorGeometrySource;
  attribution?: string;
  /** Use a stable property for IDs when replacing viewport data. */
  promoteId?: string;
  /** Opt in to index-based IDs only for static data without stable IDs. */
  generateId?: boolean;
  interactive?: boolean;
  visible?: boolean;
  minzoom?: number;
  maxzoom?: number;
}
export interface LayerDefinition extends LayerOptions {
  kind: 'buildings' | 'points' | 'lines' | 'polygons';
  color?: string | ColorScale;
  extruded?: boolean;
  heightProperty?: string;
  baseHeightProperty?: string;
  /** Ground elevation in metres, lifting the whole building. Ignored under 3D terrain, which already raises extrusions. */
  elevationProperty?: string;
  radius?: number | ExpressionSpecification;
  width?: number;
  opacity?: number;
  /** Restrict the layer to matching features, so one source can drive several representations. */
  filter?: FilterSpecification;
}
function define(kind: LayerDefinition['kind'], options: Omit<LayerDefinition, 'kind'>): LayerDefinition {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.id)) throw new Error('Layer IDs must contain only letters, numbers, underscores, or hyphens.');
  if (!options.source) throw new Error('A layer needs a GeoJSON object or URL.');
  return { ...options, kind };
}
export function buildings(options: LayerOptions & { extruded?: boolean; heightProperty?: string; baseHeightProperty?: string; elevationProperty?: string; color?: string | ColorScale; opacity?: number; filter?: FilterSpecification }) {
  return define('buildings', { heightProperty: 'height_m', ...options });
}
export function points(options: LayerOptions & { color?: string | ColorScale; radius?: number | ExpressionSpecification }) { return define('points', options); }
export function lines(options: LayerOptions & { color?: string | ColorScale; width?: number }) { return define('lines', options); }
export function polygons(options: LayerOptions & { color?: string | ColorScale; opacity?: number }) { return define('polygons', options); }
export function sourceId(id: string) { return `blocklight-source-${id}`; }
export function renderId(id: string) { return `blocklight-layer-${id}`; }
/** Style context that changes paint without changing the layer itself. */
export interface StyleContext {
  /** True when 3D terrain is active; MapLibre then lifts extrusions onto the ground itself. */
  terrain?: boolean;
}
/** A pure style factory, also usable directly with an existing MapLibre map. */
export function toMapLibreLayer(layer: LayerDefinition, theme: Theme, context: StyleContext = {}): LayerSpecification {
  const stateColor = (value: unknown): unknown => Array.isArray(value) ? value[0] === 'get' && value.length === 2 ? ['coalesce', ['feature-state', value[1]], value] : value.map(stateColor) : value;
  const rawColor = typeof layer.color === 'string' ? layer.color : layer.color?.expression;
  const baseColor = isVectorSource(layer.source) ? stateColor(rawColor) as ExpressionSpecification | string | undefined : rawColor;
  const height: ExpressionSpecification = ['max', 0, ['to-number', ['get', layer.heightProperty ?? 'height_m'], 0]];
  const color = baseColor ?? (layer.kind === 'buildings'
    ? ['interpolate', ['linear'], height, 0, theme.buildingLow, 300, theme.buildingHigh] as ExpressionSpecification
    : layer.kind === 'lines' ? theme.street : layer.kind === 'polygons' ? theme.land : theme.accent);
  const interactiveColor: ExpressionSpecification = ['case', ['boolean', ['feature-state', 'selected'], false], theme.selection, ['boolean', ['feature-state', 'hover'], false], theme.accent, color];
  const common = { ...(isVectorSource(layer.source) ? { 'source-layer': layer.source.sourceLayer } : {}), id: renderId(layer.id), source: sourceId(layer.id), minzoom: layer.minzoom ?? 0, maxzoom: layer.maxzoom ?? 24, layout: { visibility: layer.visible === false ? 'none' as const : 'visible' as const }, ...(layer.filter ? { filter: layer.filter } : {}) };
  // Terrain already raises extrusions by the ground height, so adding it again would float the buildings.
  const ground: ExpressionSpecification | undefined = layer.elevationProperty && !context.terrain ? ['max', 0, ['to-number', ['get', layer.elevationProperty], 0]] : undefined;
  const lift = (value: ExpressionSpecification | number): ExpressionSpecification | number => ground ? ['+', ground, value] : value;
  const localBase: ExpressionSpecification | number = layer.baseHeightProperty ? ['min', height, ['max', 0, ['to-number', ['get', layer.baseHeightProperty], 0]]] : 0;
  switch (layer.kind) {
    case 'buildings': if (layer.extruded === false) return { ...common, type: 'fill', paint: { 'fill-color': interactiveColor, 'fill-opacity': layer.opacity ?? 0.55 } };
      return { ...common, type: 'fill-extrusion', paint: { 'fill-extrusion-height': lift(height), 'fill-extrusion-base': lift(localBase), 'fill-extrusion-color': interactiveColor, 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true } };
    case 'points': return { ...common, type: 'circle', paint: { 'circle-radius': layer.radius ?? 5, 'circle-color': interactiveColor, 'circle-stroke-color': theme.background, 'circle-stroke-width': 2 } };
    case 'lines': return { ...common, type: 'line', paint: { 'line-color': interactiveColor, 'line-width': layer.width ?? 1.2 } };
    case 'polygons': return { ...common, type: 'fill', paint: { 'fill-color': interactiveColor, 'fill-opacity': layer.opacity ?? 1 } };
  }
}
