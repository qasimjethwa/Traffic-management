import type { Corridor, CorridorState, Incident, LatLng, Stop, StopDemand, Vehicle } from '../types';
import { noise } from '../utils/random';
import { polylineLengthKm } from '../utils/geo';
import { DEMAND_MODEL } from './config';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2));

/**
 * Time-of-day travel demand factor, 0.25 (night) … ~1.15 (peak).
 * Scenario assumption: morning peak ≈ 09:30, evening peak ≈ 19:00.
 */
export function timeOfDayFactor(minute: number, bias: Corridor['peakBias'] = 'both') {
  const h = (minute / 60) % 24;
  const am = gauss(h, 9.5, 1.3) * (bias === 'pm' ? 0.75 : 1);
  const pm = gauss(h, 19, 1.6) * (bias === 'am' ? 0.75 : 1);
  const midday = gauss(h, 14, 3) * 0.45;
  return 0.25 + 0.9 * Math.max(am, pm) + midday * 0.5;
}

/** Incident load on a corridor = sum of active incidents' impact (acknowledged still counts). */
export function incidentLoad(corridorId: string, incidents: Incident[]) {
  return incidents
    .filter((i) => i.corridorId === corridorId && i.status !== 'resolved')
    .reduce((s, i) => s + i.impact, 0);
}

/** Simulated congestion state for a corridor at a given minute. Deterministic. */
export function computeCorridorState(
  corridor: Corridor,
  index: number,
  minute: number,
  incidents: Incident[],
  geometry: LatLng[],
): CorridorState {
  const tod = timeOfDayFactor(minute, corridor.peakBias);
  const inc = incidentLoad(corridor.id, incidents);
  const raw = corridor.baseLoad * tod + noise(index + 1, minute) * 0.06 + inc;
  const congestion = clamp(raw * 100, 4, 99);
  const freeSpeed = (polylineLengthKm(geometry) / corridor.freeFlowMinutes) * 60;
  const avgSpeed = Math.max(6, freeSpeed * (1 - 0.62 * (congestion / 100) ** 1.5));
  const travelMinutes = (polylineLengthKm(geometry) / avgSpeed) * 60;
  return { id: corridor.id, congestion, avgSpeed, travelMinutes, incidentLoad: inc };
}

export function congestionLevel(score: number): 'free' | 'moderate' | 'heavy' | 'severe' {
  if (score < 45) return 'free';
  if (score < 65) return 'moderate';
  if (score < 80) return 'heavy';
  return 'severe';
}

/**
 * Demand vs capacity per stop.
 * demand   = peakDemand × time-of-day factor (+ small deterministic noise)
 * capacity = Σ active buses on the corridor × free seats × trips/hr × boarding share × buses represented
 */
export function computeStopDemand(stop: Stop, idx: number, minute: number, fleet: Vehicle[]): StopDemand {
  const demand = Math.round(stop.peakDemand * timeOfDayFactor(minute) * (1 + noise(idx + 40, minute) * 0.08));
  const buses = fleet.filter(
    (v) => v.corridorId === stop.corridorId && v.capacity > 0 && v.status !== 'offline' && v.status !== 'stopped',
  );
  const capacity = Math.round(
    buses.reduce((s, v) => s + Math.max(v.capacity - v.occupancy * 0.5, 8), 0) *
      DEMAND_MODEL.tripsPerBusPerHour *
      DEMAND_MODEL.boardingShare *
      DEMAND_MODEL.busesRepresented,
  );
  const waiting = Math.max(0, Math.round((demand - capacity) / 4));
  return { stopId: stop.id, demand, capacity, waiting };
}
