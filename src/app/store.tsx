import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import type { BaseLayerId, Incident, IncidentStatus, LatLng, LayerVisibility, MaintenanceRecord, Selection, SimulationSettings, ViewId } from '../types';
import { CORRIDORS } from '../data/corridors';
import { applyScenarioAnchors, buildFleet, SCENARIO_SEED } from '../data/vehicles';
import { buildIncidents, SIM_START_MINUTE } from '../data/incidents';
import { buildMaintenance } from '../data/maintenance';
import { MUMBAI_CENTER, MUMBAI_ZOOM } from '../data/places';
import { computeAllCorridors, tick, warmUp, type Geometry, type SimSnapshot } from '../engine/simulationEngine';
import { SIM_DEFAULTS } from '../engine/config';
import { fetchRoute, simplify } from '../services/routing/osrm';

/** Demo "today" — used only for maintenance date arithmetic. */
export const DEMO_TODAY = new Date().toISOString().slice(0, 10);

export interface FocusRequest {
  center: LatLng;
  zoom: number;
  nonce: number;
}

export interface AppState extends SimSnapshot {
  incidents: Incident[];
  maintenance: MaintenanceRecord[];
  geometry: Geometry;
  geometrySource: Record<string, 'osrm' | 'waypoints'>;
  settings: SimulationSettings;
  view: ViewId;
  selection: Selection;
  hovered: string | null;
  layers: LayerVisibility;
  baseLayer: BaseLayerId;
  focus: FocusRequest | null;
  dismissed: string[];
  tileFallback: boolean;
  toast: { id: number; text: string; tone: 'info' | 'warn' } | null;
}

type Action =
  | { type: 'TICK' }
  | { type: 'SET_RUNNING'; running: boolean }
  | { type: 'SET_TICK_MS'; tickMs: number }
  | { type: 'SET_VIEW'; view: ViewId }
  | { type: 'SELECT'; selection: Selection; focus?: { center: LatLng; zoom?: number } }
  | { type: 'HOVER'; id: string | null }
  | { type: 'FOCUS'; center: LatLng; zoom: number }
  | { type: 'RESET_VIEW' }
  | { type: 'TOGGLE_LAYER'; layer: keyof LayerVisibility }
  | { type: 'SET_BASE'; base: BaseLayerId }
  | { type: 'INCIDENT_STATUS'; id: string; status: IncidentStatus }
  | { type: 'DISMISS_INSIGHT'; id: string }
  | { type: 'RESTORE_INSIGHT'; id: string }
  | { type: 'SET_GEOMETRY'; id: string; line: LatLng[] }
  | { type: 'TILE_FALLBACK' }
  | { type: 'TOAST'; text: string; tone?: 'info' | 'warn' }
  | { type: 'CLEAR_TOAST' }
  | { type: 'RESET_SCENARIO' };

const waypointGeometry = (): Geometry => Object.fromEntries(CORRIDORS.map((c) => [c.id, c.waypoints]));

function initialState(): AppState {
  const geometry = waypointGeometry();
  const fleet = buildFleet(SCENARIO_SEED);
  const warm = warmUp(fleet, [], geometry, 6 * 60, SIM_START_MINUTE);
  applyScenarioAnchors(warm.fleet);
  const incidents = buildIncidents(warm.fleet);
  const corridors = computeAllCorridors(SIM_START_MINUTE, incidents, geometry);
  return {
    ...warm,
    corridors,
    minute: SIM_START_MINUTE,
    incidents,
    maintenance: buildMaintenance(warm.fleet, DEMO_TODAY),
    geometry,
    geometrySource: Object.fromEntries(CORRIDORS.map((c) => [c.id, 'waypoints' as const])),
    settings: { running: true, tickMs: SIM_DEFAULTS.tickMs, minutesPerTick: SIM_DEFAULTS.minutesPerTick, seed: SCENARIO_SEED },
    view: readHashView(),
    selection: null,
    hovered: null,
    layers: { vehicles: true, corridors: true, incidents: true, stops: true, heat: true },
    baseLayer: 'hybrid',
    focus: null,
    dismissed: [],
    tileFallback: false,
    toast: null,
  };
}

const VIEWS: ViewId[] = ['live', 'fleet', 'routes', 'analytics', 'incidents', 'maintenance', 'operations'];
function readHashView(): ViewId {
  const h = typeof location !== 'undefined' ? location.hash.replace('#/', '') : '';
  return (VIEWS as string[]).includes(h) ? (h as ViewId) : 'live';
}

