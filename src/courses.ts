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
    id: 'gates-1', mode: 'gates', world: 'ice', name: 'Glacier Loop', par: 70,
    line: 'A wide circuit over the frozen lake, under the ice arch and round the foot of the horn.',
    steps: [
      { kind: 'ring', at: [70, 8, 95], r: 4.5 },
      { kind: 'ring', at: [55, 7, 130], r: 4.5 },
      { kind: 'ring', at: [60, 5, 175], r: 4.5 },
      { kind: 'ring', at: [40, 5, 215], r: 4.5 },
      { kind: 'ring', at: [10, 6, 200], r: 4.5 },
      { kind: 'ring', at: [-10, 6, 160], r: 4.5 },
      { kind: 'ring', at: [-14, 7, 118], r: 4.5 },
      { kind: 'ring', at: [-15.4, 4.5, 40], r: 3.6 },
      { kind: 'ring', at: [-35, 8, -10], r: 4.5 },
      { kind: 'ring', at: [-30, 10, -65], r: 4.5 },
      { kind: 'ring', at: [5, 10, -78], r: 4.5 },
      { kind: 'ring', at: [12, 8, -25], r: 4.5 },
      { kind: 'ring', at: [22, 7, 22], r: 4.5 },
      { kind: 'ring', at: [60, 8, 60], r: 4.5 },
    ],
  },
  {
    id: 'gates-2', mode: 'gates', world: 'city', name: 'Sea Road', par: 100,
    line: 'Over the rooftops, down onto the curve of the sea road, then a slalom through the bridge piers.',
    steps: [
      { kind: 'ring', at: [60, 8, 30], r: 4 },
      { kind: 'ring', at: [-24, 32, 40], r: 4 },
      { kind: 'ring', at: [-86, 7, -40], r: 4 },
      { kind: 'ring', at: [-126, 7, -80], r: 4 },
      { kind: 'ring', at: [-177, 6, -120], r: 4 },
      { kind: 'ring', at: [-233, 7, -160], r: 4 },
      { kind: 'ring', at: [-292, 20, -193], r: 4 },
      { kind: 'ring', at: [-392.5, 8, -300.4], r: 4 },
      { kind: 'ring', at: [-394, 8, -356], r: 4 },
      { kind: 'ring', at: [-446.6, 8, -379.8], r: 4 },
      { kind: 'ring', at: [-497.4, 8, -461.3], r: 4 },
      { kind: 'ring', at: [-495.6, 8, -518.9], r: 4 },
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
      { kind: 'ring', at: [-37, 3.8, -170], r: 3.2 },
      { kind: 'ring', at: [-53.2, 4, -195], r: 3.2 },
    ],
  },
  // ---------------------------------------------------------------- courier
  {
    id: 'courier-1', mode: 'courier', world: 'ice', name: 'Station Run', par: 60,
    line: 'Two parcels from the research station: one onto the lake ice, one through the arch to the moraine.',
    steps: [
      { kind: 'pickup', at: [78, 84] },
      { kind: 'ring', at: [55, 8, 120], r: 4.5 },
      { kind: 'drop', at: [40, 170], r: 3.5 },
      { kind: 'pickup', at: [-12, 140] },
      { kind: 'ring', at: [-15.4, 4.5, 40], r: 3.6 },
      { kind: 'drop', at: [-30, -30], r: 3.5 },
    ],
  },
  {
    id: 'courier-2', mode: 'courier', world: 'city', name: 'Rooftop Relay', par: 110,
    line: 'Three parcels between the towers. The last one goes down to the sand.',
    steps: [
      { kind: 'pickup', at: [70, 40] },
      { kind: 'drop', at: [18, 194], r: 2.6 },
      { kind: 'pickup', at: [160, 148] },
      { kind: 'drop', at: [238, 64], r: 2.6 },
      { kind: 'pickup', at: [116, -112] },
      { kind: 'drop', at: [-262, -160], r: 3.5 },
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
    id: 'thread-1', mode: 'thread', world: 'city', name: 'Back Lanes', par: 64,
    line: 'Street level between the blocks: down one lane, round the corner, down the next.',
    steps: [
      { kind: 'slot', at: [166, 4, 116], w: 4.4, h: 2.8 },
      { kind: 'slot', at: [200, 3.5, 116], w: 4.6, h: 1.9 },
      { kind: 'slot', at: [236, 5, 116], w: 2.4, h: 3.4 },
      { kind: 'slot', at: [276, 4, 116], w: 3.8, h: 2.4 },
      { kind: 'slot', at: [276, 6, 84], w: 4.4, h: 1.8 },
      { kind: 'slot', at: [276, 4, 50], w: 2.2, h: 3.4 },
      { kind: 'slot', at: [276, 3.5, 16], w: 3.6, h: 2.2 },
      { kind: 'slot', at: [276, 5, -20], w: 4.2, h: 1.8 },
      { kind: 'slot', at: [276, 4, -60], w: 2.4, h: 3.0 },
      { kind: 'slot', at: [240, 3.5, -60], w: 3.2, h: 2.0 },
      { kind: 'slot', at: [204, 4, -60], w: 2.6, h: 2.4 },
    ],
  },
  {
    id: 'thread-2', mode: 'thread', world: 'ice', name: 'Icefall', par: 66,
    line: 'Up the glacier through gaps in the seracs, the ice climbing under you all the way.',
    steps: [
      { kind: 'slot', at: [-1, 4, -78], w: 4.2, h: 2.8 },
      { kind: 'slot', at: [-12, 3.5, -96], w: 3.6, h: 2.4 },
      { kind: 'slot', at: [-26.4, 4, -112], w: 2.4, h: 3.2 },
      { kind: 'slot', at: [-34.2, 3.5, -128], w: 3.4, h: 2.2 },
      { kind: 'slot', at: [-35.5, 5, -144], w: 4.2, h: 1.8 },
      { kind: 'slot', at: [-30.4, 4, -160], w: 2.4, h: 3.0 },
      { kind: 'slot', at: [-20.6, 3.5, -176], w: 3.2, h: 2.0 },
      { kind: 'slot', at: [-9.6, 4, -192], w: 2.2, h: 2.8 },
      { kind: 'slot', at: [-1.1, 3.5, -208], w: 3.0, h: 1.9 },
      { kind: 'slot', at: [1.7, 4, -224], w: 2.6, h: 2.4 },
      { kind: 'slot', at: [-2.6, 3.5, -240], w: 2.4, h: 2.0 },
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
    id: 'touch-1', mode: 'touch', world: 'ice', name: 'Snowfields', par: 70,
    line: 'Four landings on snow and ice: the lake, the far meadow, the arch, and a hut roof.',
    steps: [
      { kind: 'land', at: [45, 170], r: 2.8 },
      { kind: 'land', at: [30, 280], r: 2.6 },
      { kind: 'land', at: [-15, 20], r: 2.4 },
      { kind: 'land', at: [106.6, 61], r: 2.4 },
    ],
  },
  {
    id: 'touch-2', mode: 'touch', world: 'city', name: 'Skyline', par: 90,
    line: 'Four tower roofs, each higher than the last, then down to a lower one to finish.',
    steps: [
      { kind: 'land', at: [18, 194], r: 2.2 },
      { kind: 'land', at: [160, 148], r: 2.2 },
      { kind: 'land', at: [238, 64], r: 2.0 },
      { kind: 'land', at: [194, -4], r: 2.0 },
      { kind: 'land', at: [116, -112], r: 1.8 },
    ],
  },
  {
    id: 'touch-3', mode: 'touch', world: 'canyon', name: 'Basalt Stacks', par: 85,
    line: 'Settle on the crown of each stone pillar down the gorge, with the river far below.',
    steps: [
      { kind: 'land', at: [-4.4, 250], r: 2.0 },
      { kind: 'land', at: [76.4, 75], r: 2.0 },
      { kind: 'land', at: [-19.3, -35], r: 1.8 },
      { kind: 'land', at: [-18.3, -150], r: 1.6 },
    ],
  },
];

export const ladder = (mode: ModeId) => COURSES.filter((c) => c.mode === mode);
