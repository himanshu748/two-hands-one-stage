import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { SwitchClient, ResumePositionSchema, type ConnectionState } from '@two-hands/switch-client';
import { createLogger } from './logging.js';
import { createModelProvider, loadModelConfig, requiredModelVariables, type ModelConfig, type ModelProvider } from './model.js';
import { executeJob, JobInterruptedError, JobSchema, SnapshotSchema, type JobApi, type Role } from './jobs.js';

export interface WorkerConfig extends ModelConfig {
  role: Role; apiUrl: string; internalToken: string; switchBaseUrl: string; roomId: string;
  agentId: string; agentKey: string; ownSender: string;
}

export function loadWorkerConfig(role: Role, env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const prefix = role.toUpperCase();
  const required = ['SWITCH_BASE_URL', 'SWITCH_ROOM_ID', `${prefix}_INTERNAL_TOKEN`, `${prefix}_SWITCH_AGENT_ID`, `${prefix}_SWITCH_API_KEY`, `${prefix}_SWITCH_SENDER`, ...requiredModelVariables(env)];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing worker configuration: ${missing.join(', ')}. Copy .env.example to .env and complete Switch registration and identity verification; no mock mode is used.`);
  const value = (key: string): string => env[key] ?? '';
  const apiUrl = env.API_URL || 'http://127.0.0.1:4310';
  const parsed = new URL(apiUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw new Error('API_URL must be a loopback HTTP(S) origin without credentials or a path');
  }
  if (value(`${prefix}_INTERNAL_TOKEN`).length < 32) throw new Error(`${prefix}_INTERNAL_TOKEN must contain at least 32 characters`);
  return { role, apiUrl, internalToken: value(`${prefix}_INTERNAL_TOKEN`), switchBaseUrl: value('SWITCH_BASE_URL'), roomId: value('SWITCH_ROOM_ID'), agentId: value(`${prefix}_SWITCH_AGENT_ID`), agentKey: value(`${prefix}_SWITCH_API_KEY`), ownSender: value(`${prefix}_SWITCH_SENDER`), ...loadModelConfig(env) };
}

export class InternalApi implements JobApi {
  constructor(private readonly config: Pick<WorkerConfig, 'apiUrl' | 'internalToken'>) {}
  async call<T = unknown>(path: string, body?: unknown): Promise<T> {
    if (!path.startsWith('/internal/')) throw new Error('Worker API access is limited to internal application endpoints');
    let response: Response;
    try {
      response = await fetch(new URL(path, this.config.apiUrl), {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${this.config.internalToken}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
    } catch { throw new Error('Local API unavailable; start apps/api and verify API_URL'); }
    if (!response.ok) throw new Error(`Local API returned ${response.status}; inspect application state for the blocked operation`);
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('Local API response exceeded the size limit');
    try { return JSON.parse(text) as T; } catch { throw new Error('Local API returned malformed JSON'); }
  }
}

const SavedConnectionSchema = z.object({ connectionId: z.string().uuid(), cursor: z.number().int().nonnegative(), generation: z.number().int().nonnegative().optional(), position: ResumePositionSchema.optional(), status: z.string(), rooms: z.array(z.string()).optional(), server: z.unknown().optional() }).nullable();
const OutboxSchema = z.object({ id: z.string().min(1), content: z.string().min(1).max(100_000) }).passthrough().nullable();

/** One process owns one Switch identity. Creative handoffs come only from durable Switch receipts. */
export async function runWorker(role: Role, dependencies: { config?: WorkerConfig; provider?: ModelProvider; shutdownSignal?: AbortSignal } = {}): Promise<void> {
  const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (!dependencies.config && existsSync(envFile)) process.loadEnvFile(envFile);
  const config = dependencies.config ?? loadWorkerConfig(role);
  const log = createLogger(role, [config.internalToken, config.agentKey, config.modelKey]);
  const api = new InternalApi(config);
  const saved = SavedConnectionSchema.parse(await api.call('/internal/connection'));
  if (saved?.status === 'blocked') throw new Error('Switch recovery blocked: reconcile room history and outstanding work before saving a reviewed checkpoint; restarting cannot clear this hold');
  let connection: ConnectionState = { ...(saved ?? { connectionId: randomUUID(), cursor: 0 }), status: 'disconnected' };
  let connected = false;
  let stopping = false;
  let busy = false;
  let heartbeatBusy = false;
  let activeTick: Promise<void> = Promise.resolve();
  let activeJob: AbortController | undefined;
  let stateWrites: Promise<void> = Promise.resolve();
  const controller = new AbortController();
  const provider = dependencies.provider ?? createModelProvider(config);
  const client = new SwitchClient({ baseUrl: config.switchBaseUrl, agentId: config.agentId, apiKey: config.agentKey, roomId: config.roomId, connectionId: connection.connectionId, ...(saved ? { cursor: saved.cursor, ...(saved.generation === undefined ? {} : { generation: saved.generation }), ...(saved.position === undefined ? {} : { position: saved.position }) } : {}) });
  const persist = (next: ConnectionState): Promise<void> => {
    // A gap/takeover hold survives late callbacks, shutdown and process restart.
    if (connection.status === 'blocked') next = { ...connection };
    connection = next;
    connected = next.status === 'connected' && !stopping;
    if (!connected) activeJob?.abort();
    const write = stateWrites.catch(() => undefined).then(async () => { await api.call('/internal/connection', next); });
    stateWrites = write;
    return write;
  };
  // Save the UUID before opening the socket so a restart does not silently take a new session.
  await persist(connection);
  await client.discover();
  client.start({
    onEvent: async (event) => {
      if (event.data.payload.sender === config.ownSender) return;
      // Ingest unaddressed edits too; the API records them but never creates creative work unless addressed.
      await api.call('/internal/events', event);
    },
    onState: async (next) => {
      const changed = next.status !== connection.status;
      await persist(next);
      if (changed) log('switch_connection', { status: next.status });
    },
    onBlocked: (reason) => { connected = false; log('switch_blocked', { reason }); },
  });

  const tick = async (): Promise<void> => {
    if (busy || !connected || stopping) return;
    busy = true;
    try {
      const outgoing = OutboxSchema.parse(await api.call('/internal/outbox/claim', {}));
      if (outgoing) {
        let sent = false;
        try { if (connected) { await client.post(outgoing.content); sent = true; } } catch { log('outbox_delivery_pending', { outboxId: outgoing.id }); }
        await api.call(`/internal/outbox/${encodeURIComponent(outgoing.id)}/result`, { sent });
      }
      if (!connected || stopping) return;
      const rawJob = await api.call('/internal/jobs/claim', {});
      if (rawJob === null) return;
      const job = JobSchema.parse(rawJob);
      log('job_started', { jobId: job.id, kind: job.kind });
      activeJob = new AbortController();
      const jobSignal = AbortSignal.any([controller.signal, activeJob.signal]);
      try {
        const snapshot = SnapshotSchema.parse(await api.call('/internal/state'));
        await executeJob({ role, job, snapshot, provider, api, signal: jobSignal, isConnected: () => connected && !stopping, log });
        log('job_completed', { jobId: job.id, kind: job.kind });
      } catch (error) {
        if (error instanceof JobInterruptedError || jobSignal.aborted || stopping) {
          log('job_interrupted', { jobId: job.id, reason: 'Lease remains recoverable; durable model budget is unchanged' });
          return;
        }
        // Never persist raw model errors: provider bodies can contain prompts or credentials.
        await api.call(`/internal/jobs/${encodeURIComponent(job.id)}/fail`, {});
        log('job_blocked', { jobId: job.id, reason: 'Operation failed or exhausted model budget; inspect application state' });
      } finally { activeJob = undefined; }
    } catch { log('worker_poll_failed', { reason: 'Check local API availability and durable job state' }); }
    finally { busy = false; }
  };
  const pollTimer = setInterval(() => { if (!busy) activeTick = tick(); }, 750);
  const heartbeatTimer = setInterval(() => {
    if (stopping || heartbeatBusy) return;
    heartbeatBusy = true;
    void persist(connection).catch(() => { connected = false; activeJob?.abort(); log('api_heartbeat_failed'); }).finally(() => { heartbeatBusy = false; });
  }, 5000);
  log('worker_started', { status: 'waiting_for_switch', modelProvider: config.modelProvider, model: config.model });
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      connected = false;
      controller.abort();
      clearInterval(pollTimer);
      clearInterval(heartbeatTimer);
      client.stop();
      const disconnected = persist({ ...connection, status: 'disconnected' }).catch(() => undefined);
      let deadline: ReturnType<typeof setTimeout>;
      const timeout = new Promise<void>((done) => { deadline = setTimeout(() => { log('worker_shutdown_deadline'); done(); }, 15000); });
      void Promise.race([Promise.all([activeTick, disconnected]), timeout]).finally(() => {
        clearTimeout(deadline);
        dependencies.shutdownSignal?.removeEventListener('abort', shutdown);
        process.off('SIGINT', shutdown);
        process.off('SIGTERM', shutdown);
        log('worker_stopped');
        resolve();
      });
    };
    dependencies.shutdownSignal?.addEventListener('abort', shutdown, { once: true });
    if (dependencies.shutdownSignal?.aborted) shutdown();
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
