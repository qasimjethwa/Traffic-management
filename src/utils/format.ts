import type { Severity, VehicleStatus, VehicleType } from '../types';

export const clock = (minute: number, withSec = false) => {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  const s = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return withSec ? `${s}:00` : s;
};

export const ago = (nowMin: number, thenMin: number) => {
  const d = Math.max(0, Math.round(nowMin - thenMin));
  if (d < 1) return 'just now';
  if (d < 60) return `${d}m ago`;
  return `${Math.floor(d / 60)}h ${d % 60}m ago`;
};

export const signed = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`;

export const TYPE_LABEL: Record<VehicleType, string> = {
  bus: 'Bus',
  ebus: 'E-Bus',
  taxi: 'Taxi',
  emergency: 'Emergency',
  maintenance: 'Service',
};

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  online: 'Online',
  delayed: 'Delayed',
  stopped: 'Stopped',
  offline: 'Offline',
};

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const toneFor = (s: VehicleStatus | Severity | 'free' | 'moderate' | 'heavy' | 'severe') =>
  ({
    online: 'ok',
    free: 'ok',
    low: 'ok',
    delayed: 'warn',
    moderate: 'warn',
    medium: 'warn',
    heavy: 'warn',
    high: 'crit',
    stopped: 'crit',
    severe: 'crit',
    critical: 'crit',
    offline: 'mute',
  })[s] as 'ok' | 'warn' | 'crit' | 'mute';

export const congestionColor = (score: number) =>
  score < 45 ? '#75C989' : score < 65 ? '#C9C46B' : score < 80 ? '#D9A45A' : '#F06464';
