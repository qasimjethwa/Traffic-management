import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Eye, LocateFixed, RotateCcw, Sparkles } from 'lucide-react';
import type { Map as LeafletMap } from 'leaflet';
import { useApp, useDispatch } from '../app/store';
import { corridorById } from '../data/corridors';
import MumbaiMap from '../components/map/MumbaiMap';
import { MapControls } from '../components/map/MapChrome';
import { SelectionDrawer } from '../components/SelectionDrawer';
import { DemoTag, Empty } from '../components/ui/primitives';
import { incidentPriority, recommendAction } from '../engine/trafficIntelligence';
import { ago, clock, SEVERITY_RANK, toneFor } from '../utils/format';
import type { IncidentStatus, Severity } from '../types';

export default function IncidentsPage() {
  const s = useApp();
  const dispatch = useDispatch();
  const [sev, setSev] = useState<Set<Severity>>(new Set());
  const [status, setStatus] = useState<IncidentStatus | 'active' | 'all'>('active');
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [expanded, setExpanded] = useState<string | null>('INC-2041');
  const ctx = { fleet: s.fleet, corridors: s.corridors, incidents: s.incidents, maintenance: s.maintenance, geometry: s.geometry, minute: s.minute, dismissed: s.dismissed };

  const rows = useMemo(
    () =>
      s.incidents
        .filter((i) => (sev.size === 0 || sev.has(i.severity)) && (status === 'all' || (status === 'active' ? i.status !== 'resolved' : i.status === status)))
        .sort((a, b) => incidentPriority(b, s.minute) - incidentPriority(a, s.minute) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]),
    [s.incidents, sev, status, s.minute],
  );
  const counts = (st: IncidentStatus) => s.incidents.filter((i) => i.status === st).length;
  const setIncident = (id: string, st: IncidentStatus) => dispatch({ type: 'INCIDENT_STATUS', id, status: st });
  const locate = (id: string) => {
    const i = s.incidents.find((x) => x.id === id)!;
    setExpanded(id);
    dispatch({ type: 'SELECT', selection: { kind: 'incident', id }, focus: { center: i.position, zoom: 15 } });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Incident Centre</h1>
          <p>Fictional demo incidents at real Mumbai locations, ranked by rule-based priority. Acknowledge or resolve them — the congestion model, insights and analytics react immediately.</p>
        </div>
        <DemoTag />
      </div>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="seg" role="group" aria-label="Status filter">
          {([['active', `Active (${counts('open') + counts('acknowledged')})`], ['open', `Open (${counts('open')})`], ['acknowledged', `Acknowledged (${counts('acknowledged')})`], ['resolved', `Resolved (${counts('resolved')})`], ['all', 'All']] as const).map(([k, l]) => (
            <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Severity filter">
          {(['critical', 'high', 'medium', 'low'] as Severity[]).map((x) => (
            <button
              key={x}
              className="chip"
              aria-pressed={sev.has(x)}
              onClick={() => setSev((p) => { const n = new Set(p); if (n.has(x)) n.delete(x); else n.add(x); return n; })}
            >
              <span className="dot" style={{ color: x === 'critical' ? '#F06464' : x === 'high' ? '#e5835c' : x === 'medium' ? '#D9A45A' : '#9aa59e' }} /> {x}
            </button>
          ))}
        </div>
      </div>
      <div className="split rev">
        <div className="list">
          {rows.length === 0 && (
            <div className="card"><Empty title="No incidents match these filters" action={<button className="btn sm" onClick={() => (setSev(new Set()), setStatus('all'))}>Show all</button>} /></div>
          )}
          <AnimatePresence initial={false}>
            {rows.map((i) => {
              const open = expanded === i.id;
              const pr = incidentPriority(i, s.minute);
              return (
                <motion.article
                  key={i.id}
                  layout
                  className={`insight ${i.status === 'resolved' ? 'resolved' : i.severity === 'critical' ? 'crit' : i.severity}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  aria-selected={s.selection?.kind === 'incident' && s.selection.id === i.id}
                  style={{ borderRadius: 18 }}
                >
                  <button className="insight-head" aria-expanded={open} onClick={() => (open ? setExpanded(null) : locate(i.id))}>
                    <span className={`num-badge ${i.status === 'resolved' ? 'resolved' : i.severity}`}>{pr || '✓'}</span>
                    <span style={{ flex: 1 }}>
                      <div className="insight-title" style={{ fontSize: 14.5 }}>{i.title}</div>
                      <div className="insight-time">{i.locationName} · {i.id} · {ago(s.minute, i.startedAt)}</div>
                    </span>
                    <span className={`pill ${toneFor(i.severity)}`}>{i.severity}</span>
                    <span className={`pill ${i.status === 'resolved' ? 'ok' : i.status === 'open' ? 'crit' : 'warn'} hide-mobile`}>{i.status}</span>
                    <ChevronDown size={16} className="muted" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .25s' }} />
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                        <div className="insight-body" style={{ fontSize: 13 }}>
                          <p className="text-2" style={{ margin: 0, lineHeight: 1.5 }}>{i.description}</p>
                          <div className="kv"><div className="k">Started</div><div className="v">{clock(i.startedAt)} (sim) · priority {pr}/100</div></div>
                          {i.corridorId && <div className="kv"><div className="k">Corridor</div><div className="v">{corridorById(i.corridorId).name} — congestion {s.corridors[i.corridorId].congestion.toFixed(0)}/100{i.impact ? `, incident adds +${(i.impact * 100).toFixed(0)} pts` : ''}</div></div>}
                          <div className="recommend">
                            <Sparkles size={15} />
                            <div>
                              <div>Recommend</div>
                              <div className="text-2" style={{ lineHeight: 1.45 }}>{i.status === 'resolved' ? 'No action — resolved.' : recommendAction(i, ctx)}</div>
                            </div>
                          </div>
                          <div className="insight-actions">
                            <button className="btn sm" onClick={() => locate(i.id)}><LocateFixed size={13} /> Locate</button>
                            {i.status === 'open' && <button className="btn sm warn" onClick={() => setIncident(i.id, 'acknowledged')}><Eye size={13} /> Acknowledge</button>}
                            {i.status !== 'resolved' && <button className="btn sm ok" onClick={() => setIncident(i.id, 'resolved')}><Check size={13} /> Resolve</button>}
                            {i.status === 'resolved' && <button className="btn sm" onClick={() => setIncident(i.id, 'open')}><RotateCcw size={13} /> Reopen</button>}
                          </div>
                          <div className="source-note">Demo record · recommendation from rule-based engine · changes kept in this browser session</div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
        <div className="sticky-map">
          <div className="map-panel">
            <MumbaiMap onMap={setMap} initialZoom={11} />
            <MapControls map={map} bottom={16} />
            <SelectionDrawer />
          </div>
        </div>
      </div>
    </div>
  );
}
