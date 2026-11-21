// Glacier Pass: a U-shaped valley carved by ice. A glacier tongue breaks into a
// serac icefall at the north end, a frozen lake fills the south, a rock horn
// stands in the middle and a natural ice arch spans the valley floor.
import * as THREE from 'three';
import { fbm2, noise2 } from '../assets';
import type { Controls } from '../input';
import { World, boxGeo, canvasTex, rng } from '../world';
import { Mission, type Objective, type Payload } from './base';

// ------------------------------------------------------------------ the shape

export const gx = (z: number) => 36 * Math.sin(z * 0.0062 + 0.4) + 10 * Math.sin(z * 0.017 - 1);
const halfW = (z: number) => 92 + 18 * Math.sin(z * 0.011 + 0.5);
export const LAKE = { x: gx(170), z: 170, rx: 80, rz: 58 };
export const HORN = { x: gx(-10) + 62, z: -10, r: 44, h: 76 };
export const ARCH = { x: gx(40) - 34, z: 40, span: 13 };
/** Where the glacier ice starts (it rises north of this line). */
export const SNOUT = -90;
/** A winding lane kept clear through the icefall (it leaves the snout by the centre breach). */
export const lane = (z: number) => gx(z) + 22 * Math.sin((z - SNOUT + 3) * 0.035);
export const PAD = { x: gx(70) + 58, z: 70 };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function floor(x: number, z: number) {
  let f = 4 + 2.2 * (noise2(x * 0.012, z * 0.012) - 0.5) + (noise2(x * 0.05, z * 0.05) - 0.5);
  // The glacier tongue: climbs north, with crevasse ripples across it.
  const gl = Math.max(0, SNOUT - z);
  if (gl > 0) {
    const across = smooth(1.05, 0.55, Math.abs(x - gx(z)) / halfW(z));
    f += Math.min(gl, 360) * 0.15 * (0.55 + 0.45 * across);
    f += 1.3 * Math.sin(z * 0.3 + x * 0.05) * smooth(10, 60, gl) * (0.5 + 0.5 * Math.sin(x * 0.07)) * across;
  }
  // The frozen lake is dead flat.
  const dl = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
  f *= smooth(0.94, 1.32, dl);
  return f;
}

export function iceHeight(x: number, z: number) {
  const d = Math.abs(x - gx(z));
  const T = Math.max(0, d - halfW(z), (z - 330) * 1.2, -480 - z);
  let h = floor(x, z);
  if (T > 0) {
    const rise = 1 - Math.exp(-Math.pow(T / 165, 1.6));
    const ridge = 1 - Math.abs(noise2(x * 0.0065 + 3, z * 0.0065 - 2) * 2 - 1);
    const crag = fbm2(x * 0.02, z * 0.02) - 0.5;
    h += rise * (135 + 125 * ridge) + rise * 34 * crag;
  }
  // The horn: a lone rock peak standing out of the valley floor.
  const dh = Math.hypot(x - HORN.x, (z - HORN.z) / 1.6);
  if (dh < HORN.r) {
    const k = 1 - dh / HORN.r;
    h += HORN.h * Math.pow(k, 1.3) * (0.55 + 0.9 * fbm2(x * 0.045, z * 0.045)) + 30 * k * (fbm2(x * 0.11 + 9, z * 0.11) - 0.5);
  }
  return h;
}

// ------------------------------------------------------------------ the map

export class IceMission extends Mission {
  readonly id = 'ice';
  private snow?: { pts: THREE.Points; pos: Float32Array; drift: Float32Array };

