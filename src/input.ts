// Keyboard, mouse and gamepad, mapped to drone stick axes.

export type Scheme = 'rc' | 'gamer';

export interface Controls {
  throttle: number; // -1 descend .. 1 climb
  yaw: number; // -1 left .. 1 right
  pitch: number; // -1 back .. 1 forward
  roll: number; // -1 left .. 1 right
  gimbal: number; // -1 down .. 1 up (key rate)
  mouseYaw: number; // radians this frame
  mouseGimbal: number; // radians this frame
  primary: boolean;
  secondary: boolean;
}

export class Input {
  keys = new Set<string>();
  scheme: Scheme;
  /** When false, game keys are not swallowed (menus). */
  active = false;
  private mdx = 0;
  private mdy = 0;
  private mb = [false, false, false];
  /** Set once per press of the camera-view button (gamepad Y, phone). */
  viewToggle = false;
  private padView = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.scheme = (localStorage.getItem('skyduty.scheme') as Scheme) || 'rc';
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (this.active && (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mb = [false, false, false];
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
        return;
      }
      this.mb[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => (this.mb[e.button] = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.mdx += e.movementX;
        this.mdy += e.movementY;
      }
    });
  }

  setScheme(s: Scheme) {
    this.scheme = s;
    localStorage.setItem('skyduty.scheme', s);
  }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private axis(neg: string[], pos: string[]) {
    let v = 0;
    if (neg.some((k) => this.keys.has(k))) v -= 1;
    if (pos.some((k) => this.keys.has(k))) v += 1;
    return v;
  }

  read(): Controls {
    const k = this.keys;
    const c: Controls = {
      throttle: 0, yaw: 0, pitch: 0, roll: 0, gimbal: 0,
      mouseYaw: 0, mouseGimbal: 0, primary: false, secondary: false,
    };
    if (this.scheme === 'rc') {
      c.throttle = this.axis(['KeyS'], ['KeyW']);
      c.yaw = this.axis(['KeyA'], ['KeyD']);
      c.pitch = this.axis(['ArrowDown'], ['ArrowUp']);
      c.roll = this.axis(['ArrowLeft'], ['ArrowRight']);
      c.primary = k.has('Space') || k.has('KeyF');
    } else {
      c.throttle = this.axis(['ShiftLeft', 'ShiftRight'], ['Space']);
      c.yaw = this.axis(['ArrowLeft'], ['ArrowRight']);
      c.pitch = this.axis(['KeyS'], ['KeyW']);
      c.roll = this.axis(['KeyA'], ['KeyD']);
      c.primary = k.has('KeyF');
    }
    c.gimbal = this.axis(['KeyQ'], ['KeyE']);
    c.primary = c.primary || this.mb[0];
    c.secondary = k.has('KeyG') || this.mb[2];
    c.mouseYaw = this.mdx * 0.0022;
    c.mouseGimbal = -this.mdy * 0.0022;
    this.mdx = this.mdy = 0;

    // Gamepad, Mode 2: left stick throttle/yaw, right stick pitch/roll.
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.14 ? 0 : v);
      const ax = pad.axes;
      c.yaw += dz(ax[0] ?? 0);
      c.throttle += -dz(ax[1] ?? 0);
      c.roll += dz(ax[2] ?? 0);
      c.pitch += -dz(ax[3] ?? 0);
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      c.primary = c.primary || b(7) || b(0);
      c.secondary = c.secondary || b(5) || b(1);
      if (b(3) && !this.padView) this.viewToggle = true;
      this.padView = b(3);
      if (b(12)) c.gimbal += 1;
      if (b(13)) c.gimbal -= 1;
    }
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    c.throttle = clamp(c.throttle);
    c.yaw = clamp(c.yaw);
    c.pitch = clamp(c.pitch);
    c.roll = clamp(c.roll);
    c.gimbal = clamp(c.gimbal);
    return c;
  }
}
