// Menus and the player journey: title → mission → hangar → briefing → flight → debrief.
import * as THREE from 'three';
import './style.css';
import { DRONES, MISSIONS, STAT_LABELS, physics, type DroneSpec, type MissionCard, type MissionId } from './data';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Game, type Quality, type Result } from './game';
import { buildDrone, type DroneModel } from './models/drone';
import type { Scheme } from './input';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
const hudEl = document.getElementById('hud')!;
const game = new Game(canvas);

type Screen = 'title' | 'missions' | 'hangar' | 'brief' | 'pause' | 'debrief' | 'none';
let screen: Screen = 'none';
let mission: MissionCard = MISSIONS[0];
let drone: DroneSpec = DRONES[0];
let lastResult: Result | undefined;

// ------------------------------------------------------------ saved progress
const best: Record<string, number> = (() => {
  try {
    return JSON.parse(localStorage.getItem('skyduty.best') || '{}');
  } catch {
    return {};
  }
})();
const stars = (n: number) => `<span class="stars">${[0, 1, 2].map((i) => (i < n ? '<b>★</b>' : '★')).join('')}</span>`;

// ------------------------------------------------------------ hangar preview
const preview = (() => {
  const cv = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.9;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const key = new THREE.DirectionalLight(0xfff2dc, 3.4);
  key.position.set(2.2, 4.5, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(2048);
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -2;
  sc.right = sc.top = 2;
  sc.near = 1;
  sc.far = 12;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  const rim = new THREE.DirectionalLight(0x9fd0ff, 1.6);
  rim.position.set(-3, 2, -3);
  scene.add(key, rim);

  // Turntable: dark satin disc with a bright ring, catching the drone's shadow.
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.56, 0.06, 96), new THREE.MeshStandardMaterial({ color: 0x1b222c, roughness: 0.32, metalness: 0.6 }));
  top.position.y = -0.03;
  top.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.008, 8, 128), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.002;
  table.add(top, ring);
  for (let i = 0; i < 48; i++) {
    const tickMark = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, i % 4 ? 0.04 : 0.09), new THREE.MeshBasicMaterial({ color: 0x6f8799 }));
    const a = (i / 48) * Math.PI * 2;
    tickMark.position.set(Math.cos(a) * 1.33, 0.002, Math.sin(a) * 1.33);
    tickMark.rotation.y = -a + Math.PI / 2;
    table.add(tickMark);
  }
  scene.add(table);

  let model: DroneModel | undefined;
  let raf = 0;
  let last = 0;
  const tick = (ms: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (ms - last) / 1000 || 0.016);
    last = ms;
    const host = cv.parentElement;
    if (!host || !model) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (cv.width !== Math.floor(w * renderer.getPixelRatio()) || cv.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    model.group.rotation.y += dt * 0.45;
    table.rotation.y = model.group.rotation.y;
    model.props.forEach((p, i) => (p.rotation.y += dt * 2.2 * (i === 0 || i === 3 ? 1 : -1)));
    renderer.render(scene, cam);
  };
  return {
    canvas: cv,
    set(spec: DroneSpec) {
      const turn = model?.group.rotation.y ?? -0.7;
      if (model) {
        scene.remove(model.group);
        model.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      }
      model = buildDrone(spec);
      model.setSpin(0);
      model.group.rotation.y = turn;
      model.group.position.y = -model.foot;
      scene.add(model.group);
      const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
      const rad = Math.max(size.x, size.z) * 0.5;
      table.scale.set((rad * 1.08) / 1.5, 1, (rad * 1.08) / 1.5);
      const dist = rad * 2.6;
      cam.position.set(0, 0.36 * dist, dist);
      cam.lookAt(0, size.y * 0.3, 0);
      sc.left = sc.bottom = -rad * 1.4;
      sc.right = sc.top = rad * 1.4;
      sc.updateProjectionMatrix();
    },
    run(on: boolean) {
      cancelAnimationFrame(raf);
      if (on) raf = requestAnimationFrame(tick);
    },
  };
})();

// ------------------------------------------------------------------ screens
function show(next: Screen, html = '', dim = false) {
  screen = next;
  ui.innerHTML = html;
  ui.classList.toggle('on', next !== 'none');
  ui.classList.toggle('dim', dim);
  ui.scrollTop = 0;
  preview.run(next === 'hangar');
  (ui.querySelector('[autofocus]') as HTMLElement | null)?.focus();
}

function title() {
  show(
    'title',
    `<section class="screen">
      <h1 class="logo">Sky<em>Duty</em></h1>
      <div class="tag">Every drone has a job</div>
      <div class="roles">${MISSIONS.map((m) => `<span>${m.icon} ${m.role}</span>`).join('')}</div>
      <button class="btn big" data-act="missions" autofocus>Start</button>
      <div class="foot">Keyboard + mouse or gamepad · best with sound on</div>
    </section>`,
  );
}

