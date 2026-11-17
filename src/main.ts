// Menus and the player journey: garage → operation or free roam → hangar →
// briefing → flight → debrief. Every menu sits over a live 3D drone studio.
import './style.css';
import { DRONES, STAT_LABELS, physics, type DroneSpec, type WorldId } from './data';
import { isOpen, progress, type CourseDef, type ModeId } from './course';
import { COURSES, MODES, ladder } from './courses';
import { Game, type Quality, type Result, type View } from './game';
import { Garage, type Shot } from './garage';
import type { Scheme } from './input';
import qrcode from 'qrcode-generator';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
const hudEl = document.getElementById('hud')!;
const game = new Game(canvas);
let garage: Garage | undefined;

type Screen = 'loading' | 'intro' | 'title' | 'modes' | 'ladder' | 'roam' | 'settings' | 'hangar' | 'brief' | 'pause' | 'debrief' | 'phone' | 'none';
let screen: Screen = 'none';
let drone: DroneSpec = DRONES[1];
let place: Place | undefined;
/** The course picked from a ladder; undefined in free roam. */
let course: CourseDef | undefined;
let mode: ModeId = 'gates';
let lastResult: Result | undefined;

const ACCENT = '#7cc9c0';
const SHOTS: Partial<Record<Screen, Shot>> = { intro: 'intro', title: 'title', settings: 'title', modes: 'roam', ladder: 'roam', roam: 'roam', hangar: 'hangar', brief: 'brief' };

interface Place {
  id: WorldId;
  name: string;
  terrain: string;
  blurb: string;
}
const PLACES: Place[] = [
  { id: 'canyon', name: 'Basalt Gorge', terrain: 'Canyon · river · waterfalls', blurb: 'A glacial river between mossy basalt walls. Thread the stacks, chase the falls to the headwall.' },
  { id: 'fire', name: 'Pine Valley', terrain: 'Forest · lake · village', blurb: 'Tall conifers, a lakeside village and ridgelines to thread between.' },
  { id: 'strike', name: 'Red Mesa', terrain: 'Desert · sandstone', blurb: 'Sandstone towers and wide open washes under a low, warm sun.' },
  { id: 'relief', name: 'Riverlands', terrain: 'Floodplain · farms', blurb: 'Flooded fields, rooftops and tree lines after the storm has passed.' },
];

// ------------------------------------------------------------ saved progress
const best: Record<string, number> = (() => {
  try {
    return JSON.parse(localStorage.getItem('skyduty.best') || '{}');
  } catch {
    return {};
  }
})();
// Line icons (24px grid, drawn with currentColor).
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  ops: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  roam: svg('<path d="M3 19l6-9 4 6 3-4 5 7z"/><circle cx="16.5" cy="6.5" r="1.8"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  phone: svg('<rect x="3" y="7" width="18" height="10" rx="3"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/>'),
  fire: svg('<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>'),
  strike: svg('<circle cx="12" cy="12" r="7"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="1"/>'),
  relief: svg('<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>'),
  canyon: svg('<path d="M3 19l5-12 3 6 2-3 8 9z"/><path d="M9 19c1-2 3-2 4-4"/>'),
  pine: svg('<path d="M12 3l5 7h-3l4 6H6l4-6H7z"/><path d="M12 16v5"/>'),
  sun: svg('<circle cx="12" cy="10" r="3.5"/><path d="M12 3v1.5M5 10H3.5M20.5 10H19M6.6 4.6l1 1M17.4 4.6l-1 1M3 19h18M6 16h12"/>'),
  wave: svg('<path d="M3 9c3-2 6 2 9 0s6-2 9 0M3 14c3-2 6 2 9 0s6-2 9 0M3 19c3-2 6 2 9 0s6-2 9 0"/>'),
  gates: svg('<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="4.5" opacity=".45"/>'),
  courier: svg('<path d="M12 3v7"/><rect x="8" y="10" width="8" height="7" rx="1"/><path d="M5 21h14"/>'),
  thread: svg('<rect x="4" y="8" width="16" height="8" rx="1"/><path d="M1 12h22" stroke-dasharray="2 2.5"/>'),
  touch: svg('<ellipse cx="12" cy="17" rx="8" ry="3"/><path d="M12 3v9M9 9l3 3 3-3"/>'),
  lock: svg('<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>'),
  fly: svg('<path d="M4 17c4-1 6-4 8-10 2 6 4 9 8 10"/><circle cx="12" cy="6" r="1.6"/>'),
  chev: svg('<path d="M10 7l5 5-5 5"/>'),
};
const PLACE_ICON: Record<string, string> = { canyon: ICON.canyon, fire: ICON.pine, strike: ICON.sun, relief: ICON.wave };

