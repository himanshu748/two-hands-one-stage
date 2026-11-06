import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { ServiceConfig } from "./types.js";
// Root .env paths must mean the same thing under pnpm dev and pnpm --filter api dev.
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const IdentitySchema = z
  .object({
    roomId: z.string().min(1),
    bridgeId: z.string().min(1),
    participantId: z.string().min(1),
    mattermostUserId: z.string().min(1),
    mattermostChannelId: z.string().min(1),
    verifiedAt: z.string().datetime(),
    evidence: z.string().min(20),
  })
  .strict();
export function loadConfig(env: NodeJS.ProcessEnv = process.env): {
  service: ServiceConfig;
  tokens: { writer: string; stage: string };
} {
  const required = [
    "DATABASE_PATH",
    "WRITER_INTERNAL_TOKEN",
    "STAGE_INTERNAL_TOKEN",
  ];
  const missing = required.filter((k) => !env[k]?.trim());
  if (missing.length)
    throw new Error(
      "Missing API configuration: " +
        missing.join(", ") +
        ". Copy .env.example; no fixture fallback.",
    );
  const writer = env.WRITER_INTERNAL_TOKEN!,
    stage = env.STAGE_INTERNAL_TOKEN!;
  if (writer.length < 32 || stage.length < 32 || writer === stage)
    throw new Error(
      "Use distinct internal tokens of at least 32 random characters",
    );
  let identity = null;
  if (env.HUMAN_IDENTITY_FILE) {
    try {
      identity = IdentitySchema.parse(
        JSON.parse(readFileSync(resolve(projectRoot, env.HUMAN_IDENTITY_FILE), "utf8")),
      );
    } catch {
      throw new Error(
        "HUMAN_IDENTITY_FILE must contain the reviewed exact mapping described in docs/switch-compatibility.md",
      );
    }
  }
  const publicUrl = env.PUBLIC_APP_URL || "http://127.0.0.1:5173";
  const u = new URL(publicUrl);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/"
  )
    throw new Error(
      "PUBLIC_APP_URL must be an HTTP(S) origin without credentials/path",
    );
  if (
    identity &&
    (!env.SWITCH_ROOM_ID ||
      identity.roomId !== env.SWITCH_ROOM_ID ||
      !env.WRITER_SWITCH_SENDER ||
      !env.STAGE_SWITCH_SENDER ||
      new Set([
        identity.participantId,
        env.WRITER_SWITCH_SENDER,
        env.STAGE_SWITCH_SENDER,
      ]).size !== 3)
  )
    throw new Error(
      "Reviewed human room and distinct human/writer/stage participant mappings are required",
    );
  return {
    tokens: { writer, stage },
    service: {
      databasePath: resolve(projectRoot, env.DATABASE_PATH!),
      roomId: env.SWITCH_ROOM_ID ?? "unconfigured",
      writerName: env.WRITER_SWITCH_NAME ?? "two-hands-writer",
      stageName: env.STAGE_SWITCH_NAME ?? "two-hands-stage",
      writerParticipantId: env.WRITER_SWITCH_SENDER ?? "unconfigured-writer",
      stageParticipantId: env.STAGE_SWITCH_SENDER ?? "unconfigured-stage",
      identity,
      publicUrl,
    },
  };
}
