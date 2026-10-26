import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ComposedChart, Scatter, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp, useDispatch } from '../../app/store';
import { CORRIDORS, corridorById } from '../../data/corridors';
import { vehiclePosition } from '../../engine/trafficIntelligence';
import { clock } from '../../utils/format';
import { AnimatedNumber, CornerLink, DimTail } from '../ui/primitives';
import { Clock3 } from 'lucide-react';

export const EFFICIENCY_TARGET = 75;

export const tooltipStyle = {
  contentStyle: { background: 'rgba(18,23,22,0.94)', border: '1px solid rgba(225,235,228,0.16)', borderRadius: 10, fontSize: 12, color: '#E8EBE7' },
  labelStyle: { color: '#8E9991' },
  itemStyle: { color: '#E8EBE7' },
  cursor: { stroke: 'rgba(255,255,255,0.25)', strokeDasharray: '3 3' },
};

/** Efficiency trend — line with dots where the series crosses the target, amber below target. */
export function EfficiencyCard({ compact = false }: { compact?: boolean }) {
  const { history } = useApp();
  const dispatch = useDispatch();
  const data = useMemo(() => history.map((p) => ({ t: p.minute, e: p.efficiency, below: p.efficiency < EFFICIENCY_TARGET ? p.efficiency : null })), [history]);
  const current = history[history.length - 1]?.efficiency ?? 0;
  const crossings = useMemo(() => {
    const out: { t: number; e: number }[] = [];
    for (let i = 1; i < data.length; i++) if ((data[i - 1].e - EFFICIENCY_TARGET) * (data[i].e - EFFICIENCY_TARGET) < 0) out.push(data[i]);
    return out.slice(-6);
  }, [data]);
  // shaded bands where efficiency is below target
  const bands = useMemo(() => {
    const out: [number, number][] = [];
    let start: number | null = null;
    data.forEach((d) => {
      if (d.e < EFFICIENCY_TARGET && start === null) start = d.t;
      if (d.e >= EFFICIENCY_TARGET && start !== null) {
        out.push([start, d.t]);
        start = null;
      }
    });
    if (start !== null && data.length) out.push([start, data[data.length - 1].t]);
    return out;
  }, [data]);
  return (
    <div className="card card-pad">
      <div className="card-title">
        Operational Efficiency
        <CornerLink label="Open analytics" onClick={() => dispatch({ type: 'SET_VIEW', view: 'analytics' })} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <AnimatedNumber value={current} decimals={1} splitFraction className="big-num" />
        <span className="unit">%</span>
        <span className={`pill ${current >= EFFICIENCY_TARGET ? 'ok' : 'warn'}`} style={{ marginLeft: 'auto' }}>
          {current >= EFFICIENCY_TARGET ? 'On target' : 'Below target'}
        </span>
      </div>
      <div className="card-sub" style={{ marginTop: 6 }}>Target: ≥{EFFICIENCY_TARGET}% · on-time share × 0.6 + speed ratio × 0.4</div>
      <div style={{ height: compact ? 120 : 150, marginTop: 6, marginLeft: -8, marginRight: -6 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
            {bands.map(([a, b], i) => (
              <ReferenceArea key={i} x1={a} x2={b} y1={25} y2={100} fill="rgba(255,255,255,0.05)" stroke="none" ifOverflow="hidden" />
            ))}
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => clock(v)} tick={{ fill: '#6F7A73', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={34} />
            <YAxis orientation="right" domain={[25, 100]} ticks={[25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: '#6F7A73', fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
            <ReferenceLine y={EFFICIENCY_TARGET} stroke="rgba(232,235,231,0.45)" strokeDasharray="4 4" />
            <Tooltip {...tooltipStyle} labelFormatter={(v) => clock(Number(v))} formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Efficiency']} />
            <Line dataKey="e" stroke="rgba(232,235,231,0.8)" strokeWidth={1.1} dot={false} isAnimationActive={false} />
            <Line dataKey="below" stroke="#D9A45A" strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls={false} />
            <Scatter data={crossings} dataKey="e" fill="#E8EBE7" isAnimationActive={false} shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={3.2} fill="#E8EBE7" stroke="#141918" strokeWidth={1.5} />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Route-level schedule offset grid inspired by the reference panel. */
export function ScheduleOffset({ maxCols = 9 }: { maxCols?: number }) {
  const { fleet, selection, geometry } = useApp();
  const dispatch = useDispatch();
  const routes = CORRIDORS.slice(0, maxCols);
  const stats = useMemo(
    () =>
      routes.map((c) => {
        const vs = fleet.filter((v) => v.corridorId === c.id && v.capacity > 0 && v.status !== 'offline');
        const avg = vs.length ? vs.reduce((a, v) => a + v.delayMin, 0) / vs.length : 0;
        const worst = vs.length ? Math.max(...vs.map((v) => v.delayMin)) : 0;
        const onTime = vs.length ? vs.filter((v) => v.delayMin <= 5 && v.status !== 'stopped').length / vs.length : 1;
        return { c, n: vs.length, avg, worst, onTime };
      }),
    [fleet, routes],
  );
  const pax = fleet.filter((v) => v.capacity > 0 && v.status !== 'offline');
  const variance = pax.length ? pax.reduce((a, v) => a + Math.abs(v.delayMin), 0) / pax.length : 0;
  const selV = selection?.kind === 'vehicle' ? fleet.find((v) => v.id === selection.id && v.capacity > 0) : undefined;
  const Cell = ({ v, unit = 'min' }: { v: number; unit?: string }) => (
    <span className={`sched-cell ${v > 10 ? 'very' : v > 5 ? 'late' : ''}`}>
      {v > 5 && <Clock3 size={11} />}
      {v > 0 ? '+' : v < 0 ? '−' : ''}
      {Math.abs(v).toFixed(1)}
      {unit}
    </span>
  );
  return (
    <motion.section className="glass sched" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.35 }} aria-label="Schedule offset">
      <div className="card-title">
        Schedule Offset
        <CornerLink label="Open operations view" onClick={() => dispatch({ type: 'SET_VIEW', view: 'operations' })} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
        <span className="big-num" style={{ fontSize: 38 }}>
          ± <AnimatedNumber value={variance} decimals={1} />
        </span>
        <span className="unit" style={{ fontSize: 18, color: 'var(--text-2)' }}>min</span>
        <span className="card-sub">Average variance · {pax.length} active services</span>
      </div>
      <div className="sched-grid" role="table" style={{ ['--cols' as string]: routes.length }}>
        <div className="sched-row head" role="row">
          <div role="columnheader">Route</div>
          {routes.map((c) => (
            <div key={c.id} role="columnheader">{c.routeCode}</div>
          ))}
        </div>
        <div className="sched-row" role="row">
          <div><span className="route-tag"><b>Ø</b>Avg</span></div>
          {stats.map((s) => (
            <div key={s.c.id} className="sched-row-cell" role="cell" style={{ cursor: 'pointer' }} onClick={() => dispatch({ type: 'SELECT', selection: { kind: 'corridor', id: s.c.id } })} title={`${s.c.name} — ${s.n} services`}>
              {s.n ? <Cell v={s.avg} /> : <span className="muted">—</span>}
            </div>
          ))}
        </div>
        <div className="sched-row" role="row">
          <div><span className="route-tag"><b>↑</b>Worst</span></div>
          {stats.map((s) => (
            <div key={s.c.id} role="cell">{s.n ? <Cell v={s.worst} /> : <span className="muted">—</span>}</div>
          ))}
        </div>
        {selV ? (
          <div className="sched-row" role="row" aria-selected="true">
            <div><span className="route-tag"><b>{selV.plate[0]}</b>{selV.plate.slice(2)}</span></div>
            {routes.map((c) => (
              <div key={c.id} role="cell">{c.id === selV.corridorId ? <Cell v={selV.delayMin} /> : <span className="muted">·</span>}</div>
            ))}
          </div>
        ) : (
          <div className="sched-row" role="row">
            <div><span className="route-tag"><b>%</b>On-time</span></div>
            {stats.map((s) => (
              <div key={s.c.id} role="cell" className={s.onTime < 0.6 ? 'warn-t' : 'text-2'}>{s.n ? `${Math.round(s.onTime * 100)}%` : '—'}</div>
            ))}
          </div>
        )}
      </div>
      {selV && (
        <button className="source-note" style={{ marginTop: 6 }} onClick={() => dispatch({ type: 'FOCUS', center: vehiclePosition(selV, geometry), zoom: 15 })}>
          Selected: {selV.label} on {corridorById(selV.corridorId).routeCode} — click to centre
        </button>
      )}
    </motion.section>
  );
}

/** Live (simulated) passenger volume — total since 05:00 + hourly buckets with change. */
export function PassengerVolume() {
  const { history, passengersToday } = useApp();
  const dispatch = useDispatch();
  const buckets = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 1; i < history.length; i++) {
      const p = history[i];
      const dt = p.minute - history[i - 1].minute;
      const h = Math.floor(p.minute / 60);
      map.set(h, (map.get(h) ?? 0) + p.passengers * dt);
    }
    const arr = [...map.entries()].sort((a, b) => a[0] - b[0]).slice(-6);
    return arr.map(([h, v], i) => ({ h, v, delta: i ? (v - arr[i - 1][1]) / (arr[i - 1][1] || 1) : 0 }));
  }, [history]);
  const max = Math.max(1, ...buckets.map((b) => b.v));
  return (
    <motion.section className="glass sched pv" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.45 }} aria-label="Passenger volume">
      <div className="card-title">
        Live Passenger Volume <span className="pill" style={{ marginLeft: 6 }}>simulated</span>
        <CornerLink label="Open analytics" onClick={() => dispatch({ type: 'SET_VIEW', view: 'analytics' })} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
        <span className="big-num" style={{ fontSize: 38 }}>
          <DimTail value={passengersToday} />
        </span>
        <span className="card-sub">boardings today (demand model)</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${buckets.length || 1}, 1fr)`, gap: 8, marginTop: 12, alignItems: 'end', height: 74 }}>
        {buckets.map((b, i) => (
          <div key={b.h} style={{ display: 'flex', flexDirection: 'column', gap: 4 }} title={`${clock(b.h * 60)}–${clock(b.h * 60 + 60)}`}>
            <span style={{ fontSize: 13 }}>{(b.v / 1000).toFixed(0)}k</span>
            <span className={b.delta < -0.05 ? 'warn-t' : 'muted'} style={{ fontSize: 10.5 }}>
              {i === 0 ? clock(b.h * 60) : `${b.delta >= 0 ? '+' : '−'}${Math.abs(b.delta * 100).toFixed(0)}%`}
            </span>
            <motion.i
              style={{ display: 'block', height: 2, borderRadius: 2, background: b.delta < -0.05 ? 'var(--warn)' : 'rgba(232,235,231,0.7)', transformOrigin: 'left' }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 0.25 + 0.75 * (b.v / max) }}
              transition={{ duration: 0.8 }}
            />
          </div>
        ))}
      </div>
    </motion.section>
  );
}
