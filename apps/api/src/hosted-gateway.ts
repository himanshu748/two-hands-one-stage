import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { isIP } from 'node:net';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface HostedGatewayConfig { bindAddr: string; port: number; proxyToken: string; distDir: string }
const MAX_BYTES = 3 * 1024 * 1024;
const LOOPBACK_API = 'http://127.0.0.1:4310';
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };

function privateIPv4(value: string): boolean {
  if (isIP(value) !== 4) return false;
  const parts = value.split('.').map(Number);
  return parts[0] === 127 || parts[0] === 10 || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) || (parts[0] === 192 && parts[1] === 168);
}
export function parseHostedConfig(env: Record<string, string | undefined> = process.env): HostedGatewayConfig {
  const bindAddr = env.HOSTED_BIND_ADDR ?? '127.0.0.1';
  if (!privateIPv4(bindAddr)) throw new Error('HOSTED_BIND_ADDR must be a loopback or private IPv4 address');
  const rawPort = env.HOSTED_PORT ?? '4311';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error('HOSTED_PORT must be an integer from 1 to 65535');
  const proxyToken = env.HOSTED_PROXY_TOKEN ?? '';
  if (proxyToken.length < 32 || proxyToken.length > 512 || !/^[\x21-\x7e]+$/.test(proxyToken)) throw new Error('HOSTED_PROXY_TOKEN must contain 32–512 printable ASCII characters without spaces');
  return { bindAddr, port: Number(rawPort), proxyToken, distDir: resolve(env.HOSTED_WEB_DIST ?? fileURLToPath(new URL('../../web/dist/', import.meta.url))) };
}
function requestPath(url: string): string | null {
  const raw = url.split('?')[0] ?? '';
  if (/%(?:2f|5c|00)/i.test(raw) || raw.includes('\\')) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (!/^\/[A-Za-z0-9_./:-]*$/.test(decoded) || decoded.split('/').some(part => part.startsWith('.'))) return null;
    return decoded;
  } catch { return null; }
}
async function boundedBody(response: Response): Promise<Buffer> {
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) { await response.body?.cancel(); throw new Error('Upstream response rejected'); }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > MAX_BYTES) { await reader.cancel(); throw new Error('Upstream response rejected'); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, total);
}

/** Private read-only bridge for an authenticated TLS reverse proxy. The API retains its own loopback binding and is the only database writer. */
export function createHostedGateway(config: HostedGatewayConfig, fetchImpl: typeof fetch = fetch) {
  // Validate explicitly supplied config too, before opening any socket or reading files.
  parseHostedConfig({ HOSTED_BIND_ADDR: config.bindAddr, HOSTED_PORT: String(config.port), HOSTED_PROXY_TOKEN: config.proxyToken, HOSTED_WEB_DIST: config.distDir });
  const app = Fastify({ logger: false, bodyLimit: 1024, routerOptions: { maxParamLength: 4096 } });
  const expected = Buffer.from(config.proxyToken);
  let root: string;
  app.addHook('onReady', async () => { root = await realpath(config.distDir); if (!(await stat(root)).isDirectory()) throw new Error('HOSTED_WEB_DIST must name the built web directory'); });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer').header('Cache-Control', 'no-store').header('X-Frame-Options', 'DENY');
    const provided = req.headers['x-two-hands-proxy-key'];
    const token = typeof provided === 'string' ? Buffer.from(provided) : Buffer.alloc(0);
    if (token.length !== expected.length || !timingSafeEqual(token, expected)) return reply.code(401).send({ error: 'Unauthorized' });
    const path = requestPath(req.raw.url ?? '');
    if (!path) return reply.code(400).send({ error: 'Unavailable' });
    if (path === '/internal' || path.startsWith('/internal/')) return reply.code(404).send({ error: 'Unavailable' });
    if (!['GET', 'HEAD'].includes(req.method)) return reply.header('Allow', 'GET, HEAD').code(405).send({ error: 'Unavailable' });
  });
  app.setErrorHandler((_error, _req, reply) => { void reply.code(503).send({ error: 'Unavailable' }); });
  app.all('/*', async (req, reply) => {
    const path = requestPath(req.raw.url ?? '');
    if (!path) return reply.code(400).send({ error: 'Unavailable' });
    const proxy = path === '/api/state' || /^\/artifacts\/[A-Za-z0-9_.:-]{1,160}\/(?:cue|script)\.html$/.test(path);
    if (proxy) {
      try {
        const response = await fetchImpl(LOOPBACK_API + path, { method: req.method, headers: { accept: path === '/api/state' ? 'application/json' : 'text/html' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
        if (response.status >= 300 && response.status < 400) throw new Error('Redirect refused');
        const body = await boundedBody(response);
        for (const header of ['content-type', 'content-security-policy']) { const value = response.headers.get(header); if (value) reply.header(header, value); }
        return reply.code(response.status).send(req.method === 'HEAD' ? undefined : body);
      } catch { return reply.code(502).send({ error: 'Unavailable' }); }
    }
    if (path.startsWith('/api/') || path.startsWith('/artifacts/')) return reply.code(404).send({ error: 'Unavailable' });
    const spa = ['/', '/studio', '/studio/', '/example', '/example/'].includes(path);
    const file = resolve(root, spa ? 'index.html' : path.slice(1));
    const extension = extname(file);
    if (!TYPES[extension]) return reply.code(404).send({ error: 'Unavailable' });
    try {
      // Release trees are trusted configuration; reject symlinks inside the tree as well as escaped real paths.
      const rel = relative(root, file);
      if (rel.startsWith('..' + sep) || rel === '..' || rel.startsWith(sep)) throw new Error('Outside release');
      let checking = root;
      for (const part of rel.split(sep)) { checking = resolve(checking, part); if ((await lstat(checking)).isSymbolicLink()) throw new Error('Symlink refused'); }
      const actual = await realpath(file);
      if (!actual.startsWith(root + sep)) throw new Error('Outside release');
      const info = await stat(actual);
      if (!info.isFile() || info.size > MAX_BYTES) throw new Error('File refused');
      const body = req.method === 'HEAD' ? undefined : await readFile(actual);
      if (body && body.length > MAX_BYTES) throw new Error('File refused');
      return reply.type(TYPES[extension]!).header('Content-Length', info.size).send(body);
    } catch { return reply.code(404).send({ error: 'Unavailable' }); }
  });
  return app;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = parseHostedConfig();
    const app = createHostedGateway(config);
    await app.listen({ host: config.bindAddr, port: config.port });
    console.info('Private hosted gateway listening. TLS and performer authentication are handled by the reverse proxy.');
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith('HOSTED_') ? error.message : 'Hosted gateway startup failed; verify private bind settings and built web directory';
    console.error(message); process.exitCode = 1;
  }
}
