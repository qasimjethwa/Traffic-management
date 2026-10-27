import type { Corridor, Stop } from '../types';

/**
 * Major Mumbai road corridors.
 * `waypoints` are hand-placed points on the real roads (approximate). At start-up the app
 * tries to snap each corridor to actual road geometry using the public OSRM demo server
 * (see services/routing/osrm.ts); if that fails these waypoints are drawn instead and the
 * UI labels the geometry as approximate.
 *
 * freeFlowMinutes / baseLoad / peakBias are scenario assumptions for the demo simulation.
 */
import reference from './reference/corridors.json';

/** Major Mumbai road corridors, loaded from the shared reference file (also read by the backend importer). */
export const CORRIDORS: Corridor[] = (reference.corridors as unknown as Corridor[]).map((c) => ({ ...c }));

export const corridorById = (id: string) => CORRIDORS.find((c) => c.id === id)!;

/** Demonstration stops — real locations, scenario demand figures. */
export const STOPS: Stop[] = [
  { id: 'st-andheri', name: 'Andheri (E) — WEH', position: [19.1150, 72.8560], corridorId: 'weh', peakDemand: 1650 },
  { id: 'st-goregaon', name: 'Goregaon Hub', position: [19.1660, 72.8600], corridorId: 'weh', peakDemand: 980 },
  { id: 'st-borivali', name: 'Borivali (E)', position: [19.2290, 72.8660], corridorId: 'weh', peakDemand: 900 },
  { id: 'st-ghatkopar', name: 'Ghatkopar Depot', position: [19.0870, 72.9050], corridorId: 'lbs', peakDemand: 1500 },
  { id: 'st-kurla', name: 'Kurla Station (W)', position: [19.0700, 72.8800], corridorId: 'lbs', peakDemand: 1750 },
  { id: 'st-bkc', name: 'BKC — G Block', position: [19.0710, 72.8720], corridorId: 'sclr', peakDemand: 1350 },
  { id: 'st-powai', name: 'Powai — Hiranandani', position: [19.1230, 72.9000], corridorId: 'jvlr', peakDemand: 1100 },
  { id: 'st-thane', name: 'Thane — Teen Hath Naka', position: [19.1950, 72.9630], corridorId: 'eeh', peakDemand: 1250 },
  { id: 'st-worli', name: 'Worli Naka', position: [19.0170, 72.8440], corridorId: 'dadar-south', peakDemand: 1200 },
  { id: 'st-csmt', name: 'CSMT', position: [18.9400, 72.8350], corridorId: 'dadar-south', peakDemand: 2100 },
  { id: 'st-vashi', name: 'Vashi Plaza', position: [19.0720, 72.9920], corridorId: 'sion-panvel', peakDemand: 850 },
];

export const stopById = (id: string) => STOPS.find((s) => s.id === id);
