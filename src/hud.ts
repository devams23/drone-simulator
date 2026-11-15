// In-flight overlay drawn like a ground-control display: telemetry strip,
// compass, speed and altitude tapes, pitch ladder, attitude ball, speed dial,
// stick monitors, target brackets, radar and warnings.
import * as THREE from 'three';
import type { Drone } from './drone';
import type { Controls, Scheme } from './input';
import type { Mission } from './missions/base';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const RADAR_RANGE = 230;
const TAU = Math.PI * 2;
const LINE = 'rgba(255,255,255,0.92)';
const SOFT = 'rgba(255,255,255,0.55)';
const SHADOW = 'rgba(0,12,24,0.55)';
const FONT = '"Chakra Petch", "Segoe UI", sans-serif';
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** A 2D canvas that keeps itself sized to its CSS box at device resolution. */
function ctx2d(el: HTMLCanvasElement) {
  const g = el.getContext('2d')!;
  return {
    g,
    fit() {
      const r = Math.min(window.devicePixelRatio || 1, 2);
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * r) || el.height !== Math.round(h * r)) {
        el.width = Math.round(w * r);
        el.height = Math.round(h * r);
      }
      g.setTransform(r, 0, 0, r, 0, 0);
      g.clearRect(0, 0, w, h);
      return [w, h] as const;
    },
  };
}

export class Hud {
  private root = $('hud');
  private vignette = $('vignette');
  private markerLayer = $('markers');
  private markerEls: HTMLElement[] = [];
  private objective = $('objective');
  private objTitle = $('obj-title');
  private objLines = $('obj-lines');
  private objMeter = $('obj-meter');
  private objMeterLabel = $('obj-meter-label');
  private objMeterFill = $('obj-meter-fill');
  private missionName = $('t-mission');
  private state = $('state');
  private clock = $('t-clock');
  private signal = $('t-signal');
  private sats = $('t-sats');
  private battTop = $('t-batt-top');
  private toasts = $('toasts');
  private vsEl = $('v-vs');
  private homeEl = $('v-home');
  private hdgEl = $('v-hdg');
  private batt = $('b-batt');
  private battTxt = $('t-batt');
  private hull = $('b-hull');
  private hullTxt = $('t-hull');
  private payLabel = $('l-pay');
  private pay = $('b-pay');
  private payTxt = $('t-pay');
  private payExtra = $('pay-extra');
  private hint = $('hint');
  private warn = $('warn');
  private windArrow = $('wind-arrow');
  private windTxt = $('wind-txt');
  private stickL = $('stick-l').firstElementChild as HTMLElement;
  private stickR = $('stick-r').firstElementChild as HTMLElement;
  private radar = $<HTMLCanvasElement>('radar').getContext('2d')!;
  private overlay = ctx2d($<HTMLCanvasElement>('overlay'));
  private att = ctx2d($<HTMLCanvasElement>('att'));
  private dial = ctx2d($<HTMLCanvasElement>('dial'));
  private flashV = 0;
  private slow = 0;
  private flightT = 0;
  private lastToast = '';
  private lastToastAt = 0;
  private sL = new THREE.Vector2();
  private sR = new THREE.Vector2();
  private v = new THREE.Vector3();
  private dir = new THREE.Vector3();

  show(on: boolean) {
    this.root.hidden = !on;
  }

  reset() {
    this.toasts.innerHTML = '';
    this.flashV = 0;
    this.lastToast = '';
    this.slow = 1;
    this.flightT = 0;
  }

