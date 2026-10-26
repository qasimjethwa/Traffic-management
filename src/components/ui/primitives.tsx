import { animate, useMotionValue, useReducedMotion, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, FlaskConical, SearchX } from 'lucide-react';

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <g stroke="#E8EBE7" strokeWidth="2.6" strokeLinecap="round">
        <path d="M5 14 14 5" />
        <path d="M5 21 21 5" />
        <path d="M9 26 26 9" opacity="0.85" />
        <path d="M16 27 27 16" opacity="0.6" />
      </g>
    </svg>
  );
}

/** Counts smoothly towards `value`. Splits the decimal part so it can be dimmed like the reference. */
export function AnimatedNumber({ value, decimals = 0, splitFraction = false, className }: { value: number; decimals?: number; splitFraction?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const [shown, setShown] = useState(value);
  const first = useRef(true);
  useEffect(() => {
    if (reduce || first.current) {
      first.current = false;
      mv.set(value);
      setShown(value);
      return;
    }
    const c = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(v) });
    return () => c.stop();
  }, [value, reduce, mv]);
  const str = shown.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (!splitFraction || decimals === 0) return <span className={className}>{str}</span>;
  const [int, frac] = str.split('.');
  return (
    <span className={className}>
      {int}
      <span className="frac">.{frac}</span>
    </span>
  );
}

/** Indian-grouped counter with the trailing group dimmed (e.g. 1,42,580 → "1,42," + "580"). */
export function DimTail({ value }: { value: number }) {
  const s = Math.round(value).toLocaleString('en-IN');
  const i = s.lastIndexOf(',');
  if (i < 0) return <>{s}</>;
  return (
    <>
      {s.slice(0, i + 1)}
      <span className="frac">{s.slice(i + 1)}</span>
    </>
  );
}

export function CornerLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="corner-link" aria-label={label} title={label} onClick={onClick}>
      <ArrowUpRight size={16} strokeWidth={1.5} />
    </button>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <SearchX size={26} strokeWidth={1.4} />
      <div style={{ color: 'var(--text-2)' }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5 }}>{hint}</div>}
      {action}
    </div>
  );
}

export function DemoTag({ text = 'Demo mode · Simulated operational telemetry' }: { text?: string }) {
  return (
    <span className="demo-tag" title="Fleet positions, congestion scores, incidents and insights are simulated. The basemap is real geographic data.">
      <FlaskConical size={12} />
      {text}
    </span>
  );
}

export function FadeIn({ children, delay = 0, className, style }: { children: ReactNode; delay?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Original line-art vehicle illustration used on fleet cards. */
export function VehicleArt({ type, width = 150 }: { type: string; width?: number }) {
  const stroke = 'rgba(232,235,231,0.75)';
  if (type === 'taxi') {
    return (
      <svg width={width * 0.8} viewBox="0 0 120 46" fill="none" stroke={stroke} strokeWidth="0.9" aria-hidden="true">
        <path d="M8 32h104M10 32c0-6 2-9 8-10l14-9h40l18 9c10 1 18 4 18 10" />
        <path d="M36 14l-6 8h28v-8M62 14v8h26l-14-8" />
        <rect x="50" y="8" width="16" height="5" rx="1" />
        <circle cx="30" cy="34" r="6" /><circle cx="30" cy="34" r="2.5" />
        <circle cx="92" cy="34" r="6" /><circle cx="92" cy="34" r="2.5" />
        <path d="M14 26h6M104 26h6" />
      </svg>
    );
  }
  if (type === 'emergency' || type === 'maintenance') {
    return (
      <svg width={width * 0.85} viewBox="0 0 130 50" fill="none" stroke={stroke} strokeWidth="0.9" aria-hidden="true">
        <path d="M6 36h118M8 36V12h70v24M78 18h22l16 10v8" />
        <path d="M82 22h16l9 6H82z" />
        <rect x="30" y="7" width="18" height="5" rx="1" />
        {type === 'emergency' ? <path d="M36 18v12M30 24h12" /> : <path d="M20 18h40M20 24h40M20 30h40" />}
        <circle cx="26" cy="38" r="6" /><circle cx="26" cy="38" r="2.5" />
        <circle cx="100" cy="38" r="6" /><circle cx="100" cy="38" r="2.5" />
      </svg>
    );
  }
  return (
    <svg width={width} viewBox="0 0 160 56" fill="none" stroke={stroke} strokeWidth="0.85" aria-hidden="true">
      <path d="M6 44h148M8 44V10c0-3 2-5 5-5h134c4 0 7 3 8 7l3 18v14" />
      <path d="M8 13h147" opacity="0.6" />
      {[16, 36, 56, 76, 96, 116].map((x) => (
        <rect key={x} x={x} y="16" width="16" height="13" rx="1.5" />
      ))}
      <path d="M138 16h12l3 13h-15z" />
      <path d="M22 31v12M28 31v12M120 31v12M126 31v12" />
      <rect x="20" y="31" width="10" height="12" />
      <rect x="118" y="31" width="10" height="12" />
      <circle cx="44" cy="46" r="6.5" /><circle cx="44" cy="46" r="3" />
      <circle cx="134" cy="46" r="6.5" /><circle cx="134" cy="46" r="3" />
      {type === 'ebus' && <path d="M70 3h22M78 3v2M84 3v2" />}
    </svg>
  );
}
