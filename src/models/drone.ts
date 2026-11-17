// Detailed quadcopter airframes, built in code. One model serves the hangar
// and (without the belly gear) the first-person view.
import * as THREE from 'three';
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
function livery(spec: DroneSpec) {
  return canvasTex(512, 1024, (g) => {
    const base = new THREE.Color(spec.color);
    const light = base.r * 0.3 + base.g * 0.6 + base.b * 0.1 > 0.55;
    const ink = light ? '#1a1d22' : '#f2f3f0';
    const accent = hex(spec.accent);
    g.fillStyle = hex(spec.color);
    g.fillRect(0, 0, 512, 1024);

    if (spec.mission === 'strike') {
      // Soft two-tone camouflage.
      for (let i = 0; i < 26; i++) {
        g.fillStyle = i % 2 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.07)';
        g.beginPath();
        g.ellipse(Math.random() * 512, Math.random() * 1024, 50 + Math.random() * 90, 30 + Math.random() * 60, Math.random() * 3, 0, 7);
        g.fill();
      }
    } else if (spec.mission === 'fire') {
      // High-visibility chevrons across the tail.
      g.save();
      g.beginPath();
      g.rect(0, 800, 512, 130);
      g.clip();
      for (let i = -4; i < 12; i++) {
        g.fillStyle = i % 2 ? accent : '#16181c';
        g.beginPath();
        g.moveTo(i * 70, 930);
        g.lineTo(i * 70 + 70, 930);
        g.lineTo(i * 70 + 200, 800);
        g.lineTo(i * 70 + 130, 800);
        g.fill();
      }
      g.restore();
    } else {
      // Clean courier stripes.
      g.fillStyle = accent;
      g.fillRect(0, 820, 512, 46);
      g.fillRect(0, 880, 512, 14);
    }

    // Nose band and centre spine.
    g.fillStyle = accent;
    g.fillRect(0, 150, 512, 16);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, 0, 512, 96);

    // Panel seams, screws and hatches.
    g.strokeStyle = 'rgba(0,0,0,0.42)';
    g.lineWidth = 3;
    g.strokeRect(150, 380, 212, 330);
    g.strokeRect(96, 196, 320, 150);
    g.beginPath();
    g.moveTo(0, 740);
    g.lineTo(512, 740);
    g.moveTo(256, 196);
    g.lineTo(256, 346);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (const [x, y] of [[110, 210], [402, 210], [110, 332], [402, 332], [164, 394], [348, 394], [164, 696], [348, 696]]) {
      g.beginPath();
      g.arc(x, y, 5, 0, 7);
      g.fill();
    }

    // Name along both flanks, unit number and small stencils.
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
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
    g.font = '700 17px Arial, sans-serif';
    g.fillText('SKYDUTY · UNIT ' + (spec.id.length * 7 + 11), 256, 770);
    g.fillText('⚠ ROTOR HAZARD — KEEP CLEAR', 256, 968);

    // Dark trim along the edges wraps down the sides of the shell.
    const edge = g.createLinearGradient(0, 0, 512, 0);
    edge.addColorStop(0, 'rgba(10,11,13,0.95)');
    edge.addColorStop(0.07, 'rgba(10,11,13,0)');
    edge.addColorStop(0.93, 'rgba(10,11,13,0)');
    edge.addColorStop(1, 'rgba(10,11,13,0.95)');
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

function discTex(accent: number) {
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
    for (let k = 0; k < 4; k++) {
      g.fillStyle = `rgba(10,11,13,${k % 2 ? 0.2 : 0.38})`;
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, c * 0.96, k * (Math.PI / 2) + (k % 2 ? 0.5 : 0), k * (Math.PI / 2) + (k % 2 ? 0.5 : 0) + 0.42);
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
function hullGeo(L: number, W: number, top: number, bot: number, noseDrop = 0.5) {
  const g = new THREE.SphereGeometry(1, 48, 28);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  const se = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i < p.count; i++) {
    const x = se(p.getX(i), 0.6);
    const y = se(p.getY(i), 0.72);
    const z = se(p.getZ(i), 0.68);
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
function bladeGeo(R: number, chord: number) {
  const g = new THREE.PlaneGeometry(1, 1, 16, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = p.getX(i) + 0.5;
    const c = p.getY(i);
    let ch = chord * (0.38 + 0.95 * Math.sin(Math.PI * Math.pow(s, 0.55)));
    if (s > 0.84) ch *= Math.sqrt(Math.max(0.02, 1 - ((s - 0.84) / 0.16) ** 2));
    const zc = c * ch - 0.2 * chord * s * s;
    const tw = 0.1 + 0.5 * (1 - s);
    p.setXYZ(i, R * (0.07 + s * 0.93), zc * Math.sin(tw), zc * Math.cos(tw));
  }
  g.computeVertexNormals();
  return g;
}

export function buildDrone(spec: DroneSpec, opts: { fpv?: boolean } = {}): DroneModel {
  const b = spec.bulk;
  const heavy = spec.tier === 'Heavy';
  const light = spec.tier === 'Light';
  const military = spec.mission === 'strike';
  const group = new THREE.Group();

  // ---------------------------------------------------------- materials
  const shell = new THREE.MeshPhysicalMaterial({
    map: livery(spec), roughness: military ? 0.7 : 0.38, metalness: 0.08,
    clearcoat: military ? 0.1 : 1, clearcoatRoughness: 0.18,
  });
  const paint = new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: military ? 0.7 : 0.4, metalness: 0.08, clearcoat: military ? 0.1 : 0.9, clearcoatRoughness: 0.2 });
  const cf = new THREE.MeshStandardMaterial({ map: carbon(), color: 0x9a9da3, roughness: 0.42, metalness: 0.45 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.85, metalness: 0.1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.28, metalness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.35, metalness: 0.85 });
  const anod = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.3, metalness: 0.85 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xc8793a, roughness: 0.4, metalness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x05080d, roughness: 0.03, metalness: 0.9, clearcoat: 1, clearcoatRoughness: 0.02 });
  const glow = (c: number, k = 3) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.32, metalness: 0.2, side: THREE.DoubleSide, transparent: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.4, side: THREE.DoubleSide, transparent: true });
  const discMat = new THREE.MeshBasicMaterial({ map: discTex(spec.accent), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });

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

  // ---------------------------------------------------------------- body
  const L = (light ? 0.74 : 0.84) * b;
  const W = (light ? 0.3 : heavy ? 0.46 : 0.4) * b;
  const top = (light ? 0.075 : 0.1) * b;
  const bot = 0.07 * b;
  add(hullGeo(L, W, top, bot, light ? 0.7 : 0.5), shell);

  // Battery pack clipped into the back, with charge lights.
  add(hullGeo(L * 0.44, W * 0.62, top * 0.55, 0.01, 0.2), matte, 0, top * 0.62, L * 0.14);
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.012, 0.004, 0.012), glow(i < 3 ? 0x6dff8a : 0x26402c, i < 3 ? 2.5 : 0.2), (i - 1.5) * 0.022, top * 1.14, L * 0.27);
  add(new THREE.BoxGeometry(W * 0.3, 0.012, 0.02), dark, 0, top * 1.05, L * 0.34);

  // Cooling vents along both flanks.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const v = add(new THREE.BoxGeometry(0.006, 0.012 * b, 0.05 * b), matte, side * W * 0.485, 0.012, L * (-0.02 + i * 0.045));
      v.rotation.y = side * 0.5;
    }
  }

  // Nose: forward sensors and a light bar.
  for (const side of [-1, 1]) {
    const eye = add(new THREE.CylinderGeometry(0.017 * b, 0.017 * b, 0.012, 16).rotateX(Math.PI / 2), glass, side * W * 0.2, top * 0.2, -L * 0.468);
    eye.rotation.y = -side * 0.3;
    add(new THREE.TorusGeometry(0.018 * b, 0.003, 6, 18), dark, side * W * 0.2, top * 0.2, -L * 0.472).rotation.y = -side * 0.3;
  }
  add(new THREE.BoxGeometry(W * 0.2, 0.006, 0.006), glow(spec.accent, 2.2), 0, top * 0.42, -L * 0.455);

  // Antennas, GPS puck and tail light.
  for (const side of light ? [1] : [-1, 1]) {
    tube(V(side * W * 0.22, top * 0.5, L * 0.42), V(side * W * 0.36, top + 0.11 * b, L * 0.5), 0.006, 0.004, matte);
    add(new THREE.SphereGeometry(0.008, 8, 6), matte, side * W * 0.36, top + 0.11 * b, L * 0.5);
  }
  if (!light) {
    add(new THREE.CylinderGeometry(0.042 * b, 0.048 * b, 0.016, 20), matte, 0, top * 0.98, -L * 0.2);
    add(new THREE.CylinderGeometry(0.03 * b, 0.03 * b, 0.018, 20), dark, 0, top * 0.99, -L * 0.2);
  }
  add(new THREE.BoxGeometry(W * 0.28, 0.01, 0.006), glow(0xff2a2a, 2.5), 0, 0.01, L * 0.487);

  // ------------------------------------------------- arms, motors, props
  const R = 0.34 * b + 0.02;
  const props: THREE.Group[] = [];
  const blade = bladeGeo(R, R * (heavy ? 0.2 : 0.17));
  const tipGeo = (() => {
    const g = blade.clone();
    const p = g.attributes.position;
    const keep: number[] = [];
    const idx = g.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const ok = [0, 1, 2].every((k) => p.getX(idx.getX(i + k)) > R * 0.82);
      if (ok) keep.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    }
    g.setIndex(keep);
    g.translate(0, 0.0012, 0);
    return g;
  })();
  const nBlades = light ? 2 : 3;
  const reach = 0.62 * b;
  const armR = (heavy ? 0.03 : 0.024) * b;

  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const shoulder = V(sx * W * 0.4, 0.004, sz * L * 0.27);
      const motor = V(sx * reach, 0.035 * b, sz * reach);
      // Hinge knuckle the arm folds on.
      add(new THREE.CylinderGeometry(0.036 * b, 0.036 * b, 0.07 * b, 18), paint, shoulder.x, shoulder.y, shoulder.z);
      add(new THREE.CylinderGeometry(0.015 * b, 0.015 * b, 0.078 * b, 12), steel, shoulder.x, shoulder.y, shoulder.z);
      // Carbon arm with a painted sleeve at the motor end.
      tube(shoulder, motor, armR * 1.25, armR, cf, 0.72);
      const s1 = shoulder.clone().lerp(motor, 0.7);
      const s2 = shoulder.clone().lerp(motor, 0.9);
      tube(s1, s2, armR * 1.12, armR * 1.08, sz < 0 ? anod : dark, 0.76);
      // Wire run under the arm.
      tube(shoulder.clone().add(V(0, -armR * 0.8, 0)), motor.clone().add(V(0, -armR * 0.8, 0)), 0.004, 0.004, matte);

      // Motor: mount, copper windings showing through, spinning bell on top.
      const mr = 0.05 * b;
      add(new THREE.CylinderGeometry(mr * 1.12, mr * 0.9, 0.022 * b, 20), dark, motor.x, motor.y, motor.z);
      add(new THREE.CylinderGeometry(mr * 0.78, mr * 0.78, 0.03 * b, 18), copper, motor.x, motor.y + 0.024 * b, motor.z);
      const hub = new THREE.Group();
      hub.position.set(motor.x, motor.y + 0.036 * b, motor.z);
      group.add(hub);
      props.push(hub);
      const bell = add(new THREE.CylinderGeometry(mr * 0.94, mr, 0.036 * b, 24, 1, true), dark, 0, 0.008 * b, 0, hub);
      (bell.material as THREE.Material).side = THREE.FrontSide;
      add(new THREE.CylinderGeometry(mr * 0.96, mr * 0.96, 0.006 * b, 24), anod, 0, 0.028 * b, 0, hub);
      for (let k = 0; k < 6; k++) {
        // Cooling slots in the bell.
        const a = (k / 6) * Math.PI * 2;
        add(new THREE.BoxGeometry(0.008 * b, 0.014 * b, 0.004), matte, Math.cos(a) * mr * 0.99, 0.008 * b, Math.sin(a) * mr * 0.99, hub).rotation.y = -a + Math.PI / 2;
      }
      add(new THREE.CylinderGeometry(0.014 * b, 0.02 * b, 0.022 * b, 14), steel, 0, 0.042 * b, 0, hub);
      add(new THREE.ConeGeometry(0.012 * b, 0.018 * b, 12), anod, 0, 0.062 * b, 0, hub);
      const dir = sx * sz > 0 ? 1 : -1; // neighbours turn opposite ways
      for (let k = 0; k < nBlades; k++) {
        const bl = add(blade, bladeMat, 0, 0.04 * b, 0, hub);
        bl.rotation.y = (k / nBlades) * Math.PI * 2;
        bl.scale.z = dir;
        const tp = add(tipGeo, tipMat, 0, 0.04 * b, 0, hub);
        tp.rotation.y = bl.rotation.y;
        tp.scale.z = dir;
      }
      const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 40), discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.041 * b;
      disc.renderOrder = 3;
      hub.add(disc);

      // Position light under each motor: accent in front, red behind.
      add(new THREE.SphereGeometry(0.011 * b, 10, 8), glow(sz < 0 ? spec.accent : 0xff2a2a, 3), motor.x, motor.y - 0.016 * b, motor.z);
    }
  }

  // ------------------------------------------------------- landing gear
  const gearFrom = group.children.length;
  let foot = -bot;
  if (heavy) {
    foot = -0.3 * b;
    for (const side of [-1, 1]) {
      const x = side * W * 0.62;
      for (const z of [-L * 0.24, L * 0.24]) tube(V(side * W * 0.34, -bot * 0.5, z), V(x, foot + 0.012, z), 0.012 * b, 0.01 * b, cf);
      tube(V(x, foot + 0.012, -L * 0.4), V(x, foot + 0.012, L * 0.4), 0.012 * b, 0.012 * b, cf);
      for (const z of [-L * 0.4, L * 0.4]) add(new THREE.SphereGeometry(0.017 * b, 10, 8), matte, x, foot + 0.012, z);
    }
  } else {
    foot = -(light ? 0.13 : 0.19) * b;
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const at = V(sx * W * 0.4, 0, sz * L * 0.27).lerp(V(sx * reach, 0.035 * b, sz * reach), light ? 0.92 : 0.5);
        tube(at, V(at.x + sx * 0.01, foot + 0.012, at.z), 0.011 * b, 0.008 * b, cf);
        add(new THREE.SphereGeometry(0.014 * b, 10, 8), matte, at.x + sx * 0.01, foot + 0.012, at.z);
      }
    }
  }

  if (opts.fpv) {
    // From the camera under the nose only the front arms and motors are in
    // sight; hide the rest so nothing blocks the view.
    group.children.forEach((o, i) => {
      const hub = props.indexOf(o as THREE.Group);
      if (hub >= 0) o.visible = hub < 2;
      else o.visible = i < gearFrom && o.position.z < -L * 0.2 && Math.abs(o.position.x) > W * 0.45;
    });
  }

  if (!opts.fpv) {
    // ---------------------------------------------------- gimbal camera
    const gz = -L * 0.36;
    const gy = -bot * 0.75;
    add(new THREE.CylinderGeometry(0.03 * b, 0.036 * b, 0.02, 16), matte, 0, gy, gz);
    for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.6 }), (i % 2 ? 1 : -1) * 0.024 * b, gy - 0.012, gz + (i < 2 ? 1 : -1) * 0.024 * b);
    tube(V(0.045 * b, gy - 0.02, gz), V(0.045 * b, gy - 0.075 * b, gz), 0.008, 0.008, dark);
    tube(V(-0.01, gy - 0.02, gz), V(0.045 * b, gy - 0.02, gz), 0.008, 0.008, dark);
    const cam = add(new THREE.SphereGeometry(0.036 * b, 24, 16), matte, 0, gy - 0.07 * b, gz);
    cam.scale.set(1, 0.95, 1.1);
    add(new THREE.CylinderGeometry(0.024 * b, 0.027 * b, 0.03 * b, 24).rotateX(Math.PI / 2), dark, 0, gy - 0.07 * b, gz - 0.04 * b);
    add(new THREE.CircleGeometry(0.02 * b, 24).rotateY(Math.PI), glass, 0, gy - 0.07 * b, gz - 0.0555 * b);
    add(new THREE.TorusGeometry(0.022 * b, 0.0028, 8, 24), anod, 0, gy - 0.07 * b, gz - 0.055 * b);

    // ------------------------------------------------- mission payload
    const py = -bot * 0.9;
    if (spec.mission === 'fire') {
      const tank = add(
        new THREE.CapsuleGeometry(0.075 * b, 0.26 * b, 8, 20).rotateX(Math.PI / 2),
        new THREE.MeshPhysicalMaterial({ color: 0x2f9be0, roughness: 0.12, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.86 }),
        0, py - 0.085 * b, L * 0.1,
      );
      tank.scale.x = 1.25;
      for (const z of [-0.07, 0.11]) {
        const strap = add(new THREE.TorusGeometry(0.08 * b, 0.007, 8, 28), steel, 0, py - 0.085 * b, L * 0.1 + z * b);
        strap.scale.x = 1.25;
      }
      add(new THREE.CylinderGeometry(0.02 * b, 0.02 * b, 0.012, 14), anod, 0, py - 0.005, L * 0.2);
      // Spray boom reaching forward under the nose.
      tube(V(0.07 * b, py - 0.1 * b, -L * 0.06), V(0.09 * b, py - 0.12 * b, -L * 0.5), 0.009, 0.008, steel);
      add(new THREE.ConeGeometry(0.016 * b, 0.04 * b, 12).rotateX(-Math.PI / 2), anod, 0.09 * b, py - 0.12 * b, -L * 0.52);
    } else if (spec.mission === 'strike') {
      for (const side of [-1, 1]) {
        const x = side * W * 0.36;
        add(new THREE.BoxGeometry(0.05 * b, 0.05 * b, 0.2 * b), paint, x, py - 0.03 * b, -L * 0.05);
        tube(V(x, py - 0.035 * b, -L * 0.15), V(x, py - 0.035 * b, -L * 0.52), 0.011 * b, 0.009 * b, dark);
        add(new THREE.CylinderGeometry(0.015 * b, 0.015 * b, 0.035 * b, 10).rotateX(Math.PI / 2), matte, x, py - 0.035 * b, -L * 0.53);
        add(new THREE.BoxGeometry(0.03 * b, 0.02 * b, 0.07 * b), copper, x + side * 0.03 * b, py - 0.03 * b, 0.02 * b);
      }
      const n = Math.min(4, spec.rockets ?? 2);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.05 * b;
        add(new THREE.CylinderGeometry(0.014 * b, 0.014 * b, 0.2 * b, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.4, metalness: 0.5 }), x, py - 0.075 * b, L * 0.02);
        add(new THREE.ConeGeometry(0.014 * b, 0.04 * b, 10).rotateX(-Math.PI / 2), glow(0xd9342b, 0.3), x, py - 0.075 * b, L * 0.02 - 0.12 * b);
      }
      add(new THREE.BoxGeometry(Math.max(1, n) * 0.05 * b, 0.012, 0.12 * b), dark, 0, py - 0.055 * b, L * 0.02);
    } else if (spec.mission === 'relief') {
      // Winch frame with a strapped crate.
      add(new THREE.BoxGeometry(0.16 * b, 0.014, 0.16 * b), dark, 0, py - 0.01, L * 0.05);
      const c = 0.17 * b;
      const cy = py - 0.05 * b - c / 2;
      const wood = canvasTex(128, 128, (g) => {
        g.fillStyle = '#b98345';
        g.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 5; i++) {
          g.fillStyle = `rgba(60,35,10,${0.12 + (i % 2) * 0.1})`;
          g.fillRect(0, i * 26, 128, 23);
        }
        g.strokeStyle = '#6b4520';
        g.lineWidth = 10;
        g.strokeRect(5, 5, 118, 118);
        g.beginPath();
        g.moveTo(8, 8);
        g.lineTo(120, 120);
        g.stroke();
      });
      add(new THREE.BoxGeometry(c * 1.15, c, c * 1.15), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 }), 0, cy, L * 0.05);
      add(new THREE.BoxGeometry(c * 1.17, c * 1.02, 0.02 * b), anod, 0, cy, L * 0.05);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        tube(V(x * 0.06 * b, py - 0.015, L * 0.05 + z * 0.06 * b), V(x * c * 0.5, cy + c / 2, L * 0.05 + z * c * 0.5), 0.003, 0.003, steel);
      }
    }
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
