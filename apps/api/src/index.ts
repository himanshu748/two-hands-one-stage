import {
  existsSync,
  openSync,
  closeSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { createServer } from "./server.js";
const env = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);
let lockPath: string | undefined;
const release = () => {
  if (lockPath) {
    try {
      unlinkSync(lockPath);
    } catch {
      /* Preserve original shutdown result. */
    }
    lockPath = undefined;
  }
};
try {
  const { service, tokens } = loadConfig();
  if (existsSync(service.databasePath + ".reset-lock"))
    throw new Error("Demo reset is active; finish it before starting API");
  mkdirSync(dirname(service.databasePath), { recursive: true });
  const path = service.databasePath + ".api-lock";
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch {
    throw new Error(
      "API database lock exists. Stop the owner; after a crash, inspect its PID before removing a stale .api-lock.",
    );
  }
  lockPath = path;
  if (existsSync(service.databasePath + ".reset-lock")) {
    closeSync(fd);
    throw new Error(
      "Reset started during API startup; finish it before restarting",
    );
  }
  writeFileSync(
    fd,
    JSON.stringify({ pid: process.pid, databasePath: service.databasePath }),
  );
  closeSync(fd);
  const app = createServer(new Store(service), tokens);
  await app.listen({ host: "127.0.0.1", port: 4310 });
  if (!service.identity)
    console.info(
      "Human identity mapping absent: approvals and human instructions are disabled.",
    );
  for (const s of ["SIGINT", "SIGTERM"])
    process.once(s, () => {
      void app.close().then(() => {
        release();
        process.exit(0);
      });
    });
  process.once("exit", release);
} catch (error) {
  release();
  console.error(error instanceof Error ? error.message : "API startup failed");
  process.exitCode = 1;
}
