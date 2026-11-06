import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  statfsSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function main() {
  const action = process.argv[2] ?? "status";
  const supported = ["check", "prepare", "pull", "up", "status", "stop"];
  if (!supported.includes(action))
    throw new Error(`Use pnpm switch:local ${supported.join("|")}`);
  const directory = resolve("work/local-switch");
  const envFile = resolve(directory, ".env");
  const context = process.env.TWO_HANDS_DOCKER_CONTEXT || "colima-two-hands";
  const secret = () => randomBytes(24).toString("hex");
  if (action === "check" || action === "pull" || action === "up") {
    const fs = statfsSync(process.cwd());
    const free = fs.bavail * fs.bsize;
    // Conservative local-install reserve: compressed layers, extraction, VM and databases coexist.
    const minimum = (action === "up" ? 2 : 12) * 1024 ** 3;
    if (free < minimum)
      throw new Error(
        `Local Switch ${action} blocked: ${(free / 1024 ** 3).toFixed(1)} GiB free; keep at least ${minimum / 1024 ** 3} GiB available. The earlier 6.2 GiB attempt exhausted the host during extraction. Free host space before retrying and check Docker storage capacity; this command never removes unrelated files.`,
      );
    if (action === "check") {
      console.log(
        "Host disk reserve passed. Verify Docker storage also has sufficient space; run prepare, start Docker, then pull/up.",
      );
      return;
    }
  }
  if (action === "prepare") {
    mkdirSync(directory, { recursive: true });
    if (existsSync(envFile))
      console.log(
        "Existing work/local-switch/.env preserved. No credentials were replaced.",
      );
    else {
      const values: Record<string, string> = {
        SWITCH_REGISTRY: "ghcr.io",
        SWITCH_IMAGE_NAMESPACE: "sandbox-quantum",
        SWITCH_VERSION: "0.31.0",
        SWITCH_BIND_ADDR: "127.0.0.1",
        GATEWAY_HOST_PORT: "13000",
        API_HOST_PORT: "18000",
        MATTERMOST_HOST_PORT: "18065",
        POSTGRES_HOST_PORT: "15432",
        DB_USER: "switch_app",
        DB_OWNER_USER: "postgres",
        DB_NAME: "switch",
        DB_PASSWORD: secret(),
        DB_OWNER_PASSWORD: secret(),
        AGENT_REGISTRATION_TOKEN: secret(),
        SECRET_KEYS: `twohands:${randomBytes(32).toString("hex")}`,
        GATEWAY_ADMIN_EMAIL: "performer@two-hands.local",
        GATEWAY_ADMIN_PASSWORD: secret(),
        MATTERMOST_ADMIN_USER: "admin",
        MATTERMOST_ADMIN_PASSWORD: secret(),
        MATTERMOST_TEAM_NAME: "two-hands",
        MATTERMOST_USER: "performer",
        MATTERMOST_USER_PASSWORD: secret(),
        FRONTEND_BASE_URL: "http://127.0.0.1:13000",
        GATEWAY_PUBLIC_URL: "http://127.0.0.1:18000",
        TELEMETRY_ENABLED: "false",
        THIRD_PARTY_AVATARS_ENABLED: "false",
        TELEMETRY_ENVIRONMENT: "local",
      };
      writeFileSync(
        envFile,
        Object.entries(values)
          .map(([key, value]) => `${key}=${value}\n`)
          .join(""),
        { flag: "wx", mode: 0o600 },
      );
      chmodSync(envFile, 0o600);
      console.log(
        "Created private work/local-switch/.env (0600). Open it locally for sign-in details; do not paste its contents into chat.",
      );
    }
    console.log(
      "Next: pnpm switch:local check. Then follow docs/local-switch.md to start Docker and pull/up.",
    );
    return;
  }
  if (!existsSync(envFile))
    throw new Error(
      "Run pnpm switch:local prepare first. Startup does not generate or replace credentials.",
    );
  const env = { ...process.env, DOCKER_CONTEXT: context };
  const docker = spawnSync(
    "docker",
    ["version", "--format", "{{.Server.Version}}"],
    { env, encoding: "utf8", timeout: 10_000 },
  );
  if (docker.status !== 0)
    throw new Error(
      `Docker context ${context} is unavailable. Start its runtime after the disk check. See docs/local-switch.md. No other Docker context is changed.`,
    );
  const plugin = spawnSync("docker", ["compose", "version"], {
    env,
    stdio: "ignore",
    timeout: 10_000,
  });
  const command = plugin.status === 0 ? "docker" : "docker-compose";
  if (
    plugin.status !== 0 &&
    spawnSync(command, ["version"], { env, stdio: "ignore", timeout: 10_000 })
      .status !== 0
  )
    throw new Error(
      "Docker Compose is required: install its official plugin or the docker-compose CLI.",
    );
  const operations: Record<string, string[]> = {
    pull: ["pull"],
    up: ["up", "-d", "--pull", "never"],
    status: ["ps", "--all"],
    stop: ["stop"],
  };
  const args = [
    ...(command === "docker" ? ["compose"] : []),
    "--env-file",
    envFile,
    "-f",
    resolve("deploy/switch/compose.yaml"),
    "-f",
    resolve("deploy/switch/override.yaml"),
    "--project-name",
    "two-hands-switch",
    "--profile",
    "collab",
    "--profile",
    "gateway",
    ...operations[action]!,
  ];
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
  if (result.status === 0 && action === "up")
    console.log(
      "Containers started; readiness and identity are not yet verified. Gateway: http://127.0.0.1:13000 · Mattermost: http://127.0.0.1:18065. Complete docs/local-switch.md.",
    );
}
try {
  main();
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Local Switch setup failed. See docs/local-switch.md.",
  );
  process.exitCode = 1;
}
