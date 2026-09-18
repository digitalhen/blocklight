import 'maplibre-gl/dist/maplibre-gl.css';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createCityMap, addBuildingDatasets, steppedScale, type DatasetDefinition } from 'blocklight';

setWorkerUrl(workerUrl);
const select = document.querySelector<HTMLSelectElement>('#dataset')!;
const view = document.querySelector<HTMLButtonElement>('#view')!;
const details = document.querySelector<HTMLParagraphElement>('#details')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const data = {
  url: new URL('./data/requests.json', import.meta.url).href,
  join: { feature: 'source_id', record: 'buildingId' },
};
const datasets: DatasetDefinition[] = [
  { id: 'housing', label: 'Housing requests', data: { ...data, aggregate: { op: 'sum', field: 'count' } },
    color: steppedScale('value', [{ value: 0, color: '#7897b6' }, { value: 5, color: '#e8c98a' }, { value: 20, color: '#bc6447' }]) },
  { id: 'plumbing', label: 'Plumbing requests', data: { ...data, aggregate: { op: 'sum', field: 'plumbing' } },
    color: steppedScale('value', [{ value: 0, color: '#26354d' }, { value: 1, color: '#91c9ca' }, { value: 5, color: '#3989ad' }]) },
];
const city = createCityMap({ container: 'map', center: [-73.9815, 40.7548], zoom: 16, pitch: 57 });
try {
  const layer = await addBuildingDatasets(city, {
    source: new URL('./data/buildings.geojson', import.meta.url).href,
    datasets, detailZoom: 14, attribution: 'NYC Open Data · 2025 HPD requests',
    onError: error => { status.textContent = error.message; },
  });
  const renderDetails = () => {
    const selection = city.getSelection();
    const result = layer.getResult(selection?.feature);
    details.textContent = !selection ? 'Click a building' : result.status === 'matched'
      ? `${result.value} ${datasets.find(d => d.id === layer.active)!.label.toLowerCase()}`
      : `No matched record (${result.status})`;
  };
  city.on('select', renderDetails);
  select.replaceChildren(...datasets.map(d => new Option(d.label, d.id)));
  select.disabled = false;
  select.onchange = async () => {
    select.disabled = true;
    try { await layer.setDataset(select.value); renderDetails(); }
    catch (error) { select.value = layer.active; status.textContent = String(error); }
    finally { select.disabled = false; }
  };
  let three = true;
  view.disabled = false;
  view.onclick = () => { three = !three; layer.setPerspective(three ? '3d' : '2d'); view.textContent = three ? 'Show 2D' : 'Show 3D'; };
  status.textContent = 'Ready · requests are reports, not confirmed violations';
} catch (error) { status.textContent = String(error); }
window.addEventListener('pagehide', () => city.destroy(), { once: true });
