// Static game data: drone roster and mission cards.

export type MissionId = 'fire' | 'strike' | 'relief';

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
  mission: MissionId;
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

export const DRONES: DroneSpec[] = [
  // Fire
  {
    id: 'sparrow', name: 'Sparrow H2', mission: 'fire', tier: 'Light',
    tagline: 'Quick first responder. Small tank, many trips.',
    stats: { speed: 9, agility: 9, stability: 4, armor: 3, payload: 3, battery: 5 },
    capacity: 40, color: 0xd93a2b, accent: 0xffd23f, bulk: 0.85,
  },
  {
    id: 'heron', name: 'Heron AT-6', mission: 'fire', tier: 'Balanced',
    tagline: 'The workhorse of the fire line.',
    stats: { speed: 6, agility: 6, stability: 7, armor: 6, payload: 6, battery: 7 },
    capacity: 80, color: 0xe8622a, accent: 0xfff1c1, bulk: 1,
  },
  {
    id: 'titan', name: 'Titan Hydra', mission: 'fire', tier: 'Heavy',
    tagline: 'Flying water tower with a heat shield. Slow to turn.',
    stats: { speed: 4, agility: 3, stability: 9, armor: 9, payload: 10, battery: 8 },
    capacity: 150, color: 0xb3261e, accent: 0x9be7ff, bulk: 1.3,
  },
  // Strike
  {
    id: 'wasp', name: 'Wasp', mission: 'strike', tier: 'Light',
    tagline: 'Hard to hit, easy to break.',
    stats: { speed: 10, agility: 10, stability: 4, armor: 2, payload: 3, battery: 5 },
    capacity: 220, rockets: 2, cannonDamage: 6, color: 0x4b5a3a, accent: 0xc8ff4d, bulk: 0.8,
  },
  {
    id: 'kestrel', name: 'Kestrel', mission: 'strike', tier: 'Balanced',
    tagline: 'Balanced gunship for any approach.',
    stats: { speed: 7, agility: 7, stability: 6, armor: 6, payload: 6, battery: 6 },
    capacity: 320, rockets: 4, cannonDamage: 8, color: 0x56606b, accent: 0xff8a3d, bulk: 1,
  },
  {
    id: 'mauler', name: 'Mauler', mission: 'strike', tier: 'Heavy',
    tagline: 'Armoured brawler. Soaks fire, hits hard.',
    stats: { speed: 4, agility: 4, stability: 8, armor: 10, payload: 10, battery: 7 },
    capacity: 450, rockets: 8, cannonDamage: 12, color: 0x3a3f47, accent: 0xff4d4d, bulk: 1.3,
  },
  // Relief
  {
    id: 'courier', name: 'Courier', mission: 'relief', tier: 'Light',
    tagline: 'One crate at a time, very fast.',
    stats: { speed: 10, agility: 8, stability: 4, armor: 3, payload: 2, battery: 6 },
    capacity: 1, color: 0xf2f2f2, accent: 0xff5a36, bulk: 0.85,
  },
  {
    id: 'packmule', name: 'Packmule', mission: 'relief', tier: 'Balanced',
    tagline: 'Two crates and steady in a breeze.',
    stats: { speed: 7, agility: 6, stability: 7, armor: 5, payload: 5, battery: 7 },
    capacity: 2, color: 0xf7c531, accent: 0x1f2a44, bulk: 1,
  },
  {
    id: 'atlas', name: 'Atlas', mission: 'relief', tier: 'Heavy',
    tagline: 'Four crates. Shrugs off wind, hates hurrying.',
    stats: { speed: 4, agility: 3, stability: 10, armor: 7, payload: 10, battery: 9 },
    capacity: 4, color: 0x2a7de1, accent: 0xffffff, bulk: 1.3,
  },
];

export interface MissionCard {
  id: MissionId;
  name: string;
  role: string;
  icon: string;
  blurb: string;
  objective: string;
  fail: string;
  tool: string;
  tips: string[];
  hue: string;
}

export const MISSIONS: MissionCard[] = [
  {
    id: 'fire', name: 'Wildfire Response', role: 'Firefighter', icon: '🔥', hue: '#ff7a2f',
    blurb: 'Fire is closing on Pinebrook village. Carry water and put it out.',
    objective: 'Extinguish every fire.',
    fail: 'The village damage meter fills, or you lose the drone.',
    tool: 'Water jet — hold to spray where the reticle points.',
    tips: [
      'Tilt the camera down and spray from 8–15 m above the flames.',
      'Hover low over the lake to refill the tank.',
      'Flying into flames cooks the drone. House fires hurt the village most.',
    ],
  },
  {
    id: 'strike', name: 'Outpost Strike', role: 'Gunship', icon: '🎯', hue: '#ff4d4d',
    blurb: 'A hostile outpost in the Red Mesa must be taken off the map.',
    objective: 'Destroy the HQ, the radar and both fuel tanks.',
    fail: 'The drone is shot down or the battery dies.',
    tool: 'Cannon (primary) and rockets (secondary).',
    tips: [
      'Turrets shoot back. Keep moving — speed spoils their aim.',
      'Knock out the radar first and their accuracy drops.',
      'Land on your pad to repair, rearm and recharge.',
    ],
  },
  {
    id: 'relief', name: 'Flood Relief', role: 'Cargo', icon: '📦', hue: '#35c2ff',
    blurb: 'The river took the town. Families are stranded on rooftops.',
    objective: 'Drop a supply crate on every marked rooftop.',
    fail: 'Time runs out, or you lose the drone.',
    tool: 'Crate release — one press, one crate.',
    tips: [
      'Hover low over the depot pad to load crates.',
      'The yellow ring on the ground shows where a crate would land.',
      'Wind pushes the parachute. Drop from low and upwind.',
    ],
  },
];

export const STAT_LABELS: [keyof DroneStats, string][] = [
  ['speed', 'Speed'],
  ['agility', 'Agility'],
  ['stability', 'Stability'],
  ['armor', 'Armor'],
  ['payload', 'Payload'],
  ['battery', 'Battery'],
];
