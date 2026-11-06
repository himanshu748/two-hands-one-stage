# Demonstration and manual acceptance

This is a runbook for a genuine demonstration, not a record of one. Live Switch collaboration, trusted performer linking, model calls, artifact delivery, and physical rehearsal must be marked pending until actually observed. Automated fixture scenes must be called synthetic wherever shown. The November 4 transport/account-routing checks are historical evidence. On November 6, Modal generated a real scene and stage review; the user delegated exact approval to the operator, and both artifact links opened from Mattermost. Personal review and physical rehearsal remain separate pending checks. See [the live run](live-demo-20261106.md). Consult the latest run evidence for runtime state. This runbook itself is not permission to resume paid infrastructure or make model calls.

## Before the performer arrives

1. Install the pinned Node and pnpm versions and run the README's clean installation commands. Run the credential-free checks and `pnpm readiness` (or `pnpm readiness --offline` for no network request). Resolve all reported blockers before the performance; the command never starts services or spends.
2. Start a real Switch runtime with its intended Mattermost connection. The official [getting-started guide](https://docs.switchagents.ai/switch-rooms/getting-started) describes local Docker setup. Record actual installed versions; the source metadata in this repository is not an installed-version claim.
3. Link the performer's real Mattermost account in Switch. Audit the account/channel → bridge/participant/room mapping using the procedure in [Switch compatibility](switch-compatibility.md). Do not use a shared bridge-bot identity or display-name match.
4. Configure one room and one channel. Register the writer and stage engineer once with `pnpm register:agents`, reuse their saved keys, invite them, and explicitly permit the performer and peer agent under the actual runtime's addressing policy.
5. Set the environment and save the reviewed private identity file. The prepared workspace uses `MODEL_PROVIDER=modal` with a privately configured endpoint, proxy token and model ID; see [Modal setup](modal-setup.md). OpenAI remains an explicit alternative, not a fallback. Obtain a bounded allowance for full-worker usage; the earlier small-probe allowance does not cover it. Do not add billing or purchase credits without separate authorization.
6. With workers stopped, run `pnpm verify:switch`, then `pnpm verify:switch --connect`. The second command claims the room and can evict a running worker. Record actual server metadata and any observed sanitized envelopes. These checks do not establish human approval or rehearsal.
7. Run `pnpm dev`. Open [the local workbench](http://127.0.0.1:5173/studio). Verify both workers show connected and that `PUBLIC_APP_URL` opens from the browser used for the demonstration. A localhost link sent to a different device will not reach this machine.

## First live milestone: one instruction through both agents

Use the performer's own three real prop names, goal, and protected fact. The following message is **illustrative input syntax only**, not a preperformed scene. Replace its content with the chosen brief. Keep the IDs stable.

```text
@two-hands-writer brief {"sceneId":"tabletop-scene","title":"A place for you","props":[{"id":"p1","name":"Folded paper"},{"id":"p2","name":"Cup"},{"id":"p3","name":"Key"}],"emotionalGoal":"Turn loneliness into welcome.","protectedFact":"The paper belongs to the person who has not yet returned."}
```

Show the actual Mattermost post and its addressed writer receipt. The writer creates the initial six-beat proposal; its review request must appear in the Switch room and address the stage engineer. Show the engineer's review and the complete candidate in the workbench. If a check fails or the initial scene does not honor the protected fact, report that result; do not pretend the first draft passed.

The performer reads the staging and artistic costs. They send the exact command supplied by the engineer, with the real IDs and full digest:

```text
@two-hands-stage approve <proposalId> <candidateRevisionId> <sha256Digest>
```

Angle-bracket tokens in these examples mean substitute observed values; they are never literal approval data. A web preview or copied command is not an approval. Check that the API committed the intended revision once. The automated suite separately checks rejection of agent-origin and stale approvals; do not impersonate another live account for the demonstration.

Open both artifact links returned through Mattermost from the actual demonstration browser. Save the HTML files locally before disconnecting. Confirm both show the exact approved revision ID and content digest.

## The real rehearsal

Suggested spoken introduction: “This is a short scene made for one performer and these three props. The meaningful test is whether I can perform it. A model check is only a staging precondition check.” Do not generate narration or imply this sentence describes a completed result.

Put the props in the approved initial locations. Start timed playback before occupying the hands; the lead-in gives time to prepare. Pause only after safely resting props. Perform the scene genuinely.

If there is a real difficulty, describe what happened in your own words and name the approved revision:

```text
@two-hands-stage observe <approvedRevisionId> <what actually happened and where it became difficult>
```

Do not plant an impossible action or manufacture an observation to force a success story. If the first scene works, say so. The repair mechanism cannot be claimed demonstrated until a genuine constraint leads to a real revision.

Show the original observation in the workbench, then the engineer's separate interpretation. This MVP supports confirming that one hand must remain free throughout the scene. Confirm only when that accurately reflects the real difficulty:

```text
@two-hands-stage confirm <observationId> left
```

or:

```text
@two-hands-stage confirm <observationId> right
```

Do not reinterpret an unrelated difficulty to fit this model. If the problem is reach, grip, balance, a beat-specific restriction, or another unsupported constraint, leave the workflow blocked and record the limitation. A fabricated confirmation is not useful evidence.

## Compare the repair choices

Show the engineer's addressed repair request crossing Switch to the writer. The writer may return up to three alternatives, and a new addressed review request must cross Switch back to the engineer.

For each alternative, inspect:

- The physical action changes and full six-beat candidate.
- The before-and-after diff and unchanged content.
- The artistic cost: what image, rhythm, emotional emphasis, or gesture changes.
- Whole-scene validation, including any later transition broken by an earlier edit.

A rejected locally plausible repair can be demonstrated with the clearly labeled automated fixture/test evidence. Do not pass that fixture off as a live failure. The software does not claim the proposed patch is globally minimal.

The performer chooses one eligible alternative and sends its exact approval command in Mattermost. Confirm the prior base is still current and that its ID/digest match the committed revision. Show the new matching artifact links arriving through Switch.

## Perform and record the result

Perform that approved revision. Record the actual outcome in Mattermost with its exact revision ID:

```text
@two-hands-stage outcome <approvedRevisionId> success <what actually worked in the performance>
```

or:

```text
@two-hands-stage outcome <approvedRevisionId> difficulty <what remains difficult>
```

Only the genuine human report may yield a human-rehearsed success label. Approval and rehearsal are separate evidence. Do not silently change approved content when adding the outcome.

Disconnect the network or stop the application services, then open the saved cue-player HTML. Start, pause, reset, and advance cues. Open the saved script and print preview. Confirm the revision/digest still match and no remote font, script, Switch connection, or model is needed.

## Corrections and recovery during a demo

- **Wrong instruction or approval:** send `@two-hands-stage revoke <originalMessageId>` as a fresh message. Editing or deleting the original Mattermost post is not a reliable revocation. Exported HTML remains an immutable historical copy; discard revoked copies manually. A revoked instruction holds the bounded MVP; use a fresh disposable scene after preserving evidence rather than assuming an automatic amendment workflow exists.
- **Worker interruption:** restart only the stopped application. Pending durable work can resume within its configured bounds. A gap or takeover requires history reconciliation; do not reset cursors merely to clear the status.
- **Uncertain notification delivery:** inspect the real room history before retrying. Do not claim a link arrived because a room document or outbox record exists.
- **Unsupported constraint or exhausted model attempts:** show the blocked state and record the limitation. No hidden fake agent should take over.
- **Fresh scene needed:** export any evidence to keep, stop all services, and use `pnpm demo:reset` only with the explicitly configured disposable database. It archives the database and sidecars reversibly; Switch history remains. Never run reset while another API is starting.

## Manual evidence to record

| Evidence | Initial status |
| --- | --- |
| Actual Core/Console/runtime versions and operation schemas | Core/runtime observed November 4; current runtime stopped; Console unverified |
| Account-link audit, opaque sender/bridge/room mapping, nonce observation | Operator audit and automated nonce passed November 4; re-audit after relevant state changes |
| First intended-room instruction → writer → engineer → exact human approval | Pending live demonstration |
| Genuine original rehearsal difficulty and confirmed supported constraint | Pending physical rehearsal |
| Switch-crossing repair and review requests, alternatives and artistic costs | Pending live demonstration |
| Exact revision/digest approval and both delivered artifact links | Pending live demonstration |
| Actual repaired performance and human-reported outcome | Pending physical rehearsal |
| Saved HTML playback and print from the actual demonstration machine | Pending manual acceptance; automated offline checks are separate |

Record observed results and timestamps in [test evidence](test-evidence.md). Do not replace any pending row with a synthetic success. The authorized outcome is a locally implemented, verified repository and honest demonstration preparation; no public deployment, push, publication, event registration, or event submission is part of this runbook.

## First-draft recovery and local setup

The empty `/studio` view can compose the exact brief command locally, without posting it or storing a browser draft. Paste it into the intended Mattermost channel. If all initial candidates are rejected, or initial creation/review is blocked, inspect the reason and send `@two-hands-writer retry-draft`. The brief is preserved, there are at most two retries, and a pending/eligible scene cannot be retried. The UI reports eligibility and remaining attempts. An approved revision cannot use this command; report a genuine rehearsal observation instead.

The local Docker extraction was blocked by host storage. The subsequent authorized private cloud run succeeded: follow [cloud-run.md](cloud-run.md) for its historical URLs, lifecycle receipt and no-model account nonce check. The sandbox is now stopped. Live transport success does not establish creative collaboration, approval or physical rehearsal.
