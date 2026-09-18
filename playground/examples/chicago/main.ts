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
  url: new URL('./data/attributes.json', import.meta.url).href,
  join: { feature: 'building_id', record: 'id' },
};
const datasets: DatasetDefinition[] = [
  { id: 'year', label: 'Year built', data: { ...data, aggregate: { op: 'sum', field: 'year' } },
    color: steppedScale('value', [{ value: 1800, color: '#bd7657' }, { value: 1950, color: '#e8c98a' }, { value: 2000, color: '#91c9ca' }]) },
  { id: 'floors', label: 'Reported stories', data: { ...data, aggregate: { op: 'sum', field: 'floors' } },
    color: steppedScale('value', [{ value: 0, color: '#7897b6' }, { value: 10, color: '#91c9ca' }, { value: 30, color: '#3989ad' }]) },
];
const city = createCityMap({ container: 'map', center: [-87.6315, 41.884], zoom: 16, pitch: 57 });
try {
  const layer = await addBuildingDatasets(city, {
    source: new URL('./data/buildings.geojson', import.meta.url).href,
    datasets, detailZoom: 14, featureId: 'building_id', attribution: 'City of Chicago · building footprints',
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
  status.textContent = 'Ready · historical records; heights estimated as stories × 3 m';
} catch (error) { status.textContent = String(error); }
window.addEventListener('pagehide', () => city.destroy(), { once: true });
