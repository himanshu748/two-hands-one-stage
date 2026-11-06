# Verification evidence

Recorded **November 4, 2026 (Asia/Kolkata)** for the local implementation. No event registration, submission, public deployment, commit, push or publication occurred. No model-provider call or physical rehearsal occurred.

**Current status — November 6, 2026:** real Modal writer/stage calls, the addressed Switch handoff, user-delegated exact approval and artifact delivery have passed. Both links opened from the actual Mattermost channel; personal review, genuine physical rehearsal and a resulting repair remain pending. Final checks: 183 unit/service tests and 32 synthetic browser tests passed, plus lint/types/build/process checks. See [the complete live run](live-demo-20261106.md). Sections below preserve historical results and their narrower scope.

## November 6 Modal adapter and live probe

| Actual command/action | Result | Evidence boundary |
| --- | --- | --- |
| `pnpm lint` | Passed | Maintained source and tests |
| `pnpm typecheck` | Passed | Strict TypeScript |
| `pnpm test` | **173 passed, 17 files**, 8.90s | Synthetic unit/service/adapter fixtures |
| `pnpm build` | Passed | Workspaces and Vite production bundle |
| `pnpm test:e2e` | **32 passed**, 55.9s | Synthetic browser journey and offline artifacts |
| `pnpm test:process` | Passed | Startup failure/shutdown and reset safeguards |
| `pnpm readiness --offline` after configuration | Exit 0; no missing variables | Configuration only, no live Switch request |
| `pnpm verify:model` after configuration | Exit 0, requests 0 | No inference |
| Modal dashboard: create `two-hands-model-probe` | Authenticated Shared Endpoint live; CLI list confirms | GLM 5.3 Flash NVFP4; no dedicated GPU |
| `modal workspace proxy-tokens create --json --profile jhahimanshu653` | Passed; output captured privately | Credential values never printed; `.env` is mode 0600 |
| `pnpm exec tsx work/verification/modal-20261106/probe-once.mts` | Exit 0; **one HTTP 200**; strict probe schema passed | Real `ModalProvider` plus `verifyModel`, synthetic prompt; SDK retries disabled and one-request fetch guard |

Logs: ignored `work/verification/modal-20261106/{lint,typecheck,test,build,e2e,process}.log`. The one-shot harness saves a reservation before its request and refuses to rerun an existing receipt. `live-probe-1.json` records UTC start/end, HTTP status, validation and usage only. The provider reported 55 input and 243 output tokens; rate-based estimated cost **$0.00012975**, not a reconciled invoice. Only one of two authorized probes was used. No generated dialogue was persisted, no SQLite revision was created, and no Switch message or approval was sent. Full worker usage and cloud resume require a separate allowance.

The installed Modal CLI 1.5.5 lacks the documented `--shared` creation flag. The authenticated dashboard was used instead, with observed model rates and actual request examples. See [Modal setup](modal-setup.md) for sources and configuration. Earlier clean-install evidence below predates these source changes; no dependencies changed in this pass.


## Local toolchain

- Node: `v22.14.0`.
- Project package manager: `pnpm 10.34.9` (pinned by `packageManager` and lockfile). The initially available global pnpm was 12.11.2; project commands selected the pinned version.
- macOS local execution; Chromium through Playwright 1.64.1.
- Switch official source checkout: `e47cab4b7b62f1a4b1857d1cc59e4bb7bfdd8d72`. Source metadata says Core 0.31.0 and Console 0.40.1; **neither is an observed running version**.
- Initial Docker context was unavailable. In the follow-up below, a dedicated Colima profile ran Docker Engine 29.5.2, but image extraction exhausted host storage before any Switch/Mattermost service started. The failed task-owned profile was removed. No configured remote runtime or application credentials were supplied.

## Final automated checks

