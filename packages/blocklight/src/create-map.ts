import { getWorkerUrl, setWorkerUrl } from 'maplibre-gl';
import { createCityMap, type CityMapOptions, type TerrainOptions } from './map.js';
import { addBuildingView, type BuildingViewOptions, type BuildingViewState, type GeometrySource } from './building-view.js';
import { addBuildingDatasets, type DatasetDefinition, type DatasetConfig } from './dataset.js';
import { steppedScale, type ColorScale } from './scales.js';
import { resolveTheme, type ThemeName, type Theme } from './themes.js';

export interface MapDataset {
  id: string;
  label: string;
  source: unknown;
  records?: string;
  join: { building: string; record: string; multiplicity?: string; unique?: boolean };
  /** Sum this field; omit to count records. */
  value?: string;
  missing?: 0;
  property?: string;
  colors?: 'amber' | 'teal' | 'rose' | ColorScale;
  breaks?: number[];
  description?: string;
}
export interface MapDetails {
  title?: string;
  fields?: (string | { key: string; label: string })[];
  datasets?: boolean;
  note?: string;
}
export interface MapConfig extends CityMapOptions {
  buildings: GeometrySource | Omit<BuildingViewOptions, 'transform' | 'signal'>;
  datasets?: MapDataset[];
  activeDataset?: string;
  controls?: readonly ('datasets' | 'perspective' | 'terrain' | 'legend')[];
  details?: MapDetails | false;
  /** Override the bundled worker URL for deployments with a custom asset pipeline. */
  workerUrl?: string;
  onError?: (error: Error) => void;
}
const palettes = {
  amber: ['#7897b6', '#e8c98a', '#bc6447'],
  teal: ['#7897b6', '#91c9ca', '#3989ad'],
  rose: ['#7897b6', '#df9bba', '#b74878'],
};
function at(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined, value);
}
/** Convert a portable dataset configuration to the lower-level join definition. */
export function defineMapDataset(dataset: MapDataset): DatasetDefinition {
  const stops = dataset.breaks ?? [0, 5, 20];
  const palette = typeof dataset.colors === 'object' ? undefined : palettes[dataset.colors ?? 'amber'];
  if (palette && stops.length !== palette.length) throw new Error('Named palettes require three increasing breaks. Supply a ColorScale for custom stops.');
  const { building, ...join } = dataset.join;
  const data: DatasetConfig = {
    ...(typeof dataset.source === 'string' ? { url: dataset.source } : { values: dataset.source }),
    records: dataset.records, join: { feature: building, ...join }, property: dataset.property,
    aggregate: dataset.value ? { op: 'sum', field: dataset.value, missing: dataset.missing } : { op: 'count' },
  };
  return { id: dataset.id, label: dataset.label, data, color: typeof dataset.colors === 'object' ? dataset.colors : steppedScale(dataset.property ?? 'value', stops.map((value, i) => ({ value, color: palette![i], label: i === stops.length - 1 ? `${value}+` : `${value}–<${stops[i + 1]}` }))) };
}

