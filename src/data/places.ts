import type { LatLng, Place } from '../types';

/** Default map view — Mumbai city centre. */
export const MUMBAI_CENTER: LatLng = [19.076, 72.8777];
export const MUMBAI_ZOOM = 12;
/** Soft bounds that keep panning inside the Mumbai Metropolitan Region. */
export const MMR_BOUNDS: [LatLng, LatLng] = [
  [18.82, 72.68],
  [19.42, 73.22],
];

/** Real Mumbai neighbourhoods and landmarks (approximate WGS84 coordinates). */
export const PLACES: Place[] = [
  { id: 'fort', name: 'Fort / CSMT', area: 'South Mumbai', position: [18.9398, 72.8355] },
  { id: 'nariman', name: 'Nariman Point', area: 'South Mumbai', position: [18.9256, 72.8242] },
  { id: 'marine', name: 'Marine Drive', area: 'South Mumbai', position: [18.9440, 72.8231] },
  { id: 'haji-ali', name: 'Haji Ali', area: 'Mahalaxmi', position: [18.9827, 72.8126] },
  { id: 'lower-parel', name: 'Lower Parel', area: 'Central Mumbai', position: [18.9953, 72.8300] },
  { id: 'worli', name: 'Worli', area: 'Central Mumbai', position: [19.0176, 72.8170] },
  { id: 'dadar', name: 'Dadar', area: 'Central Mumbai', position: [19.0178, 72.8478] },
  { id: 'sion', name: 'Sion Circle', area: 'Central Mumbai', position: [19.0390, 72.8619] },
  { id: 'bandra', name: 'Bandra West', area: 'Western Suburbs', position: [19.0596, 72.8295] },
  { id: 'bkc', name: 'Bandra-Kurla Complex', area: 'BKC', position: [19.0660, 72.8679] },
  { id: 'kurla', name: 'Kurla', area: 'Eastern Suburbs', position: [19.0726, 72.8845] },
  { id: 'santacruz', name: 'Santacruz', area: 'Western Suburbs', position: [19.0810, 72.8410] },
  { id: 'airport', name: 'CSMIA Airport (T2)', area: 'Andheri East', position: [19.0990, 72.8740] },
  { id: 'andheri', name: 'Andheri', area: 'Western Suburbs', position: [19.1197, 72.8468] },
  { id: 'seepz', name: 'SEEPZ', area: 'Andheri East', position: [19.1268, 72.8740] },
  { id: 'powai', name: 'Powai', area: 'Eastern Suburbs', position: [19.1176, 72.9060] },
  { id: 'ghatkopar', name: 'Ghatkopar', area: 'Eastern Suburbs', position: [19.0860, 72.9081] },
  { id: 'chembur', name: 'Chembur', area: 'Eastern Suburbs', position: [19.0622, 72.9005] },
  { id: 'vikhroli', name: 'Vikhroli', area: 'Eastern Suburbs', position: [19.1110, 72.9280] },
  { id: 'goregaon', name: 'Goregaon', area: 'Western Suburbs', position: [19.1650, 72.8490] },
  { id: 'borivali', name: 'Borivali', area: 'Western Suburbs', position: [19.2290, 72.8570] },
  { id: 'mulund', name: 'Mulund', area: 'Eastern Suburbs', position: [19.1726, 72.9560] },
  { id: 'thane', name: 'Thane', area: 'Thane', position: [19.1972, 72.9640] },
  { id: 'vashi', name: 'Vashi', area: 'Navi Mumbai', position: [19.0771, 72.9986] },
];

export const placeById = (id: string) => PLACES.find((p) => p.id === id);
