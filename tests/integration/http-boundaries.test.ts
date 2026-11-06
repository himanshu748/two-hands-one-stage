import { describe, it, expect } from "vitest";
import { Store } from "../../apps/api/src/store.js";
import { createServer } from "../../apps/api/src/server.js";
import {
  syntheticConfig,
  syntheticTokens,
  seedApproved,
  ingestHuman,
  claimRequired,
} from "../../fixtures/service.js";

describe("real HTTP boundaries with synthetic identities", () => {
  it("accepts opaque event-derived job identifiers longer than Fastify default", async () => {
    const store = new Store(syntheticConfig());
    const app = createServer(store, syntheticTokens);
    try {
      const id = "!" + "r".repeat(70) + ":switch.invalid:$" + "e".repeat(80);
      store.enqueue(id, "writer", "create", {});
      store.claim("writer");
      store.set("connection:writer", {
        status: "connected",
        updatedAt: Date.now(),
      });
      const response = await app.inject({
        method: "POST",
        url: "/internal/jobs/" + encodeURIComponent(id) + "/model-attempt",
        headers: { authorization: "Bearer " + syntheticTokens.writer },
        payload: {},
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
  it("reconciles only owning-role uncertain delivery through actual API", async () => {
    const store = new Store(syntheticConfig());
    const app = createServer(store, syntheticTokens);
    try {
      store.notify("synthetic-uncertain", "stage", "Synthetic message");
      store.nextOutbox("stage");
      store.outboxResult("stage", "synthetic-uncertain", false);
      const request = {
        method: "POST" as const,
        url: "/internal/outbox/synthetic-uncertain/reconcile",
        payload: {
          decision: "retry",
          evidence: "Synthetic operator inspected complete room history",
        },
      };
      expect(
        (
          await app.inject({
            ...request,
            headers: { authorization: "Bearer " + syntheticTokens.writer },
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            ...request,
            headers: { authorization: "Bearer " + syntheticTokens.stage },
          })
        ).statusCode,
      ).toBe(200);
      expect(store.state().deliveries[0]?.status).toBe("pending");
    } finally {
      await app.close();
    }
  });
  it("preserves a long human observation without overflowing constraint descriptions", () => {
    const store = new Store(syntheticConfig());
    try {
      const proposal = seedApproved(store);
      const text =
        "A genuine observation would go here.\n  Details preserved. ".repeat(
          60,
        );
      ingestHuman(store, "observe " + proposal.candidate.id + " " + text);
      const job = claimRequired(store, "stage");
      store.interpret(
        "stage",
        job.id,
        "Please confirm whether left hand must stay free.",
      );
      const observation = store.state().observations[0]!;
      expect(
        ingestHuman(store, "confirm " + observation.id + " left").result,
      ).toEqual({ accepted: true });
      expect(store.state().observations[0]?.text).toBe(text);
      expect(store.state().constraints[0]!.description.length).toBeLessThan(
        2000,
      );
    } finally {
      store.close();
    }
  });
});