  constructor(...a: ConstructorParameters<typeof Mission>) {
    super(...a);
    const PH = iceHeight(PAD.x, PAD.z);
    const w = (this.world = new World(
      this.scene,
      { id: 'day', sun: 0xfff4ea, sunDir: new THREE.Vector3(0.55, 0.38, -0.55), sunIntensity: 2.6, fogNear: 160, fogFar: 1300, ambient: 1.5 },
      {
        amp: 500, base: 0, seed: 7, shape: iceHeight, detail: 360, cliffs: true,
        tex: ['snow_02', 'river_small_rocks', 'rock_face'], shore: 0.4, patch: 0.74, grade: 0xeef3fb,
        rockSlope: [0.95, 1.5], rockTint: 0xbab6b0,
        flats: [{ x: PAD.x, z: PAD.z, r: 10, h: PH }],
      },
    ));
    this.pad = w.pad(PAD.x, PAD.z);
    this.spawn.copy(this.pad).y += 0.7;
    this.scene.add(new THREE.HemisphereLight(0xe4eef8, 0xa8b4c2, 1.1));
    this.spawnYaw = Math.atan2(-(gx(40) - PAD.x), -(40 - PAD.z)) + 0.35;
    this.orbit.center.set(gx(60), 18, 60);
    this.orbit.radius = 150;
    this.orbit.height = 60;

    const r = rng(907);
    const iceMat = w.pbr('snow_02', 0x9fd2ea, 0.28, { emissive: 0x0a2c3e, emissiveIntensity: 0.6 });

    // ---- frozen lake: glossy ice with frost and cracks
    {
      const N = 1024;
      const map = canvasTex(N, N, (g) => {
        g.fillStyle = '#c4dde8';
        g.fillRect(0, 0, N, N);
        for (let i = 0; i < 260; i++) {
          const x = r() * N, y = r() * N, rad = 20 + r() * 120;
          const gr = g.createRadialGradient(x, y, 0, x, y, rad);
          const frost = r() < 0.5;
          gr.addColorStop(0, frost ? 'rgba(240,248,252,0.35)' : 'rgba(90,140,170,0.25)');
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
        g.lineCap = 'round';
        for (let i = 0; i < 70; i++) {
          let x = r() * N, y = r() * N, a = r() * Math.PI * 2;
          g.strokeStyle = `rgba(250,253,255,${0.25 + r() * 0.45})`;
          g.lineWidth = 0.6 + r() * 1.6;
          g.beginPath();
          g.moveTo(x, y);
          for (let k = 0; k < 14; k++) {
            a += (r() - 0.5) * 1.1;
            x += Math.cos(a) * (8 + r() * 22);
            y += Math.sin(a) * (8 + r() * 22);
            g.lineTo(x, y);
          }
          g.stroke();
        }
      });
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(2, 1.5);
      const sheet = new THREE.Mesh(
        new THREE.CircleGeometry(1, 96),
        new THREE.MeshPhysicalMaterial({ map, color: 0xd2ecf6, roughness: 0.14, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06 }),
      );
      sheet.rotation.x = -Math.PI / 2;
      sheet.scale.set(LAKE.rx * 0.99, LAKE.rz * 0.99, 1);
      sheet.position.set(LAKE.x, 0.05, LAKE.z);
      sheet.receiveShadow = true;
      sheet.userData.noCast = true;
      this.scene.add(sheet);
    }

    // ---- seracs: the icefall where the glacier breaks up, and a broken wall at the snout
    const blocks: { x: number; z: number; w: number; h: number; d: number; ry: number; y: number }[] = [];
    const addSerac = (x: number, z: number, wd: number, h: number) => {
      const d = wd * (0.6 + r() * 0.6);
      const y = iceHeight(x, z) - 1.5;
      blocks.push({ x, z, w: wd, h: h + 1.5, d, ry: (r() - 0.5) * 0.7, y });
      w.addBox(x, y, z, wd * 1.05, h + 1.5, d * 1.05);
    };
    for (let i = 0; i < 900 && blocks.length < 80; i++) {
      const z = SNOUT - 12 - r() * 150;
      const x = gx(z) + (r() - 0.5) * 1.3 * halfW(z);
      if (blocks.some((b) => Math.hypot(b.x - x, b.z - z) < 11) || Math.abs(x - lane(z)) < 9) continue;
      addSerac(x, z, 4 + r() * 6, 5 + r() * r() * 14);
    }
    // Snout wall with three breaches to fly through.
    for (let x = gx(SNOUT) - halfW(SNOUT) * 0.8; x < gx(SNOUT) + halfW(SNOUT) * 0.8; x += 5.5 + r() * 2) {
      const off = x - gx(SNOUT);
      if (Math.abs(off) < 7 || Math.abs(off - 45) < 7 || Math.abs(off + 48) < 7) continue;
      addSerac(x, SNOUT - 3 + (r() - 0.5) * 3, 5 + r() * 2.5, 9 + r() * 8);
    }
    {
      // Shards: tapered, leaning ice prisms with jagged tops, white where snow sits.
      const shard = (seed: number) => {
        const sr = rng(seed);
        const g = new THREE.CylinderGeometry(0.42, 0.62, 1, 6, 4).translate(0, 0.5, 0);
        const p = g.attributes.position;
        const jit = new Map<string, number>();
        const col: number[] = [];
        const blue = new THREE.Color(0x6fb3d6), white = new THREE.Color(0xf4f9fc), c = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
          let j = jit.get(key);
          if (j === undefined) jit.set(key, (j = (sr() - 0.5) * 0.18));
          const lift = y > 0.99 ? (j > 0 ? 0.35 : -0.1) * (0.5 + Math.abs(x)) : 0;
          p.setXYZ(i, x * (1 + j), y + lift + j * 0.3 * y, z * (1 - j));
          c.copy(blue).lerp(white, Math.min(1, Math.max(0, (y - 0.7) / 0.3)) * 0.9);
          col.push(c.r, c.g, c.b);
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.computeVertexNormals();
        return g;
      };
      const mat = w.pbr('snow_02', 0xe6f4fb, 0.22, { vertexColors: true, emissive: 0x0c3448, emissiveIntensity: 0.35, flatShading: true });
      const kinds = [shard(11), shard(23), shard(37)];
      const meshes = kinds.map((g) => new THREE.InstancedMesh(g, mat, blocks.length));
      const counts = [0, 0, 0];
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      blocks.forEach((b, i) => {
        e.set((r() - 0.5) * 0.25, b.ry * 4, (r() - 0.5) * 0.25);
        q.setFromEuler(e);
        m4.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
        const k = i % 3;
        meshes[k].setMatrixAt(counts[k]++, m4);
      });
      meshes.forEach((m, k) => {
        m.count = counts[k];
        m.castShadow = m.receiveShadow = true;
        this.scene.add(m);
      });
    }

    // ---- the ice arch: a half ring across the valley, legs on the floor
    {
      const R = ARCH.span;
      const tube = 3.2;
      const g = new THREE.TorusGeometry(R, tube, 18, 48, Math.PI);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 2);
      const arch = new THREE.Mesh(g, iceMat);
      const y0 = iceHeight(ARCH.x, ARCH.z) - 1;
      arch.position.set(ARCH.x, y0, ARCH.z);
      arch.castShadow = arch.receiveShadow = true;
      this.scene.add(arch);
      const cap = new THREE.Mesh(new THREE.TorusGeometry(R, tube * 0.55, 10, 48, Math.PI), w.pbr('snow_02', 0xffffff, 0.9));
      cap.position.set(ARCH.x, y0 + tube * 0.62, ARCH.z);
      cap.scale.set(1, 1, 1.5);
      this.scene.add(cap);
      // Colliders: boxes along the arc.
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * Math.PI;
        const cxp = ARCH.x + Math.cos(a) * R;
        const cyp = y0 + Math.sin(a) * R;
        w.addBox(cxp, cyp - tube, ARCH.z, tube * 1.7, tube * 2, tube * 1.9);
      }
    }

