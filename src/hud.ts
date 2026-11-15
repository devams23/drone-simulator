// In-flight overlay: reticle, gauges, objective, markers, radar and warnings.
import * as THREE from 'three';
import type { Drone } from './drone';
import type { Scheme } from './input';
import type { Mission } from './missions/base';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const RADAR_RANGE = 230;

export class Hud {
  private root = $('hud');
  private vignette = $('vignette');
  private horizon = $('horizon');
  private markerLayer = $('markers');
  private markerEls: HTMLElement[] = [];
  private objTitle = $('obj-title');
  private objLines = $('obj-lines');
  private objMeter = $('obj-meter');
  private objMeterLabel = $('obj-meter-label');
  private objMeterFill = $('obj-meter-fill');
  private state = $('state');
  private toasts = $('toasts');
  private alt = $('v-alt');
  private spd = $('v-spd');
  private hdg = $('v-hdg');
  private vs = $('v-vs');
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
  private wind = $('wind-arrow');
  private windTxt = $('wind-txt');
  private radar = $<HTMLCanvasElement>('radar').getContext('2d')!;
  private flashV = 0;
  private slow = 0;
  private lastToast = '';
  private lastToastAt = 0;
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

  update(d: Drone, m: Mission, cam: THREE.PerspectiveCamera, dt: number, scheme: Scheme) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const focal = H / 2 / Math.tan((cam.fov * Math.PI) / 360);

    // Artificial horizon follows bank and camera tilt.
    const shift = Math.max(-H * 0.42, Math.min(H * 0.42, d.camPitch * focal));
    this.horizon.style.transform = `translate(-50%, -50%) translateY(${shift.toFixed(1)}px) rotate(${(-d.roll * 0.75).toFixed(3)}rad)`;

    // Damage flash + persistent red edge when the hull is nearly gone.
    this.flashV = Math.max(0, this.flashV - dt * 1.8);
    const hullFrac = d.hull / d.ph.hull;
    const edge = Math.max(this.flashV, hullFrac < 0.3 ? 0.25 + (0.3 - hullFrac) : 0);
    this.vignette.style.opacity = edge.toFixed(2);
    this.root.classList.toggle('static', !d.alive || d.outOfBounds);

    this.updateMarkers(d, m, cam, W, H);

    // Text and gauges change slowly; refresh them ten times a second.
    this.slow += dt;
    if (this.slow < 0.1) return;
    this.slow = 0;

    const ground = Math.max(m.world.heightAt(d.pos.x, d.pos.z), m.waterY ?? -1e9);
    this.alt.textContent = Math.max(0, d.pos.y - ground - 0.7).toFixed(0);
    this.spd.textContent = Math.hypot(d.vel.x, d.vel.z).toFixed(0);
    this.vs.textContent = `${d.vel.y >= 0 ? '+' : ''}${d.vel.y.toFixed(1)}`;
    const deg = ((((-d.yaw * 180) / Math.PI) % 360) + 360) % 360;
    this.hdg.textContent = `${String(Math.round(deg) % 360).padStart(3, '0')}° ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]}`;

    this.bar(this.batt, d.battery, d.battery < 0.2);
    this.battTxt.textContent = `${Math.round(d.battery * 100)}%`;
    this.bar(this.hull, hullFrac, hullFrac < 0.3);
    this.hullTxt.textContent = `${Math.round(hullFrac * 100)}%`;
    const p = m.payload();
    this.payLabel.textContent = p.label;
    this.bar(this.pay, p.frac, p.frac <= 0.001);
    this.payTxt.textContent = p.text;
    this.payExtra.textContent = p.extra ?? '';

    const o = m.objective();
    this.objTitle.textContent = o.title;
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

    let warn = '';
    if (!d.alive) warn = 'SIGNAL LOST';
    else if (d.outOfBounds) warn = 'WEAK SIGNAL — TURN BACK';
    else if (d.battery <= 0) warn = 'BATTERY FLAT — AUTO LANDING';
    else if (d.battery < 0.2) warn = 'LOW BATTERY';
    else if (hullFrac < 0.3) warn = 'HULL CRITICAL';
    this.warn.textContent = warn;

