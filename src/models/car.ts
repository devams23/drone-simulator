/**
 * Road vehicles, modelled in code: a four-door sedan (also the black-and-yellow
 * taxi) and a red city bus with a lit cabin. Each kind is a small set of
 * instanced meshes that share one matrix per vehicle; +x is the nose.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type RGB = [number, number, number];

/** Non-indexed, with a colour attribute, so any parts can be merged together. */
function prep(g: THREE.BufferGeometry, rgb: RGB = [1, 1, 1]) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  const c = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < c.length; i += 3) c.set(rgb, i);
  n.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** A side profile in x/y, extruded across the car and centred on z = 0. */
function extrude(shape: THREE.Shape, depth: number, bevel: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  return g.translate(0, 0, -depth / 2);
}

function wheels(axles: number[], r: number, track: number, width: number) {
  const tyre: THREE.BufferGeometry[] = [], rim: THREE.BufferGeometry[] = [];
  for (const x of axles) {
    for (const s of [-1, 1]) {
      tyre.push(new THREE.CylinderGeometry(r, r, width, 18).rotateX(Math.PI / 2).translate(x, r, s * track));
      // Rim face sits just proud of the tyre wall, with a dark hub cap.
      rim.push(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.02, 14).rotateX(Math.PI / 2).translate(x, r, s * (track + width / 2 + 0.005)));
      tyre.push(new THREE.CylinderGeometry(r * 0.18, r * 0.18, 0.03, 8).rotateX(Math.PI / 2).translate(x, r, s * (track + width / 2 + 0.015)));
    }
  }
  return { tyre, rim };
}

/** Wheel arches cut into the bottom edge of a side profile, walking front to back. */
function sill(s: THREE.Shape, from: number, to: number, y: number, arches: number[], ar: number, cy: number) {
  // Walks from x = from to x = to (from < to), lifting over each arch.
  for (const ax of [...arches].sort((a, b) => a - b)) {
    s.lineTo(ax - ar, y);
    s.absarc(ax, cy, ar, Math.PI, 0, true);
  }
  s.lineTo(to, y);
  void from;
}

export interface VehicleKind {
  /** Painted parts; take the per-vehicle colour. */
  paint: THREE.BufferGeometry;
  /** A second painted part (the roof and pillars), coloured separately for taxis. */
  top: THREE.BufferGeometry;
  /** Glass, rubber and trim, chrome, lamps: one geometry with four groups. */
  rest: THREE.BufferGeometry;
  /** Additive ground light: a headlight throw ahead, a red glow behind. */
  beams: THREE.BufferGeometry;
  length: number;
}

const HEAD: RGB = [1, 0.94, 0.82];
const TAIL: RGB = [1, 0.04, 0.02];
const AMBER: RGB = [1, 0.45, 0.04];

function beams(front: number, back: number, width: number) {
  const quad = (x0: number, w0: number, x1: number, w1: number, col: RGB) => {
    const q = new THREE.BufferGeometry();
    const y = 0.08;
    q.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, -w0, x1, y, -w1, x1, y, w1, x0, y, -w0, x1, y, w1, x0, y, w0], 3));
    q.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    q.setAttribute('color', new THREE.Float32BufferAttribute(new Array(6).fill(col).flat(), 3));
    return q;
  };
  return mergeGeometries([quad(front, width * 0.5, front + 11, width * 2.2, [0.16, 0.145, 0.11]), quad(back, width * 0.5, back - 3, width * 0.75, [0.22, 0.015, 0.01])])!;
}

