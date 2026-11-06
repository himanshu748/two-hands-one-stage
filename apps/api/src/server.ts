import Fastify, { type FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SwitchMessageSchema, ResumePositionSchema } from "@two-hands/switch-client";
import { Store, Conflict } from "./store.js";
import { renderArtifact } from "./render.js";
import type { Role } from "./types.js";
export function createServer(
  store: Store,
  tokens: { writer: string; stage: string },
) {
  const app = Fastify({
    bodyLimit: 250_000,
    routerOptions: { maxParamLength: 4096 },
    logger: {
      level: "info",
      redact: ["req.headers.authorization", "req.headers.cookie"],
      serializers: {
        req: (r) => ({ method: r.method, url: String(r.url).split("?")[0] }),
      },
    },
  });
  function role(req: FastifyRequest): Role {
    const h = req.headers.authorization ?? "";
    for (const r of ["writer", "stage"] as const) {
      const expected = "Bearer " + tokens[r];
      if (
        h.length === expected.length &&
        timingSafeEqual(Buffer.from(h), Buffer.from(expected))
      )
        return r;
    }
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  app.addHook("onRequest", async (req, reply) => {
    const host = (req.headers.host ?? "").split(":")[0] ?? "";
    if (!["127.0.0.1", "localhost", "["].includes(host))
      return reply.code(403).send({ error: "Local host only" });
    if (req.headers.origin) {
      let origin: string;
      try {
        origin = new URL(req.headers.origin).origin;
      } catch {
        return reply.code(403).send({ error: "Invalid origin" });
      }
      if (
        ![
          "http://127.0.0.1:5173",
          "http://localhost:5173",
          "http://127.0.0.1:4310",
          store.config.publicUrl,
        ].includes(origin)
      )
        return reply.code(403).send({ error: "Origin not allowed" });
    }
    if (req.url.startsWith("/internal/")) role(req);
  });
  app.addHook("onSend", async (_req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("Cache-Control", "no-store");
  });
  app.setErrorHandler((err, _req, reply) => {
    const error = err as Error & { statusCode?: number };
    const status =
      error instanceof Conflict
        ? 409
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 400
          : (error.statusCode ?? 500);
    reply.code(status).send({
      error:
        status === 409
          ? error.message
          : status === 400
            ? "Invalid request data"
            : status === 401
              ? "Unauthorized"
              : "Request failed; inspect configuration and application state",
    });
  });
  app.get("/health", () => ({ ok: true, service: "two-hands-api" }));
  app.get("/api/state", () => store.state());
  app.get("/internal/state", () => store.state());
  app.get("/internal/connection", (req) =>
    store.get("connection:" + role(req), null),
  );
  app.post("/internal/connection", (req) => {
    const state = z
      .object({
        connectionId: z.string().uuid(),
        cursor: z.number().int().nonnegative(),
        generation: z.number().int().nonnegative().optional(),
        position: ResumePositionSchema.optional(),
        rooms: z.array(z.string()).optional(),
        status: z.string().max(100),
        server: z.unknown().optional(),
      })
      .strict()
      .parse(req.body);
    store.set("connection:" + role(req), { ...state, updatedAt: Date.now() });
    return { ok: true };
  });
  app.post("/internal/events", (req) =>
    store.ingest(role(req), SwitchMessageSchema.parse(req.body)),
  );
  const requireConnected = (r: Role) => {
    const c = store.get<{ status: string; updatedAt: number }>(
      "connection:" + r,
      { status: "disconnected", updatedAt: 0 },
    );
    if (c.status !== "connected" || Date.now() - c.updatedAt > 15000)
      throw new Conflict("Worker is not connected to Switch");
  };
  app.post("/internal/jobs/claim", (req) => {
    const r = role(req);
    requireConnected(r);
    return store.claim(r);
  });
  app.post<{ Params: { id: string; action: string } }>(
    "/internal/jobs/:id/:action",
    (req) => {
      const r = role(req),
        id = req.params.id;
      const action = req.params.action;
      if (!["complete", "fail"].includes(action)) requireConnected(r);
      switch (action) {
        case "model-attempt":
          store.modelAttempt(r, id);
          return { ok: true };
        case "proposals":
          return store.createProposals(r, id, req.body);
        case "interpret":
          return store.interpret(
            r,
            id,
            z.object({ interpretation: z.string() }).strict().parse(req.body)
              .interpretation,
          );
        case "review":
          store.review(
            r,
            id,
            z
              .array(
                z
                  .object({ proposalId: z.string(), explanation: z.string() })
                  .strict(),
              )
              .parse(req.body),
          );
          return { ok: true };
        case "complete":
          store.complete(r, id);
          return { ok: true };
        case "fail":
          store.fail(r, id);
          return { ok: true };
        default:
          throw new Conflict("Unknown domain operation");
      }
    },
  );
  app.post("/internal/outbox/claim", (req) => {
    const r = role(req);
    requireConnected(r);
    return store.nextOutbox(r);
  });
  app.post<{ Params: { id: string } }>("/internal/outbox/:id/result", (req) => {
    store.outboxResult(
      role(req),
      req.params.id,
      z.object({ sent: z.boolean() }).strict().parse(req.body).sent,
    );
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>(
    "/internal/outbox/:id/reconcile",
    (req) => {
      const body = z
        .object({
          decision: z.enum(["delivered", "retry"]),
          evidence: z.string().min(20).max(2000),
        })
        .strict()
        .parse(req.body);
      store.reconcileOutbox(
        role(req),
        req.params.id,
        body.decision,
        body.evidence,
      );
      return { ok: true };
    },
  );
  app.get<{ Params: { revisionId: string; kind: string } }>(
    "/artifacts/:revisionId/:kind",
    (req, reply) => {
      const { revisionId, kind } = req.params;
      if (!["cue.html", "script.html"].includes(kind))
        return reply.code(404).send({ error: "Unknown artifact" });
      const artifact = store.artifact(revisionId);
      return reply
        .type("text/html; charset=utf-8")
        .send(
          renderArtifact(
            artifact.revision,
            artifact.digest,
            kind === "cue.html" ? "cue" : "script",
            store.config.synthetic,
          ),
        );
    },
  );
  app.addHook("onClose", () => store.close());
  return app;
}