const rating = (n: number) => `<span class="rating">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const pad2 = (n: number) => String(n).padStart(2, '0');

function top(crumbs: string[]) {
  const now = new Date();
  return `<header class="top">
    <div class="crumbs"><b>SkyDuty</b>${crumbs.map((c) => `<span>${c}</span>`).join('')}</div>
    <div class="meta"><span>${pad2(now.getHours())}:${pad2(now.getMinutes())}</span></div>
  </header>`;
}

// ------------------------------------------------------------------ screens
function show(next: Screen, html = '', dim = false) {
  screen = next;
  ui.innerHTML = html;
  ui.dataset.screen = next;
  ui.classList.toggle('on', next !== 'none');
  ui.classList.toggle('dim', dim);
  ui.scrollTop = 0;
  const shot = SHOTS[next];
  if (garage) {
    if (shot) garage.setShot(shot);
    garage.run(!!shot);
  }
  game.halt = !!shot && !!garage;
  (ui.querySelector('[autofocus]') as HTMLElement | null)?.focus();
}

function intro() {
  garage?.setAccent(ACCENT);
  show(
    'intro',
    `<section class="screen intro">
      <div class="fade"></div>
      <div class="mark">
        <h1>SkyDuty</h1>
        <div class="rule"></div>
        <p>First-person drone flight</p>
      </div>
      <button class="enter" data-act="title" autofocus>Press any key to enter</button>
      <footer class="intro-foot"><span>Headphones recommended</span><span>Keyboard · Mouse · Gamepad</span></footer>
    </section>`,
  );
}

function title() {
  garage?.setAccent(ACCENT);
  show(
    'title',
    `<section class="screen home">
      ${top([])}
      <div class="home-body">
        <div class="hero"><p>FPV drone flight</p><h1>SkyDuty</h1></div>
        <nav class="menu">
          ${menuItem('modes', ICON.fly, 'Fly', 'Gates, courier, threading, touchdown', true)}
          ${menuItem('roam', ICON.roam, 'Free roam', 'No clock, no gates, no rules')}
          ${menuItem('settings', ICON.settings, 'Settings', 'Graphics, camera and controls')}
          ${menuItem('phone', ICON.phone, 'Phone remote', 'Use your phone as the transmitter')}
        </nav>
      </div>
      <footer class="status">
        <span><i class="dot"></i>On the pad · <b>${drone.name}</b></span>
        <span>Esc back · Enter select</span>
      </footer>
    </section>`,
  );
}

function menuItem(act: string, icon: string, t: string, sub: string, focus = false) {
  return `<button data-act="${act}" ${focus ? 'autofocus' : ''}><span class="ico">${icon}</span><span class="tx"><span class="t">${t}</span><small>${sub}</small></span><span class="chev">${ICON.chev}</span></button>`;
}

function rail(head: string, sub: string, cards: string) {
  return `<div class="pick-head"><h2 class="h">${head}</h2><p class="sub">${sub}</p></div>
    <div class="rail">${cards}</div>`;
}

function roamScreen() {
  garage?.setAccent(ACCENT);
  show(
    'roam',
    `<section class="screen pick">
      ${top(['Free roam'])}
      ${rail(
        'Free roam',
        'Unlimited battery, no objectives. Just fly.',
        PLACES.map(
          (p, i) => `<button class="card" style="--hue:${ACCENT}" data-act="pick-place" data-id="${p.id}" ${i === 0 ? 'autofocus' : ''}>
            <span class="card-top"><span class="ico">${PLACE_ICON[p.id]}</span></span>
            <span class="role">${p.terrain}</span>
            <b>${p.name}</b>
            <span class="blurb">${p.blurb}</span>
            <span class="foot"><span>Unlimited battery</span><span class="chev">${ICON.chev}</span></span>
          </button>`,
        ).join(''),
      )}
      <div class="actions"><button class="btn" data-act="title" data-back>Back <span class="key">ESC</span></button><span class="grow"></span><span class="hint">← → browse · Enter select</span></div>
    </section>`,
  );
}

const fmt = (t?: number) => (t === undefined ? '—' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t * 10) % 10)}`);
const placeName = (id: WorldId) => PLACES.find((p) => p.id === id)!.name;

