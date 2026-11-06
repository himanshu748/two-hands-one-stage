import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { SwitchClient } from "@two-hands/switch-client";
import { AuditCandidateSchema, matchesHumanNonce } from "./human-audit.js";

async function main(): Promise<void> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const required = ["SWITCH_BASE_URL", "SWITCH_ROOM_ID", "STAGE_SWITCH_AGENT_ID", "STAGE_SWITCH_API_KEY", "WRITER_SWITCH_SENDER", "STAGE_SWITCH_SENDER"];
  const missing = required.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")}`);
  const candidatePath = process.argv[2];
  const seconds = Number(process.argv[3] ?? 300);
  const automated = process.argv.includes("--operator-automated");
  if (!candidatePath || !Number.isInteger(seconds) || seconds < 15 || seconds > 600)
    throw new Error("Use pnpm verify:human <reviewed-candidate.json> [15–600 seconds] [--operator-automated]. Stop the stage worker first; this check claims its room connection.");
  let candidate;
  try {
    candidate = AuditCandidateSchema.parse(JSON.parse(readFileSync(candidatePath, "utf8")));
  } catch {
    throw new Error("Candidate must be readable, valid operator-audited JSON. Its contents were not logged.");
  }
  if (
    candidate.room_id !== process.env.SWITCH_ROOM_ID ||
    [process.env.WRITER_SWITCH_SENDER, process.env.STAGE_SWITCH_SENDER].includes(candidate.event_sender) ||
    Date.now() - Date.parse(candidate.audited_at) > 24 * 60 * 60 * 1000 ||
    Date.parse(candidate.audited_at) > Date.now()
  ) throw new Error("Candidate mapping is stale, mismatched or agent-owned. Repeat the documented administrative identity audit.");
  const output = resolve("work/human-identity.json");
  if (existsSync(output)) throw new Error("work/human-identity.json already exists; preserve and review it instead of overwriting an identity mapping.");
  const nonce = randomUUID();
  const startedAt = Date.now();
  const stageName = process.env.STAGE_SWITCH_NAME || "two-hands-stage";
  const client = new SwitchClient({
    baseUrl: process.env.SWITCH_BASE_URL!, roomId: candidate.room_id,
    agentId: process.env.STAGE_SWITCH_AGENT_ID!, apiKey: process.env.STAGE_SWITCH_API_KEY!,
    connectionId: randomUUID(),
  });
  await client.discover();
  console.log(`Connecting for identity verification (up to ${seconds} seconds). Wait for the ready challenge before posting. No model call or scene approval will occur.`);
  try {
    await new Promise<void>((resolveAudit, reject) => {
      let announced = false;
      const timeout = setTimeout(() => reject(new Error("No matching performer-account nonce received. Mapping remains disabled; no identity file was written.")), seconds * 1000);
      client.start({
        onState: state => { if (state.status === "connected" && !announced) {
          announced = true;
          console.log(`Listening on the intended Switch room. Sign in as the audited performer and post this exact message in its private Mattermost channel now:\n@${stageName} verify ${nonce}`);
        } },
        onBlocked: reason => { clearTimeout(timeout); reject(new Error(reason)); },
        onEvent: async event => {
          if (!matchesHumanNonce(event, candidate, nonce, startedAt, stageName)) return;
          try {
            mkdirSync(dirname(output), { recursive: true });
            writeFileSync(output, JSON.stringify({
              roomId: candidate.room_id, bridgeId: candidate.bridge_id,
              participantId: candidate.event_sender,
              mattermostUserId: candidate.mattermost_user_id,
              mattermostChannelId: candidate.mattermost_channel_id,
              verifiedAt: new Date().toISOString(),
              evidence: `Operator mapping audit ${candidate.audited_at}; non-bot account, claimed Gateway owner and room membership checked. Fresh addressed nonce observed on authenticated Switch stream, message ${event.data.payload.message_id}, event ${event.id}. Posting mode: ${automated ? "user-authorized operator automation using the performer account" : "operator-declared manual account check"}. This verifies account routing, not a person's presence at the keyboard. No scene approval or rehearsal occurred.`,
            }, null, 2), { mode: 0o600, flag: "wx" });
            clearTimeout(timeout); resolveAudit();
          } catch { clearTimeout(timeout); reject(new Error("Could not save identity evidence exclusively; existing files were preserved.")); }
        },
      });
    });
    console.log("Performer-account routing verified; private work/human-identity.json saved with the posting method recorded. Review it and set HUMAN_IDENTITY_FILE in .env. No .env change, model call, scene approval or rehearsal was performed.");
  } finally { client.stop(); }
}

try { await main(); }
catch (error) {
  console.error(error instanceof Error && !("issues" in error) ? error.message : "Invalid reviewed identity candidate. See docs/switch-compatibility.md.");
  process.exitCode = 1;
}