/** A compact four-door sedan, 4.3 m long. */
export function sedan(): VehicleKind {
  const W = 1.62; // body width before the bevel
  const AX = [1.33, -1.3];
  const body = new THREE.Shape();
  body.moveTo(-2.12, 0.3);
  sill(body, -2.12, 2.12, 0.3, AX, 0.39, 0.31);
  body.quadraticCurveTo(2.2, 0.32, 2.2, 0.48);
  body.quadraticCurveTo(2.22, 0.76, 2.04, 0.84);
  body.lineTo(1.02, 0.97);
  body.lineTo(-1.62, 1.0);
  body.lineTo(-2.06, 0.95);
  body.quadraticCurveTo(-2.2, 0.9, -2.18, 0.62);
  body.quadraticCurveTo(-2.16, 0.32, -2.12, 0.3);
  const paint = [prep(extrude(body, W, 0.06))];
  // Mirrors.
  for (const s of [-1, 1]) paint.push(prep(box(0.16, 0.1, 0.16, 0.78, 1.04, s * 0.92)));

  // Glasshouse: one tinted shell, then roof and pillars painted over it.
  const gl = new THREE.Shape();
  gl.moveTo(1.0, 0.98);
  gl.quadraticCurveTo(0.55, 1.28, 0.2, 1.4);
  gl.lineTo(-0.92, 1.42);
  gl.quadraticCurveTo(-1.3, 1.3, -1.66, 1.0);
  gl.lineTo(1.0, 0.98);
  const glass = [prep(extrude(gl, 1.4, 0.04))];
  const top = [
    prep(new THREE.BoxGeometry(1.16, 0.06, 1.44).translate(-0.36, 1.45, 0)),
    // B-pillars and C-pillars across both sides.
    prep(box(0.1, 0.42, 1.5, -0.3, 1.2, 0)),
    prep(box(0.16, 0.3, 1.49, -1.22, 1.18, 0)),
  ];
  const { tyre, rim } = wheels(AX, 0.31, 0.7, 0.21);
  const trim = [
    ...tyre.map((g) => prep(g)),
    prep(box(0.1, 0.2, 1.62, 2.2, 0.42, 0)), // front bumper lip
    prep(box(0.1, 0.18, 1.62, -2.17, 0.42, 0)), // rear bumper
    prep(box(0.04, 0.12, 0.78, 2.19, 0.62, 0)), // grille
    prep(box(2.7, 0.05, 0.03, -0.3, 0.985, 0.87)), // window rubbers along each side
    prep(box(2.7, 0.05, 0.03, -0.3, 0.985, -0.87)),
  ];
  const chrome = [...rim.map((g) => prep(g)), prep(box(0.02, 0.025, 0.7, 2.215, 0.66, 0))];
  const lamps = [
    prep(box(0.07, 0.11, 0.34, 2.15, 0.74, 0.56), HEAD),
    prep(box(0.07, 0.11, 0.34, 2.15, 0.74, -0.56), HEAD),
    prep(box(0.06, 0.04, 0.08, 2.17, 0.66, 0.7), AMBER),
    prep(box(0.06, 0.04, 0.08, 2.17, 0.66, -0.7), AMBER),
    prep(box(0.07, 0.13, 0.4, -2.17, 0.8, 0.58), TAIL),
    prep(box(0.07, 0.13, 0.4, -2.17, 0.8, -0.58), TAIL),
    prep(box(0.05, 0.04, 0.5, -1.62, 1.03, 0), TAIL), // high brake light
  ];
  return {
    paint: mergeGeometries(paint)!,
    top: mergeGeometries(top)!,
    rest: mergeGeometries([mergeGeometries(glass)!, mergeGeometries(trim)!, mergeGeometries(chrome)!, mergeGeometries(lamps)!], true)!,
    beams: beams(2.25, -2.2, 1.7),
    length: 4.4,
  };
}

