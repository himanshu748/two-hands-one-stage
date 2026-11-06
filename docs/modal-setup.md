# Modal model setup

Modal can supply the model without an OpenAI API key. Both workers still run independently and exchange creative work through Switch. Modal supplies inference only; it cannot approve revisions or replace the performer.

## Initial probe on November 6, 2026

- Installed CLI: **Modal 1.5.5**. Read-only authentication passed without printing or replacing credentials. The official generated Modal skill was refreshed in the user's home directory.
- Created one authenticated Shared Endpoint, `two-hands-model-probe`, in `main`, using `nvidia/GLM-5.3-Flash-NVFP4`. The dashboard and CLI both report it live. Existing unrelated services were left untouched.
- The user approved endpoint/proxy-token setup and at most two small probes within **$0.25**. Shared Endpoint calls cannot use plan-included credits.
- Installed `modal endpoint create --help` does **not** list `--shared`, although current documentation does. Do not use an unsupported flag or substitute a Dedicated Endpoint.
- A new proxy token was captured directly into private files and the root `.env` (0600), with values suppressed. **One real schema probe passed**; no second request was needed. The Docker Cloud Switch sandbox and full workers were not restarted.

## Configuration

Preserve the existing private root `.env`. To select Modal, set:

```dotenv
MODEL_PROVIDER=modal
MODAL_BASE_URL=https://YOUR-ENDPOINT.us-west.modal.direct/v1
MODAL_MODEL=THE-ACTUAL-MODEL-ID-FROM-THE-ENDPOINT
MODAL_PROXY_TOKEN=wk-YOUR-ID.ws-YOUR-SECRET
```

These are placeholders. Use the URL and model ID from your endpoint's request examples or Models API; a Hugging Face name is not necessarily its API model ID. Verify endpoint ownership before storing a token. The client restricts URLs to HTTPS Modal `.modal.direct`/`.modal.run` hosts and `/v1`, rejecting redirects, URL credentials, query strings and custom ports. Domain validation alone does not prove ownership.

The combined proxy token is **not** the CLI API token. Keep it in `.env`, never the browser, logs, fixtures, artifacts or chat. No OpenAI key is required in Modal mode. The existing default, `MODEL_PROVIDER=openai`, still requires `OPENAI_API_KEY` and `OPENAI_MODEL`. Invalid or unavailable backends fail without fallback.

The existing official OpenAI SDK sends Modal Chat Completions with JSON Schema, at most 6,000 output tokens and a 45-second timeout. SDK retries are disabled; API-owned durable reservations still bound worker attempts. Refused, truncated or malformed output fails validation. Modal requests do not inherit ambient OpenAI organization/project headers. A small live JSON Schema response passed on November 6. The later full scene and stage-review calls passed after the grammar adaptation below. Repair schemas and real physical performance remain live acceptance checks.

## Completed first live check

The dashboard created the approved Shared Endpoint after verifying the model and rates: **$0.15 per million input tokens and $0.50 per million output tokens**. No dedicated GPU or workspace billing setting was changed. The endpoint requires a proxy token; its actual request example confirmed the model ID and endpoint-specific `/v1` URL before configuration.

At **2026-11-06 06:27:15–06:27:20 UTC**, one request through the actual `ModalProvider` and `verifyModel` function returned HTTP 200, finish reason `stop`, and passed the small strict Zod schema. The provider reported **55 prompt tokens and 243 completion tokens (298 total)**. At the displayed uncached rates the estimate is **$0.00012975**, not a reconciled invoice. A write-before-call receipt and a one-request fetch guard prevented automatic retries. The second permitted probe was unused.

The $0.25 approval excludes full worker runs, GPU deployments, global billing changes and restarting Switch. The authenticated Shared Endpoint remains available, with no recurring inference loop running. The one-shot receipt is in ignored `work/verification/modal-20261106/live-probe-1.json`; no generated dialogue or credential was saved to public evidence.

After configuration and usage authorization:

```bash
# Local configuration checks only; no inference:
pnpm readiness --offline
pnpm verify:model

# One potentially billable request; no automatic retry:
pnpm verify:model --call
```

The probe prints only backend, request count and validation status. It never writes SQLite, persists generated content, sends a Switch message or records a rehearsal. Passing it proves only a small schema/API boundary. The genuine brief → writer → stage engineer → exact human approval journey still requires Switch/Mattermost availability and separately authorized usage.

## Official sources and evidence boundary

- [Endpoints](https://modal.com/docs/guide/endpoints): APIs, model names and serving modes.
- [Proxy Tokens](https://modal.com/docs/guide/webhook-proxy-auth): combined bearer credentials and environment scope.
- [Shared Endpoints](https://modal.com/docs/guide/shared-endpoints): token billing and credit exclusion.
- [GLM 5.3 Flash NVFP4](https://modal.com/library/zai/glm-5-3-flash-nvfp4): identifier and current rates.
- [Budgets](https://modal.com/docs/guide/budgets): usage budgets versus spend limits; no workspace-wide setting was changed.

Adapter/probe tests use synthetic HTTP responses. The separately recorded single provider probe is real inference with a synthetic prompt, not a human rehearsal or complete worker run. Actual commands and outcomes are recorded in [test-evidence.md](test-evidence.md).


## Full-scene schema compatibility

The later authorized worker run exposed a restriction that the tiny probe did not cover: Modal's serving grammar rejected string schemas combining `pattern` with `minLength`/`maxLength` (HTTP 400). The adapter now removes only that incompatible pattern keyword from the provider's decoding grammar, retaining the length bounds. It keeps the original Zod parser and validates all constraints, including patterns, before returning any output. A synthetic real-SDK regression verifies that whitespace-only titles are still rejected. No domain schema or approval validation was weakened. The first failed worker job and a separate diagnostic remain recorded; a retry is a new explicit Switch instruction, never an erased failure or an unreserved model call.

## Later authorized full worker run

The subsequent bounded continuation resumed the existing private Switch runtime and ran both independent workers. A human-authorized brief reached the writer through Mattermost/Switch; the writer generated a six-beat candidate and addressed the stage engineer through Switch; the engineer returned its review and exact approval command to the room. This supersedes the initial probe-only status above. The user later delegated exact approval to the operator; artifact delivery passed. Personal review and physical rehearsal are still pending.

Five HTTP attempts were recorded: three HTTP 400 grammar rejections and two successful generations. The successful calls reported 2,370 input and 7,602 output tokens, an estimated **$0.0041565** at the displayed rates. This is not an invoice; rejected requests returned no usage. The guard conservatively reserved $0.0275022 against the continuation's $0.25 model ceiling. See [live run evidence](live-demo-20261106.md). No workspace billing setting changed.
