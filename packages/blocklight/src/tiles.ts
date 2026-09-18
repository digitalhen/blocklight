import type { FeatureCollection, Feature } from 'geojson';
export interface GeoJSONTileManifest {
  schemaVersion: 1;
  zoom: number;
  featureCount: number;
  geometryVersion: string;
  template: string;
  tiles: Record<string, number>;
}
export type Bounds = [west: number, south: number, east: number, north: number];
export function tileKeys(bounds: Bounds, zoom: number): string[] {
  const n = 2 ** zoom;
  const x = (lng: number) => Math.min(n - 1, Math.max(0, Math.floor((lng + 180) / 360 * n)));
  const y = (lat: number) => Math.min(n - 1, Math.max(0, Math.floor((1 - Math.asinh(Math.tan(Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180)) / Math.PI) / 2 * n)));
  if (!bounds.every(Number.isFinite) || bounds[0] > bounds[2] || bounds[1] > bounds[3] || !Number.isInteger(zoom) || zoom < 0 || zoom > 22) throw new Error('Invalid bounds or tile zoom.');
  const west = x(bounds[0]), east = x(bounds[2]), north = y(bounds[3]), south = y(bounds[1]);
  if ((east - west + 1) * (south - north + 1) > 64) throw new Error('Zoom in to load building detail.');
  const keys: string[] = [];
  for (let tx = west; tx <= east; tx++) for (let ty = north; ty <= south; ty++) keys.push(`${tx}/${ty}`);
  return keys;
}
/** Static JSON geometry in small geographic files. Requires no tile server or API key. */
export class GeoJSONTileLoader {
  private cache = new Map<string, FeatureCollection>();
  constructor(readonly manifest: GeoJSONTileManifest, readonly manifestURL: string) {
    if (manifest.schemaVersion !== 1 || !Number.isInteger(manifest.zoom) || !manifest.tiles || typeof manifest.template !== 'string') throw new Error('Invalid GeoJSON tile manifest.');
  }
  async load(bounds: Bounds, signal?: AbortSignal): Promise<FeatureCollection> {
    const keys = tileKeys(bounds, this.manifest.zoom).filter(key => Object.hasOwn(this.manifest.tiles, key));
    const pending = [...keys], loaded = new Map<string, FeatureCollection>();
    await Promise.all(Array.from({ length: Math.min(6, pending.length) }, async () => {
      while (pending.length) {
        signal?.throwIfAborted();
        const key = pending.shift()!;
        let data = this.cache.get(key);
        if (!data) {
          const [x, y] = key.split('/');
          const response = await fetch(new URL(this.manifest.template.replace('{x}', x).replace('{y}', y), this.manifestURL), { signal });
          if (!response.ok) throw new Error(`Could not load geometry tile ${key} (${response.status}).`);
          data = await response.json() as FeatureCollection;
          if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error(`Invalid geometry tile ${key}.`);
          this.cache.set(key, data);
        } else { this.cache.delete(key); this.cache.set(key, data); }
        loaded.set(key, data);
        while (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
      }
    }));
    signal?.throwIfAborted();
    const features = new Map<string | number, Feature>();
    for (const key of keys) for (const feature of loaded.get(key)!.features) {
      if (feature.id == null) throw new Error(`Tile ${key} contains a feature without an ID.`);
      features.set(feature.id, feature);
    }
    return { type: 'FeatureCollection', features: [...features.values()] };
  }
}
