import type { CityMap, TerrainOptions } from 'blocklight';
import type { GeoJSONData } from 'blocklight';

/**
 * Terrain Tiles on the AWS Registry of Open Data (Tilezen "terrarium" encoding): public
 * elevation, no key, no commercial provider. Fetched only once the visitor turns terrain on.
 */
export const openTerrain: TerrainOptions = {
  source: {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 15,
    attribution: '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles · AWS Open Data</a>',
  },
  exaggeration: 1.4,
};

/**
 * Open elevation carries mosaic seams, piers and bridge decks over water — most visibly a
 * ridge down the middle of the Hudson, where the tiles are stitched along the state line.
 * Cover that with a mask so relief only shows where the model is trustworthy.
 */
export function terrainWith(mask?: GeoJSONData): TerrainOptions {
  return mask ? { ...openTerrain, mask } : openTerrain;
}

/**
 * Wire the sidebar switch to the map, leaving terrain off until it is asked for. Returns a
 * hook to call whenever the view turns flat — the 2D plan, or the zoomed-out overview.
 * Terrain belongs to the extruded 3D buildings alone: MapLibre drapes flat ground layers
 * through an offscreen texture that blurs and dims them, and neither flat view shows relief.
 */
export function wireTerrainToggle(map: CityMap, note = 'Real ground beneath the city', mask?: GeoJSONData) {
  const input = document.getElementById('terrain') as HTMLInputElement | null;
  const label = document.getElementById('terrain-note');
  if (!input) return () => {};
  let wanted = false, flat = false;
  input.checked = false;
  if (label) label.textContent = note;
  const apply = () => {
    try {
      map.setTerrain(wanted && !flat ? terrainWith(mask) : null);
      if (label) label.textContent = !wanted ? note : flat ? 'Paused — 3D buildings only' : 'Terrain Tiles · AWS Open Data';
    } catch (error) {
      wanted = false; input.checked = false;
      const status = document.getElementById('status');
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
    }
    input.disabled = flat;
  };
  input.onchange = () => { wanted = input.checked; apply(); };
  return (twoD: boolean) => { flat = twoD; apply(); };
}
