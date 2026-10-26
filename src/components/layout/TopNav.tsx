import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Bell, Bus, MapPin, Menu, Route, Search, Settings2, X } from 'lucide-react';
import { useApp, useDispatch } from '../../app/store';
import { CORRIDORS, STOPS } from '../../data/corridors';
import { PLACES } from '../../data/places';
import { vehiclePosition } from '../../engine/trafficIntelligence';
import { useInsights } from '../../hooks/useDerived';
import { clock, TYPE_LABEL } from '../../utils/format';
import { corridorPoint } from '../../utils/geo';
import type { LatLng, Selection, ViewId } from '../../types';
import { Logo } from '../ui/primitives';
import { useOutside } from '../map/MapChrome';

export const NAV: { id: ViewId; label: string }[] = [
  { id: 'live', label: 'Live Map' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'routes', label: 'Routes' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'operations', label: 'Operations' },
];

const MAP_VIEWS: ViewId[] = ['live', 'fleet', 'routes', 'incidents'];

interface Result {
  group: string;
  id: string;
  label: string;
  hint: string;
  icon: typeof Bus;
  go: () => void;
}

function GlobalSearch() {
  const s = useApp();
  const dispatch = useDispatch();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo<Result[]>(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const goto = (sel: Selection, center: LatLng, zoom: number) => {
      if (!MAP_VIEWS.includes(s.view)) dispatch({ type: 'SET_VIEW', view: 'live' });
      dispatch({ type: 'SELECT', selection: sel, focus: { center, zoom } });
    };
    const out: Result[] = [];
    s.fleet
      .filter((v) => `${v.label} ${v.plate} ${v.id} ${TYPE_LABEL[v.type]}`.toLowerCase().includes(t))
      .slice(0, 5)
      .forEach((v) => out.push({ group: 'Vehicles', id: v.id, label: v.label, hint: `${TYPE_LABEL[v.type]} · ${v.status}`, icon: Bus, go: () => goto({ kind: 'vehicle', id: v.id }, vehiclePosition(v, s.geometry), 15) }));
    CORRIDORS.filter((c) => `${c.name} ${c.shortName} ${c.routeCode} ${c.from} ${c.to}`.toLowerCase().includes(t))
      .slice(0, 4)
      .forEach((c) => out.push({ group: 'Routes & corridors', id: c.id, label: `${c.name}`, hint: c.routeCode, icon: Route, go: () => goto({ kind: 'corridor', id: c.id }, corridorPoint(s.geometry[c.id], 0.5), 12) }));
    s.incidents
      .filter((i) => `${i.title} ${i.locationName} ${i.id} ${i.type}`.toLowerCase().includes(t))
      .slice(0, 4)
      .forEach((i) => out.push({ group: 'Incidents', id: i.id, label: i.title, hint: i.severity, icon: AlertTriangle, go: () => goto({ kind: 'incident', id: i.id }, i.position, 15) }));
    [...PLACES.map((p) => ({ id: p.id, name: p.name, area: p.area, pos: p.position })), ...STOPS.map((p) => ({ id: p.id, name: p.name, area: 'Stop', pos: p.position }))]
      .filter((p) => `${p.name} ${p.area}`.toLowerCase().includes(t))
      .slice(0, 5)
      .forEach((p) => out.push({ group: 'Locations', id: p.id, label: p.name, hint: p.area, icon: MapPin, go: () => goto(null, p.pos, 14) }));
    return out;
  }, [q, s.fleet, s.incidents, s.geometry, s.view, dispatch]);

  const pick = (r: Result) => {
    r.go();
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
  };

  let lastGroup = '';
  return (
    <div className="search" ref={ref}>
      <input
        ref={inputRef}
        value={q}
        placeholder="Search vehicles, routes, incidents, places"
        aria-label="Global search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="search-results"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(results.length - 1, a + 1)));
          if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
          if (e.key === 'Enter' && results[active]) pick(results[active]);
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <Search size={16} />
      <AnimatePresence>
        {open && q.trim() && (
          <motion.div id="search-results" className="search-results" role="listbox" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {results.length === 0 && <div className="empty" style={{ padding: 18 }}>No matches for “{q}”.</div>}
            {results.map((r, i) => {
              const header = r.group !== lastGroup ? <div className="search-group">{(lastGroup = r.group)}</div> : null;
              const Icon = r.icon;
              return (
                <div key={r.group + r.id}>
                  {header}
                  <button className="search-item" role="option" aria-selected={i === active} data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => pick(r)}>
                    <Icon size={14} className="muted" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                    <small>{r.hint}</small>
                  </button>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Notifications() {
  const insights = useInsights();
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  const active = insights.filter((i) => !i.resolved && (i.severity === 'critical' || i.severity === 'high'));
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" aria-label={`Notifications, ${active.length} high priority`} aria-expanded={open} aria-pressed={open} onClick={() => setOpen((o) => !o)}>
        <Bell size={16} strokeWidth={1.6} />
        {active.length > 0 && <span className="dot-badge">{active.length}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="search-results" style={{ left: 'auto', right: 0, width: 340 }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <div className="search-group">High-priority insights · rule-based</div>
            {active.length === 0 && <div className="empty" style={{ padding: 16 }}>Nothing high-priority right now.</div>}
            {active.slice(0, 7).map((i) => (
              <button
                key={i.id}
                className="search-item"
                onClick={() => {
                  setOpen(false);
                  dispatch({ type: 'SET_VIEW', view: 'live' });
                  dispatch({ type: 'SELECT', selection: i.target.kind === 'stop' ? null : { kind: i.target.kind, id: i.target.id }, focus: { center: i.target.position, zoom: 15 } });
                }}
              >
                <span className="dot" style={{ color: i.severity === 'critical' ? 'var(--crit)' : 'var(--warn)' }} />
                <span style={{ fontSize: 13, lineHeight: 1.3 }}>{i.title}</span>
                <small>P{i.priority}</small>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SettingsMenu() {
  const { settings } = useApp();
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="avatar" aria-label="Operator settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Settings2 size={16} strokeWidth={1.5} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="search-results" style={{ left: 'auto', right: 0, width: 280, padding: 12 }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Demo simulation</div>
            <div className="seg" role="group" aria-label="Simulation speed" style={{ marginBottom: 10 }}>
              {[
                [3000, '0.5×'],
                [1500, '1×'],
                [750, '2×'],
                [300, '5×'],
              ].map(([ms, l]) => (
                <button key={ms} aria-pressed={settings.tickMs === ms} onClick={() => dispatch({ type: 'SET_TICK_MS', tickMs: ms as number })}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn sm" onClick={() => dispatch({ type: 'SET_RUNNING', running: !settings.running })}>{settings.running ? 'Pause' : 'Resume'}</button>
              <button className="btn sm" onClick={() => dispatch({ type: 'RESET_SCENARIO' })}>Reset scenario</button>
            </div>
            <p className="source-note" style={{ marginTop: 10, lineHeight: 1.5 }}>
              1 tick = 1 simulated minute. Independent prototype — not affiliated with any Mumbai transport or traffic authority.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TopNav() {
  const { view, minute, settings, incidents } = useApp();
  const dispatch = useDispatch();
  const [mobile, setMobile] = useState(false);
  const openIncidents = incidents.filter((i) => i.status === 'open').length;
  const go = (id: ViewId) => {
    dispatch({ type: 'SET_VIEW', view: id });
    setMobile(false);
  };
  return (
    <header className="nav">
      <button className="icon-btn menu-btn" aria-label={mobile ? 'Close menu' : 'Open menu'} aria-expanded={mobile} onClick={() => setMobile((m) => !m)}>
        {mobile ? <X size={17} /> : <Menu size={17} />}
      </button>
      <div className="brand">
        <Logo />
        <div className="hide-sm">
          <div className="brand-name">Mumbai Flow</div>
          <div className="brand-sub">Traffic Intelligence</div>
        </div>
      </div>
      <nav className="tabs" aria-label="Primary">
        {NAV.map((n) => (
          <button key={n.id} className="tab" aria-current={view === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
            {view === n.id && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
            {n.label}
            {n.id === 'incidents' && openIncidents > 0 && <span className="tab-badge">{openIncidents}</span>}
          </button>
        ))}
      </nav>
      <div className="nav-spacer" />
      <GlobalSearch />
      <div className="sys-status" title="Simulation clock (demo)">
        <span className="dot live-dot" style={{ color: settings.running ? 'var(--ok)' : 'var(--warn)' }} />
        <span className="mono">{clock(minute)}</span>
        <span className="long">{settings.running ? 'Sim running' : 'Sim paused'}</span>
      </div>
      <Notifications />
      <SettingsMenu />
      <AnimatePresence>
        {mobile && (
          <motion.nav className="mobile-nav" aria-label="Primary mobile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {NAV.map((n) => (
              <button key={n.id} className="tab" aria-current={view === n.id ? 'page' : undefined} onClick={() => go(n.id)} style={{ justifyContent: 'space-between', background: view === n.id ? 'rgba(255,255,255,0.06)' : undefined }}>
                {n.label}
                {n.id === 'incidents' && openIncidents > 0 && <span className="tab-badge">{openIncidents}</span>}
              </button>
            ))}
            <div style={{ marginTop: 'auto', padding: 12 }} className="source-note">
              Demo mode · simulated telemetry on a real Mumbai basemap · sim clock {clock(minute)}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
