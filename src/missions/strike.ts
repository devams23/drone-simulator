// Outpost Strike: destroy a hostile outpost while its turrets shoot back.
import * as THREE from 'three';
import type { Controls } from '../input';
import { World, boxGeo, rng, type Box } from '../world';
import { Mission, fmtTime, type Marker, type Objective, type Payload } from './base';

type Kind = 'hq' | 'radar' | 'fuel' | 'turret';

interface Target {
  kind: Kind;
  name: string;
  root: THREE.Object3D;
  pos: THREE.Vector3;
  hp: number;
  maxHp: number;
  radius: number;
  alive: boolean;
  required: boolean;
  marker: Marker;
  box?: Box;
  // turret state
  head?: THREE.Object3D;
  cool: number;
  burst: number;
  sink: number;
}

interface Bolt {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
  hostile: boolean;
}

interface Rocket {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
}

const C = { x: 0, z: -75 }; // outpost centre
const TURRET_RANGE = 92;
const CANNON_RANGE = 125;
const BOLT_SPEED = 78;

export class StrikeMission extends Mission {
  readonly id = 'strike';
  private targets: Target[] = [];
  private blockers: THREE.Object3D[] = [];
  private bolts: Bolt[] = [];
  private rockets: Rocket[] = [];
  private ray = new THREE.Raycaster();
  private ammo = 0;
  private ammoMax = 0;
  private rocketsLeft = 0;
  private rocketsMax = 0;
  private dmg = 8;
  private fireCool = 0;
  private rocketCool = 0;
  private rearmTick = 0;
  private wasSecondary = false;
  private dish!: THREE.Object3D;
  private turretsDown = 0;
  private underFire = 0;
  private boltGeo = new THREE.BoxGeometry(0.14, 0.14, 2.4);
  private matHostile = new THREE.MeshBasicMaterial({ color: 0xff5a2a, fog: false });
  private matFriendly = new THREE.MeshBasicMaterial({ color: 0xfff3a0, fog: false });

  constructor(...a: ConstructorParameters<typeof Mission>) {
    super(...a);
    const w = (this.world = new World(
      this.scene,
      { id: 'gold', sun: 0xffe3bd, sunDir: new THREE.Vector3(-0.55, 0.38, -0.5), sunIntensity: 3.3, fogNear: 260, fogFar: 1400 },
      {
        amp: 9, base: 0, seed: 8.4, tex: ['sand_01', 'gravelly_sand', 'sandstone_cracks'],
        grade: 0xffdcb4,
        flats: [
          { x: 0, z: 175, r: 14, h: 8 },
          { x: C.x, z: C.z, r: 58, h: 5 },
        ],
      },
    ));
    this.pad = w.pad(0, 175, '#7dff6b');
    this.spawn.copy(this.pad).y += 0.7;
    this.spawnYaw = 0; // facing -z, toward the outpost
    this.orbit.center.set(C.x, 12, C.z);
    this.orbit.radius = 110;
    this.ray.far = CANNON_RANGE;

    const r = rng(77);
    // Mesas give cover on the way in.
    for (const [x, z, rad, h] of [[-70, 60, 20, 30], [65, 40, 17, 24], [-25, 105, 12, 18], [120, -60, 24, 36], [-130, -90, 26, 40], [40, -190, 22, 30], [-60, -200, 18, 26], [150, 110, 20, 28], [-170, 90, 22, 34]] as const) {
      this.blockers.push(w.mesa(x, z, rad, h, 0xe6a57a));
    }
    const rocks: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 160; i++) {
      const x = (r() - 0.5) * 640;
      const z = (r() - 0.5) * 640;
      if (Math.hypot(x - C.x, z - C.z) < 50 || Math.hypot(x, z - 175) < 12) continue;
      rocks.push({ x, z, s: 0.6 + r() * 2.2 });
    }
    w.rocks(rocks, 0xe0b898, 'sandstone_cracks');

    // --- Outpost ---
    const gy = 5;
    const wall = 0xc4bba6;
    for (const [x, z, sx, sz] of [[0, -40, 80, 1.5], [0, 40, 30, 1.5], [-40, 0, 1.5, 80], [40, 0, 1.5, 80], [-27, 40, 26, 1.5], [27, 40, 26, 1.5]] as const) {
      if (z === 40 && x === 0) continue; // gate gap
      this.blockers.push(w.block(C.x + x, gy, C.z + z, sx, 4, sz, wall));
    }

