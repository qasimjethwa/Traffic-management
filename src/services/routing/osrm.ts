import type { LatLng } from '../../types';

/**
 * Road routing via OSRM.
 * Default endpoint is the public OSRM demo server (router.project-osrm.org), which is meant
 * for light, non-production use. Point VITE_OSRM_URL at your own OSRM instance for anything more.
 * Requests are small, cached in sessionStorage and never repeated in a loop.
 */
const BASE = ((import.meta.env.VITE_OSRM_URL as string | undefined) || 'https://router.project-osrm.org').replace(/\/$/, '');
const CACHE_KEY = 'mf-osrm-v1:';

export interface RouteResult {
  geometry: LatLng[];
  distanceKm: number;
  durationMin: number;
  source: 'osrm';
}

export async function fetchRoute(points: LatLng[], signal?: AbortSignal): Promise<RouteResult> {
  const coords = points.map(([lat, lng]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');
  const key = CACHE_KEY + coords;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached) as RouteResult;
  } catch {
    /* storage unavailable */
  }
  const url = `${BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const timeout = AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined;
  const res = await fetch(url, { signal: signal ?? timeout });
  if (!res.ok) throw new Error(`Routing service responded ${res.status}`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error(json.message || 'No route found');
  const r = json.routes[0];
  const result: RouteResult = {
    geometry: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
    source: 'osrm',
  };
  try {
    sessionStorage.setItem(key, JSON.stringify(result));
  } catch {
    /* ignore quota */
  }
  return result;
}

/** Thin a long route geometry so per-tick interpolation stays cheap. */
export function simplify(line: LatLng[], maxPoints = 160): LatLng[] {
  if (line.length <= maxPoints) return line;
  const step = (line.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => line[Math.round(i * step)]);
}
