// Detailed quadcopter airframes, built in code. Each drone in the fleet has
// its own frame — a racer, a folding camera drone, a ducted cinewhoop and a
// heavy industrial X-frame — and one model serves the hangar and (without the
// belly gear) the first-person view.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { DroneSpec } from '../data';

export interface DroneModel {
  group: THREE.Group;
  /** Spinning propeller hubs, front-left, front-right, rear-left, rear-right. */
  props: THREE.Group[];
  /** 0 = stopped (solid blades), 1 = full speed (blurred disc). */
  setSpin(spool: number): void;
  /** Height of the lowest point, so the model can be stood on a floor. */
  foot: number;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Paint job seen from above: front of the drone is the top of the canvas. */
function livery(spec: DroneSpec, style: 'race' | 'clean' | 'industrial') {
  return canvasTex(512, 1024, (g) => {
    const base = new THREE.Color(spec.color);
    const light = base.r * 0.3 + base.g * 0.6 + base.b * 0.1 > 0.55;
    const ink = light ? '#1a1d22' : '#f2f3f0';
    const accent = hex(spec.accent);
    g.fillStyle = hex(spec.color);
    g.fillRect(0, 0, 512, 1024);

    if (style === 'race') {
      g.fillStyle = accent;
      g.fillRect(0, 820, 512, 46);
      g.fillRect(0, 880, 512, 14);
      g.fillRect(0, 150, 512, 16);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(0, 0, 512, 96);
    } else if (style === 'clean') {
      // Consumer camera drone: one hairline of colour and a soft sheen.
      const sheen = g.createLinearGradient(0, 0, 512, 0);
      sheen.addColorStop(0, 'rgba(0,0,0,0.18)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0.1)');
      sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = sheen;
      g.fillRect(0, 0, 512, 1024);
      g.fillStyle = accent;
      g.fillRect(60, 360, 392, 5);
    } else {
      // Industrial: warning bands at the nose and the tail.
      for (const y of [120, 900]) {
        g.save();
        g.beginPath();
        g.rect(0, y, 512, 44);
        g.clip();
        for (let i = -4; i < 14; i++) {
          g.fillStyle = i % 2 ? accent : '#16181c';
          g.beginPath();
          g.moveTo(i * 44, y + 44);
          g.lineTo(i * 44 + 44, y + 44);
          g.lineTo(i * 44 + 88, y);
          g.lineTo(i * 44 + 44, y);
          g.fill();
        }
        g.restore();
      }
    }

    // Panel seams and screws.
    g.strokeStyle = light ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.42)';
    g.lineWidth = 3;
    if (style !== 'clean') {
      g.strokeRect(150, 380, 212, 330);
      g.strokeRect(96, 196, 320, 150);
    }
    g.beginPath();
    g.moveTo(0, 740);
    g.lineTo(512, 740);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (const [x, y] of [[110, 210], [402, 210], [110, 332], [402, 332], [164, 696], [348, 696]]) {
      g.beginPath();
      g.arc(x, y, 5, 0, 7);
      g.fill();
    }

    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (style === 'clean') {
      g.font = '600 40px "Segoe UI", Arial, sans-serif';
      g.fillText(spec.name.toUpperCase(), 256, 280);
    } else {
      for (const side of [-1, 1]) {
        g.save();
        g.translate(256 + side * 172, 545);
        g.rotate((side * Math.PI) / 2);
        g.font = '800 46px "Segoe UI", Arial, sans-serif';
        g.fillText(spec.name.toUpperCase(), 0, 0);
        g.restore();
      }
      g.font = '800 64px "Segoe UI", Arial, sans-serif';
      g.fillText(spec.code, 256, 272);
    }
    g.font = '700 17px Arial, sans-serif';
    g.fillText('SKYDUTY · ' + spec.code, 256, 770);
    if (style === 'industrial') g.fillText('⚠ ROTOR HAZARD — KEEP CLEAR', 256, 968);

    // Dark trim along the edges wraps down the sides of the shell.
    const edge = g.createLinearGradient(0, 0, 512, 0);
    const trim = style === 'clean' ? 0.35 : 0.95;
    edge.addColorStop(0, `rgba(10,11,13,${trim})`);
    edge.addColorStop(0.07, 'rgba(10,11,13,0)');
    edge.addColorStop(0.93, 'rgba(10,11,13,0)');
    edge.addColorStop(1, `rgba(10,11,13,${trim})`);
    g.fillStyle = edge;
    g.fillRect(0, 0, 512, 1024);
  });
}

