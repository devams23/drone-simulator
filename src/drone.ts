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
const CEILING = 115;
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
  private model: DroneModel;
  private swayX = 0;
  private swayY = 0;
  private fallSpin = 0;

  constructor(public spec: DroneSpec) {
    this.ph = physics(spec);
    this.hull = this.ph.hull;
    // The real airframe hangs above and behind the camera, which sits under
    // the nose: the front arms and props frame the top corners of the view.
    this.model = buildDrone(spec, { fpv: true });
    this.model.group.position.set(0, 0.3 * spec.bulk, -0.1 * spec.bulk);
    this.rig.add(this.model.group);
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
    this.model.props.forEach((p, i) => (p.rotation.y += spin * (i === 0 || i === 3 ? 1 : -1)));
    this.model.setSpin(this.spool);
  }
}
