import { createHash } from "node:crypto";
import {
  canonicalize,
  RevisionSchema,
  validateScene,
  type Action,
  type Revision,
  type State,
} from "@two-hands/domain";
import { artifactStyle } from "../templates/artifact-style.js";
import { cuePlayerScript } from "../templates/cue-player.js";

function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
function hash(value: string, encoding: "hex" | "base64"): string {
  return createHash("sha256").update(value).digest(encoding);
}
function location(value: string): string {
  return (
    (
      {
        table: "table",
        rest: "resting place",
        left: "left hand",
        right: "right hand",
      } as Record<string, string>
    )[value] ?? value
  );
}
function propName(revision: Revision, id: string | null): string {
  return id === null
    ? "free"
    : (revision.props.find((prop) => prop.id === id)?.name ?? id);
}
function actionText(action: Action, revision: Revision): string {
  switch (action.type) {
    case "hold":
      return `Pick up ${propName(revision, action.propId)} from the ${location(action.from)} with your ${action.hand} hand. Keep holding it.`;
    case "place":
      return `Put ${propName(revision, action.propId)} on the ${location(action.to)} with your ${action.hand} hand, then let go.`;
    case "release":
      return `Set ${propName(revision, action.propId)} down on the ${location(action.to)} with your ${action.hand} hand, then let go. Do not drop it.`;
    case "move":
      return `With your free ${action.hand} hand, move ${propName(revision, action.propId)} from the ${location(action.from)} to the ${location(action.to)}, then let go.`;
    case "speak":
      return action.text;
    case "pause":
      return `Wait ${action.seconds} second${action.seconds === 1 ? "" : "s"}.`;
  }
}
function stateText(state: State, revision: Revision): string {
  return (
    `Left: ${propName(revision, state.hands.left)} · Right: ${propName(revision, state.hands.right)}. ` +
    revision.props
      .map(
        (prop) =>
          `${prop.name}: ${location(state.locations[prop.id] ?? "unknown")}`,
      )
      .join(" · ")
  );
}

