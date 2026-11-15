// World building blocks shared by all missions: sky, terrain, props, colliders.
import * as THREE from 'three';

export interface Box {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface SkyCfg {
  top: number;
  horizon: number;
  sun: number;
  sunDir: THREE.Vector3;
  fogNear: number;
  fogFar: number;
  hemiGround: number;
  sunIntensity: number;
  hemiIntensity: number;
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
  low: number;
  high: number;
  /** Colour jitter strength. */
  noise: number;
}

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

export class World {
  readonly size = 760;
  /** Playable radius; the drone is pushed back beyond it. */
  readonly bounds = 300;
  boxes: Box[] = [];
  private mats = new Map<string, THREE.Material>();
  private dome: THREE.Mesh;

  constructor(public scene: THREE.Scene, public sky: SkyCfg, public terrain: TerrainCfg) {
    // --- Sky and light ---
    const horizon = new THREE.Color(sky.horizon);
    scene.background = horizon;
    scene.fog = new THREE.Fog(horizon, sky.fogNear, sky.fogFar);
    scene.add(new THREE.HemisphereLight(sky.top, sky.hemiGround, sky.hemiIntensity));
    const sun = new THREE.DirectionalLight(sky.sun, sky.sunIntensity);
    sun.position.copy(sky.sunDir).multiplyScalar(200);
    scene.add(sun);

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1400, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(sky.top) },
          horizon: { value: horizon },
          sunColor: { value: new THREE.Color(sky.sun) },
          sunDir: { value: sky.sunDir.clone().normalize() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            vec3 c = mix(horizon, top, pow(max(0.0, d.y), 0.5));
            float s = max(0.0, dot(d, sunDir));
            c += sunColor * (pow(s, 600.0) * 2.0 + pow(s, 14.0) * 0.28);
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // --- Terrain ---
    const seg = 190;
    const geo = new THREE.PlaneGeometry(this.size, this.size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const low = new THREE.Color(terrain.low);
    const high = new THREE.Color(terrain.high);
    const c = new THREE.Color();
    const r = rng(terrain.seed + 7);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const h = this.heightAt(x, z);
      p.setY(i, h);
      const t = Math.max(0, Math.min(1, (h - terrain.base) / Math.max(1, terrain.amp * 1.5)));
      c.copy(low).lerp(high, t);
      const j = 1 + (r() - 0.5) * terrain.noise;
      colors.set([c.r * j, c.g * j, c.b * j], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  /** Keep the sky centred on the viewer. */
  follow(pos: THREE.Vector3) {
    this.dome.position.copy(pos);
  }

  heightAt(x: number, z: number) {
    const t = this.terrain;
    const s = t.seed;
    let h =
      t.base +
      t.amp *
        (0.75 +
          0.55 * Math.sin(x * 0.011 + s) * Math.cos(z * 0.013 - s * 1.7) +
          0.3 * Math.sin(x * 0.027 + z * 0.019 + s * 2.3) +
          0.12 * Math.sin(x * 0.071 + s) * Math.sin(z * 0.063 - s));
    for (const f of t.flats) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r * 1.7) h = f.h + (h - f.h) * smooth(f.r, f.r * 1.7, d);
    }
    return h;
  }

  mat(color: number, opts: THREE.MeshLambertMaterialParameters = {}) {
    const key = color + JSON.stringify(opts);
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, ...opts });
      this.mats.set(key, m);
    }
    return m;
  }

  addBox(cx: number, y0: number, cz: number, w: number, h: number, d: number) {
    const b = {
      min: new THREE.Vector3(cx - w / 2, y0, cz - d / 2),
      max: new THREE.Vector3(cx + w / 2, y0 + h, cz + d / 2),
    };
    this.boxes.push(b);
    return b;
  }

  /** Solid coloured block with a collider. */
  block(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number, parent: THREE.Object3D = this.scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
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

  /** House with pitched or flat roof. Not rotated, so its collider is exact. */
  house(x: number, z: number, w: number, d: number, h: number, wall: number, roof: number, flat = false, baseY?: number) {
    const y0 = baseY ?? this.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y0, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h + 2, d), this.mat(wall));
    body.position.y = h / 2 - 1;
    g.add(body);
    let top = h;
    if (flat) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), this.mat(roof));
      slab.position.y = h + 0.2;
      g.add(slab);
      top = h + 0.4;
    } else {
      const rh = Math.min(w, d) * 0.45;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7071, 1, 4), this.mat(roof, { flatShading: true }));
      cone.rotation.y = Math.PI / 4;
      cone.scale.set(w * 1.15, rh, d * 1.15);
      cone.position.y = h + rh / 2;
      g.add(cone);
      top = h + rh * 0.55;
    }
    // Door and windows on the two long faces.
    const glass = this.mat(0x24364f);
    for (const side of [-1, 1]) {
      for (let i = -1; i <= 1; i += 2) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, 1.3, 0.15), glass);
        win.position.set(i * w * 0.27, Math.min(h - 1.6, 2.4), (side * d) / 2);
        g.add(win);
      }
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.2), this.mat(0x5a3b22));
    door.position.set(0, 1.05, d / 2);
    g.add(door);
    this.scene.add(g);
    const box = this.addBox(x, y0 - 1, z, w, top + 1, d);
    return { group: g, x, z, w, d, top: y0 + top, box, flat };
  }

  /** Landing pad with an H. */
  pad(x: number, z: number, color = '#ffd23f') {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#3b4048';
    g.beginPath();
    g.arc(128, 128, 126, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 14;
    g.beginPath();
    g.arc(128, 128, 104, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = 'bold 150px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', 128, 136);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const y = this.heightAt(x, z);
    const m = new THREE.Mesh(new THREE.CircleGeometry(6, 40), new THREE.MeshLambertMaterial({ map: tex }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.08, z);
    this.scene.add(m);
    // Corner beacons.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color }));
      b.position.set(x + Math.cos(a) * 6.3, y + 0.35, z + Math.sin(a) * 6.3);
      this.scene.add(b);
    }
    return new THREE.Vector3(x, y, z);
  }

  /** Pines as three instanced meshes. Each tree gets a slim collider. */
  pines(spots: { x: number; z: number; s: number }[], canopy = 0x2f7d3a) {
    const n = spots.length;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.4, 3, 6), this.mat(0x6b4a2b), n);
    const lowG = new THREE.ConeGeometry(2.3, 5, 7);
    lowG.translate(0, 4.6, 0);
    const topG = new THREE.ConeGeometry(1.5, 4, 7);
    topG.translate(0, 7.6, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const lowM = new THREE.InstancedMesh(lowG, mat, n);
    const topM = new THREE.InstancedMesh(topG, mat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const base = new THREE.Color(canopy);
    const col = new THREE.Color();
    const r = rng(n * 13 + 5);
    spots.forEach((t, i) => {
      const y = this.heightAt(t.x, t.z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r() * 6.28);
      m.compose(new THREE.Vector3(t.x, y + 1.5 * t.s - 0.3, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      trunk.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, y - 0.3, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      lowM.setMatrixAt(i, m);
      topM.setMatrixAt(i, m);
      col.copy(base).multiplyScalar(0.75 + r() * 0.5);
      lowM.setColorAt(i, col);
      topM.setColorAt(i, col.multiplyScalar(1.12));
      this.addBox(t.x, y, t.z, 1.6 * t.s, 8.6 * t.s, 1.6 * t.s);
    });
    this.scene.add(trunk, lowM, topM);
  }

  /** Scattered boulders (decoration only). */
  rocks(spots: { x: number; z: number; s: number }[], color: number) {
    const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), this.mat(color, { flatShading: true }), spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    spots.forEach((t, i) => {
      e.set(t.x * 1.3, t.z * 0.7, t.s * 5);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(t.x, this.heightAt(t.x, t.z) + t.s * 0.3, t.z), q, new THREE.Vector3(t.s * 1.4, t.s, t.s * 1.2));
      mesh.setMatrixAt(i, m);
    });
    this.scene.add(mesh);
  }

  water(y: number, color: number, radius?: number, x = 0, z = 0) {
    const geo = radius ? new THREE.CircleGeometry(radius, 48) : new THREE.PlaneGeometry(2400, 2400);
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshPhongMaterial({ color, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.86 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    this.scene.add(m);
    return m;
  }

  clouds(count: number, seed: number) {
    const r = rng(seed);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false });
    const geo = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const a = r() * Math.PI * 2;
      const d = 150 + r() * 650;
      g.position.set(Math.cos(a) * d, 170 + r() * 90, Math.sin(a) * d);
      const puffs = 3 + Math.floor(r() * 4);
      for (let k = 0; k < puffs; k++) {
        const s = new THREE.Mesh(geo, mat);
        const sc = 14 + r() * 20;
        s.scale.set(sc * 1.6, sc * 0.55, sc);
        s.position.set((k - puffs / 2) * 20 + r() * 8, r() * 6, r() * 14);
        g.add(s);
      }
      this.scene.add(g);
    }
  }
}

/** Free GPU memory held by a scene we are about to drop. */
export function disposeScene(scene: THREE.Scene) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      (x as THREE.MeshLambertMaterial).map?.dispose();
      x.dispose();
    }
  });
}
