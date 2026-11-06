import OpenAI from 'openai';
import { zodResponseFormat, zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

export interface ModelConfig {
  modelProvider: 'openai' | 'modal';
  modelKey: string;
  model: string;
  modelBaseUrl: string;
}

function selectedProvider(env: NodeJS.ProcessEnv): ModelConfig['modelProvider'] {
  const provider = env.MODEL_PROVIDER ?? 'openai';
  if (provider !== 'openai' && provider !== 'modal') {
    throw new Error('MODEL_PROVIDER must be openai or modal; no provider fallback is available');
  }
  return provider;
}

export function requiredModelVariables(env: NodeJS.ProcessEnv): readonly string[] {
  return selectedProvider(env) === 'modal'
    ? ['MODAL_PROXY_TOKEN', 'MODAL_MODEL', 'MODAL_BASE_URL']
    : ['OPENAI_API_KEY', 'OPENAI_MODEL'];
}

function modalBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' &&
      (url.hostname.endsWith('.modal.direct') || url.hostname.endsWith('.modal.run')) &&
      !url.username && !url.password && !url.port && !url.search && !url.hash &&
      ['/v1', '/v1/'].includes(url.pathname)) return url.href.replace(/\/$/, '');
  } catch { /* Invalid configuration can contain credentials; never echo it. */ }
  throw new Error('MODAL_BASE_URL must be an HTTPS Modal endpoint ending in /v1, without credentials, query, fragment or a custom port');
}

