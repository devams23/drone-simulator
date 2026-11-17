// The player's drone: assisted flight physics and the first-person arm/prop rig.
import * as THREE from 'three';
import { type DroneSpec, physics } from './data';
import type { Controls } from './input';
import { buildDrone, type DroneModel } from './models/drone';
import type { World } from './world';

export interface Env {
  world: World;
  wind: THREE.Vector3;
  waterY?: number;
}

const G = 9.81;
const CEILING = 260;
const nrm = new THREE.Vector3();
const CHASE_SCALE = 1.7;
const tmp = new THREE.Vector3();
const look = new THREE.Vector3();

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
  /** Full airframe seen from outside in chase view; added to the scene by the game. */
  body = new THREE.Group();
  view: 'fpv' | 'chase' = 'fpv';
  private model: DroneModel;
  private outer?: DroneModel;
  // Chase camera state.
  private camPos = new THREE.Vector3(NaN, 0, 0);
  private camRoll = 0;
  private bodyP = 0;
  private bodyR = 0;
  private swayX = 0;
  private swayY = 0;
  private fallSpin = 0;
  // Smoothed camera attitude (NaN = snap on first use).
  private sPitch = NaN;
  private sRoll = NaN;
  private sYaw = NaN;

  constructor(public spec: DroneSpec) {
    this.ph = physics(spec);
    this.hull = this.ph.hull;
    // The real airframe hangs above and behind the camera, which sits under
    // the nose: the front arms and props frame the top corners of the view.
    this.model = buildDrone(spec, { fpv: true });
    this.model.group.position.set(0, 0.42 * spec.bulk, 0.08 * spec.bulk);
    this.rig.add(this.model.group);
  }

  /** Switch between the cockpit camera and the third-person chase camera. */
  setView(v: 'fpv' | 'chase') {
    this.view = v;
    if (v === 'chase' && !this.outer) {
      // Shown a little larger than life so it reads clearly on screen.
      this.outer = buildDrone(this.spec);
      this.outer.group.scale.setScalar(CHASE_SCALE);
      this.outer.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      this.body.add(this.outer.group);
    }
    this.rig.visible = v === 'fpv';
    this.body.visible = v === 'chase';
    this.camPos.x = NaN;
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
  applyCamera(cam: THREE.PerspectiveCamera, t: number, dt: number, ground: (x: number, z: number) => number = () => -1e9) {
    const s = this.shake;
    const vib = this.spool * 0.0005;
    // Smooth, band-limited shake instead of per-frame random jitter.
    const n1 = (Math.sin(t * 31.7) + Math.sin(t * 47.3 + 1.3)) * 0.5;
    const n2 = (Math.sin(t * 29.1 + 2.1) + Math.sin(t * 53.9)) * 0.5;
    cam.position.copy(this.pos);
    cam.position.x += Math.sin(t * 23) * vib + n1 * s * 0.06;
    cam.position.y += Math.sin(t * 19) * vib + n2 * s * 0.06;
    // Low-pass the camera attitude so the view glides rather than snaps.
    const wantP = this.gimbal - this.pitch * 0.42;
    const wantR = -this.roll * 0.75;
    if (Number.isNaN(this.sPitch) || Math.abs(Math.atan2(Math.sin(this.yaw - this.sYaw), Math.cos(this.yaw - this.sYaw))) > 1) {
      this.sPitch = wantP;
      this.sRoll = wantR;
      this.sYaw = this.yaw;
    }
    const ka = 1 - Math.exp(-dt * 8);
    this.sPitch += (wantP - this.sPitch) * ka;
    this.sRoll += (wantR - this.sRoll) * ka;
    this.sYaw += Math.atan2(Math.sin(this.yaw - this.sYaw), Math.cos(this.yaw - this.sYaw)) * (1 - Math.exp(-dt * 14));
    this.camPitch = this.sPitch;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(
      this.camPitch + n2 * s * 0.02,
      this.sYaw + (this.alive ? 0 : this.fallSpin * 0.6),
      this.sRoll + (this.alive ? 0 : Math.sin(this.fallSpin) * 0.8) + n1 * s * 0.018,
    );
    const cp = Math.cos(this.camPitch);
    this.aim.set(-Math.sin(this.sYaw) * cp, Math.sin(this.camPitch), -Math.cos(this.sYaw) * cp);
    const spin = this.spool * (58 + this.load * 14) * dt;

    if (this.view === 'chase') {
      this.chase(cam, t, dt, ground, n1, n2);
      const o = this.outer!;
      o.props.forEach((p, i) => (p.rotation.y += spin * (i === 0 || i === 3 ? 1 : -1)));
      o.setSpin(this.spool);
      return;
    }

    // The airframe lags behind the camera a little, so the arms visibly move.
    const kx = 1 - Math.exp(-dt * 5);
    this.swayX += (-this.roll * 0.35 - this.swayX) * kx;
    this.swayY += (-this.vel.y * 0.0045 - this.swayY) * kx;
    this.rig.rotation.set(-this.gimbal * 0.42 + this.pitch * 0.3, 0, this.swayX);
    this.rig.position.set(
      Math.sin(t * 27) * vib,
      Math.max(-0.05, Math.min(0.05, this.swayY)) + Math.sin(t * 21) * vib,
      0,
    );
    this.model.props.forEach((p, i) => (p.rotation.y += spin * (i === 0 || i === 3 ? 1 : -1)));
    this.model.setSpin(this.spool);
  }

  /**
   * Third-person camera: trails the drone on a spring so it swings wide in
   * turns, dips and rises with climbs, and banks with the drone like a ride.
   */
  private chase(cam: THREE.PerspectiveCamera, t: number, dt: number, ground: (x: number, z: number) => number, n1: number, n2: number) {
    const o = this.outer!;
    const b = this.spec.bulk * CHASE_SCALE;
    const dist = 1.4 + 1.6 * b;
    const elev = 0.17 + Math.max(-0.2, Math.min(1.2, -this.gimbal - 0.12)) * 0.32;
    const sy = Math.sin(this.sYaw);
    const cy = Math.cos(this.sYaw);

    // Drone attitude, lightly smoothed so the model reads clearly.
    const kb = 1 - Math.exp(-dt * 12);
    this.bodyP += (this.pitch - this.bodyP) * kb;
    this.bodyR += (this.roll - this.bodyR) * kb;
    const dead = !this.alive;
    this.body.position.set(this.pos.x, this.pos.y - 0.7 - o.foot * CHASE_SCALE, this.pos.z);
    this.body.rotation.order = 'YXZ';
    this.body.rotation.set(
      -this.bodyP + (dead ? this.fallSpin * 0.7 : 0),
      this.yaw + (dead ? this.fallSpin : 0),
      -this.bodyR + (dead ? Math.sin(this.fallSpin) : 0),
    );
    // Small hover bob so a still drone still feels alive.
    this.body.position.y += Math.sin(t * 2.1) * 0.02 * this.spool * (this.landed ? 0 : 1);

    // Where the camera wants to be: behind and above, along the smoothed heading.
    tmp.set(this.pos.x + sy * dist * Math.cos(elev), this.pos.y + dist * Math.sin(elev) + 0.25 * b, this.pos.z + cy * dist * Math.cos(elev));
    if (Number.isNaN(this.camPos.x)) this.camPos.copy(tmp);
    const kp = 1 - Math.exp(-dt * 6);
    this.camPos.x += (tmp.x - this.camPos.x) * kp;
    this.camPos.z += (tmp.z - this.camPos.z) * kp;
    this.camPos.y += (tmp.y - this.camPos.y) * (1 - Math.exp(-dt * 4));
    // Never let the lag stretch so far that the drone shrinks to a dot.
    tmp.subVectors(this.camPos, this.pos);
    const far = dist * 2;
    if (tmp.length() > far) this.camPos.copy(this.pos).addScaledVector(tmp.normalize(), far);
    this.camPos.y = Math.max(this.camPos.y, ground(this.camPos.x, this.camPos.z) + 0.6);

    cam.position.copy(this.camPos);
    cam.position.x += n1 * this.shake * 0.08;
    cam.position.y += n2 * this.shake * 0.08;
    look.set(this.pos.x - sy * dist * 0.7, this.pos.y + 0.15 * b, this.pos.z - cy * dist * 0.7);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    this.camRoll += (-this.roll * 0.4 - this.camRoll) * (1 - Math.exp(-dt * 3));
    cam.rotateZ(this.camRoll);
  }
}
