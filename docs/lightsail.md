# Hosting the live workbench on the existing Lightsail server

These templates run the API, two independent Switch workers and a private read-only web gateway as four systemd services. They do not provision a server or remove another application. The operator must first preserve the existing application and arrange the authenticated TLS route. A static example is not evidence of live Switch collaboration.

## Fixed layout

| Location | Purpose |
| --- | --- |
| `/opt/node-v22.14.0-linux-x64/bin/node` | Pinned Node.js 22.14.0 executable |
| `/opt/two-hands/current` | Release checkout, dependencies and built web assets |
| `/etc/two-hands/runtime.env` | Private runtime configuration, outside the checkout |
| `/etc/two-hands/human-identity.json` | Reviewed Mattermost-to-Switch performer mapping |
| `/var/lib/two-hands` | Persistent SQLite database and process locks |

Use pnpm 10.34.9 and the committed lockfile to install and build the release. Production runs source TypeScript through the declared `tsx` dependency. No Vite development server is needed. The release directory must not contain `.env`; do not copy a developer's environment file into it.

Create an unprivileged `two-hands` service account. It needs read access to the release and identity mapping, and write access only to `/var/lib/two-hands`. Keep the runtime environment root-owned, mode `0600`; systemd reads it before dropping privileges. Keep the identity mapping private and readable by the service account. Never commit either file.

## Configuration

Start from `.env.example`, supplying actual independently registered worker identities and the reviewed human mapping. Required hosted values include:

```dotenv
DATABASE_PATH=/var/lib/two-hands/scene.sqlite
HUMAN_IDENTITY_FILE=/etc/two-hands/human-identity.json
API_URL=http://127.0.0.1:4310
PUBLIC_APP_URL=https://your-authenticated-app-host.example
HOSTED_BIND_ADDR=172.17.0.1
HOSTED_PORT=4311
HOSTED_WEB_DIST=/opt/two-hands/current/apps/web/dist
```

The private bridge address above is illustrative: discover the existing edge proxy's Docker bridge and use that interface's actual gateway address. Do not bind the gateway to a public interface. Generate a private `HOSTED_PROXY_TOKEN` of at least 32 printable characters and configure the edge proxy to supply it as `X-Two-Hands-Proxy-Key`. The reverse proxy must authenticate the performer independently before supplying this header; a header token is not a browser login.

The configuration also requires both workers' Switch credentials, distinct internal tokens, room/sender IDs and the configured real model provider. Validation loads configuration only; it makes no model calls. `PUBLIC_APP_URL` is the exact HTTPS app origin. Keep Switch transport on loopback as required by the existing client. Keep Mattermost's bridge-side listener private; only the authenticated edge route should expose its web interface.

The launcher refuses missing or ambiguous configuration, unreviewed identities, relative persistence paths, a symlinked database, credentials in checkout `.env`, or reused agent identities/keys/senders/internal tokens. The API remains bound to loopback port 4310 and remains the only SQLite writer. The gateway can only read the API's approved public routes and fixed built assets; it does not expose internal worker endpoints or provide approval controls.

## Install and operate the units

After provisioning the paths, permissions, private configuration and built release, install the four files from `deploy/lightsail/` into `/etc/systemd/system/`. On the actual Ubuntu host, check them before enabling:

```sh
sudo systemd-analyze verify /etc/systemd/system/two-hands-api.service /etc/systemd/system/two-hands-writer.service /etc/systemd/system/two-hands-stage.service /etc/systemd/system/two-hands-gateway.service
sudo systemctl daemon-reload
sudo systemctl enable --now two-hands-api.service
sudo systemctl status two-hands-api two-hands-writer two-hands-stage two-hands-gateway
```

All four units require Docker and start after its service, so the private bridge interface is available. The API unit starts the dependent units. Each dependent launcher polls the API's exact health response for at most 30 seconds before starting its separate Node process. Before constructing either worker, its launcher also waits at most 180 seconds for the loopback Switch bridge `/health` to return HTTP success, matching `scripts/verify-switch.ts`; no undocumented JSON shape is assumed. A stopped or unhealthy bridge leaves the worker visibly pending until the bounded timeout and then failed. The workers await addressed Switch work; startup does not manufacture jobs or invoke a model. Gateway startup validates its own bind, proxy token and asset directory. Check live worker connectivity through the workbench and private logs rather than assuming `active` proves Switch delivery.

