import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BatteryMedium, CalendarClock, Disc3, Gauge, LocateFixed } from 'lucide-react';
import { DEMO_TODAY, useApp, useDispatch } from '../app/store';
import { corridorById } from '../data/corridors';
import { DemoTag, Empty, VehicleArt } from '../components/ui/primitives';
import { vehiclePosition } from '../engine/trafficIntelligence';
import { TYPE_LABEL } from '../utils/format';
import type { MaintenanceStatus, VehicleType } from '../types';

const STATUS_TONE: Record<MaintenanceStatus, string> = { healthy: 'ok', due: 'warn', overdue: 'crit', 'in-service': 'crit' };
const wearColor = (w: number) => (w > 85 ? 'var(--crit)' : w > 70 ? 'var(--warn)' : 'var(--ok)');

export default function MaintenancePage() {
  const { maintenance, fleet, geometry } = useApp();
  const dispatch = useDispatch();
  const [status, setStatus] = useState<MaintenanceStatus | 'all'>('all');
  const [type, setType] = useState<VehicleType | 'all'>('all');
  const rows = useMemo(
    () =>
      maintenance
        .map((m) => ({ m, v: fleet.find((v) => v.id === m.vehicleId)! }))
        .filter(({ m, v }) => (status === 'all' || m.status === status) && (type === 'all' || v.type === type))
        .sort((a, b) => ['in-service', 'overdue', 'due', 'healthy'].indexOf(a.m.status) - ['in-service', 'overdue', 'due', 'healthy'].indexOf(b.m.status)),
    [maintenance, fleet, status, type],
  );
  const count = (s: MaintenanceStatus) => maintenance.filter((m) => m.status === s).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Maintenance</h1>
          <p>Fictional vehicle condition records. Status is derived from wear levels and service dates (relative to today, {DEMO_TODAY}).</p>
        </div>
        <DemoTag text="Fictional demo records" />
      </div>
      <div className="grid-kpi">
        {(['in-service', 'overdue', 'due', 'healthy'] as MaintenanceStatus[]).map((s) => (
          <button key={s} className="card kpi" style={{ textAlign: 'left', borderColor: status === s ? 'rgba(255,255,255,0.25)' : undefined }} aria-pressed={status === s} onClick={() => setStatus((c) => (c === s ? 'all' : s))}>
            <span className="eyebrow">{s === 'in-service' ? 'In workshop / recovery' : s}</span>
            <span className="big-num">{count(s)}</span>
          </button>
        ))}
      </div>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <select className="select" value={type} onChange={(e) => setType(e.target.value as VehicleType | 'all')} aria-label="Vehicle type">
          <option value="all">All vehicle types</option>
          {(Object.keys(TYPE_LABEL) as VehicleType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as MaintenanceStatus | 'all')} aria-label="Maintenance status">
          <option value="all">All statuses</option>
          {(['in-service', 'overdue', 'due', 'healthy'] as MaintenanceStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>{rows.length} records</span>
      </div>
      {rows.length === 0 ? (
        <div className="card"><Empty title="No records match" action={<button className="btn sm" onClick={() => (setStatus('all'), setType('all'))}>Clear filters</button>} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
          {rows.map(({ m, v }, i) => (
            <motion.div key={m.vehicleId} className="card card-pad" style={{ display: 'grid', gap: 10 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.025 }} layout>
              <div className="row-top">
                <div>
                  <div style={{ fontSize: 15 }}>{v.label}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{TYPE_LABEL[v.type]} · {corridorById(v.corridorId).routeCode} · {m.odometerKm.toLocaleString('en-IN')} km</div>
                </div>
                <span className={`pill ${STATUS_TONE[m.status]}`}>{m.status}</span>
              </div>
              <div style={{ display: 'grid', placeItems: 'center', opacity: 0.85 }}><VehicleArt type={v.type} width={160} /></div>
              {[
                ['Brake wear', m.brakeWear, Disc3],
                ['Tyre wear', m.tyreWear, Gauge],
                ...(m.battery !== undefined ? [['Battery health', m.battery, BatteryMedium] as const] : []),
              ].map(([label, val, Icon]) => {
                const n = val as number;
                const isBattery = label === 'Battery health';
                const color = isBattery ? (n < 75 ? 'var(--warn)' : 'var(--ok)') : wearColor(n);
                const I = Icon as typeof Gauge;
                return (
                  <div key={label as string} style={{ display: 'grid', gap: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }} className="text-2">
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><I size={13} /> {label as string}</span>
                      <span className="mono" style={{ color }}>{n}%</span>
                    </div>
                    <div className="bar"><motion.i initial={{ width: 0 }} animate={{ width: `${n}%` }} style={{ background: color }} /></div>
                  </div>
                );
              })}
              <div className="text-2" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                <CalendarClock size={13} /> Last {m.lastServiceDay} · next <span className={m.status === 'overdue' ? 'crit-t' : ''}>{m.nextServiceDay}</span>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>{m.note}</div>
              <button
                className="btn sm"
                style={{ justifySelf: 'start' }}
                onClick={() => {
                  dispatch({ type: 'SET_VIEW', view: 'live' });
                  dispatch({ type: 'SELECT', selection: { kind: 'vehicle', id: v.id }, focus: { center: vehiclePosition(v, geometry), zoom: 15 } });
                }}
              >
                <LocateFixed size={13} /> Show on map
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
