/**
 * Domain model for Mumbai Flow.
 * Every record shown in the UI is one of these types. Aggregates (totals, efficiency,
 * schedule variance…) are always *derived* from them — see src/engine.
 */

export type LatLng = [number, number];

export type VehicleType = 'bus' | 'ebus' | 'taxi' | 'emergency' | 'maintenance';
export type VehicleStatus = 'online' | 'delayed' | 'stopped' | 'offline';

export interface Place {
  id: string;
  name: string;
  area: string;
  position: LatLng;
}

export interface Corridor {
  id: string;
  name: string;
  shortName: string;
  /** Route label used for scheduled services on this corridor (e.g. "L12"). */
  routeCode: string;
  from: string;
  to: string;
  /** Hand-picked waypoints on real roads (fallback geometry). */
  waypoints: LatLng[];
  /** Free-flow travel time end-to-end in minutes (scenario assumption). */
  freeFlowMinutes: number;
  /** Baseline congestion sensitivity 0..1 (scenario assumption). */
  baseLoad: number;
  /** Peak hour weighting for morning (south-bound) vs evening. */
  peakBias: 'am' | 'pm' | 'both';
  /** Alternate corridor considered by the reroute simulator. */
  alternateId?: string;
}

export interface CorridorState {
  id: string;
  /** 0..100 simulated congestion score. */
  congestion: number;
  /** Average simulated speed in km/h. */
  avgSpeed: number;
  /** Current travel time end-to-end, minutes. */
  travelMinutes: number;
  /** Incident-induced extra load, 0..1. */
  incidentLoad: number;
}

export interface Vehicle {
  id: string;
  label: string;
  type: VehicleType;
  plate: string;
  corridorId: string;
  /** Position along corridor geometry, 0..1. */
  progress: number;
  direction: 1 | -1;
  /** Nominal free-flow speed km/h. */
  cruiseSpeed: number;
  speed: number;
  status: VehicleStatus;
  /** Positive = minutes behind schedule. */
  delayMin: number;
  /** Seated + standing capacity. 0 for non-passenger vehicles. */
  capacity: number;
  occupancy: number;
  nextStopId?: string;
  serviceStart: string;
  serviceEnd: string;
  gps: boolean;
  lte: boolean;
  /** Simulation minute of last update. */
  lastUpdate: number;
  /** Delay history (last N ticks) for the schedule-offset breakdown. */
  delayHistory: number[];
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'open' | 'acknowledged' | 'resolved';
export type IncidentType = 'congestion' | 'delay' | 'breakdown' | 'capacity' | 'closure' | 'waterlogging';

export interface Incident {
  id: string;
  type: IncidentType;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  position: LatLng;
  locationName: string;
  corridorId?: string;
  vehicleId?: string;
  stopIds?: string[];
  /** Simulation minute at which the incident started. */
  startedAt: number;
  /** Extra congestion the incident adds to its corridor while active, 0..1. */
  impact: number;
}

export interface Stop {
  id: string;
  name: string;
  position: LatLng;
  corridorId: string;
  /** Peak demand, passengers / hour (scenario assumption). */
  peakDemand: number;
}

export interface StopDemand {
  stopId: string;
  demand: number;
  capacity: number;
  waiting: number;
}

export type MaintenanceStatus = 'healthy' | 'due' | 'overdue' | 'in-service';

export interface MaintenanceRecord {
  vehicleId: string;
  odometerKm: number;
  lastServiceDay: string;
  nextServiceDay: string;
  battery?: number;
  brakeWear: number;
  tyreWear: number;
  status: MaintenanceStatus;
  note: string;
}

export type InsightKind = 'congestion' | 'schedule' | 'incident' | 'capacity' | 'maintenance';

export interface Insight {
  id: string;
  kind: InsightKind;
  title: string;
  subject: string;
  metric: string;
  reason: string;
  action: string;
  severity: Severity;
  /** 0..100 rule-based priority score. */
  priority: number;
  target: { kind: 'vehicle' | 'incident' | 'corridor' | 'stop'; id: string; position: LatLng };
  resolved: boolean;
}

export interface SimulationSettings {
  running: boolean;
  /** Real milliseconds between ticks. */
  tickMs: number;
  /** Simulated minutes advanced per tick. */
  minutesPerTick: number;
  seed: number;
}

export interface MetricPoint {
  minute: number;
  efficiency: number;
  intensity: number;
  passengers: number;
}

export type ViewId = 'live' | 'fleet' | 'routes' | 'analytics' | 'incidents' | 'maintenance' | 'operations' | 'data';

export type Selection =
  | { kind: 'vehicle'; id: string }
  | { kind: 'incident'; id: string }
  | { kind: 'corridor'; id: string }
  | { kind: 'place'; id: string }
  | null;

export type BaseLayerId = 'hybrid' | 'dark' | 'satellite' | 'streets';

export interface LayerVisibility {
  vehicles: boolean;
  corridors: boolean;
  incidents: boolean;
  stops: boolean;
  heat: boolean;
}
