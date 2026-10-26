import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, BusFront, Check, ChevronDown, ChevronUp, Clock3, LocateFixed, RotateCcw, Sparkles, TrafficCone, Users, Wrench } from 'lucide-react';
import { useApp, useDispatch } from '../../app/store';
import { useInsights } from '../../hooks/useDerived';
import type { Insight, InsightKind } from '../../types';

const GROUPS: { kind: InsightKind; label: string; icon: typeof Users }[] = [
  { kind: 'capacity', label: 'Capacity Issues', icon: Users },
  { kind: 'schedule', label: 'Schedule Deviations', icon: Clock3 },
  { kind: 'congestion', label: 'Congestion', icon: TrafficCone },
  { kind: 'incident', label: 'Incidents', icon: AlertTriangle },
  { kind: 'maintenance', label: 'Maintenance', icon: Wrench },
];

export function InsightItem({ ins, index, defaultOpen = false }: { ins: Insight; index: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const dispatch = useDispatch();
  const { view } = useApp();
  const locate = () => {
    if (!['live', 'fleet', 'routes', 'incidents'].includes(view)) dispatch({ type: 'SET_VIEW', view: 'live' });
    dispatch({
      type: 'SELECT',
      selection: ins.target.kind === 'stop' ? null : { kind: ins.target.kind, id: ins.target.id },
      focus: { center: ins.target.position, zoom: ins.target.kind === 'corridor' ? 13 : 15 },
    });
  };
  const sevClass = ins.resolved ? 'resolved' : ins.severity === 'critical' ? 'crit' : ins.severity;
  return (
    <motion.div layout="position" className={`insight ${sevClass}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <button className="insight-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`num-badge ${ins.resolved ? 'resolved' : ins.severity}`}>{ins.resolved ? '✓' : index}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <div className="insight-title">{ins.title}</div>
          <div className="insight-time">{ins.subject}</div>
        </span>
        {open ? <ChevronUp size={16} className="muted" /> : <ChevronDown size={16} className="muted" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: 'hidden' }}>
            <div className="insight-body">
              <div className="kv"><div className="k">Observed (simulated)</div><div className="v">{ins.metric}</div></div>
              <div className="kv"><div className="k">Why this fired</div><div className="v">{ins.reason}</div></div>
              <div className="recommend">
                <Sparkles size={15} />
                <div>
                  <div style={{ fontSize: 13 }}>Recommend</div>
                  <div className="text-2" style={{ lineHeight: 1.45 }}>{ins.action}</div>
                </div>
              </div>
              <div className="insight-actions">
                <button className="btn sm" onClick={locate}><LocateFixed size={13} /> Locate</button>
                {ins.resolved ? (
                  <button className="btn sm" onClick={() => dispatch({ type: 'RESTORE_INSIGHT', id: ins.id })}><RotateCcw size={13} /> Reopen</button>
                ) : (
                  <button className="btn sm ok" onClick={() => dispatch({ type: 'DISMISS_INSIGHT', id: ins.id })}><Check size={13} /> Mark handled</button>
                )}
                <span className="pill" style={{ marginLeft: 'auto' }}>P{ins.priority}</span>
              </div>
              <div className="source-note">Rule-based analysis of simulated demo data</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function WarningPanel() {
  const insights = useInsights();
  const { view } = useApp();
  const dispatch = useDispatch();
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches);
  const [showResolved, setShowResolved] = useState(false);
  const active = insights.filter((i) => !i.resolved);
  const resolved = insights.filter((i) => i.resolved);
  let n = 0;
  return (
    <motion.section className="glass warn-panel" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }} aria-label="Traffic intelligence warnings">
      <header>
        <h2>Warning <span className="muted" style={{ fontSize: 13 }}>· {active.length} active</span></h2>
        <button className="corner-link" aria-label={collapsed ? 'Expand warnings' : 'Collapse warnings'} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </header>
      {!collapsed && (
        <div className="warn-scroll">
          {active.length === 0 && <div className="empty" style={{ padding: 20 }}>No rules are currently triggered.</div>}
          {GROUPS.map((g) => {
            const items = active.filter((i) => i.kind === g.kind);
            if (!items.length) return null;
            const Icon = g.icon;
            return (
              <div key={g.kind} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="group-h">
                  <Icon size={15} strokeWidth={1.5} /> {g.label} <small>({items.length})</small>
                </div>
                <AnimatePresence initial={false}>
                  {items.slice(0, g.kind === 'incident' ? 4 : 3).map((ins) => (
                    <InsightItem key={ins.id} ins={ins} index={++n} defaultOpen={n === 1} />
                  ))}
                </AnimatePresence>
                {items.length > (g.kind === 'incident' ? 4 : 3) && (
                  <button className="muted" style={{ fontSize: 12, textAlign: 'left', paddingLeft: 6 }} onClick={() => dispatch({ type: 'SET_VIEW', view: g.kind === 'incident' ? 'incidents' : 'operations' })}>
                    + {items.length - (g.kind === 'incident' ? 4 : 3)} more →
                  </button>
                )}
              </div>
            );
          })}
          {resolved.length > 0 && (
            <>
              <button className="group-h" onClick={() => setShowResolved((s) => !s)} aria-expanded={showResolved}>
                <BusFront size={15} strokeWidth={1.5} /> Resolved / handled <small>({resolved.length})</small>
                {showResolved ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showResolved && resolved.map((ins, i) => <InsightItem key={ins.id} ins={ins} index={i + 1} />)}
            </>
          )}
          {view === 'live' && <div className="source-note" style={{ padding: '2px 6px' }}>Rule-based traffic intelligence · thresholds in engine/config.ts</div>}
        </div>
      )}
    </motion.section>
  );
}
