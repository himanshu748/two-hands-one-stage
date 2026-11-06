import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
it("prepares distinct private local credentials without printing or replacing them", () => {
  const cwd = mkdtempSync(join(tmpdir(), "two-hands-local-setup-"));
  directories.push(cwd);
  const run = () =>
    spawnSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        resolve("scripts/local-switch.ts"),
        "prepare",
      ],
      { cwd, encoding: "utf8", timeout: 10_000 },
    );
  const first = run();
  expect(first.status).toBe(0);
  const path = join(cwd, "work/local-switch/.env");
  const text = readFileSync(path, "utf8");
  const values = Object.fromEntries(
    text
      .trim()
      .split("\n")
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
  const secrets = [
    "DB_PASSWORD",
    "DB_OWNER_PASSWORD",
    "AGENT_REGISTRATION_TOKEN",
    "GATEWAY_ADMIN_PASSWORD",
    "MATTERMOST_ADMIN_PASSWORD",
    "MATTERMOST_USER_PASSWORD",
  ].map((key) => values[key]!);
  expect(new Set(secrets).size).toBe(secrets.length);
  for (const secret of secrets) {
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(first.stdout + first.stderr).not.toContain(secret);
  }
  expect(statSync(path).mode & 0o777).toBe(0o600);
  expect(values.SWITCH_BIND_ADDR).toBe("127.0.0.1");
  expect(values.TELEMETRY_ENABLED).toBe("false");
  const retained = text + "# Operator note retained\n";
  writeFileSync(path, retained);
  const second = run();
  expect(second.status).toBe(0);
  expect(second.stdout).toContain("preserved");
  expect(readFileSync(path, "utf8")).toBe(retained);
});
