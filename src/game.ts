// Renderer, main loop and the glue between drone, mission, HUD and sound.
import * as THREE from 'three';
import { Sound } from './audio';
import type { DroneSpec, MissionId } from './data';
import { Drone } from './drone';
import { Hud } from './hud';
import { Input, type Controls } from './input';
import type { Mission } from './missions/base';
import { FireMission } from './missions/fire';
import { ReliefMission } from './missions/relief';
import { StrikeMission } from './missions/strike';
import { Fx } from './particles';
import { disposeScene } from './world';

export interface Result {
  won: boolean;
  stars: number;
  reason: string;
  summary: [string, string][];
}

const FOV = 78;
const IDLE: Controls = { throttle: 0, yaw: 0, pitch: 0, roll: 0, gimbal: 0, mouseYaw: 0, mouseGimbal: 0, primary: false, secondary: false };

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 2200);
  readonly sound = new Sound();
  readonly input: Input;
  readonly hud = new Hud();
  scene = new THREE.Scene();
  fx = new Fx();
  mission?: Mission;
  drone?: Drone;
  mode: 'idle' | 'orbit' | 'fly' | 'ended' = 'idle';
  paused = false;
  onEnd: (r: Result) => void = () => {};

  private missionId?: MissionId;
  private last = 0;
  private time = 0;
  private orbitAngle = 0.6;
  private endTimer = 0;
  private result?: Result;
  private shadow?: THREE.Mesh;
  private warnTick = 0;
  private lowBatteryTold = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.input = new Input(canvas);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.glow.setScale(h, FOV);
    this.fx.smoke.setScale(h, FOV);
  }

  /** Build a mission's world and show it with an orbiting camera. */
  loadMission(id: MissionId) {
    disposeScene(this.scene);
    this.scene = new THREE.Scene();
    this.fx = new Fx();
    this.fx.addTo(this.scene);
    this.camera.clear();
    this.scene.add(this.camera);
    const Ctor = id === 'fire' ? FireMission : id === 'strike' ? StrikeMission : ReliefMission;
    this.mission = new Ctor(this.scene, this.fx, this.sound);
    this.missionId = id;
    this.drone = undefined;
    this.mode = 'orbit';
    this.paused = false;
    this.input.active = false;
    this.hud.show(false);
    this.sound.silence();
    this.resize();

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.visible = false;
    this.scene.add(this.shadow);
  }

  /** Put the player in a drone on the pad. Always starts from a fresh world. */
  start(spec: DroneSpec) {
    if (!this.missionId) return;
    this.loadMission(this.missionId);
    const m = this.mission!;
    const d = (this.drone = new Drone(spec));
    d.pos.copy(m.spawn);
    d.yaw = m.spawnYaw;
    d.onDamage = (kind) => {
      if (kind === 'dead') {
        this.sound.crash();
        this.fx.explosion(d.pos, 1.2);
        this.hud.flash(1);
      } else if (kind === 'heat') {
        this.hud.flash(0.25);
      } else {
        this.sound.hit();
        this.hud.flash(kind === 'shot' ? 0.7 : 0.5);
      }
    };
    m.attach(d, (text, kind) => this.hud.toast(text, kind));
    m.elapsed = 0;
    this.camera.add(d.rig);
    this.mode = 'fly';
    this.result = undefined;
    this.lowBatteryTold = false;
    this.input.active = true;
    this.input.read(); // drop any stale mouse movement
    this.hud.reset();
    this.hud.show(true);
    this.hud.toast('Hold climb to spin up and take off', 'info');
  }

  setPaused(p: boolean) {
    if (this.mode !== 'fly') return;
    this.paused = p;
    this.input.active = !p;
    if (p) {
      this.input.releasePointer();
      this.sound.silence();
    }
  }

  /** Back to the orbiting menu view of the current world. */
  toOrbit() {
    if (this.missionId) this.loadMission(this.missionId);
  }

  private finish(won: boolean, reason: string) {
    const m = this.mission!;
    this.mode = 'ended';
    this.endTimer = won ? 2.2 : 2.8;
    this.result = { won, stars: won ? m.stars() : 0, reason, summary: m.summary() };
    this.hud.toast(won ? 'Mission complete!' : reason, won ? 'good' : 'bad');
    if (won) this.sound.win();
    else this.sound.lose();
    this.sound.spray(false);
  }

  private frame(ms: number) {
    const dt = Math.min(0.05, (ms - this.last) / 1000 || 0.016);
    this.last = ms;
    const m = this.mission;
    if (m && !this.paused) {
      this.time += dt;
      if (this.mode === 'orbit') this.orbit(dt, m);
      else if (this.drone) this.fly(dt, m, this.drone);
      m.ambient(dt, this.camera.position);
      this.fx.update(dt);
      m.world.follow(this.camera.position);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private orbit(dt: number, m: Mission) {
    this.orbitAngle += dt * 0.07;
    const o = m.orbit;
    this.camera.position.set(o.center.x + Math.cos(this.orbitAngle) * o.radius, o.center.y + o.height, o.center.z + Math.sin(this.orbitAngle) * o.radius);
    this.camera.rotation.order = 'YXZ';
    this.camera.lookAt(o.center);
  }

  private fly(dt: number, m: Mission, d: Drone) {
    const flying = this.mode === 'fly';
    const c = flying ? this.input.read() : IDLE;
    if (this.input.scheme === 'rc') c.mouseYaw = 0;
    d.update(dt, c, { world: m.world, wind: m.wind, waterY: m.waterY });
    if (flying && m.status === 'active') m.update(dt, c);

    // Recharge while sitting on the home pad.
    const onPad = d.landed && Math.hypot(d.pos.x - m.pad.x, d.pos.z - m.pad.z) < 7;
    if (onPad && d.battery < 1 && d.alive) {
      d.battery = Math.min(1, d.battery + 0.07 * dt);
      if (!m.state) m.state = 'RECHARGING';
    }

    d.applyCamera(this.camera, this.time, dt);
    this.sound.rotor(d.alive ? d.spool : 0, d.load, d.vel.length(), d.spec.bulk);

    // Blob shadow under the drone.
    if (this.shadow) {
      const gy = Math.max(m.world.heightAt(d.pos.x, d.pos.z), m.waterY ?? -1e9);
      const alt = d.pos.y - gy;
      this.shadow.visible = alt < 40;
      this.shadow.position.set(d.pos.x, gy + 0.1, d.pos.z);
      this.shadow.scale.setScalar(1 + alt * 0.05);
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.34 - alt * 0.008);
    }

    // Warnings.
    if (flying) {
      this.warnTick -= dt;
      const lowBatt = d.battery < 0.2;
      if (lowBatt && !this.lowBatteryTold) {
        this.lowBatteryTold = true;
        this.hud.toast('Battery low — return to the pad to recharge', 'bad');
      }
      if (d.battery > 0.4) this.lowBatteryTold = false;
      if ((lowBatt || d.hull < d.ph.hull * 0.25 || d.outOfBounds) && this.warnTick <= 0 && !d.landed) {
        this.warnTick = d.outOfBounds ? 0.5 : 1.1;
        this.sound.beep(d.outOfBounds ? 660 : 880, 0.07);
      }
    }

    this.hud.update(d, m, this.camera, dt, this.input.scheme);

    if (flying) {
      if (m.status === 'won') this.finish(true, '');
      else if (m.status === 'lost') this.finish(false, m.failReason);
      else if (!d.alive) this.finish(false, d.deathReason || 'Drone lost');
      else if (d.battery <= 0 && d.landed && !onPad) this.finish(false, 'Battery ran flat away from the pad');
    } else {
      this.endTimer -= dt;
      if (this.endTimer <= 0 && this.result) {
        const r = this.result;
        this.result = undefined;
        this.input.active = false;
        this.input.releasePointer();
        this.sound.silence();
        this.hud.show(false);
        this.onEnd(r);
      }
    }
  }
}
