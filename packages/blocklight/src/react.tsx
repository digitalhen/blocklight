"use client";
import { useEffect, useRef, type CSSProperties } from 'react';
import { createCityMap, type CityMap, type CityMapOptions, type Selection } from './map.js';
import type { LayerDefinition } from './layers.js';
export interface CityMapProps extends Omit<CityMapOptions, 'container'> {
  layers?: readonly LayerDefinition[];
  className?: string;
  style?: CSSProperties;
  onReady?: (map: CityMap) => void;
  onSelect?: (selection: Selection | null) => void;
  onError?: (error: Error) => void;
}
/** Camera/city/engine options are initial values. Theme, layers and callbacks update live. */
export function CityMapView({ layers = [], className, style, onReady, onSelect, onError, ...options }: CityMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const controller = useRef<CityMap | null>(null);
  const callbacks = useRef({ onReady, onSelect, onError });
  callbacks.current = { onReady, onSelect, onError };
  const initial = useRef(options);
  useEffect(() => {
    let map: CityMap;
    try { map = createCityMap({ ...initial.current, container: container.current! }); }
    catch (error) { callbacks.current.onError?.(error instanceof Error ? error : new Error(String(error))); return; }
    controller.current = map;
    let active = true;
    map.on('select', selection => callbacks.current.onSelect?.(selection));
    map.on('error', error => callbacks.current.onError?.(error));
    void map.ready.then(() => { if (active) callbacks.current.onReady?.(map); }).catch(error => { if (active) callbacks.current.onError?.(error); });
    return () => { active = false; map.destroy(); controller.current = null; };
  }, []);
  useEffect(() => { controller.current?.setTheme(options.theme ?? 'blueprint'); }, [options.theme]);
  useEffect(() => {
    const map = controller.current;
    if (!map) return;
    layers.forEach(layer => map.addLayer(layer));
    return () => { if (controller.current === map) layers.forEach(layer => map.removeLayer(layer.id)); };
  }, [layers]);
  return <div ref={container} className={className} style={{ width: '100%', height: '100%', minHeight: 320, ...style }} aria-label="Interactive city map" />;
}
