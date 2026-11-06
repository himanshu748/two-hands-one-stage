import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createModelProvider, loadModelConfig, type ModelConfig, type ModelProvider } from '../packages/agent-runtime/src/model.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const ProbeSchema = z.object({
  beatId: z.literal('b1'),
  dialogue: z.string().min(1).max(160),
  action: z.enum(['speak', 'pause']),
}).strict();

/** One explicit schema probe; never creates a scene, approval, or rehearsal record. */
export async function verifyModel(config: ModelConfig, call: boolean, provider?: ModelProvider) {
  if (!call) return {
    status: 'configuration-only', backend: config.modelProvider, requests: 0,
    detail: 'No network request sent. --call makes one potentially billable structured-output request; authorize usage first.',
  };
  const result = await (provider ?? createModelProvider(config)).generate({
    name: 'two_hands_protocol_probe', schema: ProbeSchema,
    instructions: 'This is a synthetic protocol check, not a human rehearsal. Return the requested JSON only.',
    input: 'Write one short, reassuring line for beat b1. Choose speak or pause as its action. Do not mention props.',
    signal: AbortSignal.timeout(45_000),
  });
  ProbeSchema.parse(result);
  return {
    status: 'schema-probe-passed', backend: config.modelProvider, requests: 1,
    detail: 'One real provider response passed the small probe schema. Full scene quality, Switch collaboration and physical rehearsal remain unverified.',
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--call') || args.length > 1) {
    console.error('Use pnpm verify:model [--call]. Default: configuration only. --call sends one potentially billable request.');
    process.exitCode = 2;
    return;
  }
  const envPath = resolve(root, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const config = loadModelConfig(process.env);
  console.log(JSON.stringify(await verifyModel(config, args.includes('--call')), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Model verification blocked: check the selected backend configuration, endpoint access and structured-output support. No automatic retry or fallback was attempted; provider details are suppressed. Run pnpm readiness --offline for prerequisite names.');
    process.exitCode = 1;
  });
}