/** Three marks: finished, clean, smooth. */
function marks(on: [boolean, boolean, boolean]) {
  return `<span class="marks">${(['Finished', 'Clean', 'Smooth'] as const).map((k, i) => `<i class="${on[i] ? 'on' : ''}" title="${k}">${k}</i>`).join('')}</span>`;
}

function modes() {
  garage?.setAccent(ACCENT);
  course = undefined;
  const rec = progress();
  show(
    'modes',
    `<section class="screen pick">
      ${top(['Fly'])}
      ${rail(
        'Fly',
        'Four disciplines. Each one opens its next course when you fly the last one clean.',
        MODES.map((m) => {
          const list = ladder(m.id);
          const clean = list.filter((c) => rec[c.id]?.clean).length;
          return `<button class="card" data-act="pick-mode" data-id="${m.id}" ${m.id === mode ? 'autofocus' : ''}>
            <span class="card-top"><span class="ico">${ICON[m.id]}</span><span class="tally">${clean}<small>/${list.length || 3}</small></span></span>
            <span class="role">${list.length ? `${list.length} courses` : 'Being surveyed'}</span>
            <b>${m.name}</b>
            <span class="blurb">${m.line}</span>
            <span class="foot"><span>${clean ? `${clean} flown clean` : 'Not flown yet'}</span><span class="chev">${ICON.chev}</span></span>
          </button>`;
        }).join(''),
      )}
      <div class="actions"><button class="btn" data-act="title" data-back>Back <span class="key">ESC</span></button><span class="grow"></span><span class="hint">← → browse · Enter select</span></div>
    </section>`,
  );
}

function ladderScreen() {
  garage?.setAccent(ACCENT);
  const md = MODES.find((m) => m.id === mode)!;
  const list = ladder(mode);
  const rec = progress();
  const firstOpen = list.findIndex((c, i) => isOpen(list, i) && !rec[c.id]?.clean);
  show(
    'ladder',
    `<section class="screen pick">
      ${top(['Fly', md.name])}
      ${rail(
        md.name,
        md.rule,
        list
          .map((c, i) => {
            const open = isOpen(list, i);
            const r = rec[c.id] ?? {};
            const focus = c.id === course?.id || (!course && i === Math.max(0, firstOpen));
            return `<button class="card course ${open ? '' : 'locked'}" data-act="${open ? 'pick-course' : 'locked'}" data-id="${c.id}" ${focus ? 'autofocus' : ''}>
              <span class="card-top"><span class="num">${String(i + 1).padStart(2, '0')}</span>${open ? marks([r.best !== undefined, !!r.clean, !!r.smooth]) : `<span class="ico">${ICON.lock}</span>`}</span>
              <span class="role">${placeName(c.world)}</span>
              <b>${c.name}</b>
              <span class="blurb">${open ? c.line : `Fly ${list[i - 1].name} clean to open this one.`}</span>
              <span class="foot"><span>Par ${fmt(c.par)}</span><span>${r.best !== undefined ? `Best ${fmt(r.best)}` : ''}</span></span>
            </button>`;
          })
          .join(''),
      )}
      <div class="actions"><button class="btn" data-act="modes" data-back>Back <span class="key">ESC</span></button><span class="grow"></span><span class="hint">Finished · Clean · Smooth (under par)</span></div>
    </section>`,
  );
}

function pickCourse(c: CourseDef) {
  course = c;
  mode = c.mode;
  place = PLACES.find((p) => p.id === c.world)!;
  openWorld(c.world);
}

function unit(d: DroneSpec) {
  const ph = physics(d);
  return `<button class="unit ${d.id === drone.id ? 'on' : ''}" data-act="pick-drone" data-id="${d.id}">
    <small>${d.tier} class</small><b>${d.name}</b><span class="meta">${Math.round(ph.maxSpeed * 3.6)} km/h</span>
  </button>`;
}