| Actual command | Result | Evidence scope |
| --- | --- | --- |
| `pnpm install` | Passed; lockfile generated | All eight workspace projects and declared dependencies |
| `pnpm lint` | Passed | Shared ESLint across maintained source/config/tests |
| `pnpm typecheck` | Passed | Strict TypeScript, browser/server/workers/tests |
| `pnpm test` | **123 passed, 14 files** | Synthetic/unit/service tests including identity auditing and root/workspace path consistency; 8.45 seconds |
| `pnpm build` | Passed | Package/service compilation and Vite production bundle |
| `pnpm test:e2e` | **25 passed** | Real Chromium; synthetic landing/studio state, onboarding and actual offline files; latest run 25.0 seconds |
| `pnpm test:process` | Passed | Actual local process startup/failure/shutdown and disposable reset safeguards, using dummy configuration |
| `pnpm install --frozen-lockfile --dir work/clean-install` | Passed | Isolated source copy without node_modules, build outputs, credentials or runtime data; package cache reused |
| `pnpm --dir work/clean-install build` | Passed | Reproduction from the clean installation |
| `pnpm verify:switch --connect` | **Passed against actual Core 0.31.0** | Both agent identities; health, discovery, WebSockets and read-only room operations; manual gates remain separate |
| `pnpm dev` without environment | **Blocked as intended; exit 1** | Lists missing DATABASE_PATH/HUMAN_IDENTITY_FILE; starts no synthetic app |
| `pnpm demo:reset` without environment | **Refused as intended; exit 1** | Names required explicit disposable database settings; changes nothing |
| `DATABASE_PATH=work/reset-proof/demo.sqlite DISPOSABLE_DEMO_DATABASE_PATH=work/reset-proof/demo.sqlite pnpm demo:reset` | Passed | A newly created synthetic SQLite fixture was reversibly archived; no real scene data involved |

Intermediate typechecks while parallel modules were unfinished reported missing renderer/method declarations and a Host type narrowing error; all were resolved before the final checks. A formatting invocation included SQL without a configured formatter and exited nonzero; SQL was preserved, and supported TypeScript files were formatted successfully. These are not outstanding build or test failures.

Raw local logs are under ignored `work/verification/`. Browser traces/screenshots are under ignored `test-results/` and `playwright-report/`. The repository test sources and commands reproduce the checks without those local artifacts. CI is configured to run installation, lint, types, tests, process checks, build and browser checks without private credentials; **hosted CI was not run**.

## Original unit, transport and service coverage

The table records the original 90-test baseline. Follow-up additions are recorded below.

| Area | Tests | What was exercised |
| --- | ---: | --- |
| Domain | 21 | Hand over-allocation; unknown props; initial and resulting location consistency; unavailable hands; pause duration; unsupported constraints; stable IDs; canonicalization; unaffected beat preservation; early patch breaking unchanged b5 |
| Switch client | 7 | Local HTTP/WebSocket fixtures: runtime operation discovery; documented envelopes; immediate pong during delayed durable ingestion; cursor persistence; duplicate sequence; reconnect generation; gap/takeover/ingestion-failure blocks |
| Agent runtime | 16 | Malformed structured output and exhausted retries; reservation denial; persistent budgets; role scope; disconnect before/during work; interpretation separation; exact review IDs; credential redaction; safe IDs derived from opaque events; prompt size cap |
| Application lifecycle | 30 | SQLite transaction path through synthetic human brief, writer, synthetic Switch handoff, stage review, exact approval; confirmed observation and two repairs; wrong digest/candidate; stale bases; agent/ambiguous origin; duplicates; edits/revocation; restart and result persistence; auth and artifact revision matching |
| Recovery regressions | 9 | Delayed handoff retains original base/generation; unrelated observation/revocation holds cannot be cleared; expired outbox leases; operator reconciliation; bounded redelivery |
| HTTP boundaries | 3 | Long real-shaped opaque IDs across Fastify routing; reconciliation role enforcement over HTTP; original multiline human text preserved without overflowing constraint descriptions |
| Rendering | 4 | Matching canonical digests; fixed escaped templates; injection-like text remains data; cue/script content and offline resource boundary |

The explicitly labeled fixtures are in `fixtures/`. The baseline scene is symbolically feasible. A test-only patch changes an early prop location and is rejected because the unchanged later beat expects a different location. This is a deterministic counterexample, not a manufactured live rehearsal failure.

## Browser evidence

Twenty-five Chromium tests cover the landing experiment, desktop and 375–390px studio layouts, six-beat navigation, modeled hands/props, complete repair previews/diffs, exact approval-command copying with no mutation, lead-in/timer/pause controls, keyboard focus, reduced motion, API failure/retry, malformed state, revoked approvals, and uncertain delivery status.

Artifact tests open real generated `file://` HTML with the browser context offline, advance timed cues, pause via Escape, enforce reset confirmation, finish without creating human rehearsal evidence, inspect print media, and verify no HTTP(S) requests. A separate test follows both actual artifact URLs from the synthetic Fastify/Vite application's state and checks matching revision/digest metadata.