```sh
sudo journalctl -u two-hands-api -u two-hands-writer -u two-hands-stage -u two-hands-gateway --since '10 minutes ago'
sudo systemctl restart two-hands-api.service
sudo systemctl stop two-hands-api.service
```

The dependent units are bound to and stopped with the API. A deliberate API restart restarts them too. Each launcher forwards one termination signal, allows 20 seconds for its child to close and releases its role lock. systemd allows 30 seconds overall and terminates remaining processes if needed. Each role has its own exclusive lock in the database directory, in addition to the API's database ownership lock. A second API or duplicate worker launcher refuses to run.

A forced kill or machine crash can leave locks. This is a visible blocked state, not permission to start another writer: inspect the recorded PID, service state and open database handles before removing an abandoned lock. Do not delete a lock while its process is alive. Once the sole API and workers restart, existing durable inbox/outbox work is recovered by the application. Preserve the database, WAL and SHM files as a unit when taking an offline backup; do not reset the live database to fix a connection problem.

## Existing reverse proxy and small-server constraints

The existing edge proxy should terminate TLS and enforce performer authentication for the entire app route, including scene state and artifact URLs. It forwards only this app host to the private gateway on port 4311 and inserts the proxy header. Deny external access to `/internal`. Keep unrelated hosts and routes intact. The gateway itself also refuses internal paths, non-read methods and unauthenticated requests. Never expose the SQLite file, identity mapping, runtime environment or worker credentials as web files.

On the existing 2-vCPU/2-GiB server, build sequentially and measure memory after stopping the superseded application. These templates do not establish that every combination of existing services fits. They do not create extra compute or authorize model spending. Check free memory, disk, service restarts and logs before a live demonstration; do not hide resource failures behind synthetic data.

## Acceptance on the deployed environment

Record actual results separately from fixture tests:

1. Anonymous app/state/artifact requests are denied; authenticated HTTPS pages and real artifact links open.
2. The API and both independently identified workers reconnect to the intended Switch room.
3. The reviewed mapping identifies the authorized Mattermost performer, rather than a shared bot or display name.
4. A real instruction reaches writer, engineer and the performer through Switch; exact approval is sent by the performer through Mattermost.
5. Both artifacts carry the same immutable approved revision and digest; the downloaded cue player runs offline.
6. Restart the services during pending work and verify durable recovery without duplicate revision effects.
7. Keep real physical rehearsal pending until a person actually performs the scene and reports the outcome.

The hosting preflight tests use explicitly synthetic configuration and stubbed health responses. They do not establish deployment, transport, identity, model execution or human rehearsal success. `systemd-analyze verify`, actual TLS/authentication and service restart checks require the target host.