function hangar() {
  const fleet = DRONES;
  const hue = ACCENT;
  const ph = physics(drone);
  garage?.setDrone(drone);
  garage?.setAccent(hue);
  const list = fleet.map(unit).join('');
  show(
    'hangar',
    `<section class="screen" style="--hue:${hue}">
      ${top(course ? ['Fly', MODES.find((m) => m.id === course!.mode)!.name, course.name, 'Hangar'] : ['Free roam', place?.name ?? '', 'Hangar'])}
      <div class="hangar">
        <aside class="panel fleet"><h3 class="label">Fleet <em>${fleet.length}</em></h3>${list}</aside>
        <div class="ident">
          <div class="label">${drone.tier} · ${drone.code}</div>
          <h2>${drone.name}</h2>
          <p>${drone.tagline}</p>
        </div>
        <aside class="panel spec">
          <h3 class="label">Flight profile</h3>
          ${STAT_LABELS.map(
            ([k, label]) => `<div class="stat"><span>${label}</span><span class="meter"><i style="width:${drone.stats[k] * 10}%"></i></span><b>${drone.stats[k]}</b></div>`,
          ).join('')}
          <div class="facts">
            <div><b>${Math.round(ph.maxSpeed * 3.6)}</b>Top km/h</div>
            <div><b>${Math.round(ph.batterySec / 6) / 10}</b>Endurance min</div>
            <div><b>${Math.round(ph.climb * 10) / 10}</b>Climb m/s</div>
            <div><b>${Math.round((ph.yawRate * 180) / Math.PI)}</b>Yaw °/s</div>
          </div>
        </aside>
      </div>
      <div class="actions">
        <button class="btn" data-act="${course ? 'ladder' : 'roam'}" data-back>Back <span class="key">ESC</span></button>
        <span class="grow"></span>
        <button class="btn primary" data-act="brief" autofocus>Pre-flight <span class="key">↵</span></button>
      </div>
    </section>`,
  );
}

function controlsHtml(s: Scheme) {
  const rows: [string, string][] =
    s === 'rc'
      ? [
          ['W / S', 'Throttle up / down (left stick)'],
          ['A / D', 'Yaw left / right (left stick)'],
          ['↑ ↓ ← →', 'Pitch and roll (right stick)'],
        ]
      : [
          ['W A S D', 'Fly forward, back, strafe'],
          ['Space / Shift', 'Climb / descend'],
          ['Mouse / ← →', 'Yaw'],
        ];
  rows.push(['Q / E', 'Camera tilt down / up'], ['V / M', 'Chase camera / mute'], ['Esc', 'Pause']);
  return `<div class="keys">${rows.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
    <button class="switch" data-act="scheme">Switch to ${s === 'rc' ? 'Gamer (WASD + mouse)' : 'RC Mode 2 (transmitter)'}</button>`;
}

function brief() {
  if (course) return courseBrief(course);
  const hue = ACCENT;
  const where = place!.name;
  show(
    'brief',
    `<section class="screen" style="--hue:${hue}">
      ${top(['Free roam', where, 'Pre-flight'])}
      <div class="brief">
        <div class="lede">
          <div class="label">Free roam · ${drone.name}</div>
          <h2 class="h">${where}</h2>
          <p class="sub">${place!.blurb}</p>
        </div>
        <div class="stack">
          <div class="panel">
            <h3 class="label">Flight plan <em>Free roam</em></h3>
            <dl class="kv"><dt>Location</dt><dd>${place!.name} · ${place!.terrain}</dd></dl>
            <dl class="kv"><dt>Rules</dt><dd>No objectives, no clock. Battery never runs out.</dd></dl>
            <dl class="kv"><dt>Recovery</dt><dd>After a crash a fresh airframe waits on the pad.</dd></dl>
          </div>
          <div class="panel">
            <h3 class="label">Controls <em>${game.input.scheme === 'rc' ? 'RC Mode 2' : 'Gamer'}</em></h3>
            ${controlsHtml(game.input.scheme)}
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="btn" data-act="hangar" data-back>Hangar <span class="key">ESC</span></button>
        <span class="grow"></span>
        <button class="btn primary" data-act="free" autofocus>Take off <span class="key">↵</span></button>
      </div>
    </section>`,
  );
}

