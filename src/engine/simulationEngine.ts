import type { CorridorState, Incident, LatLng, MetricPoint, Vehicle } from '../types';
import { CORRIDORS, STOPS } from '../data/corridors';
import { polylineLengthKm } from '../utils/geo';
import { noise } from '../utils/random';
import { computeCorridorState, computeStopDemand, timeOfDayFactor } from './congestionEngine';
import { SIM_DEFAULTS, THRESHOLDS, WEIGHTS } from './config';

/**
 * Deterministic demo simulation.
 * One tick advances the simulated clock by `dt` minutes, recomputes every corridor's
 * congestion, then moves each vehicle along its corridor geometry at a speed reduced by
 * that congestion. Schedule delay drifts with congestion; it partially recovers at terminals.
 * Nothing here is live data.
 */

export type Geometry = Record<string, LatLng[]>;

export function computeAllCorridors(minute: number, incidents: Incident[], geometry: Geometry) {
  const out: Record<string, CorridorState> = {};
  CORRIDORS.forEach((c, i) => {
    out[c.id] = computeCorridorState(c, i, minute, incidents, geometry[c.id] ?? c.waypoints);
  });
  return out;
}

export function stepVehicles(
  fleet: Vehicle[],
  corridors: Record<string, CorridorState>,
  incidents: Incident[],
  geometry: Geometry,
  minute: number,
  dt: number,
): Vehicle[] {
  const brokenIds = new Set(
    incidents.filter((i) => i.type === 'breakdown' && i.status !== 'resolved' && i.vehicleId).map((i) => i.vehicleId!),
  );
  return fleet.map((v, idx) => {
    if (v.status === 'offline') return v;
    if (brokenIds.has(v.id)) {
      return { ...v, status: 'stopped', speed: 0, lastUpdate: minute, delayMin: round1(v.delayMin + dt * 0.4), delayHistory: pushHist(v.delayHistory, v.delayMin) };
    }
    const cs = corridors[v.corridorId];
    const line = geometry[v.corridorId] ?? CORRIDORS.find((c) => c.id === v.corridorId)!.waypoints;
    const len = polylineLengthKm(line);
    const jitter = 1 + noise(idx * 7 + 3, minute) * 0.12;
    const priority = v.type === 'emergency' ? 0.55 : 1; // emergency vehicles less affected
    const speed = Math.max(4, v.cruiseSpeed * (1 - 0.7 * priority * (cs.congestion / 100) ** 1.3) * jitter);
    let progress = v.progress + (v.direction * speed * dt) / 60 / len;
    let direction = v.direction;
    let delay = v.delayMin;
    if (v.capacity > 0) {
      // congestion above ~45 adds delay, below recovers it
      delay += dt * ((cs.congestion - 45) / 100) * 0.55 + noise(idx + 90, minute) * 0.05;
    }
    if (progress >= 1 || progress <= 0) {
      progress = progress >= 1 ? 1 - (progress - 1) : -progress;
      direction = (direction * -1) as 1 | -1;
      delay = delay * 0.5; // terminal layover recovery
    }
    delay = Math.max(-3, Math.min(30, delay));
    const occTarget = v.capacity * Math.min(1, 0.3 + 0.6 * timeOfDayFactor(minute) * (0.8 + noise(idx, minute) * 0.2));
    const occupancy = v.capacity ? Math.round(v.occupancy + (occTarget - v.occupancy) * 0.08 * dt) : 0;
    const status = v.capacity > 0 && delay > THRESHOLDS.delayWarn ? 'delayed' : 'online';
    return {
      ...v,
      progress,
      direction,
      speed: Math.round(speed),
      delayMin: round1(delay),
      occupancy,
      status,
      lastUpdate: minute,
      delayHistory: pushHist(v.delayHistory, round1(delay)),
    };
  });
}

