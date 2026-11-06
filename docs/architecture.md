# Architecture

The API owns application state and deterministic transitions. Two separate worker processes supply creative reasoning, each under its own Switch identity. Switch carries the collaboration between those workers and the performer. React presents the state and runs local playback; it has no approval endpoint.

## Components

| Workspace | Responsibility |
| --- | --- |
| `apps/web` | Read-only rehearsal workbench, candidate/diff inspection, visible connection and work states, local timed cues |
| `apps/api` | Fastify loopback service; sole SQLite writer; durable inbox, jobs, outbox, revisions, validation, exact approval, rehearsal records, fixed HTML templates |
| `apps/writer-agent` | Independent playwright process; initial six-beat draft and bounded repair alternatives with artistic costs |
| `apps/stage-agent` | Independent stage engineer process; observation interpretation and review of deterministic validation; requests confirmation |
| `packages/domain` | Browser-safe Zod schemas, action semantics, whole-scene validation, canonical serialization, patch and diff rules |
| `packages/switch-client` | Registration/connection contracts, runtime operation discovery, typed event decoding, posting, cursor persistence callbacks, bounded reconnect |
| `packages/agent-runtime` | Official OpenAI SDK with explicitly selected OpenAI or Modal endpoint, structured-output validation, bounded attempts, redacted logs, trusted worker utilities |

Database migrations and artifact rendering stay in `apps/api`. The domain imports no transport, database, model SDK, or UI. No additional service secretly runs one agent on behalf of the other.

## Collaborative sequence

```mermaid
sequenceDiagram
    actor H as Performer in Mattermost
    participant S as One Switch room
    participant W as Writer worker
    participant E as Stage worker
    participant A as API / SQLite
    H->>S: Addressed brief
    S->>W: Authenticated event
    W->>A: Persist receipt; claim writer job
    W->>A: Schema-validated six-beat proposal
    W->>S: Review request from durable outbox
    S->>E: Addressed peer request
    E->>A: Read candidate and deterministic validation
    E->>S: Alternatives, artistic costs, exact approval command
    H->>S: Approve proposal + revision + digest
    S->>E: Performer-origin event
    E->>A: Trusted deterministic event ingestion
    A->>A: Recheck identity, eligibility, base, digest, constraints, whole scene
    A->>A: Transactional commit and artifact notification
    E->>S: Immutable artifact links
    S->>H: Cue player + printable script
    H->>S: Actual rehearsal observation
    S->>E: Addressed observation
    E->>S: Interpretation; request human confirmation
    H->>S: Confirm supported hand constraint
    S->>E: Confirmed constraint event
    E->>S: Addressed repair request
    S->>W: Start bounded repair work
    Note over H,A: Repair alternatives follow the same review, exact approval, and rehearsal path
```

The API creates deterministic work records from received instructions and peer messages; it does not directly send a creative task to the other worker. A review or repair job needs the corresponding addressed Switch receipt. Workers do not call each other. Removing Switch stops new collaborative work; downloaded artifacts remain usable.

## Data and invariants

One database represents one scene in one room. It stores a brief, confirmed constraints, immutable approved revisions, complete candidate proposals, original observations and separate interpretations, exact approvals, revision-linked rehearsal outcomes, transport cursors, inbox receipts, logical messages, job leases, and outgoing notifications.

The canonical content digest is SHA-256 of stable-key JSON. It binds the full candidate, including its ID, parent, brief, props, initial state, constraints, and six beats. The API computes it; model-provided hashes have no authority. Beat patches preserve all unaffected beat content and the stable brief. Changed beats and downstream transitions are inspected by whole-sequence validation rather than a local-only check. See [action model](action-model.md) and [state and approval](state-and-approval.md).

Approval is a transaction, not a worker tool. It checks the reviewed performer origin, exact candidate/digest, proposal eligibility, current base, current constraints, and validation again before recording the immutable revision and outbox notification. A model cannot choose the approver or mark rehearsal success. Physical evidence is a separate human report linked to the approved revision.

## Trust boundaries

- **Browser:** no model key, Switch key, internal token, or approval mutation. React escapes scene strings. The workbench accepts schema-valid application state and allows only same-origin `/artifacts/` links.
- **Worker:** its internal token identifies its role. Trusted deterministic transport code forwards observed envelopes; models receive only bounded scene data and return validated structured content. They have no shell, arbitrary HTTP, arbitrary HTML, or approval tool.
- **Switch connection:** bearer-authenticated server-side WebSocket plus fixed room and configured agent identity. Opaque sender IDs are matched exactly; names and apparent ID prefixes are not authority.
- **Human mapping:** a local reviewed mapping binds Mattermost account/channel, Switch participant/bridge/room, verification date, and audit evidence. No mapping means no human authorization. This file records an operator's audit; it is not a signature issued by Switch. See the [compatibility audit](switch-compatibility.md).
- **API:** loopback only, narrow authenticated worker endpoints, sole database writer, schema-validated bodies, fixed escaped HTML templates. Local machine administrators remain trusted; this is not an untrusted multitenant service.

