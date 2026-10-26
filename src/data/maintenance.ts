import type { MaintenanceRecord, MaintenanceStatus, Vehicle } from '../types';
import { createRng } from '../utils/random';

/**
 * Fictional maintenance records for the demo fleet. Condition values are generated from a
 * seed; status is derived from wear / service dates by `deriveStatus` so the table stays coherent.
 */
export function deriveStatus(r: Pick<MaintenanceRecord, 'brakeWear' | 'tyreWear' | 'nextServiceDay' | 'battery'>, today: string): MaintenanceStatus {
  if (r.nextServiceDay < today || r.brakeWear > 85 || r.tyreWear > 90) return 'overdue';
  const days = (Date.parse(r.nextServiceDay) - Date.parse(today)) / 86400000;
  if (days <= 7 || r.brakeWear > 70 || r.tyreWear > 75 || (r.battery !== undefined && r.battery < 75)) return 'due';
  return 'healthy';
}

const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10);

export function buildMaintenance(fleet: Vehicle[], today: string, seed = 77): MaintenanceRecord[] {
  const rng = createRng(seed);
  return fleet.map((v, i) => {
    const last = addDays(today, -rng.int(5, 80));
    const next = addDays(last, rng.int(60, 90));
    const rec = {
      vehicleId: v.id,
      odometerKm: rng.int(18000, 240000),
      lastServiceDay: last,
      nextServiceDay: next,
      battery: v.type === 'ebus' ? rng.int(68, 99) : undefined,
      brakeWear: rng.int(12, 78),
      tyreWear: rng.int(10, 80),
      status: 'healthy' as MaintenanceStatus,
      note: '',
    };
    if (i === 3) {
      // The stalled bus from incident INC-2043
      rec.brakeWear = 91;
      rec.status = 'in-service';
      rec.note = 'Brake-pressure warning raised on route. Recovery requested.';
      return rec;
    }
    rec.status = deriveStatus(rec, today);
    rec.note =
      rec.status === 'overdue'
        ? 'Service interval exceeded — schedule workshop slot.'
        : rec.status === 'due'
          ? 'Inspection due within the week.'
          : 'No open items.';
    return rec;
  });
}
