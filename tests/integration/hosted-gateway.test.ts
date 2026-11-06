import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostedGateway, parseHostedConfig } from '../../apps/api/src/hosted-gateway.js';

const token = 'synthetic-hosted-proxy-secret-01234567890123456789';
const headers = { 'x-two-hands-proxy-key': token };
const temporary: string[] = [];
const apps: ReturnType<typeof createHostedGateway>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture(fetchImpl: typeof fetch = vi.fn<typeof fetch>()) {
  const directory = await mkdtemp(join(tmpdir(), 'two-hands-hosted-gateway-')); temporary.push(directory);
  const distDir = join(directory, 'dist'); await mkdir(join(distDir, 'assets'), { recursive: true });
  await writeFile(join(distDir, 'index.html'), '<!doctype html><h1>Synthetic gateway fixture</h1>');
  await writeFile(join(distDir, 'assets', 'app.js'), 'console.info("synthetic fixture");');
  await writeFile(join(directory, '.env'), 'SYNTHETIC_OUTSIDE_RELEASE=unavailable');
  const app = createHostedGateway({ bindAddr: '127.0.0.1', port: 4311, proxyToken: token, distDir }, fetchImpl); apps.push(app);
  return { app, distDir, directory };
}

describe('private hosted read-only gateway — synthetic service fixtures', () => {
  it.each(['0.0.0.0', '::', '::1', '8.8.8.8', '172.15.1.1', '172.32.1.1', '192.169.0.1', 'localhost', '10.0.0.999'])('refuses non-private bind %s', bind => {
    expect(() => parseHostedConfig({ HOSTED_BIND_ADDR: bind, HOSTED_PROXY_TOKEN: token })).toThrow('HOSTED_BIND_ADDR');
  });
  it.each(['127.0.0.1', '127.8.9.10', '10.0.1.2', '172.16.0.2', '172.31.255.2', '192.168.1.2'])('accepts private IPv4 %s', bind => {
    expect(parseHostedConfig({ HOSTED_BIND_ADDR: bind, HOSTED_PROXY_TOKEN: token }).bindAddr).toBe(bind);
  });
  it('validates token and port without exposing their values', () => {
    expect(() => parseHostedConfig({ HOSTED_PROXY_TOKEN: 'private-short-secret' })).toThrow('HOSTED_PROXY_TOKEN');
    expect(() => parseHostedConfig({ HOSTED_PROXY_TOKEN: token, HOSTED_PORT: '4311oops' })).toThrow('HOSTED_PORT');
    expect(() => parseHostedConfig({ HOSTED_PROXY_TOKEN: token, HOSTED_PORT: '65536' })).toThrow('HOSTED_PORT');
    expect(parseHostedConfig({ HOSTED_PROXY_TOKEN: token }).port).toBe(4311);
  });
  it('requires the exact proxy key on static, SPA, API, internal and nonexistent routes', async () => {
    const fetchImpl = vi.fn<typeof fetch>(); const { app } = await fixture(fetchImpl);
    for (const url of ['/', '/studio', '/example', '/assets/app.js', '/api/state', '/artifacts/rev-1/cue.html', '/internal/state', '/missing']) {
      for (const value of [undefined, 'incorrect', token + 'extra']) {
        const response = await app.inject({ method: 'GET', url, headers: value ? { 'x-two-hands-proxy-key': value } : {} });
        expect(response.statusCode).toBe(401); expect(response.json()).toEqual({ error: 'Unauthorized' }); expect(response.body).not.toContain(token);
      }
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('serves known SPA routes and built assets with safe headers and no arbitrary SPA fallback', async () => {
    const { app } = await fixture();
    for (const url of ['/', '/studio', '/studio/', '/example', '/example/']) {
      const response = await app.inject({ method: 'GET', url, headers });
      expect(response.statusCode).toBe(200); expect(response.body).toContain('Synthetic gateway fixture');
      expect(response.headers['x-content-type-options']).toBe('nosniff'); expect(response.headers['referrer-policy']).toBe('no-referrer'); expect(response.headers['cache-control']).toBe('no-store');
    }
    expect((await app.inject({ method: 'HEAD', url: '/assets/app.js', headers })).body).toBe('');
    expect((await app.inject({ method: 'GET', url: '/assets/app.js', headers })).headers['content-type']).toContain('javascript');
    for (const url of ['/unknown', '/studio/unknown', '/source.ts', '/package.json', '/api/unknown']) expect((await app.inject({ method: 'GET', url, headers })).statusCode).toBe(404);
  });
  it('blocks internal operations and mutations before they reach the API', async () => {
    const fetchImpl = vi.fn<typeof fetch>(); const { app } = await fixture(fetchImpl);
    for (const method of ['GET', 'POST', 'DELETE', 'HEAD'] as const) expect((await app.inject({ method, url: '/internal/events', headers })).statusCode).toBe(404);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const) {
      const response = await app.inject({ method, url: '/api/state', headers, payload: 'untrusted data' });
      expect(response.statusCode).toBe(405); expect(response.headers.allow).toBe('GET, HEAD');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('refuses traversal, encoded separators, hidden files and symlinks outside or inside the release', async () => {
    const { app, distDir, directory } = await fixture();
    await symlink(join(directory, '.env'), join(distDir, 'exposed.txt'));
    await symlink(join(distDir, 'assets', 'app.js'), join(distDir, 'alias.js'));
    await symlink(directory, join(distDir, 'linked'));
    await writeFile(join(distDir, '.env'), 'SYNTHETIC_INSIDE_HIDDEN=unavailable');
    for (const url of ['/%2e%2e/.env', '/assets/../.env', '/assets%2fapp.js', '/assets%5capp.js', '/%252e%252e/.env', '/.env', '/.git/config', '/exposed.txt', '/alias.js', '/linked/dist/assets/app.js', '/%00file.js']) {
      const response = await app.inject({ method: 'GET', url, headers });
      expect([400, 404]).toContain(response.statusCode); expect(response.body).not.toMatch(/SYNTHETIC_|console.info/);
    }
  });
  it('forwards only fixed loopback read endpoints and strips authentication and unsafe response headers', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{"synthetic":true}', { headers: { 'content-type': 'application/json', 'content-security-policy': "default-src 'none'", 'set-cookie': 'unsafe=secret', location: 'https://example.invalid', 'access-control-allow-origin': '*' } }));
    const { app } = await fixture(fetchImpl);
    for (const url of ['/api/state', '/artifacts/rev:1/cue.html', '/artifacts/rev-1/script.html']) {
      const response = await app.inject({ method: 'GET', url, headers: { ...headers, authorization: 'Bearer untrusted-browser-value', cookie: 'untrusted=browser' } });
      expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ synthetic: true });
      expect(response.headers['content-security-policy']).toBe("default-src 'none'");
      for (const header of ['set-cookie', 'location', 'access-control-allow-origin', 'x-two-hands-proxy-key']) expect(response.headers[header]).toBeUndefined();
    }
    for (const [url, options] of fetchImpl.mock.calls) {
      expect(String(url)).toMatch(/^http:\/\/127\.0\.0\.1:4310\/(?:api\/state|artifacts\/rev[:-]1\/(?:cue|script)\.html)$/);
      expect(options?.redirect).toBe('error'); expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.stringify(options?.headers)).not.toContain(token); expect(JSON.stringify(options?.headers)).not.toMatch(/authorization|cookie/i);
    }
    const head = await app.inject({ method: 'HEAD', url: '/api/state', headers }); expect(head.statusCode).toBe(200); expect(head.body).toBe(''); expect(fetchImpl.mock.calls.at(-1)?.[1]?.method).toBe('HEAD');
  });
  it('fails closed on redirects, declared and streamed oversized responses, and upstream errors', async () => {
    const outcomes: Array<() => Promise<Response>> = [
      async () => new Response(null, { status: 302, headers: { location: 'https://example.invalid' } }),
      async () => new Response('small', { headers: { 'content-length': String(3 * 1024 * 1024 + 1) } }),
      async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3 * 1024 * 1024)); controller.enqueue(new Uint8Array(1)); controller.close(); } })),
      async () => { throw new Error('Do not expose private upstream diagnostics'); },
    ];
    for (const outcome of outcomes) {
      const { app } = await fixture(vi.fn<typeof fetch>().mockImplementation(outcome));
      const response = await app.inject({ method: 'GET', url: '/api/state', headers });
      expect(response.statusCode).toBe(502); expect(response.json()).toEqual({ error: 'Unavailable' }); expect(response.body).not.toContain('private');
    }
  });
});
