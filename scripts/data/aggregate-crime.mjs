/** Approximately 200m cells at Midtown's latitude. Counts, never population-adjusted rates. */
export const grid = { west: -73.998, south: 40.741, east: -73.966, north: 40.768, latStep: 0.0018, lngStep: 0.00237 };
export function aggregateComplaints(rows) {
  const cells = new Map();
  for (const row of rows) {
    const lat = Number(row.latitude), lng = Number(row.longitude), count = Number(row.count);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isInteger(count) || count < 1) throw new Error('Invalid complaint coordinates or count.');
    if (lng < grid.west || lng >= grid.east || lat < grid.south || lat >= grid.north) continue;
    const x = Math.floor((lng - grid.west) / grid.lngStep), y = Math.floor((lat - grid.south) / grid.latStep);
    const id = `${x}-${y}`;
    cells.set(id, { x, y, count: (cells.get(id)?.count ?? 0) + count });
  }
  return { type: 'FeatureCollection', features: [...cells.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, cell]) => ({
    type: 'Feature', id,
    properties: { cell: id, count: cell.count, year: 2025 },
    geometry: { type: 'Point', coordinates: [grid.west + (cell.x + 0.5) * grid.lngStep, grid.south + (cell.y + 0.5) * grid.latStep] },
  })) };
}