The approved scene protects the fact string structurally. Whether dialogue honors its meaning remains an artistic/human review responsibility; the validator does not claim semantic proof.

## Failure and recovery

Every worker persists its connection UUID before opening the stream and advances a cursor only after durable ingestion. Inbox keys include role and stream sequence; logical message IDs prevent repeated effects across replay. Reconnect reuses the UUID and generation. Takeover, missing history, invalid envelopes, or failed durable ingestion stop processing and require attention rather than inventing continuity.

SQLite transactions commit related revision and notification records together. Pending jobs survive restart; expired leases can be reclaimed within a finite recovery budget. Model attempts are reserved durably before calls, with a two-attempt budget across restarts. SDK retries are disabled; calls have a timeout and bounded output tokens. Exhaustion becomes a visible blocked job.

Outbox notifications are durable. An HTTP timeout can leave delivery uncertain because the documented Switch message endpoint has no application idempotency key. The service retains uncertain deliveries for history reconciliation rather than asserting delivery or blindly retrying indefinitely. Duplicate room messages cannot independently approve a second revision. No exactly-once chat-delivery claim is made.

The documented event catalog does not establish a dependable edit/delete contract. Accepted chat instructions are immutable receipts. The performer must send a fresh explicit `revoke <messageId>` command; editing or deleting a Mattermost post must not be assumed to revoke an approval. If a changed body arrives under an existing ID, processing invalidates outstanding decisions and holds progress. Historical exported HTML cannot be recalled. Revoked approval and uncertain delivery statuses are exposed separately in the workbench.

## Local operation and reset

`pnpm dev` validates configuration and reviewed identity, then starts the API, workbench, writer, and stage worker with labeled logs. It waits for API health before the workers start. If a process exits unexpectedly, the others stop; Ctrl+C requests graceful shutdown before a bounded forced stop. No fixtures are loaded by the dev command.

The API binds `127.0.0.1:4310`; Vite binds `127.0.0.1:5173` and proxies application/artifact requests. `PUBLIC_APP_URL` controls the links posted in the room and must be reachable from the actual demonstration browser. Its default is `http://127.0.0.1:5173`. A localhost URL works only on that same machine. Public deployment and tunnels are not provisioned by this project.

`pnpm demo:reset` acts only when `DATABASE_PATH` and `DISPOSABLE_DEMO_DATABASE_PATH` resolve to the same `work/.../demo.sqlite`. It refuses active API ports, dev/API process locks, symlinks, hard links, and non-regular files. It renames that database and its SQLite sidecars into a private timestamped `work/demo-backups/` directory. The operation is reversible and does not delete Switch history, credentials, HTML already saved elsewhere, or other databases. Stop all API/worker processes before invoking it. The next API startup creates a fresh database.

## Artifacts and validation boundary

Both HTML outputs read the same stored immutable revision and include its ID and digest. Script text is escaped into fixed templates; no model HTML is executed. Saved cue playback has no network, Switch, or model requirement. Timed mode gives the performer a lead-in before taking the props; manual controls require safe placement of props first.

Automated service, transport, worker, and browser tests use explicitly synthetic fixtures. They verify behavior and failure handling, not genuine physical performability or a live provider. The first live milestone remains the intended-room instruction → writer → stage engineer → exact human approval, followed by verified link delivery and an actual physical rehearsal. Current evidence is recorded separately in [test evidence](test-evidence.md).

## Browser entry points

`/` is the public landing page, with a local, explicitly synthetic interactive example and two static sample exports. It never calls the application API or mutates collaborative state. `/studio` reads the real API and has no fixture fallback. Both share the symbolic StageView; its positions come from deterministic domain states. Prop transitions explain a state change, not measured physical motion. The studio validates action prefixes to show action-by-action states, retaining whole-scene checks for repair eligibility. Motion respects reduced-motion preferences.

The studio uses a persistent six-beat rail, central stage, contextual physical inspector, and bottom cue transport. Repairs, exports and evidence occupy separate views. Switching between original and candidate preserves the selected beat, with changed/unchanged markers and exact diffs. Interface research and access limitations are in [design-research.md](design-research.md).

## Verified private cloud runtime

The authorized Docker Cloud run hosts only Switch Core/Gateway, PostgreSQL, Mattermost and the setup container. The application API/SQLite, React workbench and eventual two creative workers stay on the Mac. Authenticated SSH forwards bind the three service ports to local loopback; no Docker Cloud public port is exposed. The cloud sandbox has a server-side two-hour expiry. The operator nonce-audit command uses an agent transport connection without models or application approval operations. Actual runtime results and remaining human/model gates are in [cloud-run.md](cloud-run.md).
