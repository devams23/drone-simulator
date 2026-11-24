// Marine Bay at night: a seaside megacity under a starry sky and a crescent
// moon. A sea road sweeps around a C-shaped bay under a necklace of sodium
// lamps, with traffic, a sandy beach and a green hill. Behind it, Art Deco
// blocks and lit towers on a street grid crossed by two avenues; a cable-stayed
// bridge runs out over the water. Past the east edge a lamp-lit country road
// leads by a village of blue-washed houses, paddy and fireflies into the hills.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise2 } from '../assets';
import type { Controls } from '../input';
import { World, boxGeo, canvasTex, rng } from '../world';
import { bus, fleet, sedan } from '../models/car';
import { Mission, type Objective, type Payload } from './base';

// ------------------------------------------------------------------ the shape

const GROUND = 3;
/** x of the shoreline at z: a C-shaped bay between two headlands. */
export const coast = (z: number) => -340 + 270 * Math.pow(Math.max(0, Math.cos(((z - 40) / 270) * (Math.PI / 2))), 1.2);
/** The beach runs along the north end of the bay. */
const beachW = (z: number) => smooth(-232, -205, z) * smooth(-95, -125, z);
export const HILL = { x: -300, z: -330, r: 150, h: 46 };
export const PAD = { x: 92, z: 64 };
/** Open green (a maidan) around the pad. */
const MAIDAN = { x0: 40, x1: 150, z0: 10, z1: 118 };
/** The bridge leaves the hill's west shore and runs out to sea. */
export const BRIDGE = { a: new THREE.Vector2(-352, -262), b: new THREE.Vector2(-600, -660), y: 20 };
const VILLAGE = { x: 430, z: 120 };
/** The country road's line: south of the village, winding east into the hills. */
const countryZ = (x: number) => 58 + 7 * Math.sin((x - 320) / 55);

/** Hand-placed towers the courses use: [x, z, width, depth, height]. */
export const TOWERS: [number, number, number, number, number][] = [
  [196, -2, 26, 26, 168],
  [240, 66, 22, 22, 132],
  [162, 150, 24, 20, 104],
  [250, -96, 24, 24, 146],
  [118, -110, 20, 20, 86],
  [20, 196, 22, 22, 74],
];

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function cityHeight(x: number, z: number) {
  const s = x - coast(z);
  // Sea wall everywhere, a long sandy slope along the beach.
  const wall = -6 + (GROUND + 6) * smooth(-5, 0, s);
  const beach = Math.max(-6, Math.min(GROUND, GROUND + s * 0.085));
  let h = wall + (beach - wall) * beachW(z);
  if (s < -40) h = Math.min(h, -6);
  // The hill on the north headland.
  const dh = Math.hypot(x - HILL.x, z - HILL.z);
  if (dh < HILL.r && s > -10) {
    const k = 1 - dh / HILL.r;
    h += HILL.h * smooth(0, 1, k * 1.25) * (0.85 + 0.3 * noise2(x * 0.02, z * 0.02)) * smooth(-10, 25, s);
  }
  // Countryside east of the city: gentle fields, then wooded hills.
  if (x > 330) {
    h += 2.2 * (noise2(x * 0.015, z * 0.015) - 0.5) * smooth(330, 380, x);
    const t = Math.max(0, x - 500);
    h += 140 * (1 - Math.exp(-Math.pow(t / 120, 1.5))) * (0.65 + 0.5 * noise2(x * 0.008, z * 0.008));
  }
  return h;
}

// ------------------------------------------------------------------ textures

type Facade = 'glass' | 'flats' | 'old';

/** Metres covered by one facade tile: 10 floors of 3.2 m, 8 bays of 4 m. */
const TILE = 32;

/**
 * One tile of a building face, plus its night glow: which windows have the
 * lights on. Offices light whole floors in cool white; homes are a scatter
 * of tube-light white and warm lamps.
 */
function facadeTex(kind: Facade, seed: number) {
  const r = rng(seed);
  const N = 1024;
  const px = N / TILE; // pixels per metre
  const glowCv = document.createElement('canvas');
  glowCv.width = glowCv.height = N;
  const gl = glowCv.getContext('2d')!;
  gl.fillStyle = '#000';
  gl.fillRect(0, 0, N, N);
  const homeLight = () => {
    const v = r();
    return v < 0.22 ? null : v < 0.5 ? '232,238,255' : v < 0.9 ? '255,196,120' : '150,190,255';
  };
  const map = canvasTex(N, N, (g) => {
    if (kind === 'glass') {
      const grd = g.createLinearGradient(0, 0, 0, N);
      grd.addColorStop(0, '#22343e');
      grd.addColorStop(1, '#16252e');
      g.fillStyle = grd;
      g.fillRect(0, 0, N, N);
      for (let f = 0; f < 10; f++) {
        const office = r() < 0.8;
        const warm = r() < 0.25;
        for (let b = 0; b < 16; b++) {
          const x = b * 2 * px, y = f * 3.2 * px;
          g.fillStyle = `rgba(${r() < 0.15 ? '120,150,160' : '10,20,26'},${0.15 + r() * 0.3})`;
          g.fillRect(x, y, 2 * px, 3.2 * px);
          if (office && r() < 0.85) {
            const a = 0.45 + r() * 0.45;
            gl.fillStyle = `rgba(${warm ? '255,214,160' : '214,226,245'},${a})`;
            gl.fillRect(x + 3, y + 0.35 * px, 2 * px - 6, 2.5 * px);
          }
        }
      }
      g.fillStyle = '#8d9aa0';
      for (let f = 0; f <= 10; f++) g.fillRect(0, f * 3.2 * px - 3, N, 6);
      for (let b = 0; b <= 16; b++) g.fillRect(b * 2 * px - 1.5, 0, 3, N);
      gl.fillStyle = '#000';
      for (let f = 0; f <= 10; f++) gl.fillRect(0, f * 3.2 * px - 4, N, 8);
      return;
    }
    const wall = kind === 'flats' ? '#e8e2d6' : '#d9c3a8';
    g.fillStyle = wall;
    g.fillRect(0, 0, N, N);
    // Weathering: monsoon streaks under the windows.
    for (let i = 0; i < 220; i++) {
      const x = r() * N, y = r() * N;
      const grd = g.createLinearGradient(x, y, x, y + 40 + r() * 120);
      grd.addColorStop(0, `rgba(70,62,50,${kind === 'old' ? 0.22 : 0.1})`);
      grd.addColorStop(1, 'rgba(70,62,50,0)');
      g.fillStyle = grd;
      g.fillRect(x, y, 3 + r() * 8, 160);
    }
    for (let f = 0; f < 10; f++) {
      const y0 = f * 3.2 * px;
      // Slab edge band.
      g.fillStyle = kind === 'flats' ? '#f6f3ee' : '#c8b090';
      g.fillRect(0, y0 + 2.9 * px, N, 0.3 * px);
      for (let b = 0; b < 8; b++) {
        const x0 = b * 4 * px;
        const wx = x0 + 0.6 * px, wy = y0 + 0.8 * px, ww = 2.8 * px, wh = 1.7 * px;
        g.fillStyle = r() < 0.12 ? '#6b7d86' : '#26323a';
        g.fillRect(wx, wy, ww, wh);
        const lit = homeLight();
        if (lit) {
          // A lit room: brighter near the middle, a curtain edge on one side.
          const a = 0.55 + r() * 0.45;
          gl.fillStyle = `rgba(${lit},${a})`;
          gl.fillRect(wx + 3, wy + 3, ww - 6, wh - 6);
          if (r() < 0.5) {
            gl.fillStyle = 'rgba(0,0,0,0.55)';
            gl.fillRect(r() < 0.5 ? wx + 3 : wx + ww * 0.6, wy + 3, ww * 0.4 - 3, wh - 6);
          }
        }
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(wx, wy, ww, wh * 0.35);
        // Window grille and frame.
        g.strokeStyle = kind === 'flats' ? '#fafafa' : '#8a7356';
        g.lineWidth = 3;
        g.strokeRect(wx, wy, ww, wh);
        g.beginPath();
        g.moveTo(wx + ww / 2, wy);
        g.lineTo(wx + ww / 2, wy + wh);
        g.stroke();
        // A balcony rail on some flats, an AC unit on some windows.
        if (kind === 'flats' && b % 2 === 0) {
          g.fillStyle = 'rgba(250,250,250,0.85)';
          g.fillRect(x0 + 0.3 * px, y0 + 2.2 * px, 3.4 * px, 0.12 * px);
          g.fillRect(x0 + 0.3 * px, y0 + 2.6 * px, 3.4 * px, 0.12 * px);
        }
        if (r() < 0.35) {
          g.fillStyle = '#d4d6d2';
          g.fillRect(wx + ww - 0.9 * px, wy + wh + 0.05 * px, 0.8 * px, 0.5 * px);
        }
        gl.fillStyle = '#000';
        gl.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      }
    }
  });
  const glow = new THREE.CanvasTexture(glowCv);
  glow.colorSpace = THREE.SRGBColorSpace;
  glow.wrapS = glow.wrapT = THREE.RepeatWrapping;
  glow.anisotropy = 4;
  return { map, glow };
}

