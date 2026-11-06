import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const dir = mkdtempSync(resolve("work/dev-lifecycle-negative-"));
const path = join(dir, "demo.sqlite");
const identity = join(dir, "identity.json");
writeFileSync(
  identity,
  JSON.stringify({
    roomId: "synthetic-room",
    bridgeId: "synthetic-bridge",
    participantId: "synthetic-human",
    mattermostUserId: "synthetic-user",
    mattermostChannelId: "synthetic-channel",
    verifiedAt: new Date().toISOString(),
    evidence:
      "Synthetic negative process-lifecycle test; no verified live human or Switch service.",
  }),
);
const env = {
  ...process.env,
  DATABASE_PATH: path,
  HUMAN_IDENTITY_FILE: identity,
  API_URL: "http://127.0.0.1:4310",
  PUBLIC_APP_URL: "http://127.0.0.1:5187",
  SWITCH_BASE_URL: "http://127.0.0.1:59999",
  SWITCH_ROOM_ID: "synthetic-room",
  WRITER_SWITCH_AGENT_ID: "synthetic-writer",
  WRITER_SWITCH_API_KEY: "synthetic-writer-key-not-a-real-secret",
  WRITER_SWITCH_SENDER: "synthetic-writer-participant",
  STAGE_SWITCH_AGENT_ID: "synthetic-stage",
  STAGE_SWITCH_API_KEY: "synthetic-stage-key-not-a-real-secret",
  STAGE_SWITCH_SENDER: "synthetic-stage-participant",
  WRITER_INTERNAL_TOKEN: "synthetic-writer-token-000000000000000000000000",
  STAGE_INTERNAL_TOKEN: "synthetic-stage-token-000000000000000000000000",
  MODEL_PROVIDER: "openai",
  OPENAI_API_KEY: "synthetic-no-provider-call",
  OPENAI_MODEL: "synthetic-no-model-call",
};
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/dev.ts"],
  { cwd: process.cwd(), env, encoding: "utf8", timeout: 20000 },
);
writeFileSync(join(dir, "process-output.txt"), result.stdout + result.stderr);
assert.equal(result.status, 1, result.stderr);
assert.match(result.stdout, /All application processes stopped/, result.stderr);
assert(!existsSync(path + ".dev-lock"));
assert(!existsSync(path + ".api-lock"));
assert(existsSync(path));
for (const key of [
  "WRITER_INTERNAL_TOKEN",
  "STAGE_INTERNAL_TOKEN",
  "WRITER_SWITCH_API_KEY",
  "STAGE_SWITCH_API_KEY",
  "OPENAI_API_KEY",
])
  assert(!(result.stdout + result.stderr).includes(env[key]));
console.log(
  "Negative lifecycle passed: real API/web/worker processes start, absent loopback Switch endpoint fails, all processes stop, database retained, locks released, dummy credentials absent from output. No model request or live integration performed.",
);
