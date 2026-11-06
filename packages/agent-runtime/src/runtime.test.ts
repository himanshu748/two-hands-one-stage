import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { syntheticRevision } from '../../../fixtures/scene.js';
import { generateBounded, ModelBudgetError, type ModelProvider } from './model.js';
import { createLogger, redact } from './logging.js';
import { executeJob, type JobApi, type Snapshot } from './jobs.js';
import { loadWorkerConfig } from './worker.js';

const request = { schema: z.object({ answer: z.string() }).strict(), name: 'test', instructions: 'Return structured data', input: 'synthetic' };
const snapshot = (): Snapshot => ({
  brief: { sceneId: syntheticRevision.sceneId, title: syntheticRevision.title, props: syntheticRevision.props, emotionalGoal: syntheticRevision.emotionalGoal, protectedFact: syntheticRevision.protectedFact },
  current: null, constraints: [], observations: [], proposals: [],
});
function recordingApi() {
  const calls: { path: string; body: unknown }[] = [];
  const api: JobApi = { call: async <T>(path: string, body?: unknown): Promise<T> => { calls.push({ path, body }); return {} as T; } };
  return { api, calls };
}

describe('bounded structured model output', () => {
  it('retries malformed output once, reserving before both attempts', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ incorrect: 'field' }).mockResolvedValueOnce({ answer: 'valid' });
    const reserve = vi.fn().mockResolvedValue(undefined);
    const retry = vi.fn();
    await expect(generateBounded({ generate }, request, reserve, retry)).resolves.toEqual({ answer: 'valid' });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(generate.mock.invocationCallOrder[0]!);
    expect(reserve.mock.invocationCallOrder[1]).toBeLessThan(generate.mock.invocationCallOrder[1]!);
  });

  it('exhausts exactly two attempts and never exposes raw provider error contents', async () => {
    const provider: ModelProvider = { generate: vi.fn().mockRejectedValue(new Error('sk-test-secret-value provider body')) };
    const reserve = vi.fn().mockResolvedValue(undefined);
    await expect(generateBounded(provider, request, reserve)).rejects.toThrow(ModelBudgetError);
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(reserve).toHaveBeenCalledTimes(2);
  });

  it('does not call a model after durable attempt budget denial', async () => {
    const provider: ModelProvider = { generate: vi.fn().mockResolvedValue({ answer: 'valid' }) };
    await expect(generateBounded(provider, request, async () => { throw new Error('Budget exhausted in API'); })).rejects.toThrow('Budget exhausted in API');
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('honors a shared persisted budget across a simulated worker restart', async () => {
    let persisted = 1; // A previous process reserved and crashed before its response was stored.
    const reserve = async () => { if (persisted >= 2) throw new Error('Durable budget exhausted'); persisted += 1; };
    const provider: ModelProvider = { generate: vi.fn().mockResolvedValue({ malformed: true }) };
    await expect(generateBounded(provider, request, reserve)).rejects.toThrow('Durable budget exhausted');
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(persisted).toBe(2);
  });

  it('rejects oversized accumulated context before reserving or calling the provider', async () => {
    const reserve = vi.fn();
    const provider: ModelProvider = { generate: vi.fn() };
    await expect(generateBounded(provider, { ...request, input: 'x'.repeat(100_001) }, reserve)).rejects.toThrow('Model input exceeds 100000');
    expect(reserve).not.toHaveBeenCalled(); expect(provider.generate).not.toHaveBeenCalled();
  });

  it('does not reserve or invoke after cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    const reserve = vi.fn();
    const provider: ModelProvider = { generate: vi.fn() };
    await expect(generateBounded(provider, { ...request, signal: controller.signal }, reserve)).rejects.toThrow('Worker stopped');
    expect(reserve).not.toHaveBeenCalled();
  });
});

