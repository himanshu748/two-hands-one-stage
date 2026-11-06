# The physical action model

This is a small symbolic resource model for one performer, three named story props (`p1`, `p2`, `p3`), two hands and six ordered beats (`b1`–`b6`). It does not predict weight, grip, balance, reach, dexterity, comfort, safety or acting quality. Passing its checks is **model checked**, never evidence of a physical rehearsal.

The table, a second resting area named `rest`, and the cue device are environmental resources, not extra story props. The performer must supply stable reachable surfaces with enough space; capacity and geometry are not simulated. Every story prop occupies exactly one location: `table`, `rest`, `left` or `right`. Each hand holds at most one prop, and each prop uses exactly one hand when held. Two-handed lifting and hand-to-hand transfers are outside this MVP.

## Actions

Actions run sequentially in their beat's declared order. The validator carries resulting state into every later beat.

| Action | Preconditions | Result |
| --- | --- | --- |
| `hold(propId, hand, from)` | Declared prop is on `from`; hand is free and available | Prop moves to that hand; hand becomes occupied |
| `place(propId, hand, to)` | Available hand holds that exact prop | Prop moves to `to`; hand becomes free |
| `move(propId, hand, from, to)` | Declared prop is on `from`; hand is free and available | Atomic pick-up and placement; prop ends on `to`; hand ends free |
| `release(propId, hand, to)` | Same as `place` | Deliberate supported placement, never dropping or throwing |
| `speak(text)` | No physical resource requirement | Physical state unchanged |
| `pause(seconds)` | Positive bounded duration | Physical state unchanged |

The beat's `dialogue` is the principal script text. If a `speak` action exactly matches that text, it locates the line in the action sequence instead of adding a duplicate reading; the studio labels it ‘Say this beat’s dialogue now,’ while the HTML prints the line directly at its numbered action. The HTML omits a separate principal-dialogue block when an exact matching cue exists. Each explicit cue is performed once, so repeated matching cues still mean intentional repetition. Other `speak` actions add distinct lines. Without a matching cue, speak the principal dialogue once during the beat. This display clarification was made before any live revision was approved; candidate text, actions and digests are unchanged. The timer uses the beat's `seconds` as a rehearsal pacing suggestion, not a measured execution guarantee. Explicit pause durations must fit inside that interval; the human must assess whether there is enough additional time for speech and movement. The offline timed player starts before either hand is occupied. Pausing or manually advancing needs interaction with the cue device: stop the performance and safely free a hand before touching a control. These interruptions are not silently counted as feasible scene actions. No voice, foot-pedal or hands-free hardware integration is claimed.

## Constraints and observations

A constraint includes the source observation ID and a human-confirmed interpretation. The supported deterministic constraint is an unavailable left or right hand for the whole revision. It applies both to the starting state and every physical action. Descriptive constraints with `unavailableHand: null` are blocked as `unsupported_constraint`; they are not silently treated as satisfied. Original human observations and interpretations remain separate API records. The schema does not determine who confirmed a constraint: that authorization belongs to the application's trusted Switch ingestion boundary.

## Validation and patches

The initial hand map and location map must agree and contain exactly the declared props. Invalid starting state prevents simulation. Invalid actions produce issues with the beat and action index; they leave physical state unchanged so the remaining checks cannot invent successful actions.

A patch replaces one to six complete beats by stable ID. It cannot edit the scene brief, prop names, initial state, emotional goal or protected-fact string. Unaffected beat content is preserved exactly. A candidate receives a new revision ID and the base revision as parent; constraints can be explicitly attached by the service. All six beats are validated again after every patch and again during approval commit.

For example, moving the cup to `table` in beat `b2` is locally feasible, but unchanged beat `b5` expects it on `rest`. The whole-sequence check rejects that candidate at `b5`. The test suite includes this counterexample. The application reports changed beats and downstream dependencies; it does not claim globally minimal repairs.

Keeping the protected-fact string immutable cannot prove that every line of dialogue respects its meaning. The writer instructions, stage review and human's exact-revision approval provide that artistic review. This limitation is visible rather than represented as a physical or semantic proof.

`canonicalize` sorts object keys, retains array order and rejects non-JSON values. The API hashes that canonical immutable revision; the domain package has no Node, model-provider, database or Switch dependency.

## Synthetic data

`fixtures/scene.ts` is explicitly synthetic. Its baseline is symbolically feasible and has no deliberately impossible action. It is used to verify implementation behavior, not to claim a genuine difficulty, approval or successful human rehearsal.
