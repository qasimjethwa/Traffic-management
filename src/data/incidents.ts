import type { Incident, Vehicle } from '../types';
import { corridorPoint } from '../utils/geo';
import { corridorById } from './corridors';

/** Simulation clock starts at 08:30 (minutes since midnight). */
export const SIM_START_MINUTE = 8 * 60 + 30;

/**
 * Demo incidents. Locations are real Mumbai junctions; the events themselves are fictional.
 * Vehicle-linked incidents reference the anchored vehicles in data/vehicles.ts.
 */
export function buildIncidents(fleet: Vehicle[]): Incident[] {
  const late = fleet[0];
  const broken = fleet[3];
  const t = SIM_START_MINUTE;
  return [
    {
      id: 'INC-2041',
      type: 'congestion',
      title: 'Heavy congestion at Andheri flyover approach',
      description: 'Queue building on the WEH north-bound carriageway between Vile Parle and the JVLR junction.',
      severity: 'critical',
      status: 'open',
      position: [19.1135, 72.8568],
      locationName: 'WEH × Andheri–Kurla Rd',
      corridorId: 'weh',
      startedAt: t - 22,
      impact: 0.18,
    },
    {
      id: 'INC-2042',
      type: 'delay',
      title: `${late.label} running behind schedule`,
      description: `Service ${corridorById(late.corridorId).routeCode} is behind its timetable after being held in the Andheri queue.`,
      severity: 'high',
      status: 'open',
      position: corridorPoint(corridorById(late.corridorId).waypoints, late.progress),
      locationName: 'WEH, near Santacruz',
      corridorId: late.corridorId,
      vehicleId: late.id,
      startedAt: t - 12,
      impact: 0,
    },
    {
      id: 'INC-2043',
      type: 'breakdown',
      title: `${broken.label} stalled — suspected brake fault`,
      description: 'Vehicle stopped in the left lane; driver reports a brake-pressure warning. Following services bunching.',
      severity: 'high',
      status: 'open',
      position: corridorPoint(corridorById(broken.corridorId).waypoints, broken.progress),
      locationName: 'LBS Marg, near Ghatkopar',
      corridorId: broken.corridorId,
      vehicleId: broken.id,
      startedAt: t - 9,
      impact: 0.14,
    },
    {
      id: 'INC-2044',
      type: 'capacity',
      title: 'Passengers left behind at Kurla & Ghatkopar',
      description: 'Arriving buses on L24 reported full at the last two stops.',
      severity: 'high',
      status: 'open',
      position: [19.0700, 72.8800],
      locationName: 'Kurla Station (W)',
      corridorId: 'lbs',
      stopIds: ['st-kurla', 'st-ghatkopar'],
      startedAt: t - 4,
      impact: 0,
    },
    {
      id: 'INC-2045',
      type: 'closure',
      title: 'Lane closure for utility works',
      description: 'One south-bound lane closed near Sion Circle for scheduled cable works (demo scenario).',
      severity: 'medium',
      status: 'acknowledged',
      position: [19.0412, 72.8635],
      locationName: 'Sion Circle',
      corridorId: 'eeh',
      startedAt: t - 70,
      impact: 0.12,
    },
    {
      id: 'INC-2046',
      type: 'waterlogging',
      title: 'Water-logging reported at Hindmata',
      description: 'Slow-moving traffic through the low-lying stretch after a heavy shower (demo scenario).',
      severity: 'medium',
      status: 'open',
      position: [19.0055, 72.8425],
      locationName: 'Hindmata, Dadar East',
      corridorId: 'dadar-south',
      startedAt: t - 35,
      impact: 0.17,
    },
    {
      id: 'INC-2047',
      type: 'congestion',
      title: 'Slow traffic at Kalanagar junction',
      description: 'Merging traffic from BKC towards the WEH is backing up onto SCLR.',
      severity: 'low',
      status: 'acknowledged',
      position: [19.0607, 72.8496],
      locationName: 'Kalanagar, Bandra East',
      corridorId: 'sclr',
      startedAt: t - 18,
      impact: 0.08,
    },
    {
      id: 'INC-2039',
      type: 'closure',
      title: 'Signal fault cleared at Haji Ali',
      description: 'Traffic signal was on flashing amber; restored by the field team.',
      severity: 'low',
      status: 'resolved',
      position: [18.9827, 72.8126],
      locationName: 'Haji Ali Junction',
      corridorId: 'bwsl',
      startedAt: t - 95,
      impact: 0.05,
    },
  ];
}
