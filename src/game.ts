// Renderer, main loop and the glue between drone, mission, HUD and sound.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { loadAssets } from './assets';
import { Sound } from './audio';
import { CourseRun, type CourseDef, type CourseResult } from './course';
import type { DroneSpec, WorldId } from './data';
import { Drone } from './drone';
import { Hud } from './hud';
import { Input, type Controls } from './input';
import type { Mission } from './missions/base';
import { CanyonMission } from './missions/canyon';
import { IceMission } from './missions/ice';
import { CityMission } from './missions/city';
import { Fx } from './particles';
import { clearings, disposeScene, enableShadows, gfx } from './world';

export interface Result {
  won: boolean;
  stars: number;
  reason: string;
  summary: [string, string][];
  course?: CourseResult;
}

const FOV = 78;
export type View = 'fpv' | 'chase';

export type Quality = 'high' | 'medium' | 'low';
const QUALITY: Record<Quality, { ratio: number; shadow: number; samples: number; grass: number; post: boolean }> = {
  high: { ratio: 2, shadow: 4096, samples: 4, grass: 1, post: true },
  medium: { ratio: 1.25, shadow: 2048, samples: 2, grass: 0.6, post: true },
  low: { ratio: 1, shadow: 1024, samples: 0, grass: 0, post: false },
};

