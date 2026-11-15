// Menus and the player journey: garage → operation or free roam → hangar →
// briefing → flight → debrief. Every menu sits over a live 3D drone garage.
import './style.css';
import { DRONES, MISSIONS, STAT_LABELS, physics, type DroneSpec, type MissionCard, type MissionId, type WorldId } from './data';
import { Game, type Quality, type Result } from './game';
import { Garage, type Shot } from './garage';
import type { Scheme } from './input';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
const hudEl = document.getElementById('hud')!;
const game = new Game(canvas);
let garage: Garage | undefined;

type Screen = 'loading' | 'title' | 'missions' | 'roam' | 'settings' | 'hangar' | 'brief' | 'pause' | 'debrief' | 'none';
let screen: Screen = 'none';
let mission: MissionCard = MISSIONS[0];
let drone: DroneSpec = DRONES[0];
/** True when the player came in through Free roam rather than an operation. */
let roam = false;
let place: Place | undefined;
let lastResult: Result | undefined;

const ACCENT = '#5ef0c4';
const SHOTS: Partial<Record<Screen, Shot>> = { title: 'title', settings: 'title', missions: 'missions', roam: 'roam', hangar: 'hangar', brief: 'brief' };

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
const rating = (n: number) => `<span class="rating">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const pad2 = (n: number) => String(n).padStart(2, '0');

function top(crumbs: string[]) {
  const now = new Date();
  return `<header class="top">
    <div class="crumbs"><b>SkyDuty</b>${crumbs.map((c) => `<span>${c}</span>`).join('')}</div>
    <div class="meta"><span><i class="dot"></i>Bay 03 online</span><span>${pad2(now.getHours())}:${pad2(now.getMinutes())} LT</span></div>
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

function title() {
  garage?.setAccent(ACCENT);
  show(
    'title',
    `<section class="screen title">
      ${top(['Hangar'])}
      <div class="hero">
        <div>
          <div class="eyebrow"><i></i>FPV flight simulator</div>
          <h1 class="wordmark">SKYDUTY</h1>
          <p class="lede">Purpose-built drones for fire, strike and relief work, and open country to fly for the view alone.</p>
        </div>
        <nav class="menu">
          <button data-act="missions" autofocus><span class="n">01</span><span class="t">Operations<small>Three missions · nine airframes</small></span><span class="go">→</span></button>
          <button data-act="roam"><span class="n">02</span><span class="t">Free roam<small>No objectives, no clock. Just fly.</small></span><span class="go">→</span></button>
          <button data-act="settings"><span class="n">03</span><span class="t">Settings<small>Graphics and controls</small></span><span class="go">→</span></button>
        </nav>
      </div>
      <footer class="status">
        <span><i class="dot"></i>On the pad · <b>${drone.name}</b> · systems nominal</span>
        <span>Keyboard + mouse · Gamepad · Headphones recommended</span>
      </footer>
    </section>`,
  );
}

function missions() {
  roam = false;
  garage?.setAccent(mission.hue);
  show(
    'missions',
    `<section class="screen">
      ${top(['Operations'])}
      <div class="pane">
        <h2 class="h">Select operation</h2>
        <p class="sub">Each operation has its own terrain, its own tool and its own fleet of three airframes.</p>
        <div class="ops">
          ${MISSIONS.map(
            (m, i) => `<button class="op" style="--hue:${m.hue}" data-act="pick-mission" data-id="${m.id}" data-hue="${m.hue}" ${m.id === mission.id ? 'autofocus' : ''}>
              <span class="n">${pad2(i + 1)}</span>
              <span><span class="role">${m.role}</span><b>${m.name}</b><span class="blurb">${m.blurb}</span><span class="goal">OBJ · ${m.objective}</span></span>
              <span class="side">Best${rating(best[m.id] ?? 0)}</span>
            </button>`,
          ).join('')}
        </div>
      </div>
      <div class="actions"><button class="btn" data-act="title" data-back>Back <span class="key">ESC</span></button></div>
    </section>`,
  );
}

