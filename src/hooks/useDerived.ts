import { useMemo } from 'react';
import { useApp } from '../app/store';
import { analyse, vehiclePosition } from '../engine/trafficIntelligence';
import { computeStopDemand } from '../engine/congestionEngine';
import { STOPS } from '../data/corridors';
import type { VehicleType } from '../types';

/** Rule-based insights, recomputed whenever the underlying records change. */
export function useInsights() {
  const s = useApp();
  return useMemo(
    () =>
      analyse({
        fleet: s.fleet,
        corridors: s.corridors,
        incidents: s.incidents,
        maintenance: s.maintenance,
        geometry: s.geometry,
        minute: s.minute,
        dismissed: s.dismissed,
      }),
    [s.fleet, s.corridors, s.incidents, s.maintenance, s.geometry, s.minute, s.dismissed],
  );
}

/** Fleet totals — derived from the vehicle list. */
export function useFleetTotals() {
  const { fleet } = useApp();
  return useMemo(() => {
    const byType = {} as Record<VehicleType, number>;
    fleet.forEach((v) => (byType[v.type] = (byType[v.type] ?? 0) + 1));
    const offline = fleet.filter((v) => v.status === 'offline').length;
    const delayed = fleet.filter((v) => v.status === 'delayed').length;
    const stopped = fleet.filter((v) => v.status === 'stopped').length;
    const pax = fleet.filter((v) => v.capacity > 0 && v.status !== 'offline');
    const avgDelay = pax.length ? pax.reduce((a, v) => a + v.delayMin, 0) / pax.length : 0;
    const avgAbsDelay = pax.length ? pax.reduce((a, v) => a + Math.abs(v.delayMin), 0) / pax.length : 0;
    return { total: fleet.length, byType, online: fleet.length - offline, offline, delayed, stopped, avgDelay, avgAbsDelay };
  }, [fleet]);
}

export function useVehiclePositions() {
  const { fleet, geometry } = useApp();
  return useMemo(() => new Map(fleet.map((v) => [v.id, vehiclePosition(v, geometry)])), [fleet, geometry]);
}

export function useStopDemand() {
  const { fleet, minute } = useApp();
  return useMemo(() => STOPS.map((s, i) => ({ stop: s, ...computeStopDemand(s, i, minute, fleet) })), [fleet, minute]);
}
