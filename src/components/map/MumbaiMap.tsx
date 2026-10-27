import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { useApp, useDispatch } from '../../app/store';
import { CORRIDORS } from '../../data/corridors';
import { MMR_BOUNDS, MUMBAI_CENTER, MUMBAI_ZOOM, PLACES } from '../../data/places';
import { TILES, usingStadia, type TileDef } from '../../services/map/tileProviders';
import { corridorHeading, corridorPoint, slicePolyline } from '../../utils/geo';
import { congestionColor, geometryNote, STATUS_LABEL, TYPE_LABEL } from '../../utils/format';
import { incidentIcon, labelIcon, pinIcon, stopIcon, vehicleIcon } from './markers';
import { useStopDemand } from '../../hooks/useDerived';
import type { LatLng, Vehicle } from '../../types';

export interface RouteOverlay {
  id: string;
  line: LatLng[];
  color: string;
  dashed?: boolean;
  weight?: number;
  label?: string;
}

interface Props {
  /** Restrict visible vehicles (others dimmed). */
  highlightVehicles?: Set<string> | null;
  overlays?: RouteOverlay[];
  pins?: { pos: LatLng; label: string; tone: 'start' | 'end' }[];
  onMap?: (m: LeafletMap) => void;
  children?: ReactNode;
  initialZoom?: number;
  fitTo?: LatLng[] | null;
}