function roamScreen() {
  roam = true;
  garage?.setAccent(ACCENT);
  show(
    'roam',
    `<section class="screen">
      ${top(['Free roam'])}
      <div class="pane">
        <h2 class="h">Choose a location</h2>
        <p class="sub">Unlimited battery, no objectives. Crash and you are back on the pad in seconds.</p>
        <div class="ops">
          ${PLACES.map(
            (p, i) => `<button class="op" data-act="pick-place" data-id="${p.id}" ${i === 0 ? 'autofocus' : ''}>
              <span class="n">${pad2(i + 1)}</span>
              <span><span class="role">${p.terrain}</span><b>${p.name}</b><span class="blurb">${p.blurb}</span></span>
              <span class="side"></span>
            </button>`,
          ).join('')}
        </div>
      </div>
      <div class="actions"><button class="btn" data-act="title" data-back>Back <span class="key">ESC</span></button></div>
    </section>`,
  );
}

function payloadFact(d: DroneSpec) {
  if (d.mission === 'fire') return ['Water tank', `${d.capacity} L`];
  if (d.mission === 'strike') return ['Cannon / RKT', `${d.capacity} / ${d.rockets}`];
  return ['Crates / trip', String(d.capacity)];
}

function unit(d: DroneSpec) {
  const ph = physics(d);
  return `<button class="unit ${d.id === drone.id ? 'on' : ''}" data-act="pick-drone" data-id="${d.id}">
    <small>${d.tier} class</small><b>${d.name}</b><span class="meta">${Math.round(ph.maxSpeed * 3.6)} km/h</span>
  </button>`;
}

