# Mumbai Flow — AI Traffic Management

**AI-assisted urban traffic management & mobility intelligence prototype for Mumbai, Maharashtra.**

Mumbai Flow is a dark, command-centre style web app that combines a **real Mumbai basemap** with a
simulated transport fleet, corridor congestion model, incident centre, schedule-adherence analytics
and an explainable, **rule-based** traffic-intelligence engine. It is a fully static site (React +
Vite) that deploys to GitHub Pages — no backend, database or paid API needed.

> **Demo-data disclaimer.** The basemap, satellite imagery, place names and road geometry are real
> geographic data. **Everything operational is simulated:** vehicle positions and telemetry,
> congestion scores, passenger demand, incidents, maintenance records, efficiency metrics and the
> generated insights / recommendations. Nothing in the app is a live traffic feed. The project is an
> independent prototype and is **not affiliated with BMC, BEST, MMRDA, Mumbai Traffic Police or any
> other agency.**

---

## Features

| View | What it does |
| --- | --- |
| **Live Map** | Real Mumbai map (hybrid satellite / dark / OSM) with moving demo vehicles, congestion-coloured corridors snapped to real roads, incidents and stops. Fleet sidebar with type filters, online/offline counts, efficiency trend and animated vehicle cards. Floating passenger-load card follows the selected vehicle; warning panel with explainable insights; schedule-offset and passenger-volume panels. |
| **Fleet** | Filterable table (type, status, route, delay band, ID) with nearest-locality labels; selecting a row flies the map to the vehicle and opens its detail panel. |
| **Routes** | Corridors ranked by simulated congestion, origin → destination routing on real roads via OSRM (with an honest fallback), and a **Simulate reroute** before/after comparison. |
| **Analytics** | Time-range and corridor filters drive intensity-over-time, congestion score, status distribution, schedule adherence, incidents by severity and demand vs capacity. |
| **Incidents** | Priority-ranked incident cards with data-grounded recommended actions; acknowledge / resolve / reopen updates the congestion model, insights and analytics immediately. |
| **Maintenance** | Fictional condition records (brake / tyre wear, battery, service dates) with derived status and filters. |
| **Operations** | Schedule variance per service, delay distribution, service exceptions, full route-level schedule-offset grid and a selected-vehicle delay breakdown. |

Plus: global search (vehicles, corridors, incidents, places), notifications, simulation
play/pause/speed/reset, map layer controls, legend, reset-to-Mumbai, keyboard focus states, Escape
to close panels, reduced-motion support and responsive tablet / mobile layouts.

## Tech stack

React 18 · TypeScript · Vite 5 · Leaflet + React-Leaflet · Framer Motion · Recharts · Lucide icons ·
hand-written CSS design system · GitHub Actions → GitHub Pages.

## Architecture

```
src/
  app/            App shell + store (useReducer context: simulation, selection, UI state)
  types/          Typed domain model (Vehicle, Corridor, Incident, Insight, …)
  data/           Demo scenario: real Mumbai places & corridors, seeded fleet, incidents, maintenance
  engine/
    config.ts             All thresholds, weights and scenario assumptions in one place
    congestionEngine.ts   Time-of-day congestion, corridor speed/travel time, stop demand vs capacity
    simulationEngine.ts   Deterministic tick: vehicle movement, delay drift, efficiency, warm-up run
    trafficIntelligence.ts  Rule-based insights, incident priority, reroute estimate, recommendations
    analytics.ts          Range slicing, per-corridor timelines, delay distribution
  services/
    map/tileProviders.ts  Basemap definitions + attribution
    routing/osrm.ts       OSRM client with session cache
  components/     layout · map · fleet · analytics · intelligence · ui
  hooks/          Derived selectors (insights, totals, stop demand)
  pages/          One component per navigation view (lazy-loaded)
  styles/         global.css design tokens & components
```

**How the numbers are produced**

