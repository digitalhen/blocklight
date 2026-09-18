# Website deployment

The public site is served at https://apps.cleartextlabs.com/blocklight/.
Both `dokploy.cleartextlabs.com` and `dokploy2.cleartextlabs.com` run a `blocklight`
application in **Websites → production**, connected to `digitalhen/blocklight`,
branch `main`, with the existing GitHub integration and autodeploy enabled.

## Build and routing

- Build type: Dockerfile; file `Dockerfile`; context `.`; build path `/`.
- Domain: `apps.cleartextlabs.com`; path `/blocklight`; container port `8080`.
- Keep **Strip Path off**. The container serves the full `/blocklight/` prefix.
- Origin HTTP follows the existing Bike Bar routing; public HTTPS terminates upstream.
- Health check: `/healthz` on port 8080.

The multi-stage image builds the library and Vite website, then serves static
files with Nginx. Vite's build base is `/blocklight/`. A request without the
trailing slash redirects while preserving query parameters. Missing data returns
404 rather than HTML. Hashed assets are cached for one year; data for one hour;
HTML is revalidated. Nginx compresses JSON, GeoJSON, CSS and JavaScript.

## Citywide data

The build downloads `blocklight-nyc-2026-09-18.tar.gz` from the GitHub release
`nyc-data-2026-09-18`, verifies its SHA-256, and extracts it into the public data
directory before the Vite build. This contains the same citywide footprints,
streets, 2025 HPD aggregates, detail shards, and vector overview used locally.
See `DATA.md` for source attribution and matching methodology.

To refresh data, rebuild it with the data scripts, publish a new versioned data
archive, and update both its URL and checksum in `Dockerfile`. Do not replace an
existing release asset in place: the checksum intentionally makes that fail.
Generated data stays outside Git and the npm package.

## Test locally

```sh
docker build -t blocklight:deployment .
docker run --rm -p 127.0.0.1:4318:8080 blocklight:deployment
```

Open http://localhost:4318/blocklight/. Check the demo, dataset switching,
2D/3D controls, `/blocklight/docs.html`, and `/blocklight/examples/datasets/`.

To roll back, redeploy a previously successful commit on **both** servers.
The data version is pinned in that commit's Dockerfile.
