# The collaboration room

The default `/studio` shows what the performer account, playwright and stage engineer exchanged through Switch, beside the actual scene. Detailed stage, repairs, files and record remain reachable. `/studio?view=stage` opens the detailed workbench directly.

The API projects durable inbox/outbox records, never generated dialogue. Configured opaque identities establish actors. Account commands show receipts, not proof that an instruction was accepted or a person performed it. Pending notifications remain waiting; send acknowledgements say “Sent to Switch.” Only a matching addressed peer inbox event establishes receipt; self-echoes are insufficient. Human-directed messages never imply the person read them. Duplicates consolidate, invalidated authority is withdrawn, and unknown timestamps remain null. Message/task/revision identifiers are in disclosures.

The recent evidence window reads at most 2,000 inbox rows, 400 outgoing rows and 2,000 processed-message records, emitting at most 200 events. Unrelated diagnostics are omitted. Existing scenes without retained receipts are not prompted to send a second brief.

Next actions follow state: unreviewed drafts await review; unconfirmed observations go to Record; eligible repairs go to comparison; revocations and holds stay visible. Room keyboard scrolling cannot trigger hidden workbench playback. No web control approves a revision.

## Public example

`/example` separately fetches `/examples/collaboration-state.json`, never the live API. Its 11 explicitly synthetic exchanges show a confirmed constraint and two repair options, with zero human rehearsals. Two matching HTML examples come from its synthetic approved base. This does not establish live integration.

Regenerate with `pnpm build:public-demo`. The fixture uses an in-memory Store and synthetic transport helpers; no `.env`, live database, model or Switch access. Locally `/studio` remains the real API; the public hosting configuration explicitly redirects it to the labelled `/example`.

See [test-evidence.md](test-evidence.md) for identity, delivery, edited-message, repair-chain, keyboard, mobile, blocked-state and public-isolation verification.