  flash(amount: number) {
    this.flashV = Math.min(1, Math.max(this.flashV, amount));
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' = 'info') {
    const now = performance.now();
    if (text === this.lastToast && now - this.lastToastAt < 2500) return;
    this.lastToast = text;
    this.lastToastAt = now;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toasts.prepend(el);
    while (this.toasts.children.length > 3) this.toasts.lastChild!.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  update(d: Drone, m: Mission, cam: THREE.PerspectiveCamera, dt: number, scheme: Scheme, c: Controls, free: boolean) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const focal = H / 2 / Math.tan((cam.fov * Math.PI) / 360);
    if (!d.landed) this.flightT += dt;

    // Damage flash + persistent red edge when the hull is nearly gone.
    this.flashV = Math.max(0, this.flashV - dt * 1.8);
    const hullFrac = d.hull / d.ph.hull;
    const edge = Math.max(this.flashV, hullFrac < 0.3 ? 0.25 + (0.3 - hullFrac) : 0);
    this.vignette.style.opacity = edge.toFixed(2);
    this.root.classList.toggle('static', !d.alive || d.outOfBounds);
    this.root.classList.toggle('free', free);

    const ground = Math.max(m.world.heightAt(d.pos.x, d.pos.z), m.waterY ?? -1e9);
    const agl = Math.max(0, d.pos.y - ground - 0.7);
    const speed = Math.hypot(d.vel.x, d.vel.z);
    const deg = ((((-d.yaw * 180) / Math.PI) % 360) + 360) % 360;

    this.updateMarkers(d, m, cam, W, H, free);
    this.drawOverlay(d, m, W, H, focal, agl, speed, deg, free);
    this.drawAttitude(d);
    this.drawDial(d, speed);
    this.updateSticks(c, dt);

    // Text and gauges change slowly; refresh them ten times a second.
    this.slow += dt;
    if (this.slow < 0.1) return;
    this.slow = 0;

    const home = Math.hypot(d.pos.x - m.pad.x, d.pos.z - m.pad.z);
    this.vsEl.textContent = `${d.vel.y >= 0 ? '+' : '−'}${Math.abs(d.vel.y).toFixed(1)}`;
    this.homeEl.textContent = home.toFixed(0);
    this.hdgEl.textContent = `${String(Math.round(deg) % 360).padStart(3, '0')}° ${CARD[Math.round(deg / 45) % 8]}`;

    const t = Math.floor(this.flightT);
    this.clock.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    const bars = !d.alive ? 0 : d.outOfBounds ? 1 : Math.max(2, 4 - Math.floor(home / 160));
    this.signal.dataset.bars = String(bars);
    this.sats.textContent = String(d.alive ? 14 + Math.round(Math.sin(this.flightT * 0.05) * 2) : 0);
    this.battTop.textContent = `${Math.round(d.battery * 100)}%`;
    this.battTop.classList.toggle('bad', d.battery < 0.2);

    this.bar(this.batt, d.battery, d.battery < 0.2);
    this.battTxt.textContent = `${Math.round(d.battery * 100)}%`;
    this.bar(this.hull, hullFrac, hullFrac < 0.3);
    this.hullTxt.textContent = `${Math.round(hullFrac * 100)}%`;
    const p = m.payload();
    this.payLabel.textContent = p.label;
    this.bar(this.pay, p.frac, p.frac <= 0.001);
    this.payTxt.textContent = p.text;
    this.payExtra.textContent = p.extra ?? '';

    if (free) {
      this.missionName.textContent = 'FREE FLIGHT';
      this.objective.hidden = true;
      this.state.textContent = '';
    } else {
      const o = m.objective();
      this.missionName.textContent = o.title;
      this.objective.hidden = false;
      this.objTitle.textContent = 'OBJECTIVES';
      this.objLines.innerHTML = o.lines.map((l) => `<li>${l}</li>`).join('');
      this.objMeter.hidden = !o.meter;
      if (o.meter) {
        this.objMeterLabel.textContent = o.meter.label;
        this.objMeterFill.style.width = `${Math.round(Math.max(0, Math.min(1, o.meter.value)) * 100)}%`;
        const danger = o.meter.bad ? o.meter.value > 0.65 : o.meter.value < 0.2;
        this.objMeterFill.className = danger ? 'bad' : o.meter.bad ? 'warm' : '';
      }
      this.state.textContent = m.state;
      this.state.classList.toggle('alert', m.state === 'TAKING FIRE');
    }

    let warn = '';
    if (!d.alive) warn = 'SIGNAL LOST';
    else if (d.outOfBounds) warn = 'WEAK SIGNAL — TURN BACK';
    else if (d.battery <= 0) warn = 'BATTERY FLAT — AUTO LANDING';
    else if (d.battery < 0.2) warn = 'LOW BATTERY';
    else if (hullFrac < 0.3) warn = 'HULL CRITICAL';
    this.warn.textContent = warn;

    const up = scheme === 'rc' ? 'W' : 'SPACE';
    this.hint.textContent = d.alive && d.landed && d.battery > 0 ? (d.armed ? `Motors armed — hold ${up} to lift off` : `Hold ${up} to arm motors and take off`) : '';

    // Wind relative to where the drone is facing.
    const sy = Math.sin(d.yaw);
    const cy = Math.cos(d.yaw);
    const ws = m.wind.length();
    const wr = m.wind.x * cy - m.wind.z * sy;
    const wf = -m.wind.x * sy - m.wind.z * cy;
    this.windArrow.style.transform = `rotate(${Math.atan2(wr, wf).toFixed(2)}rad)`;
    this.windArrow.style.opacity = ws > 0.3 ? '1' : '0.3';
    this.windTxt.textContent = `${ws.toFixed(1)} m/s`;

    this.drawRadar(d, m, sy, cy, free);
  }