function hangar() {
  const fleet = roam ? DRONES : DRONES.filter((d) => d.mission === mission.id);
  if (!fleet.includes(drone)) drone = fleet[1] ?? fleet[0];
  const hue = roam ? ACCENT : mission.hue;
  const ph = physics(drone);
  const [payName, payValue] = payloadFact(drone);
  const role = MISSIONS.find((m) => m.id === drone.mission)!.role;
  garage?.setDrone(drone);
  garage?.setAccent(hue);
  const list = roam
    ? MISSIONS.map((m) => `<div class="grp">${m.role}</div>${DRONES.filter((d) => d.mission === m.id).map(unit).join('')}`).join('')
    : fleet.map(unit).join('');
  show(
    'hangar',
    `<section class="screen" style="--hue:${hue}">
      ${top(roam ? ['Free roam', place?.name ?? '', 'Hangar'] : ['Operations', mission.name, 'Hangar'])}
      <div class="hangar">
        <aside class="panel fleet"><h3 class="label">Fleet <em>${fleet.length}</em></h3>${list}</aside>
        <div class="ident">
          <div class="label">${drone.tier} class · ${role}</div>
          <h2>${drone.name}</h2>
          <p>${drone.tagline}</p>
        </div>
        <aside class="panel spec">
          <h3 class="label">Flight profile</h3>
          ${STAT_LABELS.map(
            ([k, label]) => `<div class="stat"><span>${label}</span><span class="segs">${Array.from({ length: 10 }, (_, i) => `<i class="${i < drone.stats[k] ? 'on' : ''}"></i>`).join('')}</span><b>${drone.stats[k]}</b></div>`,
          ).join('')}
          <div class="facts">
            <div><b>${Math.round(ph.maxSpeed * 3.6)}</b>Top km/h</div>
            <div><b>${Math.round(ph.batterySec / 6) / 10}</b>Endurance min</div>
            <div><b>${ph.hull}</b>Hull points</div>
            <div><b>${payValue}</b>${payName}</div>
          </div>
        </aside>
      </div>
      <div class="actions">
        <button class="btn" data-act="${roam ? 'roam' : 'missions'}" data-back>Back <span class="key">ESC</span></button>
        <span class="grow"></span>
        <span class="hint">${roam ? 'Any airframe, any location' : `${fleet.length} airframes cleared for this operation`}</span>
        <button class="btn primary" data-act="brief" autofocus>${roam ? 'Pre-flight' : 'Briefing'} <span class="key">↵</span></button>
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
          ['Space / F', 'Use tool'],
        ]
      : [
          ['W A S D', 'Fly forward, back, strafe'],
          ['Space / Shift', 'Climb / descend'],
          ['Mouse / ← →', 'Yaw'],
          ['F / Click', 'Use tool'],
        ];
  rows.push(['Q / E', 'Camera tilt down / up'], ['G / R-click', 'Secondary (rockets)'], ['Esc', 'Pause']);
  return `<div class="keys">${rows.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
    <button class="switch" data-act="scheme">Switch to ${s === 'rc' ? 'Gamer (WASD + mouse)' : 'RC Mode 2 (transmitter)'}</button>`;
}

function brief() {
  const hue = roam ? ACCENT : mission.hue;
  const where = roam ? place!.name : mission.name;
  const missionPanel = roam
    ? `<div class="panel">
        <h3 class="label">Flight plan <em>Free roam</em></h3>
        <dl class="kv"><dt>Location</dt><dd>${place!.name} · ${place!.terrain}</dd></dl>
        <dl class="kv"><dt>Rules</dt><dd>No objectives, no clock. Battery never runs out.</dd></dl>
        <dl class="kv"><dt>Recovery</dt><dd>After a crash a fresh airframe waits on the pad.</dd></dl>
        <ul class="tips"><li>Fly low and fast between the trees for the best sense of speed.</li><li>Tilt the camera up (E) when flying fast so the horizon stays in view.</li></ul>
      </div>`
    : `<div class="panel">
        <h3 class="label">Mission <em>${mission.role}</em></h3>
        <dl class="kv"><dt>Objective</dt><dd>${mission.objective}</dd></dl>
        <dl class="kv"><dt>Failure</dt><dd>${mission.fail}</dd></dl>
        <dl class="kv"><dt>Tool</dt><dd>${mission.tool}</dd></dl>
        <ul class="tips">${mission.tips.map((t) => `<li>${t}</li>`).join('')}<li>Land on your pad any time to recharge the battery.</li></ul>
      </div>`;
  show(
    'brief',
    `<section class="screen" style="--hue:${hue}">
      ${top(roam ? ['Free roam', where, 'Pre-flight'] : ['Operations', where, 'Briefing'])}
      <div class="brief">
        <div class="intro">
          <div class="label">${roam ? 'Free roam' : mission.role} · ${drone.name}</div>
          <h2 class="h">${where}</h2>
          <p class="sub">${roam ? place!.blurb : mission.blurb}</p>
        </div>
        <div class="stack">
          ${missionPanel}
          <div class="panel">
            <h3 class="label">Controls <em>${game.input.scheme === 'rc' ? 'RC Mode 2' : 'Gamer'}</em></h3>
            ${controlsHtml(game.input.scheme)}
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="btn" data-act="hangar" data-back>Hangar <span class="key">ESC</span></button>
        ${roam ? '' : '<button class="btn" data-act="free">Free flight</button>'}
        <span class="grow"></span>
        <button class="btn primary" data-act="${roam ? 'free' : 'launch'}" autofocus>Take off <span class="key">↵</span></button>
      </div>
    </section>`,
  );
}

function qualityCtl() {
  return `<div class="seg-ctl">${(['low', 'medium', 'high'] as Quality[]).map((q) => `<button class="${game.quality === q ? 'on' : ''}" data-act="quality" data-id="${q}">${q}</button>`).join('')}</div>`;
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
            <div class="row"><h4>Sound</h4><span class="actions hint" style="border:0;padding:0">Press M in flight to mute</span></div>
          </div>
        </div>
      </div>
      <div class="actions"><button class="btn" data-act="title" data-back>Back <span class="key">ESC</span></button></div>
    </section>`,
  );
}

function pause() {
  game.setPaused(true);
  show(
    'pause',
    `<section class="screen center">
      <div class="modal" style="--hue:${roam ? ACCENT : mission.hue}">
        <div>
          <div class="label">${game.free ? 'Free flight' : mission.name} · ${drone.name}</div>
          <h2>Paused</h2>
        </div>
        ${controlsHtml(game.input.scheme)}
        <div class="setting" style="padding-bottom:0"><div class="row"><h4>Graphics</h4>${qualityCtl()}</div></div>
        <div class="actions">
          <button class="btn primary" data-act="resume" autofocus>Resume <span class="key">ESC</span></button>
          <button class="btn" data-act="${game.free ? 'free' : 'launch'}">Restart</button>
          <button class="btn" data-act="quit">Exit to hangar</button>
        </div>
      </div>
    </section>`,
    true,
  );
}

function debrief(r: Result) {
  lastResult = r;
  if (r.won && r.stars > (best[mission.id] ?? 0)) {
    best[mission.id] = r.stars;
    localStorage.setItem('skyduty.best', JSON.stringify(best));
  }
  show(
    'debrief',
    `<section class="screen center">
      <div class="modal ${r.won ? 'won' : 'lost'}">
        <div>
          <div class="label">${mission.name} · ${r.won ? 'Operation complete' : 'Operation failed'}</div>
          <h2>${r.won ? 'Debrief' : 'Mission lost'}</h2>
          ${r.won ? rating(r.stars) : `<p class="reason">${r.reason}</p>`}
        </div>
        <div class="rows">${r.summary.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
        <div class="actions">
          <button class="btn primary" data-act="launch" autofocus>${r.won ? 'Fly again' : 'Retry'}</button>
          <button class="btn" data-act="hangar-reset">Change drone</button>
          <button class="btn" data-act="quit-ops">Operations</button>
        </div>
      </div>
    </section>`,
    true,
  );
}

function launch(free = false) {
  game.free = free;
  game.sound.init();
  hudEl.style.setProperty('--hue', roam ? ACCENT : mission.hue);
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
  mission = MISSIONS.find((m) => m.id === id) ?? mission;
  game.loadMission(id);
  game.halt = true;
}

// ------------------------------------------------------------------- events
ui.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el) return;
  game.sound.init();
  game.sound.click();
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'title':
      title();
      break;
    case 'missions':
      missions();
      break;
    case 'roam':
      roamScreen();
      break;
    case 'settings':
      settings();
      break;
    case 'pick-mission':
      roam = false;
      openWorld(id as MissionId);
      hangar();
      break;
    case 'pick-place':
      roam = true;
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
      hangar();
      break;
    case 'quit-ops':
      game.toOrbit();
      missions();
      break;
  }
});

