import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { AnimatePresence, motion } from 'framer-motion';
import { Crosshair, Info, Layers, Minus, Pause, Play, Plus } from 'lucide-react';
import { useApp, useDispatch } from '../../app/store';
import { BASE_LAYERS } from '../../services/map/tileProviders';
import type { LayerVisibility } from '../../types';

const OVERLAYS: { id: keyof LayerVisibility; label: string }[] = [
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'corridors', label: 'Corridors' },
  { id: 'heat', label: 'Congestion glow' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'stops', label: 'Stops & demand' },
];

export function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

export function MapControls({ map, bottom = 262, showSim = true }: { map: LeafletMap | null; bottom?: number; showSim?: boolean }) {
  const { settings, baseLayer, layers } = useApp();
  const dispatch = useDispatch();
  const [layersOpen, setLayersOpen] = useState(false);
  const [legend, setLegend] = useState(false);
  const ref = useOutside<HTMLDivElement>(layersOpen, () => setLayersOpen(false));
  return (
    <>
      <div className="map-controls" style={{ bottom }} ref={ref}>
        <button className="ctl" aria-label="Zoom in" title="Zoom in" onClick={() => map?.zoomIn()}>
          <Plus size={17} strokeWidth={1.6} />
        </button>
        <button className="ctl" aria-label="Reset view to Mumbai" title="Reset view to Mumbai" onClick={() => dispatch({ type: 'RESET_VIEW' })}>
          <Crosshair size={17} strokeWidth={1.6} />
        </button>
        <button className="ctl" aria-label="Zoom out" title="Zoom out" onClick={() => map?.zoomOut()}>
          <Minus size={17} strokeWidth={1.6} />
        </button>
        <span style={{ width: 6 }} />
        <button className="ctl" aria-label="Map layers" title="Map layers" aria-expanded={layersOpen} aria-pressed={layersOpen} onClick={() => setLayersOpen((o) => !o)}>
          <Layers size={17} strokeWidth={1.6} />
        </button>
        <button className="ctl" aria-label="Toggle legend" title="Legend" aria-pressed={legend} onClick={() => setLegend((l) => !l)}>
          <Info size={17} strokeWidth={1.6} />
        </button>
        {showSim && (
          <button
            className="ctl"
            aria-label={settings.running ? 'Pause simulation' : 'Resume simulation'}
            title={settings.running ? 'Pause simulation' : 'Resume simulation'}
            onClick={() => dispatch({ type: 'SET_RUNNING', running: !settings.running })}
          >
            {settings.running ? <Pause size={16} strokeWidth={1.6} /> : <Play size={16} strokeWidth={1.6} />}
          </button>
        )}
        <AnimatePresence>
          {layersOpen && (
            <motion.div
              className="glass popover"
              style={{ top: 'auto', bottom: 'calc(100% + 10px)', left: 120, width: 250 }}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              role="dialog"
              aria-label="Map layers"
            >
              <div className="search-group">Basemap</div>
              {BASE_LAYERS.map((b) => (
                <button key={b.id} className="popover-item" role="menuitemradio" aria-checked={baseLayer === b.id} onClick={() => dispatch({ type: 'SET_BASE', base: b.id })}>
                  <span className="dot" style={{ color: baseLayer === b.id ? 'var(--ok)' : 'var(--text-3)' }} />
                  {b.label}
                  <small>{b.hint.split(' ').slice(0, 2).join(' ')}</small>
                </button>
              ))}
              <div className="search-group">Overlays</div>
              {OVERLAYS.map((o) => (
                <button key={o.id} className="popover-item" role="menuitemcheckbox" aria-checked={layers[o.id]} onClick={() => dispatch({ type: 'TOGGLE_LAYER', layer: o.id })}>
                  <span
                    style={{ width: 14, height: 14, borderRadius: 4, border: '1px solid var(--line-2)', background: layers[o.id] ? 'var(--text)' : 'transparent', display: 'inline-block' }}
                  />
                  {o.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>{legend && <Legend bottom={bottom + 52} onClose={() => setLegend(false)} />}</AnimatePresence>
    </>
  );
}

export function Legend({ bottom, onClose }: { bottom: number; onClose: () => void }) {
  return (
    <motion.div
      className="glass legend"
      style={{ left: 22, bottom }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      role="dialog"
      aria-label="Map legend"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="eyebrow">Legend</span>
        <button className="muted" onClick={onClose} aria-label="Close legend" style={{ fontSize: 12 }}>
          Close
        </button>
      </div>
      <div className="eyebrow" style={{ fontSize: 9.5 }}>Corridor congestion (simulated)</div>
      {[
        ['#75C989', 'Free flow < 45'],
        ['#C9C46B', 'Moderate 45–64'],
        ['#D9A45A', 'Heavy 65–79'],
        ['#F06464', 'Severe ≥ 80'],
      ].map(([c, l]) => (
        <div className="legend-row" key={l}>
          <span className="sw" style={{ background: c }} /> {l}
        </div>
      ))}
      <div className="eyebrow" style={{ fontSize: 9.5, marginTop: 4 }}>Vehicles</div>
      {[
        ['rgba(214,220,216,.9)', 'Bus'],
        ['#8fd5a0', 'E-Bus'],
        ['rgba(232,200,95,.92)', 'Taxi'],
        ['#e86a6a', 'Emergency'],
        ['#6fa8dc', 'Service / maintenance'],
      ].map(([c, l]) => (
        <div className="legend-row" key={l}>
          <span className="dot" style={{ color: c, width: 10, height: 10 }} /> {l}
        </div>
      ))}
      <div className="legend-row">
        <span className="dot" style={{ color: 'transparent', boxShadow: '0 0 0 2px #D9A45A', width: 10, height: 10 }} /> Ring: delayed / <span className="crit-t">stopped</span>
      </div>
      <div className="eyebrow" style={{ fontSize: 9.5, marginTop: 4 }}>Incidents</div>
      <div className="legend-row">
        <span style={{ width: 10, height: 10, background: '#f06464', transform: 'rotate(45deg)', borderRadius: 2 }} /> Critical / high
        <span style={{ width: 10, height: 10, background: '#d9a45a', transform: 'rotate(45deg)', borderRadius: 2, marginLeft: 8 }} /> Medium
      </div>
      <div className="legend-row">
        <span className="sm-stop" style={{ width: 12, height: 12, borderWidth: 2 }} /> Stop · <span className="sm-stop" data-over="true" style={{ width: 12, height: 12, borderWidth: 2 }} /> demand &gt; capacity
      </div>
    </motion.div>
  );
}
