// Operator-set hosted allowance; this never coordinates creative work.
// Rates checked: https://modal.com/library/zai/glm-5-3-flash-nvfp4 (2026-11-06).
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmdirSync } from 'node:fs';
import { isAbsolute } from 'node:path';
const path = process.env.HOSTED_MODEL_ALLOWANCE_FILE;
const endpoint = process.env.MODAL_BASE_URL?.replace(/\/$/, '') + '/chat/completions';
if (process.env.MODEL_PROVIDER !== 'modal' || process.env.MODAL_MODEL !== 'nvidia/GLM-5.3-Flash-NVFP4' || !path || !isAbsolute(path)) throw new Error('Hosted model guard requires the audited GLM model and an explicit Modal allowance file');
const host = new URL(endpoint).host;
function update(fn) {
  // Lock contention or a crashed reservation fails closed; no unreserved call escapes.
  mkdirSync(path + '.lock', { mode: 0o700 });
  try {
    const state = JSON.parse(readFileSync(path, 'utf8'));
    const result = fn(state);
    const temp = path + '.' + process.pid + '.tmp';
    writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    renameSync(temp, path);
    return result;
  } finally { rmdirSync(path + '.lock'); }
}
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (new URL(url).host !== host) return original(input, init);
  if (url !== endpoint || init?.method !== 'POST' || typeof init.body !== 'string') throw new Error('Hosted model allowance refused an unexpected request');
  const body = JSON.parse(init.body); const bytes = Buffer.byteLength(init.body);
  if (body.model !== process.env.MODAL_MODEL || body.max_tokens !== 6000 || body.stream !== false || bytes > 200000) throw new Error('Hosted model request exceeds allowed bounds');
  const reservedUsd = ((bytes + 8192) * 0.15 + 6000 * 0.50) / 1_000_000;
  const id = update(state => {
    if (!Number.isFinite(state.limitUsd) || state.limitUsd > 0.25 || state.limitUsd <= 0 || !Number.isFinite(state.reservedUsd) || state.reservedUsd < 0 || !Number.isFinite(Date.parse(state.deadline)) || Date.now() >= Date.parse(state.deadline) || !Array.isArray(state.requests) || state.requests.length >= 10 || state.reservedUsd + reservedUsd > state.limitUsd) throw new Error('Hosted model allowance is exhausted or expired; renew it explicitly');
    state.reservedUsd += reservedUsd;
    const id = state.requests.length + 1;
    state.requests.push({ id, status: 'reserved', startedAt: new Date().toISOString(), inputBytes: bytes, reservedUsd });
    return id;
  });
  const response = await original(input, { ...init, redirect: 'error' });
  const parsed = await response.clone().json().catch(() => null);
  update(state => {
    const row = state.requests.find(r => r.id === id);
    row.httpStatus = response.status; row.finishedAt = new Date().toISOString(); row.status = 'response-received';
    const usage = parsed?.usage;
    if (Number.isSafeInteger(usage?.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isSafeInteger(usage?.completion_tokens) && usage.completion_tokens >= 0) {
      row.promptTokens = usage.prompt_tokens; row.completionTokens = usage.completion_tokens;
      row.estimatedUsd = (usage.prompt_tokens * 0.15 + usage.completion_tokens * 0.50) / 1_000_000;
    }
  });
  return response;
};
