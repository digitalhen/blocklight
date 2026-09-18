# Blocklight

**Beautiful cities. Your data.**

A TypeScript city-mapping toolkit built on MapLibre GL JS. Quiet cartography,
3D building footprints, composable data layers, and a shared language for maps
and legends. Inspired by the Blueprint and Paper maps in Henry Williams's Prospect.

## Package status

Local v0.1 preview. Not yet published to npm. Requires MapLibre GL JS 6 and a
browser with WebGL 2. React 18/19 is optional, via `blocklight/react`.

```ts
import 'maplibre-gl/dist/maplibre-gl.css';
import { createCityMap, buildings } from 'blocklight';

const city = createCityMap({ container: 'map', center: [-73.98, 40.75], zoom: 15 });
city.addLayer(buildings({ id: 'skyline', source: '/buildings.geojson' }));
city.on('select', selection => console.log(selection));
// Call city.destroy() on teardown.
```

Give the container a height. Building heights are meters; coordinates are WGS84.
Supply your own GeoJSON data and attribution. The package does not bundle datasets
or require a service account. NYC geographic defaults are in `blocklight/nyc`.

Exports include `points`, `lines`, `polygons`, `steppedScale`, `themes`, and
`toMapLibreLayer` for integration with an existing MapLibre map. `CityMapView`
is exported from `blocklight/react`. The controller supports `setTheme`,
`setData`, `setVisible`, `removeLayer`, `ready`, and select/hover/error events.

Code: MIT, Copyright 2026 Henry Williams.

## MapLibre 6 worker setup

Bundlers must resolve MapLibre's separate module worker. For Vite, configure it
once before creating maps (see `playground/src/worker.ts`):

```ts
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
setWorkerUrl(workerUrl);
```

For other bundlers, serve `maplibre-gl-worker.mjs` and its sibling
`maplibre-gl-shared.mjs` from MapLibre's `dist` directory at a public path,
and call `setWorkerUrl` with that worker URL. Keep the files matched to the
installed MapLibre version. Blocklight does not overwrite global worker settings.
