// Marine Bay: a seaside megacity at golden hour. A sea road sweeps around a
// C-shaped bay under a necklace of streetlights, with a sandy beach at the foot
// of a green hill. Behind it, a row of Art Deco blocks, then streets of towers;
// a cable-stayed sea bridge runs out over the water, and past the city's east
// edge are a farming village, fields and wooded hills.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise2 } from '../assets';
import type { Controls } from '../input';
import { World, boxGeo, canvasTex, rng } from '../world';
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

/** One tile of a building face, 16 m square: floors 3.2 m, bays 4 m. */
function facadeTex(kind: Facade, seed: number) {
  const r = rng(seed);
  const N = 512;
  const px = N / 16; // pixels per metre
  return canvasTex(N, N, (g) => {
    if (kind === 'glass') {
      const grd = g.createLinearGradient(0, 0, 0, N);
      grd.addColorStop(0, '#5f8796');
      grd.addColorStop(1, '#3c5f6e');
      g.fillStyle = grd;
      g.fillRect(0, 0, N, N);
      for (let f = 0; f < 5; f++) {
        for (let b = 0; b < 8; b++) {
          const v = r();
          g.fillStyle = `rgba(${v < 0.15 ? '220,235,240' : '20,40,50'},${0.08 + r() * 0.22})`;
          g.fillRect(b * 2 * px, f * 3.2 * px, 2 * px, 3.2 * px);
        }
      }
      g.fillStyle = '#c6d2d6';
      for (let f = 0; f <= 5; f++) g.fillRect(0, f * 3.2 * px - 3, N, 6);
      for (let b = 0; b <= 8; b++) g.fillRect(b * 2 * px - 1.5, 0, 3, N);
      return;
    }
    const wall = kind === 'flats' ? '#e8e2d6' : '#d9c3a8';
    g.fillStyle = wall;
    g.fillRect(0, 0, N, N);
    // Weathering: monsoon streaks under the windows.
    for (let i = 0; i < 70; i++) {
      const x = r() * N, y = r() * N;
      const grd = g.createLinearGradient(x, y, x, y + 40 + r() * 120);
      grd.addColorStop(0, `rgba(70,62,50,${kind === 'old' ? 0.22 : 0.1})`);
      grd.addColorStop(1, 'rgba(70,62,50,0)');
      g.fillStyle = grd;
      g.fillRect(x, y, 3 + r() * 8, 160);
    }
    for (let f = 0; f < 5; f++) {
      const y0 = f * 3.2 * px;
      // Slab edge band.
      g.fillStyle = kind === 'flats' ? '#f6f3ee' : '#c8b090';
      g.fillRect(0, y0 + 2.9 * px, N, 0.3 * px);
      for (let b = 0; b < 4; b++) {
        const x0 = b * 4 * px;
        const wx = x0 + 0.6 * px, wy = y0 + 0.8 * px, ww = 2.8 * px, wh = 1.7 * px;
        g.fillStyle = r() < 0.12 ? '#6b7d86' : '#26323a';
        g.fillRect(wx, wy, ww, wh);
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
      }
    }
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

// ------------------------------------------------------------------ the map

interface Car {
  lane: number;
  s: number;
  v: number;
}

export class CityMission extends Mission {
  readonly id = 'city';
  private road: { pts: THREE.Vector3[]; len: number[]; total: number; tan: THREE.Vector3[] } = { pts: [], len: [], total: 0, tan: [] };
  private cars: Car[] = [];
  private carMesh?: THREE.InstancedMesh;

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
    this.waterY = 0;
    w.water(this.waterY, 0x2c5865);
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
    for (let z = Z0; z <= Z1; z += 3) this.road.pts.push(new THREE.Vector3(roadX(z), GROUND + 0.06, z));
    this.road.len.push(0);
    for (let i = 1; i < this.road.pts.length; i++) this.road.len.push(this.road.len[i - 1] + this.road.pts[i].distanceTo(this.road.pts[i - 1]));
    this.road.total = this.road.len[this.road.len.length - 1];
    this.road.tan = this.road.pts.map((_, i, a) => a[Math.min(a.length - 1, i + 1)].clone().sub(a[Math.max(0, i - 1)]).normalize());
    this.ribbon(this.road.pts, 17, GROUND + 0.06, this.roadMat());
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
    // Streetlights on the sea side: the necklace.
    {
      const poles: THREE.BufferGeometry[] = [];
      const lamps: THREE.BufferGeometry[] = [];
      for (let s = 8; s < this.road.total; s += 22) {
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
      }
      this.scene.add(new THREE.Mesh(mergeGeometries(poles)!, w.mat(0x4c5258, { metalness: 0.6, roughness: 0.4 })));
      const lm = new THREE.Mesh(mergeGeometries(lamps)!, new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc070, emissiveIntensity: 2.2 }));
      lm.userData.noCast = true;
      this.scene.add(lm);
    }

    // ---- traffic on the sea road: hatchbacks, buses, black-and-yellow taxis
    {
      const body = boxGeo(4.1, 1.0, 1.75, 2).translate(0, 0.75, 0);
      const cab = boxGeo(2.3, 0.75, 1.6, 2).translate(-0.2, 1.6, 0);
      const g = mergeGeometries([body, cab])!;
      const mesh = new THREE.InstancedMesh(g, w.mat(0xffffff, { roughness: 0.35, metalness: 0.35 }), 70);
      const cols = [0xf1c21b, 0xf1c21b, 0xf1c21b, 0xe9e9e6, 0x2a2e33, 0xb3302a, 0x7d8a96, 0x2f5f9a, 0xd8d2c2];
      const c = new THREE.Color();
      for (let i = 0; i < 70; i++) {
        const lane = i % 4;
        this.cars.push({ lane, s: r() * this.road.total, v: (lane < 2 ? 1 : -1) * (11 + r() * 6) });
        mesh.setColorAt(i, c.setHex(cols[Math.floor(r() * cols.length)]));
      }
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.carMesh = mesh;
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

  /** Point and tangent at distance s along the sea road. */
  private along(s: number) {
    const { pts, len, tan, total } = this.road;
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

  private ribbon(path: THREE.Vector3[], width: number, y: number, mat: THREE.Material) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let run = 0;
    path.forEach((p, i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
      if (i > 0) run += Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z);
      pos.push(p.x + (nx * width) / 2, y, p.z + (nz * width) / 2, p.x - (nx * width) / 2, y, p.z - (nz * width) / 2);
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
        .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec4 mk = texture2D(tMarks, vMapUv * vec2(1.0, 0.5)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), mk.a); }');
    };
    const t = m.map!.clone();
    t.repeat.set(3, 3);
    t.needsUpdate = true;
    m.map = t;
    return m;
  }

  private moveCars(dt: number) {
    const mesh = this.carMesh!;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    const off = [-6.2, -2.2, 2.2, 6.2];
    this.cars.forEach((c, i) => {
      c.s += c.v * dt;
      const { p, t } = this.along(c.s);
      const nx = -t.z, nz = t.x;
      p.x += nx * off[c.lane];
      p.z += nz * off[c.lane];
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(-t.z, t.x) + (c.v < 0 ? Math.PI : 0));
      m4.compose(p, q, one);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  // -------------------------------------------------------------- buildings

  private buildings(list: { x: number; z: number; w: number; d: number; y0: number; h: number; kind: Facade | 'deco' }[]) {
    const w = this.world;
    const r = rng(77);
    const by: Record<Facade, THREE.BufferGeometry[]> = { glass: [], flats: [], old: [] };
    const roofs: THREE.BufferGeometry[] = [];
    const tanks: THREE.BufferGeometry[] = [];
    const sheds: THREE.BufferGeometry[] = [];
    for (const b of list) {
      const kind = b.kind === 'deco' ? 'old' : b.kind;
      const sink = 1.5;
      by[kind].push(boxGeo(b.w, b.h + sink, b.d, 16).translate(b.x, b.y0 - sink + (b.h + sink) / 2, b.z));
      const top = b.y0 + b.h;
      roofs.push(boxGeo(b.w + 0.4, 0.5, b.d + 0.4, 4).translate(b.x, top + 0.25, b.z));
      w.addBox(b.x, b.y0 - sink, b.z, b.w, b.h + sink + 0.5, b.d);
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
      glass: new THREE.MeshStandardMaterial({ map: facadeTex('glass', 5), roughness: 0.12, metalness: 0.65 }),
      flats: new THREE.MeshStandardMaterial({ map: facadeTex('flats', 6), roughness: 0.82, metalness: 0 }),
      old: new THREE.MeshStandardMaterial({ map: facadeTex('old', 7), roughness: 0.88, metalness: 0 }),
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
  }

  /** Low sea-facing block, rotated to the curve of the bay, in pastel paint. */
  private decoBlock(x: number, z: number, wd: number, d: number, h: number, ry: number) {
    const w = this.world;
    const tints = [0xfff1d8, 0xf7e3cf, 0xe9eef0, 0xf6dcc8, 0xefe6c8];
    const m4 = new THREE.Matrix4().makeRotationY(ry).setPosition(x, GROUND - 1 + (h + 1) / 2, z);
    const body = boxGeo(d, h + 1, wd, 16).applyMatrix4(m4);
    const mat = (this.decoMat ??= new THREE.MeshStandardMaterial({ map: facadeTex('old', 11), roughness: 0.85 }));
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
    // Patchwork fields: rice green, mustard, ploughed earth.
    const fieldCols = [0x7d9a3a, 0x93a548, 0xc2a548, 0x8a6a46, 0x6e8c34];
    const fields: THREE.BufferGeometry[] = [];
    const colors: number[] = [];
    const c = new THREE.Color();
    for (let i = -4; i <= 4; i++) {
      for (let j = -6; j <= 6; j++) {
        const fx = VX + i * 26 + (r() - 0.5) * 4, fz = VZ + j * 22 + (r() - 0.5) * 4;
        if (Math.hypot(fx - VX, fz - VZ) < 46) continue;
        if (fx > 495) continue;
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

    // Houses: whitewashed and pastel, clay tile roofs, around a lane.
    const walls = [0xf3efe6, 0xe8d8b8, 0xb9d0d6, 0xf0c9a8, 0xd9e4c8];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + r() * 0.2;
      const d = 18 + (i % 3) * 9 + r() * 4;
      w.house(VX + Math.cos(a) * d, VZ + Math.sin(a) * d, 6 + r() * 3, 5 + r() * 2, 3 + r() * 1.5, walls[i % walls.length], 0xa84a2a, i % 4 === 0);
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
    if (this.carMesh) this.moveCars(dt);
  }

  update(dt: number, _c: Controls) {
    this.elapsed += dt;
  }

  objective(): Objective {
    return { title: 'Marine Bay', lines: ['Free flight — no objectives', 'Ride the sea road, then climb between the towers'] };
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
