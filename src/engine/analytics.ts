import type { Incident, MetricPoint, Vehicle } from '../types';
import { CORRIDORS } from '../data/corridors';
import { computeCorridorState } from './congestionEngine';
import type { Geometry } from './simulationEngine';

/**
 * Analytics derivations used by the Analytics and Operations pages.
 * All inputs are the live demo records; nothing is pre-baked.
 */

export type RangeId = '30m' | '1h' | '3h' | 'all';
export const RANGES: { id: RangeId; label: string; minutes: number }[] = [
  { id: '30m', label: '30 min', minutes: 30 },
  { id: '1h', label: '1 h', minutes: 60 },
  { id: '3h', label: '3 h', minutes: 180 },
  { id: 'all', label: 'Since 06:00', minutes: Infinity },
];

export function sliceHistory(history: MetricPoint[], now: number, range: RangeId) {
  const r = RANGES.find((x) => x.id === range)!;
  return history.filter((p) => p.minute > now - r.minutes);
}

/**
 * Congestion timeline for one corridor, recomputed with the same deterministic model the
 * simulation uses. Incidents only count from their start minute onwards.
 */
export function corridorTimeline(corridorId: string, from: number, to: number, incidents: Incident[], geometry: Geometry, step = 2) {
  const idx = CORRIDORS.findIndex((c) => c.id === corridorId);
  const c = CORRIDORS[idx];
  const out: { minute: number; value: number }[] = [];
  for (let m = from; m <= to; m += step) {
    const active = incidents.filter((i) => i.startedAt <= m);
    out.push({ minute: m, value: computeCorridorState(c, idx, m, active, geometry[c.id]).congestion });
  }
  return out;
}

export const DELAY_BUCKETS = [
  { id: 'early', label: 'Early', test: (d: number) => d < -1.5 },
  { id: 'ontime', label: 'On time', test: (d: number) => d >= -1.5 && d <= 2 },
  { id: 'slight', label: '+2–5 min', test: (d: number) => d > 2 && d <= 5 },
  { id: 'late', label: '+5–10 min', test: (d: number) => d > 5 && d <= 10 },
  { id: 'very', label: '> 10 min', test: (d: number) => d > 10 },
];

export function delayDistribution(fleet: Vehicle[]) {
  const pax = fleet.filter((v) => v.capacity > 0 && v.status !== 'offline');
  return DELAY_BUCKETS.map((b) => ({ bucket: b.label, id: b.id, count: pax.filter((v) => b.test(v.delayMin)).length }));
}
