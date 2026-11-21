// Basalt Gorge: a free-roam canyon in the spirit of Iceland's moss-walled gorges.
// A glacial river winds between terraced basalt walls, a plateau stream pours
// over the headwall, thin falls spill from both rims and a side gorge ends in a
// plunge pool. Nothing to complete: it is there to be flown.
import * as THREE from 'three';
import { noise2 } from '../assets';
import type { Controls } from '../input';
import { World, rng } from '../world';
import { Mission, type Objective, type Payload } from './base';

// ------------------------------------------------------------------ the shape

const ZH = -215; // head of the gorge (north end)
const cx = (z: number) => 52 * Math.sin(z * 0.0105 + 0.6) + 20 * Math.sin(z * 0.027 - 1.1);
const dcx = (z: number) => 0.546 * Math.cos(z * 0.0105 + 0.6) + 0.54 * Math.cos(z * 0.027 - 1.1);
const halfW = (z: number) => 18 + 7 * Math.sin(z * 0.019 + 2) + 3 * Math.sin(z * 0.047);
/** Plateau stream that feeds the headwall fall. */
const ux = (z: number) => cx(ZH) + 14 * Math.sin((ZH - z) * 0.018);
/** Side gorge from the east. */
const TX = 235;
const tz = (x: number) => -20 + 30 * Math.sin(x * 0.015);
const TW = 9;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function plateau(x: number, z: number) {
  const r = Math.hypot(x, z);
  let p = 64 + 4 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017) + 2.5 * Math.sin(x * 0.053 - z * 0.041) + 3 * (noise2(x * 0.03, z * 0.03) - 0.5);
  // Mountains ring the far horizon.
  p += smooth(330, 560, r) * (90 + 60 * Math.sin(Math.atan2(z, x) * 3 + 0.7) + 40 * noise2(x * 0.006, z * 0.006));
  // The stream channel across the plateau, north of the headwall.
  if (z < ZH + 10) {
    const dd = Math.abs(x - ux(z));
    if (dd < 45) p = Math.max(p, 60 + (p - 60) * smooth(20, 45, dd));
    p = 52 + (p - 52) * smooth(2.5, 13, dd);
  }
  return p;
}

/** Cross-section: river bed, banks, then a terraced, ragged basalt wall up to the plateau. */
function profile(d: number, W: number, P: number, bank: number, bed: number, ragged: number) {
  d += ragged;
  const rv = 0.42 * W;
  if (d < W) return bed + (bank - bed) * smooth(rv * 0.6, W, d);
  const run = 11 + ragged * 0.8;
  const t = Math.min(1, (d - W) / run);
  const s = t * 4;
  const fl = Math.floor(s);
  const terrace = (fl + smooth(0.7, 1, s - fl)) / 4;
  const f = 0.55 * Math.pow(t, 0.75) + 0.45 * Math.min(1, terrace);
  return bank + (P - bank) * f;
}

export function canyonHeight(x: number, z: number) {
  const P = plateau(x, z);
  const ragged = (noise2(x * 0.06, z * 0.06) - 0.5) * 7 + (noise2(x * 0.19, z * 0.21) - 0.5) * 2;
  const bank = 2.4 + 1.1 * Math.sin(z * 0.05) + 0.5 * Math.sin(x * 0.13 + z * 0.07);
  let h: number;
  if (z < ZH) {
    const W = halfW(ZH);
    h = profile(Math.hypot(x - cx(ZH), z - ZH), W, P, bank, -1.6, ragged);
  } else {
    const k = dcx(z);
    h = profile(Math.abs(x - cx(z)) / Math.sqrt(1 + k * k), halfW(z), P, bank, -1.6, ragged);
  }
  // Side gorge: higher floor that climbs to a plunge pool at its head.
  if (z > ZH && x > cx(z)) {
    const dT = x < TX ? Math.abs(z - tz(x)) : Math.hypot(x - TX, z - tz(TX));
    if (dT < 60) {
      let floor = 2.5 + 6.5 * smooth(70, TX, x);
      const dp = Math.hypot(x - TX, z - tz(TX));
      if (dp < 10) floor -= 3.2 * (1 - dp / 10) ** 2;
      h = Math.min(h, profile(dT, TW, P, floor + 1.2, floor, ragged * 0.6));
    }
  }
  return h;
}

