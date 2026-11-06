import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SwitchConfig, SwitchHandlers } from '@two-hands/switch-client';
import { Store } from '../../../apps/api/src/store.js';
import { createServer } from '../../../apps/api/src/server.js';
import { syntheticConfig, syntheticTokens, ingestHuman } from '../../../fixtures/service.js';
import { syntheticRevision } from '../../../fixtures/scene.js';
import type { ModelProvider, ModelRequest } from './model.js';
import { runWorker, type WorkerConfig } from './worker.js';

const transport = vi.hoisted(() => ({ instances: [] as Array<{ config: SwitchConfig; handlers: SwitchHandlers }> }));
vi.mock('@two-hands/switch-client', async (original) => {
  const actual = await original<typeof import('@two-hands/switch-client')>();
  return { ...actual, SwitchClient: class {
    constructor(private readonly config: SwitchConfig) {}
    async discover() { return {}; }
    start(handlers: SwitchHandlers) {
      transport.instances.push({ config: this.config, handlers });
      void handlers.onState({ connectionId: this.config.connectionId, cursor: this.config.cursor ?? 17, generation: (this.config.generation ?? 0) + 1, rooms: [this.config.roomId], status: 'connected', server: { version: 'synthetic-only' } });
    }
    stop() {}
    async post() { return {}; }
  } };
});
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); transport.instances.length = 0; });
async function until(check: () => boolean) {
  const start = Date.now();
  while (!check()) { if (Date.now() - start > 5000) throw new Error('Synthetic worker condition timed out'); await new Promise((resolve) => setTimeout(resolve, 10)); }
}
async function fixture() {
  const store = new Store(syntheticConfig());
  const app = createServer(store, syntheticTokens);
  app.log.level = 'silent';
  const connectionWrites: Record<string, unknown>[] = [];
  app.addHook('preHandler', async (req) => { if (req.method === 'POST' && req.url === '/internal/connection') connectionWrites.push(req.body as Record<string, unknown>); });
  const apiUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  cleanup.push(async () => { await app.close(); store.close(); });
  const config: WorkerConfig = { role: 'writer', apiUrl, internalToken: syntheticTokens.writer, switchBaseUrl: 'http://127.0.0.1:1', roomId: store.config.roomId, agentId: 'synthetic-agent', agentKey: 'synthetic-key', ownSender: store.config.writerParticipantId, modelKey: 'synthetic-key', model: 'synthetic-model', modelProvider: 'openai', modelBaseUrl: 'https://api.openai.com/v1' };
  const start = (provider: ModelProvider) => {
    const controller = new AbortController();
    const done = runWorker('writer', { config, provider, shutdownSignal: controller.signal });
    cleanup.push(async () => { controller.abort(); await done; });
    return { controller, done };
  };
  return { store, start, connectionWrites, config };
}
function brief(store: Store) {
  const { sceneId, title, props, emotionalGoal, protectedFact } = syntheticRevision;
  ingestHuman(store, `brief ${JSON.stringify({ sceneId, title, props, emotionalGoal, protectedFact })}`);
}
const goodProvider = (): ModelProvider => ({ generate: vi.fn().mockResolvedValue({ beats: syntheticRevision.beats, artisticCosts: ['Synthetic quiet pacing.'] }) });

