import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { checkReadiness } from "../../scripts/readiness.js";

let root: string;
let env: NodeJS.ProcessEnv;
const mapping = {
  roomId: "synthetic-room", bridgeId: "synthetic-bridge", participantId: "synthetic-performer",
  mattermostUserId: "synthetic-user", mattermostChannelId: "synthetic-channel",
  verifiedAt: "2026-11-04T00:00:00Z", evidence: "Synthetic mapping fixture, not a human audit.",
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "two-hands-readiness-"));
  env = {
    DATABASE_PATH: "work/synthetic.sqlite", HUMAN_IDENTITY_FILE: "mapping.json",
    SWITCH_BASE_URL: "http://127.0.0.1:18000", SWITCH_ROOM_ID: mapping.roomId,
    WRITER_SWITCH_AGENT_ID: "synthetic-writer", WRITER_SWITCH_API_KEY: "synthetic-writer-key",
    WRITER_SWITCH_SENDER: "synthetic-writer-sender", STAGE_SWITCH_AGENT_ID: "synthetic-stage",
    STAGE_SWITCH_API_KEY: "synthetic-stage-key", STAGE_SWITCH_SENDER: "synthetic-stage-sender",
    WRITER_INTERNAL_TOKEN: "synthetic-writer-token-for-testing-only",
    STAGE_INTERNAL_TOKEN: "synthetic-stage-token-for-testing-only",
    OPENAI_API_KEY: "synthetic-model-placeholder", OPENAI_MODEL: "synthetic-model",
  };
  writeFileSync(join(root, "mapping.json"), JSON.stringify(mapping));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it("reports independent blockers together without disclosing configured values", async () => {
  delete env.OPENAI_API_KEY;
  delete env.OPENAI_MODEL;
  const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("synthetic-writer-key private transport detail"));
  const report = await checkReadiness({ env, root, offline: false, fetch });
  expect(report.result).toBe("blocked");
  expect(report.missingVariables).toEqual(["OPENAI_API_KEY", "OPENAI_MODEL"]);
  expect(report.checks.find((check) => check.name === "switch-health")?.status).toBe("blocked");
  expect(JSON.stringify(report)).not.toContain("synthetic-");
  expect(JSON.stringify(report)).not.toContain("private transport detail");
});

it("makes only an unauthenticated bounded health request and preserves manual gates", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("ok"));
  const report = await checkReadiness({ env, root, offline: false, fetch });
  expect(report.result).toBe("preflight-checks-passed");
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0]!;
  expect(String(url)).toBe("http://127.0.0.1:18000/health");
  expect(init?.method).toBe("GET");
  expect(init?.redirect).toBe("error");
  expect(init?.headers).toBeUndefined();
  expect(init?.signal).toBeInstanceOf(AbortSignal);
  expect(report.manualGates.join(" ")).toContain("genuine physical rehearsal");
  expect(report.checks.find((check) => check.name === "saved-human-mapping")?.detail).toContain("does not reverify");
});

it("checks offline configuration without making a network request", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const report = await checkReadiness({ env, root, offline: true, fetch });
  expect(fetch).not.toHaveBeenCalled();
  expect(report.result).toBe("configuration-checks-passed");
  expect(report.checks.find((check) => check.name === "switch-health")?.status).toBe("not-checked");
});

it.each([
  { ...mapping, roomId: "another-room" },
  { ...mapping, participantId: "synthetic-writer-sender" },
  { evidence: "invalid mapping" },
])("rejects unusable mapping without logging its contents", async (candidate) => {
  writeFileSync(join(root, "mapping.json"), JSON.stringify(candidate));
  const report = await checkReadiness({ env, root, offline: true, fetch: vi.fn() });
  expect(report.result).toBe("blocked");
  expect(report.checks.find((check) => check.name === "saved-human-mapping")?.status).toBe("blocked");
  expect(JSON.stringify(report)).not.toContain("synthetic-");
});

it("rejects shared worker identities and short internal tokens", async () => {
  env.STAGE_SWITCH_SENDER = env.WRITER_SWITCH_SENDER;
  env.STAGE_INTERNAL_TOKEN = "short";
  const report = await checkReadiness({ env, root, offline: true, fetch: vi.fn() });
  expect(report.checks.find((check) => check.name === "independent-workers")?.status).toBe("blocked");
});

it.each([
  "https://user:private-secret@example.invalid/",
  "http://example.invalid/",
  "https://example.invalid/?credential=private-secret",
  "not a URL containing private-secret",
])("refuses invalid bridge addresses without sending them or echoing their values", async (url) => {
  env.SWITCH_BASE_URL = url;
  const fetch = vi.fn<typeof globalThis.fetch>();
  const report = await checkReadiness({ env, root, offline: false, fetch });
  expect(fetch).not.toHaveBeenCalled();
  expect(report.result).toBe("blocked");
  expect(JSON.stringify(report)).not.toContain("private-secret");
});

it("reports non-success health without consuming or printing its response body", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("private body", { status: 503 }));
  const report = await checkReadiness({ env, root, offline: false, fetch });
  expect(report.result).toBe("blocked");
  expect(JSON.stringify(report)).toContain("HTTP 503");
  expect(JSON.stringify(report)).not.toContain("private body");
});

it("checks the dev process's durable database and local URL requirements", async () => {
  env.DATABASE_PATH = ":memory:";
  env.PUBLIC_APP_URL = "http://127.0.0.1:4310";
  const report = await checkReadiness({ env, root, offline: true, fetch: vi.fn() });
  expect(report.checks.find((check) => check.name === "local-application")?.status).toBe("blocked");
});

it("checks explicit Modal configuration without needing an OpenAI key or calling inference", async () => {
  delete env.OPENAI_API_KEY;
  delete env.OPENAI_MODEL;
  env.MODEL_PROVIDER = "modal";
  env.MODAL_BASE_URL = "https://synthetic-two-hands.us-west.modal.direct/v1";
  env.MODAL_MODEL = "synthetic-model";
  env.MODAL_PROXY_TOKEN = "wk-synthetic.ws-synthetic";
  const fetch = vi.fn<typeof globalThis.fetch>();
  const report = await checkReadiness({ env, root, offline: true, fetch });
  expect(report.result).toBe("configuration-checks-passed");
  expect(report.missingVariables).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.stringify(report)).not.toContain("wk-synthetic");
  expect(JSON.stringify(report)).not.toContain("synthetic-two-hands");
});

it("reports only the selected backend's missing variables", async () => {
  env.MODEL_PROVIDER = "modal";
  const report = await checkReadiness({ env, root, offline: true, fetch: vi.fn() });
  expect(new Set(report.missingVariables)).toEqual(new Set(["MODAL_BASE_URL", "MODAL_MODEL", "MODAL_PROXY_TOKEN"]));
  expect(report.result).toBe("blocked");
});

it.each(["unknown", "modal"])("blocks invalid backend configuration without echoing secret values: %s", async (provider) => {
  env.MODEL_PROVIDER = provider;
  env.MODAL_BASE_URL = "https://private-secret@example.invalid/v1";
  env.MODAL_MODEL = "synthetic-model";
  env.MODAL_PROXY_TOKEN = "private-secret";
  const report = await checkReadiness({ env, root, offline: true, fetch: vi.fn() });
  expect(report.result).toBe("blocked");
  expect(report.checks.find((check) => check.name === "model-configuration")?.status).toBe("blocked");
  expect(JSON.stringify(report)).not.toContain("private-secret");
});