  private bar(el: HTMLElement, frac: number, bad: boolean) {
    el.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
    el.classList.toggle('bad', bad);
  }

  // ------------------------------------------------------------ sticks
  private updateSticks(c: Controls, dt: number) {
    const k = Math.min(1, dt * 14);
    const yaw = Math.max(-1, Math.min(1, c.yaw + c.mouseYaw * -14));
    this.sL.x += (yaw - this.sL.x) * k;
    this.sL.y += (c.throttle - this.sL.y) * k;
    this.sR.x += (c.roll - this.sR.x) * k;
    this.sR.y += (c.pitch - this.sR.y) * k;
    const put = (el: HTMLElement, v: THREE.Vector2) => {
      el.style.transform = `translate(${(v.x * 30).toFixed(1)}px, ${(-v.y * 30).toFixed(1)}px)`;
    };
    put(this.stickL, this.sL);
    put(this.stickR, this.sR);
  }

  // ------------------------------------------------- tapes, ladder, compass
  private drawOverlay(d: Drone, m: Mission, W: number, H: number, focal: number, agl: number, speed: number, deg: number, free: boolean) {
    const [w, h] = this.overlay.fit();
    const g = this.overlay.g;
    g.lineCap = 'round';
    g.shadowColor = SHADOW;
    g.shadowBlur = 3;
    const cx = w / 2;
    const cy = h / 2;

    // Pitch ladder, clipped to a circle round the reticle.
    const shift = d.camPitch * focal;
    const step = (10 * Math.PI) / 180 * focal;
    const clipR = Math.min(h * 0.27, 230);
    g.save();
    g.beginPath();
    g.arc(cx, cy, clipR, 0, TAU);
    g.clip();
    g.translate(cx, cy);
    g.rotate(-d.roll * 0.75);
    g.translate(0, shift);
    g.strokeStyle = LINE;
    g.fillStyle = LINE;
    g.font = `600 11px ${FONT}`;
    g.textBaseline = 'middle';
    // Horizon with a gap round the reticle.
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-clipR, 0);
    g.lineTo(-46, 0);
    g.moveTo(46, 0);
    g.lineTo(clipR, 0);
    g.stroke();
    g.lineWidth = 1.2;
    for (let k = -6; k <= 6; k++) {
      if (!k) continue;
      const y = -k * step;
      const half = k % 2 ? 34 : 54;
      g.setLineDash(k < 0 ? [6, 5] : []);
      g.beginPath();
      g.moveTo(-half - 26, y + (k < 0 ? -6 : 6));
      g.lineTo(-half - 26, y);
      g.lineTo(-26, y);
      g.moveTo(26, y);
      g.lineTo(half + 26, y);
      g.lineTo(half + 26, y + (k < 0 ? -6 : 6));
      g.stroke();
      g.setLineDash([]);
      if (k % 2 === 0) {
        g.textAlign = 'right';
        g.fillText(String(Math.abs(k * 10)), -half - 32, y);
        g.textAlign = 'left';
        g.fillText(String(Math.abs(k * 10)), half + 32, y);
      }
    }
    g.restore();