function missions() {
  show(
    'missions',
    `<section class="screen">
      <div class="head"><h2>Choose your mission</h2><p>Each job has its own world, tool and drones.</p></div>
      <div class="cards">
        ${MISSIONS.map(
          (m, i) => `<button class="card" style="--hue:${m.hue}" data-act="pick-mission" data-id="${m.id}" ${i === 0 ? 'autofocus' : ''}>
            <div class="icon">${m.icon}</div>
            <div class="role">${m.role}</div>
            <h3>${m.name}</h3>
            <p>${m.blurb}</p>
            <p class="goal">${m.objective}</p>
            ${stars(best[m.id] ?? 0)}
          </button>`,
        ).join('')}
      </div>
      <div class="row"><button class="btn ghost" data-act="title">Back</button></div>
    </section>`,
  );
}

function payloadFact(d: DroneSpec) {
  if (d.mission === 'fire') return ['Water tank', `${d.capacity} L`];
  if (d.mission === 'strike') return ['Cannon / rockets', `${d.capacity} / ${d.rockets}`];
  return ['Crates per trip', String(d.capacity)];
}

function hangar() {
  const fleet = DRONES.filter((d) => d.mission === mission.id);
  if (drone.mission !== mission.id) drone = fleet[1] ?? fleet[0];
  const ph = physics(drone);
  const [payName, payValue] = payloadFact(drone);
  show(
    'hangar',
    `<section class="screen" style="--hue:${mission.hue}">
      <div class="head"><h2>Pick your drone</h2><p>${mission.icon} ${mission.name}</p></div>
      <div class="hangar">
        <div class="stage" id="stage">
          <div class="name"><span>${drone.tier} class</span><h3>${drone.name}</h3></div>
          <div class="picks">
            ${fleet.map((d) => `<button class="pick ${d.id === drone.id ? 'on' : ''}" data-act="pick-drone" data-id="${d.id}"><small>${d.tier}</small>${d.name}</button>`).join('')}
          </div>
          <div class="quote">“${drone.tagline}”</div>
        </div>
        <div class="sheet">
          <h3>Flight profile</h3>
          ${STAT_LABELS.map(([k, label]) => `<div class="stat"><span>${label}</span><div class="track"><i style="width:${drone.stats[k] * 10}%"></i></div><b>${drone.stats[k]}</b></div>`).join('')}
          <div class="facts">
            <div><b>${Math.round(ph.maxSpeed * 3.6)} km/h</b>Top speed</div>
            <div><b>${Math.round(ph.batterySec / 6) / 10} min</b>Flight time</div>
            <div><b>${ph.hull}</b>Hull points</div>
            <div><b>${payValue}</b>${payName}</div>
          </div>
        </div>
      </div>
      <div class="row">
        <button class="btn ghost" data-act="missions">Back</button>
        <button class="btn" data-act="brief" autofocus>Briefing</button>
      </div>
    </section>`,
  );
  document.getElementById('stage')!.prepend(preview.canvas);
  preview.set(drone);
}

function controlsHtml(s: Scheme) {
  const rows: [string, string][] =
    s === 'rc'
      ? [
          ['W / S', 'Climb / descend (left stick)'],
          ['A / D', 'Turn left / right (left stick)'],
          ['↑ ↓ ← →', 'Fly forward, back, strafe (right stick)'],
          ['Space or F', 'Use tool'],
        ]
      : [
          ['W A S D', 'Fly forward, back, strafe'],
          ['Space / Shift', 'Climb / descend'],
          ['Mouse or ← →', 'Turn'],
          ['F or click', 'Use tool'],
        ];
  rows.push(['Q / E or mouse', 'Tilt camera down / up'], ['G or right-click', 'Secondary (rockets)'], ['Esc', 'Pause']);
  return `<div class="keys">${rows.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
    <button class="switch" data-act="scheme">Switch to ${s === 'rc' ? 'Gamer (WASD + mouse)' : 'RC Mode 2 (transmitter style)'}</button>`;
}