Desktop and mobile screenshots were visually inspected. No clipped content or horizontal overflow was observed at the tested sizes. This is not a complete accessibility certification or cross-browser compatibility claim. Standalone example exports under `outputs/` are prominently labeled **synthetic test artifacts** and share one fixture-approved revision/digest.

## Startup and reset safeguards

`pnpm test:process` launches the real API, Vite and both worker entrypoints with explicitly dummy keys and an absent loopback Switch endpoint. Startup fails, all children stop, database evidence remains, process locks release, and dummy credential strings do not appear in logs. The provider receives no request. This verifies negative process lifecycle, not Switch collaboration.

The reset test refuses mismatched paths, active API/dev locks and a symlink, then archives only its own newly created disposable file and sidecar while preserving their bytes. A separate run archived an actual synthetic SQLite database. API startup also checks the reset lock both before and after acquiring exclusive ownership.

## Initial live Switch verification — historical blocker, now superseded

Before the authorized cloud run, `pnpm verify:switch` reported missing:

```text
SWITCH_BASE_URL
SWITCH_ROOM_ID
WRITER_SWITCH_AGENT_ID
WRITER_SWITCH_API_KEY
STAGE_SWITCH_AGENT_ID
STAGE_SWITCH_API_KEY
```

At that initial stage no live registration, operation invocation, WebSocket stream, actual message envelope, peer addressing, bridge identity mapping or exact human approval had been observed. Additional setup requires each worker's opaque sender ID, distinct internal tokens, a reviewed `HUMAN_IDENTITY_FILE`, and `OPENAI_API_KEY` plus an explicitly available `OPENAI_MODEL`. No account links or billing changes were attempted.

The installed-runtime capability matrix and official source URLs are in [switch-compatibility.md](switch-compatibility.md). Documentation-shaped envelopes and local transport fixtures are labeled synthetic. Console/Core source version labels do not establish runtime compatibility.

## Human physical rehearsal — pending

No person performed this scene during implementation. Every automated rehearsal record has `source: synthetic`; none establishes physical comfort, timing, artistic success or real performability.

Remaining acceptance steps:

1. Start a real Switch/Mattermost runtime and verify exact versions, operation schemas and effective addressing policy.
2. Audit the performer's account claim and bridge mapping; capture a nonce event and a distinct-agent rejection.
3. Execute the real room path: human instruction → writer → stage engineer → exact human approval.
4. Open both delivered links on the actual demonstration machine; save and play the cue HTML offline.
5. Have the person rehearse with their chosen props. Preserve their actual observation, confirm only an accurate supported constraint, compare localized alternatives, approve one exact revision and perform it.
6. Record the genuine outcome against that revision. If no difficulty occurs, report that honestly rather than manufacturing a repair success.

**Current smallest next action:** while the private cloud run is active, sign in as the performer and complete `pnpm verify:human work/cloud-switch/human-mapping.pending.json 300`. This requires a real person’s nonce; model and physical steps remain separate. See [cloud-run.md](cloud-run.md).

## Interactive redesign follow-up

The landing page and studio were redesigned after the first implementation pass. Official Boords, Arc Studio and CuePilot product pages/documented interfaces were inspected; `docs/design-research.md` records what was and was not accessed. The landing uses separate synthetic examples, with no API calls. Both repairs are checked by the actual domain validator.

The new browser coverage adds a playable tabletop, both artistic-cost alternatives, original/candidate comparison, working static exports, keyboard checkbox/FAQ behavior, real motion versus reduced motion, action stepping, prop selection toggling and tab arrow navigation. Tests use an isolated web port **5186** because an unrelated existing application occupies 5173; that application was left untouched. Default live development still fails clearly if its configured port is occupied.

A verification run encountered `ENOSPC` while writing build/test outputs. Only this task's disposable `work/clean-install/node_modules` copy was removed; source, evidence, primary dependencies and unrelated work were preserved. A subsequent build passed. Intermediate browser failures included a FAQ text selector that omitted its decorative plus sign and a prop-toggle test that expected a selected prop to remain selected when clicked again. Both assertions were corrected to match the intended, exercised controls. Final results are recorded below.

