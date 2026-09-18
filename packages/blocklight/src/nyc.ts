import type { City } from './map.js';
/** Geographic defaults only; this module never fetches data or imposes a provider. */
export const nyc: City = {
  id: 'nyc',
  name: 'New York City',
  center: [-73.9815, 40.7548],
  zoom: 15.1,
  bounds: [[-74.35, 40.44], [-73.65, 40.94]],
};
