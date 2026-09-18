# Blocklight

**Building-level data maps, with styling and interaction already handled.**

Blocklight is a TypeScript library on MapLibre GL JS. Bring GeoJSON footprints and a JSON attribute table; configure joins, aggregation, and colors. The building controller handles viewport loading, flat overview footprints, 2D/3D switching, and selection. Heights are extrusions of footprint polygons, not architectural meshes.

This is an unpublished 0.1 developer preview. Requires WebGL 2, MapLibre GL JS 6, and a modern browser. React 18/19 is optional. The rendering core has no NYC or 311 requirement. Code is MIT; public data keeps its source terms.

## Run an example

From this repository:

```sh
npm ci
npm run dev
```

Open `/examples/basic/`, `/examples/datasets/`, or `/examples/chicago/` on the URL printed by Vite. Each folder includes its HTML, TypeScript, and small local data files. No citywide download or API key is needed. The Chicago example uses historical City of Chicago footprint attributes; estimated heights are reported stories multiplied by three meters.

To use an example outside this repository:

```sh
# In the Blocklight repository:
npm run build -w blocklight
npm pack -w blocklight
# Copy playground/examples/datasets to your own project folder, then:
npm install /absolute/path/to/blocklight-0.1.0.tgz
npm run dev
```

Installing the tarball replaces the example's local `file:` dependency. The examples use Vite. Their worker URL import is Vite-specific; with another bundler, serve MapLibre's worker and shared module together and call `setWorkerUrl()` before constructing a map. Keep these files matched to your installed MapLibre version.

## Basic map

This is the complete source of the basic example. Its HTML provides `#map` with an explicit height and a `#status` paragraph. Copy the whole example folder for a runnable project.

{{example:basic}}

## Multiple datasets and color schemes

This is the complete source of the dataset example. Its HTML also provides `#dataset`, `#view`, and `#details`. Housing and plumbing share one JSON URL, fetched once by the controller. Switching datasets retains the camera and selected building; refreshing the detail text after the promise resolves uses the newly active label.

{{example:datasets}}

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

`npm run check` checks generated docs, TypeScript, unit tests and builds. `npm run test:browser` runs WebGL integration tests against the actual demo and example routes. `npm run test:consumer` packs the library, installs it in an isolated copy of the dataset example, typechecks, and builds without workspace aliases. The supported baseline is Node 22.12+ for tooling and MapLibre 6.x for rendering. No stable API compatibility is promised before 1.0; breaking preview changes must be recorded in `CHANGELOG.md`.

To edit documentation, update `docs/guide.md` or the runnable example source, then run `npm run docs:build`. The website, repository README and packaged README are generated together. Do not edit their generated contents separately.