Final redesign checks: `pnpm lint` passed; `pnpm build` (including strict typecheck) passed; `pnpm test` remained **90/90**; `pnpm test:e2e` passed **18/18 in 40.6 seconds**. The last browser run used stable source files and disabled animation only during diagnostic screenshots; behavior tests separately assert real position transitions and reduced-motion snapping. One intermediate mobile screenshot timed out during an in-progress source formatting/HMR pass; the stable full rerun passed. Logs: `work/verification/redesign-browser-verified.log`, `redesign-build.log`, `redesign-lint-final.log`. The earlier clean-install reproduction preceded the interface redesign; dependencies and lockfile did not change during the redesign. Its disposable duplicate dependency folder was removed after disk pressure; the clean source copy and verification logs remain.

Updated screenshots in `outputs/` show the actual local landing and explicitly synthetic studio. The original redesign preview used 5186 and an explicitly synthetic in-memory test API. That preview was stopped; it did not run real workers or a Switch bridge.

A final manual browser pass against the actual synthetic in-memory API (not intercepted state) opened `/studio`, stepped the boat into the left hand, and reported zero page errors. Landing process/takeaway sections and the full 390px page were visually inspected; no horizontal overflow was observed.


## Docker and recovery follow-up — November 4, 2026

After the user selected local Docker, independent integration-readiness work continued:

- Restarted workers now strip server-only checkpoint metadata before strict API validation. A six-second inbound watchdog disconnects half-open WebSockets; delayed ingestion cannot resurrect a closed connection. Interrupted jobs retain durable leases/budgets and can resume instead of becoming permanently failed.
- Confirmed constraints that differ from an approved revision now mark it as needing repair. Previous rehearsal success stays historical; it cannot certify the changed requirements. Edited/revoked outcomes are explicitly withdrawn without erasing their original text or falling back to older success.
- The verified performer can request at most two `retry-draft` operations through Switch after a failed/rejected initial draft. Generation fencing rejects stale handoffs. The UI only copies commands; it cannot approve or start creative work.
- The empty studio includes a validated local brief composer with three fixed prop IDs. It supports keyboard/mobile use and offline composition, and never sends an API mutation. Seven added browser checks exercise setup, failure, retry and withdrawn evidence.
- Twenty-three added unit/service tests cover these behaviors and private local setup file preservation. Final totals: **113 tests in 12 files**, **25 Chromium tests**. Lint, strict types, build and process/reset checks passed. Logs: `work/verification/followup-{unit,browser,lint,types,build,process}.log`.

The first process rerun failed before launching children because another application owns 5173. `pnpm dev` now derives its local web port from `PUBLIC_APP_URL`; the process test uses 5187. The untouched application remains on 5173. The corrected process/reset run passed. No dependency changes were made; the earlier clean-install evidence still predates these source changes and was not repeated after storage exhaustion.

Actual local-runtime actions:

1. Verified official tag `switch-v0.31.0` at `7e57cd433a922bc91a00150c106e6ef1f15b1057` and published architecture manifests. Saved the unmodified tagged Compose file with license/attribution under `deploy/switch/`. These establish source/image availability, not a running compatible installation.
2. Ran `colima start two-hands --activate=false --ssh-config=false --mount none --cpu 2 --memory 4 --disk 12 --root-disk 8 --vz-rosetta`. Docker Engine 29.5.2 started. Rosetta was unavailable; bundled QEMU/binfmt was enabled for AMD64.
3. Ran `DOCKER_CONTEXT=colima-two-hands docker-compose --env-file work/local-switch/.env -f work/local-switch/compose.yaml --project-name two-hands-switch --profile collab --profile gateway pull`. It failed with ENOSPC/image-store I/O errors. About 6.2 GiB was free before the attempt; other host usage changed during execution. No application container started.
4. Stopped and removed only the newly created failed `two-hands` profile and its exact newly downloaded compressed VM image. The existing active context and unrelated data were preserved. Private generated credentials remain in `work/local-switch/.env` (0600); no credentials were printed.
5. `pnpm switch:local prepare` passed and preserved that file. `pnpm switch:local check` exited 1 as intended: about 3.4 GiB available versus the conservative 12 GiB project reserve. The helper never removes unrelated data. Full resume commands are in [local-switch.md](local-switch.md).
6. `pnpm verify:switch` still exited 1 listing the six missing live variables above. Live registration, exact running Switch versions, operation calls, bridge identity, artifact delivery, model calls and human physical rehearsal remain **unverified**.