function courseBrief(c: CourseDef) {
  const md = MODES.find((m) => m.id === c.mode)!;
  const r = progress()[c.id] ?? {};
  show(
    'brief',
    `<section class="screen" style="--hue:${ACCENT}">
      ${top(['Fly', md.name, c.name, 'Pre-flight'])}
      <div class="brief">
        <div class="lede">
          <div class="label">${md.name} · ${placeName(c.world)} · ${drone.name}</div>
          <h2 class="h">${c.name}</h2>
          <p class="sub">${c.line}</p>
        </div>
        <div class="stack">
          <div class="panel">
            <h3 class="label">The run <em>Par ${fmt(c.par)}</em></h3>
            <dl class="kv"><dt>Task</dt><dd>${md.rule}</dd></dl>
            <dl class="kv"><dt>Contact</dt><dd>A brush costs you Clean. A hard hit puts you back at the last checkpoint, clock still running.</dd></dl>
            <dl class="kv"><dt>Marks</dt><dd>${marks([r.best !== undefined, !!r.clean, !!r.smooth])}${r.best !== undefined ? ` <span class="best">Best ${fmt(r.best)}</span>` : ''}</dd></dl>
          </div>
          <div class="panel">
            <h3 class="label">Controls <em>${game.input.scheme === 'rc' ? 'RC Mode 2' : 'Gamer'}</em></h3>
            ${controlsHtml(game.input.scheme)}
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="btn" data-act="hangar" data-back>Hangar <span class="key">ESC</span></button>
        <span class="grow"></span>
        <button class="btn primary" data-act="launch" autofocus>Take off <span class="key">↵</span></button>
      </div>
    </section>`,
  );
}

function courseDebrief(r: Result) {
  const c = course!;
  const cr = r.course!;
  const list = ladder(c.mode);
  const i = list.indexOf(c);
  const next = list[i + 1];
  const nextOpen = next && isOpen(list, i + 1);
  const verdict = cr.clean && cr.smooth ? 'Clean and quick' : cr.clean ? 'Clean' : cr.touches ? `${cr.touches} touch${cr.touches === 1 ? '' : 'es'}` : 'Finished';
  show(
    'debrief',
    `<section class="screen center">
      <div class="modal won course-end">
        <div>
          <div class="label">${MODES.find((m) => m.id === c.mode)!.name} · ${c.name}</div>
          <h2 class="clock">${fmt(cr.time)}</h2>
          <p class="verdict">${verdict}${cr.newBest ? ' · <b>new best</b>' : ''}</p>
          ${marks([true, cr.clean, cr.smooth])}
        </div>
        <div class="rows">
          <div><span>Par</span><b>${fmt(cr.par)}</b></div>
          <div><span>Touches</span><b>${cr.touches}</b></div>
          <div><span>Crashes</span><b>${cr.crashes}</b></div>
          <div><span>Best</span><b>${fmt(cr.best)}</b></div>
        </div>
        ${next && !nextOpen ? `<p class="reason">Fly it clean to open ${next.name}.</p>` : ''}
        <div class="actions">
          ${nextOpen ? `<button class="btn primary" data-act="pick-course" data-id="${next.id}" data-go="brief" autofocus>Next · ${next.name}</button><button class="btn" data-act="launch">Again</button>` : `<button class="btn primary" data-act="launch" autofocus>Again</button>`}
          <button class="btn" data-act="ladder">Courses</button>
        </div>
      </div>
    </section>`,
    true,
  );
}

function qualityCtl() {
  return `<div class="seg-ctl">${(['low', 'medium', 'high'] as Quality[]).map((q) => `<button class="${game.quality === q ? 'on' : ''}" data-act="quality" data-id="${q}">${q}</button>`).join('')}</div>`;
}

function viewCtl() {
  const v = game.view;
  return `<div class="seg-ctl"><button class="${v === 'fpv' ? 'on' : ''}" data-act="view" data-id="fpv">Cockpit</button><button class="${v === 'chase' ? 'on' : ''}" data-act="view" data-id="chase">Chase</button></div>`;
}

