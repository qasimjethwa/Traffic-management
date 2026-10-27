# Mumbai Flow backend

FastAPI + PostgreSQL/PostGIS service that ingests real data, stores it with provenance, and serves it to the
frontend's **Data** view. The frontend works without it (static mode); everything here is optional.

## Data kinds

Every stored or served value is `OBSERVED`, `ESTIMATED` or `FORECAST`. `SIMULATED` values exist only in the
browser demo and are rejected by CHECK constraints (`journey_observations`, `weather_observations`,
`data_sources`) and by the frontend client (`assertNoSimulated`).

## Sources

| Source | Kind | What it actually provides | Stored | ML-eligible |
| --- | --- | --- | --- | --- |
| OSRM on OpenStreetMap | ESTIMATED | Real road geometry for corridors; free-flow drive time (no traffic) | yes (ODbL, attribution) | no — constant over time |
| Open-Meteo | ESTIMATED | Model-based current weather for central Mumbai | yes (CC BY 4.0, free tier non-commercial) | not used yet |
| Operator CSV upload | OBSERVED | Measured trip durations from the operator's own vehicles | yes | **yes — the only eligible source** |
| Google Routes API | ESTIMATED | Traffic-aware drive time, on demand | **no** | **no** |
| GTFS static | OBSERVED | Published routes/stops, if a licensed Mumbai feed is supplied | yes | n/a |

Google Maps Platform terms (checked Oct 2026): Routes content must not be used with a non-Google map
(Service Specific Terms §19.2), only lat/lng may be cached and only for 30 days (§19.3), and content must not
be used to train, test or validate ML models (General Terms §3.2.3(c)(vii)). The adapter therefore returns
results as text only, never stores them, never sends geometry to the map, and enforces local daily/minute caps.
Compute Routes is billed per request; see https://developers.google.com/maps/billing/pricing (Essentials
SKU: 10,000 free/month then $5 per 1,000; Pro: 5,000 free then $10; Enterprise: 1,000 free then $15 at the
lowest tier). Confirm which SKU `TRAFFIC_AWARE` bills under for your account before enabling.

No verified public Mumbai/BEST GTFS feed was found (Mobility Database lists Delhi feeds only). Official Mumbai
Traffic Police notices have no accessible API. Both remain unavailable.

## Setup (local)

```bash
# PostgreSQL 16 + PostGIS 3
sudo -u postgres psql -c "CREATE ROLE mumbai_flow LOGIN PASSWORD 'mumbai_flow' CREATEDB;"
sudo -u postgres createdb -O mumbai_flow mumbai_flow
sudo -u postgres psql -d mumbai_flow -c "CREATE EXTENSION postgis;"

cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # edit as needed
alembic upgrade head
python -m app.cli seed
uvicorn app.api:app --reload    # http://localhost:8000/docs
```

Frontend against the backend: `VITE_API_URL=http://localhost:8000 npm run dev` from the repo root.

Docker alternative (written, not exercised in the authoring environment): `docker compose up --build` from the
repo root.

## Ingestion jobs

```bash
python -m app.cli import-corridors          # snap corridors to OSM roads, validate, store, rewrite public/data/real
python -m app.cli import-corridors --snapshot-only   # same, without a database
python -m app.cli collect-journeys          # one OSRM free-flow record per OD pair per UTC day
python -m app.cli collect-weather           # Open-Meteo current conditions (deduplicated by valid time)
python -m app.cli import-observations trips.csv      # operator trip times (see format below)
python -m app.cli import-gtfs feed.zip --source-url URL --license "LICENCE"
python -m app.cli runs                      # ingestion history (IST)
python -m app.cli train                     # train/evaluate, or report insufficient data
```

Schedule them with cron or any scheduler, e.g. weather every 30 min, journeys daily, training weekly. Every run
writes an `ingestion_runs` row (status, inserted, duplicates, invalid, error); provider calls are logged in
`provider_requests` (no response content) for health and quotas. Failures are recorded, never back-filled.

Operator CSV columns: `od_pair_id, departure_at, duration_s[, distance_m][, vehicle_ref]`.
`departure_at` must be ISO-8601 with an offset (e.g. `2026-10-27T09:15:00+05:30`). Rows with unknown OD pairs,
naive or future timestamps, or durations outside 60–14,400 s are rejected and listed in the run details.
OD pairs are defined in `src/data/reference/od_pairs.json`.

## Corridor validation

A corridor is accepted only if the OSRM route (a) stays inside the MMR bounding box, (b) has a length within
0.8–1.5× of the hand-placed reference polyline, and (c) passes within 500 m of at least 80% of the reference
waypoints. The importer tries all waypoints, then sparser subsets (dense points can snap to the opposite
carriageway and force U-turn detours). Rejected corridors are removed from the database and drawn in the UI
with approximate waypoints, labelled as such.

## Forecasting

`app/ml/forecast.py`. Target: journey duration for a departure from an OD pair. Features: OD pair, IST hour and
weekday (cyclic), weekend flag. Training refuses to run below 300 usable observations, 14 distinct days, 30
observations for at least one pair, or 40 test observations. Splits are chronological on timestamps (60/20/20)
with no shared departure times. A median time-of-day baseline is always evaluated next to a
`HistGradientBoostingRegressor`; MAE and RMSE are reported on validation and held-out test periods, and the
better predictor on test is selected. Artifacts are versioned under `ml_artifacts/models/<UTC-time>-<data-hash>/`
with `metadata.json`; `ml_artifacts/status.json` is what the API serves.

## API

`GET /api/health`, `/api/sources`, `/api/corridors`, `/api/od-pairs`, `/api/journeys/summary`,
`/api/journeys/observations?od_pair_id=`, `/api/weather/latest`, `/api/ingestion/runs`, `/api/ingestion/stats`,
`/api/forecast/status`, `/api/forecast/journey?od_pair_id=&departure_at=`, `/api/gtfs/feeds`,
`/api/operator-actions`; `POST /api/journeys/estimate`, `/api/operator-actions`. Errors are JSON
`{error, message}`: `not_configured` (503), `rate_limited`/`quota_exceeded` (429), provider failures (502),
`database_unavailable` (503). All timestamps are UTC ISO-8601 (`Z`); the frontend displays IST.

## Tests

```bash
pytest -q          # uses MF_TEST_DATABASE_URL (default: local mumbai_flow_test); DB tests skip if unreachable
```

## Deployment

Any host that runs a container or Python 3.12 plus managed PostgreSQL with PostGIS. Set `MF_DATABASE_URL`,
`MF_CORS_ORIGINS` (your Pages origin, e.g. `https://USER.github.io`), optional provider keys, run
`alembic upgrade head`, and schedule the CLI jobs. Then set the repository variable `VITE_API_URL` so the Pages
build points at it. Secrets stay on the backend; the frontend only ever receives the public API URL.
Costs: OSRM/OSM and Open-Meteo free tiers are $0 but rate-limited and non-production (the shared Open-Meteo
free tier returned HTTP 429 during development); Google Routes is billed per request.