The local setup helper adds `check`, `prepare`, `pull`, `up`, `status` and `stop`; it selects an explicit Docker context and loopback ports. `up` never pulls automatically. No publicly deployed resources or other chat integrations were created.


Final local preview: started the real API with a new empty `work/local-preview/demo.sqlite`, fresh in-process internal tokens and no human mapping, plus Vite on 5186. No synthetic scene was inserted and no worker/provider was started. A browser pass against this actual API verified the empty brief composer, blank initial title, zero page errors, zero mutations and no horizontal overflow at 390px. Desktop/mobile screenshots were visually inspected and saved as `outputs/brief-setup-desktop.png` and `outputs/brief-setup-mobile.png`. The studio explicitly displays Switch disconnected; instructions/approvals are disabled server-side until identity setup is complete.

## Docker Cloud preflight

At the user’s request, `sbx --cloud diagnose` confirmed authenticated API access and an active cloud entitlement using installed sbx 0.47.0. The upstream Compose stack plus the new cloud override was merged with the actual Docker Compose CLI and checked in memory: all ports remain loopback-only, affected healthcheck gates are removed, and successful authenticated init-db completion still gates Switch/Mattermost. `bash -n scripts/cloud-switch.sh` passed. No sandbox was provisioned; a bounded compute budget is pending. See [cloud-switch.md](cloud-switch.md). These checks do not change the earlier application test totals or establish a live integration.


## Authorized Docker Cloud execution and human-audit command

The user approved one 4-vCPU/8-GiB sandbox, at most two hours, $1 total compute, no model calls/public ports. `sbx --cloud create ... --ttl 2h --on-timeout stop shell` created one native AMD64 sandbox. Its actual read-only TTL reports `2026-11-04T18:44:36Z` (November 5, 00:14:36 IST). `sbx --cloud ports` reports no exposed ports. The resource remains running for the authorized private demonstration window; future auto-stop is configured, not yet observed. No second instance, extension or automatic resume was requested.

Actual commands/results:

| Check | Actual result |
| --- | --- |
| Cloud image pull and startup | Passed after one sandbox-scoped allowlist correction for Docker’s observed layer CDN; no account-wide policy change |
| `bash scripts/cloud-switch.sh check` inside sandbox | Core/Mattermost/Gateway HTTP passed; setup exited 0 |
| Mac loopback HTTP through private SSH | All three services returned 200; no public tunnel |
| Personal agent registration / room creation / explicit addressing | Passed for two distinct identities and one private project room/channel |
| `pnpm verify:switch --connect` | Exit 0; Core 0.31.0; agent-protocol 9/1; discovery plus read-only operations passed for both |
| Live peer diagnostic | Addressed delivery in both directions and post-reconnect delivery passed; three actual envelope samples saved |
| Mattermost readback | Three initial probe posts present; two separate bot authors; performer is a distinct non-bot account |
| Runtime identity database audit | First query failed safely because release 0.31.0 has `created_at`, not development source’s `verified_at`; inspected actual schema and corrected read-only query passed |
| `pnpm verify:human ... 20` with writer-bot nonce | Expected exit 1; exact nonce from wrong sender rejected; no human identity file created |
| `pnpm dev` with prepared real configuration | Expected exit 1: `HUMAN_IDENTITY_FILE` missing; no fixture fallback |
| Final lint, strict types, build | Passed |
| `pnpm test` | **122 tests / 13 files passed**, 8.62 seconds |
| Focused identity-audit rerun after error redaction | **9 passed** |
| `pnpm test:process` | Passed startup/shutdown and reset safeguards |
| `pnpm test:e2e` | **25 passed**, 25.7 seconds; fixture browser/offline artifact scope unchanged |

The new operator-only nonce command validates the reviewed mapping, rejects a bot/nonmember candidate, uses a fresh random challenge, requires exact sender/bridge/room/addressed/timestamp/content, writes a private mapping only after success and never changes `.env` or approves a scene. Nine synthetic unit checks cover its boundary. The live wrong-origin check adds actual transport evidence but does not replace a positive genuine-human event. At this stage, no nonce had been posted as the performer by automation; the subsequently authorized account check is recorded below.

