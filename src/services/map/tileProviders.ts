import type { BaseLayerId } from '../../types';

/**
 * Basemap providers. All of these are real geographic tiles of Mumbai.
 *
 * - Esri World Imagery (+ Esri transportation / place-label reference layers) — "Hybrid".
 * - Esri Dark Gray Canvas (+ reference labels) — "Dark". Replaced by Stadia "Alidade Smooth
 *   Dark" when VITE_STADIA_API_KEY is set.
 * - OpenStreetMap standard tiles with a dark CSS treatment — fallback.
 * All require visible attribution (rendered by Leaflet). Esri basemaps are used here for a
 * non-commercial demo; review Esri's terms (an ArcGIS account/key may be required for
 * production or commercial use). Follow the OSM tile usage policy for the fallback.
 */

export interface TileDef {
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
  /** CSS class applied to the tile pane for tonal treatment. */
  className?: string;
}

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
const ESRI_IMG_ATTR = 'Imagery &copy; <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community';
const ESRI_REF_ATTR = 'Labels &amp; roads &copy; <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors';
const ESRI_CANVAS_ATTR = 'Basemap &copy; <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS User Community';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

const stadiaKey = (import.meta.env.VITE_STADIA_API_KEY as string | undefined)?.trim();

export const TILES = {
  dark: stadiaKey
    ? {
        url: `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${stadiaKey}`,
        attribution: `&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noreferrer">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> ${OSM_ATTR}`,
        maxZoom: 20,
        className: 'tiles-dark',
      }
    : {
        url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
        attribution: ESRI_CANVAS_ATTR,
        maxZoom: 16,
        className: 'tiles-dark',
      },
  darkLabels: {
    url: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_CANVAS_ATTR,
    maxZoom: 16,
    className: 'tiles-labels',
  },
  satellite: {
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_IMG_ATTR,
    maxZoom: 19,
    className: 'tiles-satellite',
  },
  roads: {
    url: `${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_REF_ATTR,
    maxZoom: 19,
    className: 'tiles-roads',
  },
  labels: {
    url: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_REF_ATTR,
    maxZoom: 19,
    className: 'tiles-labels',
  },
  streets: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTR,
    maxZoom: 19,
    className: 'tiles-osm-dark',
  },
} satisfies Record<string, TileDef>;

export const BASE_LAYERS: { id: BaseLayerId; label: string; hint: string }[] = [
  { id: 'hybrid', label: 'Hybrid', hint: 'Muted satellite with roads & labels' },
  { id: 'dark', label: 'Dark', hint: 'Dark gray street canvas' },
  { id: 'satellite', label: 'Satellite', hint: 'Esri World Imagery' },
  { id: 'streets', label: 'OSM', hint: 'OpenStreetMap standard tiles (fallback)' },
];

export const usingStadia = Boolean(stadiaKey);
