# Switch compatibility and live acceptance

Live protocol verification date: **2026-11-04**. Read-only lifecycle follow-up: **2026-11-05**. This document separates official source inspection, local synthetic transport tests, and a real deployment. **Core 0.31.0 was observed in the authorized private Docker Cloud run. The sandbox is now stopped, confirmed by a November 5 read-only check; current bridge health is unavailable. Registration, WebSockets, addressed peer delivery and reconnect delivery passed live checks. Performer account linkage and nonce routing were verified through user-authorized operator automation. The creative collaboration chain, human scene approval and artifact delivery remain pending.**

## Exact versions and evidence boundary

| Component | Observed value | What it establishes |
| --- | --- | --- |
| Official repository checkout | `e47cab4b7b62f1a4b1857d1cc59e4bb7bfdd8d72` | Source inspected under `work/research/switch`; a development checkout, not an installed server |
| Core source metadata | `0.31.0` in `core/pyproject.toml` | Source package label only |
| Console desktop source metadata | `0.40.1` in `console/apps/switch-console-desktop/package.json` | Source package label only; no compatibility claim for a binary |
| Last observed running Core (November 4) | **0.31.0** | Actual Gateway login and authenticated connection_state; agent-protocol speaks 9 / accepts 1; gateway-api 1 / 1 |
| Last observed running Mattermost (November 4) | **11.9.0** | Live X-Version-Id header, private channel and user/post API checks |
| Cloud runtime | Docker **29.9.2**, Compose **5.6.1**, sbx **0.47.0** | Actual AMD64 sandbox, 4 vCPU / 8 GiB, two-hour server expiry |
| Installed/running Console | **Unverified** | No Console runtime inspected |
| Docker daemon | **Installation attempted; stopped** | Dedicated Colima profile ran Docker 29.5.2; Switch image extraction exhausted host disk. New empty failed profile removed; default context preserved. |
| Local Node used for verification | `22.14.0` | Application toolchain only, not Switch |

The client does not pin a guessed Core/Console combination. A real authenticated `connection_state` supplies `server.version` and protocol information. A missing version remains unknown. During the November 4 run, the actual root command `pnpm verify:switch --connect` passed; sanitized metadata is recorded in `work/cloud-switch/root-command-verification.log`. No Console binary was installed.

The saved account mapping and live envelopes remain historical evidence, not proof of a currently available runtime. Run `pnpm readiness` for a read-only current prerequisite report; after authorized runtime restoration, rerun the transport checks below and re-audit linkage if account, bridge or database state changed.

## Official sources inspected