Logs are in `work/cloud-switch/` (`root-command-verification.log`, `peer-probe.json`, `identity-audit.log`, `mattermost-audit.json`, `human-audit-negative.log`, `unit.log`, `browser.log`, `process.log`, `lint.log`, `types.log`, `build.log`). Private credentials and unsanitized identifiers remain ignored; shared docs contain redacted envelope examples. No model call, creative generation, human approval, live artifact delivery or physical rehearsal occurred.

The actual root `.env` is now prepared with registered identities/keys and observed distinct senders. At this stage, `OPENAI_API_KEY`, `OPENAI_MODEL` and `HUMAN_IDENTITY_FILE` were empty; the mapping was configured in the follow-up below. After the tests, the real empty API was restarted on a new `work/demo.sqlite`, with Vite on 5186, for the setup view. The application workers are not running. Previous clean-install evidence remains historical; no dependencies or lockfile changed during this cloud follow-up.

A focused read-only review found and resolved a nonce-presentation race: the actionable challenge is now printed only after the Switch connection is ready, preventing an early human post from being missed by the head subscription. It also prompted preservation of existing `.env` in setup prose and removal of stale no-live-envelope claims. Final lint/types and the nine nonce-boundary tests passed again. At this stage, positive CLI verification/file creation was pending; the subsequently authorized operator check is recorded below. Fixture acceptance was not substituted. A local credential-value spill check found zero matches across 102 maintained/output text files.


## Automated account verification requested by the user

After the user said to perform the nonce step, the operator used the audited performer account to post one diagnostic nonce through the real Mattermost API. The same nonce arrived on the authenticated Switch connection with the exact expected room, bridge, sender and address flag. `pnpm verify:human ... 120 --operator-automated` exited 0 and saved the private mapping (0600), with explicit automated provenance and no claim of human presence, scene approval or rehearsal. The root `.env` mapping was configured after matching the saved evidence to the administrative audit and returned Mattermost post receipt. The session was logged out after posting. No scene approval or outcome was sent.

A subsequent `pnpm dev` fails only on **OPENAI_API_KEY, OPENAI_MODEL**. Model calls remain excluded from the approved Docker-only budget. This replaces the earlier pending manual nonce setup step; it does not replace the genuine creative/physical acceptance journey.

A real launch-directory bug was found while loading the configured mapping: filtered API startup resolved `.env` paths under `apps/api`, unlike root `pnpm dev`. Database and identity paths now anchor to the repository root. A process regression test loads the same synthetic configuration from both directories; both resolve the same database and identity. The previous preview database was empty and preserved. Restarted filtered API startup now creates the lock at root `work/demo.sqlite.api-lock` and loads the verified mapping successfully.

Final checks after this fix: lint/types/build passed; **123 tests in 14 files passed (8.45s)**; process/reset safeguards passed; **25 Chromium tests passed (25.0s)**. Logs: `work/cloud-switch/account-{lint,types,build,all-unit,process,browser}.log`. The actual positive account audit is in `account-check.log` and private `account-post-receipt.json`. It is live operator automation, not fixture evidence and not human approval.

## November 5: rehearsal handoff and readiness follow-up

Added a local rehearsal-message composer tied to the immutable approved revision. It prepares the performer’s own observation or outcome for Mattermost, requires explicit performed confirmation, handles clipboard failure/pending state, and discards a command when approval/revision state changes. It neither sends messages nor writes rehearsal evidence. Added `pnpm readiness [--offline]`, a read-only configuration and bounded bridge-health check.

The following commands were run from the project root on Node 22.14.0 with pnpm 10.34.9:

| Command | Actual result |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | 136 passed in 15 files |
| `pnpm build` | Passed |
| `pnpm test:e2e` | 32 Chromium tests passed; synthetic scene and transport fixtures |
| `pnpm test:process` | Passed: negative startup/shutdown and disposable reset safeguards |
| `pnpm readiness --offline` | Exit 1 as expected: model configuration absent; health explicitly not checked |

Logs: ignored `work/verification/followup-20261105/`. See [workbench follow-up](workbench-followup.md) for responsive/keyboard/clipboard evidence and [readiness follow-up](readiness-followup.md) for the separate read-only health check and stopped-sandbox receipt. No cloud runtime was resumed, no model request was made, and no physical performance is represented by the automated browser tests.

## November 6: real Modal and Switch collaboration