let carbonTex: THREE.Texture | undefined;
function carbon() {
  carbonTex ??= (() => {
    const t = canvasTex(64, 64, (g) => {
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const horiz = (i + j) % 2 === 0;
          const gr = horiz ? g.createLinearGradient(i * 16, 0, i * 16 + 16, 0) : g.createLinearGradient(0, j * 16, 0, j * 16 + 16);
          gr.addColorStop(0, '#2b2d31');
          gr.addColorStop(0.5, '#5d6168');
          gr.addColorStop(1, '#25272a');
          g.fillStyle = gr;
          g.fillRect(i * 16, j * 16, 16, 16);
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 10);
    return t;
  })();
  return carbonTex;
}

function discTex(accent: number, blades: number) {
  return canvasTex(256, 256, (g) => {
    const c = 128;
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(24,26,30,0)');
    gr.addColorStop(0.14, 'rgba(24,26,30,0.2)');
    gr.addColorStop(0.5, 'rgba(24,26,30,0.26)');
    gr.addColorStop(0.9, 'rgba(24,26,30,0.4)');
    gr.addColorStop(0.97, 'rgba(24,26,30,0.18)');
    gr.addColorStop(1, 'rgba(24,26,30,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    // Ghosts of the blades.
    const n = blades * 2;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (k % 2 ? 0.5 : 0);
      g.fillStyle = `rgba(10,11,13,${k % 2 ? 0.2 : 0.38})`;
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, c * 0.96, a, a + 0.42);
      g.fill();
    }
    g.strokeStyle = hex(accent);
    g.globalAlpha = 0.4;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(c, c, c * 0.93, 0, 7);
    g.stroke();
  });
}

/** Rounded, tapering shell with UVs projected from above for the paint job. */
function hullGeo(L: number, W: number, top: number, bot: number, noseDrop = 0.5, square = 0.6) {
  const g = new THREE.SphereGeometry(1, 48, 28);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  const se = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i < p.count; i++) {
    const x = se(p.getX(i), square);
    const y = se(p.getY(i), 0.72);
    const z = se(p.getZ(i), square + 0.08);
    const front = Math.max(0, -z);
    const rear = Math.max(0, z);
    const X = x * (W / 2) * (1 - 0.34 * front * front - 0.14 * rear * rear);
    const Y = y > 0 ? y * top * (1 - noseDrop * front * front - 0.2 * rear * rear) : y * bot * (1 - 0.3 * front * front);
    const Z = z * (L / 2);
    p.setXYZ(i, X, Y, Z);
    uv.setXY(i, X / W + 0.5, 0.5 - Z / L);
  }
  g.computeVertexNormals();
  return g;
}

/** One propeller blade with a rounded tip, sweep and twist, lying along +X. */
function bladeGeo(R: number, chord: number, hubR: number) {
  const g = new THREE.PlaneGeometry(1, 1, 16, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = p.getX(i) + 0.5;
    const c = p.getY(i);
    let ch = chord * (0.38 + 0.95 * Math.sin(Math.PI * Math.pow(s, 0.55)));
    if (s > 0.84) ch *= Math.sqrt(Math.max(0.02, 1 - ((s - 0.84) / 0.16) ** 2));
    const zc = c * ch - 0.2 * chord * s * s;
    const tw = 0.1 + 0.5 * (1 - s);
    p.setXYZ(i, hubR + s * (R - hubR), zc * Math.sin(tw), zc * Math.cos(tw));
  }
  g.computeVertexNormals();
  return g;
}

/** The painted tip of a blade: the triangles beyond 82 % of the radius. */
function tipOf(blade: THREE.BufferGeometry, R: number) {
  const g = blade.clone();
  const p = g.attributes.position;
  const keep: number[] = [];
  const idx = g.index!;
  for (let i = 0; i < idx.count; i += 3) {
    if ([0, 1, 2].every((k) => p.getX(idx.getX(i + k)) > R * 0.82)) keep.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  }
  g.setIndex(keep);
  g.translate(0, 0.0012, 0);
  return g;
}

type Frame = 'race' | 'fold' | 'duct' | 'heavy';
const FRAME: Record<string, Frame> = { dart: 'race', heron: 'fold', kite: 'duct', atlas: 'heavy' };

