// One WebSocket to the relay (/relay on the same host that served the page).
// The game and the phone join the same room code; the relay forwards each
// message to the other side. Reconnects on its own if the line drops.

export type Role = 'game' | 'phone';

/** No 0/O, 1/I/L: the code may be typed by hand on a phone. */
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_RE = /^[A-Z2-9]{4,8}$/;

export function newRoom(n = 4) {
  const r = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(r, (b) => ALPHA[b % ALPHA.length]).join('');
}

type Handler = (d: any) => void;

export class Link {
  private ws?: WebSocket;
  private handlers = new Map<string, Handler>();
  private wait = 500;
  private closed = false;

  constructor(
    readonly room: string,
    private role: Role,
  ) {
    this.open();
  }

  get up() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  on(t: string, fn: Handler) {
    this.handlers.set(t, fn);
  }

  send(t: string, d: unknown) {
    // A stale stick packet is worse than none, so nothing is queued while down.
    if (this.up && this.ws!.bufferedAmount < 4096) this.ws!.send(JSON.stringify({ t, d }));
  }

  close() {
    this.closed = true;
    this.ws?.close();
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/relay?room=${this.room}&role=${this.role}`);
    this.ws = ws;
    ws.onopen = () => (this.wait = 500);
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        this.handlers.get(m.t)?.(m.d);
      } catch {
        /* not ours */
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      setTimeout(() => this.open(), this.wait);
      this.wait = Math.min(this.wait * 2, 5000);
    };
  }
}
