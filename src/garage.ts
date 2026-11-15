// The drone garage: a dark workshop bay rendered behind every menu screen.
// The selected drone sits on a lit landing pad; the camera glides between
// framings as the player moves through the menus.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { tex } from './assets';
import { buildDrone, type DroneModel } from './models/drone';
import type { DroneSpec } from './data';

export type Shot = 'title' | 'missions' | 'roam' | 'hangar' | 'brief';

interface ShotDef {
  /** Camera azimuth around the pad (0 = straight in from the front). */
  az: number;
  el: number;
  /** Distance in drone radii (with a floor so small drones still show the bay). */
  dist: number;
  min: number;
  /** Horizontal framing offset as a fraction of the screen width (negative = drone to the right). */
  shift: number;
  drift: number;
}
const SHOTS: Record<Shot, ShotDef> = {
  title: { az: 0.62, el: 0.13, dist: 6.2, min: 4.6, shift: -0.2, drift: 0.14 },
  missions: { az: -0.5, el: 0.24, dist: 5, min: 3.6, shift: -0.23, drift: 0.1 },
  roam: { az: 0.95, el: 0.2, dist: 5, min: 3.6, shift: -0.23, drift: 0.1 },
  hangar: { az: 0.32, el: 0.2, dist: 2.75, min: 1.9, shift: 0, drift: 0.04 },
  brief: { az: -1.25, el: 0.09, dist: 2.6, min: 1.8, shift: 0.24, drift: 0.05 },
};

const PAD_TOP = 0.1;

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

export class Garage {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(34, 1, 0.05, 80);
  private model?: DroneModel;
  private radius = 0.6;
  private height = 0.3;
  private shot: ShotDef = { ...SHOTS.title };
  private want: ShotDef = SHOTS.title;
  private spinDrone = false;
  private accentMats: (THREE.MeshBasicMaterial | THREE.PointLight)[] = [];
  private dust: THREE.Points;
  private screen: THREE.CanvasTexture;
  private t = 0;
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'garage';
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    RectAreaLightUniformsLib.init();

    const s = this.scene;
    s.background = new THREE.Color(0x040507);
    s.fog = new THREE.Fog(0x040507, 9, 30);
    const pmrem = new THREE.PMREMGenerator(r);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.32;
    pmrem.dispose();