const round1 = (n: number) => Math.round(n * 10) / 10;
function pushHist(h: number[], v: number) {
  const n = [...h, v];
  return n.length > SIM_DEFAULTS.delayHistoryLength ? n.slice(-SIM_DEFAULTS.delayHistoryLength) : n;
}

/**
 * Operational efficiency (0–100), derived from the fleet and corridors:
 *   onTimeShare  = active passenger vehicles within the on-time window / active passenger vehicles
 *   speedRatio   = mean(corridor avgSpeed / free-flow speed)
 *   efficiency   = onTimeShare × w + speedRatio × (1 − w)
 */
export function computeEfficiency(fleet: Vehicle[], corridors: Record<string, CorridorState>, geometry: Geometry) {
  const active = fleet.filter((v) => v.capacity > 0 && v.status !== 'offline');
  const onTime = active.filter((v) => v.status !== 'stopped' && v.delayMin >= THRESHOLDS.onTimeEarly && v.delayMin <= THRESHOLDS.onTimeLate);
  const onTimeShare = active.length ? onTime.length / active.length : 1;
  const ratios = CORRIDORS.map((c) => {
    const free = (polylineLengthKm(geometry[c.id] ?? c.waypoints) / c.freeFlowMinutes) * 60;
    return Math.min(1, corridors[c.id].avgSpeed / free);
  });
  const speedRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const w = WEIGHTS.efficiencyOnTime;
  return Math.round((onTimeShare * w + speedRatio * (1 - w)) * 1000) / 10;
}

/** Network traffic intensity = mean corridor congestion. */
export function computeIntensity(corridors: Record<string, CorridorState>) {
  const vals = Object.values(corridors).map((c) => c.congestion);
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/** Passengers boarding per minute across all demo stops (demand model, capped by capacity). */
export function boardingsPerMinute(fleet: Vehicle[], minute: number) {
  return STOPS.reduce((s, st, i) => {
    const d = computeStopDemand(st, i, minute, fleet);
    return s + Math.min(d.demand, d.capacity) / 60;
  }, 0) * 22; // each demo stop stands in for ~22 real stops on its corridor (scenario assumption)
}

export interface SimSnapshot {
  fleet: Vehicle[];
  corridors: Record<string, CorridorState>;
  minute: number;
  history: MetricPoint[];
  passengersToday: number;
}

/** Advance a full snapshot by one tick. */
export function tick(s: SimSnapshot, incidents: Incident[], geometry: Geometry, dt: number): SimSnapshot {
  const minute = s.minute + dt;
  const corridors = computeAllCorridors(minute, incidents, geometry);
  const fleet = stepVehicles(s.fleet, corridors, incidents, geometry, minute, dt);
  const boarding = boardingsPerMinute(fleet, minute) * dt;
  const passengersToday = s.passengersToday + boarding;
  const point: MetricPoint = {
    minute,
    efficiency: computeEfficiency(fleet, corridors, geometry),
    intensity: computeIntensity(corridors),
    passengers: Math.round(boarding / dt),
  };
  const history = [...s.history, point].slice(-SIM_DEFAULTS.historyLength * 2);
  return { fleet, corridors, minute, history, passengersToday };
}

/**
 * Warm-up: runs the same simulation from `fromMinute` to `toMinute` so that the
 * efficiency / intensity / passenger history shown on load is produced by the model itself
 * rather than drawn by hand.
 */
export function warmUp(fleet: Vehicle[], incidents: Incident[], geometry: Geometry, fromMinute: number, toMinute: number, step = 2): SimSnapshot {
  // Passenger counting starts at 05:00
  let passengers = 0;
  for (let m = 5 * 60; m < fromMinute; m += 5) passengers += boardingsPerMinute(fleet, m) * 5;
  let s: SimSnapshot = { fleet, corridors: computeAllCorridors(fromMinute, incidents, geometry), minute: fromMinute, history: [], passengersToday: passengers };
  // Before the scenario start no incidents are active
  while (s.minute < toMinute) s = tick(s, [], geometry, step);
  return s;
}
