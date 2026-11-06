import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  SwitchClient,
  sanitizedEnvelope,
  type ConnectionState,
} from "@two-hands/switch-client";

if (existsSync(".env")) process.loadEnvFile(".env");

const required = [
  "SWITCH_BASE_URL",
  "SWITCH_ROOM_ID",
  "WRITER_SWITCH_AGENT_ID",
  "WRITER_SWITCH_API_KEY",
  "STAGE_SWITCH_AGENT_ID",
  "STAGE_SWITCH_API_KEY",
] as const;
const missing = required.filter((name) => !process.env[name]);
const evidence: Record<string, unknown> = {
  verificationDate: new Date().toISOString(),
  mode: "live-runtime-check",
  transport: "not-run",
  humanIdentity: "pending operator verification",
  humanApproval: "pending real Mattermost event",
  physicalRehearsal: "pending genuine human performance",
};
if (missing.length) {
  evidence.transport = "blocked";
  evidence.missingVariables = missing;
  evidence.nextAction =
    "Start/configure a real Switch bridge and one Mattermost channel, register two separate agents, then rerun. No fixture fallback is used.";
  console.error(JSON.stringify(evidence, null, 2));
  process.exitCode = 1;
} else {
  try {
    const base = new URL(`${process.env.SWITCH_BASE_URL!.replace(/\/$/, "")}/`);
    if (
      !["https:", "http:"].includes(base.protocol) ||
      base.username ||
      base.password
    )
      throw new Error("Invalid Switch bridge URL");
    const health = await fetch(new URL("health", base), {
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!health.ok)
      throw new Error(
        `Bridge health returned HTTP ${health.status}; verify the bridge base URL, not the Gateway URL`,
      );
    evidence.health = "passed";
    const agents: unknown[] = [];
    for (const role of ["WRITER", "STAGE"] as const) {
      const client = new SwitchClient({
        baseUrl: process.env.SWITCH_BASE_URL!,
        roomId: process.env.SWITCH_ROOM_ID!,
        agentId: process.env[`${role}_SWITCH_AGENT_ID`]!,
        apiKey: process.env[`${role}_SWITCH_API_KEY`]!,
        connectionId: randomUUID(),
      });
      const registry = await client.discover();
      const result: Record<string, unknown> = {
        role: role.toLowerCase(),
        discovery: "passed",
        requiredOperations: [
          "read_context",
          "list_participants",
          "get_agent_detail",
        ],
        operationSchemas: Object.fromEntries(
          Object.entries(registry.operations)
            .filter(([key]) =>
              [
                "read_context",
                "list_participants",
                "get_agent_detail",
              ].includes(key),
            )
            .map(([key, value]) => [key, value.input_schema]),
        ),
      };
      if (process.argv.includes("--connect")) {
        // rooms= performs takeover. Operator must stop both worker processes first.
        let sample: unknown;
        const state = await new Promise<ConnectionState>(
          (resolveState, reject) => {
            const timeout = setTimeout(() => {
              client.stop();
              reject(
                new Error(
                  `${role}: no usable connection_state within 15 seconds`,
                ),
              );
            }, 15_000);
            client.start({
              onEvent: async (event) => {
                sample = sanitizedEnvelope(event);
              },
              onBlocked: (reason) => {
                clearTimeout(timeout);
                reject(new Error(reason));
              },
              onState: (value) => {
                if (value.status === "connected") {
                  clearTimeout(timeout);
                  resolveState(value);
                }
              },
            });
          },
        );
        try {
          result.connection = {
            status: state.status,
            cursor: state.cursor,
            generation: state.generation,
            roomCount: state.rooms?.length,
            server: state.server ?? "version unknown",
          };
          await client.operation("list_participants", {});
          await client.operation("read_context", { limit: 5 });
          result.roomOperations = "passed: list_participants and read_context";
          result.actualMessageEnvelope =
            sample ??
            "No message observed during this check; no actual envelope evidence collected";
        } finally {
          client.stop();
        }
      } else {
        result.connection =
          "pending: stop workers and run pnpm verify:switch --connect to test WebSocket and room operations (claims the room)";
      }
      agents.push(result);
    }
    evidence.agents = agents;
    evidence.transport = process.argv.includes("--connect")
      ? "automated checks passed"
      : "HTTP health and operation discovery passed; WebSocket pending";
    evidence.nextAction =
      "Complete the documented nonce/account-link audit, then human instruction → writer → stage engineer → exact human approval in Mattermost. Transport checks cannot establish human identity.";
    console.log(JSON.stringify(evidence, null, 2));
  } catch (error) {
    evidence.transport = "failed";
    evidence.reason =
      error instanceof Error ? error.message : "Unknown transport failure";
    console.error(JSON.stringify(evidence, null, 2));
    process.exitCode = 1;
  }
}
