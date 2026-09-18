import type { FeatureCollection, Position } from 'geojson';
/** One marker at each footprint's bounding-box center, preserving IDs and attributes. */
export function buildingPoints(geometry: FeatureCollection): FeatureCollection {
  return { type: 'FeatureCollection', features: geometry.features.map(feature => {
    if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') throw new Error('Building markers require polygon footprints.');
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    const visit = (coordinates: Position | Position[] | Position[][] | Position[][][]) => {
      if (typeof coordinates[0] === 'number') {
        const [x, y] = coordinates as Position;
        bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
        bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
      } else for (const child of coordinates) visit(child as Position | Position[] | Position[][]);
    };
    visit(feature.geometry.coordinates);
    if (!bounds.every(Number.isFinite)) throw new Error('Building footprint has invalid bounds.');
    return { ...feature, geometry: { type: 'Point', coordinates: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] } };
  }) };
}
