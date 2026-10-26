import L from 'leaflet';
import type { Incident, Vehicle } from '../../types';

/**
 * DivIcon factories. Icons are cached by their visual key so React-Leaflet only swaps the
 * icon element when something visible changes (not on every simulation tick).
 */
const ICON_SVG: Record<string, string> = {
  bus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M8 18v3M16 18v3"/></svg>',
  ebus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  taxi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 16V11l2-5h10l2 5v5M3 16h18M7 19v-3M17 19v-3"/></svg>',
  emergency: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>',
  maintenance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>',
  congestion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  delay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  breakdown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 3 2 21h20zM12 10v5M12 18h.01"/></svg>',
  capacity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a5 5 0 0 1 10 0v2M17 11a3 3 0 1 0 0-6M21 21v-2a5 5 0 0 0-3-4.6"/></svg>',
  closure: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M7 12h10"/></svg>',
  waterlogging: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>',
};

const cache = new Map<string, L.DivIcon>();

export function vehicleIcon(v: Vehicle, heading: number, selected: boolean, dim: boolean) {
  const bucket = Math.round(heading / 15) * 15;
  const key = `v|${v.type}|${v.status}|${bucket}|${selected}|${dim}`;
  let icon = cache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: 'vm-icon',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      html: `<div class="vm${selected ? ' sel' : ''}" data-type="${v.type}" data-status="${v.status}" data-dim="${dim}">
        ${selected ? '<div class="vm-sel"></div>' : ''}
        <div class="vm-heading" style="transform:rotate(${bucket}deg)"></div>
        <div class="vm-core">${ICON_SVG[v.type]}</div></div>`,
    });
    cache.set(key, icon);
  }
  return icon;
}

export function incidentIcon(i: Incident, selected: boolean) {
  const key = `i|${i.type}|${i.severity}|${i.status}|${selected}`;
  let icon = cache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: 'im-icon',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      html: `<div class="im${selected ? ' sel' : ''}" data-sev="${i.severity}" data-status="${i.status}"><div class="im-core">${ICON_SVG[i.type]}</div></div>`,
    });
    cache.set(key, icon);
  }
  return icon;
}

export function stopIcon(over: boolean) {
  const key = `s|${over}`;
  let icon = cache.get(key);
  if (!icon) {
    icon = L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: `<div class="sm-stop" data-over="${over}"></div>` });
    cache.set(key, icon);
  }
  return icon;
}

export function labelIcon(text: string) {
  const key = `l|${text}`;
  let icon = cache.get(key);
  if (!icon) {
    icon = L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="place-lbl">${text}</div>` });
    cache.set(key, icon);
  }
  return icon;
}

export function pinIcon(label: string, tone: 'start' | 'end') {
  const key = `p|${label}|${tone}`;
  let icon = cache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      html: `<div style="width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font:600 11px Urbanist,sans-serif;background:${tone === 'start' ? '#E8EBE7' : '#75C989'};color:#0e1211;border:3px solid rgba(14,18,17,.9);box-shadow:0 0 0 1px rgba(255,255,255,.5),0 6px 18px rgba(0,0,0,.5)">${label}</div>`,
    });
    cache.set(key, icon);
  }
  return icon;
}