// Hovering an operation tints the garage pad in that operation's colour.
ui.addEventListener('pointerover', (e) => {
  const hue = (e.target as HTMLElement).closest<HTMLElement>('[data-hue]')?.dataset.hue;
  if (hue) garage?.setAccent(hue);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') game.sound.toggleMute();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (screen === 'pause') resume();
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
  title();

  // Dev shortcuts: ?fly=strike (optionally &drone=mauler&air=30) jumps straight
  // into a flight; ?hangar=fire opens the hangar; ?screen=roam opens a menu.
  const qs = new URLSearchParams(location.search);
  const known = (s: string | null) => (PLACES.find((p) => p.id === s) ?? MISSIONS.find((m) => m.id === s))?.id;
  const autoId = known(qs.get('fly'));
  const hangId = known(qs.get('hangar'));
  const pick = (id: WorldId) =>
    DRONES.find((d) => d.id === qs.get('drone') && (roam || d.mission === id)) ?? DRONES.filter((d) => d.mission === id)[1] ?? DRONES[1];
  const onlyRoam = (s?: WorldId) => !!s && !MISSIONS.some((m) => m.id === s);
  if (qs.get('roam') === '1' || onlyRoam(autoId) || onlyRoam(hangId)) {
    roam = true;
    place = PLACES.find((p) => p.id === (qs.get('hangar') ?? qs.get('fly'))) ?? PLACES[0];
  }
  const screens: Record<string, () => void> = { missions, roam: roamScreen, settings, brief };
  if (hangId) {
    drone = pick(hangId);
    openWorld(hangId);
    hangar();
    if (qs.get('screen') === 'brief') brief();
  } else if (screens[qs.get('screen') ?? '']) screens[qs.get('screen')!]();
  if (autoId) {
    drone = pick(autoId);
    openWorld(autoId);
    launch(qs.get('free') === '1' || roam);
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
    <div>
      <div class="eyebrow"><i></i>FPV flight simulator</div>
      <h1 class="wordmark">SKYDUTY</h1>
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