function settings() {
  garage?.setAccent(ACCENT);
  const s = game.input.scheme;
  show(
    'settings',
    `<section class="screen">
      ${top(['Settings'])}
      <div class="pane">
        <h2 class="h">Settings</h2>
        <p class="sub">Changes apply immediately and stay for this session.</p>
        <div class="panel" style="margin-top:26px">
          <div class="setting">
            <div class="row"><h4>Graphics</h4>${qualityCtl()}</div>
            <p>High adds sharper shadows, denser grass and full post-processing. Drops automatically if flight gets choppy.</p>
          </div>
          <div class="setting">
            <div class="row"><h4>Control scheme</h4>
              <div class="seg-ctl"><button class="${s === 'gamer' ? 'on' : ''}" data-act="set-scheme" data-id="gamer">Gamer</button><button class="${s === 'rc' ? 'on' : ''}" data-act="set-scheme" data-id="rc">RC Mode 2</button></div>
            </div>
            <div class="keys" style="margin-top:6px">${controlsHtml(s).split('<button')[0].replace('<div class="keys">', '')}
          </div>
          <div class="setting">
            <div class="row"><h4>Camera</h4>${viewCtl()}</div>
            <p>Cockpit flies from the nose camera. Chase follows behind so you see the whole drone. Press V in flight to switch.</p>
          </div>
        </div>
      </div>
      <div class="actions"><button class="btn" data-act="title" data-back>Back <span class="key">ESC</span></button></div>
    </section>`,
  );
}

/** Shows a QR code that opens the phone remote on the same Wi-Fi. */
function phone() {
  const from = screen === 'pause' ? 'pause' : 'title';
  if (from === 'title') garage?.setAccent(ACCENT);
  const status = () =>
    game.input.remote.connected
      ? '<span class="link on"><i></i>Phone connected</span>'
      : '<span class="link"><i></i>Waiting for your phone</span>';
  show(
    'phone',
    `<section class="screen center">
      <div class="modal phone">
        <div class="qr" id="qr"><span>Finding your network…</span></div>
        <div class="how">
          <div class="label">Controller</div>
          <h2>Phone remote</h2>
          <ol>
            <li>Put the phone on the same Wi-Fi as this PC.</li>
            <li>Scan the code with the phone camera.</li>
            <li>Tap Start and turn the phone sideways.</li>
          </ol>
          <p class="url" id="qr-url"></p>
          <div id="qr-status">${status()}</div>
          <div class="actions"><button class="btn primary" data-act="${from === 'pause' ? 'pause-back' : 'title'}" data-back autofocus>Done <span class="key">ESC</span></button></div>
        </div>
      </div>
    </section>`,
    from === 'pause',
  );
  fetch('/__skyduty/lan')
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((info: { url: string | null }) => {
      const box = document.getElementById('qr');
      if (!box) return;
      if (!info.url) {
        box.innerHTML = '<span>No network found. Start the game with <b>npm run dev</b> on a PC that is on Wi-Fi.</span>';
        return;
      }
      const q = qrcode(0, 'M');
      q.addData(info.url);
      q.make();
      box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      document.getElementById('qr-url')!.textContent = info.url;
    })
    .catch(() => {
      const box = document.getElementById('qr');
      if (box) box.innerHTML = '<span>Phone control needs the dev server: run <b>npm run dev</b>.</span>';
    });
  const tick = setInterval(() => {
    const el = document.getElementById('qr-status');
    if (!el || screen !== 'phone') return clearInterval(tick);
    el.innerHTML = status();
  }, 500);
}

function pause() {
  game.setPaused(true);
  show(
    'pause',
    `<section class="screen center">
      <div class="modal" style="--hue:${ACCENT}">
        <div>
          <div class="label">${course ? course.name : (place?.name ?? 'Free flight')} · ${drone.name}</div>
          <h2>Paused</h2>
        </div>
        ${controlsHtml(game.input.scheme)}
        <div class="setting" style="padding-bottom:0"><div class="row"><h4>Graphics</h4>${qualityCtl()}</div><div class="row" style="margin-top:8px"><h4>Camera</h4>${viewCtl()}</div></div>
        <div class="actions">
          <button class="btn primary" data-act="resume" autofocus>Resume <span class="key">ESC</span></button>
          <button class="btn" data-act="${game.free ? 'free' : 'launch'}">Restart</button>
          <button class="btn" data-act="phone">Phone remote</button>
          <button class="btn" data-act="quit">${course ? 'Exit to courses' : 'Exit to hangar'}</button>
        </div>
      </div>
    </section>`,
    true,
  );
}

