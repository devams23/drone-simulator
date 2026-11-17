// Flood Relief: parachute supply crates onto rooftops in a flooded town.
import * as THREE from 'three';
import type { Controls } from '../input';
import { World, rng } from '../world';
import { Mission, fmtTime, type Marker, type Objective, type Payload } from './base';

interface Roof {
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
  target: boolean;
  delivered: boolean;
  marker?: Marker;
  ring?: THREE.Mesh;
  people?: THREE.Group;
}

interface Crate {
  mesh: THREE.Group;
  chute: THREE.Mesh;
  v: THREE.Vector3;
  age: number;
  done: boolean;
}

const WATER_Y = 2.2;
const DEPOT = { x: 0, z: 150 };
const TIME_LIMIT = 330;
const CHUTE_DELAY = 0.35;
const TERMINAL = -5;
const WHITE = new THREE.Color(0xeaf6ff);
const FLARE = new THREE.Color(0xff5a36);
const FLARE_END = new THREE.Color(0xffc9b0);

export class ReliefMission extends Mission {
  readonly id = 'relief';
  private roofs: Roof[] = [];
  private crates: Crate[] = [];
  private carried = 0;
  private capacity = 1;
  private loadTick = 0;
  private wasPrimary = false;
  private delivered = 0;
  private missed = 0;
  private total = 0;
  private timeLeft = TIME_LIMIT;
  private depotMarker: Marker;
  private aimRing: THREE.Mesh;
  private aimMat: THREE.MeshBasicMaterial;
  private crateGeo = new THREE.BoxGeometry(0.9, 0.7, 0.9);
  private chuteGeo = new THREE.SphereGeometry(1.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  private flareAcc = 0;
  private warned = false;
  private tp = new THREE.Vector3();
  private tv = new THREE.Vector3();

  constructor(...a: ConstructorParameters<typeof Mission>) {
    super(...a);
    const w = (this.world = new World(
      this.scene,
      { id: 'cloud', sun: 0xfff6e8, sunDir: new THREE.Vector3(0.35, 0.7, 0.45), sunIntensity: 3, fogNear: 260, fogFar: 1400 },
      {
        amp: 5, base: -3.2, seed: 5.7, mountains: { from: 340, height: 180 }, tex: ['leafy_grass', 'brown_mud_leaves_01', 'rocky_terrain_02'], shore: WATER_Y, tint: 0x52762e,
        grass: { color: 0x89aa50, density: 1, size: 0.8 },
        flats: [
          { x: DEPOT.x, z: DEPOT.z, r: 17, h: 7.5 },
          { x: 0, z: -10, r: 95, h: 0.4 },
        ],
      },
    ));
    this.waterY = WATER_Y;
    w.water(WATER_Y, 0x6a8a7a);
    this.pad = w.pad(DEPOT.x, DEPOT.z, '#35c2ff');
    this.spawn.copy(this.pad).y += 0.7;
    this.spawnYaw = 0;
    this.orbit.center.set(0, 10, -10);
    this.orbit.radius = 120;
    this.orbit.height = 60;

    // Depot dressing: a shed and stacked crates beside the pad.
    w.house(DEPOT.x + 11, DEPOT.z + 3, 6, 8, 3.6, 0xf2f2f2, 0x2a7de1, true);
    for (const [x, z, y] of [[-9, 2, 0], [-9, 3.2, 0], [-10.1, 2.6, 0], [-9.5, 2.6, 0.9]] as const) {
      const m = new THREE.Mesh(this.crateGeo, w.mat(0xd9a14a));
      m.position.set(DEPOT.x + x, this.pad.y + 0.35 + y, DEPOT.z + z);
      this.scene.add(m);
    }

    // Town: a loose grid of houses standing in the flood.
    const r = rng(19);
    const walls = [0xfff1d6, 0xf7c9a0, 0xdfeaf2, 0xffe0b8, 0xe8d4c0, 0xcfe3c6];
    const roofCols = [0xc24a33, 0x4f6f94, 0x8a4a3a, 0x3f7a66, 0xb5653a];
    const targets = new Set(['-2,-2', '2,-1', '0,0', '-1,2', '3,1']);
    for (let gx = -3; gx <= 3; gx++) {
      for (let gz = -3; gz <= 2; gz++) {
        const key = `${gx},${gz}`;
        const isTarget = targets.has(key);
        if (!isTarget && r() < 0.22) continue;
        const x = gx * 27 + (r() - 0.5) * 7;
        const z = -10 + gz * 27 + (r() - 0.5) * 7;
        const hw = isTarget ? 11 + r() * 2 : 8 + r() * 4;
        const hd = isTarget ? 10 + r() * 2 : 7 + r() * 4;
        const hh = isTarget ? 7 + r() * 3 : 6 + r() * 6;
        const flat = isTarget || r() < 0.3;
        const h = w.house(x, z, hw, hd, hh, walls[Math.floor(r() * walls.length)], roofCols[Math.floor(r() * roofCols.length)], flat, 0.4);
        const roof: Roof = { x, z, w: hw, d: hd, top: h.top, target: isTarget, delivered: false };
        if (isTarget) this.dressTarget(roof);
        this.roofs.push(roof);
      }
    }
    this.total = this.roofs.filter((x) => x.target).length;

    // Church tower as a landmark.
    w.block(-52, 0.4, -100, 6, 22, 6, 0xf2ead8, undefined, 'white_rough_plaster');
    const spire = new THREE.Mesh(new THREE.ConeGeometry(5, 9, 4), w.mat(0x4f6f94, { flatShading: true }));
    spire.rotation.y = Math.PI / 4;
    spire.position.set(-52, 26.9, -100);
    this.scene.add(spire);

    // Trees on whatever land is still above the water.
    const spots: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 4000 && spots.length < 380; i++) {
      const x = (r() - 0.5) * 640;
      const z = (r() - 0.5) * 640;
      if (w.heightAt(x, z) < WATER_Y + 0.6 || Math.hypot(x - DEPOT.x, z - DEPOT.z) < 18) continue;
      spots.push({ x, z, s: 0.8 + r() * 0.8 });
    }
    for (let i = 0; i < 6000 && spots.length < 1300; i++) {
      const a = r() * Math.PI * 2;
      const d = 320 + r() * 400;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const h = w.heightAt(x, z);
      if (h < WATER_Y + 1 || h > 140 + r() * 60) continue;
      spots.push({ x, z, s: 0.9 + r() * 1.0 });
    }
    w.pines(spots, 0x597c3e, 0.75, 0.1);

    // Half-sunk cars and floating debris.
    for (let i = 0; i < 16; i++) {
      const x = (r() - 0.5) * 190;
      const z = -10 + (r() - 0.5) * 170;
      if (this.roofAt(x, z, 3)) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.8 + r() * 2, 0.8, 1.2 + r() * 2.4), w.mat([0xd94a3a, 0xf2c531, 0x8a6a45, 0x4f7fd9][i % 4], { roughness: 0.3, metalness: 0.5 }));
      m.position.set(x, WATER_Y - 0.15, z);
      m.rotation.set((r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3);
      this.scene.add(m);
    }