/** A building map with dataset controls, selection details, and a bundled renderer worker. */
export function createMap(options: MapConfig) {
  if (typeof document === 'undefined') throw new Error('Create a Blocklight map after mounting its container in the browser.');
  const container = typeof options.container === 'string' ? document.getElementById(options.container) ?? document.querySelector<HTMLElement>(options.container) : options.container;
  if (!container) throw new Error(`Map container not found: ${options.container}`);
  let datasets = options.datasets ?? [];
  let definitions = datasets.map(defineMapDataset);
  if (options.workerUrl) setWorkerUrl(options.workerUrl);
  else if (!getWorkerUrl()) setWorkerUrl(new URL('./worker.js', import.meta.url).href);
  const engine = createCityMap({ ...options, container, pitch: options.pitch ?? 57 });
  const lifetime = new AbortController();
  const root = document.createElement('div'); root.className = 'blocklight-ui'; container.append(root);
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const el = document.createElement(tag); el.textContent = text; return el; };
  const controls = element('div'); controls.className = 'bl-controls'; root.append(controls);
  const status = element('p', 'Loading…'); status.setAttribute('role', 'status'); status.dataset.bl = 'status'; controls.append(status);
  const select = element('select'); select.setAttribute('aria-label', 'Dataset'); select.dataset.bl = 'dataset'; select.disabled = true;
  const view = element('button', 'Show 2D'); view.type = 'button'; view.disabled = true; view.dataset.bl = 'perspective';
  const relief = element('button', 'Hide terrain'); relief.type = 'button'; relief.dataset.bl = 'terrain';
  const legend = element('div'); legend.dataset.bl = 'legend';
  const panel = element('section'); panel.className = 'bl-details'; panel.dataset.bl = 'details'; panel.setAttribute('aria-label', 'Building details'); panel.setAttribute('aria-live', 'polite'); panel.hidden = true; root.append(panel);
  const requested = options.controls ?? ['datasets', 'perspective', 'terrain', 'legend'];
  if (!requested.length && options.details === false) root.hidden = true;
  if (requested.includes('datasets') && definitions.length) controls.append(select);
  if (requested.includes('perspective')) controls.append(view);
  // Only offer the toggle when the caller configured an elevation source to toggle back on.
  if (requested.includes('terrain') && options.terrain) controls.append(relief);
  if (requested.includes('legend')) controls.append(legend);
  let building: Awaited<ReturnType<typeof addBuildingView>> | undefined;
  let data: Awaited<ReturnType<typeof addBuildingDatasets>> | undefined;
  let destroyed = false, switching = 0;
  let perspective: '2d' | '3d' = options.pitch === 0 ? '2d' : '3d';
  /*
   * Terrain belongs to the extruded 3D buildings alone. The 2D plan and the zoomed-out
   * overview are flat fills, and MapLibre drapes flat ground layers through an offscreen
   * texture that visibly blurs and dims them — for no gain, since neither shows elevation.
   * `wanted` is what the caller asked for; `terrainOn` is what is actually installed.
   */
  let wanted: TerrainOptions | null = options.terrain ?? null;
  let terrainOn = !!options.terrain;
  let overview = false;
  const geometry = typeof options.buildings === 'object' && 'source' in options.buildings ? options.buildings : { source: options.buildings as GeometrySource };
  if (geometry.extruded === false) perspective = '2d';
  const report = (value: unknown) => { if (destroyed) return; const error = value instanceof Error ? value : new Error(String(value)); status.textContent = error.message; options.onError?.(error); };
  function render() {
    if (destroyed) return;
    select.replaceChildren(...definitions.map(d => new Option(d.label, d.id)));
    select.value = data?.active ?? ''; select.disabled = !data || switching > 0;
    view.disabled = !building; view.textContent = perspective === '3d' ? 'Show 2D' : 'Show 3D';
    relief.disabled = !building || !terrainFits();
    relief.textContent = wanted ? 'Hide terrain' : 'Show terrain'; relief.setAttribute('aria-pressed', String(!!wanted));
    const active = definitions.find(d => d.id === data?.active);
    legend.replaceChildren();
    if (active) {
      legend.append(element('strong', active.label));
      for (const item of active.color && typeof active.color !== 'string' ? active.color.legend : []) {
        const row = element('span', item.label); const swatch = element('i'); swatch.style.backgroundColor = item.color; row.prepend(swatch); legend.append(row);
      }
      const description = datasets.find(d => d.id === active.id)?.description;
      if (description) legend.append(element('p', description));
    }
    const selection = engine.getSelection();
    panel.hidden = !selection || options.details === false;
    if (!selection || options.details === false || switching) return;
    const details = options.details ?? {};
    const result = data?.getResult(selection.feature);
    const props = { ...selection.feature.properties, ...result?.records[0] };
    const close = element('button', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close building details'); close.onclick = () => { engine.clearSelection(); engine.map.getCanvas().focus(); };
    const title = element('h2', String(at(props, details.title ?? 'address') ?? props.name ?? `Building ${props[geometry.featureId ?? 'source_id'] ?? ''}`));
    panel.replaceChildren(close, title);
    if (active && details.datasets !== false) panel.append(element('p', result?.status === 'matched' ? `${result.value?.toLocaleString()} ${active.label.toLowerCase()}` : `No matched record (${result?.status ?? 'unmatched'})`));
    const facts = element('dl');
    for (const field of details.fields ?? []) {
      const key = typeof field === 'string' ? field : field.key;
      const value = at(props, key);
      facts.append(element('dt', typeof field === 'string' ? field : field.label), element('dd', value == null ? 'Unavailable' : typeof value === 'object' ? JSON.stringify(value) : String(value)));
    }
    panel.append(facts);
    if (details.note) panel.append(element('p', details.note));
  }
  function setTheme(theme: ThemeName | Theme) {
    if (destroyed) throw new Error('Map has been destroyed.');
    engine.setTheme(theme); const colors = resolveTheme(theme);
    root.style.setProperty('--bl-background', colors.background); root.style.setProperty('--bl-ink', colors.ink); root.style.setProperty('--bl-border', colors.boundary);
  }
  setTheme(options.theme ?? 'blueprint');
  const off = engine.on('select', render);
  const offError = engine.on('error', report);
  const ready = (async () => {
    const config = {
      detailZoom: 14, ...geometry, extruded: perspective === '3d', signal: lifetime.signal, onError: report,
      onChange: (state: BuildingViewState) => { overview = state.mode === 'overview'; syncTerrain(); render(); geometry.onChange?.(state); },
    };
    building = definitions.length ? data = await addBuildingDatasets(engine, { ...config, datasets: definitions, active: options.activeDataset }) : await addBuildingView(engine, config);
    if (destroyed) { building.dispose(); return; }
    status.textContent = 'Ready · click a building'; render();
  })();
  void ready.catch(report);
  async function setDataset(id: string) {
    await ready;
    if (destroyed || !data) throw new Error('No active dataset controller.');
    switching++; render();
    try { await data.setDataset(id); }
    finally { switching--; render(); }
  }
  async function replaceDatasets(nextDatasets: MapDataset[], active?: string) {
    await ready;
    if (destroyed || !data) throw new Error('No active dataset controller.');
    const next = nextDatasets.map(defineMapDataset);
    switching++; render();
    try { await data.replaceDatasets(next, active ?? data.active); definitions = next; datasets = nextDatasets; }
    finally { switching--; render(); }
  }
  function setPerspective(value: '2d' | '3d') {
    if (!building || destroyed) throw new Error('Await map.ready before changing perspective.');
    perspective = value;
    /*
     * Changing terrain while a camera ease is running makes MapLibre recompute zoom from the
     * camera's altitude over the mesh, which lurches the view. Drop terrain before the ease
     * starts, and put it back only once the camera has settled.
     */
    if (value === '2d') { syncTerrain(); building.setPerspective(value); }
    else { building.setPerspective(value); engine.map.once('moveend', () => { if (!destroyed) { syncTerrain(); render(); } }); }
    render();
  }
  /** True only while the extruded 3D buildings are the representation on screen. */
  function terrainFits() { return perspective === '3d' && !overview; }
  function syncTerrain() {
    const next = !!wanted && terrainFits();
    if (next === terrainOn) return;
    terrainOn = next;
    engine.setTerrain(next ? wanted : null);
  }
  /** Raise the map onto elevation, or pass null for a flat ground plane. */
  function setTerrain(next: TerrainOptions | null) {
    if (destroyed) throw new Error('Map has been destroyed.');
    wanted = next; syncTerrain(); render();
  }
  select.onchange = () => { void setDataset(select.value).catch(report); };
  view.onclick = () => setPerspective(perspective === '3d' ? '2d' : '3d');
  relief.onclick = () => { if (options.terrain) setTerrain(wanted ? null : options.terrain); };
  root.addEventListener('keydown', event => { if (event.key === 'Escape') engine.clearSelection(); });
  function destroy() { if (destroyed) return; destroyed = true; lifetime.abort(); off(); offError(); root.remove(); window.removeEventListener('pagehide', destroy); engine.destroy(); }
  window.addEventListener('pagehide', destroy);
  engine.map.once('remove', destroy);
  return { engine, ready, get datasetController() { return data; }, get hasTerrain() { return terrainOn; }, setDataset, replaceDatasets, setPerspective, setTerrain, setTheme, getSelection: () => engine.getSelection(), clearSelection: () => engine.clearSelection(), destroy };
}
export type BlocklightMap = ReturnType<typeof createMap>;
