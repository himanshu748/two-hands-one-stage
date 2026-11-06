import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IdentitySchema } from "../apps/api/src/config.js";
import { loadModelConfig, requiredModelVariables } from "../packages/agent-runtime/src/model.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const required = [
  "DATABASE_PATH", "HUMAN_IDENTITY_FILE", "SWITCH_BASE_URL", "SWITCH_ROOM_ID",
  "WRITER_SWITCH_AGENT_ID", "WRITER_SWITCH_API_KEY", "WRITER_SWITCH_SENDER",
  "STAGE_SWITCH_AGENT_ID", "STAGE_SWITCH_API_KEY", "STAGE_SWITCH_SENDER",
  "WRITER_INTERNAL_TOKEN", "STAGE_INTERNAL_TOKEN",
] as const;

type Check = { name: string; status: "passed" | "blocked" | "not-checked"; detail: string };
export interface ReadinessReport {
  mode: "read-only-preflight";
  result: "blocked" | "configuration-checks-passed" | "preflight-checks-passed";
  missingVariables: string[];
  checks: Check[];
  manualGates: string[];
}

/** This checks prerequisites only; it cannot start a runtime, claim a room or call a model. */
export async function checkReadiness(input: {
  env: NodeJS.ProcessEnv;
  root: string;
  offline: boolean;
  fetch: typeof fetch;
}): Promise<ReadinessReport> {
  const { env } = input;
  let modelVariables: readonly string[] = [];
  let modelConfigurationValid = false;
  try {
    modelVariables = requiredModelVariables(env);
    loadModelConfig(env);
    modelConfigurationValid = true;
  } catch { /* Never expose model endpoint or credential values in preflight errors. */ }
  const missingVariables = [...required, ...modelVariables].filter((name) => !env[name]?.trim());
  const checks: Check[] = [{
    name: "configuration",
    status: missingVariables.length ? "blocked" : "passed",
    detail: missingVariables.length
      ? "Set the listed variable names in the private root .env. Existing credentials must be preserved."
      : "Required variables are present. Values and credential validity are not disclosed or inferred.",
  }];
  checks.push({
    name: "model-configuration",
    status: modelConfigurationValid ? "passed" : "blocked",
    detail: modelConfigurationValid
      ? "The explicitly selected model backend has valid local configuration. No model request was sent; endpoint availability, schema compatibility and usage authorization remain unverified."
      : "Set MODEL_PROVIDER to openai or modal and complete its documented variables. Modal requires an HTTPS Modal /v1 endpoint and a combined proxy token; no provider fallback is used.",
  });
  const pairs = ["SWITCH_AGENT_ID", "SWITCH_API_KEY", "SWITCH_SENDER", "INTERNAL_TOKEN"];
  const distinct = pairs.every((key) =>
    Boolean(env[`WRITER_${key}`]?.trim() && env[`STAGE_${key}`]?.trim()) &&
    env[`WRITER_${key}`] !== env[`STAGE_${key}`],
  );
  const tokensLongEnough = [env.WRITER_INTERNAL_TOKEN, env.STAGE_INTERNAL_TOKEN]
    .every((token) => (token?.length ?? 0) >= 32);
  checks.push({
    name: "independent-workers",
    status: distinct && tokensLongEnough ? "passed" : "blocked",
    detail: distinct && tokensLongEnough
      ? "Both workers have distinct configured IDs, sender IDs, keys and internal tokens."
      : "Configure distinct writer/stage IDs, sender IDs, keys and internal tokens of at least 32 characters.",
  });

  let localValid = false;
  try {
    const publicUrl = new URL(env.PUBLIC_APP_URL || "http://127.0.0.1:5173");
    localValid = Boolean(env.DATABASE_PATH?.trim() && env.DATABASE_PATH !== ":memory:") &&
      (env.API_URL || "http://127.0.0.1:4310") === "http://127.0.0.1:4310" &&
      publicUrl.protocol === "http:" && publicUrl.hostname === "127.0.0.1" &&
      !publicUrl.username && !publicUrl.password && publicUrl.pathname === "/" &&
      !publicUrl.search && !publicUrl.hash && publicUrl.port !== "4310";
  } catch { /* Report only the field requirement, never an invalid value. */ }
  checks.push({
    name: "local-application",
    status: localValid ? "passed" : "blocked",
    detail: localValid
      ? "Durable database and loopback application settings match pnpm dev. Ports, locks and database contents are not inspected."
      : "Use a durable DATABASE_PATH, API_URL=http://127.0.0.1:4310 and a different loopback HTTP port in PUBLIC_APP_URL without credentials or a path.",
  });

  let mappingValid = false;
  try {
    if (env.HUMAN_IDENTITY_FILE) {
      const mapping = IdentitySchema.parse(JSON.parse(readFileSync(resolve(input.root, env.HUMAN_IDENTITY_FILE), "utf8")));
      mappingValid = mapping.roomId === env.SWITCH_ROOM_ID &&
        ![env.WRITER_SWITCH_SENDER, env.STAGE_SWITCH_SENDER].includes(mapping.participantId);
    }
  } catch { /* Mapping contents and parser errors may contain private identifiers. */ }
  checks.push({
    name: "saved-human-mapping",
    status: mappingValid ? "passed" : "blocked",
    detail: mappingValid
      ? "Saved mapping is structurally valid, matches the configured room and differs from the workers. This does not reverify live account linkage or human presence."
      : "Review HUMAN_IDENTITY_FILE: it must be readable, match SWITCH_ROOM_ID and identify a performer distinct from both agents. Follow the documented account audit; do not overwrite a verified file.",
  });

  let bridgeUrl: URL | null = null;
  try {
    const base = new URL(`${env.SWITCH_BASE_URL?.replace(/\/$/, "")}/`);
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname);
    if ((base.protocol === "https:" || (base.protocol === "http:" && loopback)) &&
      !base.username && !base.password && !base.search && !base.hash) bridgeUrl = base;
  } catch { /* Never echo malformed URLs, which can contain credentials. */ }
  if (!bridgeUrl) {
    checks.push({ name: "switch-health", status: "blocked", detail: "Set SWITCH_BASE_URL to the agent bridge URL: HTTPS remotely, or HTTP on loopback, without credentials/query/fragment. No request was sent." });
  } else if (input.offline) {
    checks.push({ name: "switch-health", status: "not-checked", detail: "Skipped by --offline. No network request was sent; runtime availability remains unknown." });
  } else {
    try {
      const response = await input.fetch(new URL("health", bridgeUrl), {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(5000),
      });
      const healthy = response.ok;
      await response.body?.cancel();
      checks.push({ name: "switch-health", status: healthy ? "passed" : "blocked", detail: healthy
        ? "Bridge health returned success. This is not authenticated protocol, room, account or worker verification; run pnpm verify:switch next."
        : `Bridge health returned HTTP ${response.status}. Check the agent bridge address and its existing runtime; this command does not start or resume it.` });
    } catch {
      checks.push({ name: "switch-health", status: "blocked", detail: "Bridge health is unreachable or timed out. Check the configured local tunnel/runtime. A stopped cloud sandbox requires separate authorization before resume; this command never resumes it." });
    }
  }
  return {
    mode: "read-only-preflight",
    result: checks.some((check) => check.status === "blocked") ? "blocked"
      : input.offline ? "configuration-checks-passed" : "preflight-checks-passed",
    missingVariables,
    checks,
    manualGates: [
      "Confirm authorization and budget for any cloud resume and model usage; configuration is not spending permission.",
      "With workers stopped, run pnpm verify:switch --connect to check authenticated transport and current room operations.",
      "Re-audit account mapping after relinking, bridge changes or database restoration; a saved file is historical evidence.",
      "Complete genuine Mattermost instruction → writer → stage engineer → exact approval, open both delivered artifacts, and record a genuine physical rehearsal.",
    ],
  };
}

async function main(): Promise<void> {
  if (process.argv.slice(2).some((argument) => argument !== "--offline")) {
    console.error("Use pnpm readiness [--offline]. This command never starts services, calls models or claims a Switch connection.");
    process.exitCode = 2;
    return;
  }
  const envPath = resolve(projectRoot, ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const report = await checkReadiness({ env: process.env, root: projectRoot, offline: process.argv.includes("--offline"), fetch });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.result === "blocked" ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("Readiness check failed. Check the private root .env and local files; no configuration values were logged.");
    process.exitCode = 1;
  });
}
