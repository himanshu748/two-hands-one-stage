import { existsSync } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { resolve, dirname, basename, sep, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
async function portOpen(): Promise<boolean> {
  return new Promise<boolean>((resolvePort) => {
    const socket = createConnection({ host: "127.0.0.1", port: 4310 });
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolvePort(value);
    };
    socket.setTimeout(1000, () => finish(true));
    socket.once("connect", () => finish(true));
    socket.once("error", (error: NodeJS.ErrnoException) =>
      finish(error.code !== "ECONNREFUSED"),
    );
  });
}
async function main(): Promise<void> {
  process.chdir(root);
  if (existsSync(resolve(root, ".env")))
    process.loadEnvFile(resolve(root, ".env"));
  const database = process.env.DATABASE_PATH;
  const disposable = process.env.DISPOSABLE_DEMO_DATABASE_PATH;
  if (!database || !disposable)
    throw new Error(
      "Set both DATABASE_PATH and DISPOSABLE_DEMO_DATABASE_PATH to the same disposable work/.../demo.sqlite file. Nothing was changed.",
    );
  const path = resolve(root, database);
  const work = resolve(root, "work");
  if (
    path !== resolve(root, disposable) ||
    basename(path) !== "demo.sqlite" ||
    !path.startsWith(`${work}${sep}`)
  )
    throw new Error(
      "Reset is restricted to matching DATABASE_PATH and DISPOSABLE_DEMO_DATABASE_PATH inside this workspace’s work directory, named demo.sqlite. Nothing was changed.",
    );
  if (existsSync(`${path}.dev-lock`) || existsSync(`${path}.api-lock`))
    throw new Error(
      "An API or dev process lock exists. Stop pnpm dev first; inspect stale lock ownership after a crash. Nothing was changed.",
    );
  if (await portOpen())
    throw new Error(
      "Port 4310 is active or could not be checked safely. Stop the local API before resetting the demo. Nothing was changed.",
    );
  if (!existsSync(path)) {
    console.log(
      "[reset] No configured disposable demo database exists. Nothing to reset.",
    );
    return;
  }
  const parent = await realpath(dirname(path));
  if (parent !== dirname(path))
    throw new Error(
      "Reset refuses paths with symlinked parent directories. Nothing was changed.",
    );
  const sources = [
    path,
    `${path}-wal`,
    `${path}-shm`,
    `${path}-journal`,
  ].filter((file) => existsSync(file));
  for (const source of sources) {
    const stat = await lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw new Error(
        "Reset refuses symlinks, hard links, and non-regular database files. Nothing was changed.",
      );
  }
  const lockPath = `${path}.reset-lock`;
  const lock = await open(lockPath, "wx", 0o600).catch(() => {
    throw new Error(
      "A reset lock already exists. Finish or investigate the previous reset before trying again.",
    );
  });
  const backup = join(
    work,
    "demo-backups",
    `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`,
  );
  const moved: { source: string; destination: string }[] = [];
  try {
    await lock.writeFile(
      JSON.stringify({ pid: process.pid, database: path, backup }),
    );
    await lock.close();
    // Check once more after obtaining the reset guard. Never operate on a running normal dev session.
    if (
      existsSync(`${path}.dev-lock`) ||
      existsSync(`${path}.api-lock`) ||
      (await portOpen())
    )
      throw new Error(
        "The application started during reset preflight. Nothing was moved.",
      );
    await mkdir(backup, { recursive: true, mode: 0o700 });
    for (const source of sources) {
      const destination = join(backup, basename(source));
      await rename(source, destination);
      moved.push({ source, destination });
    }
    console.log(
      `[reset] Archived the explicitly configured disposable database and ${sources.length - 1} sidecar(s).`,
    );
    console.log(`[reset] Reversible backup: ${backup}`);
    console.log(
      "[reset] No Switch room messages, credentials, exported HTML, or other database was changed. Restart pnpm dev to create a fresh database.",
    );
  } catch (error) {
    for (const item of moved.reverse())
      await rename(item.destination, item.source);
    throw error;
  } finally {
    await lock.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
  }
}
try {
  await main();
} catch (error) {
  console.error(
    `[reset] ${error instanceof Error ? error.message : "Reset failed. Inspect the configured demo database and backup directory."}`,
  );
  process.exitCode = 1;
}