describe('synthetic transport with real HTTP API and SQLite worker lifecycle', () => {
  it('restarts from server-stamped connection state without reposting read-only fields', async () => {
    const { store, start, connectionWrites } = await fixture();
    const first = start(goodProvider());
    await until(() => store.get<{ status: string }>('connection:writer', { status: '' }).status === 'connected');
    const saved = store.get<Record<string, unknown>>('connection:writer', {});
    expect(saved.updatedAt).toBeTypeOf('number');
    first.controller.abort(); await first.done;
    const restartIndex = connectionWrites.length;
    const second = start(goodProvider());
    await until(() => transport.instances.length === 2 && store.get<{ status: string }>('connection:writer', { status: '' }).status === 'connected');
    expect(connectionWrites[restartIndex]).toMatchObject({ status: 'disconnected', server: { version: 'synthetic-only' } });
    expect(connectionWrites[restartIndex]).not.toHaveProperty('updatedAt');
    expect(transport.instances[1]?.config).toMatchObject({ connectionId: saved.connectionId, cursor: 17, generation: 1 });
    second.controller.abort(); await second.done;
    expect(store.get<{ status: string }>('connection:writer', { status: '' }).status).toBe('disconnected');
  });


  it('round-trips the initial position through the API and restores it on worker restart', async () => {
    const { store, start, connectionWrites } = await fixture();
    const position = { s: 4294967297, [`r:${store.config.roomId}`]: 12 };
    store.set('connection:writer', { connectionId: 'de0eb1ad-b732-4dfc-aebc-f4b299a3d080', cursor: 0, generation: 7, position, status: 'disconnected' });
    const worker = start(goodProvider());
    await until(() => transport.instances.length === 1);
    expect(transport.instances[0]?.config).toMatchObject({ cursor: 0, generation: 7, position });
    expect(connectionWrites[0]).toMatchObject({ cursor: 0, generation: 7, position });
    worker.controller.abort(); await worker.done;
  });

  it('keeps a replay-gap hold through late callbacks, shutdown and restart without adopting a fallback head', async () => {
    const { store, start, config } = await fixture();
    const first = start(goodProvider());
    await until(() => transport.instances.length === 1);
    const instance = transport.instances[0]!;
    const fallback = { connectionId: instance.config.connectionId, cursor: 0, generation: 1, position: { s: 900, [`r:${store.config.roomId}`]: 50 }, rooms: [store.config.roomId] };
    await instance.handlers.onState({ ...fallback, status: 'connected' });
    await instance.handlers.onState({ ...fallback, status: 'blocked' });
    await instance.handlers.onState({ ...fallback, status: 'disconnected' });
    first.controller.abort(); await first.done;
    expect(store.get<{ status: string }>('connection:writer', { status: '' }).status).toBe('blocked');
    await expect(runWorker('writer', { config, provider: goodProvider() })).rejects.toThrow('Switch recovery blocked');
    expect(transport.instances).toHaveLength(1);
    expect(store.get<{ status: string }>('connection:writer', { status: '' }).status).toBe('blocked');
  });

  it('settles shutdown without failing the unfinished job and recovers using the remaining persisted budget', async () => {
    const { store, start } = await fixture(); brief(store);
    let aborted = false;
    const provider: ModelProvider = { generate: vi.fn((request: ModelRequest<unknown>) => new Promise((_resolve, reject) => {
      request.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('Synthetic cancellation')); }, { once: true });
    })) };
    const first = start(provider);
    await until(() => vi.mocked(provider.generate).mock.calls.length === 1);
    first.controller.abort(); await first.done;
    expect(aborted).toBe(true);
    const before = store.state().jobs[0]!;
    expect(before).toMatchObject({ status: 'running', model_attempts: 1 });
    expect(store.state().proposals).toHaveLength(0);
    store.db.prepare('UPDATE jobs SET lease_until=0 WHERE id=?').run(before.id);
    const nextProvider = goodProvider();
    const second = start(nextProvider);
    await until(() => store.state().jobs[0]?.status === 'done');
    expect(store.state().jobs[0]).toMatchObject({ model_attempts: 2 });
    expect(nextProvider.generate).toHaveBeenCalledTimes(1);
    expect(store.state().proposals).toHaveLength(1);
    second.controller.abort(); await second.done;
  });

  it('remembers an interruption even if Switch reconnects before the provider settles', async () => {
    const { store, start } = await fixture(); brief(store);
    let finish!: (value: unknown) => void;
    let requestSignal: AbortSignal | undefined;
    const provider: ModelProvider = { generate: vi.fn((request: ModelRequest<unknown>) => new Promise((resolve) => { requestSignal = request.signal; finish = resolve; })) };
    const worker = start(provider);
    await until(() => vi.mocked(provider.generate).mock.calls.length === 1);
    const instance = transport.instances[0]!;
    const state = { connectionId: instance.config.connectionId, cursor: 17, generation: 1, rooms: [instance.config.roomId] };
    await instance.handlers.onState({ ...state, status: 'disconnected' });
    await instance.handlers.onState({ ...state, status: 'connected' });
    expect(requestSignal?.aborted).toBe(true);
    finish({ beats: syntheticRevision.beats, artisticCosts: ['Must not be committed after interruption.'] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.state().proposals).toHaveLength(0);
    worker.controller.abort(); await worker.done;
    expect(store.state().jobs[0]).toMatchObject({ status: 'running', model_attempts: 1 });
    expect(store.state().proposals).toHaveLength(0);
  });
  it('still blocks malformed output after the durable two-call budget is exhausted', async () => {
    const { store, start } = await fixture(); brief(store);
    const provider: ModelProvider = { generate: vi.fn().mockResolvedValue({ malformed: true }) };
    const worker = start(provider);
    await until(() => store.state().jobs[0]?.status === 'blocked');
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(store.state().jobs[0]).toMatchObject({ model_attempts: 2 });
    expect(store.state().proposals).toHaveLength(0);
    worker.controller.abort(); await worker.done;
  });

});
