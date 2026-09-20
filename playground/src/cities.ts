import type { MapDataset } from 'blocklight';

export interface ShowcaseCity {
  name: string;
  center: [number, number];
  bounds: [number, number, number, number];
  zoom: number;
  coverage: string;
  /** Sentence-case form of `coverage` for running text; proper nouns keep their capitals. */
  extract: string;
  period: string;
  source: string;
  sourceLabel: string;
  attribution: string;
  unmatched: string;
  note: string;
  fields: { key: string; label: string }[];
  datasets: MapDataset[];
}
const attributes = (city: string) => `./data/cities/${city}/datasets.json`;
const join = { building: 'building_id', record: 'id', unique: true };
export const cities: Record<string, ShowcaseCity> = {
  chicago: {
    name: 'Chicago', center: [-87.6315, 41.884], bounds: [-87.648, 41.867, -87.615, 41.899], zoom: 15,
    coverage: 'DOWNTOWN EXTRACT', period: 'Building history', extract: 'downtown extract',
    source: 'https://data.cityofchicago.org/d/syp8-uezg', sourceLabel: 'City of Chicago · Building footprints',
    attribution: 'City of Chicago · Building footprints · historical attributes',
    unmatched: 'Joined by the original building ID. Missing or invalid values are shown as no data.',
    note: 'Historical source attributes, not verified current conditions. Heights estimated as stories × 3 m; unknown heights stay flat.',
    fields: [{ key: 'year', label: 'Year built' }, { key: 'floors', label: 'Reported stories' }],
    datasets: [
      { id: 'year', label: 'Year built', source: attributes('chicago'), join, records: 'year', value: 'year', colors: 'amber', breaks: [1800, 1950, 2000] },
      { id: 'floors', label: 'Reported stories', source: attributes('chicago'), join, records: 'floors', value: 'floors', colors: 'teal', breaks: [0, 10, 30] },
    ],
  },
  seattle: {
    name: 'Seattle', center: [-122.3355, 47.6095], bounds: [-122.353, 47.595, -122.321, 47.623], zoom: 15,
    coverage: 'DOWNTOWN EXTRACT', period: 'Energy · 2024', extract: 'downtown extract',
    source: 'https://data.seattle.gov/d/teqw-tu6e', sourceLabel: 'City of Seattle · Energy benchmarking',
    attribution: 'City of Seattle · Energy benchmarking · Seattle GIS · 2023 outlines',
    unmatched: '{excludedRecords} of {candidateRecords} reporting properties excluded: ambiguous matches, multiple buildings, or flagged reports. Unmatched buildings are shown as no data.',
    note: '2024 self-reported data; 2023 outlines. Energy use depends on property use. Heights estimated from reported floors; unknown heights stay flat.',
    fields: [{ key: 'address', label: 'Address' }, { key: 'use', label: 'Property use' }, { key: 'reportingYear', label: 'Reporting year' }, { key: 'eui', label: 'Site energy (kBtu/ft²/year)' }, { key: 'ghg', label: 'Emissions (kgCO₂e/ft²/year)' }, { key: 'floors', label: 'Reported floors' }, { key: 'match', label: 'Building match' }],
    datasets: [
      { id: 'energy', label: 'Site energy · kBtu/ft²/year', source: attributes('seattle'), join, records: 'eui', value: 'eui', colors: 'amber', breaks: [0, 50, 100] },
      { id: 'emissions', label: 'Emissions · kgCO₂e/ft²/year', source: attributes('seattle'), join, records: 'ghg', value: 'ghg', colors: 'rose', breaks: [0, 2, 5] },
    ],
  },
  atlanta: {
    name: 'Atlanta', center: [-84.385, 33.769], bounds: [-84.4, 33.748, -84.37, 33.79], zoom: 14.4,
    coverage: 'DOWNTOWN & MIDTOWN EXTRACT', period: 'Permits · 2019-2024', extract: 'downtown and Midtown extract',
    source: 'https://dpcd-coaplangis.opendata.arcgis.com/datasets/655f985f43cc40b4bf2ab7bc73d2169b',
    sourceLabel: 'City of Atlanta · Building permits 2019-2024',
    attribution: 'City of Atlanta permits · footprints © OpenStreetMap contributors, ODbL, via Overture Maps',
    unmatched: '{withoutData} of {buildings} footprints have no matched permit for this measure and are shown as no data, never as zero. {permitsUnmatched} of {permitsInExtract} permits in the extract stayed unmatched: imprecise geocodes, points outside every footprint, or points inside overlapping footprints.',
    note: 'Permits are applications and approvals recorded by the City of Atlanta, not construction that happened, and not a building-quality score. A permit joins a footprint only when its geocode resolved to a specific address and its point falls inside exactly one footprint. Heights come from Overture Maps for the 3D view; their provenance is shown per building.',
    fields: [{ key: 'class', label: 'Building class' }, { key: 'permits', label: 'Permits 2019-2024' }, { key: 'newConstruction', label: 'New construction' }, { key: 'alteration', label: 'Alteration and other' }, { key: 'demolition', label: 'Demolition' }, { key: 'topType', label: 'Most common record type' }, { key: 'latestPermit', label: 'Latest permit opened' }, { key: 'height', label: 'Height (m)' }, { key: 'heightSource', label: 'Height source' }, { key: 'match', label: 'Permit match' }],
    datasets: [
      { id: 'permits', label: 'Building permits · 2019-2024', source: attributes('atlanta'), join, records: 'permits', value: 'permits', colors: 'amber', breaks: [0, 3, 10] },
      { id: 'newConstruction', label: 'New construction permits', source: attributes('atlanta'), join, records: 'newConstruction', value: 'newConstruction', colors: 'teal', breaks: [0, 1, 3] },
    ],
  },
};