/** A facade material that lights up its windows at night. */
function facadeMat(kind: Facade, seed: number, glow = 1.7) {
  const t = facadeTex(kind, seed);
  return new THREE.MeshStandardMaterial({
    map: t.map,
    emissive: 0xffffff,
    emissiveMap: t.glow,
    emissiveIntensity: glow,
    roughness: kind === 'glass' ? 0.12 : kind === 'flats' ? 0.82 : 0.88,
    metalness: kind === 'glass' ? 0.65 : 0,
  });
}

/** Soft round light falling on the ground, for lamp pools and headlight beams. */
function poolTex() {
  return canvasTex(128, 128, (g) => {
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    // Gaussian-like falloff: no visible rim at the edge of the pool.
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      rg.addColorStop(t, `rgba(255,255,255,${(Math.exp(-t * t * 5) - Math.exp(-5)) / (1 - Math.exp(-5))})`);
    }
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
  });
}

/** Fades from full at u = 0 to nothing at u = 1, softened across v. */
function fadeTex() {
  return canvasTex(128, 32, (g) => {
    const lg = g.createLinearGradient(0, 0, 128, 0);
    lg.addColorStop(0, 'rgba(255,255,255,1)');
    lg.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, 128, 32);
    g.globalCompositeOperation = 'destination-in';
    const vg = g.createLinearGradient(0, 0, 0, 32);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.5, 'rgba(0,0,0,1)');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vg;
    g.fillRect(0, 0, 128, 32);
  });
}

/** One palm frond: a stiff rib with drooping leaflets, on a transparent card. */
function frondTex() {
  return canvasTex(128, 512, (g) => {
    g.clearRect(0, 0, 128, 512);
    g.strokeStyle = '#5c6b2c';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(64, 512);
    g.lineTo(64, 0);
    g.stroke();
    for (let y = 500; y > 10; y -= 9) {
      const t = y / 512;
      const len = 58 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 6;
      for (const s of [-1, 1]) {
        g.strokeStyle = `rgb(${70 + Math.random() * 30},${100 + Math.random() * 35},${36 + Math.random() * 15})`;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(64, y);
        g.quadraticCurveTo(64 + s * len * 0.6, y - 8, 64 + s * len, y + 14);
        g.stroke();
      }
    }
  });
}

// ------------------------------------------------------------------ night sky

/** Direction to the moon: low in the north-east, over the village. */
export const MOON = new THREE.Vector3(Math.cos(0.5) * Math.cos(-0.46), Math.sin(0.5), Math.cos(0.5) * Math.sin(-0.46)).normalize();

/**
 * Painted equirectangular night: deep navy overhead, the city's sodium haze
 * low over the sea to the west, a dusting of stars and the Milky Way, and a
 * crescent moon. Used for both the background and the reflections.
 */
function nightSky() {
  const W = 4096, H = 2048;
  const r = rng(909);
  const t = canvasTex(W, H, (g) => {
    // Base gradient, zenith to horizon, then the ground below.
    const grd = g.createLinearGradient(0, 0, 0, H);
    // Blue hour rather than midnight: a deep but luminous blue, lit from below by the city.
    grd.addColorStop(0, '#0a1430');
    grd.addColorStop(0.2, '#13234d');
    grd.addColorStop(0.38, '#1f3768');
    grd.addColorStop(0.47, '#36508a');
    grd.addColorStop(0.5, '#2a3a5e');
    grd.addColorStop(1, '#0a0e18');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    // u -> compass: u = atan2(z, x) / 2pi + 0.5, so west (-x) sits at u = 0 and 1.
    const glowAt = (u: number) => {
      const dw = Math.min(u, 1 - u); // distance to west
      return 0.28 + 0.95 * Math.exp(-((dw / 0.13) ** 2)) + 0.25 * Math.exp(-(((u - 0.75) / 0.08) ** 2));
    };
    // City glow: warm haze hugging the horizon, strongest over the sea.
    for (let x = 0; x < W; x += 2) {
      const k = glowAt(x / W);
      const top = H * (0.5 - 0.17 * Math.min(1, k));
      const cg = g.createLinearGradient(0, top, 0, H * 0.5);
      cg.addColorStop(0, 'rgba(120,50,70,0)');
      cg.addColorStop(0.55, `rgba(170,70,52,${0.35 * Math.min(1, k)})`);
      cg.addColorStop(1, `rgba(236,118,52,${Math.min(0.92, 0.75 * k)})`);
      g.fillStyle = cg;
      g.fillRect(x, top, 2, H * 0.5 - top + 1);
    }
    // Milky Way: a soft band of haze along a tilted great circle, with denser stars.
    const band = (u: number) => H * (0.27 - 0.17 * Math.sin(u * Math.PI * 2 + 1.1));
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 900; i++) {
      const u = r();
      const y = band(u) + (r() - 0.5) * H * 0.07;
      if (y > H * 0.46) continue;
      const rad = 20 + r() * 70;
      const rg = g.createRadialGradient(u * W, y, 0, u * W, y, rad);
      rg.addColorStop(0, `rgba(150,165,210,${0.018 + r() * 0.025})`);
      rg.addColorStop(1, 'rgba(150,165,210,0)');
      g.fillStyle = rg;
      g.fillRect(u * W - rad, y - rad, rad * 2, rad * 2);
    }
    // Stars: thinner toward the horizon and inside the glow.
    const star = (x: number, y: number, s: number, a: number, tint: string) => {
      g.fillStyle = `rgba(${tint},${a})`;
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
    };
    for (let i = 0; i < 16000; i++) {
      const u = r();
      const inBand = i < 6000;
      const y = inBand ? band(u) + (r() - 0.5) * (r() * H * 0.12) : Math.acos(r()) / (Math.PI / 2) * H * 0.5;
      if (y < 0 || y > H * 0.495) continue;
      const lowFade = Math.min(1, (H * 0.5 - y) / (H * 0.12));
      const fade = lowFade * (1 - 0.8 * Math.min(1, glowAt(u) - 0.28) * Math.max(0, 1 - (H * 0.5 - y) / (H * 0.15)));
      const big = r();
      const s = big > 0.985 ? 1.6 + r() * 0.9 : big > 0.9 ? 1.05 : 0.55 + r() * 0.35;
      const tint = r() < 0.12 ? '255,222,190' : r() < 0.2 ? '200,215,255' : '235,240,255';
      star(u * W, y, s, (0.35 + r() * 0.65) * fade, tint);
      if (big > 0.993) {
        const rg = g.createRadialGradient(u * W, y, 0, u * W, y, 9);
        rg.addColorStop(0, `rgba(${tint},${0.35 * fade})`);
        rg.addColorStop(1, `rgba(${tint},0)`);
        g.fillStyle = rg;
        g.fillRect(u * W - 9, y - 9, 18, 18);
      }
    }
    g.globalCompositeOperation = 'source-over';
    // Crescent moon with a soft halo; equirect stretches it sideways by 1/cos(elevation).
    const el = Math.asin(MOON.y);
    const mu = Math.atan2(MOON.z, MOON.x) / (Math.PI * 2) + 0.5;
    const mx = mu * W, my = H * (0.5 - el / Math.PI);
    const stretch = 1 / Math.cos(el);
    const R = 26;
    const halo = g.createRadialGradient(mx, my, R * 0.8, mx, my, R * 9);
    halo.addColorStop(0, 'rgba(200,210,235,0.22)');
    halo.addColorStop(0.3, 'rgba(150,170,220,0.07)');
    halo.addColorStop(1, 'rgba(150,170,220,0)');
    g.save();
    g.translate(mx, my);
    g.scale(stretch, 1);
    g.translate(-mx, -my);
    g.fillStyle = halo;
    g.fillRect(mx - R * 9, my - R * 9, R * 18, R * 18);
    const moon = document.createElement('canvas');
    moon.width = moon.height = R * 2 + 4;
    const mg = moon.getContext('2d')!;
    const mgr = mg.createRadialGradient(R + 2 - R * 0.3, R + 2 + R * 0.2, 0, R + 2, R + 2, R);
    mgr.addColorStop(0, '#fffaf0');
    mgr.addColorStop(1, '#efe3c4');
    mg.fillStyle = mgr;
    mg.beginPath();
    mg.arc(R + 2, R + 2, R, 0, Math.PI * 2);
    mg.fill();
    mg.globalCompositeOperation = 'destination-out';
    mg.beginPath();
    mg.arc(R + 2 + R * 0.55, R + 2 - R * 0.42, R * 0.98, 0, Math.PI * 2);
    mg.fill();
    g.drawImage(moon, mx - R - 2, my - R - 2);
    g.restore();
  });
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 1;
  return t;
}