/** Lens pass: blur that streaks outward with speed, soft dark corners, fine grain. */
const LensShader = {
  uniforms: { tDiffuse: { value: null }, uSpeed: { value: 0 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uSpeed; uniform float uTime; varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float r = length(d);
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uSpeed > 0.02) {
        float k = uSpeed * smoothstep(0.2, 0.75, r) * 0.055;
        for (int i = 1; i < 6; i++) c += texture2D(tDiffuse, vUv - d * k * float(i) / 5.0).rgb;
        c /= 6.0;
      }
      // Grade: pull saturation back, gentle filmic contrast, cool shadows / warm highlights.
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 0.86);
      // Contrast curve on the 0..1 part only: HDR highlights (> 1.5) would go negative.
      vec3 cc = clamp(c, 0.0, 1.0);
      c += (cc * cc * (3.0 - 2.0 * cc) - cc) * 0.22;
      c += vec3(-0.008, 0.0, 0.012) * (1.0 - smoothstep(0.0, 0.5, l)) + vec3(0.012, 0.006, -0.01) * smoothstep(0.5, 1.0, l);
      c *= 1.0 - 0.3 * smoothstep(0.38, 0.98, r);
      float n = fract(sin(dot(gl_FragCoord.xy + uTime * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * 0.014;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};
const CALM_AIR = new THREE.Vector3();
const IDLE: Controls = { throttle: 0, yaw: 0, pitch: 0, roll: 0, gimbal: 0, mouseYaw: 0, mouseGimbal: 0, primary: false, secondary: false };

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.06, 4200);
  /** Resolves when textures and skies are loaded. */
  readonly ready: Promise<void>;
  onLoad: (fraction: number) => void = () => {};
  quality: Quality = 'high';
  /** Roam freely: no objectives, timer or failure. */
  free = false;
  /** Set to fly a course instead of free roam. */
  courseDef?: CourseDef;
  course?: CourseRun;
  private respawnT = 0;
  readonly sound = new Sound();
  readonly input: Input;
  readonly hud = new Hud();
  scene = new THREE.Scene();
  fx = new Fx();
  mission?: Mission;
  drone?: Drone;
  mode: 'idle' | 'orbit' | 'fly' | 'ended' = 'idle';
  view: View = (localStorage.getItem('skyduty.view') as View) === 'chase' ? 'chase' : 'fpv';
  paused = false;
  /** Set while the garage is drawn over the world: skip simulating and rendering it. */
  halt = false;
  onEnd: (r: Result) => void = () => {};
  /** Called when a phone remote links up (the menu shows it). */
  onRemote: () => void = () => {};
  private teleT = 0;

  private missionId?: WorldId;
  private last = 0;
  private time = 0;
  private orbitAngle = 0.6;
  private endTimer = 0;
  private result?: Result;
  private composer?: EffectComposer;
  private renderPass?: RenderPass;
  private lens?: ShaderPass;
  private autoQuality = true;
  private slow = 0;
  private frames = 0;
  private warnTick = 0;
  private lowBatteryTold = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.input = new Input(canvas);
    this.input.remote.onConnect = () => {
      this.hud.toast('Phone remote connected', 'good');
      this.onRemote();
    };
    window.addEventListener('resize', () => this.resize());
    const forced = new URLSearchParams(location.search).get('q') as Quality | null;
    const saved = (forced ?? localStorage.getItem('skyduty.quality')) as Quality | null;
    if (forced || saved) this.autoQuality = false;
    this.setQuality(saved && saved in QUALITY ? saved : 'high', false);
    this.ready = loadAssets(this.renderer, (f) => this.onLoad(f));
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  /** Change graphics quality. Grass density applies from the next flight. */
  setQuality(q: Quality, save = true) {
    this.quality = q;
    if (save) {
      localStorage.setItem('skyduty.quality', q);
      this.autoQuality = false;
    }
    const cfg = QUALITY[q];
    gfx.shadowSize = cfg.shadow;
    gfx.grass = cfg.grass;
    const sun = this.mission?.world.sun;
    if (sun) {
      sun.shadow.mapSize.setScalar(cfg.shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    this.composer?.dispose();
    this.composer = undefined;
    if (cfg.post) {
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: cfg.samples });
      const c = (this.composer = new EffectComposer(this.renderer, target));
      this.renderPass = new RenderPass(this.scene, this.camera);
      this.lens = new ShaderPass(LensShader);
      c.addPass(this.renderPass);
      c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.55, 1.0));
      c.addPass(this.lens);
      c.addPass(new OutputPass());
    }
    this.resize();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio, QUALITY[this.quality].ratio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(ratio);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.setFov(this.camera.fov);
  }

  private setFov(fov: number) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    const h = window.innerHeight;
    this.fx.glow.setScale(h, fov);
    this.fx.smoke.setScale(h, fov);
  }

  /** Build a mission's world and show it with an orbiting camera. */
  loadMission(id: WorldId) {
    disposeScene(this.scene);
    this.scene = new THREE.Scene();
    this.fx = new Fx();
    this.fx.addTo(this.scene);
    this.camera.clear();
    this.scene.add(this.camera);
    const Ctor = { canyon: CanyonMission, ice: IceMission, city: CityMission }[id];
    this.mission = new Ctor(this.scene, this.fx, this.sound);
    enableShadows(this.scene);
    if (this.renderPass) this.renderPass.scene = this.scene;
    this.missionId = id;
    this.drone = undefined;
    this.course = undefined;
    this.mode = 'orbit';
    this.paused = false;
    this.input.active = false;
    this.hud.show(false);
    this.sound.silence();
    this.resize();

  }

  /** Put the player in a drone on the pad. Always starts from a fresh world. */
  start(spec: DroneSpec) {
    const def = this.courseDef;
    if (def) this.missionId = def.world;
    if (!this.missionId) return;
    // Keep trees and boulders off the racing line.
    clearings.length = 0;
    if (def) {
      let px: number | undefined, pz = 0;
      for (const s of def.steps) {
        const x = s.at[0], z = s.at[s.at.length - 1];
        // Threading keeps the trees close: the squeeze is the point.
        const tight = def.mode === 'thread';
        clearings.push({ x, z, r: tight ? 6 : s.kind === 'ring' ? 14 : 9 });
        // ...and along the line between steps, so canopies don't hang into it.
        if (px !== undefined) for (const t of [0.25, 0.5, 0.75]) clearings.push({ x: px + (x - px) * t, z: pz + (z - pz) * t, r: tight ? 4 : 8 });
        px = x;
        pz = z;
      }
    }
    this.loadMission(this.missionId);
    clearings.length = 0;
    const m = this.mission!;
    const d = (this.drone = new Drone(spec));
    d.pos.copy(m.spawn);
    d.yaw = m.spawnYaw;
    d.onDamage = (kind) => {
      const r = this.input.remote;
      if (kind === 'dead') r.send({ buzz: [120, 60, 220] });
      else if (kind === 'touch') {
        r.send({ buzz: 30 });
        this.sound.hit();
        this.hud.flash(0.22);
        return;
      } else if (kind !== 'heat') r.send({ buzz: kind === 'shot' ? 70 : 45 });
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
    if (def) {
      this.course = new CourseRun(def, m, this.scene, this.sound);
      d.yaw = this.course.cp.yaw;
      d.fragile = true;
    }
    m.elapsed = 0;
    this.camera.add(d.rig);
    this.scene.add(d.body);
    d.setView(this.view);
    this.mode = 'fly';
    this.result = undefined;
    this.lowBatteryTold = false;
    this.input.active = true;
    this.input.read(); // drop any stale mouse movement
    this.hud.reset();
    this.hud.show(true);
    this.respawnT = 0;
    this.hud.toast(def ? def.name : this.free ? 'Free flight — Esc for the menu' : 'Hold climb to spin up and take off', 'info');
  }

  /** Cockpit (first-person) or chase (third-person) camera; remembered. */
  setView(v: View) {
    this.view = v;
    localStorage.setItem('skyduty.view', v);
    this.drone?.setView(v);
  }

  toggleView() {
    this.setView(this.view === 'fpv' ? 'chase' : 'fpv');
    if (this.mode === 'fly') this.hud.toast(this.view === 'chase' ? 'Chase camera' : 'Cockpit camera', 'info');
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
    if (this.halt) return;
    const m = this.mission;
    if (m && !this.paused) {
      this.time += dt;
      if (this.mode === 'orbit') this.orbit(dt, m);
      else if (this.drone) this.fly(dt, m, this.drone);
      m.ambient(dt, this.camera.position);
      this.fx.update(dt);
      m.world.follow(this.camera.position);
    }
    {
      // Field of view opens up with speed: the rush of a low pass.
      const d = this.drone;
      const sp = this.mode === 'fly' && d ? d.vel.length() / d.ph.maxSpeed : 0;
      const want = FOV + 14 * Math.max(0, Math.min(1, (sp - 0.2) / 0.8)) ** 1.3;
      if (Math.abs(want - this.camera.fov) > 0.05) this.setFov(this.camera.fov + (want - this.camera.fov) * Math.min(1, dt * 3));
    }
    if (this.composer && this.lens) {
      const d = this.drone;
      const sp = this.mode === 'fly' && d ? d.vel.length() / d.ph.maxSpeed : 0;
      this.lens.uniforms.uSpeed.value = Math.max(0, Math.min(1, (sp - 0.45) / 0.55));
      this.lens.uniforms.uTime.value = this.time % 100;
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // If the machine cannot keep up, step the quality down once or twice.
    if (this.autoQuality && this.mode === 'fly' && !this.paused && this.quality !== 'low') {
      this.frames++;
      if (dt > 1 / 26) this.slow++;
      if (this.frames >= 240) {
        if (this.slow > 150) {
          this.setQuality(this.quality === 'high' ? 'medium' : 'low', false);
          this.hud.toast('Graphics quality lowered to keep flight smooth', 'info');
        }
        this.frames = this.slow = 0;
      }
    }
  }

  private finishCourse(run: CourseRun) {
    const r = run.result!;
    this.mode = 'ended';
    this.endTimer = 2.4;
    this.result = { won: true, stars: r.marks, reason: '', summary: [], course: r };
    this.hud.toast(r.clean ? 'Clean run' : 'Finished', 'good');
    this.sound.win();
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
    if (this.input.viewToggle) {
      this.input.viewToggle = false;
      if (flying) this.toggleView();
    }
    const run = this.course;
    const calm = this.free || !!run;
    d.update(dt, c, { world: m.world, wind: run ? CALM_AIR : m.wind, waterY: m.waterY });
    if (flying && m.status === 'active' && !calm) m.update(dt, c);
    if (calm && d.alive) d.battery = 1;
    if (run && flying) run.update(dt, d);

    // Recharge while sitting on the home pad.
    const onPad = d.landed && Math.hypot(d.pos.x - m.pad.x, d.pos.z - m.pad.z) < 7;
    if (onPad && d.battery < 1 && d.alive) {
      d.battery = Math.min(1, d.battery + 0.07 * dt);
      if (!m.state) m.state = 'RECHARGING';
    }

    d.applyCamera(this.camera, this.time, dt, (x, z) => Math.max(m.world.heightAt(x, z), m.waterY ?? -1e9));
    this.sound.rotor(d.alive ? d.spool : 0, d.load, d.vel.length(), d.spec.bulk);


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

    this.hud.update(d, m, this.camera, dt, this.input.scheme, c, calm, run?.markers);
    this.hud.course(run);
    if (this.input.remote.connected && (this.teleT -= dt) <= 0) {
      this.teleT = 0.25;
      const ground = Math.max(m.world.heightAt(d.pos.x, d.pos.z), m.waterY ?? -1e9);
      this.input.remote.send({
        alt: Math.max(0, d.pos.y - ground - 0.7),
        spd: Math.hypot(d.vel.x, d.vel.z) * 3.6,
        bat: d.battery,
        hull: d.hull / d.ph.hull,
        view: this.view,
      });
    }

    if (flying && run) {
      // Courses never end in failure: a crash puts you back at the last checkpoint.
      if (!d.alive && (this.respawnT += dt) > 1.2) {
        this.respawnT = 0;
        run.respawn(d);
      } else if (run.done) this.finishCourse(run);
    } else if (flying && this.free) {
      // Free flight never ends: after a crash, put a fresh drone on the pad.
      if (!d.alive && (this.respawnT += dt) > 2.5) this.start(d.spec);
    } else if (flying) {
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
