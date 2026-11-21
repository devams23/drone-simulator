// Phone remote: two transmitter gimbals (Mode 2) whose state is streamed to
// the game through the relay, in the room named by ?room= (from the QR code).
// Loaded by phone.html only.
import type { PadMsg, FbMsg } from './remote';
import { Link, ROOM_RE } from './link';

const $ = (id: string) => document.getElementById(id)!;
const id = Math.random().toString(36).slice(2, 8);

const state: PadMsg = { id, thr: -1, yaw: 0, pitch: 0, roll: 0, gim: 0, pri: false, sec: false, view: 0 };
const buzz = (ms: number | number[]) => navigator.vibrate?.(ms);

/** Gentle expo so small corrections stay fine and full deflection is still full. */
const expo = (v: number, k = 0.45) => v * (1 - k) + v * v * v * k;

interface Gimbal {
  el: HTMLElement;
  knob: HTMLElement;
  x: number; // -1..1 (right +)
  y: number; // -1..1 (up +)
  springY: boolean;
  pointer: number | null;
  start: { px: number; py: number; x: number; y: number };
}

function gimbal(el: HTMLElement, springY: boolean, y0: number): Gimbal {
  const g: Gimbal = { el, knob: el.querySelector('.stick')!, x: 0, y: y0, springY, pointer: null, start: { px: 0, py: 0, x: 0, y: 0 } };
  let lastStep = Math.round(g.y * 10);
  el.addEventListener('pointerdown', (e) => {
    if (g.pointer !== null) return;
    g.pointer = e.pointerId;
    el.setPointerCapture(e.pointerId);
    // Relative drag: the stick carries on from where it is, so the throttle never jumps.
    g.start = { px: e.clientX, py: e.clientY, x: g.x, y: g.y };
    buzz(6);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== g.pointer) return;
    const r = el.getBoundingClientRect().width * 0.35;
    g.x = clamp(g.start.x + (e.clientX - g.start.px) / r);
    g.y = clamp(g.start.y - (e.clientY - g.start.py) / r);
    if (!springY) {
      // A light tick every 10% of throttle, like a ratchet; a firmer one at hover.
      const step = Math.round(g.y * 10);
      if (step !== lastStep) {
        buzz(step === 0 ? 18 : 4);
        lastStep = step;
      }
    }
    draw(g);
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== g.pointer) return;
    g.pointer = null;
    springBack(g);
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  draw(g);
  return g;
}

function springBack(g: Gimbal) {
  const step = () => {
    if (g.pointer !== null) return;
    g.x *= 0.55;
    if (g.springY) g.y *= 0.55;
    if (Math.abs(g.x) < 0.01) g.x = 0;
    if (g.springY && Math.abs(g.y) < 0.01) g.y = 0;
    draw(g);
    if (g.x || (g.springY && g.y)) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

function draw(g: Gimbal) {
  const r = g.el.getBoundingClientRect().width * 0.35;
  g.knob.style.transform = `translate(${g.x * r}px, ${-g.y * r}px) rotateX(${g.y * 18}deg) rotateY(${g.x * 18}deg)`;
}

const left = gimbal($('left'), false, -1);
const right = gimbal($('right'), true, 0);
const redraw = () => (draw(left), draw(right));
window.addEventListener('resize', redraw);
requestAnimationFrame(redraw);
setTimeout(redraw, 300);

// Hold buttons.
const held = new Set<string>();
document.querySelectorAll<HTMLElement>('[data-hold]').forEach((b) => {
  const k = b.dataset.hold!;
  const on = (e: PointerEvent) => {
    b.setPointerCapture(e.pointerId);
    held.add(k);
    b.classList.add('down');
    buzz(10);
  };
  const off = () => {
    held.delete(k);
    b.classList.remove('down');
  };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
});
const viewBtn = $('view');
viewBtn.addEventListener('pointerdown', () => {
  state.view++;
  viewBtn.classList.add('down');
  buzz(12);
});
viewBtn.addEventListener('pointerup', () => viewBtn.classList.remove('down'));

// Room: from the QR link, or typed in on the start screen.
let link: Link | undefined;
const codeIn = $('code') as HTMLInputElement;
function join(code: string) {
  code = code.trim().toUpperCase();
  if (!ROOM_RE.test(code)) return false;
  if (link?.room !== code) {
    link?.close();
    link = new Link(code, 'phone');
    link.on('fb', feedback);
    history.replaceState(null, '', `?room=${code}`);
  }
  $('room').textContent = code;
  return true;
}
const fromUrl = new URLSearchParams(location.search).get('room') ?? '';
if (join(fromUrl)) $('start').classList.add('has-room');
codeIn.addEventListener('input', () => (codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));

if (location.search.includes('demo')) $('start').classList.add('gone');
$('go').addEventListener('click', async () => {
  if (!link && !join(codeIn.value)) {
    codeIn.focus();
    codeIn.classList.add('bad');
    buzz([30, 40, 30]);
    return;
  }
  $('start').classList.add('gone');
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    /* not every browser allows it; the remote still works */
  }
});

// Stream ~30 times a second.
setInterval(() => {
  state.thr = left.y;
  state.yaw = expo(left.x);
  state.pitch = expo(right.y);
  state.roll = expo(right.x);
  state.gim = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
  state.pri = held.has('pri');
  state.sec = held.has('sec');
  link?.send('pad', state);
}, 33);

// Feedback from the game: telemetry and rumble.
let lastFb = 0;
function feedback(m: FbMsg) {
  lastFb = performance.now();
  if (m.buzz) buzz(m.buzz);
  if (m.alt !== undefined) {
    $('alt').innerHTML = `${Math.round(m.alt)}<small>m</small>`;
    $('spd').innerHTML = `${Math.round(m.spd ?? 0)}<small>km/h</small>`;
    $('bat').innerHTML = `${Math.round((m.bat ?? 1) * 100)}<small>%</small>`;
    $('hull').innerHTML = `${Math.round((m.hull ?? 1) * 100)}<small>%</small>`;
    ($('batbar') as HTMLElement).style.width = `${(m.bat ?? 1) * 100}%`;
    ($('hullbar') as HTMLElement).style.width = `${(m.hull ?? 1) * 100}%`;
    $('viewtxt').textContent = m.view === 'chase' ? 'CHASE' : 'COCKPIT';
  }
}
setInterval(() => {
  const on = !!link?.up && performance.now() - lastFb < 1500;
  $('link').classList.toggle('on', on);
  $('linktxt').textContent = !link ? 'No room' : !link.up ? 'Offline' : on ? 'Linked' : 'Waiting';
}, 300);
