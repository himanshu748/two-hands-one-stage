import { existsSync } from "node:fs";
import { z } from "zod";
if (existsSync(".env")) process.loadEnvFile(".env");
try {
  const [role, id, decision, ...evidenceParts] = process.argv.slice(2);
  const parsed = z
    .object({
      role: z.enum(["writer", "stage"]),
      id: z.string().min(1).max(2048),
      decision: z.enum(["delivered", "retry"]),
      evidence: z.string().min(20).max(2000),
    })
    .safeParse({ role, id, decision, evidence: evidenceParts.join(" ") });
  if (!parsed.success)
    throw new Error(
      'Usage after checking actual room history: pnpm recover:delivery writer|stage <deliveryId> delivered|retry "Evidence describing the observed message ID or verified absence (20+ characters)"',
    );
  const token = process.env[parsed.data.role.toUpperCase() + "_INTERNAL_TOKEN"];
  if (!token || token.length < 32)
    throw new Error(
      "Missing role INTERNAL_TOKEN; use the local .env and never put credentials in evidence",
    );
  const origin = new URL(process.env.API_URL ?? "http://127.0.0.1:4310");
  if (
    !["127.0.0.1", "localhost"].includes(origin.hostname) ||
    origin.protocol !== "http:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("Recovery requires the local API origin");
  const response = await fetch(
    new URL(
      "/internal/outbox/" + encodeURIComponent(parsed.data.id) + "/reconcile",
      origin,
    ),
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision: parsed.data.decision,
        evidence: parsed.data.evidence,
      }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    },
  );
  if (!response.ok)
    throw new Error(
      "Reconciliation rejected (HTTP " +
        response.status +
        "). Check role, uncertainty status and the three-delivery limit.",
    );
  console.log(
    "Operator reconciliation recorded. Retry, if selected, remains pending until the owning worker reconnects.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Recovery failed");
  process.exitCode = 1;
}
