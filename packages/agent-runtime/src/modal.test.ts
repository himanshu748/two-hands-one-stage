import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createModelProvider, generateBounded, loadModelConfig, ModalProvider, ModelBudgetError, OpenAIProvider, requiredModelVariables } from './model.js';
import { loadWorkerConfig } from './worker.js';

// Synthetic endpoint and credential shapes only. Provider responses use a fake fetch.
const syntheticEnv = {
  MODEL_PROVIDER: 'modal', MODAL_BASE_URL: 'https://synthetic-endpoint.us-west.modal.direct/v1',
  MODAL_PROXY_TOKEN: 'wk-synthetic.ws-not-a-real-secret', MODAL_MODEL: 'synthetic-model',
};
const request = { schema: z.object({ answer: z.string() }).strict(), name: 'answer', instructions: 'Return structured data.', input: 'Synthetic input.' };
const completion = (content: string | null, finishReason = 'stop', refusal: string | null = null) => ({
  id: 'synthetic-completion', object: 'chat.completion', created: 0, model: 'synthetic-model',
  choices: [{ index: 0, finish_reason: finishReason, message: { role: 'assistant', content, refusal } }],
});
function fixture(payload: unknown = completion('{"answer":"Synthetic answer"}'), status = 200) {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload, { status }));
  const provider = new ModalProvider(syntheticEnv.MODAL_PROXY_TOKEN, syntheticEnv.MODAL_MODEL, syntheticEnv.MODAL_BASE_URL, transport);
  return { transport, provider };
}

afterEach(() => vi.unstubAllEnvs());

describe('Modal adapter through the real SDK and synthetic HTTP responses', () => {
  it('sends bounded structured chat input only to the configured Modal endpoint', async () => {
    vi.stubEnv('OPENAI_ORG_ID', 'synthetic-unrelated-organization');
    vi.stubEnv('OPENAI_PROJECT_ID', 'synthetic-unrelated-project');
    const { provider, transport } = fixture();
    await expect(provider.generate(request)).resolves.toEqual({ answer: 'Synthetic answer' });
    const [url, options] = transport.mock.calls[0]!;
    expect(String(url)).toBe(`${syntheticEnv.MODAL_BASE_URL}/chat/completions`);
    expect(options?.redirect).toBe('error');
    expect(new Headers(options?.headers).get('authorization')).toBe(`Bearer ${syntheticEnv.MODAL_PROXY_TOKEN}`);
    expect(new Headers(options?.headers).get('openai-organization')).toBeNull();
    expect(new Headers(options?.headers).get('openai-project')).toBeNull();
    expect(JSON.parse(String(options?.body))).toMatchObject({
      model: 'synthetic-model', stream: false, max_tokens: 6000,
      messages: [{ role: 'system', content: request.instructions }, { role: 'user', content: request.input }],
      response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: { type: 'object', additionalProperties: false } } },
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('adapts nested string grammars while still rejecting whitespace through the original schema', async () => {
    const schema = z.object({ beats: z.array(z.object({ title: z.string().regex(/\S/).min(1).max(120), code: z.string().regex(/^b[1-6]$/) }).strict()) }).strict();
    const valid = fixture(completion(JSON.stringify({ beats: [{ title: 'Synthetic title', code: 'b1' }] })));
    await expect(valid.provider.generate({ ...request, schema })).resolves.toEqual({ beats: [{ title: 'Synthetic title', code: 'b1' }] });
    const body = JSON.parse(String(valid.transport.mock.calls[0]?.[1]?.body));
    const encoded = JSON.stringify(body.response_format.json_schema.schema);
    expect(encoded).not.toContain('"pattern":"\\\\S"');
    expect(encoded).toContain('"maxLength":120');
    expect(encoded).toContain('"pattern":"^b[1-6]$"');
    const invalid = fixture(completion(JSON.stringify({ beats: [{ title: '   ', code: 'b1' }] })));
    await expect(invalid.provider.generate({ ...request, schema })).rejects.toThrow();
    expect(invalid.transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    completion('{not-json'), completion('{"answer":3}'), completion('{"answer":"ok","extra":true}'),
    completion(null, 'stop', 'Synthetic refusal'), completion('{"answer":"cut"}', 'length'),
    completion(null, 'content_filter'), { ...completion(null), choices: [] },
  ])('rejects malformed, refused or unfinished output', async (payload) => {
    const { provider, transport } = fixture(payload);
    await expect(provider.generate(request)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('uses exactly two application reservations without hidden SDK retry or provider fallback', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ error: { message: 'synthetic-private-error' } }, { status: 429 }));
    const provider = new ModalProvider(syntheticEnv.MODAL_PROXY_TOKEN, 'synthetic-model', syntheticEnv.MODAL_BASE_URL, transport);
    const reserve = vi.fn().mockResolvedValue(undefined);
    await expect(generateBounded(provider, request, reserve)).rejects.toThrow(ModelBudgetError);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls.every(([url]) => String(url).startsWith(syntheticEnv.MODAL_BASE_URL))).toBe(true);
  });
  it('refuses redirect responses and makes no second request', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      expect(options?.redirect).toBe('error');
      return new Response('', { status: 307, headers: { location: 'https://unexpected.invalid' } });
    });
    const provider = new ModalProvider(syntheticEnv.MODAL_PROXY_TOKEN, 'synthetic-model', syntheticEnv.MODAL_BASE_URL, transport);
    await expect(provider.generate(request)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('cancels an in-flight call without retrying', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Synthetic abort', 'AbortError')), { once: true });
    }));
    const provider = new ModalProvider(syntheticEnv.MODAL_PROXY_TOKEN, 'synthetic-model', syntheticEnv.MODAL_BASE_URL, transport);
    const controller = new AbortController();
    const reserve = vi.fn().mockResolvedValue(undefined);
    const done = generateBounded(provider, { ...request, signal: controller.signal }, reserve);
    const assertion = expect(done).rejects.toThrow('Worker stopped during model call');
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    controller.abort();
    await assertion;
    expect(reserve).toHaveBeenCalledTimes(1);
  });
  it('checks input bounds and cancellation before any model attempt', async () => {
    const { provider, transport } = fixture();
    await expect(provider.generate({ ...request, input: 'x'.repeat(100_001) })).rejects.toThrow('Model input exceeds');
    const controller = new AbortController(); controller.abort();
    await expect(provider.generate({ ...request, signal: controller.signal })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it('never routes OpenAI credentials through an ambient custom URL', async () => {
    vi.stubEnv('OPENAI_BASE_URL', syntheticEnv.MODAL_BASE_URL);
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'synthetic-response', status: 'completed', output: [], output_parsed: null }));
    const provider = new OpenAIProvider('synthetic-openai-key', 'synthetic-model', transport);
    await expect(provider.generate(request)).rejects.toThrow();
    expect(String(transport.mock.calls[0]?.[0])).toBe('https://api.openai.com/v1/responses');
    expect(transport.mock.calls[0]?.[1]?.redirect).toBe('error');
  });
});

