# Demo data and attribution

The sample is downloaded directly from NYC Open Data. No Prospect database,
property valuations, owners, scores, credentials, or private API responses are
included. The code's MIT license does not replace upstream data terms.

| File | Source | Processing |
| --- | --- | --- |
| `buildings.geojson` | [NYC planimetric BUILDING](https://data.cityofnewyork.us/d/5zhs-2jue) | Expanded Midtown-area sample intersecting longitude [-74.010, -73.950], latitude [40.725, 40.785]; paginated without dropping boundary-crossing footprints; footprint geometry; roof heights converted from feet to meters. |
| `streets.geojson` | [NYC street centerlines](https://data.cityofnewyork.us/d/inkn-q76z) | Local bounding box; geometry only. |
| `land.geojson` | [DCP borough boundaries](https://data.cityofnewyork.us/d/gthc-hcne) | Five boroughs; topology-preserving simplification, tolerance 0.00003 degrees. |
| `311-buildings.json` | [NYC 311 requests](https://data.cityofnewyork.us/d/erm2-nwe9) | HPD requests created in 2025; joined to individual building footprints. |
| `crime.geojson` | [NYPD Complaint Data Historic](https://data.cityofnewyork.us/d/qgea-i56i) | Reports filed in 2025; spatially aggregated as described below. |
| `places.geojson` | Manually authored example | Six approximate public landmark positions; illustrative rather than a gazetteer. |

Use is subject to [NYC Open Data terms](https://opendata.cityofnewyork.us/overview/#termsofuse)
and the linked dataset metadata. Preserve source attribution with redistributed
samples. Dataset schemas and publication dates can change.

The checked-in `sources.json` and `crime-source.json` record actual fetch times,
queries, feature counts, and dataset links. Rebuilding produces a new snapshot;
it is not guaranteed byte-identical if NYC revises its source records.

## Complaint methodology

- Source rows represent reported complaints across felony, misdemeanor and
  violation categories. They are not convictions or estimates of all crime.
- Date filtering uses **`rpt_dt`**, the date reported to police, from January 1,
  2025 inclusive to January 1, 2026 exclusive. Occurrence dates can differ.
- Only geocoded records inside longitude `[-73.998, -73.966)` and latitude
  `[40.741, 40.768)` are included. This is a Midtown sample, not NYC-wide coverage.
- The source API first counts records at each coordinate; the local script sums
  those counts into a fixed grid. Each cell spans 0.0018 degrees latitude and
  0.00237 degrees longitude, approximately 200 meters at this latitude.
- Points are drawn at **cell centers**, not incident locations. Neither individual
  complaints nor victim/suspect fields are included in the shipped data.
- Color thresholds and circle sizes encode the same count. The legend is generated
  from the same scale definition as the map. Counts are not divided by residents,
  visitors, foot traffic, or exposure time.
- Missing coordinates are excluded. Geocoding accuracy, revisions, reporting
  behavior, and enforcement affect the data. Blank cells indicate no included
  records, not proof of no crime. Counts must not be read as personal safety scores.

Refresh with `npm run data:crime`. Aggregation and manifest reconciliation are
covered by automated tests.

## 311 housing requests: active playground dataset

`311-buildings.json` contains aggregate records keyed by footprint `source_id`.
The building geometry also carries BIN, base BBL, and MapPLUTO BBL from NYC's
building source. These identifiers are used for matching, not inferred from
addresses. The sample bounds span longitude [-74.010, -73.950) and latitude
[40.725, 40.785); this rectangle includes areas on both sides of the East River.

The 311 extract filters `agency = HPD` and `created_date` from 2025-01-01 inclusive
to 2026-01-01 exclusive. It includes housing-related requests, not every 311
category. The source query requires coordinates inside the sample, so requests
without usable coordinates are excluded before matching; the reported unmatched
count refers only to the retrieved extract. HPD request status reflects the
snapshot's fetch time, not necessarily year-end status.

Matching uses a request's BBL against a footprint's `base_bbl` or `mappluto_bbl`:

1. One footprint on the matched lot: attribute the request to that footprint.
2. Multiple footprints on the lot: require the request's point to be contained
   in exactly one footprint on that same lot, respecting polygon holes.
3. Missing BBL, missing lot geometry, or ambiguous footprints: leave unmatched.

Each request contributes to at most one building. There is no nearest-building
fallback and no multiplication across all buildings on a tax lot. A single-lot
match is property linkage, not independent verification of an incident's exact
physical position. Requests are reports, not confirmed violations or measures of
building quality. Missing records mean no linked requests in this sample.

The JSON stores category/status counts, reported addresses, latest creation date,
and match-method counts for each matched building. It omits individual request
records and requester information. `summary` reconciles retrieved, matched and
unmatched totals; source metadata records the query, period and fetch time.
Rebuild with `npm run data:nyc` followed by `npm run data:311`.

The previous crime-grid sample remains as an optional pipeline example and is
not fetched or rendered by the playground.

## Citywide build

The optional `npm run data:city` pipeline removes the geographic filter from the
HPD extract and uses the entire NYC footprint and street datasets. It includes
HPD requests with missing coordinates when a valid BBL identifies a single
footprint. Records without a resolvable BBL remain unmatched. Each monthly query
aggregates identical BBL/coordinate/category/status/address combinations and
carries their count and latest creation date; joining preserves these weights.
The sum of weights is independently compared with the source's citywide count.

Geometry is topology-preserving simplified at 0.000005 degrees and coordinates
are rounded to six decimal places for distribution. The 311 join uses that
geometry, so marginal point-on-boundary cases can be affected by simplification.
Complete features may occur in multiple geographic files, but the browser
loader deduplicates by stable feature ID. Citywide JSON includes a geometry
version to prevent loading an attribute file built for a different snapshot.
Request totals and source/fetch metadata are embedded in `311-citywide.json`;
geometry manifests include the exact source queries and feature counts.

## Standalone fixtures and Chicago

`playground/examples/basic` and `datasets` include 233 NYC footprints around Midtown and 13 matched building records, extracted from the bundled snapshot. Their 311 counts retain the same 2025 HPD scope and limitations.

`playground/examples/chicago/data` is a small extract of City of Chicago building footprints along Wacker Drive. Source: https://data.cityofchicago.org/d/syp8-uezg . The source metadata JSON records the exact query and fetch time. Building IDs, historical year-built and story-count attributes come directly from that dataset. Geometry includes 51 buildings; 46 have valid attributes for both example measures. Heights are illustrative estimates of reported stories × 3 meters, not measured heights. These historical values are not independently verified current conditions. Source terms: https://www.chicago.gov/city/en/narr/foia/data_disclaimer.html . Refresh with `npm run data:chicago`.

The citywide overview now uses flat building footprints in standard MVT files generated by `geojson-vt`/`vt-pbf`. Its coverage is still the labeled sample, including every building linked to the bundled extract. The application fetches compact metric rows initially and requests a detail shard only after selection. Full source JSON remains available for download. No public service or private Prospect data is used at runtime.