    // ---- polar research station by the pad
    const huts: [number, number, number, number][] = [
      [PAD.x + 20, PAD.z - 9, 9, 6],
      [PAD.x + 19, PAD.z + 10, 7, 5.5],
      [PAD.x + 33, PAD.z + 1, 6, 9],
    ];
    for (const [x, z, wd, d] of huts) w.house(x, z, wd, d, 3.4, 0xc9452f, 0x2f3438, true, PH);
    {
      const mx = PAD.x + 30, mz = PAD.z - 14;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 16, 8).translate(0, 8, 0), w.mat(0xe6e8ea, { metalness: 0.6, roughness: 0.35 }));
      mast.position.set(mx, PH, mz);
      this.scene.add(mast);
      for (let k = 0; k < 4; k++) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.2, 8), w.mat(0xd23a2a, { roughness: 0.5 }));
        band.position.set(mx, PH + 2 + k * 4, mz);
        this.scene.add(band);
      }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      lamp.position.set(mx, PH + 16.2, mz);
      this.scene.add(lamp);
      w.addBox(mx, PH, mz, 0.7, 16.4, 0.7);
      // Fuel drums and a sled by the huts.
      for (let k = 0; k < 5; k++) {
        const dr = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.95, 12), w.mat(k % 2 ? 0x2f5f9a : 0xd8a02a, { roughness: 0.45, metalness: 0.4 }));
        dr.position.set(PAD.x + 12 + (k % 3) * 0.9, PH + 0.48, PAD.z - 1 + Math.floor(k / 3) * 0.9);
        this.scene.add(dr);
      }
    }

    // ---- trees: sparse frosted spruce on the lower, southern valley
    const slope = (x: number, z: number) =>
      Math.hypot(iceHeight(x + 1.5, z) - iceHeight(x - 1.5, z), iceHeight(x, z + 1.5) - iceHeight(x, z - 1.5)) / 3;
    const nearPad = (x: number, z: number, d: number) => Math.hypot(x - PAD.x, z - PAD.z) < d;
    const onLake = (x: number, z: number) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1.15;
    const trees: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 12000 && trees.length < 520; i++) {
      const z = -40 + r() * 400;
      const x = gx(z) + (r() - 0.5) * 2.6 * halfW(z);
      const h = iceHeight(x, z);
      if (h > 26 + z * 0.08 || slope(x, z) > 0.5 || onLake(x, z) || nearPad(x, z, 45)) continue;
      if (Math.hypot(x - ARCH.x, z - ARCH.z) < 30 || Math.hypot(x - HORN.x, z - HORN.z) < HORN.r * 0.8) continue;
      // A clear runway through the arch, from the lake shore to the moraine.
      if (Math.abs(x - ARCH.x) < 10 && z > ARCH.z - 60 && z < ARCH.z + 100) continue;
      if (noise2(x * 0.02 + 9, z * 0.02) < 0.5) continue;
      trees.push({ x, z, s: 0.6 + r() * 0.9 });
    }
    w.pines(trees, 0x6f857a, 0, 0);

    // ---- moraine boulders along the valley sides and around the lake
    const rocks: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 8000 && rocks.length < 240; i++) {
      const z = -460 + r() * 780;
      const side = r() < 0.5 ? -1 : 1;
      const x = gx(z) + side * halfW(z) * (0.75 + r() * 0.35);
      if (onLake(x, z) || nearPad(x, z, 20)) continue;
      rocks.push({ x, z, s: 0.5 + r() * r() * 3.2 });
    }
    for (let i = 0; i < 300 && rocks.length < 300; i++) {
      const a = r() * Math.PI * 2;
      const d = 14 + r() * 50;
      const x = PAD.x + Math.cos(a) * d, z = PAD.z + Math.sin(a) * d;
      if (onLake(x, z) || Math.hypot(x - PAD.x - 25, z - PAD.z) < 16) continue;
      rocks.push({ x, z, s: 0.25 + r() * 0.8 });
    }
    w.rocks(rocks, 0x9aa2ad, 'snow_02');

    // ---- falling snow that follows the viewer
    {
      const N = 2200;
      const pos = new Float32Array(N * 3);
      const drift = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 90;
        pos[i * 3 + 1] = Math.random() * 50;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
        drift[i] = Math.random() * Math.PI * 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const dot = canvasTex(32, 32, (g) => {
        const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 32, 32);
      });
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dot, size: 0.16, transparent: true, opacity: 0.85, depthWrite: false, color: 0xffffff }));
      pts.frustumCulled = false;
      pts.userData.noCast = true;
      this.scene.add(pts);
      this.snow = { pts, pos, drift };
    }
  }

  ambient(dt: number, viewer: THREE.Vector3) {
    const s = this.snow;
    if (!s) return;
    const p = s.pos;
    const wrap = (v: number, c: number, span: number, lo: number) => c + lo + ((((v - c - lo) % span) + span) % span);
    for (let i = 0; i < s.drift.length; i++) {
      s.drift[i] += dt * 0.7;
      // Flakes live in a 90 m box around the viewer, 50 m tall.
      p[i * 3] = wrap(p[i * 3] + (Math.sin(s.drift[i]) * 0.5 + 0.6) * dt, viewer.x, 90, -45);
      p[i * 3 + 1] = wrap(p[i * 3 + 1] - 1.1 * dt, viewer.y, 50, -20);
      p[i * 3 + 2] = wrap(p[i * 3 + 2] + Math.cos(s.drift[i] * 0.8) * 0.4 * dt, viewer.z, 90, -45);
    }
    s.pts.geometry.attributes.position.needsUpdate = true;
  }

  update(dt: number, _c: Controls) {
    this.elapsed += dt;
  }

  objective(): Objective {
    return { title: 'Glacier Pass', lines: ['Free flight — no objectives', 'Thread the ice arch, then climb the icefall'] };
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
