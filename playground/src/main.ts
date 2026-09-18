import 'blocklight/style.css';
import './style.css';
import { createMap, renderId, lines, polygons, points, type ColorScale, GeoJSONTileLoader, type GeoJSONTileManifest, type Bounds, type ThemeName, type Selection } from 'blocklight';
import { nyc } from 'blocklight/nyc';
import type { FeatureCollection } from 'geojson';
import { parseBuildingDataset, type BuildingDataset, type BuildingRecord } from './building-data.js';
import { datasetDefinitions } from './datasets.js';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const attribution = '<a href="https://opendata.cityofnewyork.us/">NYC Open Data</a>';
const detailZoom = 14;
const buildingLayers = ['buildings', 'buildings-footprints', 'buildings-overview'];
const initial = { center: nyc.center, zoom: 15.3, pitch: 57, bearing: -28 };
async function readJSON(name: string): Promise<unknown> {
  const response = await fetch(`./data/${name}`);
  if (!response.ok) throw new Error(`Could not load ${name} (${response.status}).`);
  return response.json();
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className?: string) {
  const element = document.createElement(tag); element.textContent = text;
  if (className) element.className = className;
  return element;
}
async function start() {
  let buildingManifest: GeoJSONTileManifest | undefined, streetTiles: GeoJSONTileLoader | undefined;
  let geometryVersion: string | undefined;
  let datasetFile = '311-buildings.json';
  const cityResponse = await fetch('./data/city.json');
  if (cityResponse.ok && cityResponse.headers.get('content-type')?.includes('application/json')) {
    const city = await cityResponse.json();
    const [nextBuildingManifest, streetManifest] = await Promise.all([readJSON('city-buildings.json'), readJSON('city-streets.json')]) as [GeoJSONTileManifest, GeoJSONTileManifest];
    buildingManifest = nextBuildingManifest;
    streetTiles = new GeoJSONTileLoader(streetManifest, new URL('./data/city-streets.json', location.href).href);
    geometryVersion = city.geometryVersion; datasetFile = '311-citywide.json';
  } else if (!cityResponse.ok && cityResponse.status !== 404) throw new Error(`Could not load city metadata (${cityResponse.status}).`);
  function viewportBounds(): Bounds {
    const bounds = map.map.getBounds(); return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  }
  const [land, places] = await Promise.all(['land', 'places'].map(async name => await readJSON(`${name}.geojson`) as FeatureCollection));
  const skyline = buildingManifest ? undefined : await readJSON('buildings.geojson') as FeatureCollection;
  let dataset = buildingManifest ? await readJSON('311-metrics.json') as BuildingDataset : parseBuildingDataset(await readJSON(datasetFile), skyline);
  if (buildingManifest && dataset.join.geometryVersion !== geometryVersion) throw new Error('Metrics and geometry versions do not match. Rebuild city assets.');
  let uploaded = false;
  $<HTMLAnchorElement>('download-json').href = `./data/${datasetFile}`;
  $('coverage-name').textContent = buildingManifest ? 'ALL FIVE BOROUGHS' : 'MIDTOWN SAMPLE';
  $('layer-coverage').textContent = buildingManifest ? 'Citywide' : 'NYC sample';
  $('street-coverage').textContent = buildingManifest ? 'All five boroughs' : 'Manhattan centerlines';
  const records = new Map<string, BuildingRecord>(buildingManifest ? [] : dataset.buildings.map(record => [record.buildingId, record]));
  const detailCache = new Map<number, Promise<void>>();
  let currentSelection: Selection | null = null;
  let theme: ThemeName = 'blueprint', threeDimensional = true, activeId = 'housing';
  const definitions = () => datasetDefinitions(`./data/${datasetFile}`, theme).map(d => ({ ...d, data: {
    ...d.data, url: undefined, values: dataset,
    aggregate: { op: 'sum' as const, field: buildingManifest && !uploaded ? ({ housing: 'count', heat: 'heat', plumbing: 'plumbing' }[d.id]!) : d.data.aggregate?.op === 'sum' ? d.data.aggregate.field : 'count', missing: 0 as const },
  } }));
  const definition = () => definitions().find(d => d.id === activeId)!;
  const requestScale = (_theme: ThemeName) => definition().color as ColorScale;
  const app = createMap({
    container: '#map', city: nyc, ...initial, zoom: 14.8,
    mapOptions: { maxZoom: 18.5, minZoom: 10 },
    // The showcase supplies its own editorial controls and detailed 311 panel.
    controls: [], details: false,
    datasets: definitions().map(d => ({
      id: d.id, label: d.label, source: d.data.values, records: d.data.records,
      join: { building: d.data.join.feature, record: d.data.join.record, multiplicity: d.data.join.multiplicity, unique: d.data.join.unique },
      value: d.data.aggregate?.op === 'sum' ? d.data.aggregate.field : undefined,
      missing: 0, property: d.data.property, colors: d.color as ColorScale,
    })),
    buildings: {
      source: buildingManifest ? './data/city-buildings.json' : skyline!,
      overview: buildingManifest ? { type: 'vector', tiles: [new URL('./data/city/overview/{z}/{x}/{y}.pbf', location.href).href.replaceAll('%7B', '{').replaceAll('%7D', '}')], sourceLayer: 'buildings', minzoom: 8, maxzoom: 13, bounds: [-74.35, 40.44, -73.65, 40.94] } : undefined,
      detailZoom, attribution,
      onChange: state => {
        $('count').textContent = state.mode === 'overview' ? `${state.featureCount.toLocaleString()} flat building footprints${buildingManifest ? ' · citywide sample' : ''}` : `${state.featureCount.toLocaleString()} loaded${buildingManifest ? ` · ${buildingManifest.featureCount.toLocaleString()} citywide` : ' buildings'}`;
        $('status').textContent = state.mode === 'overview' ? 'Overview · flat footprints · zoom in for 3D' : buildingManifest ? 'Citywide data · loaded for this view.' : 'Local data. No API key required.';
      }, onError: error => { $('status').textContent = error.message; },
      },
    onError: error => { $('status').textContent = error.message; },
  });
  const map = app.engine;
  (window as unknown as { blocklight: typeof map }).blocklight = map;
  map.on('error', error => { $('status').textContent = error.message; });
  map.addLayer(polygons({ id: 'land', source: land, interactive: false, attribution }));
  const streets = streetTiles ? await streetTiles.load(viewportBounds()) : await readJSON('streets.geojson') as FeatureCollection;
  await app.ready;
  const layer = app.datasetController!;
  map.addLayer(lines({ id: 'streets', source: streets, interactive: false, width: 1.3, attribution }));
  // Geometry loads concurrently: keep ground layers below every building representation.
  map.map.moveLayer(renderId('streets'), renderId(layer.layerIds.buildings));
  map.addLayer(points({ id: 'places', source: places, radius: 6 }));
  function periodLabel() {
    const from = new Date(`${dataset.period.from}T00:00:00Z`);
    const through = new Date(Date.parse(`${dataset.period.toExclusive}T00:00:00Z`) - 86400000);
    const format = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `${format.format(from)} – ${format.format(through)}`;
  }
  function updateLegend() {
    const values = dataset.buildings.map(record => layer.getValue({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { source_id: record.buildingId } }) ?? 0);
    $('data-total').textContent = `${values.reduce((sum, value) => sum + value, 0).toLocaleString()} linked requests`;
    $('dataset-label').textContent = definition().label.toUpperCase() + ' / BY BUILDING';
    $('data-coverage').textContent = `${values.filter(value => value > 0).length.toLocaleString()} buildings · ${dataset.agency} · ${periodLabel()}`;
    $('data-unmatched').textContent = `Across all housing categories, ${dataset.summary.unmatchedRequests.toLocaleString()} of ${dataset.summary.totalRequests.toLocaleString()} requests could not be assigned to one building.`;
    $('data-scale').replaceChildren();
    for (const item of requestScale(theme).legend.map(item => item.label === 'No data' ? { ...item, label: 'No match' } : item)) {
      const key = node('span', ''); const swatch = node('i', ''); swatch.style.background = item.color;
      key.append(swatch, document.createTextNode(item.label)); $('data-scale').append(key);
    }
  }
  function paint() {
    const color = requestScale(theme);
    layer.setColor(color);
    updateLegend();
  }
  function perspective(three: boolean, resetCamera = false) {
    threeDimensional = three;
    layer.setPerspective(three ? '3d' : '2d');
    if (resetCamera) map.map.easeTo({ center: initial.center, zoom: 14.8, pitch: three ? initial.pitch : 0, bearing: three ? initial.bearing : 0, duration: 700 });
    for (const [id, active] of [['view3d', three], ['view2d', !three]] as const) { $(id).classList.toggle('active', active); $(id).setAttribute('aria-pressed', String(active)); }
  }
  function renderSelection(selection: Selection | null) {
    currentSelection = selection;
    const panel = $('building-info'), body = $('building-info-body');
    panel.hidden = !selection; $('data-legend').hidden = !!selection;
    if (!selection) { $('detail').replaceChildren(node('span', 'EXPLORE THE CITY', 'eyebrow'), node('p', 'Click any building for its details and linked 311 requests.')); return; }
    const p = selection.feature.properties;
    if (!buildingLayers.includes(selection.layerId)) {
      $('building-info-title').textContent = String(p.name ?? 'Place of interest');
      body.replaceChildren(node('p', String(p.category ?? '')));
      $('detail').replaceChildren(node('span', 'SELECTED PLACE', 'eyebrow'), node('p', String(p.name ?? 'Place of interest'))); return;
    }
    const record = records.get(String(p.source_id));
    if (!record && buildingManifest && !uploaded && layer.getResult(selection.feature).status === 'matched') {
      $('building-info-title').textContent = `Building ${p.bin ?? p.source_id}`;
      body.replaceChildren(node('p', 'Loading building details…'));
      const bucket = Number(p.source_id) % 128;
      let pending = detailCache.get(bucket);
      if (!pending) {
        pending = readJSON(`city/details/${bucket}.json`).then(value => { for (const item of value as BuildingRecord[]) records.set(item.buildingId, item); });
        detailCache.set(bucket, pending);
      }
      void pending.then(() => {
        if (currentSelection?.feature.properties.source_id === p.source_id) {
          if (records.has(String(p.source_id))) renderSelection(currentSelection);
          else body.replaceChildren(node('p', 'Building details are unavailable.'));
        }
      }).catch(() => { detailCache.delete(bucket); if (currentSelection?.feature.properties.source_id === p.source_id) body.replaceChildren(node('p', 'Could not load building details. Select the building to retry.')); });
      return;
    }
    $('building-info-title').textContent = record?.addresses[0] ?? `Building ${p.bin ?? p.source_id}`;
    const selectedCount = layer.getValue(selection.feature);
    $('detail').replaceChildren(node('span', 'SELECTED BUILDING', 'eyebrow'), node('p', record ? `${(selectedCount ?? 0).toLocaleString()} linked ${definition().label.toLowerCase()}` : 'No linked 311 requests in this sample.'));
    const count = node('div', selectedCount === null ? '—' : selectedCount.toLocaleString(), 'building-request-count');
    body.replaceChildren(count, node('p', `${dataset.agency} · ${definition().label} · ${periodLabel()}`, 'info-muted'));
    const facts = node('dl', '');
    for (const [label, value] of [['Roof height', p.height_m == null ? 'Unavailable' : `${Number(p.height_m).toFixed(1)} m`], ['Building ID (BIN)', p.bin ?? 'Unavailable'], ['Tax lot (BBL)', p.base_bbl ?? 'Unavailable']]) facts.append(node('dt', String(label)), node('dd', String(value)));
    body.append(facts);
    if (record) {
      body.append(node('h3', 'All housing categories'));
      const list = node('ul', '', 'request-categories');
      for (const [category, count] of Object.entries(record.categories).sort((a, b) => b[1] - a[1])) { const item = node('li', ''); item.append(node('span', category), node('strong', count.toLocaleString())); list.append(item); }
      body.append(list, node('h3', 'All housing requests · status at refresh'), node('p', Object.entries(record.statuses).map(([status, count]) => `${status}: ${count}`).join(' · '), 'info-muted'));
      body.append(node('h3', 'All housing requests · matching'), node('p', record.matchMethods.footprint_within_lot ? `${record.matchMethods.footprint_within_lot} by a point inside this footprint on the same tax lot; ${record.matchMethods.single_building_lot} by a tax lot with one footprint.` : 'Matched by tax-lot ID to a lot containing exactly one building footprint.', 'info-muted'));
      if (record.addresses.length > 1) body.append(node('p', `Other reported addresses: ${record.addresses.slice(1).join('; ')}`, 'info-muted'));
      if (record.latestCreatedAt) body.append(node('p', `Latest request: ${record.latestCreatedAt.slice(0, 10)}`, 'info-muted'));
    } else body.append(node('p', 'No requests were linked to this footprint in the selected extract. This does not establish that no requests exist.', 'info-muted'));
    body.append(node('p', 'Requests are reports, not confirmed violations or a building-quality rating.', 'info-muted'));
    const source = node('a', 'View NYC 311 source ↗'); source.href = 'https://data.cityofnewyork.us/d/erm2-nwe9'; source.target = '_blank'; source.rel = 'noopener'; body.append(source);
  }
  await map.ready;
  const selector = $<HTMLSelectElement>('dataset-select');
  selector.replaceChildren(...datasetDefinitions(`./data/${datasetFile}`, theme).map(d => { const option = node('option', d.label); option.value = d.id; return option; }));
  selector.onchange = async () => {
    selector.disabled = true;
    try { await layer.setDataset(selector.value); activeId = layer.active; paint(); if (currentSelection) renderSelection(currentSelection); }
    catch (error) { selector.value = layer.active; $('status').textContent = String(error); }
    finally { selector.disabled = false; }
  };
  updateLegend(); $('status').textContent = 'Local data. No API key required.';
  for (const name of ['blueprint', 'paper'] as ThemeName[]) $(name).onclick = () => {
    theme = name; map.setTheme(name); paint(); document.documentElement.dataset.theme = name;
    for (const choice of ['blueprint', 'paper']) { $(choice).classList.toggle('active', name === choice); $(choice).setAttribute('aria-pressed', String(name === choice)); }
  };
  $('buildings').onchange = () => layer.setVisible($<HTMLInputElement>('buildings').checked);
  for (const id of ['streets', 'places']) $(id).onchange = () => map.setVisible(id, $<HTMLInputElement>(id).checked);
  $('view3d').onclick = () => perspective(true); $('view2d').onclick = () => perspective(false);
  $('reset').onclick = () => perspective(threeDimensional, true);
  $('close-building').onclick = () => { map.clearSelection(); map.map.getCanvas().focus(); };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') map.clearSelection(); });
  map.on('select', renderSelection);
  if (streetTiles) {
    let controller: AbortController | undefined;
    map.map.on('moveend', () => {
      controller?.abort(); controller = new AbortController();
      if (map.map.getZoom() < detailZoom) return;
      const signal = controller.signal;
      void streetTiles!.load(viewportBounds(), signal).then(fc => { if (!signal.aborted) map.setData('streets', fc); }).catch(error => { if (!signal.aborted) $('status').textContent = String(error); });
    });
  }
  $('load-json').onclick = () => $<HTMLInputElement>('json-file').click();
  $<HTMLInputElement>('json-file').onchange = async event => {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Choose a building JSON file smaller than 50 MB.');
      const parsed: BuildingDataset = parseBuildingDataset(JSON.parse(await file.text()), buildingManifest ? undefined : skyline, geometryVersion);
      dataset = parsed; uploaded = true; records.clear();
      for (const record of parsed.buildings) records.set(record.buildingId, record);
      await layer.replaceDatasets(definitions(), activeId);
      paint(); if (currentSelection) renderSelection(currentSelection);
      $('status').textContent = `Loaded ${file.name}`; $('json-error').hidden = true;
    } catch (error) { $('json-error').hidden = false; $('json-error').textContent = error instanceof Error ? error.message : String(error); }
    finally { input.value = ''; }
  };
}
start().catch(error => { $('status').textContent = 'Map unavailable'; $('map-error').hidden = false; $('map-error').textContent = error instanceof Error ? error.message : String(error); });