    this.buildRoom();
    this.buildPad();
    this.buildProps();
    this.screen = this.buildMonitor();
    this.dust = this.buildDust();
    this.buildLights();

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(s, this.cam));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.7, 0.82));
    this.composer.addPass(new OutputPass());
  }

  // ------------------------------------------------------------------ room
  private buildRoom() {
    const s = this.scene;

    // Polished concrete: a mirror under a mostly-opaque textured layer reads as a glossy floor.
    const mirror = new Reflector(new THREE.PlaneGeometry(60, 60), { textureWidth: 1024, textureHeight: 1024, color: 0x8a8f96, clipBias: 0.003 });
    mirror.rotation.x = -Math.PI / 2;
    s.add(mirror);
    const ct = tex('concrete_floor_02');
    const map = ct.map.clone();
    const nor = ct.normalMap.clone();
    for (const t of [map, nor]) {
      t.repeat.set(9, 9);
      t.needsUpdate = true;
    }
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ map, normalMap: nor, color: 0x4b4f56, roughness: 0.62, metalness: 0.1, transparent: true, opacity: 0.88 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.004;
    floor.receiveShadow = true;
    s.add(floor);

    // Painted bay outline and a hazard strip in front of the door.
    const paint = new THREE.MeshStandardMaterial({ color: 0xb79a3c, roughness: 0.8 });
    const line = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, d), paint);
      m.position.set(x, 0.008, z);
      m.receiveShadow = true;
      s.add(m);
    };
    line(8, 0.07, 0, -4);
    line(8, 0.07, 0, 4);
    line(0.07, 8, -4, 0);
    line(0.07, 8, 4, 0);
    const hazard = canvasTex(1024, 64, (g) => {
      g.fillStyle = '#1a1a1a';
      g.fillRect(0, 0, 1024, 64);
      g.fillStyle = '#c99a1e';
      for (let x = -64; x < 1100; x += 64) {
        g.beginPath();
        g.moveTo(x, 64);
        g.lineTo(x + 32, 0);
        g.lineTo(x + 64, 0);
        g.lineTo(x + 32, 64);
        g.fill();
      }
    });
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.42), new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.75 }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.009, -6.4);
    strip.receiveShadow = true;
    s.add(strip);

    // Walls of brushed metal panels.
    const wt = tex('concrete_wall_004');
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1d2126, roughness: 0.5, metalness: 0.7, normalMap: wt.normalMap, normalScale: new THREE.Vector2(0.35, 0.35) });
    const panel = new THREE.BoxGeometry(1.94, 1.54, 0.08);
    const placePanels = (cols: number[], rows: number, wall: (m: THREE.Matrix4, x: number, y: number) => void) => {
      const inst = new THREE.InstancedMesh(panel, panelMat, cols.length * rows);
      const m = new THREE.Matrix4();
      let i = 0;
      for (const x of cols) for (let y = 0; y < rows; y++) {
        wall(m, x, 0.8 + y * 1.6);
        inst.setMatrixAt(i++, m);
      }
      inst.receiveShadow = true;
      s.add(inst);
    };
    const back = [-10, -8, -6, -4, 4, 6, 8, 10];
    placePanels(back, 5, (m, x, y) => m.makeTranslation(x, y, -7));
    const sideCols = [-6, -4, -2, 0, 2, 4, 6, 8];
    placePanels(sideCols, 5, (m, z, y) => m.makeRotationY(Math.PI / 2).setPosition(-11, y, z));
    placePanels(sideCols, 5, (m, z, y) => m.makeRotationY(-Math.PI / 2).setPosition(11, y, z));
    // Door lintel above the roll-up door.
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(6, 3.1, 0.08), panelMat);
    lintel.position.set(0, 6.45, -7);
    s.add(lintel);

    // Roll-up door with daylight leaking underneath.
    const slats = canvasTex(64, 512, (g) => {
      g.fillStyle = '#2b2f35';
      g.fillRect(0, 0, 64, 512);
      for (let y = 0; y < 512; y += 16) {
        g.fillStyle = '#16191d';
        g.fillRect(0, y, 64, 3);
        g.fillStyle = '#3a3f46';
        g.fillRect(0, y + 3, 64, 1);
      }
    });
    slats.wrapS = slats.wrapT = THREE.RepeatWrapping;
    slats.repeat.set(1, 1);
    const door = new THREE.Mesh(new THREE.BoxGeometry(6, 4.9, 0.06), new THREE.MeshStandardMaterial({ map: slats, roughness: 0.55, metalness: 0.65 }));
    door.position.set(0, 2.5, -7.05);
    door.receiveShadow = true;
    s.add(door);
    const leak = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2b0).multiplyScalar(3.2) }));
    leak.position.set(0, 0.025, -7.0);
    s.add(leak);
    const spill = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 1.6),
      new THREE.MeshBasicMaterial({
        map: canvasTex(4, 128, (g) => {
          const gr = g.createLinearGradient(0, 0, 0, 128);
          gr.addColorStop(0, 'rgba(255,214,160,0.55)');
          gr.addColorStop(1, 'rgba(255,214,160,0)');
          g.fillStyle = gr;
          g.fillRect(0, 0, 4, 128);
        }),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0, 0.012, -6.2);
    s.add(spill);

    // Vertical light strips flanking the door and in the corners, plus ceiling bars.
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdde9ff).multiplyScalar(1.9) });
    for (const x of [-3.35, 3.35, -9, 9]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 5.4, 0.05), glow);
      b.position.set(x, 3.2, -6.93);
      s.add(b);
    }
    for (const z of [-4, 0, 4]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(7, 0.06, 0.22), glow);
      b.position.set(0, 7.4, z);
      s.add(b);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(24, 18), new THREE.MeshStandardMaterial({ color: 0x0c0e11, roughness: 0.9 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 7.6;
    s.add(ceil);

    // Stencilled bay marking on the wall.
    const sign = canvasTex(1024, 256, (g) => {
      g.clearRect(0, 0, 1024, 256);
      g.fillStyle = 'rgba(220,228,236,0.9)';
      g.font = '600 150px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.textBaseline = 'middle';
      g.fillText('BAY 03', 10, 110);
      g.font = '500 40px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.fillText('SKYDUTY  ·  FLIGHT OPERATIONS', 16, 220);
    });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: sign, transparent: true, opacity: 0.22, depthWrite: false }));
    signMesh.position.set(-7.4, 5.3, -6.94);
    s.add(signMesh);
  }

  // ------------------------------------------------------------------- pad
  private buildPad() {
    const s = this.scene;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9, 1.98, PAD_TOP, 96),
      new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.35, metalness: 0.7 }),
    );
    base.position.y = PAD_TOP / 2;
    base.receiveShadow = true;
    base.castShadow = true;
    s.add(base);

    const decal = canvasTex(1024, 1024, (g) => {
      const c = 512;
      g.clearRect(0, 0, 1024, 1024);
      g.strokeStyle = '#fff';
      g.fillStyle = '#fff';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(c, c, 470, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 2;
      g.beginPath();
      g.arc(c, c, 300, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const r0 = i % 6 ? 440 : 410;
        g.lineWidth = i % 6 ? 2 : 5;
        g.beginPath();
        g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
        g.lineTo(c + Math.cos(a) * 458, c + Math.sin(a) * 458);
        g.stroke();
      }
      g.lineWidth = 3;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        g.beginPath();
        g.moveTo(c + dx * 320, c + dy * 320);
        g.lineTo(c + dx * 380, c + dy * 380);
        g.stroke();
      }
      g.font = '600 34px "JetBrains Mono", monospace';
      g.textAlign = 'center';
      g.fillText('BAY 03 · LAUNCH', c, c + 362);
    });
    const ringMat = new THREE.MeshBasicMaterial({ map: decal, transparent: true, depthWrite: false, color: 0xffffff });
    const ring = new THREE.Mesh(new THREE.CircleGeometry(1.86, 96), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = PAD_TOP + 0.002;
    s.add(ring);
    this.accentMats.push(ringMat);

    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const edge = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.012, 8, 160), edgeMat);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = PAD_TOP;
    s.add(edge);
    this.accentMats.push(edgeMat);

    const under = new THREE.PointLight(0xffffff, 1.6, 4, 2);
    under.position.set(0, -0.25, 0);
    s.add(under);
    this.accentMats.push(under);
  }

  // ----------------------------------------------------------------- props
  private buildProps() {
    const s = this.scene;
    const dark = new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.55, metalness: 0.55 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0f1113, roughness: 0.45, metalness: 0.3 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.3, metalness: 0.95 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.7 });
    const led = (c: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3) });
    const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    // Workbench, back left.
    const bench = new THREE.Group();
    bench.position.set(-6.2, 0, -5.4);
    bench.rotation.y = 0.18;
    box(bench, 3.2, 0.07, 1.1, 0, 0.95, 0, wood);
    for (const [x, z] of [[-1.5, -0.45], [1.5, -0.45], [-1.5, 0.45], [1.5, 0.45]]) box(bench, 0.07, 0.95, 0.07, x, 0.47, z, steel);
    box(bench, 3.1, 0.04, 1.0, 0, 0.3, 0, dark);
    box(bench, 3.2, 1.1, 0.05, 0, 1.55, -0.55, dark); // pegboard
    for (let i = 0; i < 9; i++) box(bench, 0.04, 0.22 + (i % 3) * 0.08, 0.03, -1.3 + i * 0.32, 1.65, -0.5, steel);
    for (let i = 0; i < 4; i++) {
      const p = box(bench, 0.28, 0.09, 0.14, 0.5 + i * 0.34, 1.03, 0.2, black); // battery packs
      box(p, 0.03, 0.012, 0.012, 0.1, 0.05, 0.071, led(i < 3 ? 0x3cff9a : 0xffb02e));
    }
    box(bench, 0.5, 0.18, 0.32, -1.0, 1.08, 0.15, new THREE.MeshStandardMaterial({ color: 0xb33a22, roughness: 0.5, metalness: 0.4 })); // toolbox
    s.add(bench);

    // Tool cabinet and charging station, back right.
    const cab = new THREE.Group();
    cab.position.set(6.4, 0, -6.2);
    box(cab, 2.4, 1.05, 0.7, 0, 0.6, 0, dark);
    for (let i = 0; i < 5; i++) {
      box(cab, 2.3, 0.008, 0.01, 0, 0.25 + i * 0.18, 0.355, black);
      box(cab, 0.5, 0.025, 0.03, 0, 0.32 + i * 0.18, 0.37, steel);
    }
    box(cab, 2.42, 0.04, 0.72, 0, 1.14, 0, steel);
    for (let i = 0; i < 5; i++) {
      const c = box(cab, 0.3, 0.2, 0.22, -0.9 + i * 0.42, 1.26, 0, black);
      box(c, 0.2, 0.015, 0.01, 0, 0.04, 0.111, led(0x5ef0c4));
    }
    for (const x of [-1.15, 1.15]) for (const z of [-0.3, 0.3]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16), black);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.05, z);
      cab.add(w);
    }
    s.add(cab);

    // Flight cases stacked near the front right.
    const cases = new THREE.Group();
    cases.position.set(4.9, 0, -1.4);
    cases.rotation.y = -0.4;
    const shell = new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.6, metalness: 0.2 });
    const c1 = box(cases, 1.2, 0.48, 0.8, 0, 0.24, 0, shell);
    box(cases, 0.9, 0.38, 0.6, 0.05, 0.67, 0, shell).rotation.y = 0.1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(c1, 0.07, 0.5, 0.07, sx * 0.58, 0, sz * 0.38, steel);
    box(c1, 0.24, 0.04, 0.05, 0, 0.1, 0.41, steel);
    s.add(cases);

    // Shelving on the left wall.
    const shelf = new THREE.Group();
    shelf.position.set(-10.4, 0, 0.5);
    shelf.rotation.y = Math.PI / 2;
    for (const x of [-1.6, 1.6]) box(shelf, 0.06, 3.2, 0.06, x, 1.6, 0.25, steel), box(shelf, 0.06, 3.2, 0.06, x, 1.6, -0.25, steel);
    for (let k = 0; k < 4; k++) {
      box(shelf, 3.3, 0.04, 0.56, 0, 0.3 + k * 0.9, 0, dark);
      for (let j = 0; j < 4; j++) if ((j + k) % 3) box(shelf, 0.55 + ((j * 7 + k) % 3) * 0.15, 0.36, 0.42, -1.1 + j * 0.75, 0.52 + k * 0.9, 0, (j + k) % 2 ? black : shell);
    }
    s.add(shelf);

    // Tripod work light aimed at the pad.
    const lamp = new THREE.Group();
    lamp.position.set(-2.8, 0, 2.6);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = box(lamp, 0.025, 1.7, 0.025, Math.cos(a) * 0.3, 0.82, Math.sin(a) * 0.3, black);
      leg.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
    }
    box(lamp, 0.03, 0.5, 0.03, 0, 1.85, 0, black);
    const head = box(lamp, 0.42, 0.3, 0.12, 0, 2.15, 0, dark);
    head.lookAt(0, 0.3, 0);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1dc).multiplyScalar(2.2) }));
    face.position.z = 0.061;
    head.add(face);
    s.add(lamp);
  }

  private buildMonitor() {
    const t = canvasTex(512, 320, () => {});
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 0.04), new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.4 }));
    m.position.set(-5.6, 1.62, -5.2);
    m.rotation.y = 0.32;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    glass.position.z = 0.021;
    m.add(glass);
    this.scene.add(m);
    return t;
  }

  /** Telemetry trace on the bench monitor, redrawn a few times a second. */
  private drawMonitor() {
    const cv = this.screen.image as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#071014';
    g.fillRect(0, 0, 512, 320);
    g.strokeStyle = 'rgba(94,240,196,0.18)';
    g.lineWidth = 1;
    for (let x = 0; x < 512; x += 32) g.strokeRect(x, 0, 0.5, 320);
    for (let y = 0; y < 320; y += 32) g.strokeRect(0, y, 512, 0.5);
    const trace = (col: string, f: number, a: number, off: number) => {
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= 512; x += 4) {
        const y = 160 + off + Math.sin(x * f + this.t * 2) * a + Math.sin(x * f * 3.7 + this.t * 5) * a * 0.25;
        if (x) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    };
    trace('#5ef0c4', 0.03, 38, -50);
    trace('#ffb02e', 0.018, 24, 40);
    trace('#7fb8ff', 0.05, 14, 100);
    g.fillStyle = '#5ef0c4';
    g.font = '20px monospace';
    g.fillText(`ESC 4/4 OK   CELL 4.18V   T ${(31 + Math.sin(this.t) * 0.6).toFixed(1)}°C`, 14, 28);
    this.screen.needsUpdate = true;
  }

  private buildDust() {
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 3;
      pos.set([Math.cos(a) * r, Math.random() * 6.5, Math.sin(a) * r + 0.6], i * 3);
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
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: dot, size: 0.022, color: 0xfff0dc, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(pts);
    return pts;
  }

  private buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x8090a8, 0x0a0a0c, 0.25));

    const spot = new THREE.SpotLight(0xfff3e2, 260, 22, 0.42, 0.7, 2);
    spot.position.set(0, 7.2, 1.0);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.setScalar(2048);
    spot.shadow.bias = -0.0002;
    spot.shadow.normalBias = 0.015;
    spot.shadow.camera.near = 3;
    spot.shadow.camera.far = 12;
    s.add(spot, spot.target);

    // Soft visible beam under the spot.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 2.6, 7.1, 48, 1, true),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(0xffe8c8) } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV; varying float vY;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y / 7.1 + 0.5;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vY;
          void main() {
            float f = pow(abs(dot(vN, vV)), 2.2);
            float fade = smoothstep(0.0, 0.35, vY) * (0.35 + 0.65 * vY);
            gl_FragColor = vec4(uColor, f * fade * 0.075);
          }`,
      }),
    );
    beam.position.set(0, 3.55, 0.5);
    s.add(beam);

    // Cool wash from the door-side strips, warm fill from the front.
    for (const x of [-3.35, 3.35]) {
      const l = new THREE.RectAreaLight(0xcfe2ff, 5, 0.2, 5.4);
      l.position.set(x, 3.2, -6.85);
      l.lookAt(x, 3.2, 0);
      s.add(l);
    }
    const fill = new THREE.RectAreaLight(0xffe6cc, 1.6, 5, 1.2);
    fill.position.set(0, 5.5, 7);
    fill.lookAt(0, 0.6, 0);
    s.add(fill);
    const work = new THREE.SpotLight(0xfff1dc, 18, 9, 0.6, 0.8, 2);
    work.position.set(-2.8, 2.15, 2.6);
    work.target.position.set(0, 0.3, 0);
    s.add(work, work.target);
  }

  // --------------------------------------------------------------- control
  setDrone(spec: DroneSpec) {
    const turn = this.model?.group.rotation.y ?? -0.55;
    if (this.model) {
      this.scene.remove(this.model.group);
      this.model.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    const m = (this.model = buildDrone(spec));
    m.setSpin(0);
    m.group.rotation.y = turn;
    m.group.position.y = PAD_TOP - m.foot;
    m.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    this.scene.add(m.group);
    const size = new THREE.Box3().setFromObject(m.group).getSize(new THREE.Vector3());
    this.radius = Math.max(size.x, size.z) * 0.5;
    this.height = size.y;
  }

  setAccent(hex: string) {
    const c = new THREE.Color(hex);
    for (const m of this.accentMats) {
      if (m instanceof THREE.PointLight) m.color.copy(c);
      else m.color.copy(c).multiplyScalar(m.map ? 0.85 : 1.8);
    }
  }

  setShot(shot: Shot, spin = shot === 'hangar') {
    this.want = SHOTS[shot];
    this.spinDrone = spin;
  }

  run(on: boolean) {
    cancelAnimationFrame(this.raf);
    this.canvas.style.visibility = on ? 'visible' : 'hidden';
    if (on) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = (ms: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (ms - this.last) / 1000 || 0.016);
    this.last = ms;
    this.t += dt;

    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.renderer.setSize(w, h, false);
      this.composer.setSize(w, h);
      this.cam.aspect = w / h;
    }

    // Glide toward the wanted framing.
    const k = 1 - Math.exp(-dt * 2.4);
    const s = this.shot;
    const want = this.want;
    for (const key of Object.keys(s) as (keyof ShotDef)[]) s[key] += (want[key] - s[key]) * k;
    const narrow = w < 820;
    const dist = Math.max(s.min, s.dist * this.radius) * (narrow ? 1.35 : 1);
    const az = s.az + Math.sin(this.t * 0.11) * s.drift;
    const el = s.el + Math.sin(this.t * 0.07) * s.drift * 0.3;
    const ty = PAD_TOP + this.height * 0.4;
    this.cam.position.set(Math.sin(az) * Math.cos(el) * dist, ty + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    this.cam.lookAt(0, ty, 0);
    this.cam.setViewOffset(w, h, narrow ? 0 : s.shift * w, 0, w, h);
    this.cam.updateProjectionMatrix();

    if (this.model) {
      if (this.spinDrone) this.model.group.rotation.y += dt * 0.32;
      this.model.group.position.y = PAD_TOP - this.model.foot;
    }

    const p = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * 0.05;
      if (y > 6.5) y = 0;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(this.t * 0.3 + i) * dt * 0.02);
    }
    p.needsUpdate = true;
    if (Math.floor(this.t * 8) !== Math.floor((this.t - dt) * 8)) this.drawMonitor();

    this.composer.render(dt);
  };
}
