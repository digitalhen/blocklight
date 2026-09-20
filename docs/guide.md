# Blocklight

**Building-level data maps, with styling and interaction already handled.**

Blocklight is a TypeScript library on MapLibre GL JS. Bring GeoJSON footprints and a JSON attribute table; configure joins, aggregation, and colors. The building controller handles viewport loading, flat overview footprints, 2D/3D switching, and selection. Heights are extrusions of footprint polygons, not architectural meshes.

This is a 0.1 developer preview, available on [npm](https://www.npmjs.com/package/blocklight). Requires WebGL 2, MapLibre GL JS 6, and a modern browser. React 18/19 is optional. The rendering core has no NYC or 311 requirement. Code is MIT; public data keeps its source terms.

## Run an example

From this repository:

```sh
npm ci
npm run dev
```

Open `/examples/basic/`, `/examples/datasets/`, or `/examples/chicago/` on the URL printed by Vite. Each folder includes its HTML, TypeScript, and small local data files. No citywide download or API key is needed. The Chicago example uses historical City of Chicago footprint attributes; estimated heights are reported stories multiplied by three meters.

To use an example outside this repository:

```sh
# Copy playground/examples/datasets to your own project folder, then:
npm install blocklight maplibre-gl@^6
npm run dev
```

Installing from npm replaces the example's local `file:` dependency. To test local changes, build and pack the library with `npm run build -w blocklight` and `npm pack -w blocklight`, then install the generated tarball in your application.

The examples use Vite. `createMap()` configures the bundled worker automatically; importing `blocklight/style.css` includes MapLibre's styles. Your bundler must emit `new URL(..., import.meta.url)` assets (as Vite does). For another asset pipeline, serve the packaged `dist/worker.js` yourself and pass `workerUrl`. No CDN or API key is required.

## Basic map

This is the complete source of the basic example. Its HTML only provides `#map` with an explicit height. The map starts in 3D and owns its controls and status. Copy the whole example folder for a runnable project.

{{example:basic}}

## Multiple datasets and color schemes

This is the complete source of the dataset example. Housing and plumbing share one JSON URL, fetched once by the controller. Dataset controls, the legend, and click details are built in. Switching datasets retains the camera and selected building, and updates the details automatically.

{{example:datasets}}

## Configure the complete map

`createMap(config)` returns a controller immediately. Its `ready` promise resolves once the building view is installed. Loading and fetch errors appear in the built-in status; use `onError` for application reporting. Catch `ready` when awaiting it in your own workflow.

| Option | Behavior |
| --- | --- |
| `container` | Element, CSS selector, or element ID. Give it a height. |
| `buildings` | GeoJSON URL/collection, or `{ source, featureId, overview, detailZoom, attribution }`. Stable IDs default to `source_id`. |
| `datasets` | Array of `{ id, label, source, join, value?, colors?, breaks? }`. Source is a JSON URL or inline data. |
| `join` | `{ building, record, multiplicity?, unique? }`; the building and record fields must refer to the same identifier. |
| `value` | Field to sum; omit to count records. Use `records` for a nested record array, `missing: 0` to treat absent amounts as zero. |
| `colors` | `amber`, `teal`, `rose`, or a custom `steppedScale()`. Named palettes use three `breaks`, default `[0, 5, 20]`. |
| `controls` | Defaults to `['datasets', 'perspective', 'legend']`; pass an empty array to omit these controls. |
| `details` | `{ title, fields, datasets, note }` or `false`. Title/fields support dot paths into feature properties and the first matched record. For multiple records the displayed total is aggregated, while record fields come from the first record. |
| `pitch` | Defaults to 57°; use `0` for an initial flat view. |
| `terrain` | `{ source, exaggeration?, hillshade?, sky?, mask? }`, raising the whole map onto elevation data you supply. |

Call `await map.setDataset(id)` or `await map.replaceDatasets(definitions, activeId)` to update data through code. After `await map.ready`, `map.setPerspective('2d')` changes the view. `map.setTheme('paper')` changes the base theme. Colors stay as explicitly configured. `map.getSelection()` reads the current selection. Call `map.destroy()` when unmounting an SPA component; page navigation cleanup is automatic.

`map.datasetController` exposes the building dataset controller after `ready` for custom interfaces (and is undefined for maps without datasets). When using built-in controls, update data through `map.setDataset()` / `map.replaceDatasets()` so the UI stays synchronized.

`map.engine` exposes the lower-level `CityMap` for custom layers and events; `map.engine.map` exposes MapLibre. The APIs below support applications with their own controls and detail layouts, such as the citywide showcase. Blocklight owns building identity, joins, overview transitions, and selection; MapLibre renders geometry and handles camera interaction.

## Elevation

Two kinds of elevation are available, and they are independent.

**3D terrain** raises the whole map onto a digital elevation model, so buildings, streets and overlays follow the real ground. Blocklight bundles no elevation tiles and contacts no provider on its own: you pass a MapLibre `raster-dem` source, with its own attribution and any key that source requires.

```ts
const map = createMap({
  container: 'map',
  buildings: '/data/buildings.json',
  terrain: {
    // Any raster-dem source you are entitled to use, including one you host.
    source: { type: 'raster-dem', tiles: ['https://example.org/dem/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium', attribution: 'Elevation: your source' },
    exaggeration: 1.2,  // 1 is true elevation
    hillshade: true,    // relief shading beneath your data, themed (default)
    sky: true,          // a themed sky above the horizon (default)
  },
});
```

### Masking unreliable relief

Open elevation models are surface models stitched from several sources, so over water they carry
mosaic seams, piers and bridge decks rather than a flat surface. Hillshade renders all of it: in
New York a bright ridge runs down the middle of the Hudson, where the tiles are joined along the
state line. The terrain mesh itself is fine — it is only the shading that shows the noise.

Pass a `mask` to cover the relief wherever the model is not to be trusted. It is drawn above the
hillshade and below your data, filled with the theme background unless you set `maskColor`.
`outsideMask(land, bounds)` builds one from a landmass, punching each polygon out of a covering
rectangle so that only the land keeps its relief:

```ts
import { outsideMask } from 'blocklight';

createMap({
  container: 'map',
  buildings: '/data/buildings.json',
  terrain: { source: dem, mask: outsideMask(landPolygons, [-74.5, 40.3, -73.4, 41.1]) },
});
```

Holes come from each landmass outer ring only, so a lake inside a landmass stays covered — it is
water too. Without a landmass to invert, pass water polygons as the mask directly.

Terrain belongs to the extruded 3D buildings alone. It is suspended for the 2D plan and for the
zoomed-out overview, and restored when the 3D buildings come back. Both of those are flat fills,
and MapLibre drapes flat ground layers through an offscreen texture that visibly blurs and dims
them, for no gain — neither view shows elevation. Terrain is applied either side of the camera
transition rather than during it, because changing it mid-ease makes MapLibre recompute zoom from
the camera's altitude over the mesh and lurch the view.

Two further limits are worth knowing. A pitched camera under terrain draws less geometry near the
horizon than a flat map does, so distant buildings thin out; at pitch 0 the two render identically.
MapLibre also raises each extrusion by the elevation at its footprint centroid alone, so on a
slope a building with no height sits at one level while the ground around it climbs, and the
uphill side swallows it. Blocklight handles that: while terrain is on, footprints with no height
are drawn as a draped fill — `<id>-grounded` — which follows the terrain surface exactly and wraps
them onto the slope. The extrusion layer keeps every building that has a height. Nothing is
invented for the heightless ones; they are simply drawn flat on the real ground instead of under
it. The layer stands down for the 2D plan, which already draws every footprint flat.

Terrain can be switched at runtime with `map.setTerrain(options)` and removed with `map.setTerrain(null)`; `map.engine.getTerrain()` reads the current setting. Hillshade and sky colors follow the active theme, so `setTheme()` keeps terrain consistent. Terrain raises tile and memory cost, so measure it before enabling it citywide.

**Per-building ground elevation** suits a flat-earth map whose footprints already carry the height of the ground beneath them. Name that field and each building starts at its own elevation instead of at zero:

```ts
createMap({
  container: 'map',
  buildings: { source: '/data/buildings.json', heightProperty: 'height_m', elevationProperty: 'ground_elev_m' },
});
```

Values are in meters, negatives are clamped to zero, and a missing value falls back to zero. `baseHeightProperty`, when set, still measures from the building's own ground, so a building raised by elevation keeps its base offset.

The two settings do not stack. MapLibre already lifts extrusions onto terrain, so whenever terrain is active `elevationProperty` is ignored rather than added a second time. That means you can leave the property configured and toggle terrain freely.

## Prepare your data

**Prepared building attributes:** supply records keyed by a unique footprint property. `records` is an optional dot path to the array; omit it for a top-level array. `aggregate` defaults to counting records. Sum fields may use dot paths; `missing: 0` explicitly treats an absent or null amount as zero. Other nonnumeric amounts are rejected. The `property` option controls the decorated output field, defaulting to `value`; use that same field in the color scale.

```json
[
  { "buildingId": "123", "count": 8, "plumbing": 0 },
  { "buildingId": "456", "count": 12, "plumbing": 3 }
]
```

**Raw records with building IDs:** use `join: { feature: 'bin', record: 'building_bin' }` and `aggregate: { op: 'count' }`. Set `featureId: 'bin'` only if BIN is your actual unique footprint identity. For tiled data, joins on other keys require `join.multiplicity`: a feature property containing the number of footprints sharing that key across the complete geometry. Only one is eligible. `join.unique: true` asserts global uniqueness; do not use it to bypass a genuinely ambiguous join.

**Raw records with lot IDs and coordinates:** preprocess them with the exported `matchBuildingRecords()` before rendering. Supply complete geometry for every lot represented, not viewport tiles. A key with one footprint matches directly; a shared key needs a point inside exactly one footprint. Holes and shared boundaries are handled conservatively. The result retains unmatched records and reconciles weighted totals. Coordinates alone without a candidate key are not currently supported; there is no nearest-building guess.

```ts
import { matchBuildingRecords } from 'blocklight';
const result = matchBuildingRecords(geometry, rawRequests, {
  featureId: 'source_id', featureKeys: ['base_bbl', 'mappluto_bbl'],
  recordId: 'unique_key', recordKey: 'bbl',
  longitude: 'longitude', latitude: 'latitude', completeGeometry: true,
});
// geometry and rawRequests are your parsed GeoJSON and JSON.
const prepared = result.matched.map(({ buildingId, record }) => ({ ...record, buildingId }));
console.log(result.summary, result.unmatched);
// Pass prepared as data.values, with join.record = 'buildingId'.
```

For source-specific normalization, pass `normalizeKey(value)`. Default normalization trims string/numeric keys; it does not pad IDs. Use `weight` when an input row represents multiple events. Perform large matching jobs during data preparation, not on every camera move. Source download/cleanup is still the application's responsibility.

## Missing data and identity

`getResult(feature)` returns `{ status, value, records }`. Status is `matched`, `unmatched`, `ambiguous`, `missing-key`, or `unverified`. Only `matched` has a numeric value; a real zero remains zero. All other values are null, and `steppedScale` renders its no-data color. Decorated features carry both `value` and `value_status` (or the configured property prefix). `missingKeys` counts input records lacking a join key; it is not a full count of records without matching geometry.

Every building controller feature must have a stable `featureId` property, default `source_id`. Missing and duplicate identities are rejected. The controller treats that field as globally unique, so a selected building can still resolve after it leaves the viewport. The lower-level layer API preserves existing `Feature.id` by default. Use `promoteId` to derive identity from a property. `generateId: true` explicitly opts into index-based IDs that overwrite supplied IDs and should only be used for static data.

## Building controller API

`addBuildingView(city, options)` manages geometry and representations. `addBuildingDataset(city, { ...options, data, color })` adds one configured join. `addBuildingDatasets(city, { ...options, datasets, active })` adds named datasets with independent sources, aggregation, and colors. These asynchronous factories resolve after initial data is assigned, not after the browser has finished painting.

| Option | Meaning |
| --- | --- |
| `source` | GeoJSON FeatureCollection or URL; URL may resolve to a Blocklight geometry manifest. |
| `overview` | Optional simplified GeoJSON/manifest or native vector source for low zoom. Loaded on demand. |
| `detailZoom` | Below this zoom use flat overview footprints. Defaults to 14 with `overview`, otherwise 0. |
| `featureId` | Stable identity property, default `source_id`. |
| `heightProperty` | Height in meters, default `height_m`. |
| `extruded` | Initial 3D mode, default true. |
| `id` | Layer prefix, default `buildings`. Must be unique within the map. |
| `attribution` | Source attribution displayed on the map. |
| `onChange` | Receives `{ mode, perspective, featureCount }` after data updates. Mode is `overview` or `buildings`. |
| `onError` | Receives subsequent loading errors; catch factory rejection for initial failures. |
| `signal` | AbortSignal for cancellation and disposal. |

Use a small full GeoJSON source without a separate overview, or provide a prebuilt overview with tiled detail geometry. A viewport manifest alone cannot load an entire city at low zoom; its loader intentionally caps requests at 64 tiles.

| Controller method | Behavior |
| --- | --- |
| `setDataset(id)` | Named controller: fetch/validate and switch. Unknown IDs reject. Latest requested switch wins. An omitted palette restores defaults. |
| `replaceDatasets(definitions, activeId)` | Replace named definitions after validating the selected dataset. Useful for local uploads. |
| `getValue(feature)` / `getResult(feature)` / `getRecords(feature)` | Read the active join; these do not fetch geometry. |
| `setPerspective('2d' \| '3d', camera?)` | Changes representation and camera pitch/bearing; flat footprints remain at low zoom in either mode. |
| `setColor(scale)` / `setVisible(boolean)` | Apply to all representations. Hiding clears selection. |
| `refresh()` | Reload the current viewport; static files and tiles use controller caches. |
| `dispose()` | Remove owned layers and listeners. Also happens when the map is destroyed. |

`active`, `rawData`, `recordCount`, `missingKeys`, `state`, `geometry`, and `layerIds` expose the current controller state. Single-dataset `setDataset(data, color?)` takes a configuration rather than a named ID. `data` accepts exactly one of `url` and `values`. Cached URL data is a snapshot for the controller's lifetime; there is no automatic polling.

## Large data and vector tiles

Use `source: { type: 'vector', tiles: [...], sourceLayer: 'buildings' }` with the lower-level `buildings()` or `polygons()` layer factories. Standard TileJSON URLs are also supported. Registered MapLibre protocols can supply PMTiles URLs; Blocklight does not bundle a PMTiles client. Vector selection includes the source-layer identity. Vector geometry is immutable: use feature state or replace its layer, rather than `setData()`.

A building controller's `overview` accepts that same vector source. It applies the active JSON join through feature state to loaded features. Geometry tiles are reused when switching datasets. For very large attribute tables, prejoin attributes into tiles or load attributes by viewport in an application adapter; Blocklight still holds its configured JSON dataset in memory.

The NYC demo uses compact counts initially, detail shards on click, and standard MVT overview tiles only when zoomed out. The overview includes all buildings linked to the bundled 2025 HPD extract and a one-in-32 sample of other footprint IDs. It is not a statistical sample or a heatmap. Imported datasets can include buildings outside that overview sample; zoom in to see all footprints. Detailed geometry covers all five boroughs.

Run `npm run data:city` for a complete city build, or `npm run data:overview` after an existing city build to regenerate compact counts, detail shards and MVT overview tiles. Generated city assets are excluded from Git and the package. See `DATA.md` for provenance and preparation methods. Configure HTTP compression and caching when hosting these static assets. Use `npm run benchmark` for local payload/loading measurements; these are not a substitute for real-device testing.

## Lower-level API and React

`createCityMap()` accepts a container, center, zoom, pitch, bearing, theme, optional city preset, and advanced `mapOptions`. Use `buildings`, `points`, `lines`, and `polygons` to create layers. Themes are `blueprint`, `paper`, or a custom theme object. `steppedScale(property, stops, noDataColor)` returns both the paint expression and legend entries.

`CityMap` supports `addLayer`, `removeLayer`, `setVisible`, `setData`, `setColor`, `setTheme`, `selectFeature`, `getSelection`, `clearSelection`, and `destroy`. `on('select' | 'hover' | 'error', handler)` returns an unsubscribe function. Selection includes `layerId`, `feature`, and `lngLat`; clearing emits null. `ready` means the base style is installed, not that data has rendered. The underlying MapLibre map is available as `city.map`.

The optional `blocklight/react` export provides `CityMapView`. Theme, layers, and callbacks update live; camera and city options are initial values. Memoize the layers array: replacing it reinstalls layers and clears selection. The `/react.html` example exercises Strict Mode mounting and cleanup. For dataset controllers in React, create an AbortController in the mounting effect and abort it on cleanup.

Render source data as text or escape it before inserting HTML. A clickable map alone is not an accessible data interface: supply keyboard-operable controls and a list/table alternative when building a public data product.

## Development and compatibility

`npm run check` checks generated docs, TypeScript, unit tests and builds. `npm run test:browser` runs WebGL integration tests against the actual demo and example routes. `npm run test:consumer` packs the library, installs it in an isolated copy of the dataset example, typechecks, builds, and runs browser controls with the packaged worker without workspace aliases. The supported baseline is Node 22.12+ for tooling and MapLibre 6.x for rendering. No stable API compatibility is promised before 1.0; breaking preview changes must be recorded in `CHANGELOG.md`.

To edit documentation, update `docs/guide.md`, `docs/readme.md`, or the runnable example source, then run `npm run docs:build`. The website, repository README and packaged README are generated together. Do not edit their generated contents separately.

## Exploring other cities

The [playground](./) opens in New York. Its city selector also offers
[Chicago](./?city=chicago) (construction year and reported stories),
[Seattle](./?city=seattle) (2024 site energy and emissions intensity), and
[Atlanta](./?city=atlanta) (building permits filed 2019 through 2024).
Chicago, Seattle, and Atlanta are labeled extracts; Atlanta's covers
downtown and Midtown. Each city has its own camera,
geometry, dataset definitions, units, palettes, and source notes. Switching cities
opens a fresh map; switching datasets keeps the selected building.

The same configuration works with any city. For example, with the Seattle files
from `playground/public/data/cities/seattle/` copied into your app's data directory:

```ts
createMap({
  container: '#map', center: [-122.3355, 47.6095], zoom: 15,
  buildings: {
    source: './data/buildings.geojson', featureId: 'building_id',
    attribution: 'City of Seattle · 2023 building outlines',
  },
  datasets: [{
    id: 'energy', label: 'Site energy · kBtu/ft²/year',
    source: './data/datasets.json', records: 'eui',
    join: { building: 'building_id', record: 'id', unique: true },
    value: 'eui', colors: 'amber', breaks: [0, 50, 100],
  }],
  details: { title: 'name', fields: ['address', 'use', 'reportingYear'] },
});
```

`datasets.json` holds a separate array per metric so an unknown measurement is
omitted from that metric instead of becoming zero. The importer establishes safe
one-building joins before writing the portable JSON. Seattle's multi-building,
ambiguous, or flagged records are excluded; the legend states how many. Heights
are estimates from reported floors; unknown heights stay flat. Atlanta joins city
permit records to footprints by point-in-polygon rather than by a shared ID: a
permit counts for a footprint only when its geocode resolved to a specific address
and its point falls inside exactly one footprint, so 3,008 of the 3,788 permits in
that extract match and the rest are reported unmatched. Its footprints come from
Overture Maps under ODbL and carry a share-alike obligation the other extracts do
not. See
[DATA.md](https://github.com/digitalhen/blocklight/blob/main/DATA.md) for methodology
and upstream terms. Regenerate with `npm run data:cities`.
