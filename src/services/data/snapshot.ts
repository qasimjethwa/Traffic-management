import type { LatLng } from '../../types';
import { isRealKind, type RealProvenance } from '../../types/provenance';

/**
 * Static real-data snapshot shipped with the site (public/data/real), produced reproducibly by
 * `python -m app.cli import-corridors` in backend/. Works on GitHub Pages without a backend.
 */
export interface SnapshotDataset {
  id: string;
  file: string;
  kind: string;
  source: string;
  sourceName: string;
  license: string;
  attribution: string;
  retrievedAt: string;
  staleAfterSeconds: number;
  records: number;
  validation: { invalid: number; errors: string[] };
  notes: string;
}

export interface SnapshotManifest {
  schemaVersion: number;
  generatedAt: string;
  generatedBy: string;
  datasets: SnapshotDataset[];
}

export interface SnapshotCorridor {
  id: string;
  line: LatLng[];
  lengthKm: number;
  freeFlowDurationS: number;
  provenance: RealProvenance;
}

export interface RealSnapshot {
  manifest: SnapshotManifest;
  corridors: Record<string, SnapshotCorridor>;
}

const base = () => (import.meta.env.BASE_URL || './').replace(/\/?$/, '/');

export function parseCorridorCollection(fc: unknown): Record<string, SnapshotCorridor> {
  const out: Record<string, SnapshotCorridor> = {};
  const features = (fc as { features?: unknown[] })?.features;
  if (!Array.isArray(features)) throw new Error('corridors.geojson: not a FeatureCollection');
  for (const f of features as { geometry?: { type?: string; coordinates?: number[][] }; properties?: Record<string, unknown> }[]) {
    const p = f.properties ?? {};
    const prov = p.provenance as Record<string, unknown> | undefined;
    if (!prov || !isRealKind(prov.kind)) throw new Error(`corridor ${String(p.id)}: missing or non-real provenance`);
    if (f.geometry?.type !== 'LineString' || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length < 2) continue;
    out[String(p.id)] = {
      id: String(p.id),
      line: f.geometry.coordinates.map(([lon, lat]) => [lat, lon] as LatLng),
      lengthKm: Number(p.lengthKm),
      freeFlowDurationS: Number(p.freeFlowDurationS),
      provenance: {
        kind: prov.kind,
        source: String(prov.source),
        sourceName: String(prov.sourceName ?? prov.source),
        retrievedAt: String(prov.retrievedAt),
        notes: prov.notes ? String(prov.notes) : undefined,
      },
    };
  }
  return out;
}

export async function loadSnapshot(signal?: AbortSignal): Promise<RealSnapshot | null> {
  const res = await fetch(`${base()}data/real/manifest.json`, { signal });
  if (!res.ok) return null;
  const manifest = (await res.json()) as SnapshotManifest;
  const ds = manifest.datasets?.find((d) => d.id === 'corridors');
  if (!ds) return { manifest, corridors: {} };
  const fc = await fetch(`${base()}data/real/${ds.file}`, { signal });
  if (!fc.ok) throw new Error(`could not load ${ds.file}`);
  return { manifest, corridors: parseCorridorCollection(await fc.json()) };
}