    // HQ
    const hq = new THREE.Group();
    hq.position.set(C.x, gy, C.z - 10);
    const main = new THREE.Mesh(boxGeo(24, 12, 15, 4), w.pbr('concrete_wall_004', 0xb9bda8));
    main.position.y = 6;
    const upper = new THREE.Mesh(boxGeo(12, 5, 9, 4), w.pbr('concrete_wall_004', 0x9aa08c));
    upper.position.y = 14.5;
    const band = new THREE.Mesh(boxGeo(24.2, 1.2, 15.2, 2), w.pbr('corrugated_iron', 0xb8312a, 0.6, { metalness: 0.5 }));
    band.position.y = 9.5;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 9, 6), w.mat(0x30343a));
    mast.position.set(4, 21, 0);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 0.1), w.mat(0xb8312a));
    flag.position.set(5.6, 24, 0);
    hq.add(main, upper, band, mast, flag);
    for (let i = -2; i <= 2; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.2), w.mat(0x16222c, { roughness: 0.08, metalness: 0.9 }));
      win.position.set(i * 4.4, 6, 7.55);
      hq.add(win);
    }
    this.addTarget('hq', 'HQ', hq, new THREE.Vector3(C.x, gy + 8, C.z - 10), 900, 13, true, w.addBox(C.x, gy, C.z - 10, 24, 17, 15));

    // Radar
    const radar = new THREE.Group();
    radar.position.set(C.x - 25, gy, C.z + 16);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 9, 14), w.mat(0x7c848e, { roughness: 0.45, metalness: 0.7 }));
    tower.position.y = 4.5;
    this.dish = new THREE.Group();
    this.dish.position.y = 10;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(3.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), w.mat(0xdfe5ea, { side: THREE.DoubleSide, roughness: 0.35, metalness: 0.6 }));
    bowl.rotation.x = Math.PI / 2 + 0.5;
    this.dish.add(bowl);
    radar.add(tower, this.dish);
    this.addTarget('radar', 'Radar', radar, new THREE.Vector3(C.x - 25, gy + 9, C.z + 16), 90, 4.5, true, w.addBox(C.x - 25, gy, C.z + 16, 2.5, 9, 2.5));

    // Fuel tanks
    for (const [i, x, z] of [[1, 25, 12], [2, 27, -16]] as const) {
      const g = new THREE.Group();
      g.position.set(C.x + x, gy, C.z + z);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 7, 32), w.mat(0xe8e2d0, { roughness: 0.38, metalness: 0.55 }));
      tank.position.y = 3.5;
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(4.05, 4.05, 1.4, 32), w.mat(0xd9342b, { roughness: 0.4, metalness: 0.4 }));
      stripe.position.y = 4.5;
      g.add(tank, stripe);
      this.addTarget('fuel', `Fuel ${i}`, g, new THREE.Vector3(C.x + x, gy + 4, C.z + z), 70, 5, true, w.addBox(C.x + x, gy, C.z + z, 7, 7, 7));
    }

    // Turrets on corner towers
    for (const [i, x, z] of [[1, -36, -36], [2, 36, -36], [3, -36, 36], [4, 36, 36]] as const) {
      const g = new THREE.Group();
      g.position.set(C.x + x, gy, C.z + z);
      const base = new THREE.Mesh(boxGeo(3.4, 7, 3.4), w.pbr('concrete_wall_004', 0xa39c88));
      base.position.y = 3.5;
      const head = new THREE.Group();
      head.position.y = 7.9;
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 2.6), w.mat(0x4a5a40, { roughness: 0.5, metalness: 0.6 }));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.4, 12), w.mat(0x22262b, { roughness: 0.35, metalness: 0.9 }));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 2.4;
      head.add(body, barrel);
      g.add(base, head);
      const t = this.addTarget('turret', `Turret ${i}`, g, new THREE.Vector3(C.x + x, gy + 7.9, C.z + z), 70, 2.6, false, w.addBox(C.x + x, gy, C.z + z, 3.4, 8.6, 3.4));
      t.head = head;
      t.cool = 1 + i * 0.4;
    }

    // Dressing: tents and trucks.
    for (const [x, z, col] of [[-18, -22, 0x6d7a4a], [-10, 22, 0x6d7a4a], [12, 26, 0x8a7a55]] as const) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(4.5, 3.4, 4), w.mat(col, { flatShading: true }));
      tent.rotation.y = Math.PI / 4;
      tent.position.set(C.x + x, gy + 1.7, C.z + z);
      this.scene.add(tent);
    }
    this.blockers.push(w.block(C.x - 8, gy, C.z + 8, 2.6, 2.4, 6, 0x6f8456, undefined, 'corrugated_iron'), w.block(C.x + 8, gy, C.z + 30, 6, 2.4, 2.6, 0x6f8456, undefined, 'corrugated_iron'));
  }

  private addTarget(kind: Kind, name: string, root: THREE.Object3D, pos: THREE.Vector3, hp: number, radius: number, required: boolean, box?: Box) {
    const marker: Marker = { pos: pos.clone(), icon: required ? '◆' : '▲', color: required ? '#ff4d4d' : '#ffb347', label: name, visible: true };
    marker.pos.y += radius * 0.6 + 2;
    const t: Target = { kind, name, root, pos, hp, maxHp: hp, radius, alive: true, required, marker, box, cool: 0, burst: 2, sink: 0 };
    root.traverse((o) => (o.userData.target = t));
    this.scene.add(root);
    this.targets.push(t);
    this.markers.push(marker);
    return t;
  }

  attach(...a: Parameters<Mission['attach']>) {
    super.attach(...a);
    const s = this.drone.spec;
    this.ammo = this.ammoMax = s.capacity;
    this.rocketsLeft = this.rocketsMax = s.rockets ?? 2;
    this.dmg = s.cannonDamage ?? 8;
  }

  ambient(dt: number) {
    this.elapsed += dt;
    this.wind.set(Math.cos(this.elapsed * 0.04), 0, Math.sin(this.elapsed * 0.04));
    this.dish.rotation.y += dt * 1.2;
    for (const t of this.targets) {
      if (t.alive) continue;
      this.fx.plume(t.pos, dt, t.kind === 'hq' ? 9 : 4, t.kind === 'hq' ? 6 : 3);
      if (t.kind === 'hq' && t.sink < 1) {
        t.sink = Math.min(1, t.sink + dt * 0.5);
        t.root.scale.y = 1 - t.sink * 0.62;
        t.root.rotation.z = t.sink * 0.09;
      }
      if (t.kind === 'radar' && t.sink < 1) {
        t.sink = Math.min(1, t.sink + dt * 1.5);
        this.dish.rotation.z = t.sink * 1.3;
        this.dish.position.y = 10 - t.sink * 3;
      }
    }
  }

  private spawnBolt(from: THREE.Vector3, v: THREE.Vector3, life: number, hostile: boolean) {
    let b = this.bolts.find((x) => x.life <= 0);
    if (!b) {
      if (this.bolts.length > 90) return;
      b = { mesh: new THREE.Mesh(this.boltGeo, this.matHostile), v: new THREE.Vector3(), life: 0, hostile };
      this.scene.add(b.mesh);
      this.bolts.push(b);
    }
    b.mesh.material = hostile ? this.matHostile : this.matFriendly;
    b.mesh.visible = true;
    b.mesh.position.copy(from);
    b.v.copy(v);
    b.mesh.lookAt(from.clone().add(v));
    b.life = life;
    b.hostile = hostile;
  }

  private hurt(t: Target, amount: number) {
    if (!t.alive) return;
    t.hp -= amount;
    if (t.hp > 0) return;
    t.alive = false;
    t.marker.visible = false;
    const big = t.kind === 'hq' ? 3 : t.kind === 'fuel' ? 2.4 : 1.2;
    this.fx.explosion(t.pos, big);
    this.sound.explosion(big);
    this.drone.shake = Math.min(1, this.drone.shake + (big * 14) / Math.max(10, t.pos.distanceTo(this.drone.pos)));
    if (t.box) {
      const i = this.world.boxes.indexOf(t.box);
      if (i >= 0 && t.kind !== 'turret') this.world.boxes.splice(i, 1);
    }
    if (t.kind === 'turret') {
      t.head!.visible = false;
      this.turretsDown++;
      this.toast(`${t.name} destroyed`, 'good');
    } else if (t.kind === 'fuel') {
      t.root.visible = false;
      this.blast(t.pos, 17, 150, t);
      this.toast(`${t.name} destroyed`, 'good');
    } else if (t.kind === 'radar') {
      this.toast('Radar down — turret aim degraded', 'good');
    } else {
      this.toast('HQ destroyed!', 'good');
    }
  }

  /** Area damage to targets and, if too close, to the player. */
  private blast(p: THREE.Vector3, radius: number, damage: number, except?: Target) {
    for (const t of this.targets) {
      if (t === except || !t.alive) continue;
      const d = Math.max(0, t.pos.distanceTo(p) - t.radius);
      if (d < radius) this.hurt(t, damage * (1 - d / radius));
    }
    const dd = this.drone.pos.distanceTo(p);
    if (dd < radius * 0.7) this.drone.damage(damage * 0.25 * (1 - dd / (radius * 0.7)), 'crash');
  }

  update(dt: number, c: Controls) {
    const d = this.drone;
    const w = this.world;
    const r = Math.random;
    const canFire = d.alive && !d.landed;
    const muzzle = d.pos.clone().addScaledVector(d.aim, 1);
    muzzle.y -= 0.35;

    // --- Cannon: instant hit, with a visible tracer ---
    this.fireCool -= dt;
    if (c.primary && canFire && this.fireCool <= 0) {
      if (this.ammo > 0) {
        this.fireCool = 0.1;
        this.ammo--;
        this.sound.shot();
        const dir = d.aim.clone();
        dir.x += (r() - 0.5) * 0.02;
        dir.y += (r() - 0.5) * 0.02;
        dir.z += (r() - 0.5) * 0.02;
        dir.normalize();
        this.ray.set(d.pos, dir);
        const alive = this.targets.filter((t) => t.alive).map((t) => t.root);
        const hit = this.ray.intersectObjects([...alive, ...this.blockers], true)[0];
        let dist = CANNON_RANGE;
        // Ground stops bullets too.
        for (let s = 4; s < CANNON_RANGE; s += 4) {
          const py = d.pos.y + dir.y * s;
          if (py < w.heightAt(d.pos.x + dir.x * s, d.pos.z + dir.z * s)) {
            dist = s;
            break;
          }
        }
        const end = new THREE.Vector3();
        if (hit && hit.distance < dist) {
          dist = hit.distance;
          end.copy(hit.point);
          const t = hit.object.userData.target as Target | undefined;
          if (t) this.hurt(t, this.dmg);
          this.fx.sparks(end, 5, 8);
        } else if (dist < CANNON_RANGE) {
          end.copy(d.pos).addScaledVector(dir, dist);
          this.fx.puff(end, undefined, 2, 1);
        }
        this.spawnBolt(muzzle, dir.multiplyScalar(420), dist / 420, false);
      } else {
        this.fireCool = 0.5;
        this.sound.beep(300, 0.08);
        this.toast('Out of ammo — land on the pad to rearm', 'bad');
      }
    }

    // --- Rockets ---
    this.rocketCool -= dt;
    if (c.secondary && !this.wasSecondary && canFire && this.rocketCool <= 0) {
      if (this.rocketsLeft > 0) {
        this.rocketsLeft--;
        this.rocketCool = 0.5;
        this.sound.rocket();
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.3, 8), w.mat(0xe9e9e9));
        mesh.geometry.rotateX(Math.PI / 2);
        mesh.position.copy(muzzle);
        this.scene.add(mesh);
        this.rockets.push({ mesh, v: d.aim.clone().multiplyScalar(75).add(d.vel), life: 4 });
      } else {
        this.sound.beep(300, 0.08);
      }
    }
    this.wasSecondary = c.secondary;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const k = this.rockets[i];
      k.life -= dt;
      k.v.y -= 2.5 * dt;
      const p = k.mesh.position;
      p.addScaledVector(k.v, dt);
      k.mesh.lookAt(p.clone().add(k.v));
      this.fx.glow.emit(p.x, p.y, p.z, 0, 0, 0, { life: 0.25, size: 1.4, sizeEnd: 0.2, color: this.fx.colors.flameA, colorEnd: this.fx.colors.flameB });
      this.fx.smoke.emit(p.x, p.y, p.z, (r() - 0.5) * 2, r(), (r() - 0.5) * 2, { life: 1.4, size: 0.8, sizeEnd: 3, color: this.fx.colors.smokeB, alpha: 0.5 });
      const near = this.targets.some((t) => t.alive && t.pos.distanceTo(p) < t.radius + 0.8);
      if (near || k.life <= 0 || p.y < w.heightAt(p.x, p.z) || w.inside(p)) {
        this.fx.explosion(p, 1);
        this.sound.explosion(0.9);
        this.blast(p, 11, 170);
        this.scene.remove(k.mesh);
        this.rockets.splice(i, 1);
      }
    }

    // --- Turrets ---
    const radarUp = this.targets.some((t) => t.kind === 'radar' && t.alive);
    this.underFire = Math.max(0, this.underFire - dt);
    for (const t of this.targets) {
      if (t.kind !== 'turret' || !t.alive || !d.alive) continue;
      const dist = t.pos.distanceTo(d.pos);
      if (dist > TURRET_RANGE || (d.landed && dist > 40)) continue;
      t.head!.lookAt(d.pos);
      t.cool -= dt;
      if (t.cool > 0) continue;
      t.burst--;
      if (t.burst > 0) t.cool = 0.17;
      else {
        t.cool = 1.5 + r() * 0.9;
        t.burst = 2;
      }
      const lead = dist / BOLT_SPEED;
      const err = (dist * 0.03 + d.vel.length() * 0.24) * (radarUp ? 1 : 2.3);
      const aim = d.pos.clone().addScaledVector(d.vel, lead * 0.8);
      aim.x += (r() - 0.5) * 2 * err;
      aim.y += (r() - 0.5) * 2 * err;
      aim.z += (r() - 0.5) * 2 * err;
      const v = aim.sub(t.pos).normalize();
      const from = t.pos.clone().addScaledVector(v, 3.6);
      this.spawnBolt(from, v.multiplyScalar(BOLT_SPEED), 2.2, true);
      this.sound.enemyShot(Math.max(0, 1 - dist / TURRET_RANGE));
      this.fx.sparks(from, 2, 3);
      this.underFire = 1.2;
    }
    this.state = this.underFire > 0 ? 'TAKING FIRE' : '';

    // --- Bolts in flight ---
    for (const b of this.bolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const p = b.mesh.position;
      p.addScaledVector(b.v, dt);
      if (b.hostile) {
        if (d.alive && p.distanceTo(d.pos) < 1.5) {
          d.damage(7.5, 'shot');
          this.fx.sparks(p, 8, 7);
          b.life = 0;
        } else if (p.y < w.heightAt(p.x, p.z) || w.inside(p)) {
          this.fx.sparks(p, 3, 5);
          b.life = 0;
        }
      }
      if (b.life <= 0) b.mesh.visible = false;
    }

    // --- Rearm and repair on the pad ---
    if (this.onPad() && (this.ammo < this.ammoMax || this.rocketsLeft < this.rocketsMax || d.hull < d.ph.hull)) {
      this.state = 'REARMING · REPAIRING';
      this.ammo = Math.min(this.ammoMax, this.ammo + 70 * dt);
      d.hull = Math.min(d.ph.hull, d.hull + 12 * dt);
      this.rearmTick += dt;
      if (this.rearmTick > 1.3 && this.rocketsLeft < this.rocketsMax) {
        this.rearmTick = 0;
        this.rocketsLeft++;
        this.sound.pickup();
      }
    }

    for (const t of this.targets) if (t.alive) t.marker.label = `${t.name} ${Math.ceil((t.hp / t.maxHp) * 100)}%`;
    if (this.targets.every((t) => !t.required || !t.alive)) this.status = 'won';
  }

  objective(): Objective {
    const req = this.targets.filter((t) => t.required);
    return {
      title: 'OUTPOST STRIKE',
      lines: req.map((t) => `${t.alive ? '◻' : '◼'} ${t.name}`).concat(`Turrets down: ${this.turretsDown}/4`),
    };
  }

  payload(): Payload {
    return {
      label: 'CANNON',
      text: `${Math.floor(this.ammo)}`,
      frac: this.ammoMax ? this.ammo / this.ammoMax : 0,
      extra: `ROCKETS ${'▮'.repeat(this.rocketsLeft)}${'▯'.repeat(Math.max(0, this.rocketsMax - this.rocketsLeft))}`,
    };
  }

  stars() {
    const f = this.drone.hull / this.drone.ph.hull;
    return f > 0.6 ? 3 : f > 0.3 ? 2 : 1;
  }

  summary(): [string, string][] {
    return [
      ['Time', fmtTime(this.elapsed)],
      ['Turrets destroyed', `${this.turretsDown}/4`],
      ['Hull remaining', `${Math.round((this.drone.hull / this.drone.ph.hull) * 100)}%`],
    ];
  }
}
