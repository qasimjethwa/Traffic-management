import type { Vehicle, VehicleType } from '../types';
import { createRng } from '../utils/random';
import { STOPS } from './corridors';

/**
 * Fleet composition for the demo scenario. Change these numbers to resize the fleet —
 * every total in the UI is computed from the generated list, never hard-coded.
 */
export const FLEET_CONFIG: Record<VehicleType, { count: number; corridors: string[] }> = {
  bus: { count: 16, corridors: ['weh', 'svr', 'eeh', 'lbs', 'dadar-south', 'sion-panvel', 'jvlr'] },
  ebus: { count: 6, corridors: ['bwsl', 'sclr', 'jvlr', 'weh'] },
  taxi: { count: 12, corridors: ['weh', 'bwsl', 'sclr', 'eeh', 'svr', 'dadar-south'] },
  emergency: { count: 3, corridors: ['eeh', 'weh', 'dadar-south'] },
  maintenance: { count: 3, corridors: ['lbs', 'svr', 'sion-panvel'] },
};

export const SCENARIO_SEED = 4022;

const TYPE_PREFIX: Record<VehicleType, string> = {
  bus: 'Bus',
  ebus: 'E-Bus',
  taxi: 'Cab',
  emergency: 'Rescue',
  maintenance: 'Service',
};

const CAPACITY: Record<VehicleType, number> = { bus: 72, ebus: 60, taxi: 0, emergency: 0, maintenance: 0 };
const CRUISE: Record<VehicleType, [number, number]> = {
  bus: [28, 38],
  ebus: [30, 40],
  taxi: [34, 48],
  emergency: [45, 60],
  maintenance: [25, 32],
};

/** Generates the initial demo fleet. Pure & deterministic for a given seed. */
export function buildFleet(seed = SCENARIO_SEED): Vehicle[] {
  const rng = createRng(seed);
  const out: Vehicle[] = [];
  const usedNumbers = new Set<number>();
  (Object.keys(FLEET_CONFIG) as VehicleType[]).forEach((type) => {
    const { count, corridors } = FLEET_CONFIG[type];
    for (let i = 0; i < count; i++) {
      let n = rng.int(1000, 9899);
      while (usedNumbers.has(n)) n++;
      usedNumbers.add(n);
      const corridorId = corridors[i % corridors.length];
      const cruise = rng.range(...CRUISE[type]);
      const stops = STOPS.filter((s) => s.corridorId === corridorId);
      const startH = rng.int(5, 7);
      const capacity = CAPACITY[type];
      out.push({
        id: `${type}-${n}`,
        label: `${TYPE_PREFIX[type]} ${n}`,
        type,
        plate: `${rng.pick(['L', 'R'])} ${rng.int(30000, 59999)}`,
        corridorId,
        progress: rng.range(0.04, 0.96),
        direction: rng.next() > 0.5 ? 1 : -1,
        cruiseSpeed: Math.round(cruise),
        speed: Math.round(cruise * 0.7),
        status: 'online',
        delayMin: capacity ? Math.round(rng.range(-2, 4) * 10) / 10 : 0,
        capacity,
        occupancy: capacity ? Math.round(capacity * rng.range(0.35, 0.8)) : 0,
        nextStopId: stops.length ? rng.pick(stops).id : undefined,
        serviceStart: `${String(startH).padStart(2, '0')}:${rng.pick(['00', '15', '30', '45'])}`,
        serviceEnd: `${rng.int(21, 23)}:${rng.pick(['00', '30'])}`,
        gps: true,
        lte: true,
        lastUpdate: 0,
        delayHistory: [],
      });
    }
  });

  return out;
}

/**
 * Scenario anchors — applied after the warm-up run so a few vehicles start the demo in the
 * specific conditions that the incident set (data/incidents.ts) refers to.
 */
export function applyScenarioAnchors(out: Vehicle[]) {
  const pin = (index: number, patch: Partial<Vehicle>) => Object.assign(out[index], patch);
  pin(0, { corridorId: 'weh', progress: 0.27, delayMin: 15, nextStopId: 'st-andheri', direction: 1 }); // late bus on WEH
  pin(3, { corridorId: 'lbs', progress: 0.22, status: 'stopped', speed: 0, delayMin: 9, nextStopId: 'st-ghatkopar' }); // breakdown
  pin(4, { corridorId: 'dadar-south', progress: 0.9, occupancy: 71, nextStopId: 'st-csmt' }); // crowded
  pin(10, { status: 'offline', gps: false, lte: false, speed: 0 });
  pin(17, { status: 'offline', lte: false, speed: 0 });
  pin(25, { status: 'offline', gps: false, speed: 0 });
  pin(36, { status: 'offline', lte: false, speed: 0 });
  return out;
}
