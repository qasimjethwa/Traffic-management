import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Radio, Wifi } from 'lucide-react';
import type { LatLng, Vehicle } from '../../types';
import { VehicleArt } from '../ui/primitives';
import { clock, STATUS_LABEL, toneFor } from '../../utils/format';
import { corridorPoint } from '../../utils/geo';

/** Projects real corridor geometry into a small SVG trace (the mini-map on each card). */
export function MiniRoute({ line, progress, id }: { line: LatLng[]; progress: number; id: string }) {
  const { d, pin, start } = useMemo(() => {
    const lats = line.map((p) => p[0]);
    const lngs = line.map((p) => p[1]);
    const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const w = (maxLng - minLng) * cos || 1e-6;
    const h = maxLat - minLat || 1e-6;
    const s = Math.min(150 / w, 58 / h);
    const ox = (170 - w * s) / 2;
    const oy = (70 - h * s) / 2;
    const proj = (p: LatLng) => [ox + (p[1] - minLng) * cos * s, oy + (maxLat - p[0]) * s] as const;
    const d = line.map((p, i) => `${i ? 'L' : 'M'}${proj(p)[0].toFixed(1)},${proj(p)[1].toFixed(1)}`).join('');
    return { d, pin: proj(corridorPoint(line, progress)), start: proj(line[0]) };
  }, [line, progress]);
  return (
    <svg viewBox="0 0 170 74" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <pattern id={`g-${id}`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
          <path d="M14 0H0V14" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="170" height="74" fill={`url(#g-${id})`} />
      <rect x="18" y="12" width="40" height="22" fill="rgba(255,255,255,0.04)" />
      <rect x="104" y="40" width="34" height="20" fill="rgba(255,255,255,0.035)" />
      <path d={d} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx={start[0]} cy={start[1]} r="2" fill="#fff" />
      <g transform={`translate(${pin[0]},${pin[1]})`}>
        <path d="M0 0 C-5 -7 -5 -13 0 -13 C5 -13 5 -7 0 0Z" fill="#fff" />
        <circle cy="-9" r="2" fill="#141918" />
      </g>
    </svg>
  );
}

interface Props {
  v: Vehicle;
  line: LatLng[];
  selected: boolean;
  minute: number;
  onSelect: () => void;
  onOpen: () => void;
}

function VehicleCardBase({ v, line, selected, minute, onSelect, onOpen }: Props) {
  const tone = toneFor(v.status);
  const [sh, sm] = v.serviceStart.split(':').map(Number);
  const [eh, em] = v.serviceEnd.split(':').map(Number);
  const shiftPct = Math.min(1, Math.max(0, (minute - (sh * 60 + sm)) / (eh * 60 + em - (sh * 60 + sm))));
  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${v.label}, ${STATUS_LABEL[v.status]}. Select to focus on map.`}
      className="card vcard"
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3>{v.label}</h3>
          <time>Updated {clock(v.lastUpdate || minute, true)}</time>
        </div>
        <button
          className="corner-link"
          aria-label={`Open ${v.label} details`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <ArrowUpRight size={15} strokeWidth={1.5} />
        </button>
      </div>
      <div className="art">
        <VehicleArt type={v.type} width={140} />
        <span className="plate">
          <b>{v.plate[0]}</b>
          {v.plate.slice(2)}
        </span>
      </div>
      <div className="meta">
        <span className={`pill ${tone}`}>{STATUS_LABEL[v.status]}</span>
        <span className="sig">
          <span className={v.gps ? '' : 'off'}>
            <Radio size={11} /> GPS
          </span>
          <span className={v.lte ? (v.status === 'online' ? 'ok-t' : '') : 'off'}>
            <Wifi size={11} /> LTE
          </span>
        </span>
      </div>
      <div className="mini-route">
        <MiniRoute line={line} progress={v.progress} id={v.id} />
      </div>
      <div className="timeline">
        <span>{v.serviceStart}</span>
        <span>{v.serviceEnd}</span>
      </div>
      <div className="track" aria-label={`Shift ${Math.round(shiftPct * 100)}% complete`}>
        {Array.from({ length: 22 }, (_, i) => (
          <i key={i} className={i / 22 < shiftPct ? 'on' : ''} />
        ))}
      </div>
    </motion.div>
  );
}

export const VehicleCard = memo(VehicleCardBase);