- The fleet is generated from a fixed seed (`data/vehicles.ts`, `FLEET_CONFIG` controls counts).
- On load the simulation is *warmed up* from 06:00 to 08:30 with the same model, so the efficiency
  history, intensity curve and passenger totals are produced by the model rather than drawn by hand.
- Each tick (1.5 s real time = 1 simulated minute) recomputes corridor congestion (time-of-day
  curve + incident load + deterministic noise), moves vehicles along corridor geometry at a
  congestion-reduced speed, and drifts schedule delay.
- Every aggregate (totals, efficiency, variance, on-time %) is derived from those records.

**Traffic intelligence** (`engine/trafficIntelligence.ts`) is deliberately a transparent rule
engine — *not* a trained ML model. Rules: congestion threshold, schedule deviation, incident
priority (severity + duration + impact + unacknowledged), demand/capacity ratio and maintenance wear.
Each insight carries the observed metric, why it fired, a recommendation and a priority. Any future
analytics / ML service can replace it by returning the same `Insight[]` shape from `analyse()`.

## Map data & attribution

| Layer | Provider | Key |
| --- | --- | --- |
| Hybrid / Satellite | Esri World Imagery + Esri World Transportation & Boundaries/Places reference layers | none |
| Dark | Esri World Dark Gray Canvas (+ reference labels), or Stadia Alidade Smooth Dark if `VITE_STADIA_API_KEY` is set | optional |
| OSM (fallback) | OpenStreetMap standard tiles with a dark CSS treatment | none |
| Road geometry & O/D routing | OSRM (public demo server by default) on OpenStreetMap data | none |

Attribution is rendered on every map. If the preferred basemap fails to load, the app switches to
OpenStreetMap automatically and tells the user. If OSRM is unreachable, corridors keep their
hand-placed waypoint geometry (labelled "approximate") and O/D routing shows an illustrative straight
line clearly marked as *not* a road route.

**Usage policies:** the public OSRM server and OSM tile servers are for light use only; Esri basemaps
are used here for a non-commercial demo — review Esri's terms (an ArcGIS account/key may be required
for production or commercial use). For anything beyond a portfolio demo, use your own tile/routing
infrastructure or a commercial plan.

## Getting started

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Optional configuration: copy `.env.example` to `.env.local`. All variables are public browser
values — never put private secrets in them.

## Deploying to GitHub Pages

1. Create a GitHub repository (e.g. `mumbai-flow`) and push this project to the `main` branch.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow `.github/workflows/deploy.yml` builds and deploys on every push to `main`, and can be
   run manually from the **Actions** tab (*Run workflow*).
4. The site is published at `https://<USERNAME>.github.io/<REPOSITORY>/`.

**Base path.** The workflow sets `VITE_BASE_PATH=/<repository-name>/` automatically. For a
user/organisation site (repository named `<USERNAME>.github.io`, served from the domain root) add a
repository variable `PAGES_BASE_PATH` with value `/` (*Settings → Secrets and variables → Actions →
Variables*). Locally the base defaults to `./`; the app uses hash routing (`#/fleet`), so deep links
work on Pages without server rewrites.

Optional repository variables: `VITE_STADIA_API_KEY`, `VITE_OSRM_URL`.

## Known limitations

- All operational data is simulated; there is no live feed integration yet.
- Corridor congestion is a corridor-level model, not lane- or junction-level traffic.
- Reroute savings are scenario estimates (assumptions documented in code and UI).
- Incident and insight status changes live in browser memory and reset on reload.
- Public OSRM / tile servers may rate-limit or be unavailable; fallbacks are built in.

## Roadmap

- Pluggable data adapters for GTFS / GTFS-Realtime feeds and open traffic data where licensed.
- Replace the rule engine with an evaluated forecasting service behind the same `Insight` interface.
- Persisted operator actions and audit trail (optional backend).
- Junction-level signal analytics, heatmaps from probe data, and multi-modal (rail, metro) layers.
- Unit tests for the engines and Playwright end-to-end tests in CI.

## License

MIT — see `LICENSE`.
