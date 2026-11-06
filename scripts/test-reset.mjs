import {
  mkdtempSync,
  writeFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
  symlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const dir = mkdtempSync(resolve("work/reset-verification-"));
const path = join(dir, "demo.sqlite");
writeFileSync(
  path,
  "synthetic filesystem-reset fixture; not rehearsal evidence",
);
const run = (extra = {}) =>
  spawnSync(process.execPath, ["--import", "tsx", "scripts/demo-reset.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_PATH: path,
      DISPOSABLE_DEMO_DATABASE_PATH: path,
      ...extra,
    },
    encoding: "utf8",
  });
let result = run({ DISPOSABLE_DEMO_DATABASE_PATH: join(dir, "other.sqlite") });
assert.equal(result.status, 1);
assert(existsSync(path));
writeFileSync(path + ".api-lock", "synthetic active API guard");
result = run();
assert.equal(result.status, 1);
assert(existsSync(path));
unlinkSync(path + ".api-lock");
writeFileSync(path + ".dev-lock", "synthetic active dev guard");
result = run();
assert.equal(result.status, 1);
assert(existsSync(path));
unlinkSync(path + ".dev-lock");
unlinkSync(path);
writeFileSync(join(dir, "source.txt"), "preserve symlink target");
symlinkSync(join(dir, "source.txt"), path);
result = run();
assert.equal(result.status, 1);
assert.equal(
  readFileSync(join(dir, "source.txt"), "utf8"),
  "preserve symlink target",
);
unlinkSync(path);
writeFileSync(path, "synthetic reset fixture");
writeFileSync(path + "-wal", "synthetic sidecar");
result = run();
assert.equal(result.status, 0, result.stderr);
assert(!existsSync(path));
assert(!existsSync(path + "-wal"));
const backup = result.stdout.match(/Reversible backup: (.+)/)?.[1];
assert(backup);
assert.equal(
  readFileSync(join(backup, "demo.sqlite"), "utf8"),
  "synthetic reset fixture",
);
assert.equal(
  readFileSync(join(backup, "demo.sqlite-wal"), "utf8"),
  "synthetic sidecar",
);
assert(!existsSync(path + ".reset-lock"));
console.log(
  "Reset filesystem verification passed: mismatched path, API lock, dev lock, symlink refused; exact disposable file and sidecar archived with content preserved. Synthetic filesystem fixtures only.",
);
