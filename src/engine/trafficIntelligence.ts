import type { CorridorState, Incident, Insight, LatLng, MaintenanceRecord, Severity, StopDemand, Vehicle } from '../types';
import { CORRIDORS, STOPS, corridorById, stopById } from '../data/corridors';
import { corridorPoint, haversineKm } from '../utils/geo';
import { THRESHOLDS, WEIGHTS } from './config';
import { computeStopDemand } from './congestionEngine';
import type { Geometry } from './simulationEngine';

/**
 * Rule-based traffic intelligence.
 * ------------------------------------------------------------
 * This is deliberately NOT a machine-learning model. Each rule reads the demo records,
 * compares them with a threshold from engine/config.ts and emits an explainable Insight
 * (what was observed, why the rule fired, what to consider doing).
 *
 * The public surface is `analyse(context)`. A future analytics / ML service only needs to
 * return the same `Insight[]` shape to replace this module.
 */

export interface IntelligenceContext {
  fleet: Vehicle[];
  corridors: Record<string, CorridorState>;
  incidents: Incident[];
  maintenance: MaintenanceRecord[];
  geometry: Geometry;
  minute: number;
  dismissed: string[];
}

export const vehiclePosition = (v: Vehicle, geometry: Geometry): LatLng =>
  corridorPoint(geometry[v.corridorId] ?? corridorById(v.corridorId).waypoints, v.progress);

const sevFromScore = (score: number, warn: number, crit: number): Severity =>
  score >= crit ? 'critical' : score >= warn ? 'high' : 'medium';

/** Compare a corridor with its configured alternate and estimate a reroute saving. */
export function rerouteEstimate(corridorId: string, corridors: Record<string, CorridorState>) {
  const c = corridorById(corridorId);
  if (!c.alternateId) return null;
  const a = corridorById(c.alternateId);
  const base = corridors[c.id];
  const alt = corridors[a.id];
  // Scenario assumptions:
  //  - services diverted onto the alternate add +8 congestion points to it;
  //  - the same trip via the alternate is 10 % longer (detour) and runs at the alternate's
  //    current delay ratio (travel time / free-flow time).
  const altAfter = Math.min(99, alt.congestion + 8);
  const altTravelAfter = alt.travelMinutes * (1 + (altAfter - alt.congestion) / 140);
  const altMinutes = c.freeFlowMinutes * 1.1 * (altTravelAfter / a.freeFlowMinutes);
  return {
    corridor: c,
    alternate: a,
    baseMinutes: base.travelMinutes,
    altMinutes,
    baseCongestion: base.congestion,
    altCongestion: alt.congestion,
    altCongestionAfter: altAfter,
    savingMinutes: base.travelMinutes - altMinutes,
  };
}

export function incidentPriority(i: Incident, minute: number) {
  if (i.status === 'resolved') return 0;
  const duration = Math.min(WEIGHTS.maxDurationPoints, (minute - i.startedAt) * WEIGHTS.perMinuteOpen);
  return Math.min(
    100,
    Math.round(WEIGHTS.severity[i.severity] + duration + i.impact * WEIGHTS.impactPoints + (i.status === 'open' ? WEIGHTS.unacknowledgedBonus : 0)),
  );
}

