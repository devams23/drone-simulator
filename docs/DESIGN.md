# SkyDuty — mission drone simulator (design)

## Why this game
Existing drone games split into two camps: racing/freestyle sims (Liftoff, Uncrashed, DRL)
with no missions, and hardcore combat FPV sims (Remote Reaper, Ukrainian Fight Drone
Simulator, FPV Strike). The only multi-role title, *Rescue Drone Simulator: Second Chance*,
is a console/PC game due in 2027. Nothing playable in a browser combines several *jobs*
with a roster of drones. SkyDuty fills that gap:

- instant play in the browser, no install
- drones do work: fight fire, strike an outpost, deliver relief
- assisted (DJI-style) flight so anyone can fly, with drone stats that really change the feel
- first-person view with arms and spinning props in frame, plus procedural rotor sound

## Player journey
1. **Title** → press Start.
2. **Mission select** — three mission cards. Picking one loads its world behind the menu.
3. **Hangar** — three drones built for that mission (light / balanced / heavy), each with six stat bars.
4. **Briefing** — objective, fail conditions, controls. Launch.
5. **Flight** — take off from the pad, do the job, manage battery / hull / payload.
6. **Debrief** — success or failure, 1–3 stars, stats. Retry, change drone, or change mission.

## Core components
| Component | Job |
|---|---|
| Flight model | Assisted: sticks command tilt and climb rate; drone self-levels and brakes. |
| Drone stats | Speed, Agility, Stability, Armor, Payload, Battery (1–10) mapped to physics. |
| Cockpit rig | Arms, motors and props attached to the camera; sway, vibration, gimbal tilt. |
| Missions | Each owns its world, objective, payload tool, markers, win/lose and star rules. |
| Hazards | Heat, hostile fire, wind gusts, collisions, battery — all can damage or down the drone. |
| HUD | Reticle + horizon, altitude/speed, battery/hull, payload, radar, objective markers. |
| Audio | Web Audio synthesis: rotor pitch follows throttle, wind, spray, guns, explosions, alarms. |

## Missions
- **Wildfire Response** — carry water, spray fires in a village and forest, refill by hovering low over the lake. Fires regrow and spread; heat damages the drone. Lose if the village damage meter fills.
- **Outpost Strike** — destroy the HQ, radar and fuel tanks of a hostile outpost with cannon and rockets. Turrets shoot back; moving fast makes you harder to hit; killing the radar halves their accuracy. Land on the pad to repair and rearm.
- **Flood Relief** — load crates at the depot, parachute them onto rooftops with stranded people. Wind pushes both drone and crates; a ground ring predicts the landing spot. Beat the clock.

## Drones (three per mission)
| Mission | Light | Balanced | Heavy |
|---|---|---|---|
| Fire | Sparrow H2 (40 L) | Heron AT-6 (80 L) | Titan Hydra (150 L) |
| Strike | Wasp (2 rockets) | Kestrel (4) | Mauler (8) |
| Relief | Courier (1 crate) | Packmule (2) | Atlas (4) |

## Controls
Two schemes, switchable in the pause menu:
- **RC Mode 2** (like real transmitters): W/S climb, A/D yaw, arrows pitch/roll, Space or F = tool.
- **Gamer**: WASD move, Space/Shift climb/descend, mouse turns, F or click = tool.
Both: mouse or Q/E tilts the camera gimbal, G or right-click = secondary (rockets), Esc pauses.
Gamepads work in Mode 2 layout.

## Approach chosen
Vite + TypeScript + three.js, everything procedural (geometry, particles, sound) so there are
no asset downloads. Alternatives considered: a physics engine (Rapier) for true acro flight —
dropped because assisted flight is more fun for missions and needs only simple custom physics;
Babylon.js — no advantage over three.js here.

## Not yet built (next iterations)
Unlock progression, more levels per mission, third-person camera, acro mode, mobile touch sticks,
night missions, multiplayer.
