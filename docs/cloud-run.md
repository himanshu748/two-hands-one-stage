> Current follow-up: the existing private runtime was resumed for the bounded November 6 model/worker demonstration. Historical stopped/probe-only statements below describe earlier runs. See [November 6 evidence](live-demo-20261106.md) for the latest evidence. That follow-up is now stopped, confirmed November 6 at 07:25:31 UTC.

# Private Docker Cloud run — November 4, 2026

**Historical live infrastructure and agent transport were verified on November 4. The project sandbox is now stopped, confirmed by a read-only list on November 5. Creative/model execution and human approval remain pending. No resume or new spending occurred in this follow-up.**

## Access during the authorized run

- [Gateway](http://127.0.0.1:13000/)
- [Private Mattermost channel](http://127.0.0.1:18065/two-hands/channels/two-hands--one-stage)
- [Application studio](http://127.0.0.1:5186/studio) — API setup view; account mapping is configured, but creative workers await model configuration.

These addresses were used through private SSH forwards on this Mac during the authorized run. They are not public deployment URLs or currently available runtime links: the sandbox is stopped. Mattermost sign-in is `performer`; its password is the `MATTERMOST_USER_PASSWORD` value in the private local `work/local-switch/.env`. Gateway uses the email/password in that same file. Open the file locally; never paste its contents into chat or a shared document.

The project’s root `.env` now contains the actual agent IDs/keys, distinct observed sender IDs, room ID, loopback bridge address and fresh internal tokens. It has mode 0600 and is ignored. Preserve it and `work/switch-registration.env`; do not register replacement agents.

## Compute allowance and lifecycle

The user explicitly approved **one 4-vCPU / 8-GiB sandbox, at most two hours, with a $1 total compute budget**, no model calls and no public ports.

- Name: `two-hands-switch-20261104`
- ID: `sbx_001m6kq5eeavyhzvf5z4mc62f6q`
- Native `x86_64`; Docker 29.9.2; Compose 5.6.1; sbx client 0.47.0.
- Created November 4 at approximately **10:14 p.m. IST**.
- Server expiry: **November 5, 12:14:36 a.m. IST** (`2026-11-04T18:44:36Z`). Creation requested `--ttl 2h --on-timeout stop`; the live TTL readback confirmed the expiry. That expiry was a configuration observation, not proof of auto-stop. The user subsequently requested stopping the sandbox; a November 5 read-only list now confirms `stopped`, without attributing that state to the TTL mechanism.
- Published price: $0.28/hour; the full two-hour compute estimate is **$0.56 before taxes/credits**. Actual invoice/credit consumption is not yet available. No second sandbox, extension or resume was created.
- `sbx --cloud ports` reported **No exposed ports**. SSH listens only on 127.0.0.1 for 13000, 18000 and 18065. PostgreSQL is not forwarded.

To end the run early:

```sh
sbx --cloud stop sbx_001m6kq5eeavyhzvf5z4mc62f6q
sbx --cloud ls --json
```

Verify the stopped state through the read-only list. Do not run `exec`, `attach` or `run` afterward just to check it: those commands can resume a sandbox and restart billing/TTL. No automated resume loop is configured. Stopping retains state; do not delete the sandbox or volumes containing later human work without reviewing retention. The tunnel command is recorded in the ignored run logs, and its task-owned SSH PID is recorded in `work/cloud-switch/budget.json`.

## What actually passed

1. Official tagged Core/Gateway/setup 0.31.0, Mattermost 11.9.0 and PostgreSQL 16 images pulled and started. The first pull required adding Docker’s observed `production.cloudfront.docker.com:443` layer endpoint to this sandbox’s allowlist. Account-wide policies were untouched.
2. PostgreSQL authenticated initialization completed using its container main process. The cloud override avoids Docker’s documented `exec`/healthcheck limitation. Core, Mattermost and Gateway returned HTTP 200 from both the sandbox and private Mac forwards; the setup container exited 0.
3. Gateway reported Core **0.31.0**, gateway-api contract **1/1**. Authenticated WebSocket states reported Core **0.31.0**, agent-protocol **speaks 9 / accepts 1**. Mattermost’s response header reported **11.9.0**. No Console application was installed.
4. A performer-linked personal registration key created two distinct agents. One private project room/channel was created. Both addressing rules explicitly restrict the room, linked performer and peer.
5. `pnpm verify:switch --connect` passed for both identities: runtime operation discovery, WebSocket connection, `list_participants` and `read_context`.
6. Live diagnostic messages were addressed writer → stage and stage → writer. A subsequent message reached stage after reconnect with its saved cursor/generation. Sanitized actual envelopes were saved. Three corresponding probe posts were read back from the private Mattermost channel, attributed to the two distinct bot accounts.
7. A read-only runtime database audit confirmed the performer account’s bridge, linked Gateway owner, room membership and opaque transport sender. Mattermost confirmed this account is not a bot. The deployed claims table has `created_at`, not the newer development source’s `verified_at`; the first schema-dependent query failed safely and the corrected read-only query passed.
8. A no-model `verify:human` command now checks a fresh nonce against the exact audited sender, bridge and room. A live writer-bot attempt using its exact nonce was rejected: command exited 1 and no human identity file was created. This was an automated origin test, not a human action.

Raw local evidence, private IDs and budget state are under ignored `work/cloud-switch/`. Public-safe envelope shapes and image provenance are in `docs/switch-compatibility.md`. The initial probes were sent as agents. A later explicitly authorized performer-account nonce is described below; no scene, approval, successful rehearsal or model response was fabricated.

## Account verification completed by operator automation

At the user's explicit request to do the check, the operator authenticated the seeded performer account, posted a fresh nonce through Mattermost, and observed it through the authenticated stage-agent Switch connection. Exact account, sender, bridge, room and channel checks passed. The operator logged the Mattermost session out afterward.

`pnpm verify:human work/cloud-switch/human-mapping.pending.json 120 --operator-automated` exited 0 and wrote `work/human-identity.json` (0600). Its evidence explicitly records **user-authorized operator automation** and says it verifies account routing, not a person's presence at the keyboard. The reviewed mapping is now configured in root `.env`. The earlier writer-bot attempt remained rejected. No scene approval or rehearsal outcome was posted or recorded.

The helper still supports manual checks for new/re-audited mappings. It prints the challenge only once connected, refuses an existing identity file, and records whether posting was manual or automated. Its candidate is trusted operator input, not a signature supplied by Switch. Re-audit after account relinking, bridge changes or database restoration. Do not re-run it over the already verified file.

## Remaining startup prerequisites

At the end of the historical run, `pnpm dev` stopped on **OPENAI_API_KEY** and **OPENAI_MODEL**. On November 5 both remain absent, and the user confirmed that no OpenAI API key is available. The project sandbox is also stopped and bridge health is unreachable. `pnpm readiness` now reports these independent blockers together without starting any service or model call. Preserve existing configuration; do not treat setting a key as authorization to spend. Model calls and any new cloud execution remain outside the earlier Docker-only allowance. No key, model or unrelated account was substituted.

Only after runtime access and model configuration/usage are separately authorized, recheck the restored runtime and identity mapping, stop any task-owned API/web preview, and run `pnpm dev`. The person can compose their actual brief in the studio and send it in Mattermost. Complete the real brief → writer → engineer → exact approval workflow, open both delivered artifacts, and perform the scene. Creative/model execution, genuine human scene approval and physical rehearsal remain pending.

A startup-path regression found during this check was fixed: relative database and identity paths now resolve from the repository root under both `pnpm dev` and `pnpm --filter @two-hands/api dev`. A process-level regression test verifies both launch directories. The earlier nested preview database was empty and preserved; the current API uses root `work/demo.sqlite`.

## Sources

- [Docker Cloud execution, TTL, SSH and healthcheck limitations](https://docs.docker.com/ai/sandboxes/cloud/usage/)
- [Docker’s published compute pricing](https://www.docker.com/blog/introducing-cloud-sandboxes-start-on-your-laptop-finish-in-the-cloud/)
- [Switch compatibility and observed envelopes](switch-compatibility.md)
- [Application state and approval boundary](state-and-approval.md)
