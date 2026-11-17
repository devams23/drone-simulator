// Phone controller link, game side. The phone page (phone.html) streams its
// stick positions through the dev server; we hand back telemetry and rumble.

export interface PadMsg {
  id: string;
  thr: number; // -1 bottom .. 1 top; the middle is hover
  yaw: number;
  pitch: number;
  roll: number;
  gim: number;
  pri: boolean;
  sec: boolean;
  /** Counts presses of the camera button, so a lost packet never misses one. */
  view: number;
}

export interface FbMsg {
  buzz?: number | number[];
  alt?: number;
  spd?: number;
  bat?: number;
  hull?: number;
  view?: string;
}

export class Remote {
  pad?: PadMsg;
  private last = -1e9;
  private seenView: number | null = null;
  private seenId = '';
  onConnect: () => void = () => {};

  constructor() {
    const hot = import.meta.hot;
    if (!hot) return;
    hot.on('skyduty:pad', (m: PadMsg) => {
      const fresh = !this.connected || m.id !== this.seenId;
      this.pad = m;
      this.last = performance.now();
      if (fresh) {
        this.seenId = m.id;
        this.seenView = m.view;
        this.onConnect();
      }
    });
    // Heartbeat so the phone shows it is linked even before take-off.
    setInterval(() => hot.send('skyduty:fb', {}), 600);
  }

  get available() {
    return !!import.meta.hot;
  }

  get connected() {
    return performance.now() - this.last < 1200;
  }

  /** True once per press of the phone's camera button. */
  takeView() {
    if (!this.pad || !this.connected) return false;
    if (this.seenView === null || this.pad.view === this.seenView) return false;
    this.seenView = this.pad.view;
    return true;
  }

  send(m: FbMsg) {
    import.meta.hot?.send('skyduty:fb', m);
  }
}
