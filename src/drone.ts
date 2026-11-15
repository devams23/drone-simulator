// The player's drone: assisted flight physics and the first-person arm/prop rig.
import * as THREE from 'three';
import { type DroneSpec, physics } from './data';
import type { Controls } from './input';
import type { World } from './world';

export interface Env {
  world: World;
  wind: THREE.Vector3;
  waterY?: number;
}

const G = 9.81;
const CEILING = 115;
const tmp = new THREE.Vector3();
const nrm = new THREE.Vector3();

export class Drone {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0; // + = nose down / flying forward
  roll = 0; // + = banking right
  gimbal = -0.12; // camera tilt, - = looking down
  /** Where the camera (and the tool) points. */
  aim = new THREE.Vector3(0, 0, -1);
  camPitch = 0;

  ph: ReturnType<typeof physics>;
  hull: number;
  battery = 1;
  alive = true;
  armed = false;
  landed = true;
  spool = 0;
  load = 0;
  shake = 0;
  outOfBounds = false;
  deathReason = '';
  onDamage: (kind: string, amount: number) => void = () => {};

  rig = new THREE.Group();
  private props: THREE.Group[] = [];
  private discs: THREE.Mesh[] = [];
  private swayX = 0;
  private swayY = 0;
  private fallSpin = 0;

  constructor(public spec: DroneSpec) {
    this.ph = physics(spec);
    this.hull = this.ph.hull;
    this.buildRig();
  }

  // ---------------------------------------------------------------- physics
  update(dt: number, c: Controls, env: Env) {
    const ph = this.ph;
    const w = env.world;

    if (!this.alive) {
      // Wreck tumbles to the ground.
      this.vel.y -= G * dt;
      this.pos.addScaledVector(this.vel, dt);
      this.fallSpin += dt * 5;
      const floor = Math.max(w.heightAt(this.pos.x, this.pos.z), env.waterY ?? -1e9) + 0.3;
      if (this.pos.y < floor) {
        this.pos.y = floor;
        this.vel.set(0, 0, 0);
      }
      this.spool = Math.max(0, this.spool - dt * 1.5);
      this.shake = Math.max(0, this.shake - dt);
      return;
    }

    const dead = this.battery <= 0;
    let thr = c.throttle;
    let pIn = c.pitch;
    let rIn = c.roll;
    if (dead) {
      thr = -0.6;
      pIn = rIn = 0;
    }

    if (!this.armed && thr > 0.1 && !dead) this.armed = true;
    this.spool += ((this.armed ? 1 : 0) - this.spool) * Math.min(1, dt * 2.8);

    this.yaw -= (dead ? 0 : c.yaw) * ph.yawRate * dt + c.mouseYaw;
    this.gimbal = Math.max(-1.45, Math.min(0.5, this.gimbal + c.gimbal * 1.3 * dt + c.mouseGimbal));

    const flying = !this.landed;
    const k = Math.min(1, ph.tiltRate * dt);
    this.pitch += ((flying ? pIn * ph.maxTilt : 0) - this.pitch) * k;
    this.roll += ((flying ? rIn * ph.maxTilt : 0) - this.roll) * k;

    if (flying) {
      const sy = Math.sin(this.yaw);
      const cy = Math.cos(this.yaw);
      const af = G * Math.tan(this.pitch);
      const ar = G * Math.tan(this.roll);
      // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
      this.vel.x += (-sy * af + cy * ar) * dt;
      this.vel.z += (-cy * af - sy * ar) * dt;
      const centred = pIn === 0 && rIn === 0;
      const drag = (G * Math.tan(ph.maxTilt)) / ph.maxSpeed + (centred ? ph.brake : 0);
      const dk = Math.max(0, 1 - drag * dt);
      this.vel.x *= dk;
      this.vel.z *= dk;
      // Wind shoves light, unstable drones around.
      this.vel.x += env.wind.x * ph.windFactor * 0.8 * dt;
      this.vel.z += env.wind.z * ph.windFactor * 0.8 * dt;
      if (this.shake > 0.05) {
        this.vel.x += (Math.random() - 0.5) * this.shake * 14 * dt;
        this.vel.z += (Math.random() - 0.5) * this.shake * 14 * dt;
      }
      const targetVy = thr * ph.climb * (thr < 0 ? 0.85 : 1);
      this.vel.y += (targetVy - this.vel.y) * Math.min(1, 3.5 * dt);
      if (this.pos.y > CEILING && this.vel.y > 0) this.vel.y *= 0.7;

      // Edge of the map: signal weakens and the drone is pushed home.
      const d = Math.hypot(this.pos.x, this.pos.z);
      this.outOfBounds = d > w.bounds;
      if (this.outOfBounds) {
        const f = (d - w.bounds) * 0.5 * dt;
        this.vel.x -= (this.pos.x / d) * f;
        this.vel.z -= (this.pos.z / d) * f;
      }
      this.pos.addScaledVector(this.vel, dt);
    } else {
      this.vel.set(0, 0, 0);
      if (this.armed && thr > 0.1 && this.spool > 0.55) {
        this.landed = false;
        this.vel.y = 1.5;
        this.pos.y += 0.05;
      }
      if (thr < -0.5 && this.spool > 0.9) this.armed = false; // hold down to stop motors
    }

    if (!this.landed) {
      // Water
      if (env.waterY !== undefined && this.pos.y < env.waterY + 0.25 && w.heightAt(this.pos.x, this.pos.z) < env.waterY) {
        this.kill('Drone lost in the water');
        return;
      }
      // Ground
      const gh = w.heightAt(this.pos.x, this.pos.z) + 0.7;
      if (this.pos.y < gh) {
        const impact = -this.vel.y;
        const hs = Math.hypot(this.vel.x, this.vel.z);
        this.pos.y = gh;
        if (impact > 6 || hs > 10) this.damage((impact + hs * 0.6) * 2.4, 'crash');
        if (thr <= 0 && hs < 6) {
          this.landed = true;
          this.vel.set(0, 0, 0);
        } else {
          this.vel.y = Math.max(0, this.vel.y);
          this.vel.x *= 0.92;
          this.vel.z *= 0.92;
        }
      }
      // Buildings, trees, walls
      if (this.alive && w.resolve(this.pos, 0.75, nrm)) {
        const vn = this.vel.dot(nrm);
        if (vn < 0) {
          this.vel.addScaledVector(nrm, -vn * 1.35);
          if (-vn > 4.5) this.damage(-vn * 2.6, 'crash');
        }
        if (nrm.y > 0.7 && thr <= 0 && this.vel.length() < 4) {
          this.landed = true; // settled on a roof
          this.vel.set(0, 0, 0);
        }
      }
    }

    // Battery
    const tilt = (Math.abs(this.pitch) + Math.abs(this.roll)) / ph.maxTilt;
    this.load = Math.max(-1, Math.min(1, thr * 0.7 + tilt * 0.35));
    if (this.armed && !dead) {
      this.battery = Math.max(0, this.battery - (dt / ph.batterySec) * (0.55 + 0.3 * Math.max(0, thr) + 0.2 * Math.min(1, tilt)));
    }
    if (dead && this.landed) this.armed = false;
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }

