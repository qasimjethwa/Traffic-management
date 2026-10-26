import type { LatLng } from '../types';

const R = 6371; // km

export function haversineKm(a: LatLng, b: LatLng) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const lengthCache = new WeakMap<LatLng[], number[]>();

/** Cumulative distances along a polyline (cached per array instance). */
function cumulative(line: LatLng[]) {
  let c = lengthCache.get(line);
  if (!c) {
    c = [0];
    for (let i = 1; i < line.length; i++) c.push(c[i - 1] + haversineKm(line[i - 1], line[i]));
    lengthCache.set(line, c);
  }
  return c;
}

export function polylineLengthKm(line: LatLng[]) {
  const c = cumulative(line);
  return c[c.length - 1];
}

/** Interpolated point at fraction t (0..1) along the polyline. */
export function corridorPoint(line: LatLng[], t: number): LatLng {
  if (line.length === 1) return line[0];
  const c = cumulative(line);
  const total = c[c.length - 1];
  const d = Math.min(Math.max(t, 0), 1) * total;
  let i = 1;
  while (i < c.length - 1 && c[i] < d) i++;
  const seg = c[i] - c[i - 1] || 1;
  const f = (d - c[i - 1]) / seg;
  const a = line[i - 1];
  const b = line[i];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** Heading in degrees (0 = north, clockwise) at fraction t. */
export function corridorHeading(line: LatLng[], t: number, dir: 1 | -1) {
  const a = corridorPoint(line, Math.max(0, t - 0.01));
  const b = corridorPoint(line, Math.min(1, t + 0.01));
  const [p, q] = dir === 1 ? [a, b] : [b, a];
  const y = q[1] - p[1];
  const x = q[0] - p[0];
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Fraction along polyline closest to a given point. */
export function nearestFraction(line: LatLng[], p: LatLng) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 100; i++) {
    const q = corridorPoint(line, i / 100);
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i / 100;
    }
  }
  return best;
}

/** Slice a polyline between fractions a..b (a<b). */
export function slicePolyline(line: LatLng[], a: number, b: number): LatLng[] {
  const out: LatLng[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) out.push(corridorPoint(line, a + ((b - a) * i) / steps));
  return out;
}

import { PLACES } from '../data/places';

/** Human-readable "near X" label using the nearest known Mumbai locality. */
export function nearestPlaceName(p: LatLng) {
  let best = PLACES[0];
  let bestD = Infinity;
  for (const pl of PLACES) {
    const d = haversineKm(p, pl.position);
    if (d < bestD) {
      bestD = d;
      best = pl;
    }
  }
  return bestD < 1.2 ? best.name : `near ${best.name}`;
}
