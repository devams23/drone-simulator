// Phone <-> game relay. Both pages open a WebSocket to /relay with the same
// room code; whatever one side sends is passed to the other side of that room
// and nowhere else. The server never reads the messages, it only forwards.
import { WebSocketServer } from 'ws';

const ROOM = /^[A-Z2-9]{4,8}$/;
const PER_ROOM = 6; // one game plus a few phones is plenty
const MAX_ROOMS = 2000;
const MAX_BYTES = 2048; // a stick packet is ~150 bytes

/** @param {import('node:http').Server} http */
export function attachRelay(http) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BYTES, perMessageDeflate: false });
  /** @type {Map<string, Set<import('ws').WebSocket>>} */
  const rooms = new Map();

  // Only claim /relay upgrades, so Vite's own HMR socket on the same server keeps working.
  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/relay') return;
    const room = (url.searchParams.get('room') ?? '').toUpperCase();
    const role = url.searchParams.get('role');
    const peers = rooms.get(room);
    const bad = !ROOM.test(room) || (role !== 'game' && role !== 'phone');
    const full = (peers && peers.size >= PER_ROOM) || (!peers && rooms.size >= MAX_ROOMS);
    if (bad || full) {
      socket.end(`HTTP/1.1 ${bad ? '400 Bad Request' : '503 Busy'}\r\n\r\n`);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => join(ws, room, role));
  });

  function join(ws, room, role) {
    let set = rooms.get(room);
    if (!set) rooms.set(room, (set = new Set()));
    set.add(ws);
    ws.role = role;
    ws.alive = true;
    ws.on('pong', () => (ws.alive = true));
    ws.on('message', (data, binary) => {
      for (const peer of set) {
        // Phones talk to the game and the game talks to phones; never echo.
        if (peer !== ws && peer.role !== role && peer.readyState === 1) peer.send(data, { binary });
      }
    });
    ws.on('close', () => {
      set.delete(ws);
      if (!set.size) rooms.delete(room);
    });
    ws.on('error', () => ws.terminate());
  }

  // Drop sockets that stopped answering (phone locked, Wi-Fi gone).
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) ws.terminate();
      else {
        ws.alive = false;
        ws.ping();
      }
    }
  }, 15000);
  beat.unref();
  http.on('close', () => clearInterval(beat));

  return { rooms };
}
