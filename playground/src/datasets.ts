import { steppedScale, themes, type DatasetDefinition, type ThemeName } from 'blocklight';

/** Each entry can point to a different JSON file and use its own join and palette. */
export function datasetDefinitions(url: string, theme: ThemeName): DatasetDefinition[] {
  return [
    { id: 'housing', label: 'All housing requests', field: 'count', colors: ['#7897b6', '#e8c98a', '#d9a44e', '#bc6447'] },
    { id: 'heat', label: 'Heating / hot water', field: 'categories.HEAT/HOT WATER', colors: ['#eac197', '#e5a15d', '#d97040', '#ae403a'] },
    { id: 'plumbing', label: 'Plumbing', field: 'categories.PLUMBING', colors: ['#91c9ca', '#5faeae', '#3989ad', '#4264ad'] },
  ].map(({ id, label, field, colors }) => ({
    id, label,
    data: { url, records: 'buildings', join: { feature: 'source_id', record: 'buildingId' }, aggregate: { op: 'sum', field, missing: 0 }, property: 'requests' },
    color: steppedScale('requests', [
      { value: 0, color: themes[theme].buildingLow, label: 'None linked' },
      ...[1, 5, 20, 50].map((value, i) => ({ value, color: colors[i], label: ['1–4', '5–19', '20–49', '50+'][i] })),
    ]),
  }));
}
