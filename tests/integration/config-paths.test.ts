import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("uses the same database and reviewed identity paths from root and API workspace", () => {
  const root = resolve(".");
  const directory = mkdtempSync(join(tmpdir(), "two-hands-synthetic-config-"));
  try {
    const identity = join(directory, "identity.json");
    writeFileSync(identity, JSON.stringify({
      roomId: "synthetic-room", bridgeId: "synthetic-bridge", participantId: "synthetic-human",
      mattermostUserId: "synthetic-account", mattermostChannelId: "synthetic-channel",
      verifiedAt: new Date().toISOString(), evidence: "Synthetic configuration-path test only; not a live human mapping.",
    }));
    const env = {
      DATABASE_PATH: "work/synthetic-path-check.sqlite",
      HUMAN_IDENTITY_FILE: relative(root, identity),
      WRITER_INTERNAL_TOKEN: "synthetic-writer-token-000000000000000000",
      STAGE_INTERNAL_TOKEN: "synthetic-stage-token-000000000000000000",
      SWITCH_ROOM_ID: "synthetic-room", WRITER_SWITCH_SENDER: "synthetic-writer", STAGE_SWITCH_SENDER: "synthetic-stage",
    };
    const module = pathToFileURL(join(root, "apps/api/src/config.ts")).href;
    const code = `import {loadConfig} from ${JSON.stringify(module)}; const {service}=loadConfig(${JSON.stringify(env)}); console.log(JSON.stringify({databasePath:service.databasePath, participant:service.identity.participantId}));`;
    for (const cwd of [root, join(root, "apps/api")]) {
      const result = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), "--input-type=module", "-e", code], { cwd, encoding: "utf8", timeout: 10_000 });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ databasePath: join(root, env.DATABASE_PATH), participant: "synthetic-human" });
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