describe('role-specific job execution', () => {
  it('constructs a draft from the immutable brief and performs only its domain endpoints', async () => {
    const provider: ModelProvider = { generate: vi.fn().mockResolvedValue({ beats: syntheticRevision.beats, artisticCosts: ['The stillness makes the scene quieter.'] }) };
    const { api, calls } = recordingApi();
    await executeJob({ role: 'writer', job: { id: 'job1', role: 'writer', kind: 'create', payload: {} }, snapshot: snapshot(), provider, api, isConnected: () => true });
    expect(calls.map((call) => call.path)).toEqual(['/internal/jobs/job1/model-attempt', '/internal/jobs/job1/proposals', '/internal/jobs/job1/complete']);
    expect(calls[1]?.body).toEqual([{ candidate: { ...syntheticRevision, id: `candidate-${createHash('sha256').update('job1').digest('hex').slice(0, 24)}` }, artisticCosts: ['The stillness makes the scene quieter.'] }]);
    // No model-accessible approval, direct peer invocation or transport tool exists in this path.
    expect(calls.some((call) => /approve|stage-agent|switch/.test(call.path))).toBe(false);
  });

  it('accepts opaque Switch job IDs and constructs a safe revision ID', async () => {
    const provider: ModelProvider = { generate: vi.fn().mockResolvedValue({ beats: syntheticRevision.beats, artisticCosts: ['Quiet pacing.'] }) };
    const { api, calls } = recordingApi();
    const opaqueId = '!room:local:$message-with-platform-characters';
    await executeJob({ role: 'writer', job: { id: opaqueId, role: 'writer', kind: 'create', payload: {} }, snapshot: snapshot(), provider, api, isConnected: () => true });
    const proposals = calls[1]?.body as { candidate: { id: string } }[];
    expect(proposals[0]?.candidate.id).toMatch(/^candidate-[a-f0-9]{24}$/);
    expect(calls[1]?.path).toContain(encodeURIComponent(opaqueId));
  });

  it('refuses work assigned to the other independently running worker', async () => {
    const provider: ModelProvider = { generate: vi.fn() };
    const { api, calls } = recordingApi();
    await expect(executeJob({ role: 'stage', job: { id: 'job1', role: 'writer', kind: 'create', payload: {} }, snapshot: snapshot(), provider, api, isConnected: () => true })).rejects.toThrow('responsibility');
    expect(provider.generate).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('prevents model invocation while Switch is disconnected', async () => {
    const provider: ModelProvider = { generate: vi.fn() };
    const { api, calls } = recordingApi();
    await expect(executeJob({ role: 'writer', job: { id: 'job1', role: 'writer', kind: 'create', payload: {} }, snapshot: snapshot(), provider, api, isConnected: () => false })).rejects.toThrow('Switch disconnected');
    expect(provider.generate).not.toHaveBeenCalled(); expect(calls).toEqual([]);
  });

  it('does not advance a scene if Switch disappears during a model call', async () => {
    let connected = true;
    const provider: ModelProvider = { generate: vi.fn().mockImplementation(async () => { connected = false; return { beats: syntheticRevision.beats, artisticCosts: ['Quiet pacing.'] }; }) };
    const { api, calls } = recordingApi();
    await expect(executeJob({ role: 'writer', job: { id: 'job1', role: 'writer', kind: 'create', payload: {} }, snapshot: snapshot(), provider, api, isConnected: () => connected })).rejects.toThrow('Switch disconnected');
    expect(calls.map((call) => call.path)).toEqual(['/internal/jobs/job1/model-attempt']);
  });

  it('stores an interpretation separately without confirming a constraint', async () => {
    const state = snapshot(); state.current = syntheticRevision;
    state.observations = [{ id: 'o1', revisionId: syntheticRevision.id, text: 'I found my left hand difficult to use.', interpretation: null, status: 'awaiting_confirmation' }];
    const provider: ModelProvider = { generate: vi.fn().mockResolvedValue({ interpretation: 'Please confirm whether the left hand should stay unused throughout.' }) };
    const { api, calls } = recordingApi();
    await executeJob({ role: 'stage', job: { id: 'job1', role: 'stage', kind: 'interpret', payload: { observationId: 'o1' } }, snapshot: state, provider, api, isConnected: () => true });
    expect(calls.map((call) => call.path)).toEqual(['/internal/jobs/job1/model-attempt', '/internal/jobs/job1/interpret', '/internal/jobs/job1/complete']);
    expect(state.observations[0]?.text).toBe('I found my left hand difficult to use.');
    expect(state.constraints).toEqual([]);
  });

  it('rejects model reviews for unrelated proposal IDs', async () => {
    const state = snapshot();
    state.proposals = [{ id: 'p1', candidate: syntheticRevision, validation: { valid: true }, artisticCosts: ['Quiet pacing.'], status: 'pending_review' }];
    const provider: ModelProvider = { generate: vi.fn().mockResolvedValue({ reviews: [{ proposalId: 'unrelated', explanation: 'Cannot approve this.' }] }) };
    const { api, calls } = recordingApi();
    await expect(executeJob({ role: 'stage', job: { id: 'job1', role: 'stage', kind: 'review', payload: { proposalIds: ['p1'] } }, snapshot: state, provider, api, isConnected: () => true })).rejects.toThrow('exactly the requested');
    expect(calls.map((call) => call.path)).toEqual(['/internal/jobs/job1/model-attempt']);
  });
});

describe('configuration and redacted logs', () => {
  it('reports missing variable names with no fixture fallback', () => {
    expect(() => loadWorkerConfig('writer', {})).toThrow('OPENAI_MODEL');
    expect(() => loadWorkerConfig('writer', {})).toThrow('no mock mode');
  });
  it('redacts nested secret fields, bearer tokens, API key patterns and known secret values', () => {
    const result = JSON.stringify(redact({ nested: { apiKey: 'hidden-value', ok: 'Bearer abcdefgh' }, note: 'sk-testing-secret-content and my-explicit-secret', count: 3 }, ['my-explicit-secret']));
    expect(result).not.toContain('hidden-value'); expect(result).not.toContain('abcdefgh'); expect(result).not.toContain('sk-testing'); expect(result).not.toContain('my-explicit-secret'); expect(result).toContain('3');
  });
  it('emits structured logs without leaking a known credential in a free-text field', () => {
    const lines: string[] = [];
    const log = createLogger('writer', ['credential-value'], (line) => lines.push(line));
    log('worker_event', { detail: 'credential-value' });
    expect(lines[0]).not.toContain('credential-value');
    expect(JSON.parse(lines[0]!) as unknown).toMatchObject({ role: 'writer', event: 'worker_event', detail: '[redacted]' });
  });
});
