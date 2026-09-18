import { readFile, writeFile, mkdir } from 'node:fs/promises';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
const root = new URL('../../playground/public/data/', import.meta.url);
const geometry = JSON.parse(await readFile(new URL('city-overview.geojson', root), 'utf8'));
// Geometry only: runtime datasets populate feature state without rebuilding tiles.
const index = new geojsonvt(geometry, { maxZoom: 13, indexMaxZoom: 10, tolerance: 1, extent: 4096, buffer: 64, promoteId: 'source_id' });
const x = (lng,z) => Math.floor((lng+180)/360 * 2**z);
const y = (lat,z) => Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2 * 2**z);
let files = 0, bytes = 0;
for (let z = 8; z <= 13; z++) for (let tx = x(-74.35,z); tx <= x(-73.65,z); tx++) {
  await mkdir(new URL(`city/overview/${z}/${tx}/`, root), { recursive: true });
  for (let ty = y(40.94,z); ty <= y(40.44,z); ty++) {
    const tile = index.getTile(z,tx,ty);
    const buffer = vtpbf.fromGeojsonVt({ buildings: tile ?? { features: [] } }, { version: 2 });
    await writeFile(new URL(`city/overview/${z}/${tx}/${ty}.pbf`, root), buffer); files++; bytes += buffer.length;
  }
}
console.log(`Vector overview: ${files} tiles, ${(bytes/1024/1024).toFixed(1)} MiB across zooms 8–13.`);