Reference: [systemd service units](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html), [execution environment](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html), [Lightsail instance connection details](https://docs.aws.amazon.com/lightsail/2016-11-28/api-reference/API_GetInstanceAccessDetails.html).

## Actual deployment — November 6, 2026

The existing `embodiweave-demo` instance in `us-east-1` was reused; no instance, paid snapshot, upgrade or Docker Cloud session was created. The selected Embodiweave container was stopped, its restart policy disabled, and its code/data/configuration archived privately before the stopped container and its exclusively named data volume were removed. The 1.2-GiB archive passed a full archive listing/integrity check. Its SHA-256 is `563e67d084cd241136e484f7a5a09559fe11496e309a718b268e1927036e6198`. The old host now returns HTTP 410. The shared Caddy container and its certificate volumes remain in place. DecisionDebt, Dohra and Borrowed Confidence returned HTTP 200 before and after the change.

- Live workbench: <https://two-hands.52.202.25.181.sslip.io/studio>
- Private room: <https://two-hands-chat.52.202.25.181.sslip.io/two-hands/channels/two-hands---one-stage>
- Public synthetic example: <https://two-hands-one-stage.vercel.app/example>
- Public landing `/studio` redirects to the actual live workbench. It no longer redirects to the example.

The private performer login is handed off outside Git. Both the workbench and artifacts require TLS Basic Authentication. Mattermost has its own performer login, a private project channel, disabled self-registration and disabled desktop-app landing prompt. The gateway accepts traffic only on the existing proxy bridge gateway `172.18.0.1:4311` with the injected secret header. The API remains on `127.0.0.1:4310`; Core is on `127.0.0.1:18000`. Postgres is loopback/private. No model, Switch, internal API or proxy credential is a Vite variable.

Actual host versions: Ubuntu 24.04, Docker Engine 29.1.3, Compose 2.40.3, Caddy 2.11.7, Node 22.14.0, pnpm 10.34.9, Switch Core/setup 0.31.0, Mattermost 11.9.0 and PostgreSQL 16 Alpine. The first native SQLite install failed because `make` was absent. After installing `build-essential` and Python 3, the frozen-lockfile install and full build passed on the server. All four systemd units passed `systemd-analyze verify` and ran as the separate unprivileged service account.

A fresh owner-linked registration and administrative read-only mapping audit verified one non-bot performer, membership of the private channel, the linked Gateway owner and three distinct opaque transport senders. A fresh operator-posted nonce matched on the authenticated Switch stream. This is an account-routing diagnostic, not personal approval or rehearsal. Core's immediate room-create response omitted owner fields; the actual owner relationship was verified by a read-only database join rather than inferred from the omitted response.

The real hosted writer and stage engineer exchanged addressed requests through Switch. The first two writer attempts timed out; the next two exhausted the response token budget. Low reasoning effort fixed that provider behavior. A subsequent candidate was genuinely invalid (`place`/`release` without `hold`), and whole-scene validation plus the engineer rejected it. An explicit redraft, now including that rejected candidate and its deterministic failures, produced `rev-a428fdd7e0437ad2`, digest `967865ce98b14908aae1ac41d4b0e17ca19af4926c88cd3c8cdfad24ce10855a`, with valid whole-scene checks and a second real engineer review. Earlier failures and the rejected candidate remain visible. This is a technical correction, not the required genuine human physical-constraint repair.

The initial draft policy now allows at most three explicit performer-requested redrafts, with two durable model reservations per job. Hosted model usage is separately guarded by an audited GLM model/rate contract, a $0.25 ceiling, at most ten requests and a fixed deadline. On this run eight requests reserved $0.04497345; six returned usage estimated at $0.00774825, while two timed-out requests have unknown billing. Reservations were retained. These are conservative reservations/estimates, not an invoice. The allowance expires at 2026-11-06 18:17:32 UTC (23:47:32 IST); later inference requires explicit renewal. Existing services stay up; the shared server must not be stopped to enforce an inference allowance.

Observed resource use after startup: Core about 68 MiB, Mattermost 148 MiB and Postgres 93 MiB, within explicit 640/512/256-MiB container caps. The host had about 14 GiB disk free. Other apps remained healthy. This is a single observed small-server run, not capacity or availability certification. Forced-kill/OOM/power-loss lock recovery remains manual; no host reboot was attempted because the machine serves other apps.

Hosted browser checks used real Chromium at 1440×1000 and 390×844 with reduced motion. Authenticated state was `synthetic:false`, both workers connected, chat UI login succeeded with no post-login page errors, activity filtering worked, no horizontal clipping was detected, and the public example made zero live-state requests. Anonymous app/state/artifact requests returned 401; authenticated internal endpoints returned 404 and mutations returned 405. An eligible candidate remains awaiting exact approval in Mattermost. No human physical observation or rehearsal outcome has been recorded. Approval, matching live artifact delivery and offline playback of this new hosted revision remain acceptance steps until that approval arrives.

Private operational receipts are in the operator's ignored `work/hosting-live-20261106/`; they contain no public deployment bundle. Credentials and backups are not public artifacts. See [test evidence](test-evidence.md) for reproducible automated commands.

### Configure the hosted inference allowance

The actual deployment loads `scripts/hosted-model-guard.mjs` before the service entrypoints. Put these lines in the private hosted `runtime.env`, not the local development `.env`:

```dotenv
NODE_OPTIONS=--import=/opt/two-hands/current/scripts/hosted-model-guard.mjs
HOSTED_MODEL_ALLOWANCE_FILE=/var/lib/two-hands/model-allowance.json
MODEL_PROVIDER=modal
MODAL_MODEL=nvidia/GLM-5.3-Flash-NVFP4
```

After explicit usage authorization, the operator creates a service-owned mode-0600 allowance file containing `limitUsd` (positive, no more than `0.25`), `reservedUsd: 0`, an approved future ISO `deadline`, and `requests: []`. The file is persistent state. Never zero an existing reservation ledger to retry a timeout. Preserve an expired allowance and create a separately approved replacement if renewal is authorized. The guard is intentionally pinned to this model's audited rates; another model requires an explicitly reviewed pricing change. Its ten-request bound is additional to the application's per-job and human-redraft limits. Missing, expired, malformed or exhausted allowances fail closed; no mock or unmetered model fallback exists.
