// Courses: gates, slots, parcels and pads laid over a calm world.
// One CourseRun lives for one attempt. Everything it builds is a handful of
// shared geometries and three materials, so it costs next to nothing.
import * as THREE from 'three';
import type { Sound } from './audio';
import type { WorldId } from './data';
import type { Drone } from './drone';
import type { Marker, Mission } from './missions/base';

export type ModeId = 'gates' | 'courier' | 'thread' | 'touch';
type V3 = [number, number, number];
type V2 = [number, number];

/** Gate and slot heights are metres above the ground (or water) beneath them. */
export type Step =
  | { kind: 'ring'; at: V3; r?: number; yaw?: number }
  | { kind: 'slot'; at: V3; w: number; h: number; yaw?: number }
  | { kind: 'pickup'; at: V2 }
  | { kind: 'drop'; at: V2; r?: number }
  | { kind: 'land'; at: V2; r?: number };

export interface CourseDef {
  id: string;
  mode: ModeId;
  world: WorldId;
  name: string;
  /** One line under the name on the ladder. */
  line: string;
  /** Seconds. Finishing at or under par earns Smooth. */
  par: number;
  steps: Step[];
}

export interface CourseResult {
  time: number;
  par: number;
  touches: number;
  crashes: number;
  clean: boolean;
  smooth: boolean;
  /** 1 (finished) + clean + smooth. */
  marks: number;
  best: number;
  newBest: boolean;
}

// ------------------------------------------------------------ saved progress
export interface CourseRecord {
  best?: number;
  clean?: boolean;
  smooth?: boolean;
}
const KEY = 'skyduty.courses';
export function progress(): Record<string, CourseRecord> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}
function save(id: string, time: number, clean: boolean, smooth: boolean) {
  const all = progress();
  const r = (all[id] ??= {});
  const newBest = r.best === undefined || time < r.best;
  if (newBest) r.best = time;
  r.clean ||= clean;
  r.smooth ||= smooth;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode: progress just isn't kept */
  }
  return { best: r.best!, newBest };
}
/** The first course is always open; each next one opens on a clean finish of the one before. */
export function isOpen(ladder: CourseDef[], i: number) {
  return i === 0 || !!progress()[ladder[i - 1].id]?.clean;
}

// ------------------------------------------------------------------ helpers
const UP = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const n = new THREE.Vector3();
const q = new THREE.Vector3();
const TUBE = 0.16;
const BAR = 0.15;
const ROPE = 3.6;
/** Normal speed above which touching a frame becomes a crash. */
const CRASH = 6;

type State = 'next' | 'soon' | 'later' | 'done';
interface Item {
  step: Step;
  /** Gate centre, or the surface point of a pad. */
  pos: THREE.Vector3;
  yaw: number;
  obj: THREE.Object3D;
  parts: THREE.Mesh[];
  /** Pickup: the crate waiting there. */
  crate?: THREE.Mesh;
  lastZ?: number;
}

const shared = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = shared.get(key);
  if (!g) shared.set(key, (g = make()));
  return g;
}

export class CourseRun {
  index = 0;
  time = 0;
  started = false;
  crashes = 0;
  done = false;
  /** 0..1 while hooking a parcel or holding a landing. */
  hold = 0;
  result?: CourseResult;
  readonly total: number;

  private items: Item[] = [];
  private group = new THREE.Group();
  private mats: Record<Exclude<State, 'done'>, THREE.MeshStandardMaterial>;
  private beam: THREE.Mesh;
  readonly cp = { pos: new THREE.Vector3(), yaw: 0 };
  private marker: Marker = { pos: new THREE.Vector3(), icon: '', color: '#ffd58a', label: '', visible: true };
  // Parcel on the rope.
  private crate?: THREE.Mesh;
  private p = new THREE.Vector3();
  private pp = new THREE.Vector3();
  private rope: THREE.Line;
  private ropePts: THREE.BufferAttribute;
  private carrying = false;

