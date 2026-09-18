import type { MapDataset } from 'blocklight';

export interface ShowcaseCity {
  name: string;
  center: [number, number];
  bounds: [number, number, number, number];
  zoom: number;
  coverage: string;
  period: string;
  source: string;
  sourceLabel: string;
  note: string;
  fields: { key: string; label: string }[];
  datasets: MapDataset[];
}
const attributes = (city: string) => `./data/cities/${city}/datasets.json`;
const join = { building: 'building_id', record: 'id', unique: true };
export const cities: Record<string, ShowcaseCity> = {
  chicago: {
    name: 'Chicago', center: [-87.6315, 41.884], bounds: [-87.648, 41.867, -87.615, 41.899], zoom: 15,
    coverage: 'DOWNTOWN EXTRACT', period: 'Building history',
    source: 'https://data.cityofchicago.org/d/syp8-uezg', sourceLabel: 'City of Chicago · Building footprints',
    note: 'Historical source attributes, not verified current conditions. Heights estimated as stories × 3 m; unknown heights stay flat.',
    fields: [{ key: 'year', label: 'Year built' }, { key: 'floors', label: 'Reported stories' }],
    datasets: [
      { id: 'year', label: 'Year built', source: attributes('chicago'), join, records: 'year', value: 'year', colors: 'amber', breaks: [1800, 1950, 2000] },
      { id: 'floors', label: 'Reported stories', source: attributes('chicago'), join, records: 'floors', value: 'floors', colors: 'teal', breaks: [0, 10, 30] },
    ],
  },
  seattle: {
    name: 'Seattle', center: [-122.3355, 47.6095], bounds: [-122.353, 47.595, -122.321, 47.623], zoom: 15,
    coverage: 'DOWNTOWN EXTRACT', period: 'Energy · 2024',
    source: 'https://data.seattle.gov/d/teqw-tu6e', sourceLabel: 'City of Seattle · Energy benchmarking',
    note: '2024 self-reported data; 2023 outlines. Energy use depends on property use. Heights estimated from reported floors; unknown heights stay flat.',
    fields: [{ key: 'address', label: 'Address' }, { key: 'use', label: 'Property use' }, { key: 'reportingYear', label: 'Reporting year' }, { key: 'eui', label: 'Site energy (kBtu/ft²/year)' }, { key: 'ghg', label: 'Emissions (kgCO₂e/ft²/year)' }, { key: 'floors', label: 'Reported floors' }, { key: 'match', label: 'Building match' }],
    datasets: [
      { id: 'energy', label: 'Site energy · kBtu/ft²/year', source: attributes('seattle'), join, records: 'eui', value: 'eui', colors: 'amber', breaks: [0, 50, 100] },
      { id: 'emissions', label: 'Emissions · kgCO₂e/ft²/year', source: attributes('seattle'), join, records: 'ghg', value: 'ghg', colors: 'rose', breaks: [0, 2, 5] },
    ],
  },
};
