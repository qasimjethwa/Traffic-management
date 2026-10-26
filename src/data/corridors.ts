import type { Corridor, Stop } from '../types';

/**
 * Major Mumbai road corridors.
 * `waypoints` are hand-placed points on the real roads (approximate). At start-up the app
 * tries to snap each corridor to actual road geometry using the public OSRM demo server
 * (see services/routing/osrm.ts); if that fails these waypoints are drawn instead and the
 * UI labels the geometry as approximate.
 *
 * freeFlowMinutes / baseLoad / peakBias are scenario assumptions for the demo simulation.
 */
export const CORRIDORS: Corridor[] = [
  {
    id: 'weh',
    name: 'Western Express Highway',
    shortName: 'WEH',
    routeCode: 'L12',
    from: 'Bandra (Kalanagar)',
    to: 'Dahisar',
    waypoints: [
      [19.0595, 72.8492], [19.0700, 72.8520], [19.0800, 72.8535], [19.0905, 72.8545],
      [19.1010, 72.8560], [19.1130, 72.8560], [19.1250, 72.8565], [19.1380, 72.8580],
      [19.1520, 72.8590], [19.1660, 72.8600], [19.1830, 72.8620], [19.2010, 72.8640],
      [19.2200, 72.8660], [19.2380, 72.8660], [19.2560, 72.8680],
    ],
    freeFlowMinutes: 24,
    baseLoad: 0.57,
    peakBias: 'both',
    alternateId: 'svr',
  },
  {
    id: 'svr',
    name: 'S.V. Road',
    shortName: 'SV Rd',
    routeCode: 'L14',
    from: 'Bandra',
    to: 'Borivali',
    waypoints: [
      [19.0560, 72.8360], [19.0680, 72.8375], [19.0810, 72.8395], [19.0960, 72.8420],
      [19.1100, 72.8440], [19.1200, 72.8460], [19.1360, 72.8480], [19.1540, 72.8490],
      [19.1660, 72.8490], [19.1860, 72.8480], [19.2050, 72.8500], [19.2290, 72.8560],
    ],
    freeFlowMinutes: 38,
    baseLoad: 0.55,
    peakBias: 'both',
    alternateId: 'weh',
  },
  {
    id: 'eeh',
    name: 'Eastern Express Highway',
    shortName: 'EEH',
    routeCode: 'L15',
    from: 'Sion',
    to: 'Thane',
    waypoints: [
      [19.0410, 72.8640], [19.0500, 72.8740], [19.0600, 72.8880], [19.0700, 72.9010],
      [19.0800, 72.9130], [19.0920, 72.9210], [19.1050, 72.9290], [19.1190, 72.9340],
      [19.1330, 72.9390], [19.1480, 72.9450], [19.1640, 72.9510], [19.1800, 72.9570],
      [19.1950, 72.9630],
    ],
    freeFlowMinutes: 26,
    baseLoad: 0.58,
    peakBias: 'both',
    alternateId: 'lbs',
  },
  {
    id: 'lbs',
    name: 'LBS Marg',
    shortName: 'LBS',
    routeCode: 'L24',
    from: 'Kurla',
    to: 'Mulund',
    waypoints: [
      [19.0700, 72.8800], [19.0790, 72.8920], [19.0870, 72.9050], [19.0970, 72.9150],
      [19.1080, 72.9250], [19.1200, 72.9290], [19.1350, 72.9320], [19.1500, 72.9370],
      [19.1720, 72.9480],
    ],
    freeFlowMinutes: 34,
    baseLoad: 0.6,
    peakBias: 'both',
    alternateId: 'eeh',
  },
  {
    id: 'jvlr',
    name: 'Jogeshwari–Vikhroli Link Road',
    shortName: 'JVLR',
    routeCode: 'L18',
    from: 'Jogeshwari',
    to: 'Vikhroli',
    waypoints: [
      [19.1360, 72.8575], [19.1340, 72.8680], [19.1300, 72.8790], [19.1260, 72.8900],
      [19.1230, 72.9000], [19.1210, 72.9120], [19.1180, 72.9240], [19.1150, 72.9330],
    ],
    freeFlowMinutes: 16,
    baseLoad: 0.57,
    peakBias: 'both',
  },
  {
    id: 'sclr',
    name: 'Santacruz–Chembur Link Road',
    shortName: 'SCLR',
    routeCode: 'L21',
    from: 'Vakola',
    to: 'Chembur',
    waypoints: [
      [19.0780, 72.8540], [19.0740, 72.8620], [19.0710, 72.8720], [19.0700, 72.8820],
      [19.0660, 72.8900], [19.0620, 72.8980],
    ],
    freeFlowMinutes: 12,
    baseLoad: 0.5,
    peakBias: 'both',
  },
  {
    id: 'bwsl',
    name: 'Bandra–Worli Sea Link + Coastal Road',
    shortName: 'Sea Link',
    routeCode: 'L01',
    from: 'Bandra',
    to: 'Marine Drive',
    waypoints: [
      [19.0480, 72.8230], [19.0400, 72.8170], [19.0300, 72.8150], [19.0200, 72.8160],
      [19.0080, 72.8140], [18.9960, 72.8110], [18.9830, 72.8100], [18.9700, 72.8080],
      [18.9560, 72.8130], [18.9450, 72.8220],
    ],
    freeFlowMinutes: 14,
    baseLoad: 0.38,
    peakBias: 'am',
    alternateId: 'dadar-south',
  },
  {
    id: 'dadar-south',
    name: 'Dr. Annie Besant Rd / Tulsi Pipe Rd',
    shortName: 'Worli–Dadar',
    routeCode: 'L07',
    from: 'Mahim',
    to: 'Fort',
    waypoints: [
      [19.0410, 72.8410], [19.0280, 72.8450], [19.0170, 72.8440], [19.0060, 72.8350],
      [18.9950, 72.8300], [18.9820, 72.8250], [18.9680, 72.8220], [18.9550, 72.8280],
      [18.9400, 72.8350],
    ],
    freeFlowMinutes: 28,
    baseLoad: 0.57,
    peakBias: 'am',
    alternateId: 'bwsl',
  },
  {
    id: 'sion-panvel',
    name: 'Sion–Panvel Highway',
    shortName: 'Sion–Panvel',
    routeCode: 'L32',
    from: 'Chembur',
    to: 'Vashi',
    waypoints: [
      [19.0560, 72.9020], [19.0520, 72.9150], [19.0480, 72.9300], [19.0520, 72.9450],
      [19.0580, 72.9600], [19.0640, 72.9760], [19.0720, 72.9920],
    ],
    freeFlowMinutes: 15,
    baseLoad: 0.52,
    peakBias: 'pm',
  },
];