function debrief(r: Result) {
  lastResult = r;
  if (r.course && course) return courseDebrief(r);
  show(
    'debrief',
    `<section class="screen center">
      <div class="modal ${r.won ? 'won' : 'lost'}">
        <div>
          <div class="label">${place?.name ?? ''}</div>
          <h2>${r.won ? 'Debrief' : 'Mission lost'}</h2>
          ${r.won ? rating(r.stars) : `<p class="reason">${r.reason}</p>`}
        </div>
        <div class="rows">${r.summary.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
        <div class="actions">
          <button class="btn primary" data-act="launch" autofocus>${r.won ? 'Fly again' : 'Retry'}</button>
          <button class="btn" data-act="hangar-reset">Change drone</button>
        </div>
      </div>
    </section>`,
    true,
  );
}

function launch(free = false) {
  if (free) course = undefined;
  game.free = free;
  game.courseDef = free ? undefined : course;
  game.sound.init();
  hudEl.style.setProperty('--hue', ACCENT);
  show('none');
  game.start(drone);
  try {
    const p = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
    p?.catch?.(() => {});
  } catch {
    /* pointer lock is optional */
  }
}

function resume() {
  show('none');
  game.setPaused(false);
  try {
    const p = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
    p?.catch?.(() => {});
  } catch {
    /* pointer lock is optional */
  }
}

function openWorld(id: WorldId) {
  game.loadMission(id);
  game.halt = true;
}

// ------------------------------------------------------------------- events
ui.addEventListener('click', (e) => {
  if (screen === 'intro') {
    game.sound.init();
    title();
    return;
  }
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el) return;
  game.sound.init();
  game.sound.click();
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'title':
      title();
      break;
    case 'roam':
      roamScreen();
      break;
    case 'modes':
      modes();
      break;
    case 'pick-mode':
      mode = id as ModeId;
      course = undefined;
      ladderScreen();
      break;
    case 'ladder':
      game.toOrbit();
      ladderScreen();
      break;
    case 'locked':
      game.sound.beep(220, 0.06);
      break;
    case 'pick-course':
      pickCourse(COURSES.find((c) => c.id === id)!);
      if (el.dataset.go === 'brief') brief();
      else hangar();
      break;
    case 'settings':
      settings();
      break;
    case 'phone':
      phone();
      break;
    case 'pause-back':
      pause();
      break;
    case 'pick-place':
      place = PLACES.find((p) => p.id === id)!;
      openWorld(place.id);
      hangar();
      break;
    case 'pick-drone':
      drone = DRONES.find((d) => d.id === id)!;
      hangar();
      break;
    case 'hangar':
      hangar();
      break;
    case 'hangar-reset':
      game.toOrbit();
      hangar();
      break;
    case 'brief':
      brief();
      break;
    case 'scheme':
      game.input.setScheme(game.input.scheme === 'rc' ? 'gamer' : 'rc');
      if (screen === 'pause') pause();
      else brief();
      break;
    case 'set-scheme':
      game.input.setScheme(id as Scheme);
      settings();
      break;
    case 'view':
      game.setView(id as View);
      if (screen === 'pause') pause();
      else settings();
      break;
    case 'quality':
      game.setQuality(id as Quality);
      if (screen === 'pause') pause();
      else settings();
      break;
    case 'launch':
      launch();
      break;
    case 'free':
      launch(true);
      break;
    case 'resume':
      resume();
      break;
    case 'quit':
      game.toOrbit();
      if (course) ladderScreen();
      else hangar();
      break;
  }
});

// Hovering or focusing an operation tints the garage pad in that operation's colour.
const tint = (e: Event) => {
  const hue = (e.target as HTMLElement).closest<HTMLElement>('[data-hue]')?.dataset.hue;
  if (hue) garage?.setAccent(hue);
};
ui.addEventListener('pointerover', tint);
ui.addEventListener('focusin', tint);

// The card rail scrolls sideways with the mouse wheel.
ui.addEventListener(
  'wheel',
  (e) => {
    const rail = (e.target as HTMLElement).closest<HTMLElement>('.rail');
    if (!rail || rail.scrollWidth <= rail.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    rail.scrollBy({ left: e.deltaY, behavior: 'smooth' });
  },
  { passive: false },
);

window.addEventListener('keydown', (e) => {
  if (screen === 'intro' && e.code !== 'Escape') {
    e.preventDefault();
    title();
    return;
  }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    const list = [...ui.querySelectorAll<HTMLElement>('.card, .menu button, .unit')];
    if (list.length) {
      const i = list.indexOf(document.activeElement as HTMLElement);
      const step = e.code === 'ArrowLeft' || e.code === 'ArrowUp' ? -1 : 1;
      const next = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + step))];
      next.focus();
      next.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      e.preventDefault();
    }
  }
  if (e.code === 'KeyM') game.sound.toggleMute();
  if (e.code === 'KeyV' && screen === 'none' && game.mode === 'fly') game.toggleView();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (screen === 'phone' && game.paused) pause();
    else if (screen === 'pause') resume();
    else if (screen === 'none' && game.mode === 'fly') pause();
    else if (e.code === 'Escape') (ui.querySelector('[data-back]') as HTMLElement | null)?.click();
  }
});

