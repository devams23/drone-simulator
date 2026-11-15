// What every mission provides to the game loop and the HUD.
import * as THREE from 'three';
import type { Sound } from '../audio';
import type { MissionId } from '../data';
import type { Drone } from '../drone';
import type { Controls } from '../input';
import type { Fx } from '../particles';
import type { World } from '../world';

export interface Marker {
  pos: THREE.Vector3;
  icon: string;
  color: string;
  label?: string;
  visible: boolean;
}

export interface Objective {
  title: string;
  lines: string[];
  meter?: { label: string; value: number; bad: boolean };
}

export interface Payload {
  label: string;
  text: string;
  frac: number;
  extra?: string;
}

export type Toast = (text: string, kind?: 'info' | 'good' | 'bad') => void;

export abstract class Mission {
  abstract readonly id: MissionId;
  world!: World;
  markers: Marker[] = [];
  status: 'active' | 'won' | 'lost' = 'active';
  failReason = '';
  wind = new THREE.Vector3();
  spawn = new THREE.Vector3();
  spawnYaw = 0;
  pad = new THREE.Vector3();
  waterY?: number;
  elapsed = 0;
  /** Sticky status line shown in the HUD, e.g. "REFILLING". */
  state = '';
  orbit = { center: new THREE.Vector3(), radius: 120, height: 55 };
  protected drone!: Drone;
  protected toast: Toast = () => {};

  constructor(protected scene: THREE.Scene, protected fx: Fx, protected sound: Sound) {}

  attach(drone: Drone, toast: Toast) {
    this.drone = drone;
    this.toast = toast;
  }

  /** Runs in menus too: fire, smoke, anything that makes the world feel alive. */
  ambient(_dt: number, _viewer: THREE.Vector3) {}

  /** Runs only while flying. */
  abstract update(dt: number, c: Controls): void;
  abstract objective(): Objective;
  abstract payload(): Payload;
  abstract stars(): number;
  abstract summary(): [string, string][];

  protected fail(reason: string) {
    if (this.status === 'active') {
      this.status = 'lost';
      this.failReason = reason;
    }
  }

  protected onPad(radius = 7) {
    const d = this.drone;
    return d.landed && Math.hypot(d.pos.x - this.pad.x, d.pos.z - this.pad.z) < radius;
  }
}

export const fmtTime = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