/** Data-grounded operator recommendation for an incident. */
export function recommendAction(i: Incident, ctx: IntelligenceContext): string {
  const veh = i.vehicleId ? ctx.fleet.find((v) => v.id === i.vehicleId) : undefined;
  switch (i.type) {
    case 'breakdown': {
      const service = ctx.fleet
        .filter((v) => v.type === 'maintenance' && v.status !== 'offline')
        .map((v) => ({ v, d: haversineKm(vehiclePosition(v, ctx.geometry), i.position) }))
        .sort((a, b) => a.d - b.d)[0];
      const following = ctx.fleet.filter((v) => v.corridorId === i.corridorId && v.capacity > 0 && v.id !== i.vehicleId && v.status !== 'offline').length;
      return service
        ? `Dispatch ${service.v.label} (${service.d.toFixed(1)} km away) for recovery; advise ${following} following service${following === 1 ? '' : 's'} on ${corridorById(i.corridorId!).routeCode} to use the right lane.`
        : 'No service vehicle available — request external towing and hold following services.';
    }
    case 'delay': {
      if (!veh) return 'Review the service timetable.';
      const next = veh.nextStopId ? stopById(veh.nextStopId)?.name : undefined;
      return veh.delayMin >= THRESHOLDS.delayCritical
        ? `Short-turn ${veh.label} at ${next ?? 'the next terminal'} and insert a reserve bus to restore the ${corridorById(veh.corridorId).routeCode} headway (currently +${veh.delayMin.toFixed(1)} min).`
        : `Hold the following ${corridorById(veh.corridorId).routeCode} service ~2 min to even out headways (delay +${veh.delayMin.toFixed(1)} min).`;
    }
    case 'capacity': {
      const stops = (i.stopIds ?? []).map((id) => ({ s: stopById(id)!, d: computeStopDemand(stopById(id)!, STOPS.findIndex((x) => x.id === id), ctx.minute, ctx.fleet) }));
      const waiting = stops.reduce((a, b) => a + b.d.waiting, 0);
      const reserve = ctx.fleet
        .filter((v) => v.type === 'ebus' && v.status !== 'offline')
        .map((v) => ({ v, d: haversineKm(vehiclePosition(v, ctx.geometry), i.position) }))
        .sort((a, b) => a.d - b.d)[0];
      return reserve
        ? `Dispatch reserve ${reserve.v.label} (${reserve.d.toFixed(1)} km away) to ${stops.map((s) => s.s.name).join(' & ')} — ≈${waiting} passengers estimated waiting.`
        : `Request an additional bus for ${stops.map((s) => s.s.name).join(' & ')}.`;
    }
    case 'congestion':
    case 'closure':
    case 'waterlogging': {
      if (!i.corridorId) return 'Monitor the location.';
      const est = rerouteEstimate(i.corridorId, ctx.corridors);
      if (est && est.savingMinutes > 1) {
        return `Review diverting ${est.corridor.routeCode} services via ${est.alternate.name}. Simulation-only comparison: ~${est.savingMinutes.toFixed(0)} min/trip under scenario assumptions (simulated congestion ${est.baseCongestion.toFixed(0)} vs ${est.altCongestionAfter.toFixed(0)}); not a measured saving.`;
      }
      const c = ctx.corridors[i.corridorId];
      return `Alternate route offers no gain right now — request a signal-timing review at ${i.locationName} and post a ${Math.round(c.travelMinutes - corridorById(i.corridorId).freeFlowMinutes)} min delay advisory.`;
    }
  }
}

