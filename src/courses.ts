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
  // ---------------------------------------------------------------- courier
  {
    id: 'courier-1', mode: 'courier', world: 'fire', name: 'Village Drop', par: 55,
    line: 'Two parcels from the pad to the square, then down to the lakeshore.',
    steps: [
      { kind: 'pickup', at: [82, 92] },
      { kind: 'ring', at: [55, 9, 62], r: 4.5 },
      { kind: 'drop', at: [8, 6], r: 3.5 },
      { kind: 'pickup', at: [-8, -6] },
      { kind: 'ring', at: [-40, 8, 20], r: 4.5 },
      { kind: 'drop', at: [-72, 30], r: 3.5 },
    ],
  },
  {
    id: 'courier-2', mode: 'courier', world: 'relief', name: 'Rooftop Relay', par: 80,
    line: 'Three parcels, flat roof to flat roof, across a town standing in water.',
    steps: [
      { kind: 'pickup', at: [-8, 140] },
      { kind: 'drop', at: [-27, 44], r: 2.6 },
      { kind: 'pickup', at: [0, -10] },
      { kind: 'drop', at: [81, 17], r: 2.6 },
      { kind: 'pickup', at: [54, -37] },
      { kind: 'drop', at: [-54, -64], r: 2.6 },
    ],
  },
  {
    id: 'courier-3', mode: 'courier', world: 'canyon', name: 'River Line', par: 52,
    line: 'One parcel, low through the gorge gates, keeping it out of the water, then up to the far rim.',
    steps: [
      { kind: 'pickup', at: [108, 100] },
      { kind: 'ring', at: [65, 8, 80], r: 3.6 },
      { kind: 'ring', at: [60, 8, 55], r: 3.6 },
      { kind: 'ring', at: [30, 9, 30], r: 3.6 },
      { kind: 'ring', at: [20, 8, 5], r: 3.6 },
      { kind: 'ring', at: [-5, 8, -20], r: 3.6 },
      { kind: 'ring', at: [-3, 8, -45], r: 3.6 },
      { kind: 'ring', at: [-15, 9, -70], r: 3.6 },
      { kind: 'drop', at: [-65, -75], r: 3.5 },
    ],
  },
  // ----------------------------------------------------------------- thread
  {
    id: 'thread-1', mode: 'thread', world: 'strike', name: 'Mesa Windows', par: 70,
    line: 'Ten windows in the open desert. Wide and short, then tall and narrow.',
    steps: [
      { kind: 'slot', at: [0, 4, 148], w: 4.2, h: 2.8 },
      { kind: 'slot', at: [-18, 3.5, 128], w: 4.6, h: 1.9 },
      { kind: 'slot', at: [-45, 6, 95], w: 2.2, h: 3.6 },
      { kind: 'slot', at: [-42, 4, 72], w: 3.8, h: 2.4 },
      { kind: 'slot', at: [-10, 7, 45], w: 4.4, h: 1.8 },
      { kind: 'slot', at: [20, 5, 30], w: 2.2, h: 3.4 },
      { kind: 'slot', at: [35, 4, 70], w: 3.6, h: 2.4 },
      { kind: 'slot', at: [30, 6, 100], w: 4.4, h: 1.8 },
      { kind: 'slot', at: [12, 4, 125], w: 3.4, h: 2.4 },
      { kind: 'slot', at: [25, 5, 150], w: 3.2, h: 2.2 },
    ],
  },
  {
    id: 'thread-2', mode: 'thread', world: 'fire', name: 'Timber Line', par: 62,
    line: 'Slots at treetop height through the pines, with branches either side.',
    steps: [
      { kind: 'slot', at: [100, 4, 80], w: 3.6, h: 2.4 },
      { kind: 'slot', at: [110, 3.5, 55], w: 4.2, h: 2.0 },
      { kind: 'slot', at: [100, 4, 30], w: 2.4, h: 3.2 },
      { kind: 'slot', at: [80, 3.5, 10], w: 3.4, h: 2.2 },
      { kind: 'slot', at: [85, 5, -20], w: 4.2, h: 1.8 },
      { kind: 'slot', at: [100, 4, -45], w: 2.4, h: 3.0 },
      { kind: 'slot', at: [80, 3.5, -70], w: 3.2, h: 2.0 },
      { kind: 'slot', at: [55, 4, -60], w: 2.2, h: 2.8 },
      { kind: 'slot', at: [60, 3.5, -30], w: 3.0, h: 1.9 },
      { kind: 'slot', at: [70, 4, 0], w: 2.6, h: 2.4 },
    ],
  },
  {
    id: 'thread-3', mode: 'thread', world: 'canyon', name: "Needle's Eye", par: 72,
    line: 'Openings barely wider than the airframe, a metre or two over the river.',
    steps: [
      { kind: 'slot', at: [72, 26, 95], w: 5.0, h: 3.2 },
      { kind: 'slot', at: [58.5, 6, 55], w: 3.2, h: 2.4 },
      { kind: 'slot', at: [34.0, 3, 30], w: 2.8, h: 2.0 },
      { kind: 'slot', at: [16.6, 2.6, 5], w: 3.4, h: 1.7 },
      { kind: 'slot', at: [-1.7, 3.5, -20], w: 2.2, h: 3.0 },
      { kind: 'slot', at: [-6.6, 2.8, -45], w: 3.0, h: 1.8 },
      { kind: 'slot', at: [-11.5, 3, -70], w: 2.6, h: 2.0 },
      { kind: 'slot', at: [-8.6, 2.6, -95], w: 3.2, h: 1.6 },
      { kind: 'slot', at: [-14.8, 3.4, -120], w: 2.1, h: 2.8 },
      { kind: 'slot', at: [-20.9, 2.8, -145], w: 2.8, h: 1.8 },
      { kind: 'slot', at: [-38.5, 2.6, -170], w: 2.4, h: 1.7 },
      { kind: 'slot', at: [-51.7, 3, -195], w: 2.2, h: 1.9 },
    ],
  },
  // ------------------------------------------------------------------ touch
  {
    id: 'touch-1', mode: 'touch', world: 'fire', name: 'Village Greens', par: 60,
    line: 'Four soft landings on open grass, from the square down to the lake.',
    steps: [
      { kind: 'land', at: [14, 10], r: 2.8 },
      { kind: 'land', at: [-70, 35], r: 2.6 },
      { kind: 'land', at: [-30, -60], r: 2.4 },
      { kind: 'land', at: [40, -40], r: 2.4 },
    ],
  },
  {
    id: 'touch-2', mode: 'touch', world: 'relief', name: 'High Water', par: 75,
    line: 'Five flat roofs above the flood. Small targets, nowhere to bail out.',
    steps: [
      { kind: 'land', at: [-27, 44], r: 2.2 },
      { kind: 'land', at: [0, -10], r: 2.2 },
      { kind: 'land', at: [81, 17], r: 2.0 },
      { kind: 'land', at: [54, -37], r: 2.0 },
      { kind: 'land', at: [-54, -64], r: 1.8 },
    ],
  },
  {
    id: 'touch-3', mode: 'touch', world: 'strike', name: 'Mesa Tops', par: 88,
    line: 'Climb, cross and settle on the crown of each mesa, then home to the pad.',
    steps: [
      { kind: 'land', at: [-25, 105], r: 2.0 },
      { kind: 'land', at: [-70, 60], r: 1.8 },
      { kind: 'land', at: [65, 40], r: 1.8 },
      { kind: 'land', at: [120, -60], r: 1.6 },
      { kind: 'land', at: [0, 175], r: 1.6 },
    ],
  },
];

export const ladder = (mode: ModeId) => COURSES.filter((c) => c.mode === mode);
