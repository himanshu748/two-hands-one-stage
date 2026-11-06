# Docker Cloud sandbox for Switch

Checked November 4, 2026 (Asia/Kolkata). **The authorized live run succeeded; see [cloud-run.md](cloud-run.md) for actual results, private access and the remaining model/scene steps.** This path avoids the local disk shortage and runs Mattermost natively on AMD64. It is a private integration environment, not public deployment or proof of a working human collaboration.

## Verified preflight

- Installed `sbx`: **0.47.0**, build `0411f50ee4700fe7bd37e6e7e3aced563e850ca9`.
- `sbx --cloud diagnose`: authenticated, Cloud API reachable, cloud entitlement subscribed; update available (0.51.0). No login credential was read or printed.
- Docker Offload is not installed in the local Docker CLI. This path uses the existing standalone `sbx` CLI, not a presumed `docker-cloud` context.
- Official published Medium price: **$0.28/hour for 4 vCPU / 8 GiB**. A two-hour run is $0.56 compute before applicable taxes/credits; the proposed total budget is $1. Credit balance has not been verified. No paid resource was created during the initial preflight. The user subsequently approved one bounded run, now recorded in cloud-run.md.
- Actual `create --help` supports `shell`, `--platform`, `--ttl` and `--on-timeout` in the installed version. Current documentation includes newer features (such as `inspect`) absent from this CLI; do not assume those commands exist.

The user subsequently authorized one sandbox, up to two hours and $1 compute. This does not authorize additional sandboxes, unbounded restarts or model usage. Read-only diagnostics and local preparation do not incur sandbox compute charges. Do not add a subscription/payment method, consume model-provider credits, or extend/resume the sandbox outside the authorized allowance.

## Compatibility adjustment

Docker documents a Cloud Sandbox limitation: container `exec` and healthchecks can use the VM filesystem instead of the container filesystem. The upstream Compose file gates database initialization on PostgreSQL health, so it cannot be used unchanged here.

`deploy/switch/cloud-override.yaml` disables that healthcheck and changes the PostgreSQL dependency to `service_started`. The original **init-db main process** already polls PostgreSQL with an authenticated `psql SELECT 1` (up to 30 attempts); Switch and Mattermost still wait for its successful completion. This preserves a genuine database check and avoids the affected exec path. It is a platform workaround, not a claim that Docker health monitoring works.

`bash scripts/cloud-switch.sh check` checks Core, Mattermost and Gateway over HTTP from the sandbox, then checks the setup container's exit state using `docker inspect`. Never use `docker exec` to infer readiness or inspect credentials in this environment.

## Prepared private bundle

`work/cloud-switch/bundle/` contains only:

```text
.env                                private generated deployment credentials (0600)
deploy/switch/compose.yaml           unmodified official tagged stack
deploy/switch/override.yaml          browser-facing Mattermost URL
deploy/switch/cloud-override.yaml    cloud healthcheck compatibility
deploy/switch/UPSTREAM.md           provenance
deploy/switch/UPSTREAM-LICENSE      upstream license
scripts/cloud-switch.sh             pull/up/check/status/stop
```

The bundle includes no application source, model credentials, SQLite database, human observations or synthetic rehearsal records. Do not upload the entire repository or the surrounding `work/` directory. Do not print `.env`, expanded `docker compose config`, or raw service logs that could contain credentials. The local bundle is ignored by version control.

## Bounded execution command (already executed once)

The existing project sandbox is `two-hands-switch-20261104`; do not rerun creation blindly. For a separately authorized new run, use a project-specific name. Check exact-name existence first; a timeout/error from creation must be reconciled before retrying, because the remote sandbox may already exist.

```sh
sbx --cloud create --name two-hands-switch-20261104 \
  --platform linux/amd64 --cpus 4 --memory 8g \
  --ttl 2h --on-timeout stop shell
```

Record the returned sandbox ID and creation time. Confirm the remote TTL and policy before starting workloads. The server must enforce the stop deadline; a local timer alone is insufficient. Inspect the inherited sandbox network policy and add only any required image-registry destinations, scoped to this sandbox. Do not change account-wide policies or attach unrelated secrets/MCP tools.

Transfer only the prepared bundle into a new sandbox directory, preserving its hierarchy; `sbx cp` places a source directory inside an existing destination, so inspect the destination before choosing a path. From the resulting directory:

```sh
bash scripts/cloud-switch.sh pull
bash scripts/cloud-switch.sh up
bash scripts/cloud-switch.sh check
bash scripts/cloud-switch.sh status
```

These commands were executed successfully in the authorized cloud sandbox; actual service readiness and private forwarding passed. Runtime disk, available Docker/Compose versions, image pulls and service readiness must be observed there. The helper's `up` uses `--pull never`; `stop` preserves database volumes.

## Private connectivity

Do not use `sbx --cloud ports --publish`: Docker documents that it creates a public HTTPS endpoint, and public deployment is outside this task's authorization.

Use the documented `sbx --cloud setup ssh` path and verify the generated target/configuration. Attempt explicit SSH local forwards bound to `127.0.0.1` for remote 13000 (Gateway), 18000 (Core) and 18065 (Mattermost), with `ExitOnForwardFailure=yes`. Private SSH forwarding was successfully verified from this Mac to all three live services. No public port was exposed. If forwarding is unsupported, stop and report that limitation rather than publishing a port as a silent fallback. PostgreSQL needs no local forwarding.

With the verified private tunnel running, the app can retain `SWITCH_BASE_URL=http://127.0.0.1:18000`; the API and workers stay on the Mac. Verify loopback HTTP and WebSocket behavior before starting model calls. Artifact links can continue to target the local workbench for a same-machine demonstration.

## Verification and shutdown

After readiness, follow the existing README and compatibility guide to register two separate agents, audit performer account linking/opaque bridge identity, discover operations, and complete the real room workflow. Never treat seeded account setup, healthy services or test fixtures as a genuine human instruction/approval.

Stop before the approved time/budget limit:

```sh
sbx --cloud stop two-hands-switch-20261104
```

Confirm stopped state using a read-only list operation. `sbx exec`, `attach` and `run` can resume a stopped sandbox; do not use them to check shutdown. Resuming starts a fresh TTL and consumes more compute, so a finished allowance does not authorize a resume. Preserve the sandbox state; deletion requires separate data-retention judgment. Record actual duration and reported usage when available (Docker says billing data can lag by up to 48 hours).

## Evidence and sources

Local checks passed: `pnpm lint`, `pnpm typecheck`, `bash -n scripts/cloud-switch.sh`; actual Docker Compose JSON merge inspection confirmed the authenticated init-db gate remains, no `service_healthy` dependency remains, and every published container port binds to `127.0.0.1`. Expanded configuration was parsed in memory and not printed. Core, Mattermost and Gateway HTTP health/readiness passed in the live run; creative collaboration and human approval remain pending.

- [Docker Cloud usage and exec/healthcheck limitation](https://docs.docker.com/ai/sandboxes/cloud/usage/)
- [Local versus cloud capabilities](https://docs.docker.com/ai/sandboxes/cloud/local-vs-cloud/)
- [Official published compute prices](https://www.docker.com/blog/introducing-cloud-sandboxes-start-on-your-laptop-finish-in-the-cloud/)
- [Cloud subscription and billing](https://docs.docker.com/agentic-platform/signup/)
- [Official Switch Compose tag](https://github.com/sandbox-quantum/switch/blob/switch-v0.31.0/deploy/local/standalone-docker-compose.yml)
