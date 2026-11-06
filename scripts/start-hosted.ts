import { spawn } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import { mkdir, open, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../apps/api/src/config.js';
import { loadWorkerConfig } from '../packages/agent-runtime/src/worker.js';

export type HostedRole = 'api' | 'writer' | 'stage' | 'gateway';
const root = fileURLToPath(new URL('../', import.meta.url));
const delay = (milliseconds: number) => new Promise<void>(done => setTimeout(done, milliseconds));

/** Validation only. No provider, database or Switch connection is constructed here. */
export function validateHostedConfig(env: NodeJS.ProcessEnv, checkoutRoot = root) {
  if (existsSync(join(checkoutRoot, '.env'))) throw new Error('Hosted checkout must not contain .env; use the private systemd EnvironmentFile');
  if (!env.PUBLIC_APP_URL || !env.DATABASE_PATH || !env.HUMAN_IDENTITY_FILE) throw new Error('Hosted startup requires PUBLIC_APP_URL, DATABASE_PATH and HUMAN_IDENTITY_FILE');
  const origin = new URL(env.PUBLIC_APP_URL);
  if (origin.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('Hosted PUBLIC_APP_URL must be a non-loopback HTTPS origin');
  if (!isAbsolute(env.DATABASE_PATH) || !isAbsolute(env.HUMAN_IDENTITY_FILE)) throw new Error('Hosted database and identity paths must be absolute persistent paths');
  if (existsSync(env.DATABASE_PATH) && lstatSync(env.DATABASE_PATH).isSymbolicLink()) throw new Error('Hosted database must not be a symbolic link');
  const api = loadConfig(env);
  if (!api.service.identity) throw new Error('Hosted startup requires a reviewed human identity mapping');
  const writer = loadWorkerConfig('writer', env);
  const stage = loadWorkerConfig('stage', env);
  if (writer.apiUrl !== 'http://127.0.0.1:4310' || stage.apiUrl !== writer.apiUrl) throw new Error('Hosted workers require API_URL=http://127.0.0.1:4310');
  if (writer.agentId === stage.agentId || writer.agentKey === stage.agentKey || writer.ownSender === stage.ownSender || writer.internalToken === stage.internalToken) throw new Error('Hosted workers require distinct identities, Switch keys, senders and internal tokens');
  return { databasePath: api.service.databasePath };
}

export async function waitForHostedApi(signal?: AbortSignal, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !signal?.aborted) {
    try {
      const response = await fetch('http://127.0.0.1:4310/health', { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(1000)]) : AbortSignal.timeout(1000), redirect: 'error' });
      const value = await response.json() as { ok?: unknown; service?: unknown };
      if (response.ok && value.ok === true && value.service === 'two-hands-api') return;
    } catch { /* Retry bounded readiness only; this never claims a job. */ }
    await delay(250);
  }
  throw new Error(signal?.aborted ? 'Hosted startup cancelled' : 'Hosted API did not become ready within 30 seconds');
}

/** The verified bridge health contract is HTTP success; no undocumented JSON shape is assumed. */
export async function waitForHostedSwitch(baseUrl: string, signal?: AbortSignal, timeoutMs = 180_000) {
  const base = new URL(`${baseUrl.replace(/\/$/, '')}/`);
  if (!['http:', 'https:'].includes(base.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.username || base.password || base.search || base.hash) throw new Error('Hosted Switch readiness requires a loopback HTTP(S) bridge URL without credentials, query or fragment');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !signal?.aborted) {
    try {
      const response = await fetch(new URL('health', base), { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(1000)]) : AbortSignal.timeout(1000), redirect: 'error' });
      await response.body?.cancel();
      if (response.ok) return;
    } catch { /* Bounded readiness only; never register, discover operations or invoke a model here. */ }
    await delay(250);
  }
  throw new Error(signal?.aborted ? 'Hosted startup cancelled' : 'Hosted Switch bridge did not become ready within 180 seconds; verify Docker and the private bridge URL');
}

export async function startHosted(role: HostedRole) {
  const { databasePath } = validateHostedConfig(process.env);
  const directory = resolve(databasePath, '..');
  await mkdir(directory, { recursive: true });
  const lockPath = join(directory, `hosted-${role}.lock`);
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch { throw new Error(`Hosted ${role} lock exists; inspect its recorded PID before recovering an abandoned lock`); }
  await lock.writeFile(JSON.stringify({ pid: process.pid, role, startedAt: new Date().toISOString() }) + '\n');
  await lock.close();
  const controller = new AbortController();
  let child: ReturnType<typeof spawn> | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (controller.signal.aborted) return;
    controller.abort();
    child?.kill('SIGTERM');
    if (child) killTimer = setTimeout(() => child?.kill('SIGKILL'), 20_000);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    if (role !== 'api') await waitForHostedApi(controller.signal);
    if (role === 'writer' || role === 'stage') await waitForHostedSwitch(process.env.SWITCH_BASE_URL!, controller.signal);
    if (controller.signal.aborted) return;
    const entry = role === 'api' ? 'apps/api/src/index.ts' : role === 'gateway' ? 'apps/api/src/hosted-gateway.ts' : `apps/${role}-agent/src/index.ts`;
    child = spawn(process.execPath, ['--import', 'tsx', entry], { cwd: root, env: process.env, stdio: 'inherit' });
    const code = await new Promise<number>((done, reject) => {
      child!.once('error', reject);
      child!.once('exit', (exit, signal) => done(controller.signal.aborted ? 0 : exit ?? (signal ? 1 : 0)));
    });
    process.exitCode = code;
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    if (killTimer) clearTimeout(killTimer);
    await unlink(lockPath);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const role = process.argv[2];
  if (!['api', 'writer', 'stage', 'gateway'].includes(role ?? '')) {
    console.error('Usage: node --env-file=/etc/two-hands/runtime.env --import tsx scripts/start-hosted.ts api|writer|stage|gateway');
    process.exitCode = 1;
  } else {
    startHosted(role as HostedRole).catch(error => {
      const message = error instanceof Error && /Hosted|Missing|must|requires|Use distinct|Reviewed|Human|HUMAN_IDENTITY/.test(error.message) ? error.message : 'Hosted service failed; inspect private configuration and local process state';
      console.error(JSON.stringify({ event: 'hosted_startup_failed', role, message }));
      process.exitCode = 1;
    });
  }
}