  damage(amount: number, kind: string) {
    if (!this.alive) return;
    const a = amount * this.ph.damageMult;
    this.hull -= a;
    this.shake = Math.min(1, this.shake + a / 18);
    this.onDamage(kind, a);
    if (this.hull <= 0) {
      this.hull = 0;
      this.kill(kind === 'heat' ? 'Drone burned up' : kind === 'shot' ? 'Drone shot down' : 'Drone destroyed in a crash');
    }
  }

  kill(reason: string) {
    if (!this.alive) return;
    this.alive = false;
    this.hull = 0;
    this.deathReason = reason;
    this.landed = false;
    this.onDamage('dead', 0);
  }

  // ------------------------------------------------------------------ view
  applyCamera(cam: THREE.PerspectiveCamera, t: number, dt: number) {
    const s = this.shake;
    const vib = this.spool * 0.0016;
    cam.position.copy(this.pos);
    cam.position.x += Math.sin(t * 97) * vib + (Math.random() - 0.5) * s * 0.12;
    cam.position.y += Math.sin(t * 113) * vib + (Math.random() - 0.5) * s * 0.12;
    this.camPitch = this.gimbal - this.pitch * 0.42;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(
      this.camPitch + (Math.random() - 0.5) * s * 0.035,
      this.yaw + (this.alive ? 0 : this.fallSpin * 0.6),
      -this.roll * 0.75 + (this.alive ? 0 : Math.sin(this.fallSpin) * 0.8) + (Math.random() - 0.5) * s * 0.03,
    );
    const cp = Math.cos(this.camPitch);
    this.aim.set(-Math.sin(this.yaw) * cp, Math.sin(this.camPitch), -Math.cos(this.yaw) * cp);

    // The airframe lags behind the camera a little, so the arms visibly move.
    const kx = Math.min(1, dt * 7);
    this.swayX += (-this.roll * 0.35 - this.swayX) * kx;
    this.swayY += (-this.vel.y * 0.0045 - this.swayY) * kx;
    this.rig.rotation.set(-this.gimbal * 0.42 + this.pitch * 0.3, 0, this.swayX);
    this.rig.position.set(
      Math.sin(t * 131) * vib * 1.5,
      Math.max(-0.05, Math.min(0.05, this.swayY)) + Math.sin(t * 89) * vib * 1.5,
      0,
    );
    const spin = this.spool * (58 + this.load * 14) * dt;
    this.props.forEach((p, i) => (p.rotation.y += spin * (i % 2 ? -1 : 1)));
    for (const d of this.discs) (d.material as THREE.MeshBasicMaterial).opacity = 0.05 + this.spool * 0.17;
  }

