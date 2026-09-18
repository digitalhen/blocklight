import { createMap } from 'blocklight';
import 'blocklight/style.css';

const source = new URL('./data/attributes.json', import.meta.url).href;
const join = { building: 'building_id', record: 'id' };

createMap({
  container: '#map', center: [-87.6315, 41.884], zoom: 16,
  buildings: {
    source: new URL('./data/buildings.geojson', import.meta.url).href,
    featureId: 'building_id', detailZoom: 14,
    attribution: 'City of Chicago · building footprints',
  },
  datasets: [
    { id: 'year', label: 'Year built', source, join, value: 'year', colors: 'amber', breaks: [1800, 1950, 2000] },
    { id: 'floors', label: 'Reported stories', source, join, value: 'floors', colors: 'teal', breaks: [0, 10, 30] },
  ],
  details: { title: 'name', fields: ['year', 'floors'], note: 'Historical records; heights estimated as stories × 3 m.' },
});
