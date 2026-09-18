import { createMap, defineMapDataset, type ColorScale, type Selection, type ThemeName } from 'blocklight';
import { cities } from './cities.js';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className?: string) {
  const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el;
}
export async function startCity(id: string) {
  const city = cities[id];
  const base = `./data/cities/${id}/`;
  const [provenance, attributes, datasets] = await Promise.all(['source.json', 'attributes.json', 'datasets.json'].map(async name => {
    const response = await fetch(base + name); if (!response.ok) throw new Error(`Could not load ${city.name} ${name} (${response.status})`); return response.json();
  }));
  $('city-name').textContent = city.name.toUpperCase(); $('coverage-name').textContent = city.coverage;
  $('city-description').textContent = `${city.name} · ${city.period} · downtown extract`;
  $('layer-coverage').textContent = 'Downtown extract'; $('dataset-period').textContent = city.period;
  $('map-coordinates').textContent = `${Math.abs(city.center[1]).toFixed(4)}° N  ${Math.abs(city.center[0]).toFixed(4)}° W`;
  for (const name of ['streets', 'places']) $(name).closest('label')!.hidden = true;
  $('load-json').hidden = true;
  $<HTMLAnchorElement>('download-json').href = base + 'datasets.json';
  const source = $<HTMLAnchorElement>('data-source'); source.href = city.source; source.textContent = city.sourceLabel + ' ↗';
  $('data-note').textContent = city.note;
  $('dataset-label').textContent = city.period.toUpperCase();
  $('data-total').textContent = 'Loading buildings…';
  const records = new Map<string, Record<string, unknown>>((attributes as Record<string, unknown>[]).map(r => [String(r.id), r]));
  let active = city.datasets[0].id, three = true;
  const definitions = city.datasets.map(defineMapDataset);
  const app = createMap({
    container: '#map', center: city.center, zoom: city.zoom, pitch: 57, bearing: -25,
    mapOptions: { minZoom: 12, maxZoom: 18.5, maxBounds: [[city.bounds[0] - .01, city.bounds[1] - .01], [city.bounds[2] + .01, city.bounds[3] + .01]] },
    controls: [], details: false,
    buildings: { source: base + 'buildings.geojson', featureId: 'building_id', detailZoom: 14, attribution: `${city.sourceLabel} · ${id === 'seattle' ? 'Seattle GIS · 2023 outlines' : 'historical attributes'}` },
    datasets: city.datasets.map(d => ({ ...d, source: datasets })),
    onError: error => { $('status').textContent = error.message; },
  });
  const map = app.engine; (window as unknown as { blocklight: typeof map }).blocklight = map;
  await app.ready;
  const layer = app.datasetController!;
  const selector = $<HTMLSelectElement>('dataset-select');
  selector.replaceChildren(...city.datasets.map(d => new Option(d.label, d.id))); selector.disabled = false;
  function legend() {
    const d = city.datasets.find(d => d.id === active)!;
    const values = (attributes as Record<string, unknown>[]).filter(r => typeof r[d.value!] === 'number').length;
    $('dataset-label').textContent = d.label.toUpperCase();
    $('data-total').textContent = `${values.toLocaleString()} buildings with data`;
    $('data-coverage').textContent = `${provenance.buildings.toLocaleString()} footprints · ${city.coverage.toLowerCase()}`;
    $('count').textContent = `${provenance.buildings.toLocaleString()} buildings · downtown extract`;
    $('data-unmatched').textContent = id === 'seattle'
      ? `${provenance.excludedRecords} of ${provenance.candidateRecords} reporting properties excluded: ambiguous matches, multiple buildings, or flagged reports. Unmatched buildings are shown as no data.`
      : 'Joined by the original building ID. Missing or invalid values are shown as no data.';
    $('data-scale').replaceChildren(...(definitions.find(d => d.id === active)!.color as ColorScale).legend.map(item => {
      const key = node('span', item.label), swatch = node('i', ''); swatch.style.background = item.color; key.prepend(swatch); return key;
    }));
  }
  function details(selection: Selection | null) {
    $('building-info').hidden = !selection; $('data-legend').hidden = !!selection;
    if (!selection) { $('detail').replaceChildren(node('span', 'EXPLORE THE CITY', 'eyebrow'), node('p', 'Click a building to explore its data.')); return; }
    const result = layer.getResult(selection.feature);
    const record = records.get(String(selection.feature.properties.building_id)) ?? {};
    $('building-info-title').textContent = String(record.name ?? `Building ${selection.feature.properties.building_id}`);
    const dataset = city.datasets.find(d => d.id === active)!;
    const value = result.status === 'matched' ? result.value?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—' : '—';
    $('detail').replaceChildren(node('span', 'SELECTED BUILDING', 'eyebrow'), node('p', result.status === 'matched' ? `${value} · ${dataset.label}` : 'No matched value in this extract.'));
    const body = $('building-info-body'); body.replaceChildren(node('div', value, 'building-request-count'), node('p', dataset.label, 'info-muted'));
    const facts = node('dl', '');
    for (const field of city.fields) facts.append(node('dt', field.label), node('dd', record[field.key] == null ? 'Unavailable' : String(record[field.key])));
    body.append(facts, node('p', city.note, 'info-muted'));
    if (result.status !== 'matched') body.append(node('p', 'No safely matched value. This does not mean zero use, zero emissions, or an empty building.', 'info-muted'));
    const link = node('a', 'View public source ↗'); link.href = city.source; link.target = '_blank'; link.rel = 'noopener'; body.append(link);
  }
  selector.onchange = async () => {
    selector.disabled = true;
    try { await app.setDataset(selector.value); active = selector.value; legend(); details(map.getSelection()); }
    catch (error) { selector.value = active; $('status').textContent = String(error); }
    finally { selector.disabled = false; }
  };
  function perspective(value: boolean) {
    three = value; app.setPerspective(three ? '3d' : '2d');
    for (const [id, selected] of [['view3d', three], ['view2d', !three]] as const) { $(id).classList.toggle('active', selected); $(id).setAttribute('aria-pressed', String(selected)); }
  }
  $('view3d').onclick = () => perspective(true); $('view2d').onclick = () => perspective(false);
  $('reset').onclick = () => { perspective(three); map.map.easeTo({ center: city.center, zoom: city.zoom, pitch: three ? 57 : 0, bearing: three ? -25 : 0 }); };
  for (const theme of ['blueprint', 'paper'] as ThemeName[]) $(theme).onclick = () => {
    app.setTheme(theme); document.documentElement.dataset.theme = theme;
    for (const name of ['blueprint', 'paper']) { $(name).classList.toggle('active', name === theme); $(name).setAttribute('aria-pressed', String(name === theme)); }
  };
  $('buildings').onchange = () => layer.setVisible($<HTMLInputElement>('buildings').checked);
  $('close-building').onclick = () => { map.clearSelection(); map.map.getCanvas().focus(); };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') map.clearSelection(); });
  map.on('select', details); legend(); details(null);
  $('status').textContent = `${city.name} ready · downtown extract · click a building`;
}
