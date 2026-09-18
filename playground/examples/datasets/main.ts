import { createMap } from 'blocklight';
import 'blocklight/style.css';

const source = new URL('./data/requests.json', import.meta.url).href;
const join = { building: 'source_id', record: 'buildingId' };

createMap({
  container: '#map',
  center: [-73.9815, 40.7548], zoom: 16,
  buildings: {
    source: new URL('./data/buildings.geojson', import.meta.url).href,
    detailZoom: 14, attribution: 'NYC Open Data · 2025 HPD requests',
  },
  datasets: [
    { id: 'housing', label: 'Housing requests', source, join, value: 'count', colors: 'amber' },
    { id: 'plumbing', label: 'Plumbing requests', source, join, value: 'plumbing', colors: 'teal', breaks: [0, 1, 5] },
  ],
  details: {
    fields: [{ key: 'height_m', label: 'Height (m)' }, 'bin'],
    note: 'Requests are reports, not confirmed violations.',
  },
});
