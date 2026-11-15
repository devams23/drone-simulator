// World building blocks shared by all missions: sky, light, terrain, props, colliders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm2, noise2, sky as skyAsset, tex, type SkyId, type TexId } from './assets';

export interface Box {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface SkyCfg {
  id: SkyId;
  /** Only the compass direction is used; the height comes from the sky photo. */
  sunDir: THREE.Vector3;
  sun: number;
  sunIntensity: number;
  fogNear: number;
  fogFar: number;
  /** Strength of the sky's soft fill light. */
  ambient?: number;
}

export interface Flat {
  x: number;
  z: number;
  r: number;
  h: number;
}

export interface TerrainCfg {
  amp: number;
  base: number;
  seed: number;
  flats: Flat[];
  /** Ground, patches/worn areas, slopes and high ground. */
  tex: [TexId, TexId, TexId];
  /** Water level: banks near it turn to the second texture. */
  shore?: number;
  grass?: { color: number; density: number; size: number };
  /** Colour the main ground layer leans toward (lush grass). */
  tint?: number;
  /** Colour grade over the whole ground (warms a desert, say). */
  grade?: number;
  /** Custom height field replacing the rolling-hills formula (flats still apply). */
  shape?: (x: number, z: number) => number;
  /** Grid resolution of the central terrain mesh (default 220). */
  detail?: number;
  /** Project the rock layer from the side too, so tall cliffs don't smear. */
  cliffs?: boolean;
}

/** Graphics settings shared with the renderer. */
export const gfx = { shadowSize: 2048, shadowRange: 110, grass: 1 };

/** Small deterministic random generator so every run builds the same map. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Box whose texture repeats every `tile` metres whatever its size. */
export function boxGeo(w: number, h: number, d: number, tile = 3) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
  }
  return g;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export class World {
  readonly size = 760;
  /** Playable radius; the drone is pushed back beyond it. */
  readonly bounds = 300;
  boxes: Box[] = [];
  sun: THREE.DirectionalLight;
  sunDir = new THREE.Vector3();
  private mats = new Map<string, THREE.Material>();
  private waters: THREE.Texture[] = [];
  private grass?: { mesh: THREE.InstancedMesh; at: THREE.Vector3; cfg: NonNullable<TerrainCfg['grass']> };
  private clock = performance.now();

  constructor(public scene: THREE.Scene, public sky: SkyCfg, public terrain: TerrainCfg) {
    // --- Sky and light ---
    const s = skyAsset(sky.id);
    const turn = Math.atan2(s.sunDir.z, s.sunDir.x) - Math.atan2(sky.sunDir.z, sky.sunDir.x);
    this.sunDir.copy(s.sunDir).applyAxisAngle(THREE.Object3D.DEFAULT_UP, turn).normalize();
    scene.background = s.bg;
    scene.environment = s.env;
    scene.backgroundRotation.y = turn;
    scene.environmentRotation.y = turn;
    scene.environmentIntensity = sky.ambient ?? 1;
    scene.fog = new THREE.Fog(s.horizon, sky.fogNear, sky.fogFar);

    const sun = (this.sun = new THREE.DirectionalLight(sky.sun, sky.sunIntensity));
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(gfx.shadowSize);
    const c = sun.shadow.camera;
    c.left = c.bottom = -gfx.shadowRange;
    c.right = c.top = gfx.shadowRange;
    c.near = 10;
    c.far = 700;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.12;
    scene.add(sun, sun.target);
    this.follow(new THREE.Vector3());

    this.buildTerrain();
    if (terrain.grass && gfx.grass > 0) this.buildGrass(terrain.grass);
  }

  // ---------------------------------------------------------------- terrain
  /** How much of the second and third ground textures shows at a point. */
  private mixAt(x: number, z: number, h: number): [number, number] {
    const t = this.terrain;
    let b = smooth(0.52, 0.7, fbm2(x * 0.018 + t.seed, z * 0.018 - t.seed));
    for (const f of t.flats) b = Math.max(b, 1 - smooth(f.r * 0.85, f.r * 1.15, Math.hypot(x - f.x, z - f.z)));
    if (t.shore !== undefined) b = Math.max(b, 1 - smooth(t.shore + 0.3, t.shore + 1.6, h));
    const e = 2;
    const slope = Math.hypot(this.heightAt(x + e, z) - this.heightAt(x - e, z), this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    const high = (h - t.base) / Math.max(1, t.amp * 1.5);
    const c = Math.max(smooth(0.2, 0.36, slope), smooth(0.8, 1.0, high + (noise2(x * 0.03, z * 0.03) - 0.5) * 0.3));
    return [b, c];
  }

  private buildTerrain() {
    const t = this.terrain;
    const sets = t.tex.map((id) => tex(id));
    const macro = tex('aerial_grass_rock').map;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        dA: { value: sets[0].map }, dB: { value: sets[1].map }, dC: { value: sets[2].map },
        nA: { value: sets[0].normalMap }, nB: { value: sets[1].normalMap }, nC: { value: sets[2].normalMap },
        tMacro: { value: macro },
        uTint: { value: new THREE.Color(t.tint ?? 0xffffff) },
        uGrade: { value: new THREE.Color(t.grade ?? 0xffffff) },
        uTintAmt: { value: t.tint === undefined ? 0 : 0.62 },
      });
      if (t.cliffs) sh.fragmentShader = '#define TRI\n' + sh.fragmentShader;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aMix;\nvarying vec2 vMix;\nvarying vec3 vTPos;\nvarying vec3 vTNor;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMix = aMix; vTPos = position; vTNor = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          uniform sampler2D dA, dB, dC, nA, nB, nC, tMacro;
          uniform vec3 uTint, uGrade; uniform float uTintAmt;
          varying vec2 vMix; varying vec3 vTPos; varying vec3 vTNor;
          vec3 tCol; vec3 tNor; vec3 tCW = vec3(0.0);
          void terrainSample() {
            vec2 u1 = vTPos.xz / 4.5;
            vec2 u2 = vec2(vTPos.x * 0.92 + vTPos.z * 0.39, vTPos.z * 0.92 - vTPos.x * 0.39) / 29.0;
            float f = smoothstep(18.0, 95.0, distance(vTPos, cameraPosition));
            vec3 a = mix(texture2D(dA, u1).rgb, texture2D(dA, u2).rgb, f);
            vec3 b = mix(texture2D(dB, u1).rgb, texture2D(dB, u2).rgb, f);
            vec3 c = mix(texture2D(dC, u1 * 0.6).rgb, texture2D(dC, u2).rgb, f);
            vec3 an = mix(texture2D(nA, u1).xyz, texture2D(nA, u2).xyz, f);
            vec3 bn = mix(texture2D(nB, u1).xyz, texture2D(nB, u2).xyz, f);
            vec3 cn = mix(texture2D(nC, u1 * 0.6).xyz, texture2D(nC, u2).xyz, f);
            #ifdef TRI
              vec3 tw = pow(abs(normalize(vTNor)), vec3(4.0));
              tw /= (tw.x + tw.y + tw.z);
              float sN = 1.0 / 7.5, sF = 1.0 / 29.0;
              vec3 cNear = texture2D(dC, vTPos.xz * sN).rgb * tw.y + texture2D(dC, vTPos.xy * sN).rgb * tw.z + texture2D(dC, vTPos.zy * sN).rgb * tw.x;
              vec3 cFar = texture2D(dC, vTPos.xz * sF).rgb * tw.y + texture2D(dC, vTPos.xy * sF).rgb * tw.z + texture2D(dC, vTPos.zy * sF).rgb * tw.x;
              c = mix(cNear, cFar, f);
              vec3 qxz = texture2D(nC, vTPos.xz * sN).xyz * 2.0 - 1.0;
              vec3 qxy = texture2D(nC, vTPos.xy * sN).xyz * 2.0 - 1.0;
              vec3 qzy = texture2D(nC, vTPos.zy * sN).xyz * 2.0 - 1.0;
              tCW = vec3(qxz.x, 0.0, -qxz.y) * tw.y + vec3(qxy.x, qxy.y, 0.0) * tw.z + vec3(0.0, qzy.y, qzy.x) * tw.x;
              cn = vec3(0.5, 0.5, 1.0);
            #endif
            a = mix(a, uTint * (0.35 + dot(a, vec3(0.3333)) * 2.6), uTintAmt);
            float la = dot(a, vec3(0.6));
            float wb = smoothstep(0.38, 0.62, vMix.x + (la - 0.25) * 0.5);
            float wc = smoothstep(0.38, 0.62, vMix.y + (dot(c, vec3(0.5)) - 0.25) * 0.5);
            tCol = mix(mix(a, b, wb), c, wc);
            tNor = mix(mix(an, bn, wb), cn, wc) * 2.0 - 1.0;
            tCW *= wc;
            float m = dot(texture2D(tMacro, vTPos.xz / 240.0).rgb, vec3(0.34));
            float m2 = dot(texture2D(tMacro, vTPos.zx / 71.0).rgb, vec3(0.34));
            tCol *= (0.62 + m * 1.6 * 0.55 + m2 * 1.6 * 0.3) * uGrade;
          }`,
        )
        .replace('#include <map_fragment>', 'terrainSample();\ndiffuseColor.rgb *= tCol;')
        .replace(
          '#include <normal_fragment_maps>',
          '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(normalize(normalize(vTNor) + vec3(tNor.x, 0.0, -tNor.y) * 0.85 + tCW * 0.9), 0.0)).xyz);',
        );
    };

    const build = (size: number, seg: number, hole: number, drop: number) => {
      const geo = new THREE.PlaneGeometry(size, size, seg, seg);
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      const mix = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const h = this.heightAt(x, z);
        p.setY(i, h - drop);
        mix.set(this.mixAt(x, z, h), i * 2);
      }
      geo.setAttribute('aMix', new THREE.BufferAttribute(mix, 2));
      if (hole > 0) {
        // Drop the triangles the detailed centre mesh already covers.
        const idx = geo.index!;
        const keep: number[] = [];
        for (let i = 0; i < idx.count; i += 3) {
          let inside = true;
          for (let k = 0; k < 3; k++) {
            const v = idx.getX(i + k);
            if (Math.abs(p.getX(v)) > hole || Math.abs(p.getZ(v)) > hole) inside = false;
          }
          if (!inside) keep.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
        }
        geo.setIndex(keep);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      m.userData.noCast = true;
      this.scene.add(m);
    };
    build(this.size, t.detail ?? 220, 0, 0);
    build(3600, 144, this.size / 2 - 26, 0.5);
  }

  private buildGrass(cfg: NonNullable<TerrainCfg['grass']>) {
    const map = canvasTex(256, 256, (g) => {
      for (let i = 0; i < 110; i++) {
        const x0 = 128 + (Math.random() - 0.5) * 150;
        const lean = (Math.random() - 0.5) * 110;
        const top = 10 + Math.random() * 150;
        const grad = g.createLinearGradient(0, 256, 0, top);
        const dry = Math.random() < 0.22;
        const v = 140 + Math.random() * 80;
        grad.addColorStop(0, `rgb(${v * 0.5},${v * 0.56},${v * 0.4})`);
        grad.addColorStop(0.55, dry ? `rgb(${v * 0.95},${v * 0.86},${v * 0.6})` : `rgb(${v * 0.78},${v * 0.86},${v * 0.62})`);
        grad.addColorStop(1, dry ? `rgb(${v * 1.1},${v},${v * 0.72})` : `rgb(${v * 0.95},${v},${v * 0.78})`);
        g.strokeStyle = grad;
        g.lineWidth = 1.4 + Math.random() * 2.4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x0, 256);
        g.quadraticCurveTo(x0 + lean * 0.3, 256 - (256 - top) * 0.6, x0 + lean, top);
        g.stroke();
      }
    });
    const quad = () => {
      const q = new THREE.PlaneGeometry(1, 0.6);
      q.translate(0, 0.3, 0);
      return q;
    };
    const geo = mergeGeometries([quad(), quad().rotateY(Math.PI / 3), quad().rotateY((2 * Math.PI) / 3)])!;
    const n = geo.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const base = new THREE.Color(cfg.color);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    base.setHSL(hsl.h, hsl.s * 0.7, Math.min(0.75, hsl.l * 1.3));
    const mat = new THREE.MeshStandardMaterial({ map, color: base, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.round(9000 * gfx.grass));
    const tint = new THREE.Color();
    for (let i = 0; i < mesh.count; i++) {
      const k = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const a = Math.abs(k);
      tint.setRGB(0.86 + a * 0.3, 0.88 + a * 0.26, 0.74 + a * 0.26);
      mesh.setColorAt(i, tint);
    }
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.userData.noCast = true;
    mesh.count = 0;
    this.scene.add(mesh);
    this.grass = { mesh, at: new THREE.Vector3(1e9, 0, 0), cfg };
  }

  private placeGrass(pos: THREE.Vector3) {
    const g = this.grass!;
    g.at.copy(pos);
    const R = 40;
    const cell = 0.82 / Math.sqrt(g.cfg.density * Math.max(0.3, gfx.grass));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const i0 = Math.floor((pos.x - R) / cell);
    const j0 = Math.floor((pos.z - R) / cell);
    const span = Math.ceil((R * 2) / cell);
    const max = g.mesh.instanceMatrix.count;
    let n = 0;
    for (let i = i0; i <= i0 + span && n < max; i++) {
      for (let j = j0; j <= j0 + span && n < max; j++) {
        const hsh = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
        const r1 = hsh - Math.floor(hsh);
        if (r1 > 0.72) continue;
        const r2 = (r1 * 57.3) % 1;
        const x = (i + r2) * cell;
        const z = (j + ((r1 * 13.7) % 1)) * cell;
        const d = Math.hypot(x - pos.x, z - pos.z);
        if (d > R) continue;
        const h = this.heightAt(x, z);
        const [b, c] = this.mixAt(x, z, h);
        if (b > 0.45 || c > 0.45) continue;
        const size = g.cfg.size * (0.5 + r2 * 0.75) * (1 - smooth(R * 0.7, R, d));
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r1 * 40);
        m.compose(v.set(x, h - 0.03, z), q, sc.set(size * 1.3, size, size * 1.3));
        g.mesh.setMatrixAt(n++, m);
      }
    }
    g.mesh.count = n;
    g.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Keep the shadow area, grass and water ripples centred on the viewer. */
  follow(pos: THREE.Vector3) {
    const step = (gfx.shadowRange * 2) / gfx.shadowSize * 8;
    const x = Math.round(pos.x / step) * step;
    const z = Math.round(pos.z / step) * step;
    const y = this.heightAt(x, z);
    this.sun.target.position.set(x, y, z);
    this.sun.position.set(x, y, z).addScaledVector(this.sunDir, 320);
    if (this.grass && Math.hypot(pos.x - this.grass.at.x, pos.z - this.grass.at.z) > 5) this.placeGrass(pos);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.clock) / 1000);
    this.clock = now;
    for (const w of this.waters) {
      w.offset.x += dt * 0.012;
      w.offset.y += dt * 0.02;
    }
  }

  heightAt(x: number, z: number) {
    const t = this.terrain;
    const s = t.seed;
    if (t.shape) return this.flatten(x, z, t.shape(x, z));
    let h =
      t.base +
      t.amp *
        (0.75 +
          0.55 * Math.sin(x * 0.011 + s) * Math.cos(z * 0.013 - s * 1.7) +
          0.3 * Math.sin(x * 0.027 + z * 0.019 + s * 2.3) +
          0.12 * Math.sin(x * 0.071 + s) * Math.sin(z * 0.063 - s));
    return this.flatten(x, z, h);
  }

  private flatten(x: number, z: number, h: number) {
    for (const f of this.terrain.flats) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r * 1.7) h = f.h + (h - f.h) * smooth(f.r, f.r * 1.7, d);
    }
    return h;
  }

  // -------------------------------------------------------------- materials
  /** Plain painted surface. */
  mat(color: number, opts: THREE.MeshStandardMaterialParameters = {}) {
    const key = color + JSON.stringify(opts);
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.05, ...opts });
      this.mats.set(key, m);
    }
    return m as THREE.MeshStandardMaterial;
  }

  /** Photo-textured surface, tinted. Use with `boxGeo` or metre-scaled UVs. */
  pbr(id: TexId, color = 0xffffff, roughness = 0.85, opts: THREE.MeshStandardMaterialParameters = {}) {
    const key = id + color + roughness + JSON.stringify(opts);
    let m = this.mats.get(key);
    if (!m) {
      const t = tex(id);
      m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, color, roughness, metalness: 0, ...opts });
      this.mats.set(key, m);
    }
    return m as THREE.MeshStandardMaterial;
  }

  addBox(cx: number, y0: number, cz: number, w: number, h: number, d: number) {
    const b = {
      min: new THREE.Vector3(cx - w / 2, y0, cz - d / 2),
      max: new THREE.Vector3(cx + w / 2, y0 + h, cz + d / 2),
    };
    this.boxes.push(b);
    return b;
  }

  /** Solid block with a collider. */
  block(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number, parent: THREE.Object3D = this.scene, id: TexId = 'concrete_wall_004') {
    const m = new THREE.Mesh(boxGeo(w, h, d), this.pbr(id, color));
    m.position.set(cx, y0 + h / 2, cz);
    parent.add(m);
    this.addBox(cx, y0, cz, w, h, d);
    return m;
  }

  /**
   * Push a sphere out of all colliders. Returns true on contact and writes the
   * contact normal to `n`.
   */
  resolve(p: THREE.Vector3, rad: number, n: THREE.Vector3) {
    let hit = false;
    for (const b of this.boxes) {
      const cx = Math.max(b.min.x, Math.min(b.max.x, p.x));
      const cy = Math.max(b.min.y, Math.min(b.max.y, p.y));
      const cz = Math.max(b.min.z, Math.min(b.max.z, p.z));
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rad * rad) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        n.set(dx / d, dy / d, dz / d);
        p.addScaledVector(n, rad - d);
      } else {
        // Centre is inside the box: leave by the nearest face.
        const faces: [number, number, number, number][] = [
          [p.x - b.min.x, -1, 0, 0], [b.max.x - p.x, 1, 0, 0],
          [p.y - b.min.y, 0, -1, 0], [b.max.y - p.y, 0, 1, 0],
          [p.z - b.min.z, 0, 0, -1], [b.max.z - p.z, 0, 0, 1],
        ];
        faces.sort((a, c) => a[0] - c[0]);
        const f = faces[0];
        n.set(f[1], f[2], f[3]);
        p.addScaledVector(n, f[0] + rad);
      }
    }
    return hit;
  }

  inside(p: THREE.Vector3) {
    for (const b of this.boxes) {
      if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ props
  /** House with a tiled gable roof or a flat concrete one. Not rotated, so its collider is exact. */
  house(x: number, z: number, w: number, d: number, h: number, wall: number, roof: number, flat = false, baseY?: number) {
    const y0 = baseY ?? this.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y0, z);
    const plaster = this.pbr('white_rough_plaster', wall, 0.9);
    const body = new THREE.Mesh(boxGeo(w, h + 2, d, 3.2), plaster);
    body.position.y = h / 2 - 1;
    g.add(body);
    let top = h;
    if (flat) {
      const slab = new THREE.Mesh(boxGeo(w + 0.5, 0.4, d + 0.5, 3), this.pbr('concrete_floor_02', 0xd6d6d2));
      slab.position.y = h + 0.2;
      g.add(slab);
      top = h + 0.4;
      // Low parapet in the roof colour.
      const trim = this.mat(roof, { roughness: 0.6 });
      for (const [px, pz, pw, pd] of [[0, d / 2 + 0.17, w + 0.5, 0.16], [0, -d / 2 - 0.17, w + 0.5, 0.16], [w / 2 + 0.17, 0, 0.16, d + 0.5], [-w / 2 - 0.17, 0, 0.16, d + 0.5]] as const) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.5, pd), trim);
        p.position.set(px, h + 0.45, pz);
        g.add(p);
      }
    } else {
      const alongX = w >= d;
      const len = alongX ? w : d;
      const span = alongX ? d : w;
      const rh = span * 0.45;
      const ov = 0.55;
      const s = span / 2 + ov;
      const eave = -(rh * ov) / (span / 2);
      const L = len / 2 + ov;
      const run = Math.hypot(s, rh - eave);
      const tile = 2.4;
      const pos: number[] = [];
      const uv: number[] = [];
      for (const side of [-1, 1]) {
        const a = [-L, eave, side * s], b = [L, eave, side * s], c = [L, rh, 0], e = [-L, rh, 0];
        const quad = side > 0 ? [a, b, c, a, c, e] : [b, a, e, b, e, c];
        for (const v of quad) {
          pos.push(v[0], v[1], v[2]);
          uv.push((v[0] + L) / tile, v[1] === rh ? run / tile : 0);
        }
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      rg.computeVertexNormals();
      const tiles = this.pbr('clay_roof_tiles_02', new THREE.Color(roof).lerp(new THREE.Color(0xffffff), 0.35).getHex(), 0.8, { side: THREE.DoubleSide });
      const roofMesh = new THREE.Mesh(rg, tiles);
      const gp: number[] = [];
      const gu: number[] = [];
      for (const side of [-1, 1]) {
        const tri = side > 0 ? [[len / 2, 0, span / 2], [len / 2, 0, -span / 2], [len / 2, rh, 0]] : [[-len / 2, 0, -span / 2], [-len / 2, 0, span / 2], [-len / 2, rh, 0]];
        for (const v of tri) {
          gp.push(v[0], v[1], v[2]);
          gu.push(v[2] / 3.2, v[1] / 3.2);
        }
      }
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
      gg.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2));
      gg.computeVertexNormals();
      const top3 = new THREE.Group();
      top3.add(roofMesh, new THREE.Mesh(gg, plaster));
      top3.position.y = h;
      if (!alongX) top3.rotation.y = Math.PI / 2;
      g.add(top3);
      // Chimney.
      const ch = new THREE.Mesh(boxGeo(0.7, rh * 0.9, 0.7, 1.5), this.pbr('brick_wall_10', 0xffffff));
      ch.position.set(alongX ? len * 0.22 : span * 0.2, h + rh * 0.7, alongX ? span * 0.2 : len * 0.22);
      g.add(ch);
      top = h + rh * 0.55;
    }

    // Windows on every floor of all four walls, plus a front door.
    const frames: THREE.BufferGeometry[] = [];
    const panes: THREE.BufferGeometry[] = [];
    const m4 = new THREE.Matrix4();
    const floors = Math.max(1, Math.floor(h / 3));
    const addWin = (px: number, py: number, pz: number, ry: number) => {
      m4.makeRotationY(ry).setPosition(px, py, pz);
      frames.push(new THREE.BoxGeometry(1.25, 1.45, 0.14).applyMatrix4(m4));
      panes.push(new THREE.PlaneGeometry(1.0, 1.2).translate(0, 0, 0.08).applyMatrix4(m4));
    };
    for (let f = 0; f < floors; f++) {
      const y = Math.min(h - 1.2, 1.7 + f * 3);
      const nx = Math.max(2, Math.floor(w / 3.2));
      for (let i = 0; i < nx; i++) {
        const px = (i - (nx - 1) / 2) * (w / nx);
        if (!(f === 0 && Math.abs(px) < 1.3)) addWin(px, y, d / 2, 0);
        addWin(px, y, -d / 2, Math.PI);
      }
      const nz = Math.max(1, Math.floor(d / 3.6));
      for (let i = 0; i < nz; i++) {
        const pz = (i - (nz - 1) / 2) * (d / nz);
        addWin(w / 2, y, pz, Math.PI / 2);
        addWin(-w / 2, y, pz, -Math.PI / 2);
      }
    }
    g.add(new THREE.Mesh(mergeGeometries(frames)!, this.mat(0xf4f1ea, { roughness: 0.6 })));
    const glass = new THREE.Mesh(mergeGeometries(panes)!, this.mat(0x16222e, { roughness: 0.04, metalness: 0.92 }));
    glass.userData.noCast = true;
    g.add(glass);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.1, 0.16), this.mat(0x4a2f1c, { roughness: 0.55 }));
    door.position.set(0, 1.05, d / 2);
    g.add(door);
    this.scene.add(g);
    const box = this.addBox(x, y0 - 1, z, w, top + 1, d);
    return { group: g, x, z, w, d, top: y0 + top, box, flat };
  }

  /** Concrete landing pad with painted markings. */
  pad(x: number, z: number, color = '#ffd23f') {
    const map = canvasTex(512, 512, (g) => {
      g.fillStyle = '#8b8d8c';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.07})`;
        g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 6, 2 + Math.random() * 6);
      }
      g.strokeStyle = color;
      g.lineWidth = 22;
      g.beginPath();
      g.arc(256, 256, 206, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#f2f2ee';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(256, 256, 236, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#f2f2ee';
      g.font = 'bold 290px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('H', 256, 272);
      // Tyre and scuff marks.
      g.strokeStyle = 'rgba(20,20,20,0.12)';
      g.lineWidth = 9;
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.moveTo(Math.random() * 512, Math.random() * 512);
        g.lineTo(Math.random() * 512, Math.random() * 512);
        g.stroke();
      }
    });
    const y = this.heightAt(x, z);
    const top = new THREE.MeshStandardMaterial({ map, normalMap: tex('concrete_floor_02').normalMap, roughness: 0.85 });
    const side = this.mat(0x6f716f, { roughness: 0.9 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.15, 0.5, 48), [side, top, side]);
    m.position.set(x, y - 0.17, z);
    m.userData.noCast = true;
    this.scene.add(m);
    // Corner lamps.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8), this.mat(0x2a2d31));
      post.position.set(x + Math.cos(a) * 6.4, y + 0.25, z + Math.sin(a) * 6.4);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5 }));
      b.position.copy(post.position).y += 0.3;
      this.scene.add(post, b);
    }
    return new THREE.Vector3(x, y, z);
  }

  private foliageTex(kind: 'pine' | 'leaf') {
    const t = canvasTex(256, 256, (g) => {
      const R = Math.random;
      g.lineCap = 'round';
      if (kind === 'pine') {
        // One bough: base at the bottom edge, tip at the top.
        const grey = (v: number) => `rgb(${v * 0.86},${v},${v * 0.8})`;
        for (let y = 250; y > 8; y -= 3.4) {
          const up = (256 - y) / 256;
          const w = 118 * Math.min(1, up / 0.14) * Math.pow(1 - up, 0.8);
          for (const sgn of [-1, 1]) {
            const v = 105 + R() * 130;
            g.strokeStyle = grey(v);
            g.lineWidth = 3.2 + R() * 2.6;
            g.beginPath();
            g.moveTo(128, y);
            const ex = 128 + sgn * w * (0.8 + R() * 0.25);
            const ey = y - w * (0.45 + R() * 0.2);
            g.quadraticCurveTo(128 + sgn * w * 0.5, y - w * 0.1, ex, ey);
            g.stroke();
            // Needles fringing the twig.
            g.lineWidth = 1.6;
            for (let k = 0; k < 5; k++) {
              const f = 0.3 + R() * 0.7;
              const px = 128 + (ex - 128) * f;
              const py = y + (ey - y) * f;
              g.strokeStyle = grey(120 + R() * 135);
              g.beginPath();
              g.moveTo(px, py);
              g.lineTo(px + (R() - 0.5) * 16, py - 4 - R() * 12);
              g.stroke();
            }
          }
        }
        g.strokeStyle = 'rgb(120,105,90)';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(128, 256);
        g.lineTo(128, 60);
        g.stroke();
      } else {
        // A spray of leaves, darker underneath and brighter on top.
        for (let i = 0; i < 300; i++) {
          const a = R() * 6.283;
          const d = Math.sqrt(R()) * 112;
          const v = 95 + (i / 300) * 110 + R() * 50;
          g.fillStyle = `rgb(${v * 0.9},${v},${v * 0.74})`;
          g.beginPath();
          g.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 9 + R() * 8, 4.5 + R() * 4, R() * 3.14, 0, 6.283);
          g.fill();
        }
        g.fillStyle = 'rgb(150,165,125)';
        g.beginPath();
        g.arc(128, 128, 9, 0, 6.283);
        g.fill();
      }
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  /**
   * Trees as a few instanced meshes. `mix` is the share of broadleaf trees and
   * `autumn` the share of those in autumn colours. Each gets a slim collider.
   */
  pines(spots: { x: number; z: number; s: number }[], canopy = 0x4f8a3a, mix = 0, autumn = 0) {
    const r = rng(spots.length * 13 + 5);
    const pineSpots = spots.filter(() => r() >= mix);
    const leafSpots = spots.filter((s) => !pineSpots.includes(s));
    const bark = this.pbr('pine_bark', 0xb8a898, 0.95);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const base = new THREE.Color(canopy);
    const col = new THREE.Color();
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const UP = V(0, 1, 0);

    /** A foliage card with one soft normal and a shade baked in. */
    const card = (w: number, h: number, xf: THREE.Matrix4, nor: THREE.Vector3, shade: number, fromBase = false) => {
      const g = new THREE.PlaneGeometry(w, h);
      if (fromBase) g.translate(0, h / 2, 0);
      g.applyMatrix4(xf);
      const n = g.attributes.normal;
      for (let i = 0; i < n.count; i++) n.setXYZ(i, nor.x, nor.y, nor.z);
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n.count * 3).fill(shade), 3));
      return g;
    };
    /** Add back faces that keep the same normals, so cards shade alike from both sides. */
    const twoSided = (g: THREE.BufferGeometry) => {
      const a = Array.from(g.index!.array);
      const back: number[] = [];
      for (let i = 0; i < a.length; i += 3) back.push(a[i], a[i + 2], a[i + 1]);
      g.setIndex(a.concat(back));
      return g;
    };

    const place = (list: typeof spots, trunkG: THREE.BufferGeometry, leafG: THREE.BufferGeometry, kind: 'pine' | 'leaf') => {
      if (!list.length) return;
      const leafM = new THREE.MeshStandardMaterial({ map: this.foliageTex(kind), alphaTest: 0.38, vertexColors: true, roughness: 0.88, metalness: 0 });
      const trunk = new THREE.InstancedMesh(trunkG, bark, list.length);
      const leaves = new THREE.InstancedMesh(leafG, leafM, list.length);
      list.forEach((t, i) => {
        const y = this.heightAt(t.x, t.z);
        q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.08, r() * 6.28, (r() - 0.5) * 0.08));
        const sy = t.s * (0.9 + r() * 0.3);
        m.compose(V(t.x, y - 0.3, t.z), q, V(t.s, sy, t.s));
        trunk.setMatrixAt(i, m);
        leaves.setMatrixAt(i, m);
        if (kind === 'pine') col.copy(base).multiplyScalar(0.62).offsetHSL(0.03 + (r() - 0.5) * 0.03, -0.08, (r() - 0.5) * 0.05);
        else if (r() < autumn) col.setHSL(0.05 + r() * 0.08, 0.45, 0.3 + r() * 0.1);
        else col.copy(base).offsetHSL((r() - 0.5) * 0.06, 0, (r() - 0.5) * 0.1);
        leaves.setColorAt(i, col);
        this.addBox(t.x, y, t.z, 1.6 * t.s, 8.6 * t.s, 1.6 * t.s);
      });
      this.scene.add(trunk, leaves);
    };

    // Conifer: tapering trunk with whorls of drooping boughs.
    const pr = rng(7);
    const pineTrunk = new THREE.CylinderGeometry(0.07, 0.34, 9, 7).translate(0, 4.5, 0);
    const boughs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      const f = i / 11;
      const y = 1.5 + f * 6.9;
      const len = 3.1 * (1 - f * 0.84);
      const n = f > 0.7 ? 5 : 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 6.283 + i * 0.9 + pr() * 0.5;
        const droop = 0.2 + (1 - f) * 0.32 + pr() * 0.18;
        const dir = V(Math.cos(a) * Math.cos(droop), -Math.sin(droop), Math.sin(a) * Math.cos(droop));
        const side = V(-Math.sin(a), 0, Math.cos(a));
        const fin = new THREE.Vector3().crossVectors(side, dir);
        const nor = V(Math.cos(a) * 0.6, 0.8, Math.sin(a) * 0.6).normalize();
        const shade = (0.5 + f * 0.5) * (0.85 + pr() * 0.3);
        const l = len * (0.85 + pr() * 0.3);
        boughs.push(card(l * 0.62, l, new THREE.Matrix4().makeBasis(side, dir, fin).setPosition(0, y, 0), nor, shade, true));
        boughs.push(card(l * 0.5, l, new THREE.Matrix4().makeBasis(fin, dir, side).setPosition(0, y, 0), nor, shade * 0.9, true));
      }
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      boughs.push(card(1.5, 2.4, new THREE.Matrix4().makeRotationY(a).setPosition(0, 7.6, 0), V(Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.4).normalize(), 1, true));
    }
    place(pineSpots, pineTrunk, twoSided(mergeGeometries(boughs)!), 'pine');

    // Broadleaf: trunk, a dark core and a crown of leaf sprays.
    const lr = rng(91);
    const leafTrunk = new THREE.CylinderGeometry(0.14, 0.36, 5, 7).translate(0, 2.5, 0);
    const crown: THREE.BufferGeometry[] = [];
    const centre = V(0, 5.6, 0);
    // Limbs reaching out to the clumps.
    const limbs: THREE.Vector3[] = [];
    for (let i = 0; i < 14; i++) {
      const a = lr() * Math.PI * 2;
      const up = lr();
      const rr = (1 - up * 0.55) * (1.2 + lr() * 1.7);
      limbs.push(V(Math.cos(a) * rr * 1.1, 4.3 + up * 3.1, Math.sin(a) * rr));
    }
    for (const c of limbs) {
      const R = 1.0 + lr() * 0.75;
      // Core that stops the sky showing through.
      const core = new THREE.IcosahedronGeometry(R * 0.42, 1).toNonIndexed();
      core.translate(c.x, c.y, c.z);
      const cp = core.attributes.position;
      const cn = core.attributes.normal;
      const cuv = core.attributes.uv;
      const tmp = new THREE.Vector3();
      for (let k = 0; k < cp.count; k++) {
        tmp.fromBufferAttribute(cp, k).sub(centre).normalize();
        cn.setXYZ(k, tmp.x, tmp.y, tmp.z);
        cuv.setXY(k, 0.5, 0.5);
      }
      core.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cp.count * 3).fill(0.34), 3));
      core.setIndex(Array.from({ length: cp.count }, (_, k) => k));
      crown.push(core);
      for (let k = 0; k < 13; k++) {
        const d = V(lr() - 0.5, lr() * 0.9 - 0.3, lr() - 0.5).normalize();
        const pos = c.clone().addScaledVector(d, R * (0.45 + lr() * 0.6));
        const face = d.clone().add(V((lr() - 0.5) * 0.9, (lr() - 0.5) * 0.9, (lr() - 0.5) * 0.9)).normalize();
        const xf = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), face).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), lr() * 6.283)));
        xf.setPosition(pos);
        const nor = pos.clone().sub(centre).normalize().addScaledVector(UP, 0.4).normalize();
        const shade = (0.5 + 0.5 * Math.max(0, Math.min(1, (pos.y - 3.6) / 4))) * (0.85 + lr() * 0.25);
        const sz = 1.6 + lr() * 1.0;
        crown.push(card(sz, sz, xf, nor, shade));
      }
    }
    place(leafSpots, leafTrunk, twoSided(mergeGeometries(crown)!), 'leaf');
  }

  /** Scattered boulders (decoration only). */
  rocks(spots: { x: number; z: number; s: number }[], color: number, id: TexId = 'rock_face') {
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const j = 0.7 + fbm2(x * 1.4 + y, z * 1.4 - y) * 0.75;
      p.setXYZ(k, x * j, y * j * 0.8, z * j);
    }
    geo.computeVertexNormals();
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 3, uv.getY(k) * 2);
    const mesh = new THREE.InstancedMesh(geo, this.pbr(id, color, 0.92), spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    spots.forEach((t, i) => {
      e.set(t.x * 1.3, t.z * 0.7, t.s * 5);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(t.x, this.heightAt(t.x, t.z) + t.s * 0.25, t.z), q, new THREE.Vector3(t.s * 1.4, t.s, t.s * 1.2));
      mesh.setMatrixAt(i, m);
    });
    this.scene.add(mesh);
  }

  /** Flat-topped sandstone butte with a collider. Returns the mesh. */
  mesa(x: number, z: number, rad: number, h: number, color = 0xffffff) {
    const y = this.heightAt(x, z) - 3;
    const geo = new THREE.CylinderGeometry(rad * 0.78, rad * 1.05, h, 40, 8);
    const p = geo.attributes.position;
    const uv = geo.attributes.uv;
    const side = 41 * 9;
    const around = Math.max(1, Math.round((Math.PI * 2 * rad) / 14));
    for (let k = 0; k < p.count; k++) {
      const px = p.getX(k), py = p.getY(k), pz = p.getZ(k);
      const ledge = Math.floor((py / h + 0.5) * 4) * 0.035;
      const j = 0.86 + fbm2(px * 0.16 + py * 0.05 + x, pz * 0.16 + z) * 0.3 - ledge;
      p.setXYZ(k, px * j, py, pz * j);
      if (k < side) uv.setXY(k, uv.getX(k) * around, (uv.getY(k) * h) / 14);
      else uv.setXY(k, (px * j) / 12, (pz * j) / 12);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.pbr('red_sandstone_wall', color, 0.95));
    mesh.position.set(x, y + h / 2, z);
    this.scene.add(mesh);
    this.addBox(x, y, z, rad * 1.5, h + 0.6, rad * 1.5);
    return mesh;
  }

  /** Rippling water that mirrors the sky. */
  water(y: number, color: number, radius?: number, x = 0, z = 0) {
    const size = radius ? radius * 2 : 3600;
    const geo = radius ? new THREE.CircleGeometry(radius, 64) : new THREE.PlaneGeometry(size, size);
    const m = new THREE.Mesh(geo, this.waterMat(color, size / 26));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.userData.noCast = true;
    this.scene.add(m);
    return m;
  }

  /** A strip of water following a path of (x, z) points at height y. */
  waterRibbon(path: [number, number][], width: number, y: number, color: number) {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let run = 0;
    path.forEach(([x, z], i) => {
      const [ax, az] = path[Math.max(0, i - 1)];
      const [bx, bz] = path[Math.min(path.length - 1, i + 1)];
      const l = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / l, nz = (bx - ax) / l;
      if (i > 0) run += Math.hypot(x - path[i - 1][0], z - path[i - 1][1]);
      pos.push(x + nx * width / 2, y, z + nz * width / 2, x - nx * width / 2, y, z - nz * width / 2);
      uv.push(0, run / width, 1, run / width);
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) {
      const a = g.index!.array as Uint16Array;
      for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
      g.computeVertexNormals();
    }
    const m = new THREE.Mesh(g, this.waterMat(color, 1, width / 26));
    m.receiveShadow = true;
    m.userData.noCast = true;
    this.scene.add(m);
    return m;
  }

  private waterMat(color: number, repeat: number, repeatY = repeat) {
    const N = 256;
    const normal = canvasTex(N, N, (g) => {
      const img = g.createImageData(N, N);
      const r = rng(77);
      const octaves = [6, 13, 27, 53].map((G) => ({ G, v: Float32Array.from({ length: G * G }, () => r()) }));
      const hgt = (u: number, v: number) => {
        let s = 0;
        let amp = 1;
        for (const { G, v: tab } of octaves) {
          const x = (((u % 1) + 1) % 1) * G;
          const y = (((v % 1) + 1) % 1) * G;
          const ix = Math.floor(x), iy = Math.floor(y);
          const fx = x - ix, fy = y - iy;
          const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
          const at = (a: number, b: number) => tab[(a % G) * G + (b % G)];
          const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
          const bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
          s += (top + (bot - top) * sy) * amp;
          amp *= 0.55;
        }
        return s * 0.16;
      };
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const u = i / N, v = j / N, e = 1 / N;
          const dx = (hgt(u + e, v) - hgt(u - e, v)) * 0.7;
          const dy = (hgt(u, v + e) - hgt(u, v - e)) * 0.7;
          const l = Math.hypot(dx, dy, 1);
          const o = (j * N + i) * 4;
          img.data[o] = (-dx / l * 0.5 + 0.5) * 255;
          img.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255;
          img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
          img.data[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    });
    normal.colorSpace = THREE.NoColorSpace;
    normal.repeat.set(repeat, repeatY);
    this.waters.push(normal);
    return new THREE.MeshStandardMaterial({ color, roughness: 0.06, metalness: 0.55, normalMap: normal, normalScale: new THREE.Vector2(0.3, 0.3), transparent: true, opacity: 0.93 });
  }
}

/** Turn on shadows for everything solid in a freshly built scene. */
export function enableShadows(scene: THREE.Scene) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    const solid = !mat.transparent && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    if (solid) m.receiveShadow = true;
    if (solid && !m.userData.noCast) m.castShadow = true;
  });
}

/** Free GPU memory held by a scene we are about to drop. Shared photo textures are kept. */
export function disposeScene(scene: THREE.Scene) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      const map = (x as THREE.MeshStandardMaterial).map;
      if (map && (map as THREE.CanvasTexture).isCanvasTexture) map.dispose();
      x.dispose();
    }
  });
}