// ------------------------------------------------------------------ waterfalls

const FALL_VS = /* glsl */ `
attribute float aDown;
varying vec2 vUv;
varying float vDown;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vDown = aDown;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const NOISE = /* glsl */ `
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}`;

const FALL_FS = /* glsl */ `
uniform float uTime;
uniform float uWidth;
uniform float uDrop;
varying vec2 vUv;
varying float vDown;
#include <fog_pars_fragment>
${NOISE}
void main() {
  float x = vUv.x * uWidth;
  float a = vn(vec2(x * 1.6, vDown * 0.18 - uTime * 2.2));
  float b = vn(vec2(x * 4.0 + 7.0, vDown * 0.35 - uTime * 4.5));
  float c = vn(vec2(x * 9.0, vDown * 0.9 - uTime * 9.0));
  float n = a * 0.5 + b * 0.32 + c * 0.18;
  float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
  float ragged = smoothstep(0.25, 0.6, n + edge * 0.45);
  float top = smoothstep(0.0, 1.2, vDown);
  float bottom = 1.0 - smoothstep(uDrop - 3.0, uDrop, vDown);
  float alpha = ragged * edge * top * mix(1.0, 0.55, bottom) * (0.55 + 0.4 * n);
  vec3 col = mix(vec3(0.62, 0.71, 0.74), vec3(0.97, 0.99, 1.0), smoothstep(0.35, 0.8, n));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const FOAM_FS = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
#include <fog_pars_fragment>
${NOISE}
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float ang = atan(p.y, p.x);
  float n = vn(vec2(ang * 5.0, r * 6.0 - uTime * 1.4)) * 0.6 + vn(vec2(ang * 13.0 + 3.0, r * 14.0 - uTime * 2.6)) * 0.4;
  float alpha = smoothstep(1.0, 0.25, r) * smoothstep(0.3, 0.75, n + (1.0 - r) * 0.35) * 0.85;
  gl_FragColor = vec4(vec3(0.93, 0.97, 0.98), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const FOAM_VS = /* glsl */ `
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

interface Fall {
  base: THREE.Vector3;
  width: number;
  rate: number;
}

// ------------------------------------------------------------------ the map

export class CanyonMission extends Mission {
  readonly id = 'canyon';
  private falls: Fall[] = [];
  private shaders: THREE.ShaderMaterial[] = [];
  private mistAcc: number[] = [];
  private time = 0;

  constructor(...a: ConstructorParameters<typeof Mission>) {
    super(...a);
    // Landing pad on the east rim, set back from the edge, looking into the gorge.
    const PZ = 110;
    const PX = cx(PZ) + halfW(PZ) + 40;
    const PH = canyonHeight(PX, PZ);
    const w = (this.world = new World(
      this.scene,
      { id: 'cloud', sun: 0xfff1e0, sunDir: new THREE.Vector3(-0.45, 0.5, -0.7), sunIntensity: 2.3, fogNear: 70, fogFar: 1000, ambient: 1.15 },
      {
        amp: 60, base: 0, seed: 1, shape: canyonHeight, detail: 460, cliffs: true,
        tex: ['leafy_grass', 'river_small_rocks', 'mossy_rock'], shore: 1.6, tint: 0x6f8640, grade: 0xe6edf0,
        grass: { color: 0x93a64c, density: 1, size: 0.62 }, patch: 0.64,
        flats: [{ x: PX, z: PZ, r: 9, h: PH }],
      },
    ));
    this.waterY = 0.8;
    w.water(this.waterY, 0x1f4446);
    this.pad = w.pad(PX, PZ);
    this.spawn.copy(this.pad).y += 0.7;
    this.spawnYaw = Math.atan2(-(cx(PZ) - PX), 0);
    this.orbit.center.set(cx(0), 20, 0);
    this.orbit.radius = 140;
    this.orbit.height = 70;

    const r = rng(1234);
    const slope = (x: number, z: number) =>
      Math.hypot(canyonHeight(x + 1.5, z) - canyonHeight(x - 1.5, z), canyonHeight(x, z + 1.5) - canyonHeight(x, z - 1.5)) / 3;

    // ---- water
    const stream: [number, number][] = [];
    for (let z = -560; z <= ZH - halfW(ZH) - 4; z += 4) stream.push([ux(z), z]);
    w.waterRibbon(stream, 9, 53.6, 0x1f4446);
    const poolY = canyonHeight(TX, tz(TX)) + 2.1;
    w.water(poolY, 0x1f4446, 9.5, TX, tz(TX));

    // ---- waterfalls
    const lipZ = stream[stream.length - 1][1];
    this.fall(new THREE.Vector3(ux(lipZ), 53.8, lipZ), new THREE.Vector2(0, 1), 9, 14);
    for (const [z, side, wd] of [[-140, -1, 4], [-60, 1, 6], [30, -1, 3.5], [112, 1, 5], [190, -1, 7]] as const) {
      this.rimFall(z, side, wd);
    }
    // Side-gorge head: spring-fed fall into the plunge pool.
    {
      const z0 = tz(TX);
      let x = TX;
      while (canyonHeight(x, z0) < plateau(x, z0) - 1.5 && x < TX + 60) x += 0.5;
      this.fall(new THREE.Vector3(x + 1, canyonHeight(x + 1, z0) + 0.4, z0), new THREE.Vector2(-1, 0), 5, 5, poolY);
    }

    // ---- basalt columns along the wall feet, plus free-standing stacks
    const cols: { x: number; z: number; r: number; h: number; y: number }[] = [];
    const crowns: typeof cols = [];
    for (let z = ZH + 6; z < 300; z += 2.6) {
      for (const side of [-1, 1]) {
        if (r() < 0.25) continue;
        const k = dcx(z);
        const nx = 1 / Math.sqrt(1 + k * k);
        const d = halfW(z) - 1 + r() * 2.5;
        const x0 = cx(z) + side * d * nx;
        const z0 = z - side * d * k * nx;
        const n = 2 + Math.floor(r() * 4);
        for (let i = 0; i < n; i++) {
          const x = x0 + (r() - 0.5) * 3.2;
          const zz = z0 + (r() - 0.5) * 3.2;
          const y = canyonHeight(x, zz);
          if (y < 0.5 || y > 4.5) continue;
          cols.push({ x, z: zz, r: 0.7 + r() * 0.7, h: 4 + r() * r() * 14, y: y - 1.5 });
        }
      }
    }
    for (const [z, side, h] of [[-150, 1, 34], [-35, -1, 26], [75, 1, 38], [165, -1, 22], [250, 1, 30]] as const) {
      const W = halfW(z);
      const x0 = cx(z) + side * W * 0.62;
      const y0 = canyonHeight(x0, z) - 1;
      let rad = 0;
      for (let i = 0; i < 16; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 3.6;
        const cr = 0.9 + r() * 0.6;
        const k = 0.75 + r() * 0.25;
        cols.push({ x: x0 + Math.cos(a) * d, z: z + Math.sin(a) * d, r: cr, h: d < 2.4 ? h : h * (1 - d / 6) * k, y: y0 });
        rad = Math.max(rad, d + cr);
      }
      // Flat crown: one broad column in the middle makes a landing ledge.
      crowns.push({ x: x0, z, r: 3, h, y: y0 });
      w.addBox(x0, y0, z, rad * 1.6, h * 0.75, rad * 1.6);
    }
    const colGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1).translate(0, 0.5, 0);
    const uv = colGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 3);
    const colMesh = new THREE.InstancedMesh(colGeo, w.pbr('mossy_rock', 0x7a7d82, 0.9), cols.length + crowns.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    cols.forEach((c, i) => {
      e.set((r() - 0.5) * 0.05, r() * Math.PI, (r() - 0.5) * 0.05);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(c.r, c.h + 1, c.r));
      colMesh.setMatrixAt(i, m4);
      if (c.h > 5) w.addBox(c.x, c.y, c.z, c.r * 1.7, c.h + 1, c.r * 1.7);
    });
    crowns.forEach((c, i) => {
      q.setFromEuler(e.set(0, i * 0.7, 0));
      m4.compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(c.r, c.h + 1, c.r));
      colMesh.setMatrixAt(cols.length + i, m4);
      w.addBox(c.x, c.y, c.z, c.r * 1.7, c.h + 1, c.r * 1.7);
    });
    colMesh.castShadow = colMesh.receiveShadow = true;
    this.scene.add(colMesh);

    // ---- trees: groves on the plateau, birch-and-pine thickets on the banks
    const nearPad = (x: number, z: number, d: number) => Math.hypot(x - PX, z - PZ) < d;
    const nearFall = (x: number, z: number) => this.falls.some((f) => Math.hypot(x - f.base.x, z - f.base.z) < f.width + 6);
    const trees: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 9000 && trees.length < 420; i++) {
      const x = (r() - 0.5) * 640;
      const z = (r() - 0.5) * 640;
      const h = canyonHeight(x, z);
      if (h < 56 || Math.hypot(x, z) > 330 || nearPad(x, z, 14) || slope(x, z) > 0.45) continue;
      if (noise2(x * 0.018 + 4, z * 0.018) < 0.52) continue;
      trees.push({ x, z, s: 0.75 + r() * 0.8 });
    }
    for (let i = 0; i < 9000 && trees.length < 640; i++) {
      const z = ZH + r() * (300 - ZH);
      const x = cx(z) + (r() - 0.5) * 2.2 * halfW(z);
      const h = canyonHeight(x, z);
      if (h < 1.8 || h > 6 || slope(x, z) > 0.5 || nearFall(x, z)) continue;
      trees.push({ x, z, s: 0.55 + r() * 0.6 });
    }
    w.pines(trees, 0x587438, 0.4, 0.15);

    // ---- boulders in the river and on the banks, outcrops on the plateau
    const rocks: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 6000 && rocks.length < 150; i++) {
      const z = ZH + r() * (300 - ZH);
      const x = cx(z) + (r() - 0.5) * 2 * halfW(z);
      if (canyonHeight(x, z) > 7) continue;
      rocks.push({ x, z, s: 0.5 + r() * r() * 2.6 });
    }
    for (let i = 0; i < 4000 && rocks.length < 220; i++) {
      const x = (r() - 0.5) * 600;
      const z = (r() - 0.5) * 600;
      if (canyonHeight(x, z) < 56 || nearPad(x, z, 18)) continue;
      rocks.push({ x, z, s: 0.8 + r() * 2.2 });
    }
    // Near-ground detail around the pad: boulders and scattered stones in the grass,
    // so the first seconds of every flight have something close to read speed against.
    for (let i = 0; i < 400 && rocks.length < 300; i++) {
      const a = r() * Math.PI * 2;
      const d = 10 + r() * 60;
      const x = PX + Math.cos(a) * d;
      const z = PZ + Math.sin(a) * d;
      if (canyonHeight(x, z) < 56 || slope(x, z) > 0.4) continue;
      rocks.push({ x, z, s: d < 25 ? 0.25 + r() * 0.5 : 0.35 + r() * r() * 1.6 });
    }
    // Small trees and saplings closing in on the pad.
    const near: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 300 && near.length < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = 15 + r() * 30;
      const x = PX + Math.cos(a) * d;
      const z = PZ + Math.sin(a) * d;
      if (canyonHeight(x, z) < 56 || slope(x, z) > 0.4) continue;
      near.push({ x, z, s: 0.4 + r() * 0.5 });
    }
    w.pines(near, 0x587438, 0.5, 0.1);
    w.rocks(rocks, 0xb4b6a8, 'mossy_rock');
  }

  /** A fall from the rim on one side of the gorge at station z. */
  private rimFall(z: number, side: number, width: number) {
    const x0 = cx(z);
    let x = x0 + side * halfW(z);
    while (canyonHeight(x, z) < plateau(x, z) - 1 && Math.abs(x - x0) < 90) x += side * 0.5;
    this.fall(new THREE.Vector3(x, canyonHeight(x, z) + 0.3, z), new THREE.Vector2(-side, 0), width, 2 + width * 0.6);
  }

  /** Builds a sheet of falling water from a lip, hugging the wall on the way down. */
  private fall(lip: THREE.Vector3, inward: THREE.Vector2, width: number, mist: number, poolY?: number) {
    const h = canyonHeight;
    const across = new THREE.Vector2(-inward.y, inward.x);
    const cols = Math.max(4, Math.ceil(width / 0.8));
    const pos: number[] = [];
    const uvs: number[] = [];
    const down: number[] = [];
    const idx: number[] = [];
    let rows = 0;
    let base = new THREE.Vector3();
    const columns: THREE.Vector3[][] = [];
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const sx = lip.x + across.x * (u - 0.5) * width;
      const sz = lip.z + across.y * (u - 0.5) * width;
      const pts: THREE.Vector3[] = [];
      let out = 0;
      for (let y = lip.y, i = 0; i < 120; i++, y -= 1.2) {
        // Push inward until the wall is below this height, then keep clear of it.
        while (out < 80 && h(sx + inward.x * out, sz + inward.y * out) > y - 0.2) out += 0.25;
        const jet = Math.max(0, 1.6 - (lip.y - y) * 0.12); // water shoots off the lip
        const o = out + 0.7 + jet;
        const px = sx + inward.x * o;
        const pz = sz + inward.y * o;
        const ground = Math.max(h(px, pz), poolY ?? this.waterY!);
        pts.push(new THREE.Vector3(px, Math.max(y, ground), pz));
        if (y <= ground) break;
      }
      columns.push(pts);
      rows = Math.max(rows, pts.length);
    }
    for (const pts of columns) while (pts.length < rows) pts.push(pts[pts.length - 1].clone());
    for (let c = 0; c <= cols; c++) {
      for (let i = 0; i < rows; i++) {
        const p = columns[c][i];
        pos.push(p.x, p.y, p.z);
        uvs.push(c / cols, i / rows);
        down.push(lip.y - p.y);
        if (c > 0 && i > 0) {
          const a = (c - 1) * rows + i - 1, b = c * rows + i - 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const mid = columns[cols >> 1];
    base = mid[mid.length - 1].clone();
    const drop = lip.y - base.y;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('aDown', new THREE.Float32BufferAttribute(down, 1));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uWidth: { value: width }, uDrop: { value: drop } }]),
      vertexShader: FALL_VS,
      fragmentShader: FALL_FS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    const sheet = new THREE.Mesh(g, mat);
    sheet.renderOrder = 1;
    sheet.userData.noCast = true;
    this.scene.add(sheet);
    this.shaders.push(mat);

    // Churning foam where it lands.
    const foamMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
      vertexShader: FOAM_VS,
      fragmentShader: FOAM_FS,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const foam = new THREE.Mesh(new THREE.CircleGeometry(width * 1.1 + 2, 40), foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(base.x, Math.max(base.y, poolY ?? this.waterY!) + 0.06, base.z);
    foam.renderOrder = 1;
    foam.userData.noCast = true;
    this.scene.add(foam);
    this.shaders.push(foamMat);

    this.falls.push({ base: foam.position.clone(), width, rate: mist });
    this.mistAcc.push(0);
  }

  ambient(dt: number, viewer: THREE.Vector3) {
    this.time += dt;
    for (const s of this.shaders) s.uniforms.uTime.value = this.time;
    const smoke = this.fx.smoke;
    const white = this.fx.colors.steam;
    const r = Math.random;
    this.falls.forEach((f, i) => {
      if (viewer.distanceTo(f.base) > 380) return;
      this.mistAcc[i] += f.rate * dt;
      while (this.mistAcc[i] >= 1) {
        this.mistAcc[i] -= 1;
        const size = 3 + f.width * 0.5;
        smoke.emit(
          f.base.x + (r() - 0.5) * f.width, f.base.y + 0.5, f.base.z + (r() - 0.5) * f.width,
          (r() - 0.5) * 3, 1.2 + r() * 2, (r() - 0.5) * 3,
          { life: 3 + r() * 1.5, size, sizeEnd: size * 3, color: white, alpha: 0.16, drag: 0.6 },
        );
      }
    });
  }

  update(dt: number, _c: Controls) {
    this.elapsed += dt;
  }

  objective(): Objective {
    return { title: 'Basalt Gorge', lines: ['Free flight — no objectives', 'Follow the river to the headwall falls'] };
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
