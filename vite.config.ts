// Dev server with a tiny relay for the phone controller: the phone page and
// the game both talk over Vite's own WebSocket, and the server passes each
// message on to everyone else. No extra server or port needed.
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Best guess at this PC's address on the home network. */
function lanAddress() {
  const all = Object.values(networkInterfaces()).flat();
  const v4 = all.filter((a) => a && a.family === 'IPv4' && !a.internal) as { address: string }[];
  const home = v4.find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a.address));
  return (home ?? v4[0])?.address;
}

function phoneRelay(): Plugin {
  return {
    name: 'skyduty-phone-relay',
    configureServer(server) {
      for (const ev of ['skyduty:pad', 'skyduty:fb']) {
        server.ws.on(ev, (data) => server.ws.send(ev, data));
      }
      server.middlewares.use('/__skyduty/lan', (_req, res) => {
        const ip = lanAddress();
        const port = server.config.server.port ?? 5173;
        const listening = !!server.config.server.host;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ url: ip && listening ? `http://${ip}:${port}/phone.html` : null, ip, port, listening }));
      });
    },
  };
}

export default defineConfig({
  server: { host: true },
  plugins: [phoneRelay()],
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), phone: resolve(import.meta.dirname, 'phone.html') },
    },
  },
});
