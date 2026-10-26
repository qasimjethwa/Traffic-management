import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp, useDispatch } from '../app/store';
import { CORRIDORS, corridorById, stopById } from '../data/corridors';
import { delayDistribution } from '../engine/analytics';
import { THRESHOLDS } from '../engine/config';
import { vehiclePosition } from '../engine/trafficIntelligence';
import { useInsights } from '../hooks/useDerived';
import { ScheduleOffset, tooltipStyle } from '../components/analytics/OpsWidgets';
import { InsightItem } from '../components/intelligence/InsightPanel';
import { AnimatedNumber, DemoTag, Empty } from '../components/ui/primitives';
import { signed, STATUS_LABEL, toneFor } from '../utils/format';

const axis = { tick: { fill: '#6F7A73', fontSize: 11 }, axisLine: false, tickLine: false } as const;

export default function OperationsPage() {
  const { fleet, selection, geometry, minute, settings } = useApp();
  const dispatch = useDispatch();
  const insights = useInsights();
  const [route, setRoute] = useState('all');
  const pax = useMemo(() => fleet.filter((v) => v.capacity > 0 && v.status !== 'offline' && (route === 'all' || v.corridorId === route)), [fleet, route]);
  const variance = useMemo(() => [...pax].sort((a, b) => b.delayMin - a.delayMin).map((v) => ({ id: v.id, name: v.label.replace('E-Bus', 'E'), delay: v.delayMin })), [pax]);
  const dist = useMemo(() => delayDistribution(pax), [pax]);
  const exceptions = fleet.filter((v) => v.status === 'stopped' || v.status === 'offline' || (v.capacity > 0 && v.delayMin > THRESHOLDS.delayWarn));
  const selV = selection?.kind === 'vehicle' ? fleet.find((v) => v.id === selection.id && v.capacity > 0) : variance[0] ? fleet.find((v) => v.id === variance[0].id) : undefined;
  const select = (id: string) => {
    const v = fleet.find((x) => x.id === id);
    if (v) dispatch({ type: 'SELECT', selection: { kind: 'vehicle', id }, focus: { center: vehiclePosition(v, geometry), zoom: 15 } });
  };
  const opsInsights = insights.filter((i) => !i.resolved && (i.kind === 'schedule' || i.kind === 'capacity'));
  const avgAbs = pax.length ? pax.reduce((a, v) => a + Math.abs(v.delayMin), 0) / pax.length : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Operations &amp; Schedule Adherence</h1>
          <p>Schedule variance per service, delay distribution and exceptions — all from the simulated fleet. Click a bar or row to inspect a vehicle.</p>
        </div>
        <div className="toolbar">
          <select className="select" value={route} onChange={(e) => setRoute(e.target.value)} aria-label="Route filter">
            <option value="all">All routes</option>
            {CORRIDORS.map((c) => <option key={c.id} value={c.id}>{c.routeCode} · {c.shortName}</option>)}
          </select>
          <button className="btn" onClick={() => dispatch({ type: 'SET_RUNNING', running: !settings.running })}>{settings.running ? 'Pause simulation' : 'Resume simulation'}</button>
          <DemoTag text="Simulated data" />
        </div>
      </div>

      <div className="grid-kpi">
        <div className="card kpi"><span className="eyebrow">Average variance</span><span className="big-num">± <AnimatedNumber value={avgAbs} decimals={1} /><span className="unit">min</span></span></div>
        <div className="card kpi"><span className="eyebrow">Services &gt; {THRESHOLDS.delayWarn} min late</span><span className="big-num"><AnimatedNumber value={pax.filter((v) => v.delayMin > THRESHOLDS.delayWarn).length} /><span className="unit">of {pax.length}</span></span></div>
        <div className="card kpi"><span className="eyebrow">Stopped / offline units</span><span className="big-num"><AnimatedNumber value={fleet.filter((v) => v.status === 'stopped' || v.status === 'offline').length} /></span></div>
        <div className="card kpi"><span className="eyebrow">Capacity warnings</span><span className="big-num"><AnimatedNumber value={insights.filter((i) => !i.resolved && i.kind === 'capacity').length} /></span></div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <ScheduleOffset maxCols={CORRIDORS.length} />
      </div>

      <div className="charts">
        <section className="card chart-card wide">
          <div className="card-title">Schedule variance by service</div>
          <div className="card-sub">Minutes vs timetable (positive = late). Dashed line = {THRESHOLDS.delayWarn} min threshold.</div>
          <div className="chart-box" style={{ height: 260 }}>
            {variance.length === 0 ? <Empty title="No active services on this route" /> : (
              <ResponsiveContainer>
                <BarChart data={variance} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(225,235,228,0.06)" vertical={false} />
                  <XAxis dataKey="name" {...axis} interval={0} angle={-35} textAnchor="end" height={56} tick={{ fill: '#6F7A73', fontSize: 10 }} />
                  <YAxis {...axis} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v) => [`${signed(Number(v))} min`, 'Deviation']} />
                  <ReferenceLine y={THRESHOLDS.delayWarn} stroke="#D9A45A" strokeDasharray="4 4" />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Bar dataKey="delay" radius={[4, 4, 0, 0]} barSize={16} onClick={(d: { id?: string }) => d?.id && select(d.id)} style={{ cursor: 'pointer' }} animationDuration={500}>
                    {variance.map((d) => <Cell key={d.id} fill={d.delay > 12 ? '#F06464' : d.delay > 5 ? '#D9A45A' : d.delay < -1.5 ? '#6fa8dc' : '#75C989'} fillOpacity={selV?.id === d.id ? 1 : 0.75} stroke={selV?.id === d.id ? '#fff' : undefined} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="card chart-card">
          <div className="card-title">Selected-vehicle breakdown</div>
          {selV ? (
            <>
              <div className="card-sub">{selV.label} · {corridorById(selV.corridorId).routeCode} · next stop {selV.nextStopId ? stopById(selV.nextStopId)?.name : '—'}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <span className={`pill ${toneFor(selV.status)}`}>{STATUS_LABEL[selV.status]}</span>
                <span className="pill">{signed(selV.delayMin)} min</span>
                <span className="pill">{selV.speed} km/h</span>
                <span className="pill">load {Math.round((selV.occupancy / selV.capacity) * 100)}%</span>
              </div>
              <div className="chart-box" style={{ height: 180 }}>
                <ResponsiveContainer>
                  <LineChart data={selV.delayHistory.map((d, i, a) => ({ t: minute - (a.length - 1 - i) * settings.minutesPerTick, d }))} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(225,235,228,0.06)" vertical={false} />
                    <XAxis dataKey="t" {...axis} tickFormatter={(t) => `−${minute - t}m`} />
                    <YAxis {...axis} domain={['dataMin - 1', 'dataMax + 1']} />
                    <Tooltip {...tooltipStyle} formatter={(v) => [`${signed(Number(v))} min`, 'Deviation']} labelFormatter={() => ''} />
                    <ReferenceLine y={THRESHOLDS.delayWarn} stroke="#D9A45A" strokeDasharray="4 4" />
                    <Line dataKey="d" stroke="#E8EBE7" strokeWidth={1.6} dot={{ r: 2.5, fill: '#E8EBE7' }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <Empty title="Select a service to see its delay trend" />
          )}
        </section>

        <section className="card chart-card">
          <div className="card-title">Delay distribution</div>
          <div className="card-sub">Active passenger services by delay band</div>
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={dist} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(225,235,228,0.06)" vertical={false} />
                <XAxis dataKey="bucket" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={30} animationDuration={500}>
                  {dist.map((d) => <Cell key={d.id} fill={d.id === 'very' ? '#F06464' : d.id === 'late' ? '#D9A45A' : d.id === 'slight' ? '#C9C46B' : '#75C989'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card card-pad">
          <div className="card-title">Service exceptions <span className="muted" style={{ fontSize: 13 }}>{exceptions.length}</span></div>
          <div className="list" style={{ marginTop: 10, maxHeight: 330, overflow: 'auto' }}>
            {exceptions.length === 0 && <Empty title="No service exceptions" />}
            {exceptions.map((v) => (
              <motion.button key={v.id} layout className="row-card card" style={{ padding: '10px 12px' }} aria-selected={selV?.id === v.id} onClick={() => select(v.id)}>
                <div className="row-top">
                  <span>{v.label} <span className="muted" style={{ fontSize: 12 }}>· {corridorById(v.corridorId).routeCode}</span></span>
                  <span className={`pill ${toneFor(v.status)}`}>{v.status === 'offline' ? 'No telemetry' : v.status === 'stopped' ? 'Stopped' : `${signed(v.delayMin)} min`}</span>
                </div>
              </motion.button>
            ))}
          </div>
        </section>

        <section className="card card-pad">
          <div className="card-title">Schedule &amp; capacity insights</div>
          <div className="list" style={{ marginTop: 10, maxHeight: 330, overflow: 'auto' }}>
            {opsInsights.length === 0 && <Empty title="No schedule or capacity rules triggered" />}
            {opsInsights.map((ins, i) => (
              <InsightItem key={ins.id} ins={ins} index={i + 1} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
