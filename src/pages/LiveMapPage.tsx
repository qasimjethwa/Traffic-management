import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import L, { type Map as LeafletMap } from 'leaflet';
import { useMap, useMapEvents } from 'react-leaflet';
import { AlertTriangle, BusFront, CheckCircle2, ChevronDown, Map as MapIcon, PanelLeft, X } from 'lucide-react';
import { useApp, useDispatch } from '../app/store';
import MumbaiMap from '../components/map/MumbaiMap';
import { MapControls, useOutside } from '../components/map/MapChrome';
import { VehicleCard } from '../components/fleet/VehicleCard';
import { WarningPanel } from '../components/intelligence/InsightPanel';
import { SelectionDrawer } from '../components/intelligence/SelectionDrawer';
import { EfficiencyCard, PassengerVolume, ScheduleOffset } from '../components/analytics/OpsWidgets';
import { AnimatedNumber, CornerLink, DemoTag, Empty } from '../components/ui/primitives';
import { useFleetTotals } from '../hooks/useDerived';
import { stopById } from '../data/corridors';
import { vehiclePosition } from '../engine/trafficIntelligence';
import { BASE_LAYERS } from '../services/map/tileProviders';
import { TYPE_LABEL } from '../utils/format';
import type { VehicleType } from '../types';

const TYPE_ORDER: VehicleType[] = ['bus', 'ebus', 'taxi', 'emergency', 'maintenance'];

