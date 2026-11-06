import Database from "better-sqlite3";
import { projectCollaboration, type InboxRow, type OutboxRow } from "./collaboration.js";
import { readFileSync, mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  BriefSchema,
  RevisionSchema,
  PatchSchema,
  canonicalize,
  validateScene,
  applyPatch,
  diffRevisions,
  type Revision,
  type Brief,
  type Constraint,
} from "@two-hands/domain";
import type { SwitchMessage } from "@two-hands/switch-client";
import type {
  ServiceConfig,
  Role,
  Proposal,
  Observation,
  Rehearsal,
  Job,
  State,
} from "./types.js";
export const digest = (value: unknown) =>
  createHash("sha256").update(canonicalize(value)).digest("hex");
const json = JSON.stringify;
const PeerSchema = z
  .object({
    v: z.literal(1),
    type: z.enum(["repair_request", "review_request"]),
    sceneId: z.string(),
    taskId: z.string(),
    baseRevisionId: z.string().nullable(),
    generation: z.number().int().nonnegative(),
    proposalIds: z.array(z.string()).max(3).optional(),
    observationId: z.string().optional(),
    round: z.number().int().min(0).max(2),
  })
  .strict();
export class Conflict extends Error {}
export class Store {
  readonly db: Database.Database;
  constructor(readonly config: ServiceConfig) {
    if (config.databasePath !== ":memory:")
      mkdirSync(dirname(config.databasePath), { recursive: true });
    this.db = new Database(config.databasePath);
    if (config.databasePath !== ":memory:")
      chmodSync(config.databasePath, 0o600);
    this.db.exec(
      readFileSync(new URL("../migrations/001.sql", import.meta.url), "utf8"),
    );
    this.db.pragma("busy_timeout = 5000");
    // Additive schema v2: existing disposable databases retain their evidence.
    this.db.transaction(() => {
      const columns = this.db.prepare("PRAGMA table_info(outbox)").all() as {
        name: string;
      }[];
      if (!columns.some((column) => column.name === "lease_until"))
        this.db.exec(
          "ALTER TABLE outbox ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0",
        );
      if ((this.db.pragma("user_version", { simple: true }) as number) < 2)
        this.db.pragma("user_version = 2");
      if (this.get<boolean | null>("permanentHold", null) === null) {
        const pending = this.list<Observation>("observations").some(
          (o) =>
            o.status === "awaiting_confirmation" &&
            o.revisionId === this.current()?.id,
        );
        const invalidated = !!this.db
          .prepare("SELECT 1 FROM messages WHERE invalidated=1 LIMIT 1")
          .get();
        this.set(
          "permanentHold",
          invalidated || (this.get("hold", false) && !pending),
        );
      }
      this.db
        .prepare(
          "UPDATE outbox SET status='uncertain', lease_until=0, error='Restart during delivery; reconcile room history before retry' WHERE status='sending'",
        )
        .run();
      this.refreshApprovalHold();
    })();
  }
  close() {
    this.db.close();
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key=?")
      .get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : fallback;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, json(value));
  }
  list<T>(table: "proposals" | "observations" | "rehearsals"): T[] {
    return (
      this.db
        .prepare("SELECT content FROM " + table + " ORDER BY rowid")
        .all() as { content: string }[]
    ).map((r) => JSON.parse(r.content) as T);
  }
  current(): Revision | null {
    const id = this.get<string | null>("current", null);
    if (!id) return null;
    const row = this.db
      .prepare("SELECT content FROM revisions WHERE id=?")
      .get(id) as { content: string } | undefined;
    return row ? RevisionSchema.parse(JSON.parse(row.content)) : null;
  }
  proposal(id: string): Proposal {
    const p = this.list<Proposal>("proposals").find((p) => p.id === id);
    if (!p) throw new Conflict("Unknown proposal");
    return p;
  }
  saveProposal(p: Proposal, generation = this.get("generation", 0)) {
    this.db
      .prepare(
        "INSERT INTO proposals(id,base_id,generation,content) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content",
      )
      .run(p.id, p.baseRevisionId, generation, json(p));
  }
  invalidate() {
    this.set("generation", this.get("generation", 0) + 1);
    for (const p of this.list<Proposal>("proposals"))
      if (["pending_review", "eligible"].includes(p.status)) {
        p.status = "invalidated";
        this.saveProposal(p);
      }
  }
  private retryDraftState(): State["retryDraft"] {
    const remaining = Math.max(0, 2 - this.get("draftRetries", 0));
    const unavailable = (reason: string): State["retryDraft"] => ({ eligible: false, remaining, reason });
    if (!this.get<Brief | null>("brief", null)) return unavailable("Send your first brief in Mattermost.");
    if (this.current()) return unavailable("A revision is already approved; report a rehearsal observation to request a repair.");
    if (this.refreshApprovalHold()) return unavailable("An edited or revoked instruction holds this scene. Preserve evidence and start a fresh disposable scene.");
    if (!remaining) return unavailable("Both draft retries have been used. Preserve evidence and start a fresh disposable scene.");
    const generation = this.get("generation", 0);
    const jobs = (this.db.prepare("SELECT kind,status,payload FROM jobs").all() as { kind: Job["kind"]; status: string; payload: string }[])
      .filter((job) => (JSON.parse(job.payload) as Record<string, unknown>).generation === generation);
    if (jobs.some((job) => ["pending", "running"].includes(job.status))) return unavailable("Wait for active drafting or review to finish.");
    const proposals = (this.db.prepare("SELECT content FROM proposals WHERE generation=?").all(generation) as { content: string }[])
      .map((row) => JSON.parse(row.content) as Proposal);
    if (proposals.some((proposal) => proposal.status === "eligible")) return unavailable("An initial candidate is ready for your decision.");
    const blocked = jobs.some((job) => ["create", "review"].includes(job.kind) && job.status === "blocked");
    const rejected = proposals.length > 0 && proposals.every((proposal) => proposal.status === "rejected");
    if (!blocked && !rejected) return unavailable("Await stage review or reconcile a pending Switch delivery.");
    return { eligible: true, remaining, reason: "Initial drafting or review did not produce an eligible scene. You can retry the same brief through Switch." };
  }
  private draftRetryGuidance(): string {
    const retry = this.retryDraftState();
    return retry.eligible
      ? "\nTo request a new draft of the same brief, send @" + this.config.writerName + " retry-draft in Mattermost. Draft retries remaining: " + retry.remaining + "."
      : "";
  }
  private needsRepair(current: Revision | null = this.current()): boolean {
    return current !== null && canonicalize(current.constraints) !== canonicalize(this.get<Constraint[]>("constraints", []));
  }
  private refreshApprovalHold(): boolean {
    const currentId = this.current()?.id;
    const pending = this.list<Observation>("observations").some(
      (o) => o.revisionId === currentId && o.status === "awaiting_confirmation",
    );
    const hold = this.get("permanentHold", false) || pending;
    if (this.get("hold", false) !== hold) this.set("hold", hold);
    return hold;
  }
  private permanentApprovalHold() {
    this.set("permanentHold", true);
    this.refreshApprovalHold();
  }
  enqueue(
    id: string,
    role: Role,
    kind: Job["kind"],
    payload: Record<string, unknown>,
  ) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO jobs(id,role,kind,payload) VALUES(?,?,?,?)",
      )
      .run(
        id,
        role,
        kind,
        json({
          baseRevisionId: this.current()?.id ?? null,
          generation: this.get("generation", 0),
          ...payload,
        }),
      );
  }
  notify(id: string, role: Role, content: string) {
    this.db
      .prepare("INSERT OR IGNORE INTO outbox(id,role,content) VALUES(?,?,?)")
      .run(id, role, content);
  }
  state(): State {
    this.refreshApprovalHold();
    this.expireOutboxLeases();
    const current = this.current();
    const proposals = this.list<Proposal>("proposals");
    const connections = ["writer", "stage"].map((role) =>
      this.get<{ status: string; updatedAt: number; detail?: string }>(
        "connection:" + role,
        { status: "disconnected", updatedAt: 0 },
      ),
    );
    const connected = connections.every(
      (c) => c.status === "connected" && Date.now() - c.updatedAt < 15000,
    );
    const blocked = connections.find((c) => c.status === "blocked");
    const collaboration = projectCollaboration(
      this.config,
      this.db.prepare("SELECT role,content FROM inbox ORDER BY sequence DESC LIMIT 2000").all().reverse() as InboxRow[],
      this.db.prepare("SELECT id,role,content,status FROM outbox ORDER BY rowid DESC LIMIT 400").all().reverse() as OutboxRow[],
      new Map((this.db.prepare("SELECT id,invalidated FROM messages ORDER BY rowid DESC LIMIT 2000").all() as { id: string; invalidated: number }[]).map(row => [row.id, Boolean(row.invalidated)])),
    );
    return {
      collaboration,
      approvalHold: this.get("hold", false),
      needsRepair: this.needsRepair(current),
      retryDraft: this.retryDraftState(),
      approvals: (
        this.db
          .prepare(
            "SELECT proposal_id,revision_id,digest,revoked FROM approvals",
          )
          .all() as {
          proposal_id: string;
          revision_id: string;
          digest: string;
          revoked: number;
        }[]
      ).map((a) => ({
        proposalId: a.proposal_id,
        revisionId: a.revision_id,
        digest: a.digest,
        revoked: Boolean(a.revoked),
      })),
      deliveries: this.db
        .prepare("SELECT id,role,status,error FROM outbox ORDER BY rowid")
        .all() as State["deliveries"],
      connection: {
        status: blocked ? "blocked" : connected ? "connected" : "disconnected",
        detail:
          blocked?.detail ??
          (connected
            ? "Both Switch workers connected"
            : "Waiting for both Switch workers. Creation and repair require the room."),
      },
      brief: this.get<Brief | null>("brief", null),
      current,
      currentDigest: current ? digest(current) : null,
      constraints: this.get<Constraint[]>("constraints", []),
      observations: this.list<Observation>("observations"),
      proposals,
      rehearsals: (
        this.db.prepare(
          "SELECT rehearsals.content,messages.invalidated FROM rehearsals LEFT JOIN messages ON messages.id=rehearsals.id ORDER BY rehearsals.rowid",
        ).all() as { content: string; invalidated: number | null }[]
      ).map((row) => ({
        ...(JSON.parse(row.content) as Omit<Rehearsal, "withdrawn">),
        withdrawn: Boolean(row.invalidated),
      })),
      artifacts: proposals
        .filter((p) => p.status === "committed")
        .map((p) => ({
          revisionId: p.candidate.id,
          digest: p.digest,
          cueUrl:
            "/artifacts/" + encodeURIComponent(p.candidate.id) + "/cue.html",
          scriptUrl:
            "/artifacts/" + encodeURIComponent(p.candidate.id) + "/script.html",
        })),
      jobs: (
        this.db.prepare("SELECT * FROM jobs ORDER BY rowid").all() as (Omit<
          Job,
          "payload"
        > & { payload: string })[]
      ).map((j) => ({
        ...j,
        payload: JSON.parse(j.payload) as Record<string, unknown>,
      })),
      synthetic: this.config.synthetic ?? false,
    };
  }
  private authorized(event: SwitchMessage) {
    const m = this.config.identity;
    return (
      !!m &&
      m.roomId === this.config.roomId &&
      event.data.room_id === m.roomId &&
      event.data.bridge_id === m.bridgeId &&
      event.data.payload.sender === m.participantId &&
      m.participantId !== this.config.writerParticipantId &&
      m.participantId !== this.config.stageParticipantId
    );
  }
  ingest(role: Role, event: SwitchMessage) {
    return this.db.transaction(() => {
      if (event.data.room_id !== this.config.roomId)
        throw new Conflict("Wrong Switch room");
      if (event.id !== event.data.sequence)
        throw new Conflict("Mismatched event sequence");
      const msg = event.data.payload;
      const inserted = this.db
        .prepare(
          "INSERT OR IGNORE INTO inbox(role,sequence,message_id,content) VALUES(?,?,?,?)",
        )
        .run(role, event.id, msg.message_id, json(event));
      if (!inserted.changes) return { duplicate: true };
      const sender =
        role === "writer"
          ? this.config.writerParticipantId
          : this.config.stageParticipantId;
      if (msg.sender === sender) return { ignored: true };
      const id = event.data.room_id + ":" + msg.message_id;
      const bodyHash = digest({
        body: msg.body,
        sender: msg.sender,
        bridge: event.data.bridge_id,
      });
      const prior = this.db
        .prepare("SELECT digest FROM messages WHERE id=?")
        .get(id) as { digest: string } | undefined;
      if (prior) {
        if (prior.digest !== bodyHash) {
          this.db
            .prepare("UPDATE messages SET invalidated=1 WHERE id=?")
            .run(id);
          this.invalidate();
          this.db
            .prepare("UPDATE approvals SET revoked=1 WHERE message_id=?")
            .run(id);
          this.permanentApprovalHold();
          this.notify(
            id + ":edited",
            "stage",
            "An edited instruction was detected. Outstanding proposals are invalidated; immutable approved content is retained.",
          );
        }
        return { duplicate: true, edited: prior.digest !== bodyHash };
      }
      if (!msg.addressed) return { ignored: true };
      const human = this.authorized(event);
      const command = msg.body.replace(/^\s*@[^\s]+\s*/, "").trimStart();
      const expected = /^(brief|retry-draft)(?:\s|$)/.test(command) ? "writer" : "stage";
      if (human && role !== expected) return { ignored: true };
      if (human) {
        this.db
          .prepare("INSERT INTO messages(id,digest) VALUES(?,?)")
          .run(id, bodyHash);
        try {
          this.db.transaction(() => this.human(role, id, command))();
        } catch (error) {
          if (
            !(error instanceof Conflict) &&
            !(error instanceof z.ZodError) &&
            !(error instanceof SyntaxError)
          )
            throw error;
          this.notify(
            id + ":rejected",
            role,
            "Instruction not applied: " +
              (error instanceof Conflict
                ? error.message
                : "Invalid command data; check the documented format"),
          );
          return { rejected: true };
        }
        return { accepted: true };
      }
      const peer =
        role === "writer"
          ? this.config.stageParticipantId
          : this.config.writerParticipantId;
      if (msg.sender !== peer) return { ignored: true };
      const marker = command.indexOf("TWOHANDS ");
      if (marker < 0) return { ignored: true };
      let raw: unknown;
      try {
        raw = JSON.parse(command.slice(marker + 9));
      } catch {
        return { rejected: true };
      }
      const parsed = PeerSchema.safeParse(raw);
      if (!parsed.success) return { rejected: true };
      const p = parsed.data;
      const brief = this.get<Brief | null>("brief", null);
      if (!brief || p.sceneId !== brief.sceneId)
        throw new Conflict("Wrong scene");
      if (
        (role === "writer" && p.type !== "repair_request") ||
        (role === "stage" && p.type !== "review_request")
      )
        return { ignored: true };
      const outbox = this.db
        .prepare("SELECT content FROM outbox WHERE id=? AND role=?")
        .get(p.taskId, role === "writer" ? "stage" : "writer") as
        | { content: string }
        | undefined;
      if (!outbox) return { rejected: true };
      const storedMarker = outbox.content.indexOf("TWOHANDS ");
      let stored: unknown;
      try {
        stored = JSON.parse(outbox.content.slice(storedMarker + 9));
      } catch {
        return { rejected: true };
      }
      const expectedPeer = PeerSchema.safeParse(stored);
      if (
        storedMarker < 0 ||
        !expectedPeer.success ||
        canonicalize(expectedPeer.data) !== canonicalize(p)
      )
        return { rejected: true };
      this.db
        .prepare("INSERT INTO messages(id,digest) VALUES(?,?)")
        .run(id, bodyHash);
      if (
        p.baseRevisionId !== (this.current()?.id ?? null) ||
        p.generation !== this.get("generation", 0) ||
        this.get("permanentHold", false) ||
        (p.type === "repair_request" && this.refreshApprovalHold())
      ) {
        this.notify(
          id + ":stale",
          role,
          "Stale collaborative request was not applied. Its original revision or confirmed constraints no longer match the scene, or human confirmation remains pending. Inspect the current scene before requesting further work.",
        );
        return { rejected: true, stale: true };
      }
      this.enqueue(
        p.taskId,
        role,
        p.type === "repair_request" ? "repair" : "review",
        p,
      );
      return { accepted: true };
    })();
  }

  private human(role: Role, messageId: string, command: string) {
    const [verb, ...parts] = command.trim().split(/\s+/);
    if (
      this.get("permanentHold", false) &&
      !["revoke", "outcome"].includes(verb ?? "")
    )
      throw new Conflict(
        "An edited or revoked instruction holds this scene. Export evidence and start a fresh disposable scene.",
      );
    if (verb === "brief") {
      if (this.get("brief", null))
        throw new Conflict(
          "One scene per disposable database; reset only after exporting evidence",
        );
      const brief = BriefSchema.parse(JSON.parse(command.slice(6)));
      this.set("brief", brief);
      this.set("constraints", []);
      this.refreshApprovalHold();
      this.enqueue(messageId, "writer", "create", { brief });
      return;
    }
    if (verb === "retry-draft") {
      if (parts.length) throw new Conflict("Use retry-draft without arguments; the existing brief stays unchanged.");
      const retry = this.retryDraftState();
      if (!retry.eligible) throw new Conflict(retry.reason);
      const brief = this.get<Brief>("brief", {} as Brief);
      const retryAttempt = this.get("draftRetries", 0) + 1;
      const retryOfGeneration = this.get("generation", 0);
      this.invalidate();
      this.set("draftRetries", retryAttempt);
      this.enqueue(messageId, "writer", "create", { brief, retryAttempt, retryOfGeneration });
      return;
    }
    if (verb === "observe") {
      const observationMatch = /^observe[ \t]+(\S+)[ \t]([\s\S]+)$/.exec(
        command,
      );
      const revisionId = observationMatch?.[1];
      const text = observationMatch?.[2] ?? "";
      if (
        !revisionId ||
        !text.trim() ||
        text.length > 4000 ||
        revisionId !== this.current()?.id
      )
        throw new Conflict(
          "Observation must name current revision and describe a genuine difficulty",
        );
      const id = "obs-" + randomUUID();
      const observation: Observation = {
        id,
        revisionId,
        text,
        interpretation: null,
        status: "awaiting_confirmation",
      };
      this.db
        .prepare("INSERT INTO observations VALUES(?,?)")
        .run(id, json(observation));
      this.invalidate();
      this.refreshApprovalHold();
      this.enqueue(messageId, "stage", "interpret", { observationId: id });
      return;
    }
    if (verb === "confirm") {
      const [id, hand] = parts;
      if (parts.length !== 2 || !id || !["left", "right"].includes(hand ?? ""))
        throw new Conflict(
          "Use confirm <observationId> left|right; other constraints require escalation",
        );
      const o = this.list<Observation>("observations").find((o) => o.id === id);
      if (
        !o ||
        !o.interpretation ||
        o.status !== "awaiting_confirmation" ||
        o.revisionId !== this.current()?.id
      )
        throw new Conflict(
          "Observation interpretation is not awaiting confirmation for current revision",
        );
      o.status = "confirmed";
      this.db
        .prepare("UPDATE observations SET content=? WHERE id=?")
        .run(json(o), id);
      const constraints = this.get<Constraint[]>("constraints", []);
      if (constraints.length >= 12)
        throw new Conflict(
          "Constraint limit reached; preserve evidence and start a fresh scene",
        );
      constraints.push({
        id: "constraint-" + id,
        observationId: id,
        description:
          "Human confirmed: keep " +
          hand +
          " hand free throughout; confirmed for observation " +
          o.id,
        unavailableHand: hand as "left" | "right",
      });
      this.set("constraints", constraints);
      this.invalidate();
      if (this.refreshApprovalHold()) {
        this.notify(
          messageId + ":awaiting-confirmation",
          "stage",
          "Constraint confirmed. Other observations for this revision still need your confirmation; repair and approval remain on hold.",
        );
        return;
      }
      const brief = this.get<Brief>("brief", {} as Brief);
      this.notify(
        messageId + ":repair",
        "stage",
        "@" +
          this.config.writerName +
          " TWOHANDS " +
          json({
            v: 1,
            type: "repair_request",
            sceneId: brief.sceneId,
            taskId: messageId + ":repair",
            baseRevisionId: this.current()?.id ?? null,
            generation: this.get("generation", 0),
            observationId: id,
            round: 0,
          }),
      );
      return;
    }
    if (verb === "approve") {
      if (parts.length !== 3)
        throw new Conflict("Use approve <proposalId> <candidateId> <digest>");
      this.approve(messageId, parts[0]!, parts[1]!, parts[2]!);
      return;
    }
    if (verb === "outcome") {
      const outcomeMatch =
        /^outcome[ \t]+(\S+)[ \t]+(success|difficulty)[ \t]([\s\S]+)$/.exec(
          command,
        );
      const revisionId = outcomeMatch?.[1];
      const outcome = outcomeMatch?.[2];
      const text = outcomeMatch?.[3] ?? "";
      if (
        !revisionId ||
        !["success", "difficulty"].includes(outcome ?? "") ||
        !text.trim() ||
        text.length > 4000
      )
        throw new Conflict(
          "Use outcome <revisionId> success|difficulty <real observation>",
        );
      const approval = this.db
        .prepare("SELECT * FROM approvals WHERE revision_id=? AND revoked=0")
        .get(revisionId);
      if (!approval)
        throw new Conflict("Outcome requires an approved revision");
      if (this.refreshApprovalHold() && outcome === "success")
        throw new Conflict(
          "Resolve pending observation or revoked instruction before reporting success",
        );
      if (outcome === "success" && revisionId === this.current()?.id && this.needsRepair())
        throw new Conflict("Current revision does not include the confirmed constraints. Approve and rehearse an exact repaired revision before reporting current success.");
      const r: Omit<Rehearsal, "withdrawn"> = {
        id: messageId,
        revisionId,
        outcome: outcome as "success" | "difficulty",
        text,
        source: this.config.synthetic ? "synthetic" : "human",
      };
      this.db
        .prepare("INSERT OR IGNORE INTO rehearsals VALUES(?,?)")
        .run(r.id, json(r));
      this.notify(
        messageId + ":recorded",
        "stage",
        "Rehearsal " +
          outcome +
          " recorded for " +
          revisionId +
          ". " +
          (this.config.synthetic
            ? "Synthetic test evidence."
            : "Human-reported outcome; approved content unchanged."),
      );
      return;
    }
    if (verb === "revoke") {
      if (parts.length !== 1)
        throw new Conflict("Use revoke <original messageId>");
      const original = this.config.roomId + ":" + parts[0];
      if (!this.db.prepare("SELECT id FROM messages WHERE id=?").get(original))
        throw new Conflict("Unknown message");
      this.db
        .prepare("UPDATE messages SET invalidated=1 WHERE id=?")
        .run(original);
      this.db
        .prepare("UPDATE approvals SET revoked=1 WHERE message_id=?")
        .run(original);
      this.invalidate();
      this.permanentApprovalHold();
      this.notify(
        messageId + ":revoked",
        role,
        "Instruction revoked. Exports are immutable historical records; outstanding proposals invalidated.",
      );
      return;
    }
    throw new Conflict("Unknown command. See docs/demo-script.md");
  }
  private approve(
    messageId: string,
    id: string,
    candidateId: string,
    expectedDigest: string,
  ) {
    const p = this.proposal(id);
    const row = this.db
      .prepare("SELECT generation FROM proposals WHERE id=?")
      .get(id) as { generation: number };
    if (this.refreshApprovalHold())
      throw new Conflict(
        "A pending constraint or revoked instruction blocks approval",
      );
    if (p.status !== "eligible" || row.generation !== this.get("generation", 0))
      throw new Conflict("Proposal is no longer eligible");
    if (p.baseRevisionId !== (this.current()?.id ?? null))
      throw new Conflict("Stale base revision");
    if (
      p.candidate.id !== candidateId ||
      p.digest !== expectedDigest ||
      digest(p.candidate) !== expectedDigest
    )
      throw new Conflict("Wrong candidate or content digest");
    if (
      canonicalize(p.candidate.constraints) !==
      canonicalize(this.get("constraints", []))
    )
      throw new Conflict("Constraints changed");
    if (!validateScene(p.candidate).valid)
      throw new Conflict("Whole-scene validation failed");
    this.db
      .prepare("INSERT INTO revisions VALUES(?,?,?)")
      .run(candidateId, expectedDigest, json(p.candidate));
    this.db
      .prepare(
        "INSERT INTO approvals(message_id,proposal_id,revision_id,digest) VALUES(?,?,?,?)",
      )
      .run(messageId, id, candidateId, expectedDigest);
    this.set("current", candidateId);
    p.status = "committed";
    this.saveProposal(p);
    this.invalidate();
    const url = this.config.publicUrl;
    this.notify(
      messageId + ":artifacts",
      "stage",
      "Approved " +
        candidateId +
        "\nDigest: " +
        expectedDigest +
        "\nAwaiting human rehearsal.\nOffline cue player: " +
        url +
        "/artifacts/" +
        encodeURIComponent(candidateId) +
        "/cue.html\nPrintable script: " +
        url +
        "/artifacts/" +
        encodeURIComponent(candidateId) +
        "/script.html\nDownload both before going offline. Report: outcome " +
        candidateId +
        " success|difficulty <what happened>",
    );
  }
  claim(role: Role): Job | null {
    return this.db.transaction(() => {
      const row = this.db
        .prepare(
          "SELECT * FROM jobs WHERE role=? AND (status='pending' OR (status='running' AND lease_until<?)) ORDER BY rowid LIMIT 1",
        )
        .get(role, Date.now()) as
        | (Omit<Job, "payload"> & { payload: string })
        | undefined;
      if (!row) return null;
      if (row.attempts >= 3) {
        this.db
          .prepare(
            "UPDATE jobs SET status='blocked',error='Recovery attempt limit exhausted' WHERE id=?",
          )
          .run(row.id);
        return null;
      }
      this.db
        .prepare(
          "UPDATE jobs SET status='running',lease_until=?,attempts=attempts+1 WHERE id=?",
        )
        .run(Date.now() + 180000, row.id);
      return {
        ...row,
        payload: JSON.parse(row.payload) as Record<string, unknown>,
        attempts: row.attempts + 1,
      };
    })();
  }
  job(role: Role, id: string) {
    const row = this.db
      .prepare("SELECT * FROM jobs WHERE id=? AND role=?")
      .get(id, role) as
      | (Omit<Job, "payload"> & { payload: string })
      | undefined;
    if (!row || row.status !== "running")
      throw new Conflict("No running job owned by this worker");
    return {
      ...row,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
    };
  }
  modelAttempt(role: Role, id: string) {
    const job = this.job(role, id);
    if (job.model_attempts >= 2)
      throw new Conflict("Model attempt budget exhausted (2 across restarts)");
    this.db
      .prepare("UPDATE jobs SET model_attempts=model_attempts+1 WHERE id=?")
      .run(id);
  }
  complete(role: Role, id: string) {
    const existing = this.db
      .prepare("SELECT status FROM jobs WHERE id=? AND role=?")
      .get(id, role) as { status: string } | undefined;
    if (existing?.status === "done") return;
    this.job(role, id);
    this.db
      .prepare("UPDATE jobs SET status='done',lease_until=0 WHERE id=?")
      .run(id);
  }
  fail(role: Role, id: string) {
    const existing = this.db
      .prepare("SELECT status FROM jobs WHERE id=? AND role=?")
      .get(id, role) as { status: string } | undefined;
    if (existing?.status === "done") return;
    this.job(role, id);
    this.db
      .prepare(
        "UPDATE jobs SET status='blocked',error='Worker operation failed; inspect sanitized worker log',lease_until=0 WHERE id=?",
      )
      .run(id);
    this.notify(
      id + ":blocked",
      role,
      "Work is blocked after bounded attempts. No revision was approved. Inspect the local workbench and worker logs." + this.draftRetryGuidance(),
    );
  }
  createProposals(role: Role, jobId: string, input: unknown) {
    return this.db.transaction(() => {
      const job = this.job(role, jobId);
      if (role !== "writer" || !["create", "repair"].includes(job.kind))
        throw new Conflict("Only writer create/repair jobs can propose");
      const existing = this.list<Proposal>("proposals").filter((p) =>
        p.id.startsWith(jobId + ":proposal:"),
      );
      if (existing.length) return existing;
      const parsed = z
        .array(
          z
            .object({
              candidate: RevisionSchema.optional(),
              patch: PatchSchema.optional(),
              artisticCosts: z.array(z.string().min(1).max(1000)).min(1).max(5),
            })
            .strict(),
        )
        .min(1)
        .max(3)
        .parse(input);
      const base = this.current();
      const brief = this.get<Brief | null>("brief", null);
      if (!brief) throw new Conflict("No human brief");
      if (
        job.payload.baseRevisionId !== (base?.id ?? null) ||
        job.payload.generation !== this.get("generation", 0)
      )
        throw new Conflict("Job base or constraints changed");
      if ((job.kind === "create" && base) || (job.kind === "repair" && !base))
        throw new Conflict("Job base no longer current");
      const constraints = this.get<Constraint[]>("constraints", []);
      const result = parsed.map((entry, i) => {
        const id = jobId + ":proposal:" + i;
        const revisionId = "rev-" + digest(id).slice(0, 16);
        let candidate: Revision;
        if (base) {
          if (!entry.patch || entry.candidate)
            throw new Conflict("Repairs require a bounded beat patch only");
          candidate = applyPatch(base, entry.patch, revisionId, constraints);
        } else {
          if (!entry.candidate || entry.patch)
            throw new Conflict("Initial proposal requires complete candidate");
          candidate = RevisionSchema.parse({
            ...entry.candidate,
            ...brief,
            id: revisionId,
            parentRevisionId: null,
            constraints,
          });
        }
        const diff = base ? diffRevisions(base, candidate) : [];
        const affectedBeats = base
          ? diff.map((d) => d.beatId)
          : candidate.beats.map((b) => b.id);
        if (base && !affectedBeats.length)
          throw new Conflict("Repair must change at least one beat");
        const first = candidate.beats.findIndex((b) =>
          affectedBeats.includes(b.id),
        );
        const validation = validateScene(candidate);
        const p: Proposal = {
          id,
          baseRevisionId: base?.id ?? null,
          candidate,
          digest: digest(candidate),
          patch: entry.patch ?? null,
          affectedBeats,
          dependentTransitions: candidate.beats
            .slice(Math.max(first, 0))
            .map((b) => b.id),
          artisticCosts: entry.artisticCosts,
          validation,
          diff,
          status: validation.valid ? "pending_review" : "rejected",
          review: null,
        };
        this.saveProposal(p);
        return p;
      });
      this.notify(
        jobId + ":review",
        "writer",
        "@" +
          this.config.stageName +
          " TWOHANDS " +
          json({
            v: 1,
            type: "review_request",
            sceneId: brief.sceneId,
            taskId: jobId + ":review",
            baseRevisionId: base?.id ?? null,
            generation: this.get("generation", 0),
            proposalIds: result.map((p) => p.id),
            round: 0,
          }),
      );
      this.complete(role, jobId);
      return result;
    })();
  }
  interpret(role: Role, jobId: string, interpretation: string) {
    return this.db.transaction(() => {
      const job = this.job(role, jobId);
      if (role !== "stage" || job.kind !== "interpret")
        throw new Conflict("Wrong interpretation job");
      const observation = this.list<Observation>("observations").find(
        (o) => o.id === job.payload.observationId,
      );
      if (!observation) throw new Conflict("Unknown observation");
      if (observation.interpretation) return observation;
      observation.interpretation = z
        .string()
        .min(1)
        .max(2000)
        .parse(interpretation);
      this.db
        .prepare("UPDATE observations SET content=? WHERE id=?")
        .run(json(observation), observation.id);
      this.notify(
        jobId + ":confirm",
        "stage",
        "Your original observation: " +
          observation.text +
          "\nEngineer interpretation (unconfirmed): " +
          interpretation +
          "\nThe current action model supports keeping one hand free throughout. If that accurately reflects your difficulty, confirm explicitly: confirm " +
          observation.id +
          " left|right. Otherwise this constraint is outside the MVP; do not approve an inaccurate interpretation.",
      );
      this.complete(role, jobId);
      return observation;
    })();
  }
  review(
    role: Role,
    jobId: string,
    reviews: { proposalId: string; explanation: string }[],
  ) {
    return this.db.transaction(() => {
      const job = this.job(role, jobId);
      if (role !== "stage" || job.kind !== "review")
        throw new Conflict("Wrong review job");
      const ids = z.array(z.string()).max(3).parse(job.payload.proposalIds);
      const parsed = z
        .array(
          z
            .object({
              proposalId: z.string(),
              explanation: z.string().min(1).max(2000),
            })
            .strict(),
        )
        .max(3)
        .parse(reviews);
      if (
        new Set(parsed.map((r) => r.proposalId)).size !== ids.length ||
        parsed.length !== ids.length ||
        parsed.some((r) => !ids.includes(r.proposalId))
      )
        throw new Conflict("Review must cover exact requested alternatives");
      const presentations = parsed.map((r) => {
        const p = this.proposal(r.proposalId);
        if (p.status === "pending_review") {
          p.validation = validateScene(p.candidate);
          p.status = p.validation.valid ? "eligible" : "rejected";
          p.review = r.explanation;
          this.saveProposal(p);
        }
        return (
          p.id +
          "\nRevision: " +
          p.candidate.id +
          "\nPhysical changes: " +
          p.affectedBeats.join(", ") +
          "; dependent transitions checked: " +
          p.dependentTransitions.join(", ") +
          "\nArtistic costs: " +
          p.artisticCosts.join("; ") +
          "\nEngineer: " +
          r.explanation +
          "\n" +
          (p.status === "eligible"
            ? "Approve exact candidate: approve " +
              p.id +
              " " +
              p.candidate.id +
              " " +
              p.digest
            : "Not eligible: " +
              p.status +
              ". " +
              p.validation.issues.map((x) => x.message).join("; "))
        );
      });
      this.complete(role, jobId);
      this.notify(
        jobId + ":alternatives",
        "stage",
        "Scene alternatives. Inspect complete scenes and before/after: " +
          this.config.publicUrl +
          "/studio\n\n" +
          presentations.join("\n\n") +
          "\nModel checked is not physically rehearsed. The human must choose and approve." + this.draftRetryGuidance(),
      );
    })();
  }
  private expireOutboxLeases() {
    this.db
      .prepare(
        "UPDATE outbox SET status='uncertain',lease_until=0,error='Delivery lease expired; reconcile room history before retry' WHERE status='sending' AND lease_until<=?",
      )
      .run(Date.now());
  }
  nextOutbox(role: Role) {
    return this.db.transaction(() => {
      this.expireOutboxLeases();
      this.db
        .prepare(
          "UPDATE outbox SET status='uncertain',error='Delivery attempt budget exhausted; confirm remote delivery manually' WHERE role=? AND status='pending' AND attempts>=3",
        )
        .run(role);
      const row = this.db
        .prepare(
          "SELECT id,content FROM outbox WHERE role=? AND status='pending' AND attempts<3 ORDER BY rowid LIMIT 1",
        )
        .get(role) as { id: string; content: string } | undefined;
      if (!row) return null;
      this.db
        .prepare(
          "UPDATE outbox SET status='sending',attempts=attempts+1,lease_until=? WHERE id=?",
        )
        .run(Date.now() + 60_000, row.id);
      return row;
    })();
  }
  outboxResult(role: Role, id: string, sent: boolean) {
    this.expireOutboxLeases();
    this.db
      .prepare(
        "UPDATE outbox SET status=?,error=?,lease_until=0 WHERE id=? AND role=? AND status='sending'",
      )
      .run(
        sent ? "sent" : "uncertain",
        sent ? null : "Delivery uncertain; reconcile room history before retry",
        id,
        role,
      );
  }
  reconcileOutbox(
    role: Role,
    id: string,
    decision: "delivered" | "retry",
    evidence: string,
  ) {
    return this.db.transaction(() => {
      this.expireOutboxLeases();
      const checked = z
        .object({
          decision: z.enum(["delivered", "retry"]),
          evidence: z.string().trim().min(20).max(2000),
        })
        .parse({ decision, evidence });
      const row = this.db
        .prepare("SELECT status,attempts FROM outbox WHERE id=? AND role=?")
        .get(id, role) as { status: string; attempts: number } | undefined;
      if (!row || row.status !== "uncertain")
        throw new Conflict(
          "Only an uncertain delivery owned by this worker can be reconciled",
        );
      if (checked.decision === "retry" && row.attempts >= 3)
        throw new Conflict(
          "Delivery attempt budget exhausted (3); confirm delivery manually or retain the blocked record",
        );
      const key = "outbox-reconciliation:" + id;
      const history = this.get<
        { role: Role; decision: string; evidence: string; at: string }[]
      >(key, []);
      history.push({
        role,
        decision: checked.decision,
        evidence: checked.evidence,
        at: new Date().toISOString(),
      });
      this.set(key, history);
      const status = checked.decision === "delivered" ? "sent" : "pending";
      this.db
        .prepare(
          "UPDATE outbox SET status=?,error=NULL,lease_until=0 WHERE id=? AND role=?",
        )
        .run(status, id, role);
      return { id, status };
    })();
  }
  artifact(revisionId: string) {
    const row = this.db
      .prepare("SELECT content,digest FROM revisions WHERE id=?")
      .get(revisionId) as { content: string; digest: string } | undefined;
    if (!row) throw new Conflict("No immutable approved revision");
    return {
      revision: RevisionSchema.parse(JSON.parse(row.content)),
      digest: row.digest,
    };
  }
}
