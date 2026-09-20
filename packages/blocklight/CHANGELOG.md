# Changelog

## Unreleased

- Optional elevation in the 3D view. `terrain` raises the whole map onto a `raster-dem` source you supply, with themed hillshade and sky, switchable at runtime via `setTerrain()`. Blocklight bundles no elevation tiles and contacts no provider on its own.
- Terrain is limited to the extruded 3D buildings: the 2D plan and the zoomed-out overview suspend it and restore it afterwards. Both are flat fills, which MapLibre drapes through an offscreen texture that visibly dims them, for no gain. The change is applied either side of the camera transition, since doing it mid-ease lurches the view.
- Viewport tile loading returns the identical collection when the visible tiles are unchanged, so panning within the same tiles no longer re-tiles geometry the renderer is already drawing.
- Footprints that report no height are drawn as a draped fill while terrain is on, wrapping them onto the slope. MapLibre raises an extrusion by its centroid elevation alone, so a heightless building was previously swallowed by the uphill ground. Layers gain `filter`, and flat building layers gain `opacity`.
- `terrain.mask` covers relief where an elevation model is untrustworthy, with `outsideMask()` building one from a landmass. Open DEMs carry mosaic seams, piers and bridge decks over water, and hillshade would otherwise draw them.
- Optional `elevationProperty` on buildings starts each extrusion at its own ground elevation. It is ignored while terrain is active, since MapLibre already lifts extrusions onto the ground.

## 0.1.1 — 2026-09-18

- Update README and documentation for installation from npm. No runtime changes.

## 0.1.0 — 2026-09-18

- New `createMap()` configuration API with bundled worker/CSS, dataset and perspective controls, legends, and building details.
- Public building controller owns flat overview, 2D/3D, loading and selection.
- Native vector sources and MVT overview geometry; compact NYC metrics and lazy details.
- Runnable basic, 311 and Chicago examples; docs generated from executable examples.
- Generic raw-record matching with explicit unmatched results.
- Breaking preview changes: getValue returns null for missing/ambiguous/unverified matches, with getResult exposing the reason. Existing Feature.id is preserved by default; generateId now requires explicit opt-in. Zoomed-out buildings are flat footprints, replacing the earlier dot overview.