/** Caller must retrieve this immutable revision from approved storage; rendering does not grant approval. */
export function renderArtifact(
  input: Revision,
  digest: string,
  kind: "cue" | "script",
  synthetic = false,
): string {
  if (!["cue", "script"].includes(kind))
    throw new Error("Unknown artifact kind");
  const revision = RevisionSchema.parse(input);
  if (
    !/^[a-f0-9]{64}$/.test(digest) ||
    hash(canonicalize(revision), "hex") !== digest
  ) {
    throw new Error(
      "Artifact content digest does not match its immutable revision",
    );
  }
  const checked = validateScene(revision);
  if (!checked.valid)
    throw new Error(
      "An invalid scene cannot be rendered as an approved artifact",
    );
  const cue = kind === "cue";
  const scriptPolicy = cue
    ? `'sha256-${hash(cuePlayerScript, "base64")}'`
    : "'none'";
  const csp = `default-src 'none'; script-src ${scriptPolicy}; style-src 'sha256-${hash(artifactStyle, "base64")}'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const totalSeconds = revision.beats.reduce((total, beat) => total + beat.seconds, 0);
  const setup = `<section class="setup" id="setup" aria-labelledby="setup-title"><p class="step-label">1 · Get ready</p><h2 id="setup-title">Put these three objects within reach.</h2>
<ul class="prop-list">${revision.props.map((prop) => `<li><strong>${escape(prop.name)}</strong><span>Starts ${revision.initialState.locations[prop.id] === "left" || revision.initialState.locations[prop.id] === "right" ? "in your" : "on the"} ${escape(location(revision.initialState.locations[prop.id] ?? "unknown"))}</span></li>`).join("")}</ul>
<p class="hand-setup">Starting hands — left: ${escape(propName(revision, revision.initialState.hands.left))}; right: ${escape(propName(revision, revision.initialState.hands.right))}.</p>
<p>Use a steady table and leave room to set things down. Keep your screen where you can read it.</p>
${revision.constraints.length ? `<h3>Your agreed limits</h3><ul>${revision.constraints.map((constraint) => `<li>${escape(constraint.description)}</li>`).join("")}</ul>` : ""}
<p class="muted">${cue ? "If an object starts in your hand, leave it within reach until you press Start. You will have five seconds to get into position." : "Put the objects in the starting positions above, then follow the six parts below at your own pace."}</p></section>`;
  const controls = cue
    ? `<section class="controls no-print" aria-label="Cue playback controls">
<div class="control-intro"><div><p class="step-label">2 · Try the scene</p><h2>Read first. Then try it with the timer.</h2></div><button id="read-through" type="button" aria-expanded="false" aria-controls="score">Read the whole scene</button></div>
<p class="cue-guidance">Say the large text aloud. Follow the numbered actions in order. There is no recorded voice or sound.</p>
<label class="confirm"><input id="prepared" type="checkbox"><span>My objects are ready. I can take the starting positions in five seconds.</span></label>
<div class="control-row"><button class="primary" id="start" type="button" disabled>Start the scene</button><button id="pause" type="button" disabled>Pause</button><button id="reset" type="button">Start over</button></div>
<p id="playback-status" role="status" aria-live="polite">Ready when you are · five-second countdown</p><p id="remaining" aria-live="off"></p>
<p class="muted cue-guidance">Need to stop? Set your objects down safely, then press Pause or Escape. Switching away also pauses. Put everything back before starting over. The timer is a guide, not a test.</p></section>`
    : `<section class="reading-guide"><p class="step-label">2 · Follow the scene</p><p>Say the large text aloud and do the numbered actions in order. Each part is one small moment in the story. Take your time on the first try.</p></section>`;
  const beats = revision.beats
    .map((beat, index) => {
      const transition = checked.transitions[index]!;
      const hasDialogueCue = beat.actions.some((action) => action.type === "speak" && action.text === beat.dialogue);
      return `<article class="beat" id="${escape(beat.id)}" data-seconds="${beat.seconds}" data-title="${escape(beat.title)}"${cue && index !== 0 ? " hidden" : ""}>
<div class="number">Part ${index + 1} of 6 · ${beat.seconds} seconds</div><h2>${escape(beat.title)}</h2>
${beat.dialogue && !hasDialogueCue ? `<div class="spoken"><span class="action-label">Say during this part</span><p class="dialogue">${escape(beat.dialogue)}</p></div>` : ""}
<ol class="actions" aria-label="What to do, in order">${beat.actions.map((action) => action.type === "speak"
        ? `<li class="spoken"><span class="action-label">Say aloud</span><p class="dialogue">${escape(actionText(action, revision))}</p></li>`
        : `<li><span class="action-label">${action.type === "pause" ? "Wait" : "Do"}</span><p>${escape(actionText(action, revision))}</p></li>`).join("")}</ol>
<details class="positions"><summary>Check hand and object positions</summary><p class="state"><strong>Before:</strong> ${escape(stateText(transition.before, revision))}</p><p class="state"><strong>After:</strong> ${escape(stateText(transition.after, revision))}</p></details></article>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escape(csp)}"><meta name="revision-id" content="${escape(revision.id)}"><meta name="content-digest" content="${digest}"><title>${escape(revision.title)} — ${cue ? "Offline cue player" : "Printable script"}</title><style>${artifactStyle}</style></head>
<body><a class="skip" href="#score">Skip to the scene</a><main>
<header><p class="eyebrow">Two Hands, One Stage</p><h1>${escape(revision.title)}</h1><p class="lead">A short story you perform with three objects.</p><p>You are the performer. Read the lines aloud and move the objects as shown.</p><p class="scene-meta">One person <span>·</span> Six short parts <span>·</span> ${totalSeconds} seconds${cue ? " + 5 seconds to get ready" : ""}</p></header>
${synthetic ? '<p class="synthetic">Synthetic test artifact. No live Switch approval or human physical rehearsal is implied.</p>' : ""}
${setup}${controls}<section id="score" aria-label="Six-part scene">${beats}</section>
<section id="end-note" class="end-note"${cue ? " hidden" : ""}><p class="step-label">3 · Tell us how it went</p><h2>What felt easy? What got awkward?</h2><p>Maybe a line felt rushed, or moving an object was difficult. In the studio, open Record and describe what happened. Copy the prepared message into Mattermost. If you only read along, try it with the objects before reporting a rehearsal.</p><p class="muted">Playing these cues does not create rehearsal evidence.</p><details><summary>Message to send in Mattermost</summary><p>This records an outcome only. To ask for changes, use the repair option in the studio’s Record form. For an outcome, address this to the stage engineer, choose success or difficulty, and replace the last part with your own words:</p><code>outcome ${escape(revision.id)} success|difficulty &lt;what actually happened&gt;</code></details></section>
${cue ? '<noscript><p class="end-note">JavaScript is disabled. Timed playback is unavailable. Open the companion printable script for all six parts.</p></noscript>' : '<p class="no-print muted">To print all six parts, use your browser’s Print command (Ctrl/Cmd + P).</p>'}
<details class="record"><summary>About this scene &amp; version details</summary><dl class="brief"><div><dt>The feeling to aim for</dt><dd>${escape(revision.emotionalGoal)}</dd></div><div><dt>Keep this true in the story</dt><dd>${escape(revision.protectedFact)}</dd></div></dl><p>Model checked · ${synthetic ? "Synthetic approval fixture" : "Approved revision"} · Human rehearsal recorded separately</p><p>The table, resting place and screen are equipment, not extra story props. These checks track hands and object locations; they do not prove that the scene is comfortable to perform.</p><p>Each numbered spoken cue is said once; repeated cues are performed each time. When the main line has no numbered cue, say it once during that part. The approved words, actions and timing have not changed.</p><p class="identity">Revision <code>${escape(revision.id)}</code><br>Content digest <code>${digest}</code></p></details>
<footer>Keep this file to use it without an internet connection. No audio plays, and nothing is sent or saved when you use the timer.</footer>
</main>${cue ? `<script>${cuePlayerScript}</script>` : ""}</body></html>`;
}
