import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Eye, LocateFixed, RotateCcw, Sparkles, X } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { useApp, useDispatch } from '../../app/store';
import { corridorById, CORRIDORS, stopById } from '../../data/corridors';
import { congestionLevel } from '../../engine/congestionEngine';
import { incidentPriority, recommendAction, rerouteEstimate, vehiclePosition } from '../../engine/trafficIntelligence';
import { ago, clock, congestionColor, geometryNote, signed, STATUS_LABEL, toneFor, TYPE_LABEL } from '../../utils/format';
import { DataBadge } from '../ui/DataBadge';
import { VehicleArt } from '../ui/primitives';

export function SelectionDrawer({ side = 'right', offset = 16, exclude = [] }: { side?: 'left' | 'right'; offset?: number; exclude?: string[] }) {
  const s = useApp();
  const dispatch = useDispatch();
  const close = () => dispatch({ type: 'SELECT', selection: null });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dispatch({ type: 'SELECT', selection: null });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  const sel = s.selection && !exclude.includes(s.selection.kind) ? s.selection : null;
  const ctx = useMemo(
    () => ({ fleet: s.fleet, corridors: s.corridors, incidents: s.incidents, maintenance: s.maintenance, geometry: s.geometry, minute: s.minute, dismissed: s.dismissed }),
    [s.fleet, s.corridors, s.incidents, s.maintenance, s.geometry, s.minute, s.dismissed],
  );

  let body: React.ReactNode = null;
  if (sel?.kind === 'vehicle') {
    const v = s.fleet.find((x) => x.id === sel.id);
    if (v) {
      const c = corridorById(v.corridorId);
      const pos = vehiclePosition(v, s.geometry);
      const hist = v.delayHistory.map((d, i) => ({ i, d }));
      body = (
        <>
          <div className="drawer-head">
            <div>
              <div className="eyebrow">{TYPE_LABEL[v.type]} · {c.routeCode} <DataBadge kind="SIMULATED" title="Demo vehicle — position and telemetry are simulated" /></div>
              <h2>{v.label}</h2>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Simulated update {clock(v.lastUpdate || s.minute, true)}</div>
            </div>
            <button className="icon-btn" onClick={close} aria-label="Close details"><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', placeItems: 'center', padding: '4px 0' }}><VehicleArt type={v.type} width={220} /></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`pill ${toneFor(v.status)}`}><span className="dot" />{STATUS_LABEL[v.status]}</span>
            <span className="pill">{v.plate}</span>
            <span className="pill">{v.gps ? 'GPS ✓' : 'GPS ✕'} · {v.lte ? 'LTE ✓' : 'LTE ✕'}</span>
          </div>
          <div className="facts">
            <div className="fact"><div className="k">Corridor</div><div className="v" style={{ fontSize: 13 }}>{c.name}</div></div>
            <div className="fact"><div className="k">Speed</div><div className="v">{v.speed} km/h</div></div>
            <div className="fact"><div className="k">Schedule deviation</div><div className={`v ${v.delayMin > 5 ? 'warn-t' : ''}`}>{v.capacity ? `${signed(v.delayMin)} min` : 'n/a'}</div></div>
            <div className="fact"><div className="k">Passenger load</div><div className="v">{v.capacity ? `${Math.round((v.occupancy / v.capacity) * 100)}% · ${v.occupancy}/${v.capacity}` : 'n/a'}</div></div>
            <div className="fact"><div className="k">Next stop</div><div className="v" style={{ fontSize: 13 }}>{v.nextStopId ? stopById(v.nextStopId)?.name : '—'}</div></div>
            <div className="fact"><div className="k">Position</div><div className="v mono" style={{ fontSize: 11.5 }}>{pos[0].toFixed(4)}, {pos[1].toFixed(4)}</div></div>
          </div>
          {v.capacity > 0 && hist.length > 1 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Delay trend (last {hist.length} ticks)</div>
              <div style={{ height: 70 }}>
                <ResponsiveContainer>
                  <AreaChart data={hist} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
                    <defs>
                      <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D9A45A" stopOpacity={0.35} /><stop offset="1" stopColor="#D9A45A" stopOpacity={0} /></linearGradient>
                    </defs>
                    <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                    <Area dataKey="d" stroke="#D9A45A" fill="url(#dg)" strokeWidth={1.5} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => dispatch({ type: 'FOCUS', center: vehiclePosition(v, s.geometry), zoom: 15 })}><LocateFixed size={14} /> Centre on map</button>
            <button className="btn" onClick={() => dispatch({ type: 'SELECT', selection: { kind: 'corridor', id: c.id }, focus: { center: vehiclePosition(v, s.geometry), zoom: 13 } })}><Eye size={14} /> View corridor</button>
          </div>
        </>
      );
    }
  } else if (sel?.kind === 'incident') {
    const i = s.incidents.find((x) => x.id === sel.id);
    if (i) {
      body = (
        <>
          <div className="drawer-head">
            <div>
              <div className="eyebrow">{i.id} · {i.type} <DataBadge kind="SIMULATED" title="Fictional demo incident at a real location" /></div>
              <h2 style={{ fontSize: 19, lineHeight: 1.25 }}>{i.title}</h2>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{i.locationName} · started {clock(i.startedAt)} ({ago(s.minute, i.startedAt)})</div>
            </div>
            <button className="icon-btn" onClick={close} aria-label="Close details"><X size={16} /></button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`pill ${toneFor(i.severity)}`}>{i.severity}</span>
            <span className={`pill ${i.status === 'resolved' ? 'ok' : i.status === 'open' ? 'crit' : 'warn'}`}>{i.status}</span>
            <span className="pill">Priority {incidentPriority(i, s.minute)}/100</span>
          </div>
          <p className="text-2" style={{ margin: 0, lineHeight: 1.55 }}>{i.description}</p>
          <div className="fact" style={{ display: 'flex', gap: 10 }}>
            <Sparkles size={16} style={{ flexShrink: 0, marginTop: 2, color: 'var(--ok)' }} />
            <div>
              <div className="k">Recommended action · rule-based</div>
              <div style={{ marginTop: 4, lineHeight: 1.5 }}>{i.status === 'resolved' ? 'No action — incident resolved.' : recommendAction(i, ctx)}</div>
            </div>
          </div>
          {i.corridorId && (
            <div className="facts">
              <div className="fact"><div className="k">Corridor</div><div className="v" style={{ fontSize: 13 }}>{corridorById(i.corridorId).name}</div></div>
              <div className="fact"><div className="k">Corridor congestion</div><div className="v" style={{ color: congestionColor(s.corridors[i.corridorId].congestion) }}>{s.corridors[i.corridorId].congestion.toFixed(0)}/100</div></div>
              <div className="fact"><div className="k">Incident impact</div><div className="v">+{(i.impact * 100).toFixed(0)} pts</div></div>
              <div className="fact"><div className="k">Location</div><div className="v mono" style={{ fontSize: 11.5 }}>{i.position[0].toFixed(4)}, {i.position[1].toFixed(4)}</div></div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {i.status === 'open' && <button className="btn warn" onClick={() => dispatch({ type: 'INCIDENT_STATUS', id: i.id, status: 'acknowledged' })}><Eye size={14} /> Acknowledge</button>}
            {i.status !== 'resolved' && <button className="btn ok" onClick={() => dispatch({ type: 'INCIDENT_STATUS', id: i.id, status: 'resolved' })}><Check size={14} /> Resolve</button>}
            {i.status === 'resolved' && <button className="btn" onClick={() => dispatch({ type: 'INCIDENT_STATUS', id: i.id, status: 'open' })}><RotateCcw size={14} /> Reopen</button>}
            {i.vehicleId && <button className="btn" onClick={() => { const v = s.fleet.find((x) => x.id === i.vehicleId); if (v) dispatch({ type: 'SELECT', selection: { kind: 'vehicle', id: v.id }, focus: { center: vehiclePosition(v, s.geometry), zoom: 15 } }); }}>Linked vehicle</button>}
          </div>
          <div className="source-note">Demo incident — fictional event at a real location. Status changes are stored in this browser session only.</div>
        </>
      );
    }
  } else if (sel?.kind === 'corridor') {
    const c = CORRIDORS.find((x) => x.id === sel.id);
    if (c) {
      const st = s.corridors[c.id];
      const est = rerouteEstimate(c.id, s.corridors);
      const on = s.fleet.filter((v) => v.corridorId === c.id);
      body = (
        <>
          <div className="drawer-head">
            <div>
              <div className="eyebrow">Corridor · {c.routeCode}</div>
              <h2>{c.name}</h2>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{c.from} → {c.to}</div>
              <div className="source-note" style={{ marginTop: 4 }}>{geometryNote(s.geometrySource[c.id], s.geometryRetrievedAt[c.id])}</div>
            </div>
            <button className="icon-btn" onClick={close} aria-label="Close details"><X size={16} /></button>
          </div>
          <div className="facts">
            <div className="fact"><div className="k">Congestion <DataBadge kind="SIMULATED" /></div><div className="v" style={{ color: congestionColor(st.congestion) }}>{st.congestion.toFixed(0)}/100 · {congestionLevel(st.congestion)}</div></div>
            <div className="fact"><div className="k">Avg speed</div><div className="v">{st.avgSpeed.toFixed(0)} km/h</div></div>
            <div className="fact"><div className="k">Travel time</div><div className="v">{st.travelMinutes.toFixed(0)} min</div></div>
            <div className="fact"><div className="k">Free-flow</div><div className="v">{c.freeFlowMinutes} min</div></div>
            <div className="fact"><div className="k">Vehicles</div><div className="v">{on.length} ({on.filter((v) => v.status === 'delayed').length} delayed)</div></div>
            <div className="fact"><div className="k">Incident load</div><div className="v">+{(st.incidentLoad * 100).toFixed(0)} pts</div></div>
          </div>
          {est && (
            <div className="fact">
              <div className="k">Alternate · {est.alternate.name}</div>
              <div style={{ marginTop: 4, lineHeight: 1.5 }}>
                {est.altMinutes.toFixed(0)} min vs {est.baseMinutes.toFixed(0)} min baseline →{' '}
                <b className={est.savingMinutes > 0 ? 'ok-t' : 'warn-t'}>{est.savingMinutes > 0 ? `${est.savingMinutes.toFixed(1)} min faster` : `${Math.abs(est.savingMinutes).toFixed(1)} min slower`}</b>
                <div className="source-note" style={{ marginTop: 4 }}><DataBadge kind="SIMULATED" /> Assumption-based comparison of simulated travel times — not a measured saving.</div>
              </div>
            </div>
          )}
          <button className="btn" onClick={() => dispatch({ type: 'SET_VIEW', view: 'routes' })}>Open in Route Intelligence</button>
        </>
      );
    }
  }

  return (
    <AnimatePresence>
      {body && (
        <motion.aside
          key={sel?.kind + (sel ? sel.id : '')}
          className="glass drawer"
          style={side === 'right' ? { right: offset } : { left: offset }}
          initial={{ opacity: 0, x: side === 'right' ? 24 : -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: side === 'right' ? 24 : -24 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          aria-label="Selection details"
        >
          {body}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
