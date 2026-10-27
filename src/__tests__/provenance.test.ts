import { describe, expect, it } from 'vitest';
import { formatIST, freshness, isRealKind, SIMULATION_PROVENANCE } from '../types/provenance';
import { assertNoSimulated, ApiError } from '../services/api/client';
import { parseCorridorCollection } from '../services/data/snapshot';

describe('provenance', () => {
  it('computes freshness from observed/retrieved time', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    expect(freshness({ observedAt: '2026-10-27T11:59:00Z', staleAfterSeconds: 120 }, now)).toBe('fresh');
    expect(freshness({ retrievedAt: '2026-10-27T11:00:00Z', staleAfterSeconds: 120 }, now)).toBe('stale');
    expect(freshness({ observedAt: '2026-10-27T11:00:00Z' }, now)).toBe('unknown');
    expect(freshness({ staleAfterSeconds: 60 }, now)).toBe('unknown');
  });

  it('formats timestamps in Asia/Kolkata', () => {
    expect(formatIST('2026-10-27T15:15:00Z')).toContain('20:45');
    expect(formatIST('2026-10-27T15:15:00Z')).toContain('IST');
    expect(formatIST(null)).toBe('—');
  });

  it('separates simulated from real kinds', () => {
    expect(isRealKind('OBSERVED')).toBe(true);
    expect(isRealKind('SIMULATED')).toBe(false);
    expect(isRealKind(SIMULATION_PROVENANCE.kind)).toBe(false);
  });
});

describe('mode separation at the data boundary', () => {
  it('rejects SIMULATED values anywhere in a real-data payload', () => {
    expect(() => assertNoSimulated({ od_pairs: [{ sources: [{ latest: { kind: 'ESTIMATED' } }] }] })).not.toThrow();
    expect(() => assertNoSimulated({ a: [{ b: { kind: 'SIMULATED' } }] })).toThrow(ApiError);
  });

  it('snapshot parser refuses features without real provenance', () => {
    const ok = { features: [{ geometry: { type: 'LineString', coordinates: [[72.8, 19.0], [72.9, 19.1]] }, properties: { id: 'x', lengthKm: 1, freeFlowDurationS: 60, provenance: { kind: 'ESTIMATED', source: 'osrm', retrievedAt: '2026-10-27T15:00:00Z' } } }] };
    expect(parseCorridorCollection(ok).x.line[0]).toEqual([19.0, 72.8]);
    const sim = { features: [{ ...ok.features[0], properties: { ...ok.features[0].properties, provenance: { kind: 'SIMULATED', source: 'simulation' } } }] };
    expect(() => parseCorridorCollection(sim)).toThrow(/non-real provenance/);
    expect(() => parseCorridorCollection({})).toThrow();
  });
});
