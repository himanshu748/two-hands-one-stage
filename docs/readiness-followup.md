# Runtime readiness follow-up — November 5, 2026

**November 6 update:** Modal is now configured privately, offline readiness passes, and one separately authorized live schema probe passed. See [Modal setup](modal-setup.md) and [current test evidence](test-evidence.md). The report below preserves the November 5 observations; the Switch sandbox and full workers were not restarted in the Modal pass.

The project sandbox is **stopped**. A read-only Docker Cloud list confirmed that state for the existing project sandbox. No `exec`, `attach`, `run`, resume, create, model call or billing change was performed.

The user has confirmed that no OpenAI API key is available. The private configuration has no `OPENAI_API_KEY` or `OPENAI_MODEL`. Other required configuration names are present; the saved human mapping is readable, structurally valid, matches the configured room and differs from both workers. Those checks establish local consistency only. They do not reverify live account linkage, assert that a person is present, or approve a scene.

## What changed

`pnpm readiness` now reports independent prerequisites together rather than making the operator discover each failure one at a time through startup. It checks:

- Required variable presence, reporting names only.
- Distinct worker identities, keys and internal tokens.
- The existing bounded local launch settings and a durable database path.
- Saved human mapping consistency using the API's existing schema.
- One unauthenticated bridge health request, with redirects disabled and a five-second timeout.

The command never opens the database, starts services, resumes a sandbox, calls a provider, registers agents, claims a Switch connection, posts a message or writes approval/rehearsal state. `--offline` makes no network request. A successful health response is explicitly distinguished from authenticated transport, room operations and identity verification. Error values, response bodies, configuration values and mapping contents are not printed.

Exit `1` means a prerequisite is blocked. Exit `0` means only the named automated preflight checks passed; manual acceptance remains pending. Exit `2` means unsupported arguments. The command does not grant spending permission.

## Actual checks

Toolchain: Node **22.14.0**, pnpm **10.34.9**. No dependency or lockfile change.

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/integration/readiness.test.ts` | **13 passed**; synthetic configuration and HTTP fixtures |
| `pnpm typecheck` | Passed |
| `pnpm exec eslint scripts/readiness.ts tests/integration/readiness.test.ts` | Passed |
| `pnpm readiness` | Expected exit **1**: both model variables absent and bridge health unreachable; independent worker, local launch and saved-mapping checks passed |
| `pnpm readiness --offline` | Expected exit **1**: both model variables absent; health explicitly not checked |
| `pnpm exec tsx scripts/readiness.ts --invalid` | Expected exit **2** with usage text, before environment loading or network access |
| `sbx --cloud ls --json` | Existing project sandbox reports **stopped**; only that resource's status was reported |

Tests cover combined blockers, secret/error redaction, no authentication on the health request, no network request in offline mode, invalid/agent-owned/mismatched mapping, duplicate worker identity, short internal tokens, invalid or credential-bearing bridge URLs, HTTP failure bodies, and bounded local launch settings.

Raw local logs and the filtered cloud-state receipt are under ignored `work/verification/readiness-20261105/`. Existing live protocol and account-routing evidence remains historical, as corrected in [cloud-run.md](cloud-run.md) and [switch-compatibility.md](switch-compatibility.md).

## Remaining acceptance

1. Obtain an explicitly configured model and credential, with authorized usage. No alternative provider or unrelated account was substituted.
2. Separately authorize any runtime restoration or new cloud execution. Preserve existing agent keys, database state and the reviewed identity file.
3. Recheck authenticated transport and actual room operations after restoration; re-audit mapping if account, bridge or database state changed.
4. Complete the genuine performer brief → writer → stage engineer → exact human approval journey through Mattermost/Switch.
5. Open both delivered artifact links on the demonstration device, save the HTML, perform the scene and record the genuine human outcome.

The landing example, automated fixtures and local offline artifact checks do not replace these steps.
