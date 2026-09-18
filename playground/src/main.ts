import './worker.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { createCityMap, buildingPoints, buildings, lines, polygons, points, createDatasetJoin, type ColorScale, GeoJSONTileLoader, type GeoJSONTileManifest, type Bounds, type ThemeName, type Selection } from 'blocklight';
import { nyc } from 'blocklight/nyc';
import type { FeatureCollection } from 'geojson';
import { parseBuildingDataset, type BuildingDataset } from './building-data.js';
import { datasetDefinitions } from './datasets.js';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const attribution = '<a href="https://opendata.cityofnewyork.us/">NYC Open Data</a>';
const detailZoom = 14;
const buildingLayers = ['buildings', 'footprints', 'building-dots'];
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
  const map = createCityMap({ container: 'map', city: nyc, ...initial, zoom: 14.8, mapOptions: { maxZoom: 18.5, minZoom: 10 } });
  (window as unknown as { blocklight: typeof map }).blocklight = map;
  map.on('error', error => { $('status').textContent = error.message; });
  let buildingTiles: GeoJSONTileLoader | undefined, streetTiles: GeoJSONTileLoader | undefined;
  let geometryVersion: string | undefined;
  let datasetFile = '311-buildings.json';
  const cityResponse = await fetch('./data/city.json');
  if (cityResponse.ok && cityResponse.headers.get('content-type')?.includes('application/json')) {
    const city = await cityResponse.json();
    const manifestURL = new URL('./data/city-buildings.json', location.href).href;
    const [buildingManifest, streetManifest] = await Promise.all([readJSON('city-buildings.json'), readJSON('city-streets.json')]) as [GeoJSONTileManifest, GeoJSONTileManifest];
    buildingTiles = new GeoJSONTileLoader(buildingManifest, manifestURL);
    streetTiles = new GeoJSONTileLoader(streetManifest, new URL('./data/city-streets.json', location.href).href);
    geometryVersion = city.geometryVersion; datasetFile = '311-citywide.json';
  } else if (!cityResponse.ok && cityResponse.status !== 404) throw new Error(`Could not load city metadata (${cityResponse.status}).`);
  function viewportBounds(): Bounds {
    const bounds = map.map.getBounds(); return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  }
  const [land, places] = await Promise.all(['land', 'places'].map(async name => await readJSON(`${name}.geojson`) as FeatureCollection));
  let [skyline, streets] = await Promise.all([
    buildingTiles ? buildingTiles.load(viewportBounds()) : readJSON('buildings.geojson') as Promise<FeatureCollection>,
    streetTiles ? streetTiles.load(viewportBounds()) : readJSON('streets.geojson') as Promise<FeatureCollection>,
  ]);
  let dataset = parseBuildingDataset(await readJSON(datasetFile), buildingTiles ? undefined : skyline, geometryVersion);
  $<HTMLAnchorElement>('download-json').href = `./data/${datasetFile}`;
  $('coverage-name').textContent = buildingTiles ? 'ALL FIVE BOROUGHS' : 'MIDTOWN SAMPLE';
  $('layer-coverage').textContent = buildingTiles ? 'Citywide' : 'NYC sample';
  $('street-coverage').textContent = buildingTiles ? 'All five boroughs' : 'Manhattan centerlines';
  const overview = buildingTiles ? await readJSON('city-overview.geojson') as FeatureCollection : buildingPoints(skyline);
  let records = new Map(dataset.buildings.map(record => [record.buildingId, record]));
  let currentSelection: Selection | null = null;
  let transferringSelection = false;
  let theme: ThemeName = 'blueprint', threeDimensional = true;
  let activeId = 'housing';
  const definition = () => datasetDefinitions(`./data/${datasetFile}`, theme).find(d => d.id === activeId)!;
  const requestScale = (_theme: ThemeName) => definition().color as ColorScale;
  let join = createDatasetJoin(dataset, definition().data);
  const decorated = join.decorate(skyline);
  map.addLayer(polygons({ id: 'land', source: land, interactive: false, attribution }))
    .addLayer(lines({ id: 'streets', source: streets, interactive: false, width: 1.3, attribution }))
    .addLayer(buildings({ id: 'footprints', source: decorated, promoteId: 'source_id', attribution, minzoom: detailZoom, extruded: false, visible: false, color: requestScale(theme) }))
    .addLayer(buildings({ id: 'buildings', source: decorated, promoteId: 'source_id', attribution, minzoom: detailZoom, color: requestScale(theme) }))
    .addLayer(points({ id: 'building-dots', source: join.decorate(overview), promoteId: 'source_id', maxzoom: detailZoom, color: requestScale(theme), radius: ['interpolate', ['linear'], ['zoom'], 10, 1.7, 14, 3.3] }))
    .addLayer(points({ id: 'places', source: places, radius: 6 }));
  function updateBuildingCount() { $('count').textContent = buildingTiles ? `${skyline.features.length.toLocaleString()} loaded · ${buildingTiles.manifest.featureCount.toLocaleString()} citywide` : `${skyline.features.length.toLocaleString()} buildings · roof heights in meters`; }
  updateBuildingCount();
  function periodLabel() {
    const from = new Date(`${dataset.period.from}T00:00:00Z`);
    const through = new Date(Date.parse(`${dataset.period.toExclusive}T00:00:00Z`) - 86400000);
    const format = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `${format.format(from)} – ${format.format(through)}`;
  }
  function updateLegend() {
    const values = dataset.buildings.map(record => activeId === 'housing' ? record.count : record.categories[activeId === 'heat' ? 'HEAT/HOT WATER' : 'PLUMBING'] ?? 0);
    $('data-total').textContent = `${values.reduce((sum, value) => sum + value, 0).toLocaleString()} linked requests`;
    $('dataset-label').textContent = definition().label.toUpperCase() + ' / BY BUILDING';
    $('data-coverage').textContent = `${values.filter(value => value > 0).length.toLocaleString()} buildings · ${dataset.agency} · ${periodLabel()}`;
    $('data-unmatched').textContent = `Across all housing categories, ${dataset.summary.unmatchedRequests.toLocaleString()} of ${dataset.summary.totalRequests.toLocaleString()} requests could not be assigned to one building.`;
    $('data-scale').replaceChildren();
    for (const item of requestScale(theme).legend.slice(0, -1)) {
      const key = node('span', ''); const swatch = node('i', ''); swatch.style.background = item.color;
      key.append(swatch, document.createTextNode(item.label)); $('data-scale').append(key);
    }
  }
  function paint() {
    const color = requestScale(theme);
    map.setColor('footprints', color).setColor('buildings', color).setColor('building-dots', color);
    updateLegend();
  }
  const activeBuildingLayer = () => map.map.getZoom() < detailZoom ? 'building-dots' : threeDimensional ? 'buildings' : 'footprints';
  function showBuildings() {
    const visible = $<HTMLInputElement>('buildings').checked;
    const previous = currentSelection;
    const transfer = visible && previous && buildingLayers.includes(previous.layerId);
    transferringSelection = !!transfer;
    try {
      map.setVisible('buildings', visible && threeDimensional).setVisible('footprints', visible && !threeDimensional).setVisible('building-dots', visible);
    } finally { transferringSelection = false; }
    if (transfer) map.selectFeature(activeBuildingLayer(), previous.feature, previous.lngLat);
  }
  function perspective(three: boolean, resetCamera = false) {
    threeDimensional = three; showBuildings();
    // One transition owns zoom, center, pitch and bearing. A second easeTo cancels the first.
    map.map.easeTo({ ...(resetCamera ? { center: initial.center, zoom: 14.8 } : {}), pitch: three ? initial.pitch : 0, bearing: three ? initial.bearing : 0, duration: 700 });
    for (const [id, active] of [['view3d', three], ['view2d', !three]] as const) { $(id).classList.toggle('active', active); $(id).setAttribute('aria-pressed', String(active)); }
  }
  function renderSelection(selection: Selection | null) {
    if (transferringSelection && selection === null) return;
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
    $('building-info-title').textContent = record?.addresses[0] ?? `Building ${p.bin ?? p.source_id}`;
    const selectedCount = activeId === 'housing' ? record?.count ?? 0 : record?.categories[activeId === 'heat' ? 'HEAT/HOT WATER' : 'PLUMBING'] ?? 0;
    $('detail').replaceChildren(node('span', 'SELECTED BUILDING', 'eyebrow'), node('p', record ? `${selectedCount.toLocaleString()} linked ${definition().label.toLowerCase()}` : 'No linked 311 requests in this sample.'));
    const count = node('div', `${selectedCount.toLocaleString()}`, 'building-request-count');
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
  selector.onchange = () => {
    activeId = selector.value; join = createDatasetJoin(dataset, definition().data);
    const next = join.decorate(skyline);
    map.setData('footprints', next, { preserveSelection: true }).setData('buildings', next, { preserveSelection: true });
    map.setData('building-dots', join.decorate(overview), { preserveSelection: true });
    paint();
    if (currentSelection) renderSelection(currentSelection);
  };
  updateLegend(); $('status').textContent = 'Local data. No API key required.';
  for (const name of ['blueprint', 'paper'] as ThemeName[]) $(name).onclick = () => {
    theme = name; map.setTheme(name); paint(); document.documentElement.dataset.theme = name;
    for (const choice of ['blueprint', 'paper']) { $(choice).classList.toggle('active', name === choice); $(choice).setAttribute('aria-pressed', String(name === choice)); }
  };
  map.map.on('zoomend', showBuildings);
  $('buildings').onchange = showBuildings;
  for (const id of ['streets', 'places']) $(id).onchange = () => map.setVisible(id, $<HTMLInputElement>(id).checked);
  $('view3d').onclick = () => perspective(true); $('view2d').onclick = () => perspective(false);
  $('reset').onclick = () => perspective(threeDimensional, true);
  $('close-building').onclick = () => { map.clearSelection(); map.map.getCanvas().focus(); };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') map.clearSelection(); });
  map.on('select', renderSelection);
  let viewportSequence = 0;
  let viewportAbort: AbortController | undefined;
  let lastTileBounds = '';
  async function refreshViewport() {
    if (map.map.getZoom() < detailZoom) {
      viewportAbort?.abort(); ++viewportSequence; lastTileBounds = '';
      $('count').textContent = `${overview.features.length.toLocaleString()} building dots${buildingTiles ? ' · citywide sample' : ''}`;
      $('status').textContent = 'Overview · building dots · zoom in for shapes';
      return;
    }
    if (!buildingTiles || !streetTiles) return;
    const bounds = viewportBounds();
    const key = bounds.map(n => n.toFixed(4)).join(',');
    if (key === lastTileBounds) return;
    lastTileBounds = key;
    viewportAbort?.abort(); viewportAbort = new AbortController();
    const sequence = ++viewportSequence;
    try {
      $('status').textContent = 'Loading this part of the city…';
      const [nextBuildings, nextStreets] = await Promise.all([buildingTiles.load(bounds, viewportAbort.signal), streetTiles.load(bounds, viewportAbort.signal)]);
      if (sequence !== viewportSequence) return;
      const previous = currentSelection;
      transferringSelection = true;
      try {
        skyline = nextBuildings; streets = nextStreets;
        const decorated = join.decorate(skyline);
        map.setData('footprints', decorated).setData('buildings', decorated).setData('streets', streets);
      } finally { transferringSelection = false; }
      if (previous && buildingLayers.includes(previous.layerId) && $<HTMLInputElement>('buildings').checked) map.selectFeature(activeBuildingLayer(), previous.feature, previous.lngLat);
      updateBuildingCount(); $('status').textContent = 'Citywide data · loaded for this view.';
    } catch (error) {
      if (sequence !== viewportSequence || viewportAbort.signal.aborted) return;
      lastTileBounds = '';
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Zoom in')) {
        const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
        const previous = currentSelection; transferringSelection = true;
        try { map.setData('footprints', empty).setData('buildings', empty).setData('streets', empty); }
        finally { transferringSelection = false; }
        if (previous) renderSelection(previous);
      }
      $('status').textContent = message;
    }
  }
  map.map.on('moveend', () => { void refreshViewport(); });
  $('load-json').onclick = () => $<HTMLInputElement>('json-file').click();
  $<HTMLInputElement>('json-file').onchange = async event => {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Choose a building JSON file smaller than 50 MB.');
      const parsed: BuildingDataset = parseBuildingDataset(JSON.parse(await file.text()), buildingTiles ? undefined : skyline, geometryVersion);
      dataset = parsed; join = createDatasetJoin(dataset, definition().data); records = new Map(dataset.buildings.map(record => [record.buildingId, record]));
      const next = join.decorate(skyline);
      map.setData('footprints', next).setData('buildings', next).setData('building-dots', join.decorate(overview)); paint();
      $('status').textContent = `Loaded ${file.name}`; $('json-error').hidden = true;
    } catch (error) { $('json-error').hidden = false; $('json-error').textContent = error instanceof Error ? error.message : String(error); }
    finally { input.value = ''; }
  };
}
start().catch(error => { $('status').textContent = 'Map unavailable'; $('map-error').hidden = false; $('map-error').textContent = error instanceof Error ? error.message : String(error); });
