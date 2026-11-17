// Wildfire Response: carry water, put out fires before the village is lost.
import * as THREE from 'three';
import type { Controls } from '../input';
import { World, rng } from '../world';
import { Mission, fmtTime, type Marker, type Objective, type Payload } from './base';

interface Site {
  pos: THREE.Vector3;
  intensity: number;
  active: boolean;
  dormant: boolean;
  house: boolean;
  wet: number;
  light: THREE.PointLight;
  marker: Marker;
}

interface Drop {
  p: THREE.Vector3;
  v: THREE.Vector3;
  litres: number;
}

const LAKE = { x: -125, z: 45, r: 44 };
const SPRAY_RATE = 9; // litres per second
const WATER = new THREE.Color(0xbfeaff);

export class FireMission extends Mission {
  readonly id = 'fire';
  private sites: Site[] = [];
  private drops: Drop[] = [];
  private water = 0;
  private capacity = 0;
  private damage = 0; // village damage, 0..100
  private spreadTimer = 26;
  private emitAcc = 0;
  private out = 0;
  private lakeMarker: Marker;
  private spraying = false;
  private steamTick = 0;

  constructor(...a: ConstructorParameters<typeof Mission>) {
    super(...a);
    const w = (this.world = new World(
      this.scene,
      { id: 'day', sun: 0xfff1dc, sunDir: new THREE.Vector3(0.5, 0.42, -0.6), sunIntensity: 3.1, fogNear: 240, fogFar: 1300 },
      {
        amp: 13, base: 2, seed: 3.1, mountains: { from: 320, height: 210 }, tex: ['leafy_grass', 'forest_ground_04', 'rocky_terrain_02'], shore: 4, tint: 0x55782f,
        grass: { color: 0x8fae52, density: 1, size: 0.85 },
        flats: [
          { x: 0, z: 0, r: 52, h: 9 },
          { x: LAKE.x, z: LAKE.z, r: LAKE.r, h: 1.5 },
          { x: 95, z: 105, r: 13, h: 12 },
        ],
      },
    ));
    this.waterY = 4;
    w.water(this.waterY, 0x2a9fd6, LAKE.r * 1.45, LAKE.x, LAKE.z);
    this.pad = w.pad(95, 105);
    this.spawn.copy(this.pad).y += 0.7;
    this.spawnYaw = Math.atan2(95, 105); // face the village
    this.orbit.center.set(0, 14, 0);
    this.orbit.radius = 105;

    // Village: a ring of cottages around a square.
    const r = rng(42);
    const walls = [0xfff3dc, 0xf6d9a8, 0xe9f0f5, 0xffe2c4, 0xf3c9a0];
    const roofs = [0xc0452d, 0x9c3b2a, 0x4d6a8a, 0xb5542f];
    const houses: ReturnType<World['house']>[] = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      const d = 24 + (i % 3) * 9;
      houses.push(
        w.house(Math.cos(a) * d, Math.sin(a) * d, 8 + r() * 3, 7 + r() * 3, 4.5 + r() * 2, walls[i % walls.length], roofs[i % roofs.length]),
      );
    }
    // Well in the square.
    w.block(0, 9, 0, 2.4, 1.2, 2.4, 0xb9b4a8, undefined, 'brick_wall_10');

    // Forest everywhere that is not village, lake or pad.
    const spots: { x: number; z: number; s: number }[] = [];
    while (spots.length < 900) {
      const x = (r() - 0.5) * 620;
      const z = (r() - 0.5) * 620;
      if (Math.hypot(x, z) < 60 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.55 || Math.hypot(x - 95, z - 105) < 20) continue;
      spots.push({ x, z, s: 0.8 + r() * 0.9 });
    }
    // ...and up the valley walls, thinning out toward the bare tops.
    for (let i = 0; i < 6000 && spots.length < 2000; i++) {
      const a = r() * Math.PI * 2;
      const d = 300 + r() * 420;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (w.heightAt(x, z) > 150 + r() * 60) continue;
      spots.push({ x, z, s: 0.9 + r() * 1.1 });
    }
    w.pines(spots, 0x5d8040, 0.5, 0.4);
    const stones: { x: number; z: number; s: number }[] = [];
    while (stones.length < 160) {
      const x = (r() - 0.5) * 600;
      const z = (r() - 0.5) * 600;
      if (Math.hypot(x, z) < 55 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.2 || Math.hypot(x - 95, z - 105) < 18) continue;
      stones.push({ x, z, s: 0.5 + r() * r() * 2.4 });
    }
    w.rocks(stones, 0xb0b2a6, 'mossy_rock');

