# Changelog

## 0.1.0 — unreleased developer preview

- New `createMap()` configuration API with bundled worker/CSS, dataset and perspective controls, legends, and building details.
- Public building controller owns flat overview, 2D/3D, loading and selection.
- Native vector sources and MVT overview geometry; compact NYC metrics and lazy details.
- Runnable basic, 311 and Chicago examples; docs generated from executable examples.
- Generic raw-record matching with explicit unmatched results.
- Breaking preview changes: getValue returns null for missing/ambiguous/unverified matches, with getResult exposing the reason. Existing Feature.id is preserved by default; generateId now requires explicit opt-in. Zoomed-out buildings are flat footprints, replacing the earlier dot overview.
