// Production server: serves the built game from dist/ and runs the phone relay
// on the same port. `npm run build && npm start`; Render sets PORT.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { attachRelay } from './relay.mjs';

const root = resolve(import.meta.dirname, '../dist');
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    return res.writeHead(400).end();
  }
  if (path === '/healthz') return res.end('ok');
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end();
  let st;
  try {
    st = statSync(file);
    if (st.isDirectory()) st = statSync((file = join(file, 'index.html')));
  } catch {
    return res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
  res.writeHead(200, {
    'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': st.size,
    // Vite fingerprints everything in /assets/, so those can be cached for good.
    'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
});

attachRelay(server);
server.listen(port, '0.0.0.0', () => console.log(`SkyDuty on http://localhost:${port}`));
