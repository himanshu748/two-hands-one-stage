import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateHostedConfig, waitForHostedApi, waitForHostedSwitch } from '../../scripts/start-hosted.js';

const directories: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'two-hands-hosted-')); directories.push(directory);
  const identity = join(directory, 'identity.json');
  writeFileSync(identity, JSON.stringify({ roomId: 'synthetic-room', bridgeId: 'synthetic-bridge', participantId: 'synthetic-performer', mattermostUserId: 'synthetic-user', mattermostChannelId: 'synthetic-channel', verifiedAt: '2026-11-06T00:00:00Z', evidence: 'Synthetic mapping for hosted configuration tests only.' }), { mode: 0o600 });
  const env: NodeJS.ProcessEnv = {
    DATABASE_PATH: join(directory, 'scene.sqlite'), HUMAN_IDENTITY_FILE: identity, PUBLIC_APP_URL: 'https://synthetic.example.invalid', API_URL: 'http://127.0.0.1:4310',
    SWITCH_BASE_URL: 'http://127.0.0.1:18000', SWITCH_ROOM_ID: 'synthetic-room', WRITER_SWITCH_AGENT_ID: 'synthetic-writer', STAGE_SWITCH_AGENT_ID: 'synthetic-stage',
    WRITER_SWITCH_SENDER: 'synthetic-writer-sender', STAGE_SWITCH_SENDER: 'synthetic-stage-sender', WRITER_SWITCH_API_KEY: 'synthetic-writer-key', STAGE_SWITCH_API_KEY: 'synthetic-stage-key',
    WRITER_INTERNAL_TOKEN: 'synthetic-writer-internal-0000000000000000', STAGE_INTERNAL_TOKEN: 'synthetic-stage-internal-00000000000000000',
    MODEL_PROVIDER: 'openai', OPENAI_API_KEY: 'synthetic-model-key', OPENAI_MODEL: 'synthetic-model',
  };
  return { directory, env };
}

describe('hosted launch preflight — synthetic configuration, no services started', () => {
  it('validates the complete separate-worker configuration without connecting or creating a database', () => {
    const { directory, env } = fixture();
    expect(validateHostedConfig(env, directory)).toEqual({ databasePath: env.DATABASE_PATH });
  });
  it('rejects checked-out credentials, remote internal API, relative persistence and an unreviewed identity', () => {
    const { directory, env } = fixture();
    expect(() => validateHostedConfig({ ...env, API_URL: 'https://synthetic.example.invalid' }, directory)).toThrow('API_URL');
    expect(() => validateHostedConfig({ ...env, DATABASE_PATH: 'scene.sqlite' }, directory)).toThrow('absolute');
    expect(() => validateHostedConfig({ ...env, HUMAN_IDENTITY_FILE: '' }, directory)).toThrow('requires');
    writeFileSync(join(directory, '.env'), 'SYNTHETIC=not-a-secret');
    expect(() => validateHostedConfig(env, directory)).toThrow('must not contain .env');
  });
  it('rejects a public HTTP origin and reused worker identity or database symlink', () => {
    const { directory, env } = fixture();
    expect(() => validateHostedConfig({ ...env, PUBLIC_APP_URL: 'http://synthetic.example.invalid' }, directory)).toThrow('HTTPS');
    expect(() => validateHostedConfig({ ...env, STAGE_SWITCH_AGENT_ID: env.WRITER_SWITCH_AGENT_ID }, directory)).toThrow('distinct');
    const target = join(directory, 'synthetic-target'); writeFileSync(target, 'synthetic'); symlinkSync(target, env.DATABASE_PATH!);
    expect(() => validateHostedConfig(env, directory)).toThrow('symbolic link');
  });
});


describe('hosted API readiness — stubbed transport only', () => {
  it('requires the expected API health response before a dependent process may start', async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, service: 'two-hands-api' }), { status: 200 }));
    vi.stubGlobal('fetch', transport);
    await expect(waitForHostedApi(undefined, 50)).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledWith('http://127.0.0.1:4310/health', expect.objectContaining({ redirect: 'error' }));
  });
  it('rejects another service and an already cancelled startup without starting workers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, service: 'another-service' }), { status: 200 })));
    await expect(waitForHostedApi(undefined, 10)).rejects.toThrow('did not become ready');
    const controller = new AbortController(); controller.abort();
    await expect(waitForHostedApi(controller.signal)).rejects.toThrow('cancelled');
  });
});


describe('hosted Switch readiness — stubbed transport only', () => {
  it('retries unavailable bridge health before accepting the verified HTTP-success contract', async () => {
    const transport = vi.fn().mockResolvedValueOnce(new Response('starting', { status: 503 })).mockResolvedValueOnce(new Response('healthy', { status: 200 }));
    vi.stubGlobal('fetch', transport);
    await expect(waitForHostedSwitch('http://127.0.0.1:18000', undefined, 1000)).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(String(transport.mock.calls[0]![0])).toBe('http://127.0.0.1:18000/health');
    expect(transport.mock.calls[0]![1]).toEqual(expect.objectContaining({ redirect: 'error' }));
  });
  it('times out without starting a worker and respects cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('synthetic connection refused')));
    await expect(waitForHostedSwitch('http://127.0.0.1:18000', undefined, 10)).rejects.toThrow('did not become ready');
    const controller = new AbortController(); controller.abort();
    await expect(waitForHostedSwitch('http://127.0.0.1:18000', controller.signal)).rejects.toThrow('cancelled');
  });
  it('rejects public or credential-bearing bridge URLs before network access', async () => {
    const transport = vi.fn(); vi.stubGlobal('fetch', transport);
    for (const url of ['https://synthetic.example.invalid', 'http://user:password@127.0.0.1:18000', 'http://127.0.0.1:18000/?secret=synthetic']) await expect(waitForHostedSwitch(url)).rejects.toThrow('loopback');
    expect(transport).not.toHaveBeenCalled();
  });
});
