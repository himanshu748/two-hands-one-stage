# Two Hands, One Stage

**Stories you can actually perform.**

Build window: November 4–7, 2026. This PRD describes the bounded hackathon MVP from the supplied brief. Event registration, public deployment, repository publication, submission, and eligibility verification are outside this implementation's authorization. No claim of satisfying uninspected event rules is made.

## User and useful outcome

One person wants to perform a short tabletop story with three objects they already have. A script is useful only if its actions fit that person's real circumstances. The performer collaborates with a playwright and a stage engineer in one Mattermost channel connected to one Switch room.

The delivered scene has six stable beats, explicit hand and prop actions, a protected story fact, and a stated emotional goal. After an actual rehearsal reveals a difficulty, the collaborators offer localized alternatives and explain what each gives up artistically. The performer approves one exact candidate and performs it. The useful takeaways are a scene, a standalone cue player, a printable script, and inspectable revision and rehearsal evidence.

## Scope

| Included | Boundary |
| --- | --- |
| One performer, three named props, six ordered beats | IDs remain `p1`–`p3` and `b1`–`b6` |
| Two independently running workers | Separate Switch identities; peer creative handoffs cross Switch |
| One Switch room and one Mattermost channel | No alternate chat or browser approval path |
| Six explicit action types | `hold`, `place`, `move`, `release`, `speak`, `pause` |
| Deterministic physical checks | Hand occupancy, prop identity/location, available hands, action preconditions and downstream state |
| Human-confirmed hand constraint | Left or right hand unavailable throughout the scene; other limitations require escalation |
| At most three repair alternatives per task | Whole-scene validation; unchanged beats preserved; no claim of globally minimal repair |
| Exact approval | Candidate ID and content digest, trusted human origin, current base, eligible proposal, current constraints |
| Two HTML outputs | Same immutable approved revision and digest; offline playback and print styles |
| Local application | Fastify and SQLite, React/Vite, no commercial tenancy or public deployment |

Table, resting place, and cue device are environmental resources, not extra story props. Timed cues begin with a lead-in before the performer handles the props. Touching pause or navigation uses a hand: the performer must safely rest the props and reset before restarting.

The action model does not prove balance, reach, force, grip, dexterity, comfort, sightlines, actual prop dimensions, or a coherent theatrical interpretation of a protected fact. It is not a general physics or choreography engine. No robotics, vision, motion capture, voice generation, music generation, analytics dashboard, marketplace, or additional communication platform is included.

## Core journey and acceptance

| Step | Observable acceptance |
| --- | --- |
| Brief | The linked performer sends three prop names, an emotional goal, and a protected fact in Mattermost; the writer receives an addressed Switch event. |
| First scene | Writer returns six beats. A Switch message asks the stage engineer to review. The engineer explains deterministic results and artistic consequences to the human through Switch. |
| Exact approval | Only the verified performer can commit the displayed candidate ID and digest. A stale, changed, invalid, or ambiguous-origin approval is rejected. |
| Rehearsal | A real person performs the approved scene and reports their actual difficulty through Mattermost. Original words remain separate from the engineer's interpretation. |
| Confirmation | The human explicitly confirms a supported constraint. Ambiguous or unsupported interpretations stay blocked. |
| Repair | The engineer asks the writer through Switch. The writer proposes one to three bounded patches; the engineer reviews all six beats. A plausible local change that breaks a later transition is rejected. |
| Selection | The performer compares complete candidates, physical differences, artistic costs, and a readable diff; they approve exactly one in Mattermost. |
| Outcome | The person performs the revision and reports success or difficulty. Only a genuine human report can mark that exact revision human rehearsed. |
| Takeaway | Both artifact links open from the demonstration environment. Saved HTML works with Switch, API, model, and network unavailable. |

## Product behavior

A separate landing page explains the mechanism through an explicitly synthetic interactive stage and repair experiment. The live studio uses a persistent beat rail, action-by-action stage preview, contextual inspector and cue transport; repair costs and exact diffs remain inspectable. The workbench uses warm white, charcoal, amber, and teal; readable editorial hierarchy; responsive layouts; semantic buttons; visible keyboard focus; and restrained motion that respects reduced-motion preferences. Status is conveyed in words and symbols as well as color. It distinguishes model checked, approved, awaiting rehearsal, and human rehearsed. Loading, failed, disconnected, pending, revoked, uncertain-delivery, and blocked states remain visible.

The web app is read-only for collaborative state. It can preview alternatives and copy an approval command but cannot submit an approval or replace Mattermost instructions. A stale snapshot is identified when the API disconnects. No runtime failure silently loads fixtures.

## Invariants and evidence

- The API is the only SQLite writer. Workers request narrow authenticated operations.
- A proposal contains its base, complete candidate, digest, bounded patch, changed beats, dependent transitions, artistic costs, deterministic validation, and readable diff.
- Every proposed patch and approval commit validates the complete six-beat sequence. Current revision changes are transactional.
- A new relevant observation, confirmed constraint, changed instruction, or explicit revocation invalidates outstanding decisions.
- Author identity comes from a reviewed Mattermost-to-Switch mapping and trusted transport ingestion, never a model or display name.
- Stable event/message IDs, a durable inbox, logical task IDs, leases, bounded attempts, and an outbox protect against duplicate effects and process restarts.
- Synthetic fixtures establish software behavior only. They are never presented as performed scenes or live collaboration.

## Delivery phases

1. **November 4:** inspect official Switch interfaces and environment; establish the monorepo, configuration checks, and the smallest live-path client. Record runtime blockers explicitly.
2. **November 4–5:** implement action semantics, immutable revisions, approvals, durable processing, and meaningful invariants.
3. **November 5:** connect the distinct workers and bounded model adapter; verify room-addressed handoffs and human identity when a runtime is available.
4. **November 5–6:** build the rehearsal workbench, cue player, script renderer, and browser accessibility/error behavior.
5. **November 6–7:** exercise recovery, clean installation, artifact delivery, and a genuine physical rehearsal; assemble the demonstration evidence.

These dates are the requested build window, not a fabricated record of completed work. Actual commands and results belong in [test evidence](test-evidence.md). Live runtime access, account linking, model credentials, and an actual performer remain separate acceptance gates. No paid usage, billing change, publication, or public deployment is authorized by this PRD.