describe('explicit model configuration', () => {
  it('selects Modal without an OpenAI credential and preserves the worker roles', () => {
    expect(requiredModelVariables(syntheticEnv)).toEqual(['MODAL_PROXY_TOKEN', 'MODAL_MODEL', 'MODAL_BASE_URL']);
    const config = loadWorkerConfig('stage', {
      ...syntheticEnv, SWITCH_BASE_URL: 'https://switch.invalid', SWITCH_ROOM_ID: 'synthetic-room',
      STAGE_INTERNAL_TOKEN: 'x'.repeat(32), STAGE_SWITCH_AGENT_ID: 'synthetic-stage',
      STAGE_SWITCH_API_KEY: 'synthetic-agent-key', STAGE_SWITCH_SENDER: 'synthetic-stage-sender',
    });
    expect(config).toMatchObject({ role: 'stage', modelProvider: 'modal', modelBaseUrl: syntheticEnv.MODAL_BASE_URL, modelKey: syntheticEnv.MODAL_PROXY_TOKEN });
    expect(createModelProvider(config)).toBeInstanceOf(ModalProvider);
  });
  it('retains the OpenAI default with a fixed destination', () => {
    const config = loadModelConfig({ OPENAI_API_KEY: 'synthetic-openai-key', OPENAI_MODEL: 'synthetic-model', OPENAI_BASE_URL: 'https://unexpected.invalid' });
    expect(config.modelProvider).toBe('openai');
    expect(config.modelBaseUrl).toBe('https://api.openai.com/v1');
    expect(createModelProvider(config)).toBeInstanceOf(OpenAIProvider);
  });
  it('never substitutes OpenAI when Modal configuration is incomplete', () => {
    const env = { MODEL_PROVIDER: 'modal', OPENAI_API_KEY: 'synthetic-openai-key', OPENAI_MODEL: 'synthetic-model' };
    expect(() => loadModelConfig(env)).toThrow('MODAL_PROXY_TOKEN, MODAL_MODEL, MODAL_BASE_URL');
    expect(() => loadModelConfig({ MODEL_PROVIDER: 'unknown-secret-value' })).toThrow('MODEL_PROVIDER must be openai or modal');
  });
  it.each([
    'http://synthetic.modal.direct/v1', 'https://synthetic.modal.direct.attacker.invalid/v1',
    'https://modal.direct/v1', 'https://localhost/v1',
    'https://synthetic.modal.run:8443/v1', 'https://synthetic.modal.run/v1?token=hidden',
    'https://hidden:password@synthetic.modal.run/v1', 'https://synthetic.modal.run/v1#hidden',
    'https://synthetic.modal.run/other', 'malformed-hidden-value',
  ])('rejects an unsafe Modal destination without echoing it: %s', (baseUrl) => {
    expect(() => loadModelConfig({ ...syntheticEnv, MODAL_BASE_URL: baseUrl })).toThrow('MODAL_BASE_URL must be');
    try { loadModelConfig({ ...syntheticEnv, MODAL_BASE_URL: baseUrl }); } catch (error) { expect(String(error)).not.toContain(baseUrl); }
  });
  it('accepts private web-server domains and normalizes a trailing slash', () => {
    expect(loadModelConfig({ ...syntheticEnv, MODAL_BASE_URL: 'https://synthetic-app.modal.run/v1/' }).modelBaseUrl).toBe('https://synthetic-app.modal.run/v1');
  });
  it('rejects a CLI token or malformed proxy pair without disclosing it', () => {
    for (const token of ['ak-synthetic.as-private', 'wk-synthetic', 'wk-synthetic.ws-private\nInjected: true']) {
      expect(() => loadModelConfig({ ...syntheticEnv, MODAL_PROXY_TOKEN: token })).toThrow('MODAL_PROXY_TOKEN must combine');
      try { loadModelConfig({ ...syntheticEnv, MODAL_PROXY_TOKEN: token }); } catch (error) { expect(String(error)).not.toContain(token); }
    }
  });
});