export function analyse(ctx: IntelligenceContext): Insight[] {
  const out: Insight[] = [];
  const dismissed = new Set(ctx.dismissed);

  // 1. Congestion detection
  CORRIDORS.forEach((c) => {
    const s = ctx.corridors[c.id];
    if (s.congestion < THRESHOLDS.congestionWarn) return;
    const est = rerouteEstimate(c.id, ctx.corridors);
    const mid = corridorPoint(ctx.geometry[c.id] ?? c.waypoints, 0.5);
    out.push({
      id: `cong-${c.id}`,
      kind: 'congestion',
      title: `${c.shortName} congestion above threshold`,
      subject: `${c.name} (${c.routeCode})`,
      metric: `Score ${s.congestion.toFixed(0)}/100 · ${s.avgSpeed.toFixed(0)} km/h · ${s.travelMinutes.toFixed(0)} min end-to-end`,
      reason: `Simulated congestion ${s.congestion.toFixed(0)} ≥ ${THRESHOLDS.congestionWarn} threshold${s.incidentLoad > 0 ? `; active incidents add ${(s.incidentLoad * 100).toFixed(0)} pts` : ''}.`,
      action:
        est && est.savingMinutes > 1
          ? `Review diversion via ${est.alternate.shortName} — simulation suggests ~${est.savingMinutes.toFixed(0)} min/trip under scenario assumptions (not measured).`
          : 'Alternate offers no gain; issue a delay advisory and review signal timing.',
      severity: sevFromScore(s.congestion, THRESHOLDS.congestionWarn, THRESHOLDS.congestionCritical),
      priority: Math.round(s.congestion * 0.8),
      target: { kind: 'corridor', id: c.id, position: mid },
      resolved: false,
    });
  });

  // 2. Schedule deviation
  ctx.fleet
    .filter((v) => v.capacity > 0 && v.status !== 'offline' && v.delayMin > THRESHOLDS.delayWarn)
    .forEach((v) => {
      const c = corridorById(v.corridorId);
      const sev = v.delayMin >= THRESHOLDS.delayCritical ? 'high' : 'medium';
      out.push({
        id: `delay-${v.id}`,
        kind: 'schedule',
        title: `${v.label} is ${v.delayMin.toFixed(0)} min behind schedule`,
        subject: `${c.routeCode} · ${c.name}`,
        metric: `+${v.delayMin.toFixed(1)} min · ${v.speed} km/h · corridor ${ctx.corridors[c.id].congestion.toFixed(0)}/100`,
        reason: `Delay exceeds the ${THRESHOLDS.delayWarn} min schedule-deviation threshold.`,
        action:
          v.delayMin >= THRESHOLDS.delayCritical
            ? 'Short-turn at the next stop and insert a reserve vehicle.'
            : 'Hold the following service ~2 min to even out headways.',
        severity: sev,
        priority: Math.min(95, Math.round(30 + v.delayMin * 3)),
        target: { kind: 'vehicle', id: v.id, position: vehiclePosition(v, ctx.geometry) },
        resolved: false,
      });
    });

  // 3. Incident prioritisation
  ctx.incidents.forEach((i) => {
    out.push({
      id: `inc-${i.id}`,
      kind: 'incident',
      title: i.title,
      subject: i.locationName,
      metric: i.status === 'resolved' ? 'Resolved' : `Open ${ctx.minute - i.startedAt} min · impact +${(i.impact * 100).toFixed(0)} pts`,
      reason: `Priority = severity (${WEIGHTS.severity[i.severity]}) + duration + impact${i.status === 'open' ? ' + unacknowledged' : ''}.`,
      action: recommendAction(i, ctx),
      severity: i.severity,
      priority: incidentPriority(i, ctx.minute),
      target: { kind: 'incident', id: i.id, position: i.position },
      resolved: i.status === 'resolved',
    });
  });

  // 4. Demand-capacity warning
  STOPS.forEach((st, idx) => {
    const d: StopDemand = computeStopDemand(st, idx, ctx.minute, ctx.fleet);
    const ratio = d.capacity ? d.demand / d.capacity : 9;
    if (ratio < THRESHOLDS.demandRatioWarn) return;
    out.push({
      id: `cap-${st.id}`,
      kind: 'capacity',
      title: `Demand exceeds capacity at ${st.name}`,
      subject: `${corridorById(st.corridorId).routeCode} · ${st.name}`,
      metric: `${d.demand} pax/h demand vs ${d.capacity} pax/h capacity (×${ratio > 8 ? '∞' : ratio.toFixed(2)})`,
      reason: `Demand/capacity ratio ≥ ${THRESHOLDS.demandRatioWarn.toFixed(2)}.`,
      action: `Deploy reserve capacity — ≈${d.waiting} passengers estimated waiting.`,
      severity: ratio >= THRESHOLDS.demandRatioCritical ? 'high' : 'medium',
      priority: Math.min(90, Math.round(25 + ratio * 25)),
      target: { kind: 'stop', id: st.id, position: st.position },
      resolved: false,
    });
  });

  // 5. Maintenance
  ctx.maintenance
    .filter((m) => m.status === 'overdue' || m.brakeWear >= THRESHOLDS.wearCritical)
    .forEach((m) => {
      const v = ctx.fleet.find((x) => x.id === m.vehicleId);
      if (!v) return;
      out.push({
        id: `mnt-${m.vehicleId}`,
        kind: 'maintenance',
        title: `${v.label} needs workshop attention`,
        subject: `${v.label} · ${corridorById(v.corridorId).routeCode}`,
        metric: `Brakes ${m.brakeWear}% · tyres ${m.tyreWear}% · next service ${m.nextServiceDay}`,
        reason: m.brakeWear >= THRESHOLDS.wearCritical ? `Brake wear ≥ ${THRESHOLDS.wearCritical}%.` : 'Service date has passed.',
        action: 'Schedule a workshop slot after the current duty.',
        severity: m.brakeWear >= THRESHOLDS.wearCritical ? 'high' : 'low',
        priority: m.brakeWear >= THRESHOLDS.wearCritical ? 55 : 25,
        target: { kind: 'vehicle', id: v.id, position: vehiclePosition(v, ctx.geometry) },
        resolved: false,
      });
    });

  return out
    .map((x) => (dismissed.has(x.id) ? { ...x, resolved: true } : x))
    .sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.priority - a.priority);
}
