// The drone studio rendered behind every menu: a soft slate sweep with the
// selected drone on a pale pad. Deliberately bare so the drone is the subject.
// The camera glides between framings as the player moves through the menus.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildDrone, type DroneModel } from './models/drone';
import type { DroneSpec } from './data';

export type Shot = 'intro' | 'title' | 'missions' | 'roam' | 'hangar' | 'brief';

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
  /** Vertical framing offset as a fraction of the screen height (positive = drone higher). */
  lift: number;
}
const SHOTS: Record<Shot, ShotDef> = {
  intro: { az: 0.18, el: 0.07, dist: 4.2, min: 3.0, shift: 0, drift: 0.08, lift: 0.1 },
  title: { az: 0.62, el: 0.13, dist: 6.2, min: 4.6, shift: -0.2, drift: 0.14, lift: 0 },
  missions: { az: -0.5, el: 0.2, dist: 3.6, min: 2.6, shift: 0, drift: 0.1, lift: 0.17 },
  roam: { az: 0.95, el: 0.2, dist: 3.6, min: 2.6, shift: 0, drift: 0.1, lift: 0.17 },
  hangar: { az: 0.32, el: 0.2, dist: 2.75, min: 1.9, shift: 0, drift: 0.04, lift: 0.04 },
  brief: { az: -1.25, el: 0.09, dist: 2.6, min: 1.8, shift: 0.24, drift: 0.05, lift: 0 },
};
/** Where the opening dolly starts: low and far back in the dark. */
/** Dev: ?zoom=0.5 brings the studio camera closer for inspecting models. */
const ZOOM = Number(new URLSearchParams(location.search).get('zoom') ?? 1) || 1;
const OPENING: ShotDef = { az: 1.1, el: 0.03, dist: 6.5, min: 6.5, shift: 0, drift: 0, lift: 0.1 };

const PAD_TOP = 0.1;

/** Floor and lower backdrop colour; the sweep fades into it with no horizon. */
const FLOOR = 0x98a4b3;

export class Garage {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(34, 1, 0.05, 120);
  private model?: DroneModel;
  private radius = 0.6;
  private height = 0.3;
  private shot: ShotDef = { ...OPENING };
  private want: ShotDef = SHOTS.intro;
  private spinDrone = false;
  private accentMats: THREE.MeshBasicMaterial[] = [];
  private t = 0;
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'garage';
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;

    const s = this.scene;
    s.fog = null;
    const pmrem = new THREE.PMREMGenerator(r);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.7;
    pmrem.dispose();

    this.buildStudio();
    this.buildPad();
    this.buildLights();
  }

  // ---------------------------------------------------------------- studio
  /** A seamless photo-studio sweep: one soft slate gradient, nothing else. */
  private buildStudio() {
    const s = this.scene;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(60, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(0x5d6b7c) }, mid: { value: new THREE.Color(0xa2aebb) }, low: { value: new THREE.Color(FLOOR) } },
        vertexShader: /* glsl */ `
          varying vec3 vP;
          void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP;
          void main() {
            float h = normalize(vP).y;
            vec3 c = mix(low, mid, smoothstep(-0.35, 0.02, h));
            c = mix(c, top, smoothstep(0.0, 0.75, h));
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    s.add(dome);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.ShadowMaterial({ color: 0x2c3846, opacity: 0.28 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
  }

  // ------------------------------------------------------------------- pad
  private buildPad() {
    const s = this.scene;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9, 1.96, PAD_TOP, 96),
      new THREE.MeshStandardMaterial({ color: 0xe4e9ee, roughness: 0.38, metalness: 0.05 }),
    );
    base.position.y = PAD_TOP / 2;
    base.receiveShadow = true;
    base.castShadow = true;
    s.add(base);

    // One thin accent line around the rim, in the colour of the chosen operation.
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const edge = new THREE.Mesh(new THREE.TorusGeometry(1.93, 0.008, 8, 160), edgeMat);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = PAD_TOP + 0.001;
    s.add(edge);
    this.accentMats.push(edgeMat);
  }

  private buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xe8eef5, 0x56616f, 1.3));
    const key = new THREE.DirectionalLight(0xfff6ec, 2.2);
    key.position.set(3, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.setScalar(2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -4;
    key.shadow.camera.right = key.shadow.camera.top = 4;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 20;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.02;
    s.add(key);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 1.1);
    rim.position.set(-4, 3, -5);
    s.add(rim);
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
    // Frame on a blend of this drone's size and a fixed reference, so a big
    // airframe fills more of the bay than a small one.
    this.radius = (Math.max(size.x, size.z) * 0.5 + 0.9) * 0.5;
    this.height = size.y;
  }

  setAccent(hex: string) {
    const c = new THREE.Color(hex);
    for (const m of this.accentMats) m.color.copy(c);
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
      this.cam.aspect = w / h;
    }

    // Glide toward the wanted framing.
    const k = 1 - Math.exp(-dt * (this.want === SHOTS.intro ? 0.7 : 2.4));
    const s = this.shot;
    const want = this.want;
    for (const key of Object.keys(s) as (keyof ShotDef)[]) s[key] += (want[key] - s[key]) * k;
    const narrow = w < 820;
    const dist = Math.max(s.min, s.dist * this.radius) * (narrow ? 1.35 : 1) * ZOOM;
    const az = s.az + Math.sin(this.t * 0.11) * s.drift;
    const el = s.el + Math.sin(this.t * 0.07) * s.drift * 0.3;
    const ty = PAD_TOP + this.height * 0.4;
    this.cam.position.set(Math.sin(az) * Math.cos(el) * dist, ty + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    this.cam.lookAt(0, ty, 0);
    this.cam.setViewOffset(w, h, narrow ? 0 : s.shift * w, s.lift * h, w, h);
    this.cam.updateProjectionMatrix();

    if (this.model) {
      if (this.spinDrone) this.model.group.rotation.y += dt * 0.32;
      this.model.group.position.y = PAD_TOP - this.model.foot;
    }

    this.renderer.render(this.scene, this.cam);
  };
}
