/**
 * Client for the optional Mumbai Flow backend (backend/, FastAPI).
 * Configure with VITE_API_URL (e.g. http://localhost:8000). Without it the app runs in static mode:
 * the simulation and the static real-data snapshot keep working; backend features show "not configured".
 */
const RAW = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
export const API_URL = RAW ? RAW.replace(/\/$/, '') : null;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Real-data responses must never contain SIMULATED values; reject them at the boundary. */
export function assertNoSimulated(value: unknown, path = '$'): void {
  if (Array.isArray(value)) value.forEach((v, i) => assertNoSimulated(v, `${path}[${i}]`));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'kind' && v === 'SIMULATED') throw new ApiError(500, 'simulated_in_real_data', `SIMULATED value at ${path}.kind`);
      assertNoSimulated(v, `${path}.${k}`);
    }
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit & { timeoutMs?: number; allowSimulatedRefs?: boolean }): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'not_configured', 'VITE_API_URL is not set');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 10000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  } catch (e) {
    throw new ApiError(0, ctrl.signal.aborted ? 'timeout' : 'unreachable', e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; message?: string; detail?: { error?: string; message?: string } };
    const d = b.detail ?? b;
    throw new ApiError(res.status, d.error ?? `http_${res.status}`, d.message ?? res.statusText);
  }
  if (!init?.allowSimulatedRefs) assertNoSimulated(body);
  return body as T;
}

// ---------------------------------------------------------------- response types
export interface Health { status: string; database: string; time_utc: string }
export interface SourceInfo {
  id: string; name: string; kind: 'OBSERVED' | 'ESTIMATED' | 'FORECAST'; license: string | null; attribution: string | null; url: string | null; notes: string | null;
  storable: boolean; configured: boolean; health: string; last_request_at: string | null;
  last_run: { finished_at: string | null; status: string; error: string | null } | null;
  latest_record_at: string | null; stale_after_s: number | null; freshness: 'fresh' | 'stale' | 'unknown' | 'unavailable' | 'not_stored';
}
export interface Observation { id: number; od_pair_id: string; source: string; kind: 'OBSERVED' | 'ESTIMATED'; traffic_aware: boolean; departure_at: string; retrieved_at: string; duration_s: number; distance_m: number | null }
export interface JourneySummary { od_pairs: { od_pair_id: string; name: string; sources: { source: string; count: number; latest: Observation | null; freshness: string }[] }[] }
export interface Estimate { od_pair_id: string; provider: string; kind: 'ESTIMATED'; traffic_aware: boolean; duration_s: number; distance_m: number | null; retrieved_at: string; stored: boolean; map_display_allowed: boolean; static_duration_s: number | null; notes: string }
export interface Weather { available: boolean; reason?: string; kind?: string; valid_at?: string; retrieved_at?: string; freshness: string; temperature_c?: number | null; precipitation_mm?: number | null; rain_mm?: number | null; weather_code?: number | null; wind_speed_kmh?: number | null }
export interface Run { id: number; job: string; source: string | null; status: string; started_at: string; finished_at: string | null; inserted: number; duplicates: number; invalid: number; error: string | null }
export interface Metrics { mae_s: number; rmse_s: number; n: number }
export interface ForecastStatus {
  status: 'unavailable' | 'insufficient_data' | 'trained';
  reasons?: string[]; checked_at?: string; requirements?: Record<string, number>;
  data_quality?: { rows_usable: number; distinct_days_ist: number; per_od_pair: Record<string, number> };
  model_version?: string; requirements_met?: boolean; training_period?: { from: string; to: string }; test_period?: { from: string; to: string };
  validation_metrics?: { baseline: Metrics; model: Metrics }; test_metrics?: { baseline: Metrics; model: Metrics }; selected_predictor?: string; split_sizes?: Record<string, number>;
}
export interface GtfsFeed { id: number; agency: string | null; source_url: string; license: string; feed_start_date: string | null; feed_end_date: string | null; imported_at: string; stops: number; routes: number; warnings: string[] }

export const api = {
  health: () => apiFetch<Health>('/api/health', { timeoutMs: 5000 }),
  sources: () => apiFetch<{ sources: SourceInfo[] }>('/api/sources'),
  journeySummary: () => apiFetch<JourneySummary>('/api/journeys/summary'),
  observations: (odPairId: string) => apiFetch<{ observations: Observation[] }>(`/api/journeys/observations?od_pair_id=${encodeURIComponent(odPairId)}&limit=500`),
  estimate: (odPairId: string, provider: 'osrm' | 'google-routes') =>
    apiFetch<Estimate>('/api/journeys/estimate', { method: 'POST', body: JSON.stringify({ od_pair_id: odPairId, provider }), timeoutMs: 20000 }),
  weather: () => apiFetch<Weather>('/api/weather/latest'),
  runs: () => apiFetch<{ runs: Run[] }>('/api/ingestion/runs?limit=25'),
  forecast: () => apiFetch<ForecastStatus>('/api/forecast/status'),
  gtfs: () => apiFetch<{ feeds: GtfsFeed[] }>('/api/gtfs/feeds'),
  /** Operator actions on demo incidents are recorded with incident_kind = SIMULATED. */
  recordAction: (incidentRef: string, action: 'acknowledge' | 'resolve' | 'reopen') =>
    apiFetch<{ id: number }>('/api/operator-actions', { method: 'POST', body: JSON.stringify({ incident_ref: incidentRef, incident_kind: 'SIMULATED', action }), allowSimulatedRefs: true }),
};
