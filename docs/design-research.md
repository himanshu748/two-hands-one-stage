# Design research: story planning, cueing and rehearsal

Verified **November 4, 2026** against public official product pages and documentation. Research used a fresh, unauthenticated Chromium context plus the public documentation reader. No accounts, saved memories, private projects, sign-ups or customer data were accessed. The observations below distinguish published interface screenshots/documented behavior from controls actually exercised.

## What was inspected

| Reference | Evidence inspected | Concrete pattern observed |
| --- | --- | --- |
| Boords | Public animatic product page; official storyboard-view, editing and animatic documentation; rendered screenshots of the animatic timeline | A large selected frame sits above a thumbnail sequence and playhead. Editor/Animatic is a compact mode switch. Playback controls and position remain near the sequence. The visual plan and its timed presentation share the same frame order. |
| Arc Studio | Official Plot Board guide and its rendered board screenshot | Story beats remain identifiable as compact cards; an expanded card exposes description without losing the surrounding structure. Script/Board/Outline navigation changes the representation of the same story. Story-element markings support focused highlighting. |
| CuePilot / CueApp | Official Software page, desktop-timeline and tablet-cue screenshots; public simulator shell | A prominent current position connects a cue list, preview and timeline. CueApp gives more space to current/upcoming cues and countdowns than to editing tools. The public shell distinguishes Studio and Cloud connectivity. |

These are workflow references, not evidence that Two Hands has their capabilities or visual permission to reuse their assets.

## Boords: move from overview to a focused timed view

The official storyboard-view guide documents a grid overview, a separate row-based shot list, and a frame editor opened by double-clicking a frame. The frame editor has a central canvas, bottom tools and a right sidebar. Its review mode is distinct from editing. This is documented behavior; an authenticated Boords workspace was not opened. [Storyboard views](https://boords.com/docs/storyboard-views)

In the inspected animatic screenshot, the selected image dominates the upper area. A small Editor/Animatic switch sits above it. Below, numbered frames, thumbnails, a time ruler and a vertical playhead make the selected moment locatable. Documentation describes draggable frame durations and optional subtitles/thumbnails. We inspected the published screen, not a running authenticated animatic, so exact easing, keyboard behavior and synchronization latency were not measured. [Animatics](https://boords.com/docs/animatics)

The editing guide treats selection, frame status, whole-board status and version as different concepts. Earlier versions remain available. That separation is useful for our candidate/current-revision distinction; it is not a reason to add browser approval. [Editing storyboards](https://boords.com/docs/editing-storyboards)

The public landing page puts a clear task-oriented headline and primary action before showing the storyboard-to-animatic transformation. Its value story leads into visible product views. Adapt the explanatory progression using our real interface and labeled examples, without borrowing its proof points or artwork. [Animatic product page](https://boords.com/animatic-software)

## Arc Studio: keep the story structure visible while inspecting one beat

The inspected board screenshot shows act columns containing compact beat cards, with some cards expanded to reveal descriptive text. Persistent top navigation offers Script, Board and Outline. The guide documents collapsing/expanding beats, jumping from a beat to its script section, and highlighting beats containing selected story elements. These linked representations reduce repeated navigation between structure and detail. We inspected documentation and rendered screenshots; no script was edited in the live product. [Plot Board guide](https://help.arcstudiopro.com/guides/the-plot-board)

For Two Hands, keep the six stable IDs visible in a persistent rail and let a selection update the stage, dialogue, action list and physical state together. Show `changed`, `unchanged`, and `dependent transition checked` labels within that existing structure. The MVP does not need an infinite whiteboard, arbitrary beat reordering, story-arc scoring or extra planning entities.

## CuePilot: separate preparation from the performer’s immediate cue

The official desktop screenshot pairs a cue list with a large preview, time ruler, colored cue blocks and transport controls. The tablet screenshot gives individual cue rows a number, short instruction and timing; a strong horizontal current-cue marker distinguishes the active moment from upcoming rows. The product documentation describes countdowns and customized cue views. We did not connect hardware or operate a live show. [CuePilot Software and CueApp](https://www.cuepilot.com/en/software.html)

The public simulator was opened without credentials. The embedded view initially showed unresolved template bindings; opening its public demo URL directly later produced a Studio/Cloud connection-selection shell, with Studio reporting no configured address. A working timed cue stream was not established. Therefore the cue-list findings come from the official product screenshots, not a successfully exercised simulator. [Public CueApp simulator](https://www.cuepilot.com/en/cueapp_simulator.html)

## Decisions for Two Hands

These are product recommendations inferred from the references and the bounded specification, not claims about competitors' implementation.

1. **Lead the workbench with a small stage.** Show the actual three named props in table/rest/left-hand/right-hand zones. Selecting a beat updates these schematic positions from deterministic validator transitions. Keep the dialogue and action list alongside the visualization; the visualization must not imply measured movement, reach or physics.
2. **Make six beats the navigation spine.** Keep stable `b1`–`b6`, title, duration and selected state visible. On narrow screens, preserve a usable rail or compact two-row grid. Every change of selection updates one coordinated view rather than opening a new screen.
3. **Compare a repair at the same story moment.** A candidate selector and Before/After control should retain the selected beat. Use the same stage coordinates, show changed action text, and put the artistic cost immediately below. Mark unaffected beats as preserved. Display whole-scene validation and downstream conflicts explicitly.
4. **Give performance its own focused state.** Start with the five-second preparation countdown, then minimize setup content and emphasize the current cue, time remaining and next beat. Pause/reset remain large and reachable. Reset must restore preparation instructions. Completion never marks a genuine rehearsal successful.
5. **Keep collaboration evidence visible but subordinate.** A compact strip can show human instruction, writer, engineer review and exact approval state from actual receipts/jobs. Pending, disconnected and uncertain delivery need text. Avoid invented chat activity, fake agent typing, or an animated workflow that implies live integration evidence.
6. **Let the landing page demonstrate the mechanism.** Open with the performer’s outcome and a small interactive stage. Follow with the genuine workflow: report difficulty, inspect localized alternatives and artistic costs, approve the exact revision in Mattermost, carry offline cues and script away. Use a clearly labeled illustrative fixture if no live scene exists. Primary navigation should expose the workbench; sample interaction must remain separate from real approvals.

## Motion and interaction rules for implementation

- A selection changes the stage and selected-beat marker together. A short position transition can explain a prop changing modeled location; it is a schematic transition, not the duration of a physical action.
- Use brief button/selection feedback and an approximately 180–240 ms panel or token transition as an implementation choice. No competitor timing was measured.
- Before/After should move only affected props and replace changed text; unaffected content stays visually stable. Preserve focus and the selected beat when changing candidates.
- Timeline progress is driven by actual local cue playback. Never auto-start a performance or loop it without the performer’s action.
- Reduced motion snaps between states. Text labels, borders, icons and focus indicators carry meaning without relying on color or animation.
- Keep complete setup, long prop names, errors and artistic costs readable at 390 px. The stage and playback controls must remain usable through keyboard navigation.

## Local research evidence

Scratch evidence is under `work/design-research/`: public-page screenshots, extracted page metadata, and focused captures named `boords-timeline.png`, `arc-board.png`, `cuepilot-timeline.png`, `cueapp-view.png`, and `cueapp-demo.png`. These files are inspection evidence, not assets for redistribution or inclusion in the product. No official screenshots, branding, customer claims or reference-product artwork should be copied into Two Hands.