    // Speed tape (left) and altitude tape (right).
    const gap = Math.min(w * 0.25, 330);
    const tapeH = Math.min(h * 0.42, 300);
    this.tape(g, cx - gap, cy, tapeH, speed * 3.6, 3, 10, 'left', 'KM/H', String(Math.round(speed * 3.6)));
    this.tape(g, cx + gap, cy, tapeH, agl, 7, 5, 'right', 'AGL M', agl < 10 ? agl.toFixed(1) : String(Math.round(agl)));

    // Vertical speed caret beside the altitude tape.
    const vs = Math.max(-6, Math.min(6, d.vel.y));
    g.strokeStyle = vs >= 0 ? '#7dffb0' : '#ffb36b';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx + gap + 72, cy);
    g.lineTo(cx + gap + 72, cy - vs * (tapeH / 14));
    g.stroke();

    // Compass tape across the top.
    const cw = Math.min(w * 0.42, 520);
    const top = 58;
    const pxDeg = cw / 110;
    g.save();
    g.beginPath();
    g.rect(cx - cw / 2, top - 4, cw, 34);
    g.clip();
    g.strokeStyle = SOFT;
    g.fillStyle = LINE;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    const first = Math.floor((deg - 60) / 5) * 5;
    for (let a = first; a <= deg + 60; a += 5) {
      const x = cx + (a - deg) * pxDeg;
      const n = ((a % 360) + 360) % 360;
      const major = n % 15 === 0;
      g.lineWidth = major ? 1.4 : 1;
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x, top + (major ? 9 : 5));
      g.stroke();
      if (major) {
        const card = n % 45 === 0 ? CARD[n / 45] : '';
        g.font = card ? `700 13px ${FONT}` : `500 10px ${FONT}`;
        g.fillStyle = card === 'N' ? '#ffc531' : LINE;
        g.fillText(card || String(n), x, top + 12);
      }
    }
    // Target bearings as small coloured pips on the tape.
    if (!free) {
      for (const mk of m.markers) {
        if (!mk.visible) continue;
        const b = ((Math.atan2(mk.pos.x - d.pos.x, -(mk.pos.z - d.pos.z)) * 180) / Math.PI + 360) % 360;
        let rel = b - deg;
        rel = ((rel + 540) % 360) - 180;
        const x = cx + Math.max(-55, Math.min(55, rel)) * pxDeg;
        g.fillStyle = mk.color;
        g.beginPath();
        g.moveTo(x, top - 1);
        g.lineTo(x - 4, top - 7);
        g.lineTo(x + 4, top - 7);
        g.fill();
      }
    }
    g.restore();
    // Heading box.
    g.fillStyle = 'rgba(8,14,22,0.7)';
    g.strokeStyle = LINE;
    g.lineWidth = 1.2;
    g.beginPath();
    g.roundRect(cx - 24, top - 26, 48, 20, 3);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.font = `700 13px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText(String(Math.round(deg) % 360).padStart(3, '0'), cx, top - 16);
    g.beginPath();
    g.moveTo(cx, top - 4);
    g.lineTo(cx - 4, top - 6);
    g.lineTo(cx + 4, top - 6);
    g.fill();
  }

  private tape(g: CanvasRenderingContext2D, x: number, cy: number, H: number, value: number, pxPer: number, label: number, side: 'left' | 'right', title: string, text: string) {
    const dir = side === 'left' ? -1 : 1;
    g.save();
    g.beginPath();
    g.rect(x - 70, cy - H / 2, 140, H);
    g.clip();
    g.strokeStyle = SOFT;
    g.fillStyle = LINE;
    g.lineWidth = 1;
    g.font = `500 11px ${FONT}`;
    g.textBaseline = 'middle';
    g.textAlign = side === 'left' ? 'right' : 'left';
    // Spine.
    g.beginPath();
    g.moveTo(x, cy - H / 2);
    g.lineTo(x, cy + H / 2);
    g.stroke();
    const span = H / 2 / pxPer;
    for (let v = Math.ceil(value - span); v <= value + span; v++) {
      if (v < 0) continue;
      const y = cy - (v - value) * pxPer;
      const major = v % label === 0;
      if (!major && v % (pxPer < 4 ? 5 : 1) !== 0) continue;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dir * (major ? 10 : 5), y);
      g.stroke();
      if (major && Math.abs(y - cy) > 14) g.fillText(String(v), x + dir * 14, y);
    }
    g.restore();
    // Current value box.
    const bw = 58;
    const bx = side === 'left' ? x - bw - 4 : x + 4;
    g.fillStyle = 'rgba(8,14,22,0.72)';
    g.strokeStyle = LINE;
    g.lineWidth = 1.2;
    g.beginPath();
    g.roundRect(bx, cy - 13, bw, 26, 3);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.font = `700 16px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, bx + bw / 2, cy + 1);
    g.fillStyle = SOFT;
    g.font = `600 10px ${FONT}`;
    g.fillText(title, x, cy - H / 2 - 12);
  }

  // ---------------------------------------------------------- attitude
  private drawAttitude(d: Drone) {
    const [w, h] = this.att.fit();
    const g = this.att.g;
    const c = w / 2;
    const R = Math.min(w, h) / 2 - 8;
    g.save();
    g.beginPath();
    g.arc(c, c, R, 0, TAU);
    g.clip();
    g.translate(c, c);
    g.rotate(-d.roll);
    const off = Math.max(-R, Math.min(R, -d.pitch * R * 1.3));
    g.fillStyle = 'rgba(64,150,230,0.55)';
    g.fillRect(-R * 2, -R * 2, R * 4, R * 2 + off);
    g.fillStyle = 'rgba(120,84,48,0.6)';
    g.fillRect(-R * 2, off, R * 4, R * 2);
    g.strokeStyle = '#fff';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-R * 2, off);
    g.lineTo(R * 2, off);
    g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    for (const k of [-2, -1, 1, 2]) {
      const y = off - k * R * 0.22;
      const half = k % 2 ? R * 0.18 : R * 0.32;
      g.beginPath();
      g.moveTo(-half, y);
      g.lineTo(half, y);
      g.stroke();
    }
    g.restore();
    // Bezel and bank scale.
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(c, c, R, 0, TAU);
    g.stroke();
    g.strokeStyle = LINE;
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const t = ((a - 90) * Math.PI) / 180;
      const l = a % 30 === 0 ? 9 : 5;
      g.beginPath();
      g.moveTo(c + Math.cos(t) * (R + 1), c + Math.sin(t) * (R + 1));
      g.lineTo(c + Math.cos(t) * (R + 1 + l * 0.6), c + Math.sin(t) * (R + 1 + l * 0.6));
      g.stroke();
    }
    // Bank pointer.
    const bt = -Math.PI / 2 - d.roll;
    g.fillStyle = '#ffc531';
    g.beginPath();
    g.moveTo(c + Math.cos(bt) * (R - 2), c + Math.sin(bt) * (R - 2));
    g.lineTo(c + Math.cos(bt - 0.08) * (R - 11), c + Math.sin(bt - 0.08) * (R - 11));
    g.lineTo(c + Math.cos(bt + 0.08) * (R - 11), c + Math.sin(bt + 0.08) * (R - 11));
    g.fill();
    // Fixed aircraft symbol.
    g.strokeStyle = '#ffc531';
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(c - R * 0.5, c);
    g.lineTo(c - R * 0.16, c);
    g.lineTo(c, c + R * 0.1);
    g.lineTo(c + R * 0.16, c);
    g.lineTo(c + R * 0.5, c);
    g.stroke();
    g.fillStyle = '#ffc531';
    g.beginPath();
    g.arc(c, c, 2.2, 0, TAU);
    g.fill();
  }

  // -------------------------------------------------------- speed dial
  private drawDial(d: Drone, speed: number) {
    const [w] = this.dial.fit();
    const g = this.dial.g;
    const c = w / 2;
    const R = c - 9;
    const max = Math.ceil((d.ph.maxSpeed * 3.6) / 20) * 20;
    const a0 = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const frac = Math.min(1, (speed * 3.6) / max);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(c, c, R, a0, a0 + sweep);
    g.stroke();
    const grad = g.createLinearGradient(0, w, w, 0);
    grad.addColorStop(0, '#5fd8ff');
    grad.addColorStop(1, frac > 0.85 ? '#ff8a5a' : '#c9f3ff');
    g.strokeStyle = grad;
    g.beginPath();
    g.arc(c, c, R, a0, a0 + sweep * Math.max(0.001, frac));
    g.stroke();
    g.strokeStyle = SOFT;
    g.fillStyle = SOFT;
    g.lineWidth = 1;
    g.font = `500 9px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let v = 0; v <= max; v += 10) {
      const t = a0 + (v / max) * sweep;
      const major = v % 20 === 0;
      g.beginPath();
      g.moveTo(c + Math.cos(t) * (R - 7), c + Math.sin(t) * (R - 7));
      g.lineTo(c + Math.cos(t) * (R - (major ? 13 : 10)), c + Math.sin(t) * (R - (major ? 13 : 10)));
      g.stroke();
      if (major && max <= 120) g.fillText(String(v), c + Math.cos(t) * (R - 22), c + Math.sin(t) * (R - 22));
    }
    const t = a0 + frac * sweep;
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(c + Math.cos(t) * (R * 0.2), c + Math.sin(t) * (R * 0.2));
    g.lineTo(c + Math.cos(t) * (R - 6), c + Math.sin(t) * (R - 6));
    g.stroke();
    g.fillStyle = '#fff';
    g.font = `700 22px ${FONT}`;
    g.fillText(String(Math.round(speed * 3.6)), c, c + R * 0.42);
    g.fillStyle = SOFT;
    g.font = `600 9px ${FONT}`;
    g.fillText('KM/H', c, c + R * 0.72);
  }

  // ------------------------------------------------------------ markers
  private updateMarkers(d: Drone, m: Mission, cam: THREE.PerspectiveCamera, W: number, H: number, free: boolean) {
    const list = free ? [] : [...m.markers];
    // Always offer a way home when things get tight.
    if (!free && (d.battery < 0.3 || d.hull < d.ph.hull * 0.4)) {
      list.push({ pos: new THREE.Vector3(m.pad.x, m.pad.y + 4, m.pad.z), icon: 'H', color: '#7dff6b', label: 'Home pad', visible: true });
    }
    cam.getWorldDirection(this.dir);
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const items = list
      .filter((mk) => mk.visible)
      .map((mk) => ({ mk, dist: mk.pos.distanceTo(d.pos) }))
      .sort((a, b) => a.dist - b.dist);
    let n = 0;
    for (const { mk, dist } of items) {
      let el = this.markerEls[n];
      if (!el) {
        el = document.createElement('div');
        el.className = 'marker';
        el.innerHTML = '<b><em></em></b><span><strong></strong><small></small></span>';
        this.markerLayer.appendChild(el);
        this.markerEls[n] = el;
      }
      n++;
      const behind = this.v.copy(mk.pos).sub(cam.position).dot(this.dir) < 0;
      this.v.copy(mk.pos).project(cam);
      let x = this.v.x;
      let y = this.v.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      let off = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.8;
      if (off) {
        const k = 1 / Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.8, 1e-6);
        if (behind || k < 1) {
          x *= k;
          y *= k;
        }
        if (behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.8) y = -0.8;
      }
      off = off || behind;
      const px = (x * 0.5 + 0.5) * W;
      const py = (0.5 - y * 0.5) * H;
      // Bracket size shrinks with distance.
      const size = Math.round(Math.max(18, Math.min(44, 1400 / Math.max(dist, 1))));
      el.style.display = '';
      el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      el.style.setProperty('--c', mk.color);
      el.style.setProperty('--s', `${size}px`);
      el.classList.toggle('off', off);
      const name = mk.label ?? '';
      (el.querySelector('em') as HTMLElement).textContent = mk.icon;
      (el.querySelector('strong') as HTMLElement).textContent = name;
      (el.querySelector('small') as HTMLElement).textContent = `${Math.round(dist)} m`;
      // Push labels down until they no longer overlap a nearer one.
      const lw = Math.max(name.length, 6) * 7 + 10;
      const lx = px + size / 2 + 6;
      let ly = py - size / 2;
      let tries = 0;
      const hits = () => placed.some((r) => lx < r.x + r.w && lx + lw > r.x && ly < r.y + r.h && ly + 28 > r.y);
      while (hits() && tries < 6) {
        ly += 30;
        tries++;
      }
      const span = el.querySelector('span') as HTMLElement;
      span.style.transform = `translate(${(size / 2 + 6).toFixed(0)}px, ${(ly - py).toFixed(0)}px)`;
      span.style.visibility = hits() || off ? 'hidden' : 'visible';
      placed.push({ x: lx, y: ly, w: lw, h: 28 });
    }
    for (let i = n; i < this.markerEls.length; i++) this.markerEls[i].style.display = 'none';
  }

  // -------------------------------------------------------------- radar
  private drawRadar(d: Drone, m: Mission, sy: number, cy: number, free: boolean) {
    const g = this.radar;
    const S = g.canvas.width;
    const c = S / 2;
    const R = c - 4;
    g.clearRect(0, 0, S, S);
    const bg = g.createRadialGradient(c, c, 0, c, c, R);
    bg.addColorStop(0, 'rgba(14,30,44,0.35)');
    bg.addColorStop(1, 'rgba(8,16,26,0.62)');
    g.fillStyle = bg;
    g.beginPath();
    g.arc(c, c, R, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = 1;
    for (const k of [1, 0.66, 0.33]) {
      g.beginPath();
      g.arc(c, c, R * k, 0, TAU);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(c - R, c);
    g.lineTo(c + R, c);
    g.moveTo(c, c - R);
    g.lineTo(c, c + R);
    g.stroke();
    // View cone.
    const cone = g.createRadialGradient(c, c, 0, c, c, R);
    cone.addColorStop(0, 'rgba(160,230,255,0.28)');
    cone.addColorStop(1, 'rgba(160,230,255,0)');
    g.fillStyle = cone;
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, R, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62);
    g.fill();
    // North marker rotates with heading.
    g.fillStyle = '#ffc531';
    g.font = `700 11px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const north = this.toRadar(d.pos.x, d.pos.z - 1e6, d, sy, cy);
    g.fillText('N', c + north[0] * (R - 9), c - north[1] * (R - 9));

    const plot = (x: number, z: number, color: string, size: number, text?: string) => {
      const [rx, fy, edge] = this.toRadar(x, z, d, sy, cy);
      const px = c + rx * (R - 4);
      const py = c - fy * (R - 4);
      g.fillStyle = color;
      if (text) {
        g.font = `700 11px ${FONT}`;
        g.fillText(text, px, py);
      } else {
        g.beginPath();
        g.arc(px, py, edge ? size * 0.7 : size, 0, TAU);
        g.fill();
      }
    };
    if (!free) for (const mk of m.markers) if (mk.visible) plot(mk.pos.x, mk.pos.z, mk.color, 3.5);
    plot(m.pad.x, m.pad.z, '#7dff6b', 4, 'H');

    // The drone itself.
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(c, c - 6);
    g.lineTo(c + 4.5, c + 4.5);
    g.lineTo(c, c + 2);
    g.lineTo(c - 4.5, c + 4.5);
    g.closePath();
    g.fill();
  }

  private toRadar(x: number, z: number, d: Drone, sy: number, cy: number): [number, number, boolean] {
    const dx = x - d.pos.x;
    const dz = z - d.pos.z;
    let rx = (dx * cy - dz * sy) / RADAR_RANGE;
    let fy = (-dx * sy - dz * cy) / RADAR_RANGE;
    const len = Math.hypot(rx, fy);
    const edge = len > 1;
    if (edge) {
      rx /= len;
      fy /= len;
    }
    return [rx, fy, edge];
  }
}