/** Reacts to focus requests from the store with a smooth fly-to. */
function FocusController({ fitTo }: { fitTo?: LatLng[] | null }) {
  const map = useMap();
  const { focus } = useApp();
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!focus || focus.nonce === last.current) return;
    last.current = focus.nonce;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) map.setView(focus.center, focus.zoom);
    else map.flyTo(focus.center, focus.zoom, { duration: 1.1, easeLinearity: 0.2 });
  }, [focus, map]);
  const fitKey = fitTo ? fitTo.length + ':' + fitTo[0]?.join(',') + fitTo[fitTo.length - 1]?.join(',') : '';
  useEffect(() => {
    if (!fitTo || fitTo.length < 2) return;
    map.flyToBounds(L.latLngBounds(fitTo), { padding: [60, 60], duration: 0.9, maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

/** Tile layer that reports failure so the app can fall back to OSM. */
function SmartTiles({ def, zIndex, watch }: { def: TileDef; zIndex?: number; watch?: boolean }) {
  const dispatch = useDispatch();
  const stats = useRef({ ok: 0, err: 0 });
  return (
    <TileLayer
      url={def.url}
      attribution={def.attribution}
      maxNativeZoom={def.maxZoom}
      maxZoom={18}
      subdomains={def.subdomains ?? 'abc'}
      className={def.className}
      zIndex={zIndex}
      eventHandlers={
        watch
          ? {
              tileload: () => {
                stats.current.ok++;
              },
              tileerror: () => {
                stats.current.err++;
                if (stats.current.err >= 6 && stats.current.ok < 2) dispatch({ type: 'TILE_FALLBACK' });
              },
            }
          : undefined
      }
    />
  );
}

function BaseLayers() {
  const { baseLayer } = useApp();
  switch (baseLayer) {
    case 'hybrid':
      return (
        <>
          <SmartTiles key="sat" def={TILES.satellite} watch />
          <SmartTiles key="roads" def={TILES.roads} zIndex={4} />
          <SmartTiles key="lbl" def={TILES.labels} zIndex={5} />
        </>
      );
    case 'satellite':
      return <SmartTiles key="sat2" def={TILES.satellite} watch />;
    case 'dark':
      return (
        <>
          <SmartTiles key="dark" def={TILES.dark} watch />
          {!usingStadia && <SmartTiles key="dlbl" def={TILES.darkLabels} zIndex={5} />}
        </>
      );
    case 'streets':
      return <SmartTiles key="osm" def={TILES.streets} />;
  }
}

const Corridors = memo(function Corridors() {
  const { geometry, corridors, layers, selection, geometrySource, geometryRetrievedAt } = useApp();
  const dispatch = useDispatch();
  if (!layers.corridors) return null;
  return (
    <>
      {CORRIDORS.map((c) => {
        const line = geometry[c.id];
        const st = corridors[c.id];
        const color = congestionColor(st.congestion);
        const sel = selection?.kind === 'corridor' && selection.id === c.id;
        return (
          <FragmentLine key={c.id}>
            {layers.heat && (
              <Polyline positions={line} pathOptions={{ color, weight: sel ? 22 : 14, opacity: 0.16 + (st.congestion / 100) * 0.18, lineCap: 'round', interactive: false }} />
            )}
            <Polyline
              positions={line}
              pathOptions={{ color: sel ? '#ffffff' : color, weight: sel ? 5 : 3.2, opacity: 0.92, lineCap: 'round' }}
              eventHandlers={{
                click: () => dispatch({ type: 'SELECT', selection: { kind: 'corridor', id: c.id } }),
              }}
            >
              <Tooltip className="mf-tip" sticky>
                <b>{c.name}</b> · {c.routeCode}
                <br />
                Congestion {st.congestion.toFixed(0)}/100 · {st.avgSpeed.toFixed(0)} km/h (simulated)
                <br />
                <span style={{ opacity: 0.6 }}>{geometryNote(geometrySource[c.id], geometryRetrievedAt[c.id], true)}</span>
                <br />
                <span style={{ color: '#D9A45A' }}>Congestion & speed: SIMULATED</span>
              </Tooltip>
            </Polyline>
            <Polyline positions={line} pathOptions={{ color: 'rgba(255,255,255,0.7)', weight: 1.6, className: 'corridor-flow', interactive: false }} />
          </FragmentLine>
        );
      })}
    </>
  );
});

function FragmentLine({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function SelectedTrace() {
  const { selection, fleet, geometry } = useApp();
  const v = selection?.kind === 'vehicle' ? fleet.find((x) => x.id === selection.id) : undefined;
  if (!v) return null;
  const line = geometry[v.corridorId];
  const [done, ahead] =
    v.direction === 1 ? [slicePolyline(line, 0, v.progress), slicePolyline(line, v.progress, 1)] : [slicePolyline(line, v.progress, 1), slicePolyline(line, 0, v.progress)];
  return (
    <>
      <Polyline positions={done} pathOptions={{ color: '#ffffff', weight: 3.5, opacity: 0.95, interactive: false }} />
      <Polyline positions={ahead} pathOptions={{ color: '#ffffff', weight: 3, opacity: 0.9, dashArray: '8 9', interactive: false }} />
    </>
  );
}

const VehicleMarker = memo(function VehicleMarker({ v, line, selected, dim, onSelect }: { v: Vehicle; line: LatLng[]; selected: boolean; dim: boolean; onSelect: (v: Vehicle, pos: LatLng) => void }) {
  const pos = corridorPoint(line, v.progress);
  const heading = corridorHeading(line, v.progress, v.direction);
  return (
    <Marker
      position={pos}
      icon={vehicleIcon(v, heading, selected, dim)}
      zIndexOffset={selected ? 1000 : v.status === 'offline' ? -100 : 0}
      keyboard
      title={`${v.label} — ${STATUS_LABEL[v.status]}`}
      alt={v.label}
      eventHandlers={{ click: () => onSelect(v, pos) }}
    >
      {!selected && (
        <Tooltip className="mf-tip" direction="top" offset={[0, -14]}>
          <b>{v.label}</b> · {TYPE_LABEL[v.type]}
          <br />
          {STATUS_LABEL[v.status]} · {v.speed} km/h{v.capacity ? ` · ${v.delayMin > 0 ? '+' : ''}${v.delayMin.toFixed(1)} min` : ''}
        </Tooltip>
      )}
    </Marker>
  );
});

function Vehicles({ highlight }: { highlight?: Set<string> | null }) {
  const { fleet, geometry, selection, layers } = useApp();
  const dispatch = useDispatch();
  const onSelect = useMemo(
    () => (v: Vehicle, pos: LatLng) => dispatch({ type: 'SELECT', selection: { kind: 'vehicle', id: v.id }, focus: { center: pos, zoom: 14 } }),
    [dispatch],
  );
  if (!layers.vehicles) return null;
  return (
    <>
      {fleet.map((v) => (
        <VehicleMarker
          key={v.id}
          v={v}
          line={geometry[v.corridorId]}
          selected={selection?.kind === 'vehicle' && selection.id === v.id}
          dim={!!highlight && !highlight.has(v.id)}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function Incidents() {
  const { incidents, selection, layers } = useApp();
  const dispatch = useDispatch();
  if (!layers.incidents) return null;
  return (
    <>
      {incidents.map((i) => (
        <Marker
          key={i.id}
          position={i.position}
          icon={incidentIcon(i, selection?.kind === 'incident' && selection.id === i.id)}
          zIndexOffset={500}
          title={i.title}
          alt={i.title}
          eventHandlers={{ click: () => dispatch({ type: 'SELECT', selection: { kind: 'incident', id: i.id }, focus: { center: i.position, zoom: 15 } }) }}
        >
          <Tooltip className="mf-tip" direction="top" offset={[0, -14]}>
            <b>{i.title}</b>
            <br />
            {i.locationName} · {i.severity} · {i.status}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

function Stops() {
  const { layers } = useApp();
  const demand = useStopDemand();
  if (!layers.stops) return null;
  return (
    <>
      {demand.map((d) => (
        <Marker key={d.stopId} position={d.stop.position} icon={stopIcon(d.demand > d.capacity)} zIndexOffset={-50}>
          <Tooltip className="mf-tip" direction="top" offset={[0, -8]}>
            <b>{d.stop.name}</b>
            <br />
            Demand {d.demand} pax/h · capacity {d.capacity} pax/h
            <br />
            <span style={{ opacity: 0.6 }}>Demo demand model</span>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

function PlaceLabels() {
  const { baseLayer } = useApp();
  const [zoom, setZoom] = useState(MUMBAI_ZOOM);
  useMapEvents({ zoomend: (e) => setZoom(e.target.getZoom()) });
  if (baseLayer !== 'satellite' || zoom < 11) return null;
  return (
    <>
      {PLACES.map((p) => (
        <Marker key={p.id} position={p.position} icon={labelIcon(p.name)} interactive={false} keyboard={false} />
      ))}
    </>
  );
}

function MapRef({ onMap }: { onMap?: (m: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    onMap?.(map);
  }, [map, onMap]);
  // Suspend the marker glide transition during zoom so markers don't drift.
  useEffect(() => {
    const el = map.getContainer();
    let t: number | undefined;
    const start = () => {
      window.clearTimeout(t);
      el.classList.add('mf-zooming');
    };
    const end = () => {
      t = window.setTimeout(() => el.classList.remove('mf-zooming'), 120);
    };
    map.on('zoomstart', start);
    map.on('zoomend', end);
    return () => {
      map.off('zoomstart', start);
      map.off('zoomend', end);
      window.clearTimeout(t);
    };
  }, [map]);
  return null;
}

export default function MumbaiMap({ highlightVehicles, overlays, pins, onMap, children, initialZoom = MUMBAI_ZOOM, fitTo }: Props) {
  return (
    <MapContainer
      center={MUMBAI_CENTER}
      zoom={initialZoom}
      minZoom={10}
      maxZoom={18}
      maxBounds={MMR_BOUNDS}
      maxBoundsViscosity={0.7}
      zoomControl={false}
      attributionControl
      preferCanvas={false}
      worldCopyJump={false}
    >
      <BaseLayers />
      <Corridors />
      {overlays?.map((o) => (
        <Polyline key={o.id} positions={o.line} pathOptions={{ color: o.color, weight: o.weight ?? 4.5, opacity: 0.95, dashArray: o.dashed ? '9 10' : undefined, lineCap: 'round' }}>
          {o.label && (
            <Tooltip className="mf-tip" sticky>
              {o.label}
            </Tooltip>
          )}
        </Polyline>
      ))}
      <SelectedTrace />
      <Stops />
      <Incidents />
      <Vehicles highlight={highlightVehicles} />
      <PlaceLabels />
      {pins?.map((p) => <Marker key={p.label + p.pos.join()} position={p.pos} icon={pinIcon(p.label, p.tone)} zIndexOffset={2000} />)}
      <FocusController fitTo={fitTo} />
      <MapRef onMap={onMap} />
      {children}
    </MapContainer>
  );
}