  private buildRig() {
    const spec = this.spec;
    const b = spec.bulk;
    const body = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.45, metalness: 0.3 });
    const carbon = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.6, metalness: 0.4 });
    const accent = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.4, emissive: spec.accent, emissiveIntensity: 0.35 });
    const blade = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5 });

    for (const side of [-1, 1]) {
      const root = new THREE.Vector3(side * 0.15, -0.44, -0.2);
      const motor = new THREE.Vector3(side * 0.74, -0.31, -0.84);
      const arm = beam(root, motor, 0.06 * b, body);
      this.rig.add(arm);
      const stripe = beam(root.clone().lerp(motor, 0.55), root.clone().lerp(motor, 0.8), 0.064 * b, accent);
      this.rig.add(stripe);

      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * b, 0.065 * b, 0.1, 14), carbon);
      bell.position.copy(motor).add(tmp.set(0, 0.03, 0));
      this.rig.add(bell);

      const hub = new THREE.Group();
      hub.position.copy(motor).add(tmp.set(0, 0.095, 0));
      const rad = 0.3 + b * 0.06;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(rad, 28),
        new THREE.MeshBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2;
      hub.add(disc);
      this.discs.push(disc);
      for (let i = 0; i < 2; i++) {
        const bl = new THREE.Mesh(new THREE.BoxGeometry(rad * 2, 0.008, 0.05), blade);
        bl.rotation.y = (i * Math.PI) / 2;
        hub.add(bl);
      }
      const tip = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.006, 6, 32), accent);
      tip.rotation.x = Math.PI / 2;
      hub.add(tip);
      this.rig.add(hub);
      this.props.push(hub);
    }
    // Nose: the centre of the airframe peeking in at the bottom of the view.
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.34 * b, 0.09, 0.34), body);
    nose.position.set(0, -0.44, -0.5);
    this.rig.add(nose);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.2 * b, 0.02, 0.03), accent);
    led.position.set(0, -0.39, -0.66);
    this.rig.add(led);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.34, 10), carbon);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.43, -0.78);
    this.rig.add(barrel);
  }
}

/** A box stretched between two points. */
function beam(a: THREE.Vector3, b: THREE.Vector3, thick: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(thick, thick * 0.7, a.distanceTo(b)), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.lookAt(b);
  return m;
}

/** Third-person model, shown in the hangar. */
export function buildDroneModel(spec: DroneSpec) {
  const g = new THREE.Group();
  const b = spec.bulk;
  const body = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.4, metalness: 0.3 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.6, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: spec.accent, emissive: spec.accent, emissiveIntensity: 0.4 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.5 * b, 0.16, 0.8 * b), body);
  g.add(hull);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.2 * b, 16, 10), carbon);
  canopy.scale.set(1, 0.5, 1.5);
  canopy.position.y = 0.1;
  g.add(canopy);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), accent);
  eye.position.set(0, -0.02, -0.42 * b);
  g.add(eye);

  const spinners: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const end = new THREE.Vector3(sx * 0.62 * b, 0.02, sz * 0.62 * b);
      g.add(beam(new THREE.Vector3(sx * 0.15, 0, sz * 0.2), end, 0.06 * b, sz < 0 ? body : carbon));
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * b, 0.07 * b, 0.1, 12), carbon);
      bell.position.copy(end).y += 0.06;
      g.add(bell);
      const hub = new THREE.Group();
      hub.position.copy(end).y += 0.13;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.34 * b, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2;
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.66 * b, 0.01, 0.05), carbon);
      hub.add(disc, bl);
      g.add(hub);
      spinners.push(hub);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 6), carbon);
      leg.position.set(sx * 0.2 * b, -0.2, sz * 0.25 * b);
      g.add(leg);
    }
  }
  // Mission payload slung underneath.
  if (spec.mission === 'fire') {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * b, 0.13 * b, 0.5 * b, 14), new THREE.MeshStandardMaterial({ color: 0x35a7ff, roughness: 0.3 }));
    tank.rotation.x = Math.PI / 2;
    tank.position.y = -0.18;
    g.add(tank);
  } else if (spec.mission === 'strike') {
    for (const sx of [-1, 1]) {
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.6 * b, 8), carbon);
      gun.rotation.x = Math.PI / 2;
      gun.position.set(sx * 0.12, -0.14, -0.2);
      g.add(gun);
    }
  } else {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.3 * b, 0.24 * b, 0.3 * b), new THREE.MeshStandardMaterial({ color: 0xc98a3c, roughness: 0.8 }));
    crate.position.y = -0.22;
    g.add(crate);
  }
  g.userData.spinners = spinners;
  return g;
}
