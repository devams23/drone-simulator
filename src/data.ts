// Static game data: the drone roster.

/** Every loadable world. */
export type WorldId = 'canyon' | 'ice' | 'city';

export interface DroneStats {
  speed: number; // 1-10
  agility: number;
  stability: number;
  armor: number;
  payload: number;
  battery: number;
}

export interface DroneSpec {
  id: string;
  name: string;
  /** Short hull code painted on the canopy. */
  code: string;
  tier: 'Light' | 'Balanced' | 'Heavy';
  tagline: string;
  stats: DroneStats;
  /** Mission payload: litres of water, cannon rounds, or crates. */
  capacity: number;
  /** Strike only. */
  rockets?: number;
  cannonDamage?: number;
  color: number;
  accent: number;
  /** Visual bulk of arms and props. */
  bulk: number;
}

/** Physical values derived from the 1-10 stats. */
export function physics(s: DroneSpec) {
  const t = s.stats;
  return {
    maxSpeed: 8 + t.speed * 2.2, // m/s
    maxTilt: 0.34 + t.speed * 0.03, // rad
    tiltRate: 1.6 + t.agility * 0.55, // how quickly tilt follows the stick
    yawRate: 0.9 + t.agility * 0.17, // rad/s
    climb: 4 + t.agility * 0.5 + t.speed * 0.3, // m/s
    brake: 0.6 + t.stability * 0.28, // extra drag with sticks centred
    windFactor: 1.05 - t.stability / 10.5,
    hull: 60 + t.armor * 18,
    damageMult: 1.25 - t.armor * 0.085,
    batterySec: 150 + t.battery * 30,
  };
}

/** The fleet: four airframes, each with a different temperament rather than a different job. */
export const DRONES: DroneSpec[] = [
  {
    id: 'dart', name: 'Dart', code: 'D·1', tier: 'Light',
    tagline: 'Twitchy, light, honest. Goes exactly where your thumbs say — mistakes included.',
    stats: { speed: 10, agility: 10, stability: 3, armor: 3, payload: 2, battery: 6 },
    capacity: 1, color: 0x24272c, accent: 0xff6a3d, bulk: 0.8,
  },
  {
    id: 'heron', name: 'Heron', code: 'H·3', tier: 'Balanced',
    tagline: 'Even-tempered and forgiving. The one to learn the lines on.',
    stats: { speed: 7, agility: 7, stability: 6, armor: 6, payload: 5, battery: 7 },
    capacity: 1, color: 0xe9e7e2, accent: 0x5fb3a8, bulk: 1,
  },
  {
    id: 'kite', name: 'Kite', code: 'K·5', tier: 'Balanced',
    tagline: 'Floats more than it flies. Made for slow, exact work in tight places.',
    stats: { speed: 5, agility: 6, stability: 9, armor: 5, payload: 6, battery: 8 },
    capacity: 1, color: 0xcdbfa6, accent: 0x22303f, bulk: 0.95,
  },
  {
    id: 'atlas', name: 'Atlas', code: 'A·8', tier: 'Heavy',
    tagline: 'Big, planted, unbothered by wind. Slow to start, hard to rattle.',
    stats: { speed: 4, agility: 3, stability: 10, armor: 9, payload: 10, battery: 9 },
    capacity: 1, color: 0x27384f, accent: 0xe8b94a, bulk: 1.3,
  },
];


export const STAT_LABELS: [keyof DroneStats, string][] = [
  ['speed', 'Speed'],
  ['agility', 'Agility'],
  ['stability', 'Stability'],
];
