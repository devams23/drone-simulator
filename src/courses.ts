// The ladders: four disciplines, three courses each, hardest last.
import type { CourseDef, ModeId } from './course';

export interface ModeCard {
  id: ModeId;
  name: string;
  line: string;
  rule: string;
}

export const MODES: ModeCard[] = [
  { id: 'gates', name: 'Gates', line: 'Lines drawn in the air. Hold the arc, carry the speed.', rule: 'Fly through every gate in order.' },
  { id: 'courier', name: 'Courier', line: 'A parcel on a rope has its own opinions about corners.', rule: 'Hover over the parcel to hook it. Set it down inside the ring.' },
  { id: 'thread', name: 'Threading', line: 'Openings a little wider than the airframe. Breathe out first.', rule: 'Pass each slot without brushing the frame.' },
  { id: 'touch', name: 'Touchdown', line: 'Put it down exactly there, and stay put.', rule: 'Land inside each ring and hold still for two seconds.' },
];

export const COURSES: CourseDef[] = [
  // ------------------------------------------------------------------ gates
  {
    id: 'gates-1', mode: 'gates', world: 'fire', name: 'Lakeside Loop', par: 70,
    line: 'A wide, forgiving circuit past the village and low over the lake.',
    steps: [
      { kind: 'ring', at: [76, 7, 80], r: 4.5 },
      { kind: 'ring', at: [52, 8, 58], r: 4.5 },
      { kind: 'ring', at: [22, 12, 54], r: 4.5 },
      { kind: 'ring', at: [-12, 10, 64], r: 4.5 },
      { kind: 'ring', at: [-48, 8, 60], r: 4.5 },
      { kind: 'ring', at: [-92, 4, 70], r: 4.5 },
      { kind: 'ring', at: [-140, 4, 42], r: 4.5 },
      { kind: 'ring', at: [-112, 7, 2], r: 4.5 },
      { kind: 'ring', at: [-62, 10, -40], r: 4.5 },
      { kind: 'ring', at: [-12, 12, -62], r: 4.5 },
      { kind: 'ring', at: [40, 9, -42], r: 4.5 },
      { kind: 'ring', at: [72, 8, 8], r: 4.5 },
      { kind: 'ring', at: [92, 6, 66], r: 4.5 },
    ],
  },
  {
    id: 'gates-2', mode: 'gates', world: 'strike', name: 'Mesa Slalom', par: 85,
    line: 'Tighter gates threaded between the red mesas. Carry speed through the turns.',
    steps: [
      { kind: 'ring', at: [-10, 6, 140], r: 3.8 },
      { kind: 'ring', at: [-48, 5, 112], r: 3.8 },
      { kind: 'ring', at: [-42, 7, 62], r: 3.8 },
      { kind: 'ring', at: [10, 9, 30], r: 3.8 },
      { kind: 'ring', at: [40, 6, 62], r: 3.8 },
      { kind: 'ring', at: [95, 7, 50], r: 3.8 },
      { kind: 'ring', at: [110, 10, -10], r: 3.8 },
      { kind: 'ring', at: [95, 8, -60], r: 3.8 },
      { kind: 'ring', at: [60, 12, -120], r: 3.8 },
      { kind: 'ring', at: [10, 8, -160], r: 3.8 },
      { kind: 'ring', at: [-60, 10, -150], r: 3.8 },
      { kind: 'ring', at: [-100, 8, -60], r: 3.8 },
      { kind: 'ring', at: [-110, 6, 20], r: 3.8 },
      { kind: 'ring', at: [-60, 7, 100], r: 3.8 },
      { kind: 'ring', at: [-15, 6, 150], r: 3.8 },
    ],
  },
  {
    id: 'gates-3', mode: 'gates', world: 'canyon', name: 'Gorge Run', par: 48,
    line: 'Drop off the rim and chase the river through the basalt, wall to wall.',
    steps: [
      { kind: 'ring', at: [72, 30, 95], r: 3.2 },
      { kind: 'ring', at: [65, 6, 80], r: 3.2 },
      { kind: 'ring', at: [61.6, 5, 55], r: 3.2 },
      { kind: 'ring', at: [28.1, 7, 30], r: 3.2 },
      { kind: 'ring', at: [22.6, 4, 5], r: 3.2 },
      { kind: 'ring', at: [-7, 6, -20], r: 3.2 },
      { kind: 'ring', at: [-1.6, 4, -45], r: 3.2 },
      { kind: 'ring', at: [-16.9, 8, -70], r: 3.2 },
      { kind: 'ring', at: [-3.5, 4, -95], r: 3.2 },
      { kind: 'ring', at: [-18.6, 6, -120], r: 3.2 },
      { kind: 'ring', at: [-22.4, 4, -145], r: 3.2 },
      { kind: 'ring', at: [-37, 3.5, -170], r: 3.2 },
      { kind: 'ring', at: [-53.2, 4, -195], r: 3.2 },
    ],
  },
];

export const ladder = (mode: ModeId) => COURSES.filter((c) => c.mode === mode);