The full live run and its failures, repairs, costs and provenance are recorded in [live-demo-20261106.md](live-demo-20261106.md). Both workers generated/reviewed a real scene through Switch; the user delegated posting its exact approval, and matching cue/script links were delivered through Switch and opened from Mattermost. Personal review and physical rehearsal are not claimed.

Final checks: `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test:process` exited 0. `pnpm test`: **183 passed in 17 files, 11.65s**. `pnpm test:e2e`: **32 passed, 44.9s**, synthetic browser/offline fixtures. Logs: `work/live-demo-20261106/accepted-*.log`. No new dependency or lockfile changes. Restart retained the exact candidate and both connections without an extra model call. This supersedes earlier probe-only/current-runtime statements; prior sections remain historical evidence.

The actual cue player advanced through beats over HTTP, paused with Escape and reset successfully. Both HTML copies were saved in `outputs/a-place-for-you/`. Saved-file navigation was blocked by the in-app browser policy; no bypass was attempted, so that exact local-file check remains manual. A scan of 122 maintained/output text files found no configured credential values. Relative Markdown targets passed. Docker Cloud subsequently confirmed the project instance stopped at 07:25:31 UTC; application/worker shutdown was clean and the database was preserved.

## November 6: first-use clarity

The player now explains the activity, names the three objects, offers read-through before timing, and puts speech directly in the ordered actions. The studio adds a getting-started guide, while technical details remain inspectable. See [clarity-followup.md](clarity-followup.md).

Actual final commands: `pnpm lint`, `pnpm typecheck`, `pnpm build` exited 0; `pnpm test` passed **183 tests / 17 files in 11.71s**; `pnpm test:e2e` passed **36 tests in 47.9s**. These browser tests use synthetic fixtures and include offline file playback, keyboard pause/reset, read-through without starting, mobile/reduced-motion layout, print output, escaping, approval clipboard denial and withheld draft/repair calls to action.

Logs: `work/verification/clarity-20261106/final-{lint,types,tests,build,e2e}.log`. After regenerated public examples exposed an ambiguous old `/Start/` test selector, it was changed to the exact accessible name; the final complete suite above passed. A read-only review found two issues—hidden clipboard fallback and printed instructions referring to nonexistent timer controls—which were corrected and covered. No dependency or lockfile changed.

Both actual approved exports returned HTTP 200 with the same original revision/digest. Earlier copies were archived before refreshing `outputs/a-place-for-you/`. The actual API still has one historical delegated approval and zero rehearsals. The local API/web preview is running, with both Switch workers off and cloud status confirmed stopped. No model request or chat message occurred in this follow-up. An exact-value credential spill scan across 136 maintained/output text files found zero matches.

Browser readback of the actual approved player confirmed all six parts can be shown without starting playback. The real studio showed the named props, script/player links and getting-started instructions. Screenshots saved and visually inspected: `work/verification/clarity-20261106/player-final.png`, `studio-final.png`, plus synthetic mobile screenshots from the final browser suite. A stale browser error tab was not usable; the later normal HTTP preview opened successfully once local services were restored after interruption. No browser security warning or URL restriction was bypassed.

## November 6: visible Switch collaboration and public example

The room now shows saved identity-checked Switch receipts beside the scene. Its real local scene retains one historical delegated approval and zero rehearsals. `/example` separately contains labeled synthetic exchanges and two repairs. See [collaboration-room.md](collaboration-room.md) and [hosting.md](hosting.md).

Lint, strict types and build passed. Unit/service suite: **192 passed in 19 files**. The full browser run passed **43 cases**, with one outdated landing-link expectation after changing the public route; corrected and rerun separately. Seven focused room cases passed, including holds, pending review, missing history and keyboard isolation. Logs: `work/verification/collaboration-room-20261106/`. No model call, cloud restart or rehearsal evidence was created by this follow-up.

Public release follow-up: the four landing browser cases passed after updating the route expectation (10.5s). All eight room/public-isolation cases also passed in a focused rerun; the full earlier run's other 43 cases passed. Final synthetic generator checks passed after recording fixture notification receipts in chronological order. Static production deployment reached READY on the verified Hobby team; anonymous HTTP returned 200 for `/`, `/example`, its labelled snapshot, cue player and printable script; `/studio` redirected explicitly to `/example`. No hosted API or model worker is claimed. The publication scan reviewed 16 intentional synthetic credential literals and found zero configured credential values among staged files. Process/reset checks passed.