  constructor(
    readonly def: CourseDef,
    private m: Mission,
    scene: THREE.Scene,
    private sound: Sound,
  ) {
    const mk = (color: number, emissive: number, opacity: number) =>
      new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 1, roughness: 0.4, metalness: 0.1, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    this.mats = {
      next: mk(0xfff1d6, 0xffb648, 1),
      soon: mk(0xd7f2ee, 0x3f8f86, 0.75),
      later: mk(0xd7f2ee, 0x2a5f59, 0.28),
    };
    this.mats.next.emissiveIntensity = 2.4;

    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(geo('beam', () => new THREE.CylinderGeometry(1, 1, 60, 24, 1, true).translate(0, 30, 0)), beamMat);
    this.beam.visible = false;
    this.group.add(this.beam);

    const ropeGeo = new THREE.BufferGeometry();
    this.ropePts = new THREE.BufferAttribute(new Float32Array(6), 3);
    ropeGeo.setAttribute('position', this.ropePts);
    this.rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0x1c1f24 }));
    this.rope.frustumCulled = false;
    this.rope.visible = false;
    this.group.add(this.rope);

    // Lay out every step.
    let prev = m.spawn.clone();
    const steps = def.steps;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const pos = this.place(s);
      const after = steps[i + 1] ? this.place(steps[i + 1]) : pos.clone().sub(prev).add(pos);
      const yaw = 'yaw' in s && s.yaw !== undefined ? s.yaw : Math.atan2(-(after.x - prev.x), -(after.z - prev.z));
      const it: Item = { step: s, pos, yaw, obj: new THREE.Group(), parts: [] };
      this.build(it);
      this.items.push(it);
      this.group.add(it.obj);
      prev = pos;
    }
    this.total = this.items.length;
    scene.add(this.group);
    this.cp.pos.copy(m.spawn).y += 2.5;
    this.cp.yaw = this.face(m.spawn, 0);
    this.refresh();
  }

  // --------------------------------------------------------------- layout
  private ground(x: number, z: number) {
    return Math.max(this.m.world.heightAt(x, z), this.m.waterY ?? -1e9);
  }

  /** Ground, water or the top of whatever box stands there (a roof, a ledge). */
  private surface(x: number, z: number) {
    let s = this.ground(x, z);
    for (const b of this.m.world.boxes) {
      if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y > s) s = b.max.y;
    }
    return s;
  }

  private place(s: Step) {
    if (s.kind === 'ring' || s.kind === 'slot') {
      const [x, h, z] = s.at;
      return new THREE.Vector3(x, this.ground(x, z) + h, z);
    }
    const [x, z] = s.at;
    return new THREE.Vector3(x, this.surface(x, z), z);
  }

  private build(it: Item) {
    const s = it.step;
    const add = (g: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(g, this.mats.later);
      mesh.position.set(x, y, z);
      it.obj.add(mesh);
      it.parts.push(mesh);
      return mesh;
    };
    it.obj.position.copy(it.pos);
    it.obj.rotation.y = it.yaw;
    if (s.kind === 'ring') {
      const r = s.r ?? 4;
      add(geo(`ring${r}`, () => new THREE.TorusGeometry(r, TUBE, 10, 64)));
      add(geo(`ringo${r}`, () => new THREE.TorusGeometry(r + 0.42, 0.035, 6, 64)));
    } else if (s.kind === 'slot') {
      const { w, h } = s;
      const t = BAR * 2;
      add(geo(`bx${w}`, () => new THREE.BoxGeometry(w + t, t, t)), 0, h / 2);
      add(geo(`bx${w}`, () => new THREE.BoxGeometry(w + t, t, t)), 0, -h / 2);
      add(geo(`by${h}`, () => new THREE.BoxGeometry(t, h, t)), w / 2);
      add(geo(`by${h}`, () => new THREE.BoxGeometry(t, h, t)), -w / 2);
    } else {
      const r = s.kind === 'pickup' ? 2.4 : (s.r ?? (s.kind === 'land' ? 2.2 : 3));
      const ring = add(geo(`pad${r}`, () => new THREE.RingGeometry(r - 0.14, r, 64).rotateX(-Math.PI / 2)), 0, 0.06);
      ring.renderOrder = 2;
      if (s.kind === 'land') {
        add(geo('crossA', () => new THREE.PlaneGeometry(0.9, 0.08).rotateX(-Math.PI / 2)), 0, 0.06);
        add(geo('crossB', () => new THREE.PlaneGeometry(0.08, 0.9).rotateX(-Math.PI / 2)), 0, 0.06);
      }
      if (s.kind === 'pickup') {
        const crate = new THREE.Mesh(
          geo('crate', () => new THREE.BoxGeometry(0.7, 0.5, 0.7)),
          new THREE.MeshStandardMaterial({ color: 0xb98b57, roughness: 0.85 }),
        );
        const tape = new THREE.Mesh(geo('tape', () => new THREE.BoxGeometry(0.72, 0.52, 0.12)), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.6 }));
        crate.add(tape);
        crate.castShadow = true;
        crate.position.copy(it.pos).y += 0.25;
        crate.rotation.y = it.yaw;
        it.crate = crate;
        this.group.add(crate);
      }
    }
  }

  /** Yaw that looks from p toward step i (or keeps the current heading past the end). */
  private face(p: THREE.Vector3, i: number) {
    const t = this.items[i]?.pos;
    if (!t) return this.cp.yaw;
    return Math.atan2(-(t.x - p.x), -(t.z - p.z));
  }

  private refresh() {
    this.items.forEach((it, i) => {
      const st: State = i < this.index ? 'done' : i === this.index ? 'next' : i === this.index + 1 ? 'soon' : 'later';
      const pad = it.step.kind !== 'ring' && it.step.kind !== 'slot';
      // Finished pads vanish; a delivered parcel stays where it was set down.
      it.obj.visible = st !== 'done' && (!pad || i <= this.index + 1);
      if (st !== 'done') for (const p of it.parts) p.material = this.mats[st];
    });
    const it = this.items[this.index];
    const pad = it && it.step.kind !== 'ring' && it.step.kind !== 'slot';
    this.beam.visible = !!pad;
    if (pad) {
      const r = it.step.kind === 'pickup' ? 2.4 : ((it.step as { r?: number }).r ?? 2.5);
      this.beam.position.copy(it.pos);
      this.beam.scale.set(r * 0.8, 1, r * 0.8);
    }
    if (it) {
      const k = it.step.kind;
      const gates = this.items.filter((x) => x.step.kind === 'ring' || x.step.kind === 'slot');
      const g = gates.indexOf(it) + 1;
      this.marker.pos.copy(it.pos);
      if (pad) this.marker.pos.y += 1.6;
      this.marker.icon = k === 'pickup' ? '▣' : k === 'drop' ? '↓' : k === 'land' ? '+' : String(g);
      this.marker.label = k === 'pickup' ? 'Parcel' : k === 'drop' ? 'Drop' : k === 'land' ? 'Set down' : `Gate ${g} of ${gates.length}`;
    }
  }

  // ----------------------------------------------------------------- run
  get markers(): Marker[] {
    return this.done ? [] : [this.marker];
  }

  get touches() {
    return this.drone?.touches ?? 0;
  }
  private drone?: Drone;

  /** What the step counter should call the current item. */
  get stepLabel() {
    const it = this.items[this.index];
    if (!it) return 'Finish';
    return this.marker.label ?? '';
  }

  update(dt: number, d: Drone) {
    this.drone = d;
    if (this.done) return;
    if (!this.started && !d.landed) this.started = true;
    if (this.started) this.time += dt;
    if (this.carrying) this.swing(dt, d);
    if (!d.alive) return;
    // Frames near the current step can be touched.
    for (let i = Math.max(0, this.index - 1); i <= Math.min(this.items.length - 1, this.index + 2); i++) this.contact(this.items[i], d);

    const it = this.items[this.index];
    const s = it.step;
    if (s.kind === 'ring' || s.kind === 'slot') {
      v.copy(d.pos).sub(it.pos).applyAxisAngle(UP, -it.yaw);
      const z = v.z;
      const inside = s.kind === 'ring' ? Math.hypot(v.x, v.y) < (s.r ?? 4) - TUBE : Math.abs(v.x) < s.w / 2 && Math.abs(v.y) < s.h / 2;
      if (it.lastZ !== undefined && Math.sign(z) !== Math.sign(it.lastZ) && Math.abs(z - it.lastZ) < 4 && inside) {
        this.cp.pos.copy(it.pos);
        this.cp.pos.y = Math.max(this.cp.pos.y, this.ground(it.pos.x, it.pos.z) + 2);
        this.advance(d, 1320);
        return;
      }
      it.lastZ = z;
    } else if (s.kind === 'pickup') {
      const c = it.crate!;
      const dh = Math.hypot(d.pos.x - c.position.x, d.pos.z - c.position.z);
      const dy = d.pos.y - c.position.y;
      const ok = dh < 2.4 && dy > 0.8 && dy < 5.5 && d.vel.length() < 4;
      this.hold = ok ? Math.min(1, this.hold + dt / 0.7) : Math.max(0, this.hold - dt * 2);
      if (this.hold >= 1) {
        this.hold = 0;
        this.crate = c;
        this.carrying = true;
        this.p.copy(c.position);
        this.pp.copy(c.position);
        this.rope.visible = true;
        this.sound.pickup();
        this.cp.pos.copy(it.pos).y += 4;
        this.advance(d, 0);
      }
    } else if (s.kind === 'drop') {
      const r = s.r ?? 3;
      const sp = this.p.distanceTo(this.pp) / Math.max(dt, 1e-3);
      const low = this.p.y - it.pos.y < 0.75;
      if (this.carrying && Math.hypot(this.p.x - it.pos.x, this.p.z - it.pos.z) < r - 0.3 && low && sp < 3) {
        this.carrying = false;
        this.rope.visible = false;
        this.crate!.position.set(this.p.x, it.pos.y + 0.25, this.p.z);
        this.crate!.rotation.set(0, d.yaw, 0);
        this.crate = undefined;
        this.sound.release();
        this.cp.pos.copy(it.pos).y += 3;
        this.advance(d, 0);
      }
    } else {
      const r = s.r ?? 2.2;
      const on = d.landed && Math.hypot(d.pos.x - it.pos.x, d.pos.z - it.pos.z) < r && Math.abs(d.pos.y - 0.7 - it.pos.y) < 1;
      this.hold = on ? Math.min(1, this.hold + dt / 2) : 0;
      if (this.hold >= 1) {
        this.hold = 0;
        this.cp.pos.copy(it.pos).y += 2.5;
        this.advance(d, 0);
      }
    }
  }

  private advance(d: Drone, tone: number) {
    this.index++;
    this.cp.yaw = this.face(this.cp.pos, this.index);
    if (this.index >= this.items.length) {
      this.finish(d);
      return;
    }
    if (tone) this.sound.beep(tone, 0.07);
    else this.sound.good();
    this.refresh();
  }

  private finish(d: Drone) {
    this.done = true;
    this.beam.visible = false;
    const touches = d.touches;
    const clean = touches === 0 && this.crashes === 0;
    const smooth = this.time <= this.def.par;
    const { best, newBest } = save(this.def.id, this.time, clean, smooth);
    this.result = { time: this.time, par: this.def.par, touches, crashes: this.crashes, clean, smooth, marks: 1 + (clean ? 1 : 0) + (smooth ? 1 : 0), best, newBest };
    this.refresh();
  }

  /** Bounce off a gate or slot frame; hard enough and it is a crash. */
  private contact(it: Item, d: Drone) {
    const s = it.step;
    if (s.kind !== 'ring' && s.kind !== 'slot') return;
    if (it.pos.distanceToSquared(d.pos) > 400) return;
    const DR = 0.4 * d.spec.bulk;
    v.copy(d.pos).sub(it.pos).applyAxisAngle(UP, -it.yaw);
    let dist: number;
    let reach: number;
    if (s.kind === 'ring') {
      const r = s.r ?? 4;
      const rad = Math.hypot(v.x, v.y) || 1e-6;
      const a = rad - r;
      dist = Math.hypot(a, v.z) || 1e-6;
      reach = TUBE + DR;
      n.set((v.x / rad) * (a / dist), (v.y / rad) * (a / dist), v.z / dist);
    } else {
      // Closest point on the four bars of the frame.
      const hw = s.w / 2;
      const hh = s.h / 2;
      const cx = Math.max(-hw, Math.min(hw, v.x));
      const cy = Math.max(-hh, Math.min(hh, v.y));
      const inX = Math.abs(v.x) < hw;
      const inY = Math.abs(v.y) < hh;
      // Inside the opening: the nearest bar is the nearest edge.
      if (inX && inY) {
        const dx = hw - Math.abs(v.x);
        const dy = hh - Math.abs(v.y);
        if (dx < dy) q.set(Math.sign(v.x) * hw, v.y, 0);
        else q.set(v.x, Math.sign(v.y) * hh, 0);
      } else q.set(cx, cy, 0);
      n.copy(v).sub(q);
      dist = n.length() || 1e-6;
      n.divideScalar(dist);
      reach = BAR + DR;
    }
    if (dist >= reach) return;
    n.applyAxisAngle(UP, it.yaw);
    d.pos.addScaledVector(n, reach - dist);
    const vn = d.vel.dot(n);
    if (vn < 0) {
      if (-vn > CRASH) {
        d.kill('Clipped the frame');
        return;
      }
      d.vel.addScaledVector(n, -vn * 1.5);
      d.touch();
    }
  }

  /** The parcel swings under the drone on a rope (verlet pendulum). */
  private swing(dt: number, d: Drone) {
    const hook = q.copy(d.pos);
    hook.y -= 0.35;
    v.copy(this.p).sub(this.pp).multiplyScalar(0.996);
    this.pp.copy(this.p);
    this.p.add(v);
    this.p.y -= 9.81 * dt * dt;
    n.copy(this.p).sub(hook);
    const len = n.length();
    if (len > ROPE) {
      const excess = len - ROPE;
      n.divideScalar(len);
      this.p.copy(hook).addScaledVector(n, ROPE);
      // The load tugs back on the airframe.
      if (d.alive) d.vel.addScaledVector(n, Math.min((excess / Math.max(dt, 1e-3)) * 0.08, 2.5));
    }
    const it = this.items[this.index];
    const zone = it?.step.kind === 'drop' && Math.hypot(this.p.x - it.pos.x, this.p.z - it.pos.z) < ((it.step as { r?: number }).r ?? 3);
    const speed = this.p.distanceTo(this.pp) / Math.max(dt, 1e-3);
    // Ground, water, roofs.
    const floor = (zone ? it.pos.y : this.ground(this.p.x, this.p.z)) + 0.25;
    if (this.p.y < floor) {
      this.p.y = floor;
      this.pp.y = floor;
      this.pp.x += (this.p.x - this.pp.x) * 0.5;
      this.pp.z += (this.p.z - this.pp.z) * 0.5;
      if (!zone && speed > 1.2 && d.alive) d.touch();
    }
    if (this.m.world.resolve(this.p, 0.36, n)) {
      v.copy(this.p).sub(this.pp);
      const vn = v.dot(n);
      if (vn < 0) {
        v.addScaledVector(n, -vn * 1.3);
        this.pp.copy(this.p).sub(v);
      }
      if (!zone && speed > 0.8 && d.alive) d.touch();
    }
    const c = this.crate!;
    c.position.copy(this.p);
    c.rotation.y = d.yaw;
    const a = this.ropePts.array as Float32Array;
    a[0] = hook.x;
    a[1] = hook.y;
    a[2] = hook.z;
    a[3] = this.p.x;
    a[4] = this.p.y + 0.25;
    a[5] = this.p.z;
    this.ropePts.needsUpdate = true;
  }

  /** Put the drone back at the last checkpoint, hovering and facing the next step. */
  respawn(d: Drone) {
    this.crashes++;
    this.hold = 0;
    d.revive(this.cp.pos, this.cp.yaw);
    for (const it of this.items) it.lastZ = undefined;
    if (this.carrying) {
      this.p.copy(this.cp.pos).y -= ROPE * 0.8;
      this.pp.copy(this.p);
    }
  }
}
