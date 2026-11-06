# Making the first use understandable

The user could not tell what the cue player expected them to do. The November 6 follow-up changes the explanation and interaction, without changing the approved story, movements, timing or digest.

## What changed

- The player opens with a plain explanation: this is a short story the person reads aloud while moving three objects.
- The setup names the actual objects and their starting positions. Three numbered stages explain getting ready, trying the scene and reporting what happened.
- **Read the whole scene** reveals all six parts before the timer starts. It makes no request and records no outcome. Starting timed playback returns to one part at a time.
- Every explicit spoken cue contains its actual line alongside the ordered movement/pause instructions. A matching principal line is not printed twice. Repeated explicit cues still repeat; dialogue without an explicit cue appears once with “Say during this part.”
- Technical hand-state tables, revision IDs, content digest and approval provenance labels remain available behind accessible disclosures. Metadata remains in both files. Print layout includes all six parts and version details.
- Buttons say **Start the scene**, **Pause** and **Start over**. Five-second preparation, hand-free control guidance, keyboard pause, hidden-page pause and required reset remain intact.
- The studio includes a collapsible getting-started guide with actual prop names and links to the matching approved script/player. A draft, held approval or scene needing repair does not receive a new invitation to perform.
- Approval still requires sending the exact command through Mattermost. The copy button now includes `@two-hands-stage`; the full command is optional to inspect, and clipboard failure reveals it for manual copying.
- The landing page and new-scene form describe what the person will do rather than assuming they understand the staging terminology.

The design keeps the existing warm palette and typography. The primary change is hierarchy and clear instructions; no extra animated decoration or dependency was added. Existing reduced-motion behavior and focus treatment are preserved.

## Boundaries

This was local UI/template work. No cloud runtime was resumed, no model request was made, and no approval or rehearsal message was sent. The live scene retains revision `rev-9aadc12a6b5ae26e` and digest `8d2640748188a4df98daff7597d5e3ba8dbc66c0dfc5934209c51e843a8f1ceb`. Earlier delegated approval remains historical; no new personal review or physical rehearsal is claimed.

Public landing examples remain explicitly synthetic. Regenerate their fixed HTML with `pnpm exec tsx scripts/render-examples.ts`. This reads only the synthetic fixture, not the live database. Saved real exports are refreshed through the local API from the immutable approved revision; previous HTML copies are archived in the ignored verification directory.

## Verification

Final command outcomes and visual evidence are recorded in [test-evidence.md](test-evidence.md). Browser tests cover reading all six parts without starting, unchanged metadata, explicit repeated speech, offline timed playback, keyboard pause/reset, mobile overflow, print, escaping, safe artifact links, withheld draft/repair calls to action and clipboard denial. These establish behavior, not a claim that a new user has successfully understood or rehearsed the scene.

Final result: lint, typecheck and build passed; **183 unit/service tests and 36 synthetic browser tests passed**. Actual local player/studio readback passed, including read-through without starting. Only the local API/web preview runs; paid cloud compute and both model workers remain stopped. The approved scene, single historical delegated approval and zero-rehearsal state are preserved.
