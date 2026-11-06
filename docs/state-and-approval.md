# State, trust and exact approval

The service has one scene and one authorized performer. A brief names exactly three stable props, an emotional goal and a protected fact. Six ordered beat IDs remain stable across revisions. The API is the only SQLite writer; WAL transactions own revision commits, approval records, inbound receipts, jobs and notifications.

## Trusted ingestion boundary

Two independent worker processes own the agent connections. Their deterministic transport code forwards received Switch message envelopes over loopback to `/internal/events`, authenticated with separate worker tokens. The API compares the **whole opaque sender ID**, bridge ID and room ID with a locally reviewed `HUMAN_IDENTITY_FILE`. Models do not see these credentials, construct ingestion envelopes, invoke approval endpoints, or decide origin. There is no approval endpoint or browser write path.

This is a local trust boundary, **not a cryptographic assertion from Switch**. The authenticated worker processes, local OS, configuration file and Switch deployment must be trusted. A compromised worker token/process can forge ingestion; do not expose the API externally. Display names, participant-ID prefixes, a shared bot ID, account names and model statements are never accepted as identity evidence. The mapping must be audited against the actual Mattermost user/channel, Switch account claim and a nonce message. The public protocol alone does not prove that mapping. With no reviewed mapping, human commands are ignored and no approval can commit.

## Lifecycle

1. Human posts an addressed `brief` in the room. The API records it durably and creates a writer job.
2. Writer submits complete structured scene content. API fixes brief fields and IDs, computes SHA-256 over canonical JSON, validates every action and stores proposals.
3. A durable writer outbox message asks the stage engineer to review. The stage job is created **only after the addressed message returns through Switch**, matching the expected peer and exact stored handoff.
4. Stage requests the deterministic checks and supplies explanation. Valid proposals become eligible; invalid ones remain rejected. Presentation includes artistic costs, affected beats, dependent transitions, exact candidate ID and digest.
5. Human sends `approve <proposalId> <candidateId> <digest>` addressed to stage. One transaction rechecks identity, eligibility, generation, current base, content digest, confirmed constraints and whole-scene validity before storing immutable content and approval. Alternatives become invalidated. The same transaction queues artifact links.
6. Approval does not imply rehearsal. Only a separate authenticated `outcome <revisionId> success|difficulty <observation>` creates a human rehearsal record. Automated fixtures record `source: synthetic`.

## Physical feedback and repairs

`observe <currentRevisionId> <genuine difficulty>` preserves the observation verbatim and blocks approval while interpretation is pending. The stage worker stores its interpretation separately. `confirm <observationId> left|right` explicitly confirms the MVP's supported interpretation: keep that hand free throughout. This primitive is deliberately narrow; strength, reach, balance, simultaneous movement and prop dimensions are not modeled. A different difficulty requires escalation rather than a fabricated physical guarantee.

Confirmation invalidates existing proposals. Only after all observations for the current revision are confirmed, and no edit/revocation hold remains, does it queue a Switch repair request to writer. The handoff carries its original base revision and generation; a delayed stale handoff is rejected. Repairs contain one to six complete beat replacements, capped at three alternatives. The domain preserves unaffected beat content exactly and prohibits editing the brief, props or protected-fact field. It simulates the entire six-beat sequence, including unchanged later beats. Dependent transitions conservatively include every beat at or after the first changed beat; this is not a globally minimal repair claim. Narrative consistency with the protected fact still requires human review.

## Durability and bounded work

- Inbox identity is `(worker role, documented per-agent event sequence)`; logical message identity is `(room ID, message_id)`. These are distinct from room-log sequence numbers.
- Ingestion and logical action scheduling are transactional. Duplicate commands and approvals have one effect. Conflicting copies of a message trigger an approval hold.
- Worker connections persist UUID, processed cursor and generation through API storage. Cursor acknowledgement follows durable ingestion. Gaps and takeover block rather than skipping unseen approvals.
- Jobs have 180-second leases, at most three recovery claims, and at most two model attempts reserved in SQLite across restarts. Result persistence and job completion are atomic; a completed model result is not regenerated after a crash.
- There is one writer-to-stage review round per creation/repair. Invalid or unsupported alternatives are reported to the human. There is no unbounded model debate.
- Outbox entries have deterministic logical IDs. Pending deliveries survive restart. If a process dies or a request fails after a possible remote write, delivery is **uncertain**, not blindly retried: Switch's direct message endpoint has no verified idempotency key. Reconcile room history before retrying. This intentionally favors a visible hold over duplicate creative messages.
- Disconnect stops new work; exported HTML continues independently. Already reserved provider work may finish, but persistence of its creative result requires a current connected worker state.

## Edits, deletions and revocation

