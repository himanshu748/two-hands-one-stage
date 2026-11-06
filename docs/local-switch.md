# Local Switch setup

This local-only deployment uses the official Switch standalone stack: Core, PostgreSQL, bundled Mattermost, its setup container and Gateway. It does not deploy publicly, run additional creative agents or make provider calls. The application still runs two separate workers.

## Current result — November 4, 2026

- Colima **0.10.3** and Docker Compose **5.6.1** are installed. The Docker Compose plugin is absent on this machine; the existing `docker-compose` command works.
- A dedicated `two-hands` Colima profile started and reported Docker Engine **29.5.2**. The existing active context `colima` was not changed.
- Official tag `switch-v0.31.0` resolves to `7e57cd433a922bc91a00150c106e6ef1f15b1057`. The published Core manifest advertises ARM64 and AMD64. ARM64 digest: `sha256:2ece764678f3284f2880979e6e4300ba813b9e50851080e9576e0aa02609c69d`.
- `deploy/switch/compose.yaml` is the unmodified file fetched from that tag. SHA-256: `cba238878078cf3d77fd9e136ef432f1ce5fd1bfe597acd172b9faa6720f0121`. Attribution/license are adjacent. The override supplies Mattermost's browser-facing URL to the setup container.
- **Image extraction failed with host disk exhaustion and image-store I/O errors. No Switch/Mattermost service started.** The attempt began with about 6.2 GiB free; other host usage changed during it, so this is not a measured minimum requirement.
- Only the newly created empty `two-hands` profile, its failed image data and the exact compressed VM image downloaded for this attempt were removed. Existing contexts, project sources, generated credentials and unrelated data were preserved. About 3.7 GiB was free after rollback.
- Rosetta was absent. Colima enabled bundled QEMU/binfmt support for AMD64; Mattermost is AMD64-only. Actual Mattermost execution/performance remains unverified.

The helper uses a **conservative 12 GiB free-host-space preflight** for installation/pulls. This is a project reserve, not an upstream stated minimum. Also ensure Docker's own storage volume has enough free space. No general cleanup command is provided.

## Prepare without starting anything

```sh
pnpm switch:local prepare
pnpm switch:local check
```

`prepare` creates `work/local-switch/.env` with fresh random passwords and mode 0600, or preserves the existing file unchanged. It never prints credentials. The generated file is retained from this attempt. Inspect it locally for Gateway/Mattermost login details; never paste it into chat or commit it.

`check` exits nonzero on insufficient host space. Free disk space on this host before proceeding; also check the Docker storage volume. The failed empty task-owned image store was removed; no live database existed.

## Start a dedicated local engine

On this Mac, after the disk check passes:

```sh
colima start two-hands --activate=false --ssh-config=false --mount none --cpu 2 --memory 4 --disk 20 --root-disk 8
pnpm switch:local pull
pnpm switch:local up
pnpm switch:local status
```

The helper explicitly uses context `colima-two-hands`; it does not change the active context. It supports the Compose plugin or `docker-compose`. For an already-running Docker Desktop engine, set `TWO_HANDS_DOCKER_CONTEXT` to its exact context name. Do not guess a context or run against someone else's engine.

`up` uses `--pull never` and creates only project `two-hands-switch`. `pnpm switch:local stop` stops its services and retains volumes. The helper has no delete/reset action for Switch data. The application's `demo:reset` does not remove containers or chat history.

| Service | Loopback address |
| --- | --- |
| Gateway | http://127.0.0.1:13000 |
| Agent bridge/Core API | http://127.0.0.1:18000 |
| Mattermost | http://127.0.0.1:18065 |
| PostgreSQL | 127.0.0.1:15432 |

The official setup container creates local admin/performer accounts and links the seeded performer to Gateway. **Provisioning is not the application's human-identity acceptance.** Audit the actual link, room/channel and nonce event before writing `HUMAN_IDENTITY_FILE`. A display name or shared bridge-bot identity cannot establish the performer.

## Finish the application integration

1. Confirm Core `/health` and Mattermost `/api/v4/system/ping` succeed. Inspect setup completion without sharing raw logs or passwords.
2. Sign in to Gateway and Mattermost using the private local file. Create the one room/channel and a performer-owned agent registration key through the actual runtime's supported UI/API. Do not assume the bootstrap token has suitable ownership semantics.
3. Follow README registration for writer and stage; configure effective addressing explicitly and inspect opaque participant IDs.
4. Set application `.env`: `SWITCH_BASE_URL=http://127.0.0.1:18000`, actual room/agent IDs and keys, distinct internal tokens, reviewed identity file, and explicitly configured OpenAI key/model. Model calls remain a separate account/budget prerequisite.
5. Run `pnpm verify:switch`; with workers stopped, run `pnpm verify:switch --connect`. Record actual server versions, discovered operations and sanitized envelopes. Transport success does not establish human approval.
6. Run `pnpm dev`; send the brief in Mattermost. Complete writer → engineer → exact human approval, open artifact links, perform and report the genuine outcome.

Sources: [official tagged Compose](https://github.com/sandbox-quantum/switch/blob/switch-v0.31.0/deploy/local/standalone-docker-compose.yml), [Switch local quickstart](https://docs.switchagents.ai/switch-rooms/getting-started), [Colima](https://github.com/abiosoft/colima). No Console application was installed and no Console/Core compatibility pair is presumed.