// ------------------------------------------------------------------ the map

interface Road {
  pts: THREE.Vector3[];
  len: number[];
  tan: THREE.Vector3[];
  total: number;
  /** Lane offsets from the centreline; the first half run with the path, the rest against it. */
  lanes: number[];
}

function makeRoad(pts: THREE.Vector3[], lanes: number[]): Road {
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const tan = pts.map((_, i, a) => a[Math.min(a.length - 1, i + 1)].clone().sub(a[Math.max(0, i - 1)]).normalize());
  return { pts, len, tan, total: len[len.length - 1], lanes };
}

interface Car {
  rd: Road;
  lane: number;
  s: number;
  v: number;
  /** 0 sedan, 1 bus; idx is the instance slot in that kind's fleet. */
  kind: number;
  idx: number;
}

export class CityMission extends Mission {
  readonly id = 'city';
  private road!: Road;
  private avenues: Road[] = [];
  private cars: Car[] = [];
  private fleets: THREE.InstancedMesh[][] = [];
  private beacon?: THREE.MeshBasicMaterial;
  private flies?: { pts: THREE.Points; base: number[] };
  private t = 0;

  constructor(...a: ConstructorParameters<typeof Mission>) {
    super(...a);
    const w = (this.world = new World(
      this.scene,
      { id: 'gold', sun: 0xffd7a8, sunDir: new THREE.Vector3(-0.85, 0.32, 0.25), sunIntensity: 2.7, fogNear: 220, fogFar: 1500, ambient: 1.0 },
      {
        amp: 400, base: 0, seed: 4, shape: cityHeight, detail: 420,
        tex: ['leafy_grass', 'sand_01', 'rock_face'], shore: 1.2, patch: 0.6, tint: 0x7b8a3c, grade: 0xf4ecdf, rockSlope: [0.75, 1.2],
        grass: { color: 0x9aaa55, density: 0.7, size: 0.7 },
        flats: [],
      },
    ));
    // Night: the painted sky replaces the photo, the sun becomes cool moonlight.
    {
      const sky = nightSky();
      const s = this.scene;
      s.background = s.environment = sky;
      s.backgroundRotation.set(0, 0, 0);
      s.environmentRotation.set(0, 0, 0);
      s.environmentIntensity = 3.4;
      s.fog = new THREE.Fog(0x2a3658, 300, 2600);
      w.sun.color.setHex(0xa8bdf0);
      w.sun.intensity = 1.1;
      w.sunDir.copy(MOON);
      w.follow(new THREE.Vector3());
      this.look = { exposure: 1.35, bloom: 0.95, threshold: 0.6, radius: 0.6 };
    }
    this.waterY = 0;
    w.water(this.waterY, 0x0c1c28);
    this.pad = w.pad(PAD.x, PAD.z);
    this.spawn.copy(this.pad).y += 0.7;
    this.spawnYaw = Math.atan2(-(TOWERS[0][0] - PAD.x), -(TOWERS[0][1] - PAD.z));
    this.orbit.center.set(-20, 40, 20);
    this.orbit.radius = 230;
    this.orbit.height = 90;

    const r = rng(2611);
    const solids: { x: number; z: number; w: number; d: number; y0: number; h: number; kind: Facade | 'deco' }[] = [];

    // ---- the sea road: centreline 18 m inland of the shore
    const roadX = (z: number) => coast(z) + 18;
    const Z0 = -228, Z1 = 330;
    const seaPts: THREE.Vector3[] = [];
    for (let z = Z0; z <= Z1; z += 3) seaPts.push(new THREE.Vector3(roadX(z), GROUND + 0.06, z));
    this.road = makeRoad(seaPts, [-6.2, -2.2, 2.2, 6.2]);
    const roadMat = this.roadMat();
    this.ribbon(this.road.pts, 17, GROUND + 0.06, roadMat);
    // Promenade: a pale walkway on the sea side, with a low sea wall.
    const walkPts = this.road.pts.map((p) => new THREE.Vector3(coast(p.z) + 4.2, GROUND + 0.1, p.z));
    this.ribbon(walkPts, 7, GROUND + 0.1, w.pbr('concrete_floor_02', 0xe4ddd0, 0.9));
    {
      const segs: THREE.BufferGeometry[] = [];
      for (let i = 0; i < walkPts.length - 1; i++) {
        const p = walkPts[i], q = walkPts[i + 1];
        const len = p.distanceTo(q);
        const g = boxGeo(0.5, 0.8, len + 0.1, 2);
        g.rotateY(Math.atan2(q.x - p.x, q.z - p.z));
        g.translate((p.x + q.x) / 2 - 3.6, GROUND + 0.4, (p.z + q.z) / 2);
        segs.push(g);
      }
      const wallMesh = new THREE.Mesh(mergeGeometries(segs)!, w.pbr('concrete_wall_004', 0xe8e2d8, 0.85));
      wallMesh.castShadow = wallMesh.receiveShadow = true;
      this.scene.add(wallMesh);
    }
    // Tetrapods heaped against the sea wall (not along the beach).
    {
      const g = new THREE.TetrahedronGeometry(1.3, 0);
      const mesh = new THREE.InstancedMesh(g, w.pbr('concrete_wall_004', 0xb9b3a8, 0.95), 900);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      let n = 0;
      for (let z = -120; z < 330 && n < 900; z += 1.4) {
        for (let k = 0; k < 2 && n < 900; k++) {
          const x = coast(z) - 3 - r() * 6;
          e.set(r() * 6, r() * 6, r() * 6);
          q.setFromEuler(e);
          m4.compose(new THREE.Vector3(x, -0.6 + r() * 1.6, z + (r() - 0.5)), q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + r() * 0.5));
          mesh.setMatrixAt(n++, m4);
        }
      }
      mesh.count = n;
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    // Streetlights on the sea side: the necklace of sodium lamps.
    const poles: THREE.BufferGeometry[] = [];
    const lamps: THREE.BufferGeometry[] = [];
    const pools: { x: number; z: number; s: number }[] = [];
    {
      for (let s = 8; s < this.road.total; s += 15) {
        const { p, t } = this.along(s);
        const nx = -t.z, nz = t.x; // left normal (toward the sea for this road direction)
        const side = nx < 0 ? 1 : -1;
        const x = p.x + nx * side * 9.2, z = p.z + nz * side * 9.2;
        poles.push(new THREE.CylinderGeometry(0.09, 0.13, 9, 6).translate(x, GROUND + 4.5, z));
        const arm = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5).rotateZ(Math.PI / 2);
        arm.rotateY(Math.atan2(-nz * side, nx * side) + Math.PI / 2);
        arm.translate(x - nx * side * 1.1, GROUND + 8.9, z - nz * side * 1.1);
        poles.push(arm);
        lamps.push(new THREE.SphereGeometry(0.32, 10, 6).scale(1, 0.55, 1).translate(x - nx * side * 2.2, GROUND + 8.8, z - nz * side * 2.2));
        pools.push({ x: x - nx * side * 3.4, z: z - nz * side * 3.4, s: 26 });
      }
    }
    // Two inland avenues with their own traffic, on streets the courses leave alone,
    // and a country road out past the village into the hills.
    {
      const a1: THREE.Vector3[] = [], a2: THREE.Vector3[] = [], a3: THREE.Vector3[] = [];
      for (let z = -230; z <= 336; z += 4) a1.push(new THREE.Vector3(320, GROUND + 0.07, z));
      for (let x = coast(-148) + 74; x <= 320; x += 4) a2.push(new THREE.Vector3(x, GROUND + 0.07, -148));
      for (let x = 325; x <= 720; x += 3) a3.push(new THREE.Vector3(x, cityHeight(x, countryZ(x)) + 0.22, countryZ(x)));
      let lane: THREE.Material | undefined;
      for (const [pts, gap, both] of [[a1, 15, true], [a2, 15, true], [a3, 26, false]] as const) {
        const rd = makeRoad(pts, [-2.2, 2.2]);
        this.avenues.push(rd);
        this.ribbon(pts, pts === a3 ? 8 : 9, pts === a3 ? null : GROUND + 0.07, (lane ??= this.laneMat()));
        let k = 0;
        for (let s = 10; s < rd.total; s += gap) {
          const { p, t } = this.along(s, rd);
          const side = both && k++ % 2 ? 1 : -1;
          const nx = -t.z * side, nz = t.x * side;
          const x = p.x + nx * 5.2, z = p.z + nz * 5.2;
          const gy = cityHeight(x, z);
          poles.push(new THREE.CylinderGeometry(0.07, 0.1, 7.4, 6).translate(x, gy + 3.5, z));
          const arm = new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5).rotateZ(Math.PI / 2);
          arm.rotateY(Math.atan2(-nz, nx) + Math.PI / 2);
          arm.translate(x - nx * 0.8, gy + 6.95, z - nz * 0.8);
          poles.push(arm);
          lamps.push(new THREE.SphereGeometry(0.26, 10, 6).scale(1, 0.55, 1).translate(x - nx * 1.6, gy + 6.85, z - nz * 1.6));
          pools.push({ x: x - nx * 2.4, z: z - nz * 2.4, s: 20 });
        }
      }
    }
    {
      this.scene.add(new THREE.Mesh(mergeGeometries(poles.map((g) => (g.index ? g.toNonIndexed() : g)))!, w.mat(0x4c5258, { metalness: 0.6, roughness: 0.4 })));
      const lm = new THREE.Mesh(mergeGeometries(lamps)!, new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa850, emissiveIntensity: 9 }));
      lm.userData.noCast = true;
      this.scene.add(lm);
      this.pools(pools, 0xff9a48, 0.7);
    }

    // ---- traffic: modelled sedans, black-and-yellow taxis and red city buses.
    // Light traffic, as at night; every vehicle in a lane keeps the lane's speed,
    // spaced evenly, so nothing ever drives through anything else.
    {
      const kinds = [sedan(), bus()];
      const plan: { rd: Road; lane: number; kind: number }[] = [];
      const [ave1, ave2, country] = this.avenues;
      const roads: [Road, number, number][] = [[this.road, 9, 1], [ave1, 5, 0], [ave2, 5, 0], [country, 2, 1]];
      for (const [rd, perLane, buses] of roads) {
        rd.lanes.forEach((_, lane) => {
          const outer = lane === 0 || lane === rd.lanes.length - 1;
          for (let k = 0; k < perLane; k++) plan.push({ rd, lane, kind: outer && k < buses ? 1 : 0 });
        });
      }
      const counts = [0, 0];
      for (const p of plan) counts[p.kind]++;
      const fade = fadeTex();
      this.fleets = kinds.map((k, i) => fleet(k, counts[i], fade));
      for (const f of this.fleets) for (const m of f) this.scene.add(m);
      const paints = [0xe8e8e4, 0xc9ccd0, 0x8a9096, 0x2b2e33, 0x16181b, 0x6e1a1c, 0x1f3550, 0x9a9182, 0xf2f0ea];
      const c = new THREE.Color();
      const used = [0, 0];
      const laneSpeed = new Map<string, number>();
      const laneSlot = new Map<string, number>();
      for (const p of plan) {
        const key = `${p.rd.total}:${p.lane}`;
        const n = plan.filter((q) => q.rd === p.rd && q.lane === p.lane).length;
        if (!laneSpeed.has(key)) laneSpeed.set(key, (p.rd === this.road ? 12.5 : 8.5) + r() * 2.5);
        const slot = laneSlot.get(key) ?? 0;
        laneSlot.set(key, slot + 1);
        const v = laneSpeed.get(key)! * (p.lane < p.rd.lanes.length / 2 ? 1 : -1);
        const s = ((slot + 0.35 * r()) / n) * p.rd.total;
        const idx = used[p.kind]++;
        this.cars.push({ rd: p.rd, lane: p.lane, s, v, kind: p.kind, idx });
        const [paint, top] = this.fleets[p.kind];
        if (p.kind === 1) {
          c.setHex(0xb3221c); // city-bus red
          paint.setColorAt(idx, c);
          top.setColorAt(idx, c.setHex(0xd8d4cc));
        } else if (r() < 0.3) {
          paint.setColorAt(idx, c.setHex(0x141518)); // taxi: black body, yellow top
          top.setColorAt(idx, c.setHex(0xf0c419));
        } else {
          c.setHex(paints[Math.floor(r() * paints.length)]);
          paint.setColorAt(idx, c);
          top.setColorAt(idx, c);
        }
      }
      this.moveCars(0);
    }

    // ---- palms along the promenade and the beach
    const palms: { x: number; z: number; h: number }[] = [];
    for (let s = 20; s < this.road.total; s += 17) {
      const { p, t } = this.along(s);
      const nx = -t.z, nz = t.x;
      const side = nx < 0 ? -1 : 1; // inland side
      palms.push({ x: p.x + nx * side * 10.5, z: p.z + nz * side * 10.5, h: 8 + r() * 4 });
    }
    for (let i = 0; i < 400 && palms.length < 140; i++) {
      const z = -220 + r() * 110;
      const x = coast(z) - 2 - r() * 14;
      if (cityHeight(x, z) < 0.8) continue;
      palms.push({ x, z, h: 7 + r() * 5 });
    }

    // ---- Art Deco row facing the sea
    for (let s = 24; s < this.road.total - 20; s += 30 + r() * 6) {
      const { p, t } = this.along(s);
      if (beachW(p.z) > 0.3) continue;
      const nx = -t.z, nz = t.x;
      const side = nx < 0 ? -1 : 1;
      const wd = 22 + r() * 6, d = 16 + r() * 4, h = 16 + Math.floor(r() * 4) * 3.2;
      const x = p.x + nx * side * (21 + d / 2), z = p.z + nz * side * (21 + d / 2);
      const ry = Math.atan2(t.x, t.z);
      this.decoBlock(x, z, wd, d, h, ry);
    }

    // ---- the city grid
    const tooNear = (x: number, z: number, rad: number) => x - rad < coast(z) + 64 || x - rad < coast(z - rad) + 64 || x - rad < coast(z + rad) + 64;
    const inMaidan = (x: number, z: number, m = 0) => x > MAIDAN.x0 - m && x < MAIDAN.x1 + m && z > MAIDAN.z0 - m && z < MAIDAN.z1 + m;
    for (const [x, z, wd, d, h] of TOWERS) solids.push({ x, z, w: wd, d, y0: GROUND, h, kind: 'glass' });
    const CELL = 44, BLOCK = 31;
    const plates: THREE.BufferGeometry[] = [];
    for (let cxp = -340; cxp < 330; cxp += CELL) {
      for (let czp = -236; czp < 340; czp += CELL) {
        const x = cxp + CELL / 2, z = czp + CELL / 2;
        if (tooNear(x, z, BLOCK / 2) || inMaidan(x, z, 26)) continue;
        if (Math.hypot(x - HILL.x, z - HILL.z) < HILL.r * 0.75 && cityHeight(x, z) > GROUND + 4) {
          // A few towers on the hilltop, nothing on its slopes.
          if (cityHeight(x, z) < GROUND + 30 || r() < 0.4) continue;
        }
        const base = Math.min(cityHeight(x - BLOCK / 2, z - BLOCK / 2), cityHeight(x + BLOCK / 2, z + BLOCK / 2), cityHeight(x - BLOCK / 2, z + BLOCK / 2), cityHeight(x + BLOCK / 2, z - BLOCK / 2));
        plates.push(boxGeo(BLOCK + 3, 0.5, BLOCK + 3, 6).translate(x, base + 0.15, z));
        if (TOWERS.some(([tx, tz]) => Math.abs(tx - x) < CELL / 2 && Math.abs(tz - z) < CELL / 2)) continue;
        // Height: a cluster of high-rises inland, the hill and a business district at the south tip.
        const core = Math.max(
          1 - Math.hypot(x - 190, z - 20) / 210,
          1 - Math.hypot(x + 230, z - 320) / 120,
          0.55 * (1 - Math.hypot(x - HILL.x, z - HILL.z) / 150),
        );
        const tall = Math.max(0, core);
        const split = r();
        const parts: [number, number, number, number][] =
          split < 0.35 && tall > 0.25
            ? [[x, z, BLOCK - 6, BLOCK - 6]]
            : split < 0.7
              ? [[x - 8, z, 13, BLOCK - 4], [x + 8.5, z, 12, BLOCK - 4]]
              : [[x - 8, z - 8, 13, 13], [x + 8, z - 8, 13, 13], [x - 8, z + 8, 13, 13], [x + 8, z + 8, 13, 13]];
        for (const [bx, bz, bw, bd] of parts) {
          if (r() < 0.08) continue;
          const hh = 10 + r() * 22 + tall * tall * (40 + r() * 130);
          const kind: Facade = hh > 70 ? (r() < 0.5 ? 'glass' : 'flats') : hh > 30 ? (r() < 0.75 ? 'flats' : 'old') : 'old';
          solids.push({ x: bx, z: bz, w: bw * (0.8 + r() * 0.2), d: bd * (0.8 + r() * 0.2), y0: base, h: Math.round(hh / 3.2) * 3.2, kind });
        }
      }
    }
    {
      const m = new THREE.Mesh(mergeGeometries(plates)!, w.pbr('concrete_floor_02', 0xcfc8bc, 0.92));
      m.receiveShadow = true;
      this.scene.add(m);
      // Asphalt under the whole grid, just above the grass.
      const streets = new THREE.Mesh(new THREE.PlaneGeometry(700, 600).rotateX(-Math.PI / 2), w.pbr('asphalt_02', 0x9a9894, 0.95));
      const uv = streets.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 70, uv.getY(i) * 60);
      streets.position.set(-5, GROUND + 0.03, 52);
      streets.receiveShadow = true;
      streets.userData.noCast = true;
      // Clip it to land: hide it where the sea or the road is by keeping it east of the road per row.
      streets.material = (streets.material as THREE.MeshStandardMaterial).clone();
      (streets.material as THREE.MeshStandardMaterial).onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
          .replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
            { float z = vW.z; float c = cos(((z - 40.0) / 270.0) * 1.5707963);
              float coast = -340.0 + 270.0 * pow(max(0.0, c), 1.2);
              if (vW.x < coast + 52.0) discard;
              float hx = vW.x + 300.0, hz = vW.z + 330.0;
              if (hx * hx + hz * hz < 110.0 * 110.0) discard;
              if (vW.x > ${MAIDAN.x0 - 8}.0 && vW.x < ${MAIDAN.x1 + 8}.0 && vW.z > ${MAIDAN.z0 - 8}.0 && vW.z < ${MAIDAN.z1 + 8}.0) discard; }`,
          );
      };
      this.scene.add(streets);
    }
    this.buildings(solids);

    // ---- the maidan: a cricket square by the pad
    {
      const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 22).rotateX(-Math.PI / 2), w.mat(0xc8b48a, { roughness: 1 }));
      pitch.position.set(PAD.x + 30, GROUND + 0.05, PAD.z + 6);
      pitch.receiveShadow = true;
      this.scene.add(pitch);
      for (const dz of [-10, 10]) {
        for (const dx of [-0.25, 0, 0.25]) {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 5), w.mat(0xf2ead8));
          st.position.set(PAD.x + 30 + dx, GROUND + 0.36, PAD.z + 6 + dz);
          this.scene.add(st);
        }
      }
    }

    // ---- the sea bridge
    this.bridge();

    // ---- village, fields and a temple east of the city
    this.village(r);

    // ---- trees: broadleaf on the hill and the eastern hills, palms around the village
    const trees: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 9000 && trees.length < 520; i++) {
      const x = HILL.x + (r() - 0.5) * HILL.r * 2;
      const z = HILL.z + (r() - 0.5) * HILL.r * 2;
      const h = cityHeight(x, z);
      if (h < GROUND + 3 || x < coast(z) + 6 || solids.some((s) => Math.abs(s.x - x) < s.w / 2 + 3 && Math.abs(s.z - z) < s.d / 2 + 3)) continue;
      trees.push({ x, z, s: 0.7 + r() * 0.7 });
    }
    for (let i = 0; i < 9000 && trees.length < 1300; i++) {
      const x = 360 + r() * 400;
      const z = -560 + r() * 1120;
      if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 110 || (x < 500 && noise2(x * 0.02, z * 0.02) < 0.55)) continue;
      if (Math.abs(z - countryZ(x)) < 9) continue;
      trees.push({ x, z, s: 0.8 + r() * 0.8 });
    }
    // Shade trees in the maidan corners.
    for (const [x, z] of [[MAIDAN.x0 + 4, MAIDAN.z0 + 4], [MAIDAN.x1 - 4, MAIDAN.z0 + 4], [MAIDAN.x0 + 4, MAIDAN.z1 - 4], [MAIDAN.x1 - 4, MAIDAN.z1 - 4], [MAIDAN.x0 + 4, MAIDAN.z0 + 50]]) {
      trees.push({ x, z, s: 1.1 });
    }
    w.pines(trees, 0x58782f, 0.92, 0.05);
    this.palms(palms);
  }

  // -------------------------------------------------------------- road helpers

  /** Point and tangent at distance s along a road (the sea road by default). */
  private along(s: number, rd = this.road) {
    const { pts, len, tan, total } = rd;
    s = ((s % total) + total) % total;
    let lo = 0, hi = len.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (len[m] > s) hi = m;
      else lo = m;
    }
    const k = (s - len[lo]) / Math.max(1e-6, len[hi] - len[lo]);
    return { p: pts[lo].clone().lerp(pts[hi], k), t: tan[lo].clone().lerp(tan[hi], k).normalize() };
  }

  /** Lays a strip along a path, at height y, or following the path's own heights when y is null. */
  private ribbon(path: THREE.Vector3[], width: number, y: number | null, mat: THREE.Material) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let run = 0;
    path.forEach((p, i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
      if (i > 0) run += Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z);
      const py = y ?? p.y;
      pos.push(p.x + (nx * width) / 2, py, p.z + (nz * width) / 2, p.x - (nx * width) / 2, py, p.z - (nz * width) / 2);
      uv.push(0, run / width, 1, run / width);
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) {
      const ar = g.index!.array as Uint16Array;
      for (let i = 0; i < ar.length; i += 3) [ar[i + 1], ar[i + 2]] = [ar[i + 2], ar[i + 1]];
      g.computeVertexNormals();
    }
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.userData.noCast = true;
    this.scene.add(m);
    return m;
  }

  /** Worn two-lane country tarmac: a broken centre line, no kerb lines. */
  private laneMat() {
    const asphalt = this.world.pbr('asphalt_02', 0x7a7672, 0.95);
    const marks = canvasTex(256, 256, (g) => {
      g.clearRect(0, 0, 256, 256);
      g.fillStyle = 'rgba(235,232,220,0.75)';
      for (let y = 0; y < 256; y += 128) g.fillRect(125, y, 5, 60);
    });
    const m = asphalt.clone();
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tMarks = { value: marks };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tMarks;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec4 mk = texture2D(tMarks, vMapUv * vec2(1.0 / 3.0, 0.5 / 3.0)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9), mk.a); }');
    };
    const t = m.map!.clone();
    t.repeat.set(3, 3);
    t.needsUpdate = true;
    m.map = t;
    return m;
  }

  /** Asphalt with lane markings, mapped one texture length per road width. */
  private roadMat() {
    const asphalt = this.world.pbr('asphalt_02', 0x8c8a88, 0.9);
    const marks = canvasTex(256, 256, (g) => {
      g.clearRect(0, 0, 256, 256);
      g.fillStyle = 'rgba(245,245,235,0.9)';
      g.fillRect(126, 0, 4, 256); // centre median line
      for (const x of [64, 192]) for (let y = 0; y < 256; y += 64) g.fillRect(x - 2, y, 4, 32);
      g.fillRect(6, 0, 3, 256);
      g.fillRect(247, 0, 3, 256);
    });
    const m = asphalt.clone();
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tMarks = { value: marks };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tMarks;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec4 mk = texture2D(tMarks, vMapUv * vec2(1.0 / 3.0, 0.5 / 3.0)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), mk.a); }');
    };
    const t = m.map!.clone();
    t.repeat.set(3, 3);
    t.needsUpdate = true;
    m.map = t;
    return m;
  }

  private moveCars(dt: number) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    this.cars.forEach((c) => {
      c.s += c.v * dt;
      const { p, t } = this.along(c.s, c.rd);
      const nx = -t.z, nz = t.x;
      const off = c.rd.lanes[c.lane];
      p.x += nx * off;
      p.z += nz * off;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(-t.z, t.x) + (c.v < 0 ? Math.PI : 0));
      m4.compose(p, q, one);
      for (const m of this.fleets[c.kind]) m.setMatrixAt(c.idx, m4);
    });
    for (const f of this.fleets) for (const m of f) m.instanceMatrix.needsUpdate = true;
  }

  /** Additive pools of lamplight on the ground. */
  private pools(list: { x: number; z: number; s: number }[], color: number, strength: number) {
    const mat = new THREE.MeshBasicMaterial({ map: poolTex(), color, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach((p, i) => {
      m4.makeScale(p.s, 1, p.s).setPosition(p.x, cityHeight(p.x, p.z) + 0.15, p.z);
      mesh.setMatrixAt(i, m4);
    });
    mesh.userData.noCast = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }

  // -------------------------------------------------------------- buildings

  private buildings(list: { x: number; z: number; w: number; d: number; y0: number; h: number; kind: Facade | 'deco' }[]) {
    const w = this.world;
    const r = rng(77);
    const by: Record<Facade, THREE.BufferGeometry[]> = { glass: [], flats: [], old: [] };
    const roofs: THREE.BufferGeometry[] = [];
    const tanks: THREE.BufferGeometry[] = [];
    const sheds: THREE.BufferGeometry[] = [];
    const beacons: THREE.BufferGeometry[] = [];
    for (const b of list) {
      const kind = b.kind === 'deco' ? 'old' : b.kind;
      const sink = 1.5;
      // Shift each building's facade by whole bays and floors so no two light up alike.
      const body = boxGeo(b.w, b.h + sink, b.d, TILE).translate(b.x, b.y0 - sink + (b.h + sink) / 2, b.z);
      const ou = Math.floor(r() * 8) / 8, ov = Math.floor(r() * 10) / 10;
      const uv = body.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + ou, uv.getY(i) + ov);
      by[kind].push(body);
      const top = b.y0 + b.h;
      roofs.push(boxGeo(b.w + 0.4, 0.5, b.d + 0.4, 4).translate(b.x, top + 0.25, b.z));
      w.addBox(b.x, b.y0 - sink, b.z, b.w, b.h + sink + 0.5, b.d);
      // Red aviation lights on the corners of anything tall.
      if (b.h > 55) {
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          beacons.push(new THREE.SphereGeometry(0.28, 8, 6).translate(b.x + sx * (b.w / 2 - 0.4), top + 0.8, b.z + sz * (b.d / 2 - 0.4)));
        }
      }
      // Rooftop life: black water tanks, a stair head, AC plant.
      if (b.w > 9) {
        const nt = 1 + Math.floor(r() * 3);
        for (let i = 0; i < nt; i++) {
          tanks.push(new THREE.CylinderGeometry(0.75, 0.75, 1.5, 10).translate(b.x - b.w / 2 + 2 + i * 1.9, top + 1.25, b.z - b.d / 2 + 2));
        }
        sheds.push(boxGeo(3, 2.6, 3.2, 3).translate(b.x + b.w * 0.22, top + 1.8, b.z + b.d * 0.2));
      }
    }
    const mats: Record<Facade, THREE.Material> = {
      glass: facadeMat('glass', 5, 0.8),
      flats: facadeMat('flats', 6, 1.4),
      old: facadeMat('old', 7, 1.5),
    };
    for (const k of Object.keys(by) as Facade[]) {
      if (!by[k].length) continue;
      const m = new THREE.Mesh(mergeGeometries(by[k])!, mats[k]);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    }
    const add = (gs: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!gs.length) return;
      const m = new THREE.Mesh(mergeGeometries(gs)!, mat);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    };
    add(roofs, w.pbr('concrete_floor_02', 0xbab4aa, 0.92));
    add(tanks, w.mat(0x1d1f22, { roughness: 0.6 }));
    add(sheds, w.pbr('concrete_wall_004', 0xd6d0c4, 0.9));
    if (beacons.length) {
      this.beacon = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
      const m = new THREE.Mesh(mergeGeometries(beacons)!, this.beacon);
      m.userData.noCast = true;
      this.scene.add(m);
    }
  }

  /** Low sea-facing block, rotated to the curve of the bay, in pastel paint. */
  private decoBlock(x: number, z: number, wd: number, d: number, h: number, ry: number) {
    const w = this.world;
    const tints = [0xfff1d8, 0xf7e3cf, 0xe9eef0, 0xf6dcc8, 0xefe6c8];
    const m4 = new THREE.Matrix4().makeRotationY(ry).setPosition(x, GROUND - 1 + (h + 1) / 2, z);
    const body = boxGeo(d, h + 1, wd, TILE).applyMatrix4(m4);
    const mat = (this.decoMat ??= facadeMat('old', 11, 1.5));
    const mesh = new THREE.Mesh(body, mat.clone());
    (mesh.material as THREE.MeshStandardMaterial).color.setHex(tints[Math.floor(Math.abs(Math.sin(x * 7.1)) * tints.length)]);
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    // Rounded corner towers and a parapet, the period details.
    const parts: THREE.BufferGeometry[] = [];
    const cos = Math.cos(ry), sin = Math.sin(ry);
    for (const s of [-1, 1]) {
      const lx = -d / 2 + 2.2, lz = s * (wd / 2 - 2.2);
      parts.push(new THREE.CylinderGeometry(2.4, 2.4, h + 2.2, 18).translate(x + lx * cos + lz * sin, GROUND + (h + 2.2) / 2 - 0.6, z - lx * sin + lz * cos));
    }
    parts.push(boxGeo(d + 0.6, 1.0, wd + 0.6, 2).applyMatrix4(new THREE.Matrix4().makeRotationY(ry).setPosition(x, GROUND + h + 0.5, z)));
    const trim = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; }))!, w.mat(0xf3efe6, { roughness: 0.7 }));
    trim.castShadow = trim.receiveShadow = true;
    this.scene.add(trim);
    const ext = Math.abs(cos) * d + Math.abs(sin) * wd;
    const ezt = Math.abs(sin) * d + Math.abs(cos) * wd;
    // Collider slightly inset so the AABB of a turned block does not swallow the road.
    w.addBox(x, GROUND - 1, z, ext * 0.86, h + 2.5, ezt * 0.86);
  }
  private decoMat?: THREE.MeshStandardMaterial;

  // -------------------------------------------------------------- the bridge

  private bridge() {
    const w = this.world;
    const { a, b, y } = BRIDGE;
    const dir = b.clone().sub(a).normalize();
    const L = a.distanceTo(b);
    const ang = Math.atan2(dir.x, dir.y);
    const deck: THREE.BufferGeometry[] = [];
    const piers: THREE.BufferGeometry[] = [];
    const steel: THREE.BufferGeometry[] = [];
    const at = (s: number) => a.clone().addScaledVector(dir, s);
    // Deck in 12 m slabs, ramping down to the shore at the start.
    for (let s = 0; s < L; s += 12) {
      const p = at(s + 6);
      const yy = y * smooth(0, 60, s) + GROUND * (1 - smooth(0, 60, s));
      deck.push(boxGeo(19, 1.6, 12.4, 6).rotateY(ang).translate(p.x, yy - 0.8, p.y));
      w.addBox(p.x, yy - 1.6, p.y, 13, 1.8, 13);
      if (s > 40 && Math.round(s / 12) % 4 === 0) {
        piers.push(boxGeo(10, yy + 6, 3, 4).rotateY(ang).translate(p.x, (yy - 6) / 2 - 0.8, p.y));
        w.addBox(p.x, -6, p.y, 8, yy + 4.4, 8);
      }
      // Crash barriers.
      for (const side of [-1, 1]) {
        const ox = Math.cos(ang) * side * 9.2, oz = -Math.sin(ang) * side * 9.2;
        steel.push(boxGeo(0.3, 0.9, 12.4, 2).rotateY(ang).translate(p.x + ox, yy + 0.45, p.y + oz));
      }
    }
    // Two cable-stayed towers: inverted-Y legs, a spire, and a fan of stays each way.
    const cables: THREE.BufferGeometry[] = [];
    for (const s of [L * 0.36, L * 0.74]) {
      const p = at(s);
      const top = y + 92;
      for (const side of [-1, 1]) {
        const ox = Math.cos(ang) * side * 11.5, oz = -Math.sin(ang) * side * 11.5;
        const base = new THREE.Vector3(p.x + ox, -4, p.y + oz);
        const apex = new THREE.Vector3(p.x, y + 58, p.y);
        const len = base.distanceTo(apex);
        const g = new THREE.CylinderGeometry(1.5, 2.3, len, 8).translate(0, len / 2, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), apex.clone().sub(base).normalize());
        g.applyQuaternion(q).translate(base.x, base.y, base.z);
        piers.push(g);
        for (let k = 0; k < 6; k++) {
          const t = k / 6;
          const q2 = base.clone().lerp(apex, t + 0.08);
          w.addBox(q2.x, q2.y - len / 12, q2.z, 4.5, len / 6 + 1, 4.5);
        }
      }
      piers.push(new THREE.CylinderGeometry(1.2, 1.9, top - (y + 56), 8).translate(p.x, (top + y + 56) / 2, p.y));
      w.addBox(p.x, y + 56, p.y, 3.8, top - y - 56, 3.8);
      for (let k = 0; k < 14; k++) {
        const anchorY = y + 64 + k * 1.9;
        for (const dirSign of [-1, 1]) {
          const ds = dirSign * (14 + k * 8.5);
          const q = at(s + ds);
          const from = new THREE.Vector3(p.x, anchorY, p.y);
          const to = new THREE.Vector3(q.x, y + 0.6, q.y);
          const len = from.distanceTo(to);
          const g = new THREE.CylinderGeometry(0.13, 0.13, len, 5).translate(0, len / 2, 0);
          g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize())).translate(to.x, to.y, to.z);
          cables.push(g);
        }
      }
    }
    const add = (gs: THREE.BufferGeometry[], mat: THREE.Material) => {
      const m = new THREE.Mesh(mergeGeometries(gs.map((g) => { if (g.index) g = g.toNonIndexed(); if (g.attributes.uv) g.deleteAttribute('uv'); return g; }))!, mat);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    };
    add(deck, w.mat(0xb9b5ad, { roughness: 0.8 }));
    add(piers, w.mat(0xd8d4cc, { roughness: 0.75 }));
    add(steel, w.mat(0x8b9198, { metalness: 0.6, roughness: 0.4 }));
    add(cables, w.mat(0xe8eaec, { metalness: 0.5, roughness: 0.35 }));
  }

  // -------------------------------------------------------------- village

  private village(r: () => number) {
    const w = this.world;
    const { x: VX, z: VZ } = VILLAGE;
    // Paddy: mostly rice green, the odd ploughed or mustard plot.
    const fieldCols = [0x5d8a2c, 0x6c9832, 0x7aa43a, 0x527e28, 0x6c9832, 0x8a6a46, 0xb4a044];
    const fields: THREE.BufferGeometry[] = [];
    const colors: number[] = [];
    const c = new THREE.Color();
    for (let i = -4; i <= 4; i++) {
      for (let j = -6; j <= 6; j++) {
        const fx = VX + i * 26 + (r() - 0.5) * 4, fz = VZ + j * 22 + (r() - 0.5) * 4;
        if (Math.hypot(fx - VX, fz - VZ) < 46) continue;
        if (fx > 495) continue;
        if (Math.abs(fz - countryZ(fx)) < 16) continue;
        const g = new THREE.PlaneGeometry(23, 19, 6, 6).rotateX(-Math.PI / 2);
        const p = g.attributes.position;
        for (let k = 0; k < p.count; k++) p.setY(k, cityHeight(fx + p.getX(k), fz + p.getZ(k)) + 0.08);
        g.translate(fx, 0, fz);
        const pp = g.attributes.position;
        for (let k = 0; k < pp.count; k++) pp.setY(k, cityHeight(pp.getX(k), pp.getZ(k)) + 0.08);
        c.setHex(fieldCols[Math.floor(r() * fieldCols.length)]);
        for (let k = 0; k < p.count; k++) colors.push(c.r, c.g, c.b);
        fields.push(g);
      }
    }
    const fg = mergeGeometries(fields)!;
    fg.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    fg.computeVertexNormals();
    const uv = fg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 4, uv.getY(k) * 4);
    const fm = new THREE.Mesh(fg, w.pbr('forest_ground_04', 0xffffff, 0.98, { vertexColors: true }));
    fm.receiveShadow = true;
    fm.userData.noCast = true;
    this.scene.add(fm);

    // Houses: blue-washed concrete with flat terraces, a few whitewashed ones
    // under clay tiles. At night most are lived in: lit rooms, a porch bulb.
    const walls = [0x6f9fd2, 0xf3efe6, 0x88b4de, 0xe8d8b8, 0x5d8cc4, 0xd9e4c8];
    const winMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    winMat.color.setScalar(2.2);
    const bulbs: THREE.BufferGeometry[] = [];
    const tanks: THREE.BufferGeometry[] = [];
    const porch: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + r() * 0.2;
      const d = 19 + (i % 3) * 9 + r() * 4;
      const flat = i % 3 !== 1;
      const h = w.house(VX + Math.cos(a) * d, VZ + Math.sin(a) * d, 6 + r() * 3, 5 + r() * 2, (flat ? 3.4 : 3) + r() * 1.5, walls[i % walls.length], 0xa84a2a, flat);
      const home = r() < 0.85;
      const glass = h.group.children.find((m) => m.userData.noCast) as THREE.Mesh | undefined;
      if (glass) {
        const n = glass.geometry.attributes.position.count;
        const col = new Float32Array(n * 3);
        for (let v = 0; v < n; v += 4) {
          const on = home && r() < 0.85;
          const k = r();
          const tint = on ? (k < 0.65 ? [1, 0.58, 0.22] : k < 0.85 ? [0.85, 0.9, 1] : [0.3, 0.45, 1]) : [0.01, 0.013, 0.02];
          for (let q = 0; q < 4 && v + q < n; q++) col.set(tint, (v + q) * 3);
        }
        glass.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
        glass.material = winMat;
      }
      const gy = cityHeight(h.x, h.z);
      if (home) {
        bulbs.push(new THREE.SphereGeometry(0.13, 8, 6).translate(h.x, gy + 2.45, h.z + h.d / 2 + 0.22));
        porch.push({ x: h.x, z: h.z + h.d / 2 + 2, s: 10 });
      }
      // Black plastic water tank on the terrace.
      if (flat && r() < 0.7) tanks.push(new THREE.CylinderGeometry(0.62, 0.62, 1.15, 14).translate(h.x + h.w * 0.25, h.top + 0.58, h.z - h.d * 0.2));
    }
    {
      const bm = new THREE.Mesh(mergeGeometries(bulbs)!, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc27a).multiplyScalar(5) }));
      bm.userData.noCast = true;
      this.scene.add(bm);
      if (tanks.length) {
        const tm = new THREE.Mesh(mergeGeometries(tanks)!, w.mat(0x1a1b1d, { roughness: 0.5 }));
        tm.castShadow = true;
        this.scene.add(tm);
      }
      this.pools(porch, 0xffa860, 0.8);
      // Village street lights: a ring of lamp posts along the lane between the houses.
      const vp: THREE.BufferGeometry[] = [];
      const vl: THREE.BufferGeometry[] = [];
      const vpool: { x: number; z: number; s: number }[] = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + 0.11;
        for (const d of [12, 50]) {
          if (d === 50 && i % 2) continue;
          const x = VX + Math.cos(a) * d, z = VZ + Math.sin(a) * d;
          const gy = cityHeight(x, z);
          const ix = -Math.cos(a), iz = -Math.sin(a);
          vp.push(new THREE.CylinderGeometry(0.06, 0.09, 5.6, 6).translate(x, gy + 2.8, z));
          const arm = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5).rotateZ(Math.PI / 2);
          arm.rotateY(Math.atan2(-iz, ix));
          arm.translate(x + ix * 0.55, gy + 5.5, z + iz * 0.55);
          vp.push(arm);
          vl.push(new THREE.SphereGeometry(0.2, 10, 6).scale(1, 0.55, 1).translate(x + ix * 1.1, gy + 5.4, z + iz * 1.1));
          vpool.push({ x: x + ix * 1.6, z: z + iz * 1.6, s: 16 });
        }
      }
      this.scene.add(new THREE.Mesh(mergeGeometries(vp.map((g) => (g.index ? g.toNonIndexed() : g)))!, w.mat(0x4c5258, { metalness: 0.6, roughness: 0.4 })));
      const vm = new THREE.Mesh(mergeGeometries(vl)!, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc480).multiplyScalar(6) }));
      vm.userData.noCast = true;
      this.scene.add(vm);
      this.pools(vpool, 0xff9a48, 0.75);
    }
    // Fireflies drifting over the paddy.
    {
      const N = 420;
      const pos = new Float32Array(N * 3);
      const ff: number[] = [];
      for (let i = 0; i < N; i++) {
        let x = 0, z = 0;
        do {
          x = VX + (r() - 0.5) * 220;
          z = VZ + (r() - 0.5) * 280;
        } while (Math.hypot(x - VX, z - VZ) < 44 || Math.abs(z - countryZ(x)) < 10);
        const y = cityHeight(x, z) + 0.6 + r() * 2.2;
        pos.set([x, y, z], i * 3);
        ff.push(x, y, z, r() * 20);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.32, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      pts.frustumCulled = false;
      pts.userData.noCast = true;
      this.scene.add(pts);
      this.flies = { pts, base: ff };
    }
    // A small white temple: plinth, sanctum and a curved tower with a saffron flag.
    const base = cityHeight(VX, VZ);
    w.block(VX, base - 0.5, VZ, 7, 1.6, 7, 0xe8e2d6, undefined, 'white_rough_plaster');
    w.block(VX, base + 1.1, VZ, 4.6, 3.4, 4.6, 0xf6f2ea, undefined, 'white_rough_plaster');
    const spire = new THREE.Mesh(new THREE.LatheGeometry(
      Array.from({ length: 12 }, (_, k) => new THREE.Vector2(2.4 * Math.cos((k / 11) * Math.PI * 0.5) ** 0.7 + 0.05, (k / 11) * 7.5)), 16), w.pbr('white_rough_plaster', 0xfbf6ec, 0.85));
    spire.position.set(VX, base + 4.5, VZ);
    spire.castShadow = true;
    this.scene.add(spire);
    w.addBox(VX, base + 4.5, VZ, 4.2, 7.5, 4.2);
    const kalash = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), w.mat(0xd7a52a, { metalness: 0.8, roughness: 0.3 }));
    kalash.position.set(VX, base + 12.2, VZ);
    this.scene.add(kalash);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 5), w.mat(0x5b4a3a));
    pole.position.set(VX, base + 13.7, VZ);
    this.scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshStandardMaterial({ color: 0xff8a1c, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(VX + 0.7, base + 14.7, VZ);
    this.scene.add(flag);
  }

  // -------------------------------------------------------------- palms

  private palms(list: { x: number; z: number; h: number }[]) {
    const w = this.world;
    const r = rng(31);
    const trunkG = new THREE.CylinderGeometry(0.17, 0.26, 1, 7, 4).translate(0, 0.5, 0);
    const trunk = new THREE.InstancedMesh(trunkG, w.pbr('pine_bark', 0xb8a890, 0.95), list.length);
    // Crown: nine drooping fronds.
    const fronds: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 9; k++) {
      const g = new THREE.PlaneGeometry(1.5, 4.6, 1, 6).translate(0, 2.3, 0).rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = -p.getZ(i) / 4.6;
        p.setY(i, 0.9 * t - 2.1 * t * t);
      }
      g.rotateY((k / 9) * Math.PI * 2 + (k % 2) * 0.2);
      fronds.push(g);
    }
    const crownG = mergeGeometries(fronds)!;
    crownG.computeVertexNormals();
    const cn = crownG.attributes.normal;
    for (let i = 0; i < cn.count; i++) cn.setXYZ(i, 0, 1, 0);
    const crown = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ map: frondTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }), list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach((p, i) => {
      const y = cityHeight(p.x, p.z);
      const lx = (r() - 0.5) * 0.25, lz = (r() - 0.5) * 0.25;
      e.set(lx, 0, lz);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(p.x, y - 0.3, p.z), q, new THREE.Vector3(1, p.h, 1));
      trunk.setMatrixAt(i, m4);
      const top = new THREE.Vector3(0, p.h, 0).applyQuaternion(q).add(new THREE.Vector3(p.x, y - 0.3, p.z));
      e.set(lx, r() * 6, lz);
      q.setFromEuler(e);
      m4.compose(top, q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.9 + r() * 0.3));
      crown.setMatrixAt(i, m4);
      w.addBox(p.x, y, p.z, 0.6, p.h, 0.6);
    });
    trunk.castShadow = crown.castShadow = true;
    this.scene.add(trunk, crown);
  }

  // -------------------------------------------------------------- loop

  ambient(dt: number, _viewer: THREE.Vector3) {
    this.t += dt;
    if (this.cars.length) this.moveCars(dt);
    if (this.flies) {
      const { pts, base } = this.flies;
      const p = pts.geometry.attributes.position as THREE.BufferAttribute;
      const c = pts.geometry.attributes.color as THREE.BufferAttribute;
      const t = this.t;
      for (let i = 0; i < p.count; i++) {
        const [x, y, z, ph] = [base[i * 4], base[i * 4 + 1], base[i * 4 + 2], base[i * 4 + 3]];
        p.setXYZ(i, x + Math.sin(t * 0.4 + ph) * 1.6, y + Math.sin(t * 0.7 + ph * 1.3) * 0.5, z + Math.cos(t * 0.33 + ph) * 1.6);
        // Each one glows for a moment, then goes dark for a while.
        const k = Math.max(0, Math.sin(t * 1.1 + ph)) ** 6 * 3;
        c.setXYZ(i, k * 0.8, k, k * 0.3);
      }
      p.needsUpdate = true;
      c.needsUpdate = true;
    }
    // Aviation lights blink together, about once every two seconds.
    if (this.beacon) {
      const k = (this.t % 1.9) < 0.5 ? 4 : 0.15;
      this.beacon.color.setRGB(k, k * 0.06, k * 0.035);
    }
  }

  update(dt: number, _c: Controls) {
    this.elapsed += dt;
  }

  objective(): Objective {
    return { title: 'Marine Bay', lines: ['Free flight — no objectives', 'Night over the bay — ride the sea road, then out past the village'] };
  }

  payload(): Payload {
    return { label: 'CAMERA', text: 'REC', frac: 1 };
  }

  stars() {
    return 0;
  }

  summary(): [string, string][] {
    return [];
  }
}
