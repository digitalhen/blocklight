# Local performance check

Measured September 18, 2026 with `npm run benchmark` against the Vite demo at
localhost:4317, Chrome, software WebGL, a fresh browser context, 1440×1000 viewport,
and an unthrottled local network. These are development-server measurements, not
production or mobile performance guarantees.

- Initial map rendered in approximately 2.6 seconds in this run.
- Initial decoded data payload: 12.13 MiB, including viewport building/street geometry.
- Full 311 JSON: 13,738,991 bytes; compact initial metrics: 2,655,890 bytes (81% smaller).
- No overview geometry or building-detail shards fetched during initial loading.
- Zooming to 11.8 requested eight MVT overview tiles, rather than the 30 MiB overview GeoJSON.
- Package and examples were also built with Vite; MapLibre remains the dominant JavaScript dependency.

`npm run benchmark` writes fresh machine-readable results to `.cache/benchmark.json`.
HTTP compression and caching should be configured by the host. Real-device network,
frame-time, and memory profiling remain release work; this benchmark does not establish
acceptable performance for every device or dataset. Runtime JSON attributes are still
held in memory; very large or frequently changing datasets should be prejoined into
vector tiles or loaded through a viewport-aware application adapter.
