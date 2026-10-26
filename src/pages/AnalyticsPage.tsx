import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Area, Bar, BarChart, CartesianGrid, Cell, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../app/store';
import { CORRIDORS, corridorById } from '../data/corridors';
import { corridorTimeline, delayDistribution, RANGES, sliceHistory, type RangeId } from '../engine/analytics';
import { useStopDemand } from '../hooks/useDerived';
import { tooltipStyle } from '../components/analytics/OpsWidgets';
import { AnimatedNumber, DemoTag, Empty } from '../components/ui/primitives';
import { clock, congestionColor } from '../utils/format';
import type { Severity } from '../types';

const axis = { tick: { fill: '#6F7A73', fontSize: 11 }, axisLine: false, tickLine: false } as const;
const grid = <CartesianGrid stroke="rgba(225,235,228,0.06)" vertical={false} />;

function ChartCard({ title, sub, children, wide, delay = 0 }: { title: string; sub?: string; children: React.ReactNode; wide?: boolean; delay?: number }) {
  return (
    <motion.section className={`card chart-card${wide ? ' wide' : ''}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay }}>
      <div className="card-title">{title}</div>
      {sub && <div className="card-sub" style={{ marginTop: 3 }}>{sub}</div>}
      <div className="chart-box">{children}</div>
    </motion.section>
  );
}

export default function AnalyticsPage() {
  const { history, minute, corridors, fleet, incidents, geometry } = useApp();
  const [range, setRange] = useState<RangeId>('3h');
  const [corridor, setCorridor] = useState<string>('all');
  const demand = useStopDemand();

  const hist = useMemo(() => sliceHistory(history, minute, range), [history, minute, range]);
  const from = hist[0]?.minute ?? minute;

  // Intensity series: network mean, or a recomputed timeline for a single corridor.
  const intensity = useMemo(() => {
    if (corridor === 'all') return hist.map((p) => ({ minute: p.minute, value: p.intensity, efficiency: p.efficiency }));
    const tl = corridorTimeline(corridor, from, minute, incidents, geometry, range === 'all' ? 4 : 2);
    const eff = new Map(hist.map((p) => [p.minute, p.efficiency]));
    return tl.map((p) => ({ ...p, efficiency: eff.get(p.minute) ?? null }));
  }, [corridor, hist, from, minute, incidents, geometry, range]);

  const scopeFleet = useMemo(() => (corridor === 'all' ? fleet : fleet.filter((v) => v.corridorId === corridor)), [fleet, corridor]);
  const statusDist = useMemo(
    () =>
      (['online', 'delayed', 'stopped', 'offline'] as const).map((s) => ({
        status: s[0].toUpperCase() + s.slice(1),
        count: scopeFleet.filter((v) => v.status === s).length,
        color: { online: '#75C989', delayed: '#D9A45A', stopped: '#F06464', offline: '#5d6762' }[s],
      })),
    [scopeFleet],
  );
  const delays = useMemo(() => delayDistribution(scopeFleet), [scopeFleet]);
  const congestionBars = useMemo(() => CORRIDORS.map((c) => ({ id: c.id, name: c.shortName, value: Math.round(corridors[c.id].congestion) })).sort((a, b) => b.value - a.value), [corridors]);
  const sevData = useMemo(
    () =>
      (['critical', 'high', 'medium', 'low'] as Severity[]).map((s) => {
        const list = incidents.filter((i) => i.severity === s && (corridor === 'all' || i.corridorId === corridor));
        return { severity: s, open: list.filter((i) => i.status === 'open').length, acknowledged: list.filter((i) => i.status === 'acknowledged').length, resolved: list.filter((i) => i.status === 'resolved').length };
      }),
    [incidents, corridor],
  );
  const demandData = useMemo(
    () => demand.filter((d) => corridor === 'all' || d.stop.corridorId === corridor).map((d) => ({ name: d.stop.name.split(' — ')[0].split(' (')[0], demand: d.demand, capacity: d.capacity })),
    [demand, corridor],
  );

  const pax = scopeFleet.filter((v) => v.capacity > 0 && v.status !== 'offline');
  const onTime = pax.length ? (pax.filter((v) => v.delayMin <= 5 && v.status !== 'stopped').length / pax.length) * 100 : 0;
  const avgIntensity = intensity.length ? intensity.reduce((a, p) => a + p.value, 0) / intensity.length : 0;
  const avgEff = hist.length ? hist.reduce((a, p) => a + p.efficiency, 0) / hist.length : 0;
  const boardings = hist.reduce((a, p, i) => a + (i ? p.passengers * (p.minute - hist[i - 1].minute) : 0), 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Traffic Analytics</h1>
          <p>All figures are derived from the demo simulation records. Calculation code lives in <span className="mono" style={{ fontSize: 12.5 }}>src/engine/</span>.</p>
        </div>
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r.id} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
            ))}
          </div>
          <select className="select" value={corridor} onChange={(e) => setCorridor(e.target.value)} aria-label="Corridor filter">
            <option value="all">All corridors</option>
            {CORRIDORS.map((c) => <option key={c.id} value={c.id}>{c.routeCode} · {c.name}</option>)}
          </select>
          <DemoTag text="Simulated data" />
        </div>
      </div>

      <div className="grid-kpi">
        <div className="card kpi"><span className="eyebrow">{corridor === 'all' ? 'Network intensity' : 'Corridor congestion'} · avg</span><span className="big-num"><AnimatedNumber value={avgIntensity} decimals={1} splitFraction /><span className="unit">/100</span></span></div>
        <div className="card kpi"><span className="eyebrow">Efficiency · avg</span><span className="big-num"><AnimatedNumber value={avgEff} decimals={1} splitFraction /><span className="unit">%</span></span></div>
        <div className="card kpi"><span className="eyebrow">On-time services · now</span><span className="big-num"><AnimatedNumber value={onTime} decimals={0} /><span className="unit">% of {pax.length}</span></span></div>
        <div className="card kpi"><span className="eyebrow">Boardings in range · network</span><span className="big-num"><AnimatedNumber value={boardings} /></span></div>
      </div>

      <div className="charts">
        <ChartCard wide title={corridor === 'all' ? 'Traffic intensity over time' : `${corridorById(corridor).name} — congestion over time`} sub="Congestion score (area) with operational efficiency (line)">
          <ResponsiveContainer>
            <ComposedChart data={intensity} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D9A45A" stopOpacity={0.35} /><stop offset="1" stopColor="#D9A45A" stopOpacity={0} /></linearGradient>
              </defs>
              {grid}
              <XAxis dataKey="minute" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => clock(v)} {...axis} minTickGap={40} />
              <YAxis domain={[0, 100]} {...axis} />
              <Tooltip {...tooltipStyle} labelFormatter={(v) => clock(Number(v))} formatter={(v, n) => [Number(v).toFixed(1), n === 'value' ? 'Congestion' : 'Efficiency %']} />
              <Area dataKey="value" stroke="#D9A45A" fill="url(#ig)" strokeWidth={1.6} animationDuration={600} />
              <Line dataKey="efficiency" stroke="#E8EBE7" strokeWidth={1.2} dot={false} strokeDasharray="4 3" animationDuration={600} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Corridor congestion score" sub="Current simulated score — click a bar to filter" delay={0.05}>
          <ResponsiveContainer>
            <BarChart data={congestionBars} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
              <XAxis type="number" domain={[0, 100]} {...axis} />
              <YAxis type="category" dataKey="name" {...axis} width={86} />
              <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={14} onClick={(d: { id?: string }) => d?.id && setCorridor(d.id)} style={{ cursor: 'pointer' }} animationDuration={600}>
                {congestionBars.map((b) => <Cell key={b.id} fill={congestionColor(b.value)} fillOpacity={corridor === 'all' || corridor === b.id ? 0.9 : 0.25} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Vehicles by operational status" sub={corridor === 'all' ? 'Whole demo fleet' : `On ${corridorById(corridor).routeCode}`} delay={0.1}>
          {scopeFleet.length === 0 ? <Empty title="No vehicles on this corridor" /> : (
            <ResponsiveContainer>
              <BarChart data={statusDist} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                {grid}
                <XAxis dataKey="status" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={34} animationDuration={600}>
                  {statusDist.map((s) => <Cell key={s.status} fill={s.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Schedule adherence" sub="Active passenger services by delay band" delay={0.15}>
          {pax.length === 0 ? <Empty title="No active passenger services in scope" /> : (
            <ResponsiveContainer>
              <BarChart data={delays} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                {grid}
                <XAxis dataKey="bucket" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={30} animationDuration={600}>
                  {delays.map((d) => <Cell key={d.id} fill={d.id === 'very' ? '#F06464' : d.id === 'late' ? '#D9A45A' : d.id === 'slight' ? '#C9C46B' : '#75C989'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Incidents by severity" sub="Stacked by status — changes as you acknowledge / resolve" delay={0.2}>
          <ResponsiveContainer>
            <BarChart data={sevData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              {grid}
              <XAxis dataKey="severity" {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#8E9991' }} iconType="circle" iconSize={8} />
              <Bar dataKey="open" stackId="a" fill="#F06464" barSize={30} animationDuration={600} />
              <Bar dataKey="acknowledged" stackId="a" fill="#D9A45A" animationDuration={600} />
              <Bar dataKey="resolved" stackId="a" fill="#5d6762" radius={[6, 6, 0, 0]} animationDuration={600} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard wide title="Passenger demand vs capacity" sub="Demo demand model, passengers per hour per stop" delay={0.25}>
          {demandData.length === 0 ? <Empty title="No demo stops on this corridor" /> : (
            <ResponsiveContainer>
              <BarChart data={demandData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                {grid}
                <XAxis dataKey="name" {...axis} interval={0} tick={{ fill: '#6F7A73', fontSize: 10 }} />
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <Bar dataKey="demand" fill="#D9A45A" radius={[4, 4, 0, 0]} barSize={12} animationDuration={600} />
                <Bar dataKey="capacity" fill="#75C989" radius={[4, 4, 0, 0]} barSize={12} animationDuration={600} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