function validateModalToken(value: string): void {
  if (!/^wk-[A-Za-z0-9_-]+\.ws-[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('MODAL_PROXY_TOKEN must combine the proxy token ID and secret as wk-ID.ws-SECRET; do not use a Modal CLI token');
  }
}

export function loadModelConfig(env: NodeJS.ProcessEnv): ModelConfig {
  const modelProvider = selectedProvider(env);
  const missing = requiredModelVariables(env).filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing model configuration: ${missing.join(', ')}; no fixture fallback is available`);
  if (modelProvider === 'modal') {
    const modelKey = env.MODAL_PROXY_TOKEN!.trim();
    validateModalToken(modelKey);
    return { modelProvider, modelKey, model: env.MODAL_MODEL!.trim(), modelBaseUrl: modalBaseUrl(env.MODAL_BASE_URL!.trim()) };
  }
  return { modelProvider, modelKey: env.OPENAI_API_KEY!.trim(), model: env.OPENAI_MODEL!.trim(), modelBaseUrl: 'https://api.openai.com/v1' };
}

function credentialSafeFetch(fetchImpl: typeof fetch): typeof fetch {
  return (input, init) => fetchImpl(input, { ...init, redirect: 'error' });
}

export interface ModelRequest<T> {
  schema: z.ZodType<T>;
  name: string;
  instructions: string;
  input: string;
  signal?: AbortSignal;
}
export const MAX_MODEL_INPUT_CHARACTERS = 100_000;
function assertInputBound(request: { instructions: string; input: string }): void {
  if (request.instructions.length + request.input.length > MAX_MODEL_INPUT_CHARACTERS) {
    throw new Error('Model input exceeds 100000 characters; narrow the scene history before retrying');
  }
}

export interface ModelProvider {
  generate<T>(request: ModelRequest<T>): Promise<unknown>;
}

/** SDK retries are disabled; durable application reservations own the budget. */
export class OpenAIProvider implements ModelProvider {
  private readonly client: OpenAI;
  constructor(apiKey: string, private readonly model: string, fetchImpl: typeof fetch = fetch) {
    if (!apiKey || !model) throw new Error('OPENAI_API_KEY and OPENAI_MODEL are required; no fixture fallback is available');
    this.client = new OpenAI({ apiKey, baseURL: 'https://api.openai.com/v1', maxRetries: 0, timeout: 45_000, fetch: credentialSafeFetch(fetchImpl) });
  }
  async generate<T>(request: ModelRequest<T>): Promise<unknown> {
    assertInputBound(request);
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: request.instructions,
      input: request.input,
      text: { format: zodTextFormat(request.schema, request.name) },
      max_output_tokens: 6000,
      store: false,
    }, { signal: request.signal });
    if (response.status !== 'completed' || response.output_parsed === null) {
      throw new Error('Model did not return a complete structured result');
    }
    return response.output_parsed;
  }
}

/** Modal's XGrammar cannot combine a string pattern and length bounds.
 * Keep length bounds in the decoding grammar; the original Zod parser still
 * enforces every constraint, including patterns, before anything is returned.
 */
function modalResponseFormat<T>(schema: z.ZodType<T>, name: string) {
  const format = zodResponseFormat(schema, name);
  const grammar = structuredClone(format.json_schema.schema);
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value !== 'object' || value === null) return;
    const node = value as Record<string, unknown>;
    if (node.type === 'string' && typeof node.pattern === 'string' &&
      (typeof node.minLength === 'number' || typeof node.maxLength === 'number')) delete node.pattern;
    // Visit schema-bearing keywords only; never rewrite const/enum payloads.
    for (const key of ['properties', 'patternProperties', '$defs', 'definitions']) {
      const children = node[key];
      if (typeof children === 'object' && children !== null) Object.values(children).forEach(visit);
    }
    for (const key of ['items', 'additionalProperties', 'anyOf', 'oneOf', 'allOf', 'not', 'if', 'then', 'else']) visit(node[key]);
  };
  visit(grammar);
  format.json_schema.schema = grammar;
  return format;
}

/** Modal speaks Chat Completions; schema validation still belongs to this application. */
export class ModalProvider implements ModelProvider {
  private readonly client: OpenAI;
  constructor(apiKey: string, private readonly model: string, baseUrl: string, fetchImpl: typeof fetch = fetch) {
    validateModalToken(apiKey);
    if (!model.trim()) throw new Error('MODAL_MODEL is required; no provider fallback is available');
    this.client = new OpenAI({ apiKey, baseURL: modalBaseUrl(baseUrl), organization: null, project: null, maxRetries: 0, timeout: 75_000, fetch: credentialSafeFetch(fetchImpl) });
  }
  async generate<T>(request: ModelRequest<T>): Promise<unknown> {
    assertInputBound(request);
    const response = await this.client.chat.completions.parse({
      model: this.model,
      messages: [{ role: 'system', content: request.instructions }, { role: 'user', content: request.input }],
      response_format: modalResponseFormat(request.schema, request.name),
      max_tokens: 6000,
      stream: false,
      // This configured model defaults to max reasoning, which can consume the
      // entire output budget before producing a candidate. Keep the budget fixed.
      ...(this.model === 'nvidia/GLM-5.3-Flash-NVFP4' ? { reasoning_effort: 'low' as const, chat_template_kwargs: { reasoning_effort: 'low' } } : {}),
    }, { signal: request.signal });
    const choice = response.choices[0];
    if (!choice || choice.finish_reason !== 'stop' || choice.message.refusal || choice.message.parsed == null) {
      throw new Error('Model did not return a complete structured result');
    }
    return request.schema.parse(choice.message.parsed);
  }
}

export function createModelProvider(config: ModelConfig): ModelProvider {
  if (config.modelProvider === 'modal') return new ModalProvider(config.modelKey, config.model, config.modelBaseUrl);
  if (config.modelProvider === 'openai') return new OpenAIProvider(config.modelKey, config.model);
  throw new Error('MODEL_PROVIDER must be openai or modal; no provider fallback is available');
}

export class ModelBudgetError extends Error {
  constructor() { super('Model attempt budget exhausted; the job needs human attention'); this.name = 'ModelBudgetError'; }
}

/** A denied durable reservation never triggers an unreserved model call. */
export async function generateBounded<T>(
  provider: ModelProvider,
  request: ModelRequest<T>,
  reserveAttempt: () => Promise<void>,
  onRetry: () => void = () => undefined,
): Promise<T> {
  assertInputBound(request);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (request.signal?.aborted) throw new Error('Worker stopped before model call');
    await reserveAttempt();
    try {
      const raw = await provider.generate({
        ...request,
        instructions: `${request.instructions}${attempt > 0 ? '\nThe previous response could not be validated. Return only the requested structured data; do not add fields.' : ''}`,
      });
      return request.schema.parse(raw);
    } catch {
      if (request.signal?.aborted) throw new Error('Worker stopped during model call');
      if (attempt === 1) throw new ModelBudgetError();
      onRetry();
    }
  }
  throw new ModelBudgetError();
}