- [Switch repository](https://github.com/sandbox-quantum/switch), including the [source checkout](https://github.com/sandbox-quantum/switch/tree/e47cab4b7b62f1a4b1857d1cc59e4bb7bfdd8d72).
- [Getting started](https://docs.switchagents.ai/switch-rooms/getting-started): Docker/runtime setup, Mattermost and account linking.
- [Agent protocol](https://docs.switchagents.ai/switch-rooms/internals/agent-protocol): registration, HTTP operations, discovery, message posting.
- [Agent connection](https://docs.switchagents.ai/switch-rooms/internals/agent-connection): socket envelope, resume, fencing, pings and gaps.
- [Agent events](https://docs.switchagents.ai/switch-rooms/internals/agent-events): stable message IDs, per-agent sequences, opaque participant IDs.
- [Identity and access](https://docs.switchagents.ai/switch-rooms/internals/identity-and-access): linked platform claims and addressing rules.
- [Collaboration bridge](https://docs.switchagents.ai/switch-rooms/internals/collaboration-bridge): per-user participants and cross-platform identity boundaries.
- [Room templates](https://docs.switchagents.ai/switch-rooms/administer/room-templates): room provisioning; a template does not establish application delivery or human approval.

Some HTML pages failed through the web reader. Their public official `.md` equivalents were retrieved successfully and inspected. The implementation uses released documentation for the protocol and names the checkout where source inspection resolves envelope details. It does not treat source metadata as proof that all current documentation works in a release.

## Registration and connection

`pnpm register:agents` uses the documented `POST /agents` with a **registration** key. It creates `two-hands-writer` and `two-hands-stage`, each with a separate returned API key and `session_addressable` profile. It never uses `register-known` or `overwrite`. The one-time credentials are written to `work/switch-registration.env` with mode `0600`, not printed. Reuse them across launches. If the second registration fails, the first key is preserved and the script refuses an unexamined rerun.

Registration is an explicit setup command, not an automatic startup side effect. Both live agents were registered with a personal key created under the seeded performer-linked Gateway owner. The deployment bootstrap key would attribute agents to a separate bootstrap account and was not used. The same real human should own both agents. Invite both to the one room linked to the one Mattermost channel.

Each worker opens `/agents/{agent_id}/connection/ws` with its own bearer key, stable persisted `connection_id`, `rooms=<configured room>`, `scope=single`, and `filter=all`. HTTP(S) becomes WS(S). Non-loopback HTTP is rejected to avoid sending bearer credentials unencrypted. The client uses the room and cursor from `connection_state`; it checks the returned agent, connection and room. Browser code has no transport credentials.

## Runtime operations and addressing

The package discovers `GET /agents/{agent_id}/ops` and requires `read_context`, `list_participants` and `get_agent_detail`. Every operation call checks that the name and argument names are advertised; the runtime remains authoritative for full signature validation. Calls use unwrapped JSON and `X-Switch-Connection-Id`.

Outgoing worker handoffs use documented `POST /agents/{agent_id}/message` with `{room_id, content}` and an explicit `@two-hands-writer` or `@two-hands-stage` mention. The API's durable outbox must remain pending while the intended room is disconnected. Transport success is not proof that another agent was addressed; the first live chain must establish that each intended recipient receives `payload.addressed: true`.

**Observed documentation conflict:** the protocol page describes owner-only default addressing and self-updates; the identity page describes owner-plus-owner-agents defaults and owner-controlled settings. At the inspected commit, `update_agent_detail` also says it cannot change the caller's own settings. The application therefore neither relies on a default nor silently expands access. In Console, have the owner explicitly permit the performer and the other worker in the single room. `owner_and_owner_agents` is adequate only if those identities share the verified owner; custom rules can narrow the room. Verify the effective policy against the installed runtime.

## Trustworthy Mattermost performer mapping

A display name, a bot account, a room role, an `addressed` flag, or an ID string that looks human is **not** proof of the performer. Participant IDs are opaque. `list_participants` can aid inspection but its external-user row ID must not be confused with the event sender. The deployed event sender is `Client.transport_user_id`, physically stored in `clients.matrix_user_id`, not `clients.id`, an agent ID, or an external-user row ID.

Before enabling live approval:

1. Link the performer's real Mattermost account to the intended Switch owner using Console's account-linking flow. Confirm the actual Mattermost account ID and single channel ID, not only its name.
2. With an authorized operator, inspect the bridge's mapping from that Mattermost account ID through `external_users.client_id` to the per-user `clients.matrix_user_id` event sender and the linked Switch claim. The source model connects `external_users.bridge_id`, `external_user_id`, and `client_id`; verify the equivalent relationship in the actual runtime using its supported administrative UI or operator tools. Do not invent an agent endpoint for this audit.
3. Verify a fresh nonce from the performer account in that channel. The person may post it manually; an explicitly user-authorized operator diagnostic may also post it, provided that automated provenance is recorded and never presented as scene approval or human presence. Observe it on the authenticated worker stream and match the complete opaque `sender`, `bridge_id`, and `room_id` against the audited mapping. Confirm a separate account and an agent cannot produce the same origin. Never promote a shared webhook/bot sender into a human merely because the nonce text matches.
4. Record the verified IDs in private local configuration. Keep live human processing disabled until this step is complete. Audit the mapping again after relinking accounts, rebuilding a bridge, restoring its database or changing the authorized performer.
5. Exercise a real instruction → writer → stage engineer → human approval. Check the selected candidate ID and SHA-256 digest in the recorded approval, then open both returned artifact links from the actual demonstration device/browser.

The inspected Mattermost adapter rejects link attempts for webhook stand-ins and bot accounts. This is useful source evidence, **not evidence that an unspecified installed version enforces it**. See [adapter at the inspected commit](https://github.com/sandbox-quantum/switch/blob/e47cab4b7b62f1a4b1857d1cc59e4bb7bfdd8d72/core/switch_core/bridges/collaboration/mattermost/adapter.py).

There is no invented Switch signature or signed human assertion. The trusted ingestion boundary is the authenticated server-side Switch connection, its fixed room/bridge/participant allowlist, and trusted deterministic worker/API code. Model output cannot select the author or call an approval operation. Local internal credentials authorize trusted processes, not arbitrary callers or models.

## Reconnect, delivery and message changes

The per-agent numeric event `id` must match `data.sequence`. The durable application inbox also deduplicates stable `payload.message_id`, because message identity and stream position are different concepts. The client calls durable ingestion before advancing/persisting its cursor, and answers ping frames immediately using the last committed cursor. On reconnect it reuses the connection ID and supplies both `start_from` and `expected_generation`. Reconnect attempts have exponential backoff, jitter and an eight-attempt budget.

A takeover, permanent refusal, unknown frame or failed durable ingestion blocks processing. `gap` also blocks collaboration rather than silently accepting missing approval history. An operator must reconcile `read_context` and outstanding application state before resetting recovery metadata. The package never automatically reclaims a connection after `taken_over`.

Outgoing HTTP posting has no documented application idempotency key. A timeout after server acceptance can cause a repeated notification on retry. Application task/proposal identifiers and inbox deduplication prevent repeated revision effects; delivery is held as uncertain until operator reconciliation; this is not an exactly-once chat-delivery guarantee.

The currently documented event catalog has message, command and join events, but no dependable inbound edit/delete event contract for this application. Existing instructions and approvals are treated as immutable receipts. The human must use an explicit new `revoke <messageId>` command to invalidate affected pending work; the UI/documentation must not imply that editing/deleting a Mattermost post retracts an accepted approval. Live edit/delete propagation remains a manual compatibility check. A changed body replayed with the same stable message ID must be treated as a conflict, never a new independent approval.

## Envelopes and verification commands

**Actual live agent message envelopes were collected on November 4, 2026.** The following example comes from an addressed writer-to-stage transport probe in the private channel. IDs, names and content are redacted; numeric sequence/timestamp and envelope shape are preserved. It is live transport evidence, not a human instruction or rehearsal:

```json
{"event":"message","id":9007194959773696,"data":{"type":"message","room_id":"<room>","bridge_id":"<bridge>","channel_type":"channel_private","sequence":9007194959773696,"payload":{"addressed":true,"sender":"<opaque-participant-id>","sender_name":"<redacted>","message_id":"<stable-message-id>","body":"<redacted>","timestamp":1793811127794,"thread_id":null}}}
```

The control-frame shape is `{"event":"ping","data":{}}`; the client answers `{"type":"pong","cursor":42}`. No bearer keys appear in envelopes or evidence.

```sh
pnpm verify:switch
# HTTP health + operation discovery. Does not take over running workers.

# Stop workers first: rooms= claims the room and can evict an active worker.
pnpm verify:switch --connect
# Adds WebSocket connection_state and read-only room operations.
```

Missing configuration exits nonzero with variable names only. `--connect` outputs authenticated server metadata and sanitized actual envelopes only if any arrive during the brief check. It always reports human identity, approval and physical rehearsal separately; transport success cannot satisfy those steps.

## Verified versus unresolved

- **Implemented and locally tested with synthetic fixtures:** schema discovery/refusal, correct socket/control shapes, immediate pong during unfinished ingestion, cursor advancement only after persistence, duplicate sequence handling, reconnect fencing, gap/takeover blocks and ingestion-failure blocks.
- **Live verified:** distinct agent registration/keys, intended-room WebSocket connections, runtime operation discovery, list_participants/read_context calls, addressed message posting both ways, reconnect delivery, and the three corresponding private Mattermost channel posts. Performer account linkage and non-bot status were administratively audited.
- **Not live verified:** a genuine human scene instruction/approval, replay after a Switch server restart, and worker creative/model execution. An automated diagnostic nonce from the authorized performer account was observed live; its provenance is recorded.
- **Pending:** intended-room creative collaboration milestone, exact human scene approval and real-device artifact delivery. Model credentials/configuration are absent and model calls were excluded from this cloud authorization.
- **Pending physical acceptance:** a person performs the scene, reports a genuine difficulty and performs the selected approved revision. No synthetic fixture is rehearsal evidence.

## Local Docker attempt after user selected that deployment path

On November 4, 2026, isolated Colima 0.10.3 profile `two-hands` started Docker Engine 29.5.2. The active Docker context was unchanged. Official tag `switch-v0.31.0` was verified at `7e57cd433a922bc91a00150c106e6ef1f15b1057`; its published Core manifest advertised ARM64 and AMD64. The tagged Compose file is preserved under `deploy/switch/` with attribution/license. It pins Mattermost 11.9.0 and selects Core/Gateway/setup 0.31.0. This records the attempted deployment selection, **not verified running Switch versions**. No Console version is assumed or installed.

The pull failed during extraction with host `ENOSPC` and image-store I/O errors. No Switch container started, so no registration, room, actual envelope or mapping evidence was obtained. The newly created empty failed VM/image store and exact download cache were removed; sources and generated local secrets were retained. The helper now refuses pulls below a conservative 12 GiB host-space reserve. See [local-switch.md](local-switch.md) for commands, endpoints, cleanup scope and acceptance steps.

The client now detects six seconds without an inbound frame and exposes connection loss before queued persistence completes. Restart and interrupted-work recovery were verified against synthetic transports and the actual local application API, not this failed runtime installation.


## Actual Docker Cloud integration — November 4, 2026

The user authorized one sandbox with at most two hours of runtime and a $1 total compute budget. Native AMD64 deployment succeeded in `two-hands-switch-20261104`, with loopback SSH forwarding to Core 18000, Gateway 13000 and Mattermost 18065. No cloud port was published. Tagged image digests and command logs are in `work/cloud-switch/`; [cloud-switch.md](cloud-switch.md) records the deployment, cost bound and expiry.

Gateway flow exercised: `POST /gateway/auth/login`, session-cookie `POST /gateway/api-keys`, personal-key `POST /agents` twice, `GET /gateway/collaborations`, `POST /gateway/rooms`, `GET /gateway/auth/me/identities`, and `PUT /gateway/agents/{id}/addressing-policy`. Exactly one private project room/channel was created. Mattermost's default system channels exist outside this workflow; each worker subscribes only to the project room and its explicit policy allows only that room, the performer and the peer.

Effective rules use `rooms:[projectRoomId]`, `room_groups:"*"`, `users:[linkedExternalUserRowId]`, `agents:[peerAgentId]`, with `owner`, `owner_agents` and `platform` all false. The response confirmed these settings. Omitting these fields or using an empty group list is not presumed equivalent.

The deployed identity-claims table has `external_user_id`, `user_id`, `created_at` and `tenant_id`; it does **not** have the `verified_at` column seen in newer development source. The live identities response also does not include `verified:true`. A first read-only query failed on that difference; schema inspection and a corrected read-only join confirmed the linked Gateway owner, exact Mattermost account, room membership, bridge/channel IDs and distinct opaque human sender. Separate Mattermost readback confirmed `performer` is not a bot; both agent post authors are bots. No message was sent as the performer during this audit.

The private `.env` now holds actual room/agent IDs, keys and observed agent senders. At the initial transport pass, `HUMAN_IDENTITY_FILE` was left empty and the pending candidate was not enabled. The subsequently authorized automated account check below completed that step; `pnpm dev` now fails only on the missing model key/name. No human approval was accepted and no model call was made.

The operator-only `pnpm verify:human <reviewed-candidate.json> [seconds]` command supports the fresh nonce step without model configuration. Its trusted candidate contains the administratively audited room/bridge/transport sender/account/channel and non-bot membership evidence. It requires exact addressed challenge text from that origin after startup, saves a mode-0600 mapping only on success, and does not edit `.env` or invoke application approval. Its live negative check rejected a writer-bot post with the correct nonce. Positive human acceptance remains pending.


## User-authorized automated account check

After the initial manual-step handoff, the user explicitly asked the operator to perform the check. Using the audited performer account, an automated nonce was posted through Mattermost and matched on the real Switch stream. The command exited 0, wrote the private identity file, and the reviewed mapping was configured. The recorded evidence explicitly states the posting method and does not claim a person was at the keyboard. An account routing check proves the transport/account mapping; it does not create a scene approval, prove human intent for a candidate, or certify rehearsal. The runtime model agents have no performer login credential or approval tool. At the end of that run, root startup stopped at missing model key/name rather than identity setup. The November 5 readiness check also reports unavailable bridge health while the sandbox is stopped.


## November 6 zero-ticket recovery correction

A live restart exposed an initial-checkpoint mismatch in Core **0.31.0 / agent-protocol 9**. For a legacy `filter=all` connection, the actual `connection_state` contained `cursor: 0` plus a full `position`, for example `{"s":4294967297,"r:<room>":12}`. Zero is not a usable replay ticket before an event arrives. Saving only zero caused a replay gap after restart, even though the room had not changed.

The client now validates and persists the full position, including the configured room. When its ticket is zero, reconnect uses the documented `start_at` JSON position. Once an event has been durably ingested, reconnect uses its numeric ticket as before. The client still requests legacy ticket envelopes; it does not declare position-only event decoding. Genuine `gap` frames still block and are never silently skipped.

This behavior was checked against the installed runtime's actual control frame and official tag [`switch-v0.31.0`](https://github.com/sandbox-quantum/switch/tree/switch-v0.31.0), particularly `core/switch_core/bridges/agent/protocol/stream.py` and `api/handlers.py`. The tagged implementation accepts `start_at` independently of the protocol declaration and reports the complete position even to legacy ticket clients. Four added synthetic tests cover pre-event reconnect, saved-position restart, preferring a committed ticket, missing-room rejection and API/worker checkpoint persistence (some cases share a test).

Before applying this correction to the private demo, the operator read all 12 room-history entries through both identities. Both non-truncated histories matched and contained only room joins, agent welcome messages, transport diagnostics and identity nonces. The application had no brief, jobs, revisions, proposals, approvals, deliveries or rehearsals. That audited empty-state recovery used the API to save fresh checkpoints; it did not rewrite SQLite directly or discard creative work. Afterward both workers connected and the selected brief traversed Mattermost and Switch to the writer. Private receipts are in `work/live-demo-20261106/`.

Further review hardened the gap boundary: a saved checkpoint is never replaced by the server's fallback head in `connection_state`, even if the socket closes before the following `gap` frame. Tests cover a saved numeric ticket, zero plus full position, and legacy zero without position. A blocked checkpoint survives late callbacks and shutdown; restarting refuses it before opening a transport or provider. Only the audited empty-state reconciliation described above replaced the demo checkpoint.

## Separate Lightsail deployment — November 6, 2026

The new hosted environment reuses the existing selected Lightsail server; the earlier Docker Cloud environment remains stopped. Actual installed Core 0.31.0 has image digest `sha256:03b2ea9caa38f235878f3d872ca99dee74c6bda7a731ea01a209edc739699c1d`; Mattermost 11.9.0 has digest `sha256:1c538cf33c2144ba2c825571cd414aaaebf8d8c231d4b18081b811cd0ca0ef2a`. No Console was installed or compatibility inferred. Official tag `switch-v0.31.0` supplied the reviewed room-create, registration, addressing and identity schemas. Invalid initial operator configuration (`telemetry_environment=development` and an unlabelled master key) was corrected to the actual `local` enum and `<id>:<secret>` contract before boot succeeded; no incompatible runtime was substituted.

Both workers were freshly registered using a personal registration key under the performer-linked owner. A new private room/channel and explicit room/performer/peer allowlists were created; old room credentials and identity evidence were not reused. An administrative read-only join checked `external_users → clients.matrix_user_id → external_user_claims → users`, the actual room owner and each agent's owner/sender. Mattermost confirmed the non-bot performer and private-channel membership. A fresh, user-authorized operator nonce arrived on the authenticated stage stream and enabled the mapping. The immediate room-create response omitted its owner fields; the authoritative stored owner relationship was checked separately. This was a compatibility observation, not permission to infer a display-name identity.

`verify:switch` passed both HTTP health and the three required operation discoveries without claiming an active worker connection. Its generic output deliberately leaves identity/approval pending; the separate administrative audit and nonce are the evidence for account routing. The running workers independently connected, persisted real events and exchanged addressed writer→engineer review requests, followed by engineer alternatives in the intended Mattermost channel. Genuine invalid action preconditions were rejected, retained and supplied to a later explicitly requested redraft; the resulting hosted candidate passed whole-scene checks. The user subsequently authorized this exact candidate/digest, and operator-posted approval was accepted through the verified Mattermost origin. Both resulting links were opened from the actual hosted chat and downloaded cue playback worked offline. No model was allowed to approve, impersonate the performer, or create rehearsal evidence.

The public workbench uses HTTPS and performer authentication; the private agent bridge stays on loopback. Actual Mattermost browser login and live workbench delivery were checked at the hosted URLs, not inferred from a room document. Graceful application-service restart reconnected both workers and preserved six jobs, two proposal digests/statuses and eight model reservations without duplicate effects. Cold host boot, forced-kill lock recovery and a genuine physical rehearsal remain separate acceptance steps. See [Lightsail deployment evidence](lightsail.md).
