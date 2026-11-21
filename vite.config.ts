// Dev server: mounts the same phone relay the production server runs
// (server/relay.mjs) on /relay, and tells the game this PC's Wi-Fi address so
// the QR code works from a phone.
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error plain JS module shared with the production server
import { attachRelay } from './server/relay.mjs';

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
      if (server.httpServer) attachRelay(server.httpServer);
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