    // Fire sites: three houses and three forest patches burn at the start,
    // three more can catch later.
    const mk = (x: number, y: number, z: number, house: boolean, intensity: number) => {
      const light = new THREE.PointLight(0xff7a2a, 0, 70, 1.6);
      light.position.set(x, y + 3, z);
      this.scene.add(light);
      const marker: Marker = { pos: new THREE.Vector3(x, y + 5, z), icon: '🔥', color: '#ff7a2f', visible: intensity > 0 };
      this.markers.push(marker);
      this.sites.push({ pos: new THREE.Vector3(x, y, z), intensity, active: intensity > 0, dormant: intensity === 0, house, wet: 0, light, marker });
    };
    for (const [i, level] of [[1, 0.75], [5, 0.65], [8, 0.7], [3, 0]] as const) {
      const h = houses[i];
      mk(h.x, h.top - 1, h.z, true, level);
    }
    for (const [x, z, level] of [[-70, -95, 0.8], [85, -65, 0.7], [-40, 100, 0.65], [120, 10, 0], [-95, -30, 0]] as const) {
      mk(x, w.heightAt(x, z) + 2, z, false, level);
    }

    this.lakeMarker = { pos: new THREE.Vector3(LAKE.x, this.waterY + 3, LAKE.z), icon: '💧', color: '#49c6ff', label: 'Lake', visible: false };
    this.markers.push(this.lakeMarker);
  }

  attach(...a: Parameters<Mission['attach']>) {
    super.attach(...a);
    this.capacity = this.drone.spec.capacity;
    this.water = this.capacity;
  }

  ambient(dt: number, viewer: THREE.Vector3) {
    const { glow, smoke, colors } = this.fx;
    const r = Math.random;
    this.emitAcc += dt;
    const step = 1 / 30;
    let nearest = 0;
    while (this.emitAcc > step) {
      this.emitAcc -= step;
      for (const s of this.sites) {
        if (!s.active) continue;
        const k = 0.5 + s.intensity;
        for (let i = 0; i < 2; i++) {
          if (r() > s.intensity + 0.25) continue;
          const a = r() * 6.28;
          const d = r() * 3 * k;
          glow.emit(s.pos.x + Math.cos(a) * d, s.pos.y + r() * 1.5, s.pos.z + Math.sin(a) * d, (r() - 0.5) * 2, 4 + r() * 5 * k, (r() - 0.5) * 2, {
            life: 0.6 + r() * 0.7, size: 3.2 * k, sizeEnd: 0.6, color: colors.flameA, colorEnd: colors.flameB, alpha: 0.85,
          });
        }
        if (r() < 0.22 * k) {
          smoke.emit(s.pos.x + (r() - 0.5) * 3, s.pos.y + 4, s.pos.z + (r() - 0.5) * 3, this.wind.x + (r() - 0.5), 5 + r() * 3, this.wind.z + (r() - 0.5), {
            life: 6 + r() * 4, size: 4 * k, sizeEnd: 20 * k, color: colors.smokeA, colorEnd: colors.smokeB, alpha: 0.55, drag: 0.1,
          });
        }
        if (r() < 0.08) this.fx.sparks(s.pos, 2, 6);
      }
    }
    for (const s of this.sites) {
      s.light.intensity = s.active ? s.intensity * (520 + Math.sin(this.elapsed * 17 + s.pos.x) * 140) : 0;
      if (s.active) nearest = Math.max(nearest, s.intensity * Math.max(0, 1 - s.pos.distanceTo(viewer) / 70));
    }
    this.sound.fire(nearest);
    this.elapsed += dt;
    this.wind.set(Math.cos(this.elapsed * 0.05) * 1.6, 0, Math.sin(this.elapsed * 0.05) * 1.6);
  }

  update(dt: number, c: Controls) {
    const d = this.drone;
    const w = this.world;
    const r = Math.random;

    // --- Spray ---
    this.spraying = c.primary && this.water > 0 && !d.landed && d.alive;
    this.sound.spray(this.spraying);
    if (this.spraying) {
      const used = Math.min(this.water, SPRAY_RATE * dt);
      this.water -= used;
      const count = Math.max(1, Math.round(36 * dt));
      for (let i = 0; i < count; i++) {
        const v = d.aim.clone().multiplyScalar(17).add(d.vel);
        v.x += (r() - 0.5) * 2.4;
        v.y += (r() - 0.5) * 2.4;
        v.z += (r() - 0.5) * 2.4;
        const p = d.pos.clone().addScaledVector(d.aim, 0.9);
        p.y -= 0.35;
        this.drops.push({ p, v, litres: used / count });
        this.fx.smoke.emit(p.x, p.y, p.z, v.x, v.y, v.z, { life: 1.5, size: 0.5, sizeEnd: 1.1, color: WATER, alpha: 0.9, gravity: 9.8 });
      }
      if (this.water <= 0) this.toast('Tank empty — refill at the lake', 'bad');
    }

    // --- Droplets in flight ---
    this.steamTick -= dt;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const o = this.drops[i];
      o.v.y -= 9.8 * dt;
      o.p.addScaledVector(o.v, dt);
      let done = false;
      for (const s of this.sites) {
        if (!s.active) continue;
        const reach = 4.5 + s.intensity * 2.5;
        if (Math.hypot(o.p.x - s.pos.x, o.p.z - s.pos.z) < reach && o.p.y < s.pos.y + 7 && o.p.y > s.pos.y - 5) {
          s.intensity -= o.litres / (s.house ? 30 : 24);
          s.wet = 3;
          if (r() < 0.25) this.fx.steam(o.p);
          if (this.steamTick <= 0) {
            this.sound.steam();
            this.steamTick = 0.18;
          }
          done = true;
          break;
        }
      }
      if (!done && o.p.y < w.heightAt(o.p.x, o.p.z)) done = true;
      if (done) this.drops.splice(i, 1);
    }

    // --- Fire behaviour ---
    let houseHeat = 0;
    let forestHeat = 0;
    let burning = 0;
    for (const s of this.sites) {
      if (!s.active) continue;
      s.wet -= dt;
      if (s.wet <= 0) s.intensity = Math.min(1, s.intensity + 0.012 * dt);
      if (s.intensity <= 0.04) {
        s.active = false;
        s.marker.visible = false;
        this.out++;
        this.sound.good();
        for (let i = 0; i < 6; i++) this.fx.steam(s.pos);
        const left = this.sites.filter((x) => x.active).length;
        this.toast(left ? `Fire out — ${left} to go` : 'Last fire out!', 'good');
        continue;
      }
      burning++;
      if (s.house) houseHeat += s.intensity;
      else forestHeat += s.intensity;
      // Heat cooks a drone that flies into the flames.
      const dist = s.pos.distanceTo(d.pos);
      const hot = 5 + s.intensity * 4;
      if (dist < hot) d.damage(10 * s.intensity * dt * (1.4 - dist / hot), 'heat');
    }
    this.damage = Math.min(100, this.damage + (houseHeat * 0.33 + forestHeat * 0.08) * dt);

    // Fire jumps to a new site now and then.
    this.spreadTimer -= dt;
    if (this.spreadTimer <= 0) {
      this.spreadTimer = 30;
      const next = this.sites.find((s) => s.dormant);
      if (next && this.sites.some((s) => s.active && s.intensity > 0.5)) {
        next.dormant = false;
        next.active = true;
        next.intensity = 0.4;
        next.marker.visible = true;
        this.toast('The fire has spread!', 'bad');
        this.sound.beep(440, 0.2);
      }
    }

    // --- Refill ---
    const overLake = Math.hypot(d.pos.x - LAKE.x, d.pos.z - LAKE.z) < LAKE.r * 1.3 && d.pos.y - this.waterY! < 7 && d.alive;
    if (overLake && this.water < this.capacity) {
      this.water = Math.min(this.capacity, this.water + 32 * dt);
      this.state = 'REFILLING';
      if (r() < 0.5) this.fx.puff(new THREE.Vector3(d.pos.x + (r() - 0.5) * 3, this.waterY!, d.pos.z + (r() - 0.5) * 3), WATER, 1, 0.8);
      if (this.water >= this.capacity) {
        this.sound.pickup();
        this.toast('Tank full', 'good');
      }
    } else {
      this.state = '';
    }
    this.lakeMarker.visible = this.water < this.capacity * 0.35;

    if (this.damage >= 100) this.fail('The village burned down');
    else if (burning === 0) this.status = 'won';
  }

  objective(): Objective {
    const left = this.sites.filter((s) => s.active).length;
    return {
      title: 'WILDFIRE RESPONSE',
      lines: [`Fires burning: ${left}`, `Extinguished: ${this.out}`],
      meter: { label: 'Village damage', value: this.damage / 100, bad: true },
    };
  }

  payload(): Payload {
    return { label: 'WATER', text: `${Math.round(this.water)} L`, frac: this.capacity ? this.water / this.capacity : 0 };
  }

  stars() {
    return this.damage < 30 ? 3 : this.damage < 65 ? 2 : 1;
  }

  summary(): [string, string][] {
    return [
      ['Time', fmtTime(this.elapsed)],
      ['Fires put out', String(this.out)],
      ['Village damage', `${Math.round(this.damage)}%`],
    ];
  }
}