    this.depotMarker = { pos: new THREE.Vector3(DEPOT.x, this.pad.y + 5, DEPOT.z), icon: '📦', color: '#35c2ff', label: 'Depot', visible: false };
    this.markers.push(this.depotMarker);

    this.aimMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthTest: false, fog: false });
    this.aimRing = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 36), this.aimMat);
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.renderOrder = 5;
    this.aimRing.visible = false;
    this.scene.add(this.aimRing);
  }

  private dressTarget(roof: Roof) {
    const w = this.world;
    const n = this.roofs.filter((x) => x.target).length + 1;
    roof.marker = { pos: new THREE.Vector3(roof.x, roof.top + 5, roof.z), icon: '🆘', color: '#ffd23f', label: `Family ${n}`, visible: true };
    this.markers.push(roof.marker);
    roof.ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.3, 40), new THREE.MeshBasicMaterial({ color: 0xff3b30, side: THREE.DoubleSide }));
    roof.ring.rotation.x = -Math.PI / 2;
    roof.ring.position.set(roof.x, roof.top + 0.06, roof.z);
    this.scene.add(roof.ring);
    // A few people waving from the corner of the roof.
    const g = new THREE.Group();
    const shirts = [0xff5a36, 0x35c2ff, 0xffd23f, 0x9be36a];
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.1, 8), w.mat(shirts[(n + i) % 4]));
      body.position.y = 0.55;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), w.mat(0xe2b48c));
      head.position.y = 1.3;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), w.mat(0xe2b48c));
      arm.position.set(0.3, 1.35, 0);
      arm.name = 'arm';
      p.add(body, head, arm);
      p.position.set(i * 0.8 - 0.8, 0, (i % 2) * 0.6);
      g.add(p);
    }
    g.position.set(roof.x + roof.w / 2 - 2.2, roof.top, roof.z + roof.d / 2 - 1.6);
    this.scene.add(g);
    roof.people = g;
  }

  private roofAt(x: number, z: number, pad = 0) {
    for (const o of this.roofs) {
      if (Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(z - o.z) < o.d / 2 + pad) return o;
    }
    return undefined;
  }

  /** One integration step of a falling crate; shared by real crates and the prediction. */
  private stepCrate(p: THREE.Vector3, v: THREE.Vector3, age: number, dt: number) {
    v.y -= 9.8 * dt;
    if (age > CHUTE_DELAY) {
      v.y = Math.max(v.y, TERMINAL);
      const k = Math.min(1, 0.9 * dt);
      v.x += (this.wind.x - v.x) * k;
      v.z += (this.wind.z - v.z) * k;
    }
    p.addScaledVector(v, dt);
  }

  /** Height of whatever a crate would land on at (x, z). */
  private surface(x: number, z: number) {
    const roof = this.roofAt(x, z);
    return { y: roof ? roof.top : Math.max(this.world.heightAt(x, z), WATER_Y), roof };
  }

  attach(...a: Parameters<Mission['attach']>) {
    super.attach(...a);
    this.capacity = this.drone.spec.capacity;
    this.carried = this.capacity;
  }

  ambient(dt: number) {
    this.elapsed += dt;
    const t = this.elapsed;
    // Gusty wind that slowly swings round.
    const dir = 0.9 + Math.sin(t * 0.021) * 1.3;
    const speed = 4.2 + Math.sin(t * 0.35) * 1.1 + Math.sin(t * 1.3) * 0.6;
    this.wind.set(Math.cos(dir) * speed, 0, Math.sin(dir) * speed);

    this.flareAcc += dt;
    const emit = this.flareAcc > 0.07;
    if (emit) this.flareAcc = 0;
    for (const o of this.roofs) {
      if (!o.target) continue;
      if (o.people) {
        o.people.children.forEach((p, i) => {
          const arm = p.getObjectByName('arm');
          if (arm) arm.rotation.z = o.delivered ? 0 : Math.sin(t * 7 + i * 1.7) * 0.7;
          p.position.y = o.delivered ? Math.abs(Math.sin(t * 6 + i)) * 0.25 : 0;
        });
      }
      if (o.delivered || !emit) continue;
      this.fx.smoke.emit(o.x - o.w / 2 + 1, o.top + 0.4, o.z - o.d / 2 + 1, this.wind.x * 0.5, 4.5, this.wind.z * 0.5, {
        life: 5, size: 1.2, sizeEnd: 7, color: FLARE, colorEnd: FLARE_END, alpha: 0.6, drag: 0.15,
      });
      if (o.ring) (o.ring.material as THREE.MeshBasicMaterial).opacity = 1;
      if (o.ring) o.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
    }
  }

  update(dt: number, c: Controls) {
    const d = this.drone;
    const r = Math.random;
    this.state = '';

    // --- Clock ---
    this.timeLeft -= dt;
    if (!this.warned && this.timeLeft < 60) {
      this.warned = true;
      this.toast('One minute left!', 'bad');
      this.sound.beep(440, 0.2);
    }

    // --- Loading at the depot ---
    const nearDepot = Math.hypot(d.pos.x - DEPOT.x, d.pos.z - DEPOT.z) < 8 && d.pos.y - this.pad.y < 6 && d.alive;
    if (nearDepot && this.carried < this.capacity) {
      this.state = 'LOADING CRATES';
      this.loadTick += dt;
      if (this.loadTick > 0.7) {
        this.loadTick = 0;
        this.carried++;
        this.sound.pickup();
        if (this.carried === this.capacity) this.toast('Fully loaded', 'good');
      }
    } else {
      this.loadTick = 0;
    }
    this.depotMarker.visible = this.carried === 0;

    // --- Release ---
    const canDrop = d.alive && !d.landed;
    if (c.primary && !this.wasPrimary && canDrop) {
      if (this.carried > 0) {
        this.carried--;
        this.sound.release();
        const mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(this.crateGeo, this.world.mat(0xd9a14a)));
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.16, 0.94), this.world.mat(0xd93a2b));
        mesh.add(band);
        const chute = new THREE.Mesh(this.chuteGeo, this.world.mat(0xff7a2f, { side: THREE.DoubleSide }));
        chute.position.y = 2.2;
        chute.scale.setScalar(0.01);
        mesh.add(chute);
        mesh.position.copy(d.pos);
        mesh.position.y -= 0.7;
        this.scene.add(mesh);
        this.crates.push({ mesh, chute, v: d.vel.clone(), age: 0, done: false });
        if (this.carried === 0) this.toast('Out of crates — reload at the depot', 'info');
      } else {
        this.sound.beep(300, 0.08);
        this.toast('No crates — hover low over the depot', 'bad');
      }
    }
    this.wasPrimary = c.primary;

    // --- Crates in the air ---
    for (const k of this.crates) {
      if (k.done) continue;
      k.age += dt;
      const p = k.mesh.position;
      this.stepCrate(p, k.v, k.age, dt);
      const open = Math.min(1, Math.max(0, (k.age - CHUTE_DELAY) * 3));
      k.chute.scale.setScalar(Math.max(0.01, open));
      k.mesh.rotation.z = Math.sin(k.age * 2.4) * 0.12 * open;
      const s = this.surface(p.x, p.z);
      if (p.y - 0.35 > s.y) continue;
      k.done = true;
      p.y = s.y + 0.35;
      k.mesh.rotation.z = 0;
      k.chute.visible = false;
      const roof = s.roof;
      if (roof?.target && !roof.delivered) {
        roof.delivered = true;
        roof.marker!.visible = false;
        (roof.ring!.material as THREE.MeshBasicMaterial).color.set(0x4cd964);
        this.delivered++;
        this.sound.good();
        this.fx.puff(p, WHITE, 10, 1.6);
        const left = this.total - this.delivered;
        this.toast(left ? `Delivered! ${left} rooftop${left > 1 ? 's' : ''} to go` : 'Last delivery made!', 'good');
      } else {
        this.missed++;
        if (roof) {
          this.toast(roof.target ? 'They already have supplies' : 'Wrong roof — crate wasted', 'bad');
          this.fx.puff(p, undefined, 6, 1.2);
        } else if (s.y <= WATER_Y + 0.01) {
          this.sound.splash();
          this.fx.puff(p, WHITE, 12, 1.8);
          k.mesh.position.y = WATER_Y - 0.1;
          this.toast('Crate lost in the water', 'bad');
        } else {
          this.toast('Crate missed the roof', 'bad');
          this.fx.puff(p, undefined, 6, 1.2);
        }
      }
    }

    // --- Predicted landing spot ---
    this.aimRing.visible = canDrop && this.carried > 0;
    if (this.aimRing.visible) {
      const p = this.tp.copy(d.pos);
      p.y -= 0.7;
      const v = this.tv.copy(d.vel);
      let age = 0;
      let land = this.surface(p.x, p.z);
      for (let i = 0; i < 260; i++) {
        this.stepCrate(p, v, age, 0.1);
        age += 0.1;
        land = this.surface(p.x, p.z);
        if (p.y - 0.35 <= land.y) break;
      }
      const good = !!land.roof?.target && !land.roof.delivered;
      this.aimRing.position.set(p.x, land.y + 0.12, p.z);
      this.aimMat.color.set(good ? 0x4cff6a : 0xffd23f);
      this.aimRing.scale.setScalar((good ? 1.25 : 1) * (1 + Math.sin(this.elapsed * 6) * 0.07));
      if (good && !this.state) this.state = 'ON TARGET — RELEASE';
    }

    // Spray kicked up when skimming the flood.
    if (d.alive && !d.landed && d.pos.y - WATER_Y < 3.5 && this.world.heightAt(d.pos.x, d.pos.z) < WATER_Y && r() < 0.5) {
      this.fx.puff(new THREE.Vector3(d.pos.x + (r() - 0.5) * 3, WATER_Y, d.pos.z + (r() - 0.5) * 3), WHITE, 1, 0.8);
    }

    if (this.delivered >= this.total) this.status = 'won';
    else if (this.timeLeft <= 0) this.fail('Time ran out');
  }

  objective(): Objective {
    return {
      title: 'FLOOD RELIEF',
      lines: [`Rooftops supplied: ${this.delivered}/${this.total}`, `Time left: ${fmtTime(this.timeLeft)}`],
      meter: { label: 'Time', value: Math.max(0, this.timeLeft / TIME_LIMIT), bad: false },
    };
  }

  payload(): Payload {
    return {
      label: 'CRATES',
      text: `${this.carried}/${this.capacity}`,
      frac: this.capacity ? this.carried / this.capacity : 0,
      extra: '▣'.repeat(this.carried) + '▢'.repeat(Math.max(0, this.capacity - this.carried)),
    };
  }

  stars() {
    const f = this.timeLeft / TIME_LIMIT;
    return f > 0.4 ? 3 : f > 0.15 ? 2 : 1;
  }

  summary(): [string, string][] {
    return [
      ['Time', fmtTime(TIME_LIMIT - this.timeLeft)],
      ['Rooftops supplied', `${this.delivered}/${this.total}`],
      ['Crates wasted', String(this.missed)],
    ];
  }
}