/** A single-deck city bus, 11 m long, its cabin lit from inside. */
export function bus(): VehicleKind {
  const L = 5.5, H = 3.1, W = 2.36;
  const AX = [3.55, -2.65];
  const body = new THREE.Shape();
  body.moveTo(-L + 0.1, 0.35);
  sill(body, -L, L - 0.1, 0.35, AX, 0.62, 0.5);
  body.quadraticCurveTo(L, 0.35, L, 0.6);
  body.lineTo(L + 0.02, H - 0.2);
  body.quadraticCurveTo(L, H, L - 0.3, H);
  body.lineTo(-L + 0.2, H);
  body.quadraticCurveTo(-L, H, -L, H - 0.2);
  body.lineTo(-L, 0.6);
  body.quadraticCurveTo(-L, 0.35, -L + 0.1, 0.35);
  const paint = [prep(extrude(body, W, 0.05))];
  const top = [prep(box(2 * L - 0.6, 0.18, W - 0.3, -0.2, H + 0.12, 0))]; // roof pod
  // Side windows: a dark frame band with lit panes set into it.
  const glass = [
    prep(box(2 * L - 1.3, 1.05, W + 0.11, -0.35, 2.05, 0)),
    prep(box(0.05, 1.5, W - 0.2, L + 0.08, 1.95, 0)), // windscreen
  ];
  const lamps: THREE.BufferGeometry[] = [];
  const cabin: RGB = [0.42, 0.37, 0.26];
  for (let x = -L + 0.9; x < L - 1.3; x += 1.25) {
    for (const s of [-1, 1]) lamps.push(prep(box(1.05, 0.85, 0.02, x + 0.55, 2.05, s * (W / 2 + 0.065)), cabin));
  }
  lamps.push(
    prep(box(0.05, 0.26, 1.7, L + 0.1, H - 0.28, 0), AMBER), // destination board
    prep(box(0.07, 0.16, 0.36, L + 0.06, 0.72, 0.85), HEAD),
    prep(box(0.07, 0.16, 0.36, L + 0.06, 0.72, -0.85), HEAD),
    prep(box(0.06, 0.4, 0.2, -L - 0.06, 0.95, 0.98), TAIL),
    prep(box(0.06, 0.4, 0.2, -L - 0.06, 0.95, -0.98), TAIL),
  );
  const { tyre, rim } = wheels(AX, 0.5, 0.98, 0.3);
  const trim = [
    ...tyre.map((g) => prep(g)),
    prep(box(2 * L + 0.1, 0.32, W + 0.12, 0, 0.55, 0)), // dark skirt
    prep(box(0.12, 0.3, W, L + 0.06, 0.5, 0)), // bumper
    prep(box(0.12, 0.3, W, -L - 0.06, 0.5, 0)),
  ];
  return {
    paint: mergeGeometries(paint)!,
    top: mergeGeometries(top)!,
    rest: mergeGeometries([mergeGeometries(glass)!, mergeGeometries(trim)!, mergeGeometries(rim.map((g) => prep(g)))!, mergeGeometries(lamps)!], true)!,
    beams: beams(L + 0.1, -L - 0.1, 2.4),
    length: 11.2,
  };
}

let shared: { paint: THREE.Material; rest: THREE.Material[]; beam: THREE.Material } | undefined;

function materials(beamTex: THREE.Texture) {
  if (shared) return shared;
  const lamp = new THREE.MeshBasicMaterial({ vertexColors: true });
  lamp.color.setScalar(2.6);
  shared = {
    paint: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.06 }),
    rest: [
      new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.04, metalness: 0.9 }), // glass
      new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.75 }), // rubber and trim
      new THREE.MeshStandardMaterial({ color: 0xc4c8ce, roughness: 0.22, metalness: 1 }), // chrome and alloy
      lamp,
    ],
    beam: new THREE.MeshBasicMaterial({ map: beamTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  return shared;
}

/** Instanced meshes for n vehicles of one kind. Index 0 takes body colours, 1 the roof colours. */
export function fleet(kind: VehicleKind, n: number, beamTex: THREE.Texture) {
  const m = materials(beamTex);
  const paint = new THREE.InstancedMesh(kind.paint, m.paint, n);
  const top = new THREE.InstancedMesh(kind.top, m.paint, n);
  const rest = new THREE.InstancedMesh(kind.rest, m.rest, n);
  const glow = new THREE.InstancedMesh(kind.beams, m.beam, n);
  for (const x of [paint, top, rest]) x.castShadow = true;
  glow.userData.noCast = true;
  const all = [paint, top, rest, glow];
  for (const x of all) x.frustumCulled = false;
  return all;
}
