/**
 * Data provenance for Mumbai Flow.
 *
 * Every value shown outside the simulation carries a `DataKind`:
 *  - OBSERVED   measured in the real world (e.g. operator-recorded trip times, published reference geometry)
 *  - ESTIMATED  computed by an external model from real inputs (e.g. OSRM free-flow route time, weather-model "current" conditions,
 *               a traffic-aware routing estimate)
 *  - FORECAST   output of an evaluated forecasting model
 *  - SIMULATED  produced by the in-browser demo simulation — never real traffic
 *
 * The real-data surfaces (Data view, backend client) are typed with `RealKind`, so a SIMULATED value cannot be passed to them
 * without a type error, and the API client rejects SIMULATED payloads at runtime (see services/api/client.ts).
 */
export type DataKind = 'OBSERVED' | 'ESTIMATED' | 'FORECAST' | 'SIMULATED';
export type RealKind = Exclude<DataKind, 'SIMULATED'>;
export const REAL_KINDS: readonly RealKind[] = ['OBSERVED', 'ESTIMATED', 'FORECAST'];

export interface Provenance<K extends DataKind = DataKind> {
  kind: K;
  /** Stable source id, e.g. "osrm", "open-meteo", "operator-upload", "simulation". */
  source: string;
  sourceName: string;
  /** When the value was valid / measured (ISO-8601, UTC). */
  observedAt?: string;
  /** When we fetched or imported it (ISO-8601, UTC). */
  retrievedAt?: string;
  /** After this many seconds since observedAt (or retrievedAt) the value is stale. */
  staleAfterSeconds?: number;
  license?: string;
  attribution?: string;
  /** Limitations the UI must show next to the value. */
  notes?: string;
}

export type RealProvenance = Provenance<RealKind>;

export interface Sourced<T, K extends DataKind = RealKind> {
  value: T;
  provenance: Provenance<K>;
}

export type Freshness = 'fresh' | 'stale' | 'unknown';

/** Freshness of a provenance record at `now`. Mirrors backend app/provenance.py. */
export function freshness(p: Pick<Provenance, 'observedAt' | 'retrievedAt' | 'staleAfterSeconds'>, now: Date = new Date()): Freshness {
  const ts = p.observedAt ?? p.retrievedAt;
  if (!ts || p.staleAfterSeconds === undefined) return 'unknown';
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return 'unknown';
  return (now.getTime() - t) / 1000 > p.staleAfterSeconds ? 'stale' : 'fresh';
}

export function isRealKind(k: unknown): k is RealKind {
  return typeof k === 'string' && (REAL_KINDS as readonly string[]).includes(k);
}

/** Format a UTC ISO timestamp for display in Mumbai (Asia/Kolkata). */
export function formatIST(iso: string | undefined | null, withDate = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const opts: Intl.DateTimeFormatOptions = withDate
    ? { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
    : { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false };
  return `${new Intl.DateTimeFormat('en-IN', opts).format(d)} IST`;
}

/** Provenance stamped on every value produced by the demo simulation. */
export const SIMULATION_PROVENANCE: Provenance<'SIMULATED'> = {
  kind: 'SIMULATED',
  source: 'simulation',
  sourceName: 'Mumbai Flow demo simulation',
  notes: 'Generated in the browser from scenario assumptions. Not real traffic.',
};