export const corridorById = (id: string) => CORRIDORS.find((c) => c.id === id)!;

/** Demonstration stops — real locations, scenario demand figures. */
export const STOPS: Stop[] = [
  { id: 'st-andheri', name: 'Andheri (E) — WEH', position: [19.1150, 72.8560], corridorId: 'weh', peakDemand: 1650 },
  { id: 'st-goregaon', name: 'Goregaon Hub', position: [19.1660, 72.8600], corridorId: 'weh', peakDemand: 980 },
  { id: 'st-borivali', name: 'Borivali (E)', position: [19.2290, 72.8660], corridorId: 'weh', peakDemand: 900 },
  { id: 'st-ghatkopar', name: 'Ghatkopar Depot', position: [19.0870, 72.9050], corridorId: 'lbs', peakDemand: 1500 },
  { id: 'st-kurla', name: 'Kurla Station (W)', position: [19.0700, 72.8800], corridorId: 'lbs', peakDemand: 1750 },
  { id: 'st-bkc', name: 'BKC — G Block', position: [19.0710, 72.8720], corridorId: 'sclr', peakDemand: 1350 },
  { id: 'st-powai', name: 'Powai — Hiranandani', position: [19.1230, 72.9000], corridorId: 'jvlr', peakDemand: 1100 },
  { id: 'st-thane', name: 'Thane — Teen Hath Naka', position: [19.1950, 72.9630], corridorId: 'eeh', peakDemand: 1250 },
  { id: 'st-worli', name: 'Worli Naka', position: [19.0170, 72.8440], corridorId: 'dadar-south', peakDemand: 1200 },
  { id: 'st-csmt', name: 'CSMT', position: [18.9400, 72.8350], corridorId: 'dadar-south', peakDemand: 2100 },
  { id: 'st-vashi', name: 'Vashi Plaza', position: [19.0720, 72.9920], corridorId: 'sion-panvel', peakDemand: 850 },
];

export const stopById = (id: string) => STOPS.find((s) => s.id === id);
