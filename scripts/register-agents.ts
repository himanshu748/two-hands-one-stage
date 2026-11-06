import { existsSync } from "node:fs";
import { open, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

if (existsSync(".env")) process.loadEnvFile(".env");

const names = ["SWITCH_BASE_URL", "SWITCH_REGISTRATION_TOKEN"] as const;
const missing = names.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(
    `Registration blocked: set ${missing.join(", ")} in your local environment. Create a registration key in Switch Gateway; do not use an agent API key.`,
  );
  process.exitCode = 1;
} else {
  const path = resolve("work/switch-registration.env");
  try {
    try {
      await access(path);
      throw new Error(
        "Registration output already exists. Reuse its identities; do not re-register or overwrite keys.",
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      )
        throw error;
    }
    const base = new URL(`${process.env.SWITCH_BASE_URL!.replace(/\/$/, "")}/`);
    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !["https:", "http:"].includes(base.protocol)
    )
      throw new Error("Invalid SWITCH_BASE_URL");
    if (
      base.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
    )
      throw new Error("Remote registration requires HTTPS");
    await mkdir(dirname(path), { recursive: true });
    const file = await open(path, "wx", 0o600);
    try {
      await file.write(
        "# Private Switch agent credentials. Copy into .env; never commit this file.\n",
      );
      for (const role of ["WRITER", "STAGE"] as const) {
        const name = role === "WRITER" ? "two-hands-writer" : "two-hands-stage";
        const response = await fetch(new URL("agents", base), {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
          headers: {
            Authorization: `Bearer ${process.env.SWITCH_REGISTRATION_TOKEN!}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            display_name: role === "WRITER" ? "Playwright" : "Stage engineer",
            description: `Two Hands, One Stage ${role.toLowerCase()} worker`,
            connector_type: "two-hands-typescript",
            integration_profile: {
              connection_model: "session_addressable",
              message_exchange: true,
              pre_invocation_mediation: [],
              post_invocation_mediation: [],
              event_reporting: [],
            },
          }),
        });
        if (!response.ok)
          throw new Error(
            `Registration ${role} returned HTTP ${response.status}; partial credentials were preserved. Do not rerun blindly.`,
          );
        const credentials = z
          .object({ id: z.string().min(1), api_key: z.string().min(1) })
          .parse(await response.json());
        // JSON quoting prevents generated dotenv content from introducing extra assignments.
        await file.write(
          `${role}_SWITCH_AGENT_ID=${JSON.stringify(credentials.id)}\n${role}_SWITCH_API_KEY=${JSON.stringify(credentials.api_key)}\n`,
        );
        await file.sync();
        console.log(
          `${role}: registered; credentials saved with mode 0600 (not printed).`,
        );
      }
    } finally {
      await file.close();
    }
    console.log(
      "Credentials: work/switch-registration.env. Configure owner/peer addressing in Switch Console and invite both agents to the single room. No room or policy was created automatically.",
    );
  } catch (error) {
    // Never serialize provider error bodies or credentials.
    console.error(
      error instanceof Error && !("issues" in error)
        ? error.message
        : "Registration failed: unsupported response. Check runtime compatibility; returned secrets were not logged.",
    );
    process.exitCode = 1;
  }
}