export function buildDrone(spec: DroneSpec, opts: { fpv?: boolean } = {}): DroneModel {
  const b = spec.bulk;
  const frame = FRAME[spec.id] ?? 'race';
  const group = new THREE.Group();
  const nBlades = frame === 'race' || frame === 'duct' ? 3 : 2;

  // ---------------------------------------------------------- materials
  const style = frame === 'race' ? 'race' : frame === 'heavy' ? 'industrial' : 'clean';
  const shell = new THREE.MeshPhysicalMaterial({ map: livery(spec, style), roughness: frame === 'heavy' ? 0.55 : 0.38, metalness: 0.08, clearcoat: frame === 'heavy' ? 0.3 : 1, clearcoatRoughness: 0.18 });
  const paint = new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: 0.4, metalness: 0.08, clearcoat: 0.9, clearcoatRoughness: 0.2 });
  const cf = new THREE.MeshStandardMaterial({ map: carbon(), color: 0x9a9da3, roughness: 0.42, metalness: 0.45 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.85, metalness: 0.1 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x3a3d43, roughness: 0.6, metalness: 0.15 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.28, metalness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.35, metalness: 0.85 });
  const anod = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.3, metalness: 0.85 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xc8793a, roughness: 0.4, metalness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x05080d, roughness: 0.03, metalness: 0.9, clearcoat: 1, clearcoatRoughness: 0.02 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.95 });
  const glow = (c: number, k = 3) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k });
  const bladeMat = new THREE.MeshStandardMaterial({ color: frame === 'fold' ? 0x2a2c30 : 0x1b1c20, roughness: 0.32, metalness: 0.2, side: THREE.DoubleSide, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: frame === 'fold' ? 0xd8dade : spec.accent, roughness: 0.4, side: THREE.DoubleSide, transparent: true });
  const discMat = new THREE.MeshBasicMaterial({ map: discTex(spec.accent, nBlades), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  /** Tube between two points; `flat` squashes it vertically into an oval. */
  const tube = (a: THREE.Vector3, c: THREE.Vector3, r1: number, r2: number, mat: THREE.Material, flat = 1, parent: THREE.Object3D = group) => {
    const geo = new THREE.CylinderGeometry(r2, r1, a.distanceTo(c), 14).rotateX(Math.PI / 2);
    const m = add(geo, mat, 0, 0, 0, parent);
    m.position.copy(a).add(c).multiplyScalar(0.5);
    m.lookAt(c);
    m.scale.y = flat;
    return m;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const box = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, r);

  // ------------------------------------------------- motors and props
  const props: THREE.Group[] = [];
  const motors: THREE.Vector3[] = [];
  const propCache = new Map<string, [THREE.BufferGeometry, THREE.BufferGeometry]>();
  /**
   * A motor standing on `at`, with its spinning bell and blades. Must be
   * called front-left, front-right, rear-left, rear-right.
   */
  const rotor = (at: THREE.Vector3, R: number, chord: number, mr: number, light = true) => {
    const key = `${R}:${chord}`;
    if (!propCache.has(key)) {
      const bl = bladeGeo(R, chord, R * 0.07);
      propCache.set(key, [bl, tipOf(bl, R)]);
    }
    const [blade, tip] = propCache.get(key)!;
    const i = props.length;
    const front = i < 2;
    const dir = i === 0 || i === 3 ? 1 : -1; // neighbours turn opposite ways
    motors.push(at);

    const hub = new THREE.Group();
    hub.position.set(at.x, at.y + mr * 0.72, at.z);
    if (frame === 'race') {
      // Racing motor: open bell, copper windings showing, alloy spinner.
      add(new THREE.CylinderGeometry(mr * 1.12, mr * 0.9, mr * 0.44, 20), dark, at.x, at.y, at.z);
      add(new THREE.CylinderGeometry(mr * 0.78, mr * 0.78, mr * 0.6, 18), copper, at.x, at.y + mr * 0.48, at.z);
      add(new THREE.CylinderGeometry(mr * 0.94, mr, mr * 0.72, 24, 1, true), dark, 0, mr * 0.16, 0, hub);
      add(new THREE.CylinderGeometry(mr * 0.96, mr * 0.96, mr * 0.12, 24), anod, 0, mr * 0.56, 0, hub);
      for (let k = 0; k < 6; k++) {
        // Cooling slots in the bell.
        const a = (k / 6) * Math.PI * 2;
        add(new THREE.BoxGeometry(mr * 0.16, mr * 0.28, 0.004), matte, Math.cos(a) * mr * 0.99, mr * 0.16, Math.sin(a) * mr * 0.99, hub).rotation.y = -a + Math.PI / 2;
      }
      add(new THREE.CylinderGeometry(mr * 0.28, mr * 0.4, mr * 0.44, 14), steel, 0, mr * 0.84, 0, hub);
      add(new THREE.ConeGeometry(mr * 0.24, mr * 0.36, 12), anod, 0, mr * 1.24, 0, hub);
    } else {
      // Camera-drone motor: one closed, smooth bell and a flat prop mount.
      add(new THREE.CylinderGeometry(mr, mr * 1.02, mr * 0.9, 28), grey, at.x, at.y + mr * 0.3, at.z);
      add(new THREE.CylinderGeometry(mr * 0.98, mr, mr * 0.5, 28), dark, 0, mr * 0.2, 0, hub);
      add(new THREE.CylinderGeometry(mr * 0.5, mr * 0.62, mr * 0.3, 20), frame === 'heavy' ? anod : matte, 0, mr * 0.6, 0, hub);
      add(new THREE.CylinderGeometry(mr * 0.3, mr * 0.34, mr * 0.18, 16), steel, 0, mr * 0.84, 0, hub);
    }
    group.add(hub);
    props.push(hub);
    for (let k = 0; k < nBlades; k++) {
      const bl = add(blade, bladeMat, 0, mr * 0.8, 0, hub);
      bl.rotation.y = (k / nBlades) * Math.PI * 2;
      bl.scale.z = dir;
      const tp = add(tip, tipMat, 0, mr * 0.8, 0, hub);
      tp.rotation.y = bl.rotation.y;
      tp.scale.z = dir;
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 40), discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = mr * 0.82;
    disc.renderOrder = 3;
    hub.add(disc);

    // Position light under each motor: accent in front, red behind.
    if (light) add(new THREE.SphereGeometry(mr * 0.22, 10, 8), glow(front ? spec.accent : 0xff2a2a, 3), at.x, at.y - mr * 0.32, at.z);
  };

  /** Stereo obstacle sensors: a dark window with two lenses. */
  const sensors = (x: number, y: number, z: number, s: number, ry: number) => {
    const w = add(box(s * 3.2, s * 1.3, s * 0.5, s * 0.3), glass, x, y, z);
    w.rotation.y = ry;
    for (const k of [-1, 1]) {
      const l = add(new THREE.CylinderGeometry(s * 0.42, s * 0.42, s * 0.2, 16).rotateX(Math.PI / 2), dark, x + Math.cos(ry) * k * s * 1.05, y, z - Math.sin(ry) * k * s * 1.05);
      l.rotation.y = ry;
    }
  };

  /** Three-axis gimbal with a box camera, hung from the nose at (0, y, z). */
  const boxGimbal = (y: number, z: number, s: number, lenses = 1) => {
    add(new THREE.CylinderGeometry(s * 0.35, s * 0.4, s * 0.25, 16), dark, 0, y, z);
    // Yaw arm down the right, roll motor at the side, camera in front.
    tube(V(0, y - s * 0.1, z), V(s * 0.62, y - s * 0.2, z), s * 0.1, s * 0.1, grey);
    tube(V(s * 0.62, y - s * 0.2, z), V(s * 0.62, y - s * 0.85, z), s * 0.1, s * 0.1, grey);
    add(new THREE.CylinderGeometry(s * 0.24, s * 0.24, s * 0.16, 18).rotateZ(Math.PI / 2), dark, s * 0.6, y - s * 0.85, z);
    const cy = y - s * 0.85;
    const camW = s * (lenses > 1 ? 1.1 : 0.8);
    add(box(camW, s * 0.72, s * 0.7, s * 0.14), lenses > 1 ? paint : grey, 0, cy, z);
    const lx = lenses === 1 ? [0] : [-camW * 0.27, camW * 0.04, camW * 0.3];
    lx.forEach((x, k) => {
      const r = s * (lenses === 1 ? 0.24 : k === 0 ? 0.18 : k === 1 ? 0.14 : 0.11);
      add(new THREE.CylinderGeometry(r * 1.1, r * 1.2, s * 0.16, 24).rotateX(Math.PI / 2), dark, x, cy, z - s * 0.4);
      add(new THREE.CircleGeometry(r * 0.86, 24).rotateY(Math.PI), glass, x, cy, z - s * 0.485);
      if (k === 0) add(new THREE.TorusGeometry(r * 0.96, s * 0.02, 8, 24), anod, x, cy, z - s * 0.48);
    });
  };

  /** Ball camera on a small yoke (the racer's). */
  const ballGimbal = (gy: number, gz: number) => {
    add(new THREE.CylinderGeometry(0.03 * b, 0.036 * b, 0.02, 16), matte, 0, gy, gz);
    for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.6 }), (i % 2 ? 1 : -1) * 0.024 * b, gy - 0.012, gz + (i < 2 ? 1 : -1) * 0.024 * b);
    tube(V(0.045 * b, gy - 0.02, gz), V(0.045 * b, gy - 0.075 * b, gz), 0.008, 0.008, dark);
    tube(V(-0.01, gy - 0.02, gz), V(0.045 * b, gy - 0.02, gz), 0.008, 0.008, dark);
    const cam = add(new THREE.SphereGeometry(0.036 * b, 24, 16), matte, 0, gy - 0.07 * b, gz);
    cam.scale.set(1, 0.95, 1.1);
    add(new THREE.CylinderGeometry(0.024 * b, 0.027 * b, 0.03 * b, 24).rotateX(Math.PI / 2), dark, 0, gy - 0.07 * b, gz - 0.04 * b);
    add(new THREE.CircleGeometry(0.02 * b, 24).rotateY(Math.PI), glass, 0, gy - 0.07 * b, gz - 0.0555 * b);
    add(new THREE.TorusGeometry(0.022 * b, 0.0028, 8, 24), anod, 0, gy - 0.07 * b, gz - 0.055 * b);
  };

  let L = 0;
  let W = 0;
  let foot = 0;
  let gearFrom = 0;
  /** Extra meshes the cockpit view keeps (beyond the front motors and arms). */
  const keep = new Set<THREE.Object3D>();

  if (frame === 'race') {
    // ------------------------------------------------ Dart: light racer
    L = 0.74 * b;
    W = 0.3 * b;
    const top = 0.075 * b;
    const bot = 0.07 * b;
    add(hullGeo(L, W, top, bot, 0.7), shell);
    add(hullGeo(L * 0.44, W * 0.62, top * 0.55, 0.01, 0.2), matte, 0, top * 0.62, L * 0.14);
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.012, 0.004, 0.012), glow(i < 3 ? 0x6dff8a : 0x26402c, i < 3 ? 2.5 : 0.2), (i - 1.5) * 0.022, top * 1.14, L * 0.27);
    add(new THREE.BoxGeometry(W * 0.3, 0.012, 0.02), dark, 0, top * 1.05, L * 0.34);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const v = add(new THREE.BoxGeometry(0.006, 0.012 * b, 0.05 * b), matte, side * W * 0.485, 0.012, L * (-0.02 + i * 0.045));
        v.rotation.y = side * 0.5;
      }
      const eye = add(new THREE.CylinderGeometry(0.017 * b, 0.017 * b, 0.012, 16).rotateX(Math.PI / 2), glass, side * W * 0.2, top * 0.2, -L * 0.468);
      eye.rotation.y = -side * 0.3;
      add(new THREE.TorusGeometry(0.018 * b, 0.003, 6, 18), dark, side * W * 0.2, top * 0.2, -L * 0.472).rotation.y = -side * 0.3;
    }
    add(new THREE.BoxGeometry(W * 0.2, 0.006, 0.006), glow(spec.accent, 2.2), 0, top * 0.42, -L * 0.455);
    tube(V(W * 0.22, top * 0.5, L * 0.42), V(W * 0.36, top + 0.11 * b, L * 0.5), 0.006, 0.004, matte);
    add(new THREE.SphereGeometry(0.008, 8, 6), matte, W * 0.36, top + 0.11 * b, L * 0.5);
    add(new THREE.BoxGeometry(W * 0.28, 0.01, 0.006), glow(0xff2a2a, 2.5), 0, 0.01, L * 0.487);

    const reach = 0.62 * b;
    const armR = 0.024 * b;
    const R = 0.34 * b + 0.02;
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const shoulder = V(sx * W * 0.4, 0.004, sz * L * 0.27);
        const motor = V(sx * reach, 0.035 * b, sz * reach);
        add(new THREE.CylinderGeometry(0.036 * b, 0.036 * b, 0.07 * b, 18), paint, shoulder.x, shoulder.y, shoulder.z);
        add(new THREE.CylinderGeometry(0.015 * b, 0.015 * b, 0.078 * b, 12), steel, shoulder.x, shoulder.y, shoulder.z);
        tube(shoulder, motor, armR * 1.25, armR, cf, 0.72);
        tube(shoulder.clone().lerp(motor, 0.7), shoulder.clone().lerp(motor, 0.9), armR * 1.12, armR * 1.08, sz < 0 ? anod : dark, 0.76);
        tube(shoulder.clone().add(V(0, -armR * 0.8, 0)), motor.clone().add(V(0, -armR * 0.8, 0)), 0.004, 0.004, matte);
        rotor(motor, R, R * 0.17, 0.05 * b);
      }
    }
    gearFrom = group.children.length;
    foot = -0.13 * b;
    motors.forEach((m, i) => {
      const sx = Math.sign(m.x);
      const at = V(sx * W * 0.4, 0, (i < 2 ? -1 : 1) * L * 0.27).lerp(m, 0.92);
      tube(at, V(at.x + sx * 0.01, foot + 0.012, at.z), 0.011 * b, 0.008 * b, cf);
      add(new THREE.SphereGeometry(0.014 * b, 10, 8), matte, at.x + sx * 0.01, foot + 0.012, at.z);
    });
    if (!opts.fpv) ballGimbal(-bot * 0.75, -L * 0.36);
  } else if (frame === 'fold') {
    // ----------------------------- Heron: folding consumer camera drone
    // Long narrow body; front arms swing out high from the shoulders, rear
    // arms fold from underneath so the rear props sit lower.
    L = 0.64 * b;
    W = 0.25 * b;
    const top = 0.085 * b;
    const bot = 0.06 * b;
    add(hullGeo(L, W, top, bot, 0.6, 0.7), shell);
    // Battery across the back half of the top, with grip ribs and charge lights.
    add(hullGeo(L * 0.48, W * 0.82, top * 0.48, 0.004, 0.15, 0.5), grey, 0, top * 0.64, L * 0.16);
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(W * 0.5, 0.003, 0.006), matte, 0, top * 1.1, L * (0.04 + i * 0.05));
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.008, 0.003, 0.008), glow(i < 3 ? 0x6dff8a : 0x26402c, i < 3 ? 2.5 : 0.2), (i - 1.5) * 0.016, top * 0.62, L * 0.49);
    sensors(0, top * 0.1, -L * 0.48, 0.016 * b, 0);
    sensors(0, top * 0.25, L * 0.47, 0.012 * b, Math.PI);
    for (const side of [-1, 1]) sensors(side * W * 0.5, 0, -L * 0.1, 0.01 * b, side * Math.PI * 0.5);

    const R = 0.3 * b;
    const arm = (from: THREE.Vector3, to: THREE.Vector3) => {
      add(new THREE.CylinderGeometry(0.03 * b, 0.03 * b, 0.05 * b, 18), grey, from.x, from.y, from.z);
      tube(from, to, 0.024 * b, 0.018 * b, paint, 0.55);
      // Motor pod at the tip.
      add(new THREE.CylinderGeometry(0.044 * b, 0.034 * b, 0.05 * b, 20), paint, to.x, to.y - 0.012 * b, to.z);
    };
    const fy = 0.045 * b;
    const ry = -0.02 * b;
    const spots = [
      [V(-W * 0.42, top * 0.2, -L * 0.3), V(-0.44 * b, fy, -0.36 * b)],
      [V(W * 0.42, top * 0.2, -L * 0.3), V(0.44 * b, fy, -0.36 * b)],
      [V(-W * 0.36, -bot * 0.4, L * 0.3), V(-0.4 * b, ry, 0.42 * b)],
      [V(W * 0.36, -bot * 0.4, L * 0.3), V(0.4 * b, ry, 0.42 * b)],
    ];
    for (const [from, to] of spots) {
      arm(from, to);
      rotor(V(to.x, to.y + 0.014 * b, to.z), R, R * 0.12, 0.04 * b);
    }
    // Pale antenna strips along the front arms.
    for (const s of [0, 1]) {
      const [from, to] = spots[s];
      tube(from.clone().lerp(to, 0.3).add(V(0, 0.01 * b, 0)), from.clone().lerp(to, 0.75).add(V(0, 0.01 * b, 0)), 0.006 * b, 0.006 * b, matte, 0.5);
    }
    add(new THREE.BoxGeometry(W * 0.25, 0.008, 0.005), glow(0xff2a2a, 2.5), 0, 0, L * 0.5);

    gearFrom = group.children.length;
    // Short feet under each motor pod; the front ones are longer.
    foot = -0.12 * b;
    motors.forEach((m) => {
      tube(V(m.x, m.y - 0.03 * b, m.z), V(m.x * 1.02, foot + 0.01, m.z), 0.01 * b, 0.008 * b, paint, 1);
      add(new THREE.SphereGeometry(0.012 * b, 10, 8), rubber, m.x * 1.02, foot + 0.012, m.z);
    });
    if (!opts.fpv) boxGimbal(-bot * 0.55, -L * 0.47, 0.085 * b);
  } else if (frame === 'duct') {
    // ---------------------------------- Kite: ducted cinewhoop (guarded)
    // One moulded frame holds four prop ducts; the body sits on top, the
    // camera peeks out between the front ducts.
    const mx = 0.33 * b;
    const mz = 0.29 * b;
    const R = 0.19 * b;
    const dr = R + 0.025 * b;
    const wall = 0.035 * b;
    const plateY = 0.02 * b;
    const ductH = 0.085 * b;
    L = 0.56 * b;
    W = 0.32 * b;

    const ox = mx + dr + wall;
    const oz = mz + dr + wall;
    const cr = dr + wall;
    const shape = new THREE.Shape();
    shape.moveTo(-ox + cr, -oz);
    shape.lineTo(ox - cr, -oz);
    shape.absarc(ox - cr, -oz + cr, cr, -Math.PI / 2, 0, false);
    shape.lineTo(ox, oz - cr);
    shape.absarc(ox - cr, oz - cr, cr, 0, Math.PI / 2, false);
    shape.lineTo(-ox + cr, oz);
    shape.absarc(-ox + cr, oz - cr, cr, Math.PI / 2, Math.PI, false);
    shape.lineTo(-ox, -oz + cr);
    shape.absarc(-ox + cr, -oz + cr, cr, Math.PI, Math.PI * 1.5, false);
    // Waist the long sides in a little, like a moulded guard.
    for (const [x, z] of [[-mx, -mz], [mx, -mz], [-mx, mz], [mx, mz]]) {
      const h = new THREE.Path();
      h.absarc(x, z, dr, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
    const plateGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.016 * b, bevelEnabled: true, bevelThickness: 0.006 * b, bevelSize: 0.006 * b, bevelSegments: 2, curveSegments: 36 }).rotateX(-Math.PI / 2);
    const plate = add(plateGeo, paint, 0, plateY - 0.016 * b, 0);
    keep.add(plate);
    // Duct walls with a rolled lower lip and three motor struts each.
    const wallGeo = new THREE.CylinderGeometry(dr + 0.004 * b, dr, ductH, 48, 1, true);
    const lipGeo = new THREE.TorusGeometry(dr + 0.004 * b, 0.008 * b, 8, 48).rotateX(Math.PI / 2);
    const ductMat = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide });
    const propY = plateY - ductH * 0.42;
    const mr = 0.034 * b;
    const centres = [[-mx, -mz], [mx, -mz], [-mx, mz], [mx, mz]];
    for (const [x, z] of centres) {
      keep.add(add(wallGeo, ductMat, x, plateY - ductH / 2, z));
      keep.add(add(lipGeo, ductMat, x, plateY - ductH, z));
      const base = propY - mr * 0.8 - mr * 0.72;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + Math.atan2(z, x) + Math.PI / 3;
        tube(V(x, base, z), V(x + Math.cos(a) * dr, plateY - ductH + 0.004 * b, z + Math.sin(a) * dr), 0.008 * b, 0.007 * b, ductMat, 0.6);
      }
    }
    for (const [x, z] of centres) rotor(V(x, propY - mr * 0.8 - mr * 0.72, z), R, R * 0.2, mr, false);
    // Light strips on the outer duct faces: accent front, red rear.
    for (const [x, z] of centres) {
      const a = Math.atan2(z, x);
      const lamp = add(new THREE.BoxGeometry(0.004 * b, 0.01 * b, 0.07 * b), glow(z < 0 ? spec.accent : 0xff2a2a, 2.6), x + Math.cos(a) * (dr + 0.008 * b), plateY - ductH * 0.35, z + Math.sin(a) * (dr + 0.008 * b));
      lamp.rotation.y = -a;
    }

    // Body: squat shell over the centre with a battery slotted in the back.
    const top = 0.13 * b;
    const bodyY = plateY + 0.045 * b;
    add(hullGeo(L, W, top, 0.05 * b, 0.35, 0.5), shell, 0, bodyY, 0.01 * b);
    add(box(W * 0.78, top * 0.75, L * 0.42, 0.012 * b), grey, 0, bodyY + top * 0.3, L * 0.36);
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.008, 0.003, 0.008), glow(i < 3 ? 0x6dff8a : 0x26402c, i < 3 ? 2.5 : 0.2), (i - 1.5) * 0.016, bodyY + top * 0.68, L * 0.5);
    for (const side of [-1, 1]) {
      // Cooling fins on the flanks.
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.004, 0.03 * b, 0.05 * b), matte, side * W * 0.47, bodyY, L * (-0.12 + i * 0.07));
    }

    gearFrom = group.children.length;
    // Rubber pads under the outer edge of each duct.
    foot = plateY - ductH - 0.03 * b;
    for (const [x, z] of centres) {
      const a = Math.atan2(z, x);
      add(box(0.04 * b, 0.03 * b, 0.04 * b, 0.008 * b), rubber, x + Math.cos(a) * dr * 0.85, foot + 0.015 * b, z + Math.sin(a) * dr * 0.85);
    }
    if (!opts.fpv) {
      // Single-axis camera in a cradle at the nose, tilted a touch down.
      const cz = -L * 0.5 - 0.02 * b;
      const cy = bodyY - 0.005 * b;
      for (const side of [-1, 1]) add(box(0.012 * b, 0.07 * b, 0.07 * b, 0.004 * b), grey, side * 0.05 * b, cy, cz + 0.02 * b);
      const cam = add(box(0.085 * b, 0.065 * b, 0.07 * b, 0.014 * b), matte, 0, cy, cz);
      cam.rotation.x = -0.18;
      const lens = new THREE.Group();
      lens.position.set(0, cy - 0.004 * b, cz - 0.035 * b);
      lens.rotation.x = -0.18;
      group.add(lens);
      add(new THREE.CylinderGeometry(0.026 * b, 0.028 * b, 0.026 * b, 24).rotateX(Math.PI / 2), dark, 0, 0, -0.01 * b, lens);
      add(new THREE.CircleGeometry(0.021 * b, 24).rotateY(Math.PI), glass, 0, 0, -0.0235 * b, lens);
      add(new THREE.TorusGeometry(0.024 * b, 0.0025 * b, 8, 24), anod, 0, 0, -0.023 * b, lens);
    }
  } else {
    // ------------------------------------ Atlas: heavy industrial X-frame
    // Wide body with twin batteries on top, long carbon arms out to big
    // two-blade props, GPS masts, skid gear and a triple-lens payload.
    L = 0.6 * b;
    W = 0.46 * b;
    const top = 0.11 * b;
    const bot = 0.1 * b;
    add(hullGeo(L, W, top, bot, 0.25, 0.45), shell);
    // Twin batteries side by side in the top bay.
    for (const side of [-1, 1]) {
      const x = side * W * 0.17;
      add(box(W * 0.28, 0.07 * b, L * 0.46, 0.01 * b), grey, x, top * 0.95, L * 0.04);
      add(box(W * 0.24, 0.01 * b, L * 0.12, 0.004 * b), matte, x, top * 0.95 + 0.036 * b, L * 0.2);
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.01, 0.004, 0.01), glow(i < 3 ? 0x6dff8a : 0x26402c, i < 3 ? 2.5 : 0.2), x + (i - 1.5) * 0.02, top * 0.95 + 0.036 * b, -L * 0.12);
    }
    // GPS masts at the back.
    for (const side of [-1, 1]) {
      tube(V(side * W * 0.22, top * 0.7, L * 0.36), V(side * W * 0.24, top + 0.16 * b, L * 0.36), 0.007 * b, 0.006 * b, matte);
      add(new THREE.CylinderGeometry(0.035 * b, 0.035 * b, 0.014 * b, 20), paint, side * W * 0.24, top + 0.165 * b, L * 0.36);
    }
    // Front FPV camera, obstacle sensors front, back and sides.
    add(box(0.05 * b, 0.04 * b, 0.03 * b, 0.008 * b), matte, 0, top * 0.6, -L * 0.47);
    add(new THREE.CircleGeometry(0.012 * b, 18).rotateY(Math.PI), glass, 0, top * 0.6, -L * 0.486);
    sensors(0, -bot * 0.2, -L * 0.48, 0.018 * b, 0);
    sensors(0, -bot * 0.2, L * 0.48, 0.018 * b, Math.PI);
    for (const side of [-1, 1]) sensors(side * W * 0.47, -bot * 0.2, 0, 0.016 * b, side * Math.PI * 0.5);
    add(new THREE.BoxGeometry(W * 0.3, 0.01, 0.006), glow(0xff2a2a, 2.5), 0, 0.02 * b, L * 0.495);

    const R = 0.45 * b;
    const armR = 0.032 * b;
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const shoulder = V(sx * W * 0.36, top * 0.1, sz * L * 0.34);
        const motor = V(sx * 0.6 * b, 0.07 * b, sz * 0.58 * b);
        // Folding joint with a locking sleeve, then the long carbon arm.
        add(box(0.08 * b, 0.07 * b, 0.08 * b, 0.012 * b), dark, shoulder.x, shoulder.y, shoulder.z);
        const j = shoulder.clone().lerp(motor, 0.16);
        tube(shoulder, j, armR * 1.4, armR * 1.4, paint);
        tube(j, j.clone().lerp(motor, 0.08), armR * 1.5, armR * 1.5, anod);
        tube(j, motor, armR, armR, cf);
        // Motor pod and ESC fins.
        add(new THREE.CylinderGeometry(0.06 * b, 0.05 * b, 0.05 * b, 22), paint, motor.x, motor.y - 0.02 * b, motor.z);
        for (let k = -1; k <= 1; k++) add(new THREE.BoxGeometry(0.004, 0.025 * b, 0.07 * b), matte, motor.x + k * 0.018 * b, motor.y - 0.05 * b, motor.z);
        rotor(V(motor.x, motor.y + 0.005 * b, motor.z), R, R * 0.11, 0.075 * b);
      }
    }

    gearFrom = group.children.length;
    // Two skids under the body; antennas run down the rear legs.
    foot = -0.34 * b;
    for (const side of [-1, 1]) {
      const x = side * W * 0.7;
      for (const z of [-L * 0.28, L * 0.28]) tube(V(side * W * 0.3, -bot * 0.6, z), V(x, foot + 0.014, z), 0.015 * b, 0.012 * b, cf);
      tube(V(x, foot + 0.014, -L * 0.5), V(x, foot + 0.014, L * 0.5), 0.014 * b, 0.014 * b, cf);
      for (const z of [-L * 0.5, L * 0.5]) add(new THREE.SphereGeometry(0.019 * b, 10, 8), rubber, x, foot + 0.014, z);
      tube(V(side * W * 0.5, foot * 0.4, L * 0.28), V(x * 0.95, foot * 0.85, L * 0.28), 0.008 * b, 0.008 * b, matte);
    }
    if (!opts.fpv) boxGimbal(-bot * 0.9, -L * 0.3, 0.12 * b, 3);
  }

  if (opts.fpv) {
    // From the camera under the nose only the front arms and motors are in
    // sight; hide the rest so nothing blocks the view.
    group.children.forEach((o, i) => {
      const hub = props.indexOf(o as THREE.Group);
      if (hub >= 0) o.visible = hub < 2;
      else if (keep.has(o)) o.visible = o.position.z < 0 || o === [...keep][0];
      else o.visible = i < gearFrom && o.position.z < -L * 0.2 && Math.abs(o.position.x) > W * 0.45;
    });
  }

  return {
    group,
    props,
    foot,
    setSpin(spool: number) {
      const s = Math.max(0, Math.min(1, spool));
      discMat.opacity = Math.min(1, s * 1.15) * 0.6;
      bladeMat.opacity = tipMat.opacity = 1 - s * 0.82;
    },
  };
}
