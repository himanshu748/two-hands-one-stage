import { useEffect, useMemo, useRef, useState } from "react";
import { validateScene } from "@two-hands/domain";
import { StageView } from "./StageView.js";
import {
  exampleOriginal,
  exampleRepairs,
  exampleValidation,
} from "./landing-example.js";
import "./landing.css";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}
function Mark() {
  return (
    <span className="lp-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={"lp-reveal " + (visible ? "is-visible " : "") + className}
    >
      {children}
    </div>
  );
}
export function Landing() {
  const [heroBeat, setHeroBeat] = useState(-1);
  const [constrained, setConstrained] = useState(false);
  const [choice, setChoice] = useState(0);
  const [compare, setCompare] = useState<"original" | "repair">("repair");
  const [repairBeat, setRepairBeat] = useState(0);
  const sampleBeat = heroBeat < 0 ? null : exampleOriginal.beats[heroBeat]!;
  const heroState =
    heroBeat < 0
      ? exampleOriginal.initialState
      : exampleValidation.transitions[heroBeat]!.after;
  const repair = exampleRepairs[choice]!;
  const preview =
    constrained && compare === "repair" ? repair.revision : exampleOriginal;
  const physical = useMemo(() => validateScene(preview), [preview]);
  const modelPasses = validateScene(
    constrained
      ? { ...preview, constraints: repair.revision.constraints }
      : preview,
  ).valid;
  return (
    <div className="landing">
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <header className="lp-header">
        <a className="lp-brand" href="/" aria-label="Two Hands, One Stage home">
          <Mark />
          <span>
            Two Hands,
            <br />
            One Stage<span className="lp-brand-dot">.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">The process</a>
          <a href="#repair-lab">Try a repair</a>
          <a href="#take-it-with-you">The takeaway</a>
        </nav>
        <a className="lp-nav-cta" href="/example">
          Open example <Arrow diagonal />
        </a>
      </header>
      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">
              <span className="lp-dot" /> A small stage. A story worth telling.
            </p>
            <h1 id="hero-title">
              Stories you can
              <br />
              <em>actually</em>
              <br />
              perform<span className="lp-period">.</span>
            </h1>
            <p className="lp-hero-intro">
              Make a short play with three objects on your table.
              <br />
              Two AI helpers write the lines and movements. You try them,
              tell them what felt difficult, and choose a better version.
            </p>
            <div className="lp-hero-actions">
              <a className="lp-button lp-primary" href="/example">
                Explore the example room <Arrow diagonal />
              </a>
              <a className="lp-text-button" href="#repair-lab">
                Try the interactive example <Arrow />
              </a>
            </div>
            <p className="lp-hero-note">
              Built for one performer. Your creative decisions stay yours.
            </p>
          </div>
          <div className="lp-hero-object">
            <div className="lp-floating-note">
              <span>ONE SIMPLE PROMISE</span>
              <p>
                The story keeps its heart.
                <br />
                The staging finds a way.
              </p>
              <svg viewBox="0 0 80 50" aria-hidden="true">
                <path d="M3 5Q55 8 63 41M49 34L64 43L73 28" />
              </svg>
            </div>
            <div className="lp-stage-window">
              <div className="lp-window-bar">
                <span className="lp-window-title">
                  <span className="lp-window-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  A light left on
                </span>
                <span className="lp-example-label">Interactive example</span>
              </div>
              <div className="lp-stage-meta">
                <span>THE TABLETOP</span>
                <span>One performer · three props</span>
              </div>
              <StageView
                state={heroState}
                props={exampleOriginal.props}
                label="Interactive example tabletop"
              />
              <div className="lp-cue-strip" aria-live="polite">
                <span className="lp-cue-number">
                  {String(heroBeat + 1).padStart(2, "0")}
                  <small>/06</small>
                </span>
                <div key={heroBeat} className="lp-cue-text">
                  <span>{sampleBeat ? sampleBeat.title : "Set the stage"}</span>
                  <p>
                    {sampleBeat
                      ? sampleBeat.dialogue
                      : "A paper boat. A blue cup. A key that still fits."}
                  </p>
                </div>
                <button
                  className="lp-step-play"
                  aria-label={
                    heroBeat === 5 ? "Reset example" : "Play next example beat"
                  }
                  onClick={() => setHeroBeat((b) => (b === 5 ? -1 : b + 1))}
                >
                  {heroBeat === 5 ? "↺" : "▶"}
                </button>
              </div>
              <div className="lp-mini-timeline" aria-label="Example beats">
                {exampleOriginal.beats.map((beat, index) => (
                  <button
                    key={beat.id}
                    className={index <= heroBeat ? "has-played" : ""}
                    aria-label={"Preview example beat " + (index + 1)}
                    aria-pressed={index === heroBeat}
                    onClick={() => setHeroBeat(index)}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <i />
                  </button>
                ))}
              </div>
            </div>
            <div className="lp-hero-caption">
              <span className="lp-small-arrow">↖</span>
              <p>
                Press play. Follow the props.
                <br />
                <span>
                  Synthetic example · modeled positions, not a live rehearsal.
                </span>
              </p>
            </div>
          </div>
        </section>
        <div className="lp-scope-strip">
          <span>A rehearsal, not another blank page.</span>
          <div>
            <span>
              <b>03</b> familiar props
            </span>
            <span>
              <b>06</b> story beats
            </span>
            <span>
              <b>01</b> human in charge
            </span>
          </div>
        </div>
        <section className="lp-process" id="how-it-works">
          <Reveal className="lp-section-heading">
            <p className="lp-eyebrow">A CREATIVE LOOP YOU CAN FEEL</p>
            <h2>
              The best revision
              <br />
              starts <em>at the table.</em>
            </h2>
            <p>
              A beautiful line can ask too much of your hands.
              <br />
              Rehearsal gives the story something a prompt cannot.
            </p>
          </Reveal>
          <div className="lp-process-grid">
            <Reveal className="lp-process-card">
              <span className="lp-process-index">01 / BRING THE STORY</span>
              <div className="lp-prop-illustration" aria-hidden="true">
                <span>boat</span>
                <span>cup</span>
                <span>key</span>
                <svg viewBox="0 0 290 105">
                  <path d="M15 76L91 76L74 94L31 94Z" />
                  <path d="M49 29L49 73L20 73Z" />
                  <path d="M54 37L54 71L78 71Z" />
                  <path d="M129 43H172V84Q151 99 129 84ZM174 48Q204 48 183 76H174" />
                  <circle cx="234" cy="58" r="13" />
                  <path d="M247 58H282M268 58V70M278 58V69" />
                </svg>
              </div>
              <h3>Start with what you have.</h3>
              <p>
                Name three props, an emotional goal, and one story fact that
                must stay true. Your playwright shapes six beats around them.
              </p>
              <div className="lp-role-label">
                <span className="lp-role-avatar human">H</span>You set the
                intention
              </div>
            </Reveal>
            <Reveal className="lp-process-card">
              <span className="lp-process-index">02 / FIND THE FRICTION</span>
              <div className="lp-friction-illustration" aria-hidden="true">
                <div className="lp-hand-token">L</div>
                <span className="lp-friction-path" />
                <div className="lp-hand-token available">R</div>
                <span className="lp-friction-note">
                  “I need this hand free.”
                </span>
              </div>
              <h3>Let your hands have a say.</h3>
              <p>
                Perform it. Report what was genuinely difficult. Your stage
                engineer checks the actions and asks you to confirm the
                constraint.
              </p>
              <div className="lp-role-label">
                <span className="lp-role-avatar stage">S</span>Stage engineer
                checks the moves
              </div>
            </Reveal>
            <Reveal className="lp-process-card">
              <span className="lp-process-index">03 / CHOOSE THE COST</span>
              <div className="lp-revision-illustration" aria-hidden="true">
                <div>
                  <span>Keep the gesture</span>
                  <i />
                  <i />
                  <b>Change the rhythm</b>
                </div>
                <div>
                  <span>Keep the rhythm</span>
                  <i />
                  <i />
                  <b>Let the prop rest</b>
                </div>
              </div>
              <h3>Change the move. Keep the meaning.</h3>
              <p>
                Compare localized repairs and what each gives up. Choose an
                exact revision in Mattermost, then see how it feels in
                performance.
              </p>
              <div className="lp-role-label">
                <span className="lp-role-avatar writer">W</span>Playwright
                offers alternatives
              </div>
            </Reveal>
          </div>
        </section>
        <section
          className="lp-repair-section"
          id="repair-lab"
          aria-labelledby="repair-title"
        >
          <div className="lp-repair-heading">
            <div>
              <p className="lp-eyebrow">GET A FEEL FOR IT</p>
              <h2 id="repair-title">
                One constraint.
                <br />
                <em>Two different stories.</em>
              </h2>
            </div>
            <p>
              Try the same scene with a hand kept free.
              <br />
              Watch what changes—and what it costs.
            </p>
          </div>
          <div className="lp-repair-lab">
            <div className="lp-repair-controls">
              <div className="lp-lab-label">
                <span>YOUR CONSTRAINT</span>
                <span>01</span>
              </div>
              <label className="lp-constraint-switch">
                <input
                  type="checkbox"
                  checked={constrained}
                  onChange={(e) => {
                    setConstrained(e.target.checked);
                    setCompare("repair");
                  }}
                />
                <span className="lp-toggle-track" aria-hidden="true">
                  <i />
                </span>
                <span>
                  <strong>Keep the left hand free</strong>
                  <small>Switch it on to explore the repairs.</small>
                </span>
              </label>
              <p className="lp-lab-disclaimer">
                Illustrative constraint. It is not a report from a real
                rehearsal.
              </p>
              <div
                className={
                  "lp-alternatives " + (!constrained ? "is-dormant" : "")
                }
                aria-label="Example repair alternatives"
              >
                {exampleRepairs.map((item, index) => (
                  <button
                    key={item.name}
                    disabled={!constrained}
                    aria-pressed={constrained && choice === index}
                    onClick={() => {
                      setChoice(index);
                      setCompare("repair");
                    }}
                  >
                    <span className="lp-alternative-letter">
                      {index === 0 ? "A" : "B"}
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.kicker}</small>
                    </span>
                    <span aria-hidden="true">
                      {constrained && choice === index ? "✓" : "↗"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="lp-artistic-cost" aria-live="polite">
                <span>
                  {constrained
                    ? "THE ARTISTIC COST"
                    : "THE PROTECTED STORY FACT"}
                </span>
                <p key={constrained ? choice : "fact"}>
                  {constrained ? repair.cost : exampleOriginal.protectedFact}
                </p>
                <small>
                  {constrained
                    ? repair.changed
                    : "This stays true in both alternatives."}
                </small>
              </div>
            </div>
            <div className="lp-repair-preview">
              <div className="lp-compare-bar">
                <span>THE SAME SIX BEATS</span>
                <div role="group" aria-label="Compare example revisions">
                  <button
                    aria-pressed={!constrained || compare === "original"}
                    onClick={() => setCompare("original")}
                  >
                    Original
                  </button>
                  <button
                    disabled={!constrained}
                    aria-pressed={constrained && compare === "repair"}
                    onClick={() => setCompare("repair")}
                  >
                    Repair
                  </button>
                </div>
              </div>
              <StageView
                state={physical.transitions[repairBeat]!.after}
                props={preview.props}
                highlight={constrained ? "p1" : null}
                label="Repair example tabletop"
              />
              <div
                className={
                  "lp-demo-verdict " + (modelPasses ? "valid" : "blocked")
                }
                role="status"
              >
                <span aria-hidden="true">{modelPasses ? "✓" : "!"}</span>
                <span>
                  {!constrained
                    ? "Original scene · no constraint applied"
                    : modelPasses
                      ? "Left hand free · all six beats model checked"
                      : "Original staging needs the left hand · repair required"}
                </span>
              </div>
              <div
                className="lp-repair-beats"
                aria-label="Repair example beat navigation"
              >
                {preview.beats.map((beat, index) => (
                  <button
                    key={beat.id}
                    aria-label={"Inspect repair beat " + (index + 1)}
                    aria-pressed={repairBeat === index}
                    onClick={() => setRepairBeat(index)}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <small>{beat.title}</small>
                    {constrained &&
                      JSON.stringify(repair.revision.beats[index]!.actions) !==
                        JSON.stringify(
                          exampleOriginal.beats[index]!.actions,
                        ) && <i />}
                  </button>
                ))}
              </div>
              <p className="lp-example-footnote">
                A local, synthetic walkthrough. Live collaboration and exact
                approval happen in your Switch room.
              </p>
            </div>
          </div>
        </section>
        <section
          className="lp-collaboration"
          aria-labelledby="collaboration-title"
        >
          <Reveal>
            <div className="lp-collaboration-copy">
              <p className="lp-eyebrow">
                TWO COLLABORATORS. ONE CREATIVE DECISION-MAKER.
              </p>
              <h2 id="collaboration-title">
                They work together.
                <br />
                <em>You have the final word.</em>
              </h2>
              <p>
                The playwright cares about the story. The stage engineer cares
                about the actions. Switch keeps the handoffs in the room, where
                you can see, question, and approve them.
              </p>
              <a className="lp-text-button" href="/example">
                Meet your rehearsal workspace <Arrow />
              </a>
            </div>
            <div
              className="lp-collaborator-diagram"
              aria-label="You, the playwright and stage engineer collaborate through one Switch room"
            >
              <div className="lp-collab-person performer">
                <span>H</span>
                <strong>You</strong>
                <small>Observe · choose · perform</small>
              </div>
              <div className="lp-room-link">
                <i />
                <span>ONE SWITCH ROOM</span>
                <i />
              </div>
              <div className="lp-collab-agents">
                <div className="lp-collab-person">
                  <span>W</span>
                  <strong>Playwright</strong>
                  <small>Story + artistic tradeoffs</small>
                </div>
                <div className="lp-collab-person">
                  <span>S</span>
                  <strong>Stage engineer</strong>
                  <small>Actions + whole-scene checks</small>
                </div>
              </div>
              <p>Human instructions and approvals stay in Mattermost.</p>
            </div>
          </Reveal>
        </section>
        <section className="lp-takeaway" id="take-it-with-you">
          <Reveal>
            <div className="lp-takeaway-copy">
              <p className="lp-eyebrow">WHEN THE SCREEN STEPS ASIDE</p>
              <h2>
                Take the stage
                <br />
                <em>with you.</em>
              </h2>
              <p>
                Your approved revision becomes two simple files. Keep your cues
                nearby. Put the script on the table. Perform without a live
                model or a connection.
              </p>
              <div className="lp-export-links">
                <a
                  href="/examples/synthetic-cue.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Try the sample cue player <Arrow diagonal />
                </a>
                <a
                  href="/examples/synthetic-script.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the sample script <Arrow diagonal />
                </a>
              </div>
              <small>
                Both downloads are labeled synthetic examples, not
                human-approved work.
              </small>
            </div>
            <div className="lp-export-art" aria-hidden="true">
              <div className="lp-script-paper">
                <span>TWO HANDS, ONE STAGE</span>
                <h3>A light left on</h3>
                <small>THE PRINTABLE SCRIPT</small>
                <i />
                <i />
                <b>01 &nbsp; The empty shore</b>
                <p>I kept your boat exactly where you left it.</p>
                <i />
                <i />
                <b>02 &nbsp; A small lighthouse</b>
                <i />
                <i />
                <i />
              </div>
              <div className="lp-cue-device">
                <div>
                  <span>OFFLINE CUES</span>
                  <span>01 / 06</span>
                </div>
                <h3>
                  The empty
                  <br />
                  shore.
                </h3>
                <p>I kept your boat exactly where you left it.</p>
                <div className="lp-device-progress">
                  <i />
                </div>
                <div className="lp-device-button">▶ &nbsp; Your next move</div>
              </div>
            </div>
          </Reveal>
        </section>
        <section className="lp-faq">
          <Reveal>
            <div>
              <p className="lp-eyebrow">A FEW THINGS TO KNOW</p>
              <h2>Small by design.</h2>
            </div>
            <div>
              {[
                {
                  q: "Do I need special props or performance experience?",
                  a: "No special equipment is part of the model: you choose three named objects and use a table and a resting surface. You still decide what is physically safe, comfortable, and meaningful for you.",
                },
                {
                  q: "Is the animated example a real agent session?",
                  a: "No. The examples on this page are clearly labeled synthetic scenes. They demonstrate the local action model and artistic tradeoffs. The live studio reads your application state and never silently replaces it with a demo.",
                },
                {
                  q: "What does “model checked” actually mean?",
                  a: "The deterministic checker follows hand occupancy, prop locations, and action preconditions across all six beats. It cannot judge grip, weight, balance, comfort, or artistic success. Only your genuine rehearsal report can establish a human outcome.",
                },
                {
                  q: "Where do I create and approve a scene?",
                  a: "In the linked Mattermost channel, through Switch. The studio lets you inspect, compare, and play cues. Your exact candidate revision and digest must be approved in Mattermost; there is no hidden approval button here.",
                },
              ].map((item) => (
                <details key={item.q}>
                  <summary>
                    {item.q}
                    <span aria-hidden="true">+</span>
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </section>
        <section className="lp-final-cta">
          <p className="lp-eyebrow">THREE OBJECTS ARE ENOUGH TO BEGIN.</p>
          <h2>
            Make a little
            <br />
            <em>room for a story.</em>
          </h2>
          <a className="lp-button lp-primary" href="/example">
            Open your rehearsal room <Arrow diagonal />
          </a>
          <p>
            Local MVP · Switch and model setup required for live collaboration.
          </p>
        </section>
      </main>
      <footer className="lp-footer">
        <a className="lp-brand" href="/">
          <Mark />
          <span>
            Two Hands,
            <br />
            One Stage.
          </span>
        </a>
        <p>A story. A table. A little possibility.</p>
        <a href="/example">
          Enter the studio <Arrow diagonal />
        </a>
        <div>
          <span>Built for Flip the Switch Hackathon 2026</span>
          <span>No live rehearsal is claimed by these examples.</span>
        </div>
      </footer>
    </div>
  );
}
