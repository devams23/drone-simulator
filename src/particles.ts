// Pooled point-sprite particles (fire, smoke, water, sparks).
import * as THREE from 'three';

export interface EmitOpts {
  life: number;
  size: number;
  sizeEnd?: number;
  color: THREE.Color;
  colorEnd?: THREE.Color;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

const VERT = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  #include <colorspace_fragment>
}`;

export class Particles {
  readonly points: THREE.Points;
  private n: number;
  private head = 0;
  private pos: Float32Array;
  private col: Float32Array;
  private siz: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private a0: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private mat: THREE.ShaderMaterial;

  constructor(max: number, additive: boolean) {
    this.n = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.siz = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 500 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }

  /** Pixel scale so sizes are in world metres. */
  setScale(viewportHeight: number, fovDeg: number) {
    this.mat.uniforms.uScale.value = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, o: EmitOpts) {
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = this.maxLife[i] = o.life;
    this.s0[i] = o.size;
    this.s1[i] = o.sizeEnd ?? o.size;
    const ce = o.colorEnd ?? o.color;
    this.c0.set([o.color.r, o.color.g, o.color.b], i * 3);
    this.c1.set([ce.r, ce.g, ce.b], i * 3);
    this.a0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
  }

  update(dt: number) {
    const { pos, vel, life, col, siz } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const j = i * 3;
      if (life[i] <= 0) {
        siz[i] = 0;
        col[i * 4 + 3] = 0;
        continue;
      }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      vel[j] *= k;
      vel[j + 1] = vel[j + 1] * k - this.grav[i] * dt;
      vel[j + 2] *= k;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt;
      const t = 1 - life[i] / this.maxLife[i];
      siz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      col[i * 4] = this.c0[j] + (this.c1[j] - this.c0[j]) * t;
      col[i * 4 + 1] = this.c0[j + 1] + (this.c1[j + 1] - this.c0[j + 1]) * t;
      col[i * 4 + 2] = this.c0[j + 2] + (this.c1[j + 2] - this.c0[j + 2]) * t;
      // Quick fade in, long fade out.
      col[i * 4 + 3] = this.a0[i] * Math.min(1, t * 8) * (1 - t);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

/** The pools every mission shares, plus common effects. */
export class Fx {
  glow = new Particles(3000, true);
  smoke = new Particles(2500, false);
  private c = {
    flameA: new THREE.Color(0xffd27a),
    flameB: new THREE.Color(0xff3b0a),
    smokeA: new THREE.Color(0x3a3532),
    smokeB: new THREE.Color(0x8a8580),
    steam: new THREE.Color(0xf4fbff),
    spark: new THREE.Color(0xffe9a8),
    dust: new THREE.Color(0xc9b08a),
    white: new THREE.Color(0xffffff),
  };

  addTo(scene: THREE.Scene) {
    scene.add(this.smoke.points, this.glow.points);
  }

  update(dt: number) {
    this.glow.update(dt);
    this.smoke.update(dt);
  }

  explosion(p: THREE.Vector3, size = 1) {
    const r = Math.random;
    for (let i = 0; i < 40 * size; i++) {
      const a = r() * Math.PI * 2;
      const u = r() * 2 - 1;
      const s = (4 + r() * 14) * size;
      const q = Math.sqrt(1 - u * u);
      this.glow.emit(p.x, p.y, p.z, Math.cos(a) * q * s, Math.abs(u) * s + 2, Math.sin(a) * q * s, {
        life: 0.5 + r() * 0.7, size: 2.5 * size, sizeEnd: 6 * size,
        color: this.c.flameA, colorEnd: this.c.flameB, alpha: 0.9, drag: 2.5,
      });
    }
    for (let i = 0; i < 24 * size; i++) {
      this.smoke.emit(p.x + (r() - 0.5) * 3, p.y + r() * 2, p.z + (r() - 0.5) * 3, (r() - 0.5) * 6, 3 + r() * 6, (r() - 0.5) * 6, {
        life: 2 + r() * 2.5, size: 3 * size, sizeEnd: 12 * size,
        color: this.c.smokeA, colorEnd: this.c.smokeB, alpha: 0.7, drag: 0.8,
      });
    }
    this.sparks(p, 30 * size, 22);
  }

  sparks(p: THREE.Vector3, count = 8, speed = 9) {
    const r = Math.random;
    for (let i = 0; i < count; i++) {
      this.glow.emit(p.x, p.y, p.z, (r() - 0.5) * speed * 2, r() * speed, (r() - 0.5) * speed * 2, {
        life: 0.3 + r() * 0.6, size: 0.35, sizeEnd: 0.1, color: this.c.spark, colorEnd: this.c.flameB, gravity: 14, drag: 0.5,
      });
    }
  }

  puff(p: THREE.Vector3, color: THREE.Color = this.c.dust, count = 6, size = 1.5) {
    const r = Math.random;
    for (let i = 0; i < count; i++) {
      this.smoke.emit(p.x, p.y, p.z, (r() - 0.5) * 4, 1 + r() * 2.5, (r() - 0.5) * 4, {
        life: 0.8 + r(), size, sizeEnd: size * 3, color, alpha: 0.55, drag: 1.5,
      });
    }
  }

  steam(p: THREE.Vector3) {
    this.puff(p, this.c.steam, 2, 1.2);
  }

  /** Ongoing column of dark smoke, call every frame with dt. */
  plume(p: THREE.Vector3, dt: number, rate = 5, size = 4) {
    if (Math.random() < rate * dt) {
      const r = Math.random;
      this.smoke.emit(p.x + (r() - 0.5) * size, p.y, p.z + (r() - 0.5) * size, (r() - 0.5) * 1.5, 4 + r() * 3, (r() - 0.5) * 1.5, {
        life: 4 + r() * 3, size, sizeEnd: size * 4, color: this.c.smokeA, colorEnd: this.c.smokeB, alpha: 0.6, drag: 0.15,
      });
    }
  }

  get colors() {
    return this.c;
  }
}
