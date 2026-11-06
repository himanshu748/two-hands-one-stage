import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { readFile, open, mkdir, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { loadWorkerConfig } from "../packages/agent-runtime/src/worker.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const identitySchema = z
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
const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms));

async function assertFreePort(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolvePort, reject) => {
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is already in use. Stop the existing service before starting pnpm dev.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () =>
      server.close((error) => (error ? reject(error) : resolvePort())),
    );
  });
}

async function main(): Promise<void> {
  process.chdir(root);
  if (existsSync(resolve(root, ".env")))
    process.loadEnvFile(resolve(root, ".env"));
  const required = ["DATABASE_PATH", "HUMAN_IDENTITY_FILE"];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length)
    throw new Error(
      `Missing configuration: ${missing.join(", ")}. Copy .env.example to .env and complete the documented setup. pnpm dev never starts synthetic mode.`,
    );
  const writer = loadWorkerConfig("writer");
  const stage = loadWorkerConfig("stage");
  if (
    writer.agentId === stage.agentId ||
    writer.ownSender === stage.ownSender ||
    writer.agentKey === stage.agentKey ||
    writer.internalToken === stage.internalToken
  ) {
    throw new Error(
      "Writer and stage workers require distinct agent IDs, opaque senders, Switch API keys, and internal tokens.",
    );
  }
  if (
    writer.apiUrl !== "http://127.0.0.1:4310" ||
    stage.apiUrl !== writer.apiUrl
  )
    throw new Error(
      "This bounded local MVP uses API_URL=http://127.0.0.1:4310.",
    );
  let identity: z.infer<typeof identitySchema>;
  try {
    identity = identitySchema.parse(
      JSON.parse(
        await readFile(resolve(root, process.env.HUMAN_IDENTITY_FILE!), "utf8"),
      ),
    );
  } catch {
    throw new Error(
      "HUMAN_IDENTITY_FILE must name a readable, reviewed mapping JSON file. See docs/switch-compatibility.md; a display name or shared bot is insufficient.",
    );
  }
  if (
    identity.roomId !== writer.roomId ||
    [writer.ownSender, stage.ownSender].includes(identity.participantId)
  )
    throw new Error(
      "The reviewed human identity must match SWITCH_ROOM_ID and differ from both agent participants.",
    );
  const databasePath = resolve(root, process.env.DATABASE_PATH!);
  if (process.env.DATABASE_PATH === ":memory:")
    throw new Error("pnpm dev requires a durable DATABASE_PATH, not :memory:.");
  const publicUrl = new URL(
    process.env.PUBLIC_APP_URL || "http://127.0.0.1:5173",
  );
  if (
    publicUrl.protocol !== "http:" ||
    publicUrl.hostname !== "127.0.0.1" ||
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.pathname !== "/" ||
    publicUrl.search ||
    publicUrl.hash
  )
    throw new Error(
      "Local pnpm dev requires PUBLIC_APP_URL=http://127.0.0.1:<port> with no path or credentials.",
    );
  const webPort = Number(publicUrl.port || 80);
  if (webPort === 4310)
    throw new Error("PUBLIC_APP_URL must use a different port from API_URL.");
  await assertFreePort(4310);
  await assertFreePort(webPort);
  await mkdir(dirname(databasePath), { recursive: true });
  const lockPath = `${databasePath}.dev-lock`;
  if (existsSync(`${databasePath}.reset-lock`))
    throw new Error(
      "A demo reset is in progress. Wait for it to finish before starting dev.",
    );
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch {
    throw new Error(
      "The dev process lock already exists. Stop the previous session. If it crashed, inspect the PID in the .dev-lock file before removing that stale lock.",
    );
  }
  await lock.writeFile(
    JSON.stringify({
      pid: process.pid,
      databasePath,
      startedAt: new Date().toISOString(),
    }),
  );
  await lock.close();
  if (existsSync(`${databasePath}.reset-lock`)) {
    await unlink(lockPath);
    throw new Error(
      "A demo reset started during preflight. Wait for it to finish before starting dev.",
    );
  }

  const children: ChildProcess[] = [];
  let stopping = false;
  let cleanupPromise: Promise<void> | null = null;
  const secrets = [
    writer.internalToken,
    stage.internalToken,
    writer.agentKey,
    stage.agentKey,
    writer.modelKey,
    process.env.SWITCH_REGISTRATION_TOKEN ?? "",
  ].filter(Boolean);
  const redact = (line: string) =>
    secrets.reduce(
      (value, secret) => value.split(secret).join("[REDACTED]"),
      line,
    );
  const stop = (code: number): Promise<void> => {
    if (cleanupPromise) return cleanupPromise;
    stopping = true;
    process.exitCode = code;
    cleanupPromise = (async () => {
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGTERM");
      const deadline = Date.now() + 5000;
      while (
        children.some(
          (child) => child.exitCode === null && child.signalCode === null,
        ) &&
        Date.now() < deadline
      )
        await sleep(50);
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
      await unlink(lockPath).catch(() => undefined);
      console.log(
        "[dev] All application processes stopped. Durable database retained.",
      );
    })();
    return cleanupPromise;
  };
  const launch = (
    name: string,
    entry: string,
    args: string[] = [],
    cwd = root,
  ): ChildProcess => {
    const child = spawn(process.execPath, ["--import", "tsx", entry, ...args], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    for (const stream of [child.stdout, child.stderr])
      if (stream)
        createInterface({ input: stream }).on("line", (line: string) =>
          console.log(`[${name}] ${redact(line)}`),
        );
    child.once("error", () => {
      console.error(
        `[dev] ${name} could not start. Check installed workspace dependencies.`,
      );
      void stop(1);
    });
    child.once("exit", (code, signal) => {
      if (!stopping) {
        console.error(
          `[dev] ${name} exited (${signal ?? code ?? "unknown"}). Stopping the other application processes.`,
        );
        void stop(code && code > 0 ? code : 1);
      }
    });
    return child;
  };
  const onSignal = () => {
    void stop(0);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    console.log(
      "[dev] Starting local API, rehearsal workbench, playwright, and stage engineer. No fixture fallback.",
    );
    launch("api", resolve(root, "apps/api/src/index.ts"));
    let healthy = false;
    for (let attempt = 0; attempt < 100 && !stopping; attempt += 1) {
      try {
        const response = await fetch("http://127.0.0.1:4310/health", {
          signal: AbortSignal.timeout(500),
          redirect: "error",
        });
        if (response.ok) {
          healthy = true;
          break;
        }
      } catch {
        /* API startup may still be running. */
      }
      await sleep(100);
    }
    if (stopping) {
      await stop(typeof process.exitCode === "number" ? process.exitCode : 0);
      return;
    }
    if (!healthy)
      throw new Error(
        "The API did not become healthy at http://127.0.0.1:4310/health. Inspect the API log above.",
      );
    const webRequire = createRequire(resolve(root, "apps/web/package.json"));
    const viteEntry = resolve(
      dirname(webRequire.resolve("vite/package.json")),
      "bin/vite.js",
    );
    launch(
      "web",
      viteEntry,
      ["--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
      resolve(root, "apps/web"),
    );
    launch("writer", resolve(root, "apps/writer-agent/src/index.ts"));
    launch("stage", resolve(root, "apps/stage-agent/src/index.ts"));
    console.log(
      `[dev] Workbench: ${publicUrl.origin} — send instructions and exact approvals in the linked Mattermost channel. Ctrl+C stops all four processes.`,
    );
  } catch (error) {
    await stop(1);
    throw error;
  }
}

try {
  await main();
} catch (error) {
  console.error(
    `[dev] ${error instanceof Error ? error.message : "Startup failed. Check .env.example."}`,
  );
  process.exitCode = 1;
}
