import { createMap } from 'blocklight';
import 'blocklight/style.css';

createMap({
  container: '#map',
  center: [-73.9815, 40.7548], zoom: 16,
  buildings: new URL('./data/buildings.geojson', import.meta.url).href,
  controls: ['perspective'],
  details: { fields: [{ key: 'height_m', label: 'Height (m)' }] },
});
