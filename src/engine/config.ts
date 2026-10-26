/**
 * Every threshold and weight used by the simulation and the rule-based intelligence
 * engine lives here so the logic is easy to inspect and tune.
 */
export const THRESHOLDS = {
  /** Corridor congestion score (0–100) that raises a warning / critical insight. */
  congestionWarn: 68,
  congestionCritical: 80,
  /** Minutes behind schedule. */
  delayWarn: 5,
  delayCritical: 12,
  /** Demand / capacity ratio at a stop. */
  demandRatioWarn: 1.0,
  demandRatioCritical: 1.25,
  /** On-time window used for the efficiency metric (minutes). */
  onTimeEarly: -1.5,
  onTimeLate: 5,
  /** Brake / tyre wear % that the maintenance rule flags. */
  wearCritical: 85,
} as const;

export const WEIGHTS = {
  /** Efficiency = onTime share × w + speed ratio × (1 − w). */
  efficiencyOnTime: 0.6,
  /** Incident priority score components. */
  severity: { critical: 50, high: 36, medium: 22, low: 10 } as Record<string, number>,
  perMinuteOpen: 0.35,
  maxDurationPoints: 20,
  impactPoints: 60,
  unacknowledgedBonus: 8,
} as const;

/** Scenario assumptions for the passenger-demand model. */
export const DEMAND_MODEL = {
  /** Trips per bus per hour serving a given stop (headway assumption). */
  tripsPerBusPerHour: 2,
  /** Fraction of a bus's free capacity available to a single stop. */
  boardingShare: 0.7,
  /** Each simulated bus stands in for this many scheduled buses on its corridor. */
  busesRepresented: 10,
} as const;

export const SIM_DEFAULTS = {
  tickMs: 1500,
  minutesPerTick: 1,
  historyLength: 240,
  delayHistoryLength: 12,
};