function brief() {
  show(
    'brief',
    `<section class="screen" style="--hue:${mission.hue}">
      <div class="head"><h2>${mission.icon} ${mission.name}</h2><p>Flying the ${drone.name}</p></div>
      <div class="brief">
        <div class="sheet">
          <h3>Mission</h3>
          <p><b>Objective:</b> ${mission.objective}</p>
          <p><b>You fail if:</b> ${mission.fail}</p>
          <p><b>Tool:</b> ${mission.tool}</p>
          <h4>Pilot tips</h4>
          <ul>${mission.tips.map((t) => `<li>${t}</li>`).join('')}<li>Land on your pad any time to recharge the battery.</li></ul>
        </div>
        <div class="sheet">
          <h3>Controls — ${game.input.scheme === 'rc' ? 'RC Mode 2' : 'Gamer'}</h3>
          ${controlsHtml(game.input.scheme)}
        </div>
      </div>
      <div class="row">
        <button class="btn ghost" data-act="hangar">Back</button>
        <button class="btn big" data-act="launch" autofocus>Take off</button>
      </div>
    </section>`,
  );
}

function pause() {
  game.setPaused(true);
  show(
    'pause',
    `<section class="screen">
      <div class="modal">
        <h2>Paused</h2>
        <div class="sheet" style="box-shadow:none;padding:0;text-align:left">${controlsHtml(game.input.scheme)}</div>
        <div class="quality"><span>Graphics</span>${(['low', 'medium', 'high'] as Quality[]).map((q) => `<button class="pick ${game.quality === q ? 'on' : ''}" data-act="quality" data-id="${q}">${q}</button>`).join('')}</div>
        <div class="row">
          <button class="btn" data-act="resume" autofocus>Resume</button>
          <button class="btn ghost" data-act="launch">Restart</button>
          <button class="btn ghost" data-act="quit">Quit</button>
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
    `<section class="screen">
      <div class="modal ${r.won ? 'won' : 'lost'}">
        <h2>${r.won ? 'Mission complete' : 'Mission failed'}</h2>
        ${r.won ? stars(r.stars) : `<p style="margin:0;font-size:17px;font-weight:700">${r.reason}</p>`}
        <div class="rows">${r.summary.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
        <div class="row">
          <button class="btn" data-act="launch" autofocus>${r.won ? 'Fly again' : 'Retry'}</button>
          <button class="btn ghost" data-act="hangar-reset">Change drone</button>
          <button class="btn ghost" data-act="quit">Missions</button>
        </div>
      </div>
    </section>`,
    true,
  );
}

function launch() {
  game.sound.init();
  hudEl.style.setProperty('--hue', mission.hue);
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
    case 'pick-mission':
      mission = MISSIONS.find((m) => m.id === (id as MissionId))!;
      game.loadMission(mission.id);
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
    case 'quality':
      game.setQuality(id as Quality);
      pause();
      break;
    case 'launch':
      launch();
      break;
    case 'resume':
      resume();
      break;
    case 'quit':
      game.toOrbit();
      missions();
      break;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') game.sound.toggleMute();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (screen === 'pause') resume();
    else if (screen === 'none' && game.mode === 'fly') pause();
  }
});

// Esc while the mouse is captured only releases it; treat that as pause too.
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && screen === 'none' && game.mode === 'fly' && !game.paused) pause();
});
window.addEventListener('blur', () => {
  if (screen === 'none' && game.mode === 'fly' && !game.paused) pause();
});

game.onEnd = debrief;

function boot() {
  game.loadMission('fire');
  title();

  // Dev shortcuts: ?fly=strike (optionally &drone=mauler&air=30) jumps straight
  // into a flight; ?hangar=fire opens the hangar.
  const qs = new URLSearchParams(location.search);
  const auto = MISSIONS.find((m) => m.id === qs.get('fly'));
  const hang = MISSIONS.find((m) => m.id === qs.get('hangar'));
  if (hang) {
    mission = hang;
    drone = DRONES.find((d) => d.id === qs.get('drone') && d.mission === hang.id) ?? DRONES.filter((d) => d.mission === hang.id)[1];
    game.loadMission(hang.id);
    hangar();
  }
  if (auto) {
    mission = auto;
    drone = DRONES.find((d) => d.id === qs.get('drone') && d.mission === auto.id) ?? DRONES.filter((d) => d.mission === auto.id)[1];
    game.loadMission(auto.id);
    launch();
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
    }
  }
}

show('none', `<section class="screen loading">
  <h1 class="logo">Sky<em>Duty</em></h1>
  <div class="loadbar"><i id="loadfill"></i></div>
  <div class="foot">Preparing terrain, sky and airframes…</div>
</section>`);
ui.classList.add('on');
game.onLoad = (f) => {
  const el = document.getElementById('loadfill');
  if (el) el.style.width = `${Math.round(f * 100)}%`;
};
game.ready.then(boot, (err) => {
  console.error(err);
  ui.innerHTML = '<section class="screen"><h2>Could not load the game files</h2><p>Check your connection and reload the page.</p></section>';
});

// Handy in the browser console while iterating.
(window as unknown as { __sky: unknown }).__sky = { game, get result() { return lastResult; } };
