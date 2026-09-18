import 'maplibre-gl/dist/maplibre-gl.css';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createCityMap, addBuildingView } from 'blocklight';

setWorkerUrl(workerUrl);
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const city = createCityMap({
  container: 'map', center: [-73.9815, 40.7548], zoom: 16,
  pitch: 57, theme: 'blueprint',
});
try {
  await addBuildingView(city, {
    source: new URL('./data/buildings.geojson', import.meta.url).href,
    detailZoom: 14,
    attribution: 'NYC Open Data · building footprints',
  });
  status.textContent = 'Ready · zoom out for flat footprints';
} catch (error) { status.textContent = String(error); }
window.addEventListener('pagehide', () => city.destroy(), { once: true });