// Esc while the mouse is captured only releases it; treat that as pause too.
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && screen === 'none' && game.mode === 'fly' && !game.paused) pause();
});
window.addEventListener('blur', () => {
  if (screen === 'none' && game.mode === 'fly' && !game.paused) pause();
});

game.onEnd = (r) => {
  if (game.free) return;
  debrief(r);
};

function boot() {
  garage = new Garage();
  document.body.insertBefore(garage.canvas, ui);
  garage.setDrone(drone);
  game.loadMission('fire');
  intro();

  // Dev shortcuts: ?fly=strike (optionally &drone=mauler&air=30) jumps straight
  // into a flight; ?hangar=fire opens the hangar; ?screen=roam opens a menu.
  const qs = new URLSearchParams(location.search);
  const known = (s: string | null) => PLACES.find((p) => p.id === s)?.id;
  const autoId = known(qs.get('fly'));
  const hangId = known(qs.get('hangar'));
  const pick = (_id: WorldId) => DRONES.find((d) => d.id === qs.get('drone')) ?? drone;
  place = PLACES.find((p) => p.id === (qs.get('hangar') ?? qs.get('fly'))) ?? PLACES[0];
  const screens: Record<string, () => void> = { title, modes, ladder: ladderScreen, roam: roamScreen, settings, brief, phone };
  const cdef = COURSES.find((c) => c.id === qs.get('course'));
  if (cdef) {
    drone = pick(cdef.world);
    pickCourse(cdef);
    launch();
  }
  if (hangId) {
    drone = pick(hangId);
    openWorld(hangId);
    hangar();
    if (qs.get('screen') === 'brief') brief();
  } else if (screens[qs.get('screen') ?? '']) screens[qs.get('screen')!]();
  const v = qs.get('view');
  if (v === 'chase' || v === 'fpv') game.setView(v);
  if (autoId && !cdef) {
    drone = pick(autoId);
    openWorld(autoId);
    launch(true);
  }
  if (autoId || cdef) {
    const air = Number(qs.get('air'));
    const d = game.drone;
    if (air > 0 && d) {
      d.pos.y += air;
      d.landed = false;
      d.armed = true;
      d.spool = 1;
      d.gimbal = Number(qs.get('tilt') ?? -0.35);
      if (qs.has('x')) d.pos.x = Number(qs.get('x'));
      if (qs.has('z')) d.pos.z = Number(qs.get('z'));
      if (qs.has('yaw')) d.yaw = Number(qs.get('yaw'));
      if (qs.has('y')) d.pos.y = Number(qs.get('y'));
    }
  }
}

show(
  'loading',
  `<section class="screen loading">
    <div class="intro">
      <div class="mark" style="animation:none;margin:0"><h1>SkyDuty</h1></div>
      <div class="loadbar"><i id="loadfill"></i></div>
      <div class="loadmeta"><span id="loadtxt">Loading terrain and sky</span><span id="loadpct">0%</span></div>
    </div>
  </section>`,
);
game.onLoad = (f) => {
  const el = document.getElementById('loadfill');
  const pct = Math.round(f * 100);
  if (el) el.style.width = `${pct}%`;
  const p = document.getElementById('loadpct');
  if (p) p.textContent = `${pct}%`;
  const t = document.getElementById('loadtxt');
  if (t) t.textContent = pct < 60 ? 'Loading terrain textures' : pct < 90 ? 'Calibrating sky lighting' : 'Preparing hangar';
};
game.ready.then(boot, (err) => {
  console.error(err);
  ui.innerHTML = '<section class="screen center"><div class="modal"><h2>Could not load</h2><p class="reason">Check your connection and reload the page.</p></div></section>';
});

// Handy in the browser console while iterating.
(window as unknown as { __sky: unknown }).__sky = { game, get garage() { return garage; }, get result() { return lastResult; } };