Commands are treated as immutable events. If another delivered copy has the same message ID with changed content, the application invalidates outstanding proposals, flags any associated approval revoked and holds new approval. It does not silently treat the edit as a fresh command. Copies delivered without an address can still invalidate an existing command.

The documented agent event catalog does not establish reliable delivery of Mattermost edit/delete events. **Do not edit or delete operational commands to retract them.** Send a new addressed `revoke <originalMessageId>` instead. Revocation marks the log and approval, invalidates outstanding proposals and places a hold; exported files remain immutable historical records and cannot be recalled. After a revocation/edit hold, export evidence and start a fresh disposable scene; the MVP deliberately has no automatic rollback/rebase. A deployment that needs guaranteed platform edit/delete revocation needs additional verified runtime support before use.

## Storage and exposure

SQLite contains human observations and model-generated scene text; keep it local and retain only as needed. Logs contain event/job identifiers and sanitized error categories, not credentials or provider response bodies. Local read-only state and artifact URLs need no token; loopback binding, Host/Origin checks and no permissive CORS keep this suitable for a single-machine demo. Remote access and commercial multitenancy are out of scope.

## Operator delivery reconciliation

A sending lease expires after 60 seconds. A worker-only crash therefore becomes visible uncertainty even if the API stays running. Recovery does not require guessing whether the post happened. Inspect the actual Switch room history and use:

```sh
pnpm recover:delivery writer '<deliveryId>' delivered 'Verified exact corresponding Switch message ID in history'
pnpm recover:delivery stage '<deliveryId>' retry 'Inspected complete room history and verified this delivery is absent'
```

Choose only the matching decision. The CLI uses that role's local internal token and a loopback API endpoint; models have no reconciliation tool. The service accepts only uncertain deliveries, records operator evidence and permits at most three total send attempts. A retry stays pending until the owning worker connects. This is operator-assisted recovery, not an invented remote idempotency protocol.

## Interrupted work, draft retry and current rehearsal validity

Workers strip API-only checkpoint metadata on restart, preserve connection ID/cursor/generation and begin disconnected until Switch confirms the connection. The transport detects six seconds without inbound frames (documented two-second pings); API heartbeats cannot keep a silent Switch connection marked healthy. A closed socket cannot regain connected status when a delayed inbox receipt finishes.

A disconnect or graceful shutdown interrupts the active job. It remains recoverable after its existing lease, with its durable model-attempt budget unchanged. Shutdown waits up to 15 seconds for active work to settle. Malformed/exhausted model output still blocks. A reconnect during model settlement does not revive the interrupted attempt.

Before first approval, a verified human may send `@two-hands-writer retry-draft` with no arguments. Eligibility requires a preserved brief, no approved revision, no active current-generation drafting/review, no eligible candidate, and a blocked create/review job or wholly rejected alternatives. Edit/revocation holds forbid retry. There are at most two human-requested retries per disposable scene. Each increments the generation and fences stale proposals/handoffs; duplicate messages have one effect. A retry is explicit room work, not automatic model debate or API orchestration.

`needsRepair` compares the current immutable revision's constraints with active confirmed constraints. A mismatch prevents a new current success outcome and suppresses the current human-rehearsed label until a matching repair is approved and rehearsed. Earlier outcomes remain in history. An explicitly revoked or edited outcome is marked withdrawn while retaining its original words. Pending observations still hold approval separately; observation, interpretation, approval and rehearsal evidence remain distinct.


## Account routing versus human performance

The nonce audit verifies that an authenticated Mattermost account maps to the configured opaque Switch sender. It can be performed manually or through explicit user-authorized operator automation; evidence records the method. It cannot prove a person's presence at the keyboard. In this run, the user authorized the automated account diagnostic, and its nonce passed. This did not approve any scene or create human rehearsal evidence. Models still cannot infer identity, operate the performer account, or call approval operations; the deterministic API continues to require an exact scene approval message from the configured account.


On Core 0.31.0, an initial legacy stream may have ticket zero and a nonzero full position. Connection persistence now retains that position and uses it through `start_at` until a numeric event ticket is available. Positions must include the configured room. This prevents losing the initial checkpoint without changing approval ingestion, stable-message deduplication, or the fail-closed handling of genuine history gaps. See [the live compatibility correction](switch-compatibility.md#november-6-zero-ticket-recovery-correction).

A blocked transport checkpoint is sticky: late callbacks and graceful shutdown preserve it, and ordinary worker startup refuses it before constructing a model provider or opening Switch. Only reviewed operator reconciliation may replace it through the trusted API. The regression includes a server fallback position followed by a gap; restarting cannot silently adopt that fallback and skip missing history.

A connection-state frame does not acknowledge delivery of events. Existing durable checkpoints therefore survive server fallback-head frames, including a disconnect before a subsequent gap notification. Only a new head subscription adopts its initial position; successful durable event ingestion advances an existing checkpoint.