let nonce = 0;
function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'TICK': {
      const next = tick(s, s.incidents, s.geometry, s.settings.minutesPerTick);
      return { ...s, ...next };
    }
    case 'SET_RUNNING':
      return { ...s, settings: { ...s.settings, running: a.running } };
    case 'SET_TICK_MS':
      return { ...s, settings: { ...s.settings, tickMs: a.tickMs } };
    case 'SET_VIEW':
      return { ...s, view: a.view };
    case 'SELECT':
      return {
        ...s,
        selection: a.selection,
        focus: a.focus ? { center: a.focus.center, zoom: a.focus.zoom ?? 15, nonce: ++nonce } : s.focus,
      };
    case 'HOVER':
      return s.hovered === a.id ? s : { ...s, hovered: a.id };
    case 'FOCUS':
      return { ...s, focus: { center: a.center, zoom: a.zoom, nonce: ++nonce } };
    case 'RESET_VIEW':
      return { ...s, selection: null, focus: { center: MUMBAI_CENTER, zoom: MUMBAI_ZOOM, nonce: ++nonce } };
    case 'TOGGLE_LAYER':
      return { ...s, layers: { ...s.layers, [a.layer]: !s.layers[a.layer] } };
    case 'SET_BASE':
      return { ...s, baseLayer: a.base, tileFallback: a.base === 'streets' ? s.tileFallback : false };
    case 'INCIDENT_STATUS': {
      const incidents = s.incidents.map((i) => (i.id === a.id ? { ...i, status: a.status } : i));
      // Recompute corridor congestion immediately so the effect of resolving is visible
      return { ...s, incidents, corridors: computeAllCorridors(s.minute, incidents, s.geometry) };
    }
    case 'DISMISS_INSIGHT':
      return s.dismissed.includes(a.id) ? s : { ...s, dismissed: [...s.dismissed, a.id] };
    case 'RESTORE_INSIGHT':
      return { ...s, dismissed: s.dismissed.filter((d) => d !== a.id) };
    case 'SET_GEOMETRY':
      return {
        ...s,
        geometry: { ...s.geometry, [a.id]: a.line },
        geometrySource: { ...s.geometrySource, [a.id]: 'osrm' },
      };
    case 'TILE_FALLBACK':
      return s.tileFallback ? s : { ...s, tileFallback: true, baseLayer: 'streets', toast: { id: ++nonce, text: 'Preferred basemap unreachable — switched to OpenStreetMap tiles.', tone: 'warn' } };
    case 'TOAST':
      return { ...s, toast: { id: ++nonce, text: a.text, tone: a.tone ?? 'info' } };
    case 'CLEAR_TOAST':
      return { ...s, toast: null };
    case 'RESET_SCENARIO': {
      const fresh = initialState();
      return { ...fresh, geometry: s.geometry, geometrySource: s.geometrySource, view: s.view, baseLayer: s.baseLayer, toast: { id: ++nonce, text: 'Demo scenario reset to 08:30.', tone: 'info' } };
    }
  }
}

const StateCtx = createContext<AppState | null>(null);
const DispatchCtx = createContext<Dispatch<Action> | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // Simulation clock
  useEffect(() => {
    if (!state.settings.running) return;
    const id = window.setInterval(() => dispatch({ type: 'TICK' }), state.settings.tickMs);
    return () => window.clearInterval(id);
  }, [state.settings.running, state.settings.tickMs]);

  // Hash routing (works on GitHub Pages without server rewrites)
  useEffect(() => {
    const want = `#/${state.view}`;
    if (location.hash !== want) history.replaceState(null, '', want);
  }, [state.view]);
  useEffect(() => {
    const on = () => dispatch({ type: 'SET_VIEW', view: readHashView() });
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  // Snap corridors to real road geometry (OSRM) — one request per corridor, staggered, cached.
  useEffect(() => {
    const ctrl = new AbortController();
    let failures = 0;
    CORRIDORS.forEach((c, i) => {
      window.setTimeout(async () => {
        if (ctrl.signal.aborted) return;
        try {
          const r = await fetchRoute(c.waypoints, ctrl.signal);
          dispatch({ type: 'SET_GEOMETRY', id: c.id, line: simplify(r.geometry) });
        } catch {
          if (ctrl.signal.aborted) return;
          failures++;
          if (failures === 1)
            dispatch({ type: 'TOAST', tone: 'warn', text: 'Road routing service unavailable — some corridors shown with approximate waypoint geometry.' });
        }
      }, 250 * i);
    });
    return () => ctrl.abort();
  }, []);

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useApp() {
  const s = useContext(StateCtx);
  if (!s) throw new Error('useApp outside provider');
  return s;
}
export function useDispatch() {
  const d = useContext(DispatchCtx);
  if (!d) throw new Error('useDispatch outside provider');
  return d;
}

/** Convenience selector with memo. */
export function useSelected() {
  const s = useApp();
  return useMemo(() => {
    const sel = s.selection;
    if (!sel) return null;
    if (sel.kind === 'vehicle') return { kind: sel.kind, vehicle: s.fleet.find((v) => v.id === sel.id) } as const;
    if (sel.kind === 'incident') return { kind: sel.kind, incident: s.incidents.find((i) => i.id === sel.id) } as const;
    if (sel.kind === 'corridor') return { kind: sel.kind, corridor: CORRIDORS.find((c) => c.id === sel.id) } as const;
    return { kind: sel.kind, id: sel.id } as const;
  }, [s.selection, s.fleet, s.incidents]);
}
