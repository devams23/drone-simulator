// Dev-only course audit (?audit). Loads each world, then checks every gate and
// the straight line between consecutive steps against terrain and colliders.
// Results land in <pre id="audit"> so a headless --dump-dom run can read them.
import * as THREE from 'three';
import { COURSES } from '../courses';
import type { Game } from '../game';
import type { WorldId } from '../data';

export function runAudit(game: Game, only?: string | null) {
  const out: string[] = [];
  const worlds = only ? [only] : [...new Set(COURSES.map((c) => c.world))];
  for (const wid of worlds) {
    game.loadMission(wid as WorldId);
    const m = game.mission!;
    const boxes = m.world.boxes;
    const ground = (x: number, z: number) => Math.max(m.world.heightAt(x, z), m.waterY ?? -1e9);
    const surface = (x: number, z: number) => {
      let s = ground(x, z);
      for (const b of boxes) if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y > s) s = b.max.y;
      return s;
    };
    const hit = (p: THREE.Vector3, pad: number) =>
      boxes.find((b) => p.x > b.min.x - pad && p.x < b.max.x + pad && p.y > b.min.y - pad && p.y < b.max.y + pad && p.z > b.min.z - pad && p.z < b.max.z + pad);
    const fmt = (n: number) => n.toFixed(1);
    if (only) {
      // Layout dump: tall colliders, for laying courses by hand.
      const minH = Number(new URLSearchParams(location.search).get('tall') ?? 24);
      const tall = boxes.filter((b) => b.max.y - b.min.y > minH).map((b) => `${fmt((b.min.x + b.max.x) / 2)},${fmt((b.min.z + b.max.z) / 2)},${fmt(b.max.x - b.min.x)},${fmt(b.max.z - b.min.z)},${fmt(b.max.y)}`);
      out.push(`# ${wid} tall boxes x,z,w,d,top`, tall.join(' '));
    }
    for (const c of COURSES.filter((c) => c.world === wid)) {
      out.push(`== ${c.id} (${wid})`);
      let prev = m.spawn.clone().setY(m.spawn.y + 2);
      let total = 0;
      c.steps.forEach((s, i) => {
        let p: THREE.Vector3;
        const notes: string[] = [];
        if (s.kind === 'ring' || s.kind === 'slot') {
          const [x, h, z] = s.at;
          p = new THREE.Vector3(x, ground(x, z) + h, z);
          const yaw = Math.atan2(-(p.x - prev.x), -(p.z - prev.z));
          const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
          const rx = s.kind === 'ring' ? (s.r ?? 4) : s.w / 2, ry = s.kind === 'ring' ? (s.r ?? 4) : s.h / 2;
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            const q = p.clone().addScaledVector(right, Math.cos(a) * rx).add(new THREE.Vector3(0, Math.sin(a) * ry, 0));
            if (q.y < ground(q.x, q.z) + 0.3) { notes.push('frame-in-ground'); break; }
            if (hit(q, 0.2)) { notes.push('frame-in-box'); break; }
          }
          notes.push(`g=${fmt(ground(x, z))}`);
        } else {
          const [x, z] = s.at;
          const sf = surface(x, z);
          p = new THREE.Vector3(x, sf + 2.5, z);
          notes.push(`surf=${fmt(sf)}${sf > ground(x, z) + 0.5 ? ' (roof)' : ''}`);
          // A landing target needs room for the whole pad ring on the surface.
          const r = s.kind === 'pickup' ? 2.4 : (s.r ?? 2.5);
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const e = surface(x + Math.cos(a) * r, z + Math.sin(a) * r);
            if (Math.abs(e - sf) > 0.6) { notes.push(`edge-uneven(${fmt(e - sf)})`); break; }
          }
        }
        // Straight-line path from the previous step.
        const d = prev.distanceTo(p);
        total += d;
        const n = Math.ceil(d);
        for (let k = 2; k < n - 2; k++) {
          const q = prev.clone().lerp(p, k / n);
          if (q.y < ground(q.x, q.z) + 0.8) { notes.push(`path-terrain@${fmt(q.x)},${fmt(q.z)}`); break; }
          const b = hit(q, 0.8);
          if (b) { notes.push(`path-box@${fmt(q.x)},${fmt(q.y)},${fmt(q.z)} top=${fmt(b.max.y)}`); break; }
        }
        out.push(`${i + 1} ${s.kind} [${'at' in s ? s.at.join(',') : ''}] y=${fmt(p.y)} d=${fmt(d)} ${notes.join(' ')}`);
        prev = p;
      });
      out.push(`len ${fmt(total)} m, par ${c.par}`);
    }
  }
  const pre = document.createElement('pre');
  pre.id = 'audit';
  pre.textContent = out.join('\n');
  document.body.append(pre);
}