/** Glass card that follows the selected vehicle on the map, like the reference "Passenger Load" panel. */
function FloatingLoadCard() {
  const map = useMap();
  const { selection, fleet, geometry } = useApp();
  const dispatch = useDispatch();
  const v = selection?.kind === 'vehicle' ? fleet.find((x) => x.id === selection.id) : undefined;
  const [pt, setPt] = useState<L.Point | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pos = v ? vehiclePosition(v, geometry) : null;
  const update = useCallback(() => setPt(pos ? map.latLngToContainerPoint(pos) : null), [map, pos?.[0], pos?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  useMapEvents({ move: update, zoom: update, resize: update });
  useEffect(update, [update]);
  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  });
  if (!v || !pt) return null;
  const size = map.getSize();
  const left = Math.min(Math.max(pt.x - 270, 12), size.x - 250);
  const top = Math.min(Math.max(pt.y + 26, 120), size.y - 360);
  const load = v.capacity ? Math.round((v.occupancy / v.capacity) * 100) : null;
  return (
    <motion.div ref={ref} className="float-card" style={{ left, top }} initial={{ opacity: 0, scale: 0.94, rotate: -2 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h4>{load !== null ? 'Passenger Load' : 'Unit Status'}</h4>
          <div className="sub">{v.nextStopId ? `Next: ${stopById(v.nextStopId)?.name}` : `${TYPE_LABEL[v.type]} · ${v.speed} km/h`}</div>
        </div>
        <button className="corner-link" aria-label="Close vehicle card" onClick={() => dispatch({ type: 'SELECT', selection: null })}>
          <X size={14} />
        </button>
      </div>
      <div className="big-num">
        {load !== null ? (
          <>
            <AnimatedNumber value={load} />
            <span className="frac">%</span>
          </>
        ) : (
          <>
            <AnimatedNumber value={v.speed} />
            <span className="unit">km/h</span>
          </>
        )}
      </div>
      <div className="source-note" style={{ marginTop: 8 }}>{v.label} · simulated telemetry</div>
    </motion.div>
  );
}

function VehiclePicker() {
  const { fleet, selection, geometry } = useApp();
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  const sel = selection?.kind === 'vehicle' ? fleet.find((v) => v.id === selection.id) : undefined;
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="map-chip" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((o) => !o)}>
        <BusFront size={15} strokeWidth={1.5} />
        {sel ? sel.label : 'Select vehicle'}
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="glass popover" role="listbox" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            {fleet.map((v) => (
              <button
                key={v.id}
                role="option"
                aria-checked={sel?.id === v.id}
                aria-selected={sel?.id === v.id}
                className="popover-item"
                onClick={() => {
                  dispatch({ type: 'SELECT', selection: { kind: 'vehicle', id: v.id }, focus: { center: vehiclePosition(v, geometry), zoom: 15 } });
                  setOpen(false);
                }}
              >
                <span className="dot" style={{ color: v.status === 'offline' ? 'var(--text-3)' : v.status === 'online' ? 'var(--ok)' : v.status === 'delayed' ? 'var(--warn)' : 'var(--crit)' }} />
                {v.label}
                <small>{TYPE_LABEL[v.type]}</small>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LiveMapPage() {
  const { fleet, geometry, selection, minute, baseLayer } = useApp();
  const dispatch = useDispatch();
  const totals = useFleetTotals();
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [types, setTypes] = useState<Set<VehicleType>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [sideOpen, setSideOpen] = useState(false);

  const filtered = useMemo(
    () =>
      fleet.filter(
        (v) =>
          (types.size === 0 || types.has(v.type)) &&
          (statusFilter === 'all' || (statusFilter === 'offline' ? v.status === 'offline' : v.status !== 'offline')),
      ),
    [fleet, types, statusFilter],
  );
  const highlight = useMemo(() => (types.size || statusFilter !== 'all' ? new Set(filtered.map((v) => v.id)) : null), [filtered, types, statusFilter]);
  const selId = selection?.kind === 'vehicle' ? selection.id : null;
  const cards = useMemo(() => {
    const sel = filtered.find((v) => v.id === selId);
    const rest = filtered.filter((v) => v.id !== selId).sort((a, b) => Number(b.capacity > 0) - Number(a.capacity > 0));
    return (sel ? [sel, ...rest] : rest).slice(0, 6);
  }, [filtered, selId]);

  const toggleType = (t: VehicleType) =>
    setTypes((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  const cycleBase = () => {
    const i = BASE_LAYERS.findIndex((b) => b.id === baseLayer);
    dispatch({ type: 'SET_BASE', base: BASE_LAYERS[(i + 1) % BASE_LAYERS.length].id });
  };

  const onMap = useCallback((m: LeafletMap) => setMap(m), []);
  const selectVehicle = useCallback(
    (id: string) => {
      const v = fleet.find((x) => x.id === id);
      if (v) dispatch({ type: 'SELECT', selection: { kind: 'vehicle', id }, focus: { center: vehiclePosition(v, geometry), zoom: 15 } });
      setSideOpen(false);
    },
    [fleet, geometry, dispatch],
  );

  return (
    <div className="live">
      <aside className="sidebar" data-open={sideOpen} aria-label="Fleet operations">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="eyebrow">Fleet · {totals.total} demo vehicles</span>
          <button className="sheet-toggle icon-btn" style={{ width: 32, height: 32 }} aria-label="Close fleet panel" onClick={() => setSideOpen(false)}>
            <X size={15} />
          </button>
        </div>
        <div className="type-chips" role="group" aria-label="Filter by vehicle type">
          {TYPE_ORDER.map((t) => (
            <button key={t} className="chip" aria-pressed={types.has(t)} onClick={() => toggleType(t)}>
              <span className="count">{totals.byType[t] ?? 0}</span> {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="stat-pair">
          <button className="card stat" aria-pressed={statusFilter === 'online'} onClick={() => setStatusFilter((f) => (f === 'online' ? 'all' : 'online'))}>
            <span className="label">
              <CheckCircle2 size={18} color="var(--ok)" fill="rgba(117,201,137,0.25)" />
              Online
            </span>
            <AnimatedNumber value={totals.online} className="val" />
          </button>
          <button className="card stat" aria-pressed={statusFilter === 'offline'} onClick={() => setStatusFilter((f) => (f === 'offline' ? 'all' : 'offline'))}>
            <span className="label">
              <AlertTriangle size={18} color="var(--crit)" fill="rgba(240,100,100,0.25)" />
              Offline
            </span>
            <AnimatedNumber value={totals.offline} className="val" />
          </button>
        </div>
        <EfficiencyCard />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 2px 0' }}>
          <span className="eyebrow">Vehicles {highlight ? `· ${filtered.length} match` : ''}</span>
          <CornerLink label="Open full fleet list" onClick={() => dispatch({ type: 'SET_VIEW', view: 'fleet' })} />
        </div>
        {cards.length === 0 ? (
          <Empty title="No vehicles match these filters" action={<button className="btn sm" onClick={() => (setTypes(new Set()), setStatusFilter('all'))}>Clear filters</button>} />
        ) : (
          <div className="vcards">
            {cards.map((v) => (
              <VehicleCard key={v.id} v={v} line={geometry[v.corridorId]} minute={minute} selected={v.id === selId} onSelect={() => selectVehicle(v.id)} onOpen={() => selectVehicle(v.id)} />
            ))}
          </div>
        )}
      </aside>

      <section className="mapwrap" aria-label="Mumbai live map">
        <MumbaiMap highlightVehicles={highlight} onMap={onMap}>
          <FloatingLoadCard />
        </MumbaiMap>
        <div className="map-vignette" />
        <div className="map-title">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            Traffic Management
          </motion.h1>
          <div className="row">
            <button className="map-chip sheet-toggle" onClick={() => setSideOpen(true)} aria-label="Open fleet panel">
              <PanelLeft size={15} /> Fleet
            </button>
            <VehiclePicker />
            <button className="map-chip" onClick={cycleBase} title="Cycle basemap" aria-label={`Basemap: ${baseLayer}. Click to change.`}>
              <MapIcon size={15} strokeWidth={1.5} /> {BASE_LAYERS.find((b) => b.id === baseLayer)?.label}
            </button>
            <DemoTag />
          </div>
        </div>
        <div className="right-stack">{!selection && <WarningPanel />}</div>
        <SelectionDrawer />
        <MapControls map={map} />
        <div className="bottom-strip" data-drawer={!!selection && selection.kind !== 'place'}>
          <ScheduleOffset />
          <PassengerVolume />
        </div>
      </section>
    </div>
  );
}