    const up = scheme === 'rc' ? 'W' : 'SPACE';
    this.hint.textContent = d.alive && d.landed && d.battery > 0 ? (d.armed ? `Motors on — hold ${up} to lift off` : `Hold ${up} to start the motors and take off`) : '';

    // Wind relative to where the drone is facing.
    const sy = Math.sin(d.yaw);
    const cy = Math.cos(d.yaw);
    const ws = m.wind.length();
    const wr = m.wind.x * cy - m.wind.z * sy;
    const wf = -m.wind.x * sy - m.wind.z * cy;
    this.wind.style.transform = `rotate(${Math.atan2(wr, wf).toFixed(2)}rad)`;
    this.wind.style.opacity = ws > 0.3 ? '1' : '0.25';
    this.windTxt.textContent = `WIND ${ws.toFixed(1)} m/s`;

    this.drawRadar(d, m, sy, cy);
  }

  private bar(el: HTMLElement, frac: number, bad: boolean) {
    el.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
    el.classList.toggle('bad', bad);
  }

  private updateMarkers(d: Drone, m: Mission, cam: THREE.PerspectiveCamera, W: number, H: number) {
    const list = [...m.markers];
    // Always offer a way home when things get tight.
    if (d.battery < 0.3 || d.hull < d.ph.hull * 0.4) {
      list.push({ pos: this.v.set(m.pad.x, m.pad.y + 4, m.pad.z).clone(), icon: 'H', color: '#7dff6b', label: 'Pad', visible: true });
    }
    cam.getWorldDirection(this.dir);
    let n = 0;
    for (const mk of list) {
      if (!mk.visible) continue;
      let el = this.markerEls[n];
      if (!el) {
        el = document.createElement('div');
        el.className = 'marker';
        el.innerHTML = '<b></b><span></span>';
        this.markerLayer.appendChild(el);
        this.markerEls[n] = el;
      }
      n++;
      const dist = mk.pos.distanceTo(d.pos);
      const behind = this.v.copy(mk.pos).sub(cam.position).dot(this.dir) < 0;
      this.v.copy(mk.pos).project(cam);
      let x = this.v.x;
      let y = this.v.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      let off = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.86;
      if (off) {
        // Slide to the screen edge in the right direction.
        const k = 1 / Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.86, 1e-6);
        if (behind || k < 1) {
          x *= k;
          y *= k;
        }
        if (behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.86) y = -0.86;
      }
      off = off || behind;
      el.style.display = '';
      el.style.transform = `translate(${((x * 0.5 + 0.5) * W).toFixed(1)}px, ${((0.5 - y * 0.5) * H).toFixed(1)}px)`;
      el.style.setProperty('--c', mk.color);
      el.classList.toggle('off', off);
      (el.firstChild as HTMLElement).textContent = mk.icon;
      (el.lastChild as HTMLElement).textContent = `${mk.label ? mk.label + ' · ' : ''}${Math.round(dist)} m`;
    }
    for (let i = n; i < this.markerEls.length; i++) this.markerEls[i].style.display = 'none';
  }

  private drawRadar(d: Drone, m: Mission, sy: number, cy: number) {
    const g = this.radar;
    const S = g.canvas.width;
    const c = S / 2;
    const R = c - 6;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(8, 24, 44, 0.55)';
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 1;
    for (const k of [1, 0.5]) {
      g.beginPath();
      g.arc(c, c, R * k, 0, Math.PI * 2);
      g.stroke();
    }
    // View cone.
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, R, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62);
    g.fill();

    const plot = (x: number, z: number, color: string, size: number, text?: string) => {
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
      const px = c + rx * R;
      const py = c - fy * R;
      g.fillStyle = color;
      if (text) {
        g.font = 'bold 13px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, px, py);
      } else {
        g.beginPath();
        g.arc(px, py, edge ? size * 0.7 : size, 0, Math.PI * 2);
        g.fill();
      }
    };
    for (const mk of m.markers) if (mk.visible) plot(mk.pos.x, mk.pos.z, mk.color, 4);
    plot(m.pad.x, m.pad.z, '#7dff6b', 4, 'H');

    // The drone itself.
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(c, c - 7);
    g.lineTo(c + 5, c + 5);
    g.lineTo(c, c + 2);
    g.lineTo(c - 5, c + 5);
    g.closePath();
    g.fill();
  }
}
