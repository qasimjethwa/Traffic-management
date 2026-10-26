import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LocateFixed } from 'lucide-react';
import type { Map as LeafletMap } from 'leaflet';
import { useApp, useDispatch } from '../app/store';
import { CORRIDORS, corridorById } from '../data/corridors';
import MumbaiMap from '../components/map/MumbaiMap';
import { MapControls } from '../components/map/MapChrome';
import { SelectionDrawer } from '../components/intelligence/SelectionDrawer';
import { DemoTag, Empty } from '../components/ui/primitives';
import { vehiclePosition } from '../engine/trafficIntelligence';
import { clock, signed, STATUS_LABEL, toneFor, TYPE_LABEL } from '../utils/format';
import { nearestPlaceName } from '../utils/geo';
import type { VehicleStatus, VehicleType } from '../types';

type DelayFilter = 'all' | 'ontime' | 'late' | 'verylate';

export default function FleetPage() {
  const { fleet, geometry, selection, corridors } = useApp();
  const dispatch = useDispatch();
  const [type, setType] = useState<VehicleType | 'all'>('all');
  const [status, setStatus] = useState<VehicleStatus | 'all'>('all');
  const [route, setRoute] = useState<string>('all');
  const [delay, setDelay] = useState<DelayFilter>('all');
  const [q, setQ] = useState('');
  const [map, setMap] = useState<LeafletMap | null>(null);

  const rows = useMemo(
    () =>
      fleet.filter((v) => {
        if (type !== 'all' && v.type !== type) return false;
        if (status !== 'all' && v.status !== status) return false;
        if (route !== 'all' && v.corridorId !== route) return false;
        if (delay === 'ontime' && (v.capacity === 0 || v.delayMin > 5)) return false;
        if (delay === 'late' && !(v.capacity > 0 && v.delayMin > 5)) return false;
        if (delay === 'verylate' && !(v.capacity > 0 && v.delayMin > 12)) return false;
        if (q && !`${v.label} ${v.plate}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [fleet, type, status, route, delay, q],
  );
  const highlight = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const selId = selection?.kind === 'vehicle' ? selection.id : null;
  const locate = (id: string) => {
    const v = fleet.find((x) => x.id === id)!;
    dispatch({ type: 'SELECT', selection: { kind: 'vehicle', id }, focus: { center: vehiclePosition(v, geometry), zoom: 15 } });
  };
  const clear = () => (setType('all'), setStatus('all'), setRoute('all'), setDelay('all'), setQ(''));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Fleet Management</h1>
          <p>Every vehicle in the demo scenario, with its corridor, simulated speed and schedule deviation. Select a row to focus it on the map.</p>
        </div>
        <DemoTag />
      </div>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <input className="select" style={{ backgroundImage: 'none', paddingRight: 12, width: 170 }} placeholder="Filter by ID / plate" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter by vehicle ID or plate" />
        <select className="select" value={type} onChange={(e) => setType(e.target.value as VehicleType | 'all')} aria-label="Vehicle type">
          <option value="all">All types</option>
          {(Object.keys(TYPE_LABEL) as VehicleType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as VehicleStatus | 'all')} aria-label="Status">
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_LABEL) as VehicleStatus[]).map((t) => <option key={t} value={t}>{STATUS_LABEL[t]}</option>)}
        </select>
        <select className="select" value={route} onChange={(e) => setRoute(e.target.value)} aria-label="Route">
          <option value="all">All routes</option>
          {CORRIDORS.map((c) => <option key={c.id} value={c.id}>{c.routeCode} · {c.shortName}</option>)}
        </select>
        <div className="seg" role="group" aria-label="Delay status">
          {([['all', 'Any delay'], ['ontime', 'On time'], ['late', '> 5 min'], ['verylate', '> 12 min']] as [DelayFilter, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={delay === k} onClick={() => setDelay(k)}>{l}</button>
          ))}
        </div>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>{rows.length} of {fleet.length} vehicles</span>
      </div>
      <div className="split">
        <div className="card" style={{ overflow: 'hidden' }}>
          {rows.length === 0 ? (
            <Empty title="No vehicles match these filters" hint="Try widening the type, status, route or delay filters." action={<button className="btn sm" onClick={clear}>Clear filters</button>} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th className="hide-mobile">Type</th>
                    <th>Location</th>
                    <th className="hide-mobile">Route</th>
                    <th>Status</th>
                    <th className="hide-mobile">Speed</th>
                    <th>Deviation</th>
                    <th className="hide-mobile">Updated</th>
                    <th><span className="sr-only">Locate</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => {
                    const c = corridorById(v.corridorId);
                    return (
                      <motion.tr key={v.id} layout="position" aria-selected={selId === v.id} onClick={() => locate(v.id)}>
                        <td><div>{v.label}</div><div className="muted mono" style={{ fontSize: 11 }}>{v.plate}</div></td>
                        <td className="hide-mobile text-2">{TYPE_LABEL[v.type]}</td>
                        <td className="text-2">{nearestPlaceName(vehiclePosition(v, geometry))}</td>
                        <td className="hide-mobile"><span className="pill" title={`${c.name} · congestion ${corridors[c.id].congestion.toFixed(0)}`}>{c.routeCode} · {c.shortName}</span></td>
                        <td><span className={`pill ${toneFor(v.status)}`}><span className="dot" />{STATUS_LABEL[v.status]}</span></td>
                        <td className="hide-mobile mono">{v.status === 'offline' ? '—' : `${v.speed} km/h`}</td>
                        <td className={`mono ${v.delayMin > 12 ? 'crit-t' : v.delayMin > 5 ? 'warn-t' : ''}`}>{v.capacity ? `${signed(v.delayMin)}m` : '—'}</td>
                        <td className="hide-mobile muted mono">{v.status === 'offline' ? 'no signal' : clock(v.lastUpdate)}</td>
                        <td>
                          <button className="corner-link" aria-label={`Locate ${v.label} on map`} onClick={(e) => (e.stopPropagation(), locate(v.id))}>
                            <LocateFixed size={14} />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="sticky-map">
          <div className="map-panel">
            <MumbaiMap highlightVehicles={highlight} onMap={setMap} initialZoom={11} />
            <MapControls map={map} bottom={16} />
            <SelectionDrawer />
          </div>
        </div>
      </div>
    </div>
  );
}
