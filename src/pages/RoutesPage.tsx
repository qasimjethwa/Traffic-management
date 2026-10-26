import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, GitBranch, Loader2, Navigation, TriangleAlert } from 'lucide-react';
import type { Map as LeafletMap } from 'leaflet';
import { useApp, useDispatch } from '../app/store';
import { CORRIDORS, corridorById } from '../data/corridors';
import { PLACES, placeById } from '../data/places';
import MumbaiMap, { type RouteOverlay } from '../components/map/MumbaiMap';
import { MapControls } from '../components/map/MapChrome';
import { SelectionDrawer } from '../components/intelligence/SelectionDrawer';
import { AnimatedNumber, DemoTag } from '../components/ui/primitives';
import { congestionLevel } from '../engine/congestionEngine';
import { rerouteEstimate } from '../engine/trafficIntelligence';
import { fetchRoute, type RouteResult } from '../services/routing/osrm';
import { congestionColor, signed } from '../utils/format';
import { haversineKm } from '../utils/geo';
import type { LatLng } from '../types';

type RouteState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; result: RouteResult }
  | { kind: 'error'; message: string; straight: LatLng[] };

export default function RoutesPage() {
  const { corridors, geometry, selection, fleet, geometrySource } = useApp();
  const dispatch = useDispatch();
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [origin, setOrigin] = useState('bandra');
  const [dest, setDest] = useState('powai');
  const [route, setRoute] = useState<RouteState>({ kind: 'idle' });
  const [reroute, setReroute] = useState(false);
  const selCorridor = selection?.kind === 'corridor' ? selection.id : null;

  const sorted = useMemo(() => [...CORRIDORS].sort((a, b) => corridors[b.id].congestion - corridors[a.id].congestion), [corridors]);
  const est = selCorridor ? rerouteEstimate(selCorridor, corridors) : null;

  const overlays: RouteOverlay[] = [];
  let fitTo: LatLng[] | null = null;
  if (route.kind === 'ok') {
    overlays.push({ id: 'od', line: route.result.geometry, color: '#E8EBE7', weight: 5, label: 'Road route via OSRM' });
    fitTo = route.result.geometry;
  } else if (route.kind === 'error') {
    overlays.push({ id: 'od-straight', line: route.straight, color: '#D9A45A', dashed: true, label: 'Illustrative straight line — not a road route' });
    fitTo = route.straight;
  }
  if (reroute && est) {
    overlays.push({ id: 'base', line: geometry[est.corridor.id], color: '#F06464', weight: 6, label: `Baseline: ${est.corridor.name}` });
    overlays.push({ id: 'alt', line: geometry[est.alternate.id], color: '#75C989', weight: 6, dashed: true, label: `Alternate: ${est.alternate.name}` });
    fitTo = [...geometry[est.corridor.id], ...geometry[est.alternate.id]];
  } else if (selCorridor && route.kind === 'idle') {
    fitTo = geometry[selCorridor];
  }

  const calc = async () => {
    const a = placeById(origin)!;
    const b = placeById(dest)!;
    if (a.id === b.id) return;
    setRoute({ kind: 'loading' });
    try {
      const result = await fetchRoute([a.position, b.position]);
      setRoute({ kind: 'ok', result });
    } catch (e) {
      setRoute({ kind: 'error', message: e instanceof Error ? e.message : 'Routing failed', straight: [a.position, b.position] });
    }
  };

  const selectCorridor = (id: string) => {
    setReroute(false);
    setRoute({ kind: 'idle' });
    dispatch({ type: 'SELECT', selection: { kind: 'corridor', id } });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Route Intelligence</h1>
          <p>Major Mumbai corridors ranked by simulated congestion. Pick a corridor to inspect it, run a reroute comparison, or plan an origin–destination route on real roads.</p>
        </div>
        <DemoTag />
      </div>
      <div className="split rev">
        <div className="list">
          <div className="card card-pad">
            <div className="card-title">Origin → destination</div>
            <div className="toolbar" style={{ marginTop: 12 }}>
              <select className="select" value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Origin">
                {PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ArrowRight size={16} className="muted" />
              <select className="select" value={dest} onChange={(e) => setDest(e.target.value)} aria-label="Destination">
                {PLACES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="btn primary" onClick={calc} disabled={origin === dest || route.kind === 'loading'}>
                {route.kind === 'loading' ? <Loader2 size={14} className="spin" /> : <Navigation size={14} />} Calculate
              </button>
            </div>
            <AnimatePresence mode="wait">
              {route.kind === 'loading' && (
                <motion.div key="l" className="shimmer" style={{ height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.03)', marginTop: 12 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              )}
              {route.kind === 'ok' && (
                <motion.div key="ok" className="facts" style={{ marginTop: 12 }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="fact"><div className="k">Road distance</div><div className="v">{route.result.distanceKm.toFixed(1)} km</div></div>
                  <div className="fact"><div className="k">OSRM drive time*</div><div className="v">{route.result.durationMin.toFixed(0)} min</div></div>
                  <div className="source-note" style={{ gridColumn: '1/-1' }}>*Routing by OSRM on OpenStreetMap data. The estimate has no live traffic — it is not a congestion forecast.</div>
                </motion.div>
              )}
              {route.kind === 'error' && (
                <motion.div key="err" className="fact" style={{ marginTop: 12, display: 'flex', gap: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="alert">
                  <TriangleAlert size={16} className="warn-t" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    Routing service unavailable ({route.message}). The map shows an <b>illustrative straight line</b> ({haversineKm(route.straight[0], route.straight[1]).toFixed(1)} km as the crow flies), not a road route.
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {sorted.map((c, i) => {
            const st = corridors[c.id];
            const n = fleet.filter((v) => v.corridorId === c.id && v.status !== 'offline').length;
            const delayed = fleet.filter((v) => v.corridorId === c.id && v.status === 'delayed').length;
            const sel = selCorridor === c.id;
            return (
              <motion.div key={c.id} layout role="button" tabIndex={0} className="card row-card" aria-selected={sel} onClick={() => selectCorridor(c.id)} onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), selectCorridor(c.id))} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <div className="row-top">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="route-tag"><b>{c.routeCode.slice(1)}</b>{c.routeCode}</span>
                    <span>{c.name}</span>
                  </span>
                  <span className="pill" style={{ color: congestionColor(st.congestion), borderColor: 'currentColor' }}>{congestionLevel(st.congestion)}</span>
                </div>
                <div className="bar" aria-label={`Congestion ${st.congestion.toFixed(0)} of 100`}>
                  <i style={{ width: `${st.congestion}%`, background: congestionColor(st.congestion) }} />
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, flexWrap: 'wrap' }} className="text-2">
                  <span>{c.from} → {c.to}</span>
                  <span className="mono">{st.congestion.toFixed(0)}/100</span>
                  <span className="mono">{st.avgSpeed.toFixed(0)} km/h</span>
                  <span className="mono">{st.travelMinutes.toFixed(0)} min <span className="muted">(free {c.freeFlowMinutes})</span></span>
                  <span>{n} active · <span className={delayed ? 'warn-t' : ''}>{delayed} delayed</span></span>
                </div>
                <AnimatePresence>
                  {sel && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ paddingTop: 8, display: 'grid', gap: 10 }}>
                        <div className="source-note">Geometry: {geometrySource[c.id] === 'osrm' ? 'snapped to OSM roads via OSRM' : 'approximate hand-placed waypoints'}</div>
                        {est ? (
                          <>
                            <button className="btn" style={{ justifySelf: 'start' }} onClick={() => (setRoute({ kind: 'idle' }), setReroute((r) => !r))}>
                              <GitBranch size={14} /> {reroute ? 'Hide reroute comparison' : 'Simulate reroute'}
                            </button>
                            {reroute && (
                              <motion.div className="compare" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                                <div>
                                  <div className="eyebrow">Baseline</div>
                                  <div style={{ margin: '4px 0 8px' }}>{est.corridor.shortName}</div>
                                  <div className="big-num" style={{ fontSize: 30 }}><AnimatedNumber value={est.baseMinutes} />
                                    <span className="unit">min</span></div>
                                  <div className="text-2" style={{ fontSize: 12, marginTop: 6 }}>Congestion {est.baseCongestion.toFixed(0)}/100</div>
                                </div>
                                <div className="alt">
                                  <div className="eyebrow">Alternate</div>
                                  <div style={{ margin: '4px 0 8px' }}>{est.alternate.shortName}</div>
                                  <div className="big-num" style={{ fontSize: 30 }}><AnimatedNumber value={est.altMinutes} />
                                    <span className="unit">min</span></div>
                                  <div className="text-2" style={{ fontSize: 12, marginTop: 6 }}>Congestion {est.altCongestion.toFixed(0)} → {est.altCongestionAfter.toFixed(0)} with diverted load</div>
                                </div>
                                <div style={{ gridColumn: '1/-1' }}>
                                  <div style={{ fontSize: 15 }}>
                                    {est.savingMinutes > 0 ? (
                                      <span className="ok-t">Estimated {est.savingMinutes.toFixed(1)} min faster per trip</span>
                                    ) : (
                                      <span className="warn-t">Alternate is {signed(-est.savingMinutes)} min slower — rerouting not advised now</span>
                                    )}
                                  </div>
                                  <div className="source-note" style={{ marginTop: 6, lineHeight: 1.5 }}>
                                    Demo estimate (engine/trafficIntelligence.ts): the baseline trip time is the corridor's simulated travel time; the alternate assumes a 10% longer detour at the alternate's current delay ratio, plus +8 congestion points from diverted traffic. Not a verified real-world outcome.
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </>
                        ) : (
                          <div className="source-note">No alternate corridor configured for reroute comparison.</div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
        <div className="sticky-map">
          <div className="map-panel">
            <MumbaiMap
              overlays={overlays}
              fitTo={fitTo}
              onMap={setMap}
              initialZoom={11}
              pins={route.kind === 'ok' || route.kind === 'error' ? [
                { pos: placeById(origin)!.position, label: 'A', tone: 'start' },
                { pos: placeById(dest)!.position, label: 'B', tone: 'end' },
              ] : undefined}
            />
            <MapControls map={map} bottom={16} showSim={false} />
            {selCorridor && <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 460 }} className="demo-tag">{corridorById(selCorridor).routeCode} highlighted</div>}
            <SelectionDrawer exclude={['corridor']} />
          </div>
        </div>
      </div>
    </div>
  );
}
