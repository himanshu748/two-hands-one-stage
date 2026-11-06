import { expect, it, vi } from 'vitest';
import { verifyModel } from '../../scripts/verify-model.js';
import type { ModelConfig, ModelProvider } from '../../packages/agent-runtime/src/model.js';

// Synthetic transport fixtures: none of these tests calls Modal or OpenAI.
const config: ModelConfig = {
  modelProvider: 'modal', modelKey: 'wk-synthetic.ws-synthetic',
  model: 'synthetic-model', modelBaseUrl: 'https://synthetic.modal.direct/v1',
};

it('makes no provider call in the default verification mode', async () => {
  const provider = { generate: vi.fn() };
  expect(await verifyModel(config, false, provider)).toMatchObject({ status: 'configuration-only', requests: 0 });
  expect(provider.generate).not.toHaveBeenCalled();
});

it('sends one bounded schema probe and does not return prompt, credentials or generated content', async () => {
  const provider: ModelProvider = { generate: vi.fn().mockResolvedValue({ beatId: 'b1', dialogue: 'Synthetic line.', action: 'speak' }) };
  const report = await verifyModel(config, true, provider);
  expect(provider.generate).toHaveBeenCalledOnce();
  expect(report).toMatchObject({ status: 'schema-probe-passed', backend: 'modal', requests: 1 });
  expect(JSON.stringify(report)).not.toContain('wk-synthetic');
  expect(JSON.stringify(report)).not.toContain('Synthetic line.');
});

it.each([{ beatId: 'b2' }, null])('rejects malformed responses without retrying: %s', async (response) => {
  const provider: ModelProvider = { generate: vi.fn().mockResolvedValue(response) };
  await expect(verifyModel(config, true, provider)).rejects.toThrow();
  expect(provider.generate).toHaveBeenCalledOnce();
});

it('does not retry a provider failure or switch providers', async () => {
  const provider: ModelProvider = { generate: vi.fn().mockRejectedValue(new Error('Synthetic failure')) };
  await expect(verifyModel(config, true, provider)).rejects.toThrow('Synthetic failure');
  expect(provider.generate).toHaveBeenCalledOnce();
});
