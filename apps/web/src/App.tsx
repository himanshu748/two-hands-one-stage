import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  validateScene,
  type Action,
  type Beat,
  type Revision,
  type State,
} from "@two-hands/domain";
import { CollaborationRoom } from "./CollaborationRoom.js";
import { StageView } from "./StageView.js";
import { BriefComposer, DraftRecovery } from "./BriefComposer.js";
import { RehearsalReport } from "./RehearsalReport.js";
import {
  WorkbenchStateSchema,
  type WorkbenchState,
  type Proposal,
} from "./state.js";

type View = "stage" | "repairs" | "exports" | "evidence";
type Inspector = "director" | "props" | "activity";
function navigateTabs(event: ReactKeyboardEvent<HTMLDivElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]"),
  );
  const index = tabs.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  event.preventDefault();
  tabs[next]?.focus();
  tabs[next]?.click();
}

function Icon({
  name,
  size = 18,
}: {
  name:
    | "play"
    | "pause"
    | "left"
    | "right"
    | "reset"
    | "layers"
    | "export"
    | "check"
    | "arrow"
    | "home"
    | "spark"
    | "copy";
  size?: number;
}) {
  const paths = {
    play: "m8 5 11 7-11 7Z",
    pause: "M8 5v14M16 5v14",
    left: "m14 5-7 7 7 7",
    right: "m10 5 7 7-7 7",
    reset: "M4 9a8 8 0 1 1 0 6M4 4v5h5",
    layers: "m3 7 9-5 9 5-9 5ZM3 12l9 5 9-5M3 17l9 5 9-5",
    export: "M12 3v12m-5-7 5-5 5 5M4 14v6h16v-6",
    check: "m5 12 4 4L19 6",
    arrow: "M5 19 19 5M6 5h13v13",
    home: "m4 10 8-7 8 7v10H4ZM9 20v-7h6v7",
    spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z",
    copy: "M8 8h12v12H8ZM16 8V4H4v12h4",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function propName(revision: Revision, id: string | null | undefined): string {
  return id
    ? (revision.props.find((prop) => prop.id === id)?.name ?? id)
    : "Free";
}
function locationName(location: string | undefined): string {
  return location === "rest"
    ? "Resting place"
    : location === "left"
      ? "Left hand"
      : location === "right"
        ? "Right hand"
        : location === "table"
          ? "Table"
          : "Unknown";
}
export function actionText(action: Action, revision: Revision, dialogue = ""): string {
  const surface = (place: string) =>
    place === "rest" ? "the resting place" : "the table";
  switch (action.type) {
    case "hold":
      return `Pick up ${propName(revision, action.propId)} from ${surface(action.from)} with your ${action.hand} hand.`;
    case "place":
    case "release":
      return `Set ${propName(revision, action.propId)} on ${surface(action.to)}; free your ${action.hand} hand.`;
    case "move":
      return `Use your ${action.hand} hand to move ${propName(revision, action.propId)} from ${surface(action.from)} to ${surface(action.to)}, then release.`;
    case "speak":
      return dialogue && action.text === dialogue
        ? "Say this beat’s dialogue now."
        : `Say: “${action.text}”`;
    case "pause":
      return `Pause for ${action.seconds} ${action.seconds === 1 ? "second" : "seconds"}.`;
  }
}
const statusLabels: Record<Proposal["status"], string> = {
  pending_review: "Engineer reviewing",
  eligible: "Ready for your decision",
  rejected: "Blocking conflict",
  committed: "Approved revision",
  invalidated: "No longer eligible",
};
function safeArtifactUrl(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin &&
      (url.pathname.startsWith("/artifacts/") || ((window.location.pathname === "/example" || window.location.pathname.startsWith("/example/")) && url.pathname.startsWith("/examples/artifacts/")))
      ? `${url.pathname}${url.search}`
      : null;
  } catch {
    return null;
  }
}
function MiniStage({ state }: { state: State }) {
  return (
    <span className="mini-stage" aria-hidden="true">
      <span className="mini-table" />
      <span className="mini-rest" />
      {["p1", "p2", "p3"].map((id, index) => (
        <i
          key={id}
          className={`mini-prop prop-${index} at-${state.locations[id] ?? "table"}`}
        />
      ))}
    </span>
  );
}
function BeatText({ beat, revision }: { beat: Beat; revision: Revision }) {
  return (
    <>
      <p className="diff-dialogue">
        “{beat.dialogue || "A moment without dialogue."}”
      </p>
      <ol className="diff-actions">
        {beat.actions.map((action, index) => (
          <li key={index}>
            <small>{action.type}</small>
            {actionText(action, revision, beat.dialogue)}
          </li>
        ))}
      </ol>
    </>
  );
}
function ApprovalCommand({ proposal }: { proposal: Proposal }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const messageDetails = useRef<HTMLDetailsElement>(null);
  const command = `@two-hands-stage approve ${proposal.id} ${proposal.candidate.id} ${proposal.digest}`;
  return (
    <div className="approval-command">
      <div>
        <strong>Your decision happens in Mattermost.</strong>
        <p>
          Copying this command does not approve anything. Paste it into your
          Mattermost chat and send it to choose this version. The recipient is already included.
        </p>
      </div>
      <button
        className="secondary-button"
        onClick={() => {
          void navigator.clipboard
            .writeText(command)
            .then(() => {
              setCopied(true);
              setFailed(false);
            })
            .catch(() => {
              setFailed(true);
              if (messageDetails.current) messageDetails.current.open = true;
            });
        }}
      >
        <Icon name="copy" />
        {copied ? "Command copied" : "Copy approval command"}
      </button>
      <details className="approval-message-details" ref={messageDetails}><summary>Show the exact message</summary><code className="copy-command">{command}</code></details>
      {failed && (
        <p role="status">
          Select and copy the command above; clipboard access is unavailable.
        </p>
      )}
      {copied && (
        <span className="sr-only" role="status">
          Approval command copied. Send it in Mattermost to approve.
        </span>
      )}
    </div>
  );
}

export function App() {
 const exampleMode=window.location.pathname === "/example" || window.location.pathname.startsWith("/example/");
 const [roomMode,setRoomMode] = useState(() => new URLSearchParams(window.location.search).get("view") !== "stage");
  const [state, setState] = useState<WorkbenchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<View>("stage");
  const [inspector, setInspector] = useState<Inspector>("director");
  const [selectedBeat, setSelectedBeat] = useState(0);
  const [selectedAction, setSelectedAction] = useState(-1);
  const [selectedProp, setSelectedProp] = useState<string | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);
  const [version, setVersion] = useState<"original" | "candidate">("original");
  const [playback, setPlayback] = useState<
    "stopped" | "countdown" | "playing" | "paused" | "ended"
  >("stopped");
  const [remaining, setRemaining] = useState(0);
  const lastRevision = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch(exampleMode ? "/examples/collaboration-state.json" : "/api/state", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error(
            `The application service returned HTTP ${response.status}.`,
          );
        const parsed = WorkbenchStateSchema.safeParse(await response.json());
        if (exampleMode && parsed.success && !parsed.data.synthetic) throw new Error("Public example must contain explicitly synthetic data.");
        if (!parsed.success)
          throw new Error(
            "The application service returned an incompatible scene. Check that the API and studio use the same version.",
          );
        if (active) {
          setState(parsed.data);
          setError(null);
        }
      } catch (failure) {
        if (active && !controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "The application service could not be reached.",
          );
      } finally {
        if (active) {
          setLoading(false);
          if (!exampleMode) timer = setTimeout(() => {
            void load();
          }, 3000);
        }
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [retry, exampleMode]);

  const proposal = state?.proposals.find(
    (item) => item.id === selectedProposal,
  );
  const availableProposals =
    state?.proposals.filter(
      (item) => item.status !== "committed" && item.status !== "invalidated",
    ) ?? [];
  const latestDraft = [...availableProposals].reverse().find((item) => item.status === "eligible" || item.status === "pending_review") ?? availableProposals.at(-1);
  const repair = proposal ?? latestDraft;
  const revision =
    (version === "candidate" ? proposal?.candidate : null) ??
    state?.current ??
    latestDraft?.candidate ??
    null;
  const modeled = useMemo(
    () =>
      revision
        ? {
            ...revision,
            constraints: state?.constraints ?? revision.constraints,
          }
        : null,
    [revision, state?.constraints],
  );
  const validation = useMemo(
    () => (modeled ? validateScene(modeled) : null),
    [modeled],
  );
  const beat = revision?.beats[selectedBeat];
  const action = beat?.actions[selectedAction];
  const transition = validation?.transitions.find(
    (item) => item.beatId === beat?.id,
  );
  const stepState = useMemo(() => {
    if (!modeled || !beat) return null;
    if (selectedAction < 0) return transition?.before ?? modeled.initialState;
    const prefix: Revision = {
      ...modeled,
      beats: modeled.beats.map((item) =>
        item.id === beat.id
          ? { ...item, actions: item.actions.slice(0, selectedAction + 1) }
          : item,
      ),
    };
    return (
      validateScene(prefix).transitions.find((item) => item.beatId === beat.id)
        ?.after ??
      transition?.before ??
      modeled.initialState
    );
  }, [modeled, beat, selectedAction, transition]);
  const actionIssue = validation?.issues.find(
    (issue) =>
      issue.beatId === beat?.id && issue.actionIndex === selectedAction,
  );
  const blockingIssue = validation?.issues[0];
  const revoked =
    !!revision &&
    (state?.approvals.some(
      (entry) => entry.revisionId === revision.id && entry.revoked,
    ) ??
      false);
  const approved = !!revision && revision.id === state?.current?.id && !revoked;
  const latestOutcome = state?.rehearsals
    .filter((attempt) => attempt.revisionId === revision?.id)
    .at(-1);
  const humanSuccess =
    approved &&
    !state?.approvalHold &&
    !state?.needsRepair &&
    !latestOutcome?.withdrawn &&
    latestOutcome?.source === "human" &&
    latestOutcome.outcome === "success";
  const latestObservation = state?.observations.at(-1);
  const artifact = approved
    ? state?.artifacts.find(
        (item) =>
          item.revisionId === revision.id &&
          item.digest === state.currentDigest,
      )
    : null;
  const cueUrl = artifact ? safeArtifactUrl(artifact.cueUrl) : null;
  const scriptUrl = artifact ? safeArtifactUrl(artifact.scriptUrl) : null;
  const pendingJobs =
    state?.jobs.filter((job) => !["completed", "done"].includes(job.status)) ??
    [];
  const pendingDeliveries =
    state?.deliveries.filter((delivery) => delivery.status !== "sent") ?? [];
  const connectionStatus = error
    ? "disconnected"
    : (state?.connection.status ?? "connecting");
  const brief = revision ?? state?.brief;
  const beatSeconds = beat?.seconds ?? 2;
  const nextBeat = revision?.beats[selectedBeat + 1];
  const nextBeatSeconds = nextBeat?.seconds;
  const nextBeatActionCount = nextBeat?.actions.length ?? 0;
  const actionCount = beat?.actions.length ?? 0;
  const selectedDiff = proposal?.diff.find(
    (change) => change.beatId === beat?.id,
  );
  const highlight =
    selectedProp ?? (action && "propId" in action ? action.propId : null);
  const totalSeconds =
    revision?.beats.reduce((sum, item) => sum + item.seconds, 0) ?? 0;

  useEffect(() => {
    if (revision?.id !== lastRevision.current) {
      lastRevision.current = revision?.id ?? null;
      setPlayback("stopped");
      setRemaining(0);
      setSelectedAction(-1);
    }
  }, [revision?.id]);
  useEffect(() => {
    if (playback !== "playing" && playback !== "countdown") return;
    const timer = setTimeout(() => {
      if (remaining > 1) {
        setRemaining(remaining - 1);
        return;
      }
      if (playback === "countdown") {
        setPlayback("playing");
        setRemaining(beatSeconds);
        setSelectedAction(actionCount - 1);
        return;
      }
      if (nextBeatSeconds !== undefined) {
        setSelectedBeat(selectedBeat + 1);
        setSelectedAction(nextBeatActionCount - 1);
        setRemaining(nextBeatSeconds);
      } else {
        setPlayback("ended");
        setRemaining(0);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [
    playback,
    remaining,
    beatSeconds,
    nextBeatSeconds,
    nextBeatActionCount,
    actionCount,
    selectedBeat,
  ]);
  const selectBeat = useCallback((index: number) => {
    setSelectedBeat(index);
    setSelectedAction(-1);
    setSelectedProp(null);
    setPlayback("stopped");
    setRemaining(0);
    setView("stage");
  }, []);
  const chooseAction = (index: number) => {
    setSelectedAction(index);
    setSelectedProp(null);
    setPlayback("stopped");
    setRemaining(0);
  };
  const step = (direction: -1 | 1) => {
    if (!revision || !beat) return;
    const next = selectedAction + direction;
    if (next >= -1 && next < beat.actions.length) chooseAction(next);
    else if (direction === 1 && selectedBeat < 5) selectBeat(selectedBeat + 1);
    else if (direction === -1 && selectedBeat > 0) {
      selectBeat(selectedBeat - 1);
      setSelectedAction(
        (revision.beats[selectedBeat - 1]?.actions.length ?? 1) - 1,
      );
    }
  };
  const togglePlayback = useCallback(() => {
    if (!revision) return;
    if (playback === "playing" || playback === "countdown") {
      setPlayback("paused");
      return;
    }
    setView("stage");
    setSelectedBeat(0);
    setSelectedAction(-1);
    setSelectedProp(null);
    setRemaining(5);
    setPlayback("countdown");
  }, [playback, revision]);
  useEffect(() => {
    if (roomMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (playback === "playing" || playback === "countdown")) {
        event.preventDefault();
        setPlayback("paused");
        return;
      }
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !revision ||
        (event.target as HTMLElement).closest(
          "button,a,input,textarea,select,summary,[contenteditable]",
        )
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        selectBeat(Math.min(5, selectedBeat + 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectBeat(Math.max(0, selectedBeat - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revision, playback, selectedBeat, togglePlayback, selectBeat, roomMode]);
  const preview = (item: Proposal) => {
    setSelectedProposal(item.id);
    setVersion("candidate");
    setView("stage");
    setSelectedAction(-1);
  };
  const workStatus = (
    <div className="work-status">
      {pendingJobs.length + pendingDeliveries.length === 0 && (
        <p className="muted">No pending application work.</p>
      )}
      {pendingJobs.map((job) => (
        <article key={job.id}>
          <span className="activity-marker" />
          <div>
            <strong>
              {job.role} · {job.status}
            </strong>
            <p>{job.error ?? "Waiting for the next durable operation."}</p>
          </div>
        </article>
      ))}
      {pendingDeliveries.map((delivery) => (
        <article key={delivery.id}>
          <span className="activity-marker amber" />
          <div>
            <strong>
              {delivery.role} delivery · {delivery.status}
            </strong>
            <p>{delivery.error}</p>
            {delivery.status === "uncertain" && (
              <p>
                Check the actual Switch room history before retrying. Delivery
                is not confirmed.
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  );

  if(roomMode) return <CollaborationRoom state={state} error={error} loading={loading} onRetry={() => {setLoading(true);setRetry(v=>v+1);}} onOpenStudio={next => {setPlayback("stopped");setView(next);setRoomMode(false);}} />;

  return (
    <div className="workbench">
      <a className="skip-link" href="#studio-main">
        Skip to the scene
      </a>
      <header className="studio-header">
        <a
          href="/"
          className="studio-brand"
          aria-label="Two Hands, One Stage home"
        >
          <span className="studio-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            two hands<span className="brand-divider">/</span>one stage
          </span>
        </a>
        <div className="studio-header-center">
          <span className="workspace-indicator" />
          Rehearsal studio
        </div>
        <div className="studio-header-actions">
 <button className="return-room" aria-label="Back to collaboration room" onClick={() => {setPlayback("stopped");setRoomMode(true);}}>← Room</button>
          <button
            className={`connection ${connectionStatus}`}
            onClick={() => setInspector("activity")}
          >
            <i />
            {`Switch ${connectionStatus}`}
          </button>
          <a href="/" className="icon-link" aria-label="Back to home">
            <Icon name="home" />
          </a>
        </div>
      </header>
      {state?.synthetic && (
        <div className="fixture-banner" role="note">
          <span>EXAMPLE DATA</span>
          <strong>Synthetic test scene</strong>
          <p>
            Interface verification only. No human rehearsal or live Switch
            session.
          </p>
        </div>
      )}
      {error && (
        <div className="studio-alert" role="alert">
          <div>
            <strong>Application service unavailable</strong>
            <span>
              {error}{" "}
              {state
                ? "Showing the last received snapshot."
                : "Start the API to load your scene."}
            </span>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              setRetry((value) => value + 1);
            }}
          >
            Retry connection
          </button>
        </div>
      )}
      {state?.approvalHold && (
        <div className="studio-alert warning" role="alert">
          <div>
            <strong>Collaboration on hold</strong>
            <span>
              Resolve the pending constraint or revoked instruction before
              further approval.
            </span>
          </div>
          <button onClick={() => setView("evidence")}>
            Inspect record <Icon name="right" size={14} />
          </button>
        </div>
      )}
      <div className="project-bar">
        <div className="project-title">
          <span className="eyebrow">ONE PERFORMER · THREE PROPS</span>
          <h1>{brief?.title ?? "Your next small story"}</h1>
        </div>
        <div className="project-status" aria-label="Revision status">
          <span
            className={validation?.valid ? "status-chip good" : "status-chip"}
          >
            {validation?.valid ? "✓" : "○"} Model checked
          </span>
          <span className={approved ? "status-chip good" : "status-chip"}>
            {revoked
              ? "× Approval revoked"
              : approved
                ? "✓ Approved"
                : "○ Approval pending"}
          </span>
          <span className={humanSuccess ? "status-chip good" : "status-chip"}>
            {humanSuccess
              ? "✓ Human rehearsed"
              : state?.needsRepair
                ? "○ Awaiting repair"
                : revoked || state?.approvalHold
                ? "○ Acceptance on hold"
                : approved
                  ? "○ Awaiting rehearsal"
                  : "○ Rehearsal pending"}
          </span>
        </div>
      </div>
      <main className="studio-main" id="studio-main" tabIndex={-1}>
        <aside className="storyboard">
          <div className="rail-heading">
            <h2>Storyboard</h2>
            <span>{revision ? "06 beats" : "No scene"}</span>
          </div>
          <nav className="beat-nav" aria-label="Scene beats">
            {revision?.beats.map((item, index) => (
              <button
                key={item.id}
                aria-current={selectedBeat === index ? "step" : undefined}
                onClick={() => selectBeat(index)}
              >
                <span className="beat-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="beat-tile">
                  <MiniStage
                    state={
                      validation?.transitions[index]?.after ??
                      revision.initialState
                    }
                  />
                  <span className="beat-tile-title">{item.title}</span>
                  <span className="beat-tile-meta">
                    {item.seconds}s
                    {proposal?.affectedBeats.includes(item.id) && (
                      <b>Changed</b>
                    )}
                  </span>
                </span>
              </button>
            ))}
          </nav>
          <div className="rail-footer">
            <span className="rail-total">
              {revision
                ? `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`
                : "—:—"}
            </span>
            <span>
              Total cue time
              <br />
              Six short parts
            </span>
          </div>
        </aside>
        <div className="studio-content">
          <div
            className="workspace-tabs"
            role="tablist"
            aria-label="Studio workspace"
            onKeyDown={navigateTabs}
          >
            {(
              [
                ["stage", "Stage"],
                ["repairs", "Repairs"],
                ["exports", "Take away"],
                ["evidence", "Record"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                id={`tab-${id}`}
                aria-selected={view === id}
                tabIndex={view === id ? 0 : -1}
                aria-controls={`panel-${id}`}
                onClick={() => setView(id)}
              >
                {label}
                {id === "repairs" && availableProposals.length > 0 && (
                  <span className="tab-count">{availableProposals.length}</span>
                )}
                {id === "evidence" &&
                  pendingDeliveries.some(
                    (item) => item.status === "uncertain",
                  ) && (
                    <span
                      className="attention-dot"
                      aria-label="Needs attention"
                    />
                  )}
              </button>
            ))}
          </div>
          <section
            className={`workspace-panel panel-${view}`}
            id={`panel-${view}`}
            role="tabpanel"
            aria-labelledby={`tab-${view}`}
            key={view}
          >
            {view === "stage" &&
              (!revision || !beat || !stepState ? (
                state && !state.brief && !loading ? (
                  <BriefComposer connected={!error && state.connection.status === "connected"} />
                ) : <div className="studio-empty">
                  <div className="empty-stage" aria-hidden="true">
                    <span>01</span>
                    <span>02</span>
                    <span>03</span>
                  </div>
                  <p className="eyebrow">
                    {loading ? "Opening the room" : state?.brief ? "Brief received" : "Begin in Mattermost"}
                  </p>
                  <h2>
                    {loading
                      ? "Getting the stage ready…"
                      : state?.brief ? "Your first scene is taking shape."
                      : "Your story starts with three objects."}
                  </h2>
                  <p>
                    {state?.brief ? "Your brief is saved. The writer and stage engineer will prepare and check six beats through Switch. Their pending work appears here." : <>Choose three props, an emotional goal, and one story fact to
                    keep. Send your brief to <strong>@two-hands-writer</strong>{" "}
                    in your linked Mattermost channel.</>}
                  </p>
                  <div className="empty-flow">
                    <span>01 Brief</span>
                    <i>→</i>
                    <span>02 Rehearse</span>
                    <i>→</i>
                    <span>03 Repair</span>
                  </div>
                  <p className="footnote">
                    Your scene and revision choices appear here. Instructions
                    and approval stay in Mattermost.
                  </p>
                  {workStatus}
                </div>
              ) : (
                <>
                  <details className="getting-started" open>
                    <summary>Start here · how to use your scene</summary>
                    <div className="getting-started-body">
                      <h2>A short play for your table.</h2>
                      <p>You read the lines aloud and move three objects. If a movement feels difficult, tell the two helpers in your Mattermost chat so they can suggest a change.</p>
                      <ol className="first-steps">
                        <li><strong>Gather your props</strong><p>{revision.props.map((prop) => prop.name).join(" · ")}</p><p className="setup-hint">Use a stable table. The script shows where each object starts.</p></li>
                        <li><strong>Read it once</strong><p>There are six short parts. Read the lines and movements before starting the timer.</p>{scriptUrl && !error ? <a className="guide-link" href={scriptUrl} target="_blank" rel="noreferrer">Read the full script <span aria-hidden="true">↗</span></a> : <p className="setup-hint">Choose each part in the storyboard to read this draft.</p>}</li>
                        <li><strong>Try it, then tell us</strong><p>Start with your hands free. The player gives you five seconds to get ready. Rest the props before touching a control.</p></li>
                      </ol>
                      <div className="guide-actions">
                        {cueUrl && !error && !state?.approvalHold && !state?.needsRepair && validation?.valid ? <a className="guide-primary" href={cueUrl} target="_blank" rel="noreferrer">Open the step-by-step player <span aria-hidden="true">↗</span></a> : <p className="guide-pending">{error ? "Reconnect before opening the current scene." : revoked ? "This version’s approval was withdrawn. Review the latest options before performing." : state?.approvalHold || state?.needsRepair || !validation?.valid ? "A change needs attention before you perform. Review the issue and options below." : "This is a draft. Review it in Repairs, then send the approval message in Mattermost before performing."}</p>}
                        {approved && <button className="guide-link" onClick={() => { setView("evidence"); requestAnimationFrame(() => document.getElementById("rehearsal-report-heading")?.focus()); }}>Tell us what happened <Icon name="right" size={14} /></button>}
                      </div>
                      <p className="setup-hint">The screen checks the instructions. Only trying them can tell you whether they feel comfortable.</p>
                    </div>
                  </details>
                  <div className="stage-heading">
                    <div>
                      <p className="eyebrow">
                        BEAT {String(selectedBeat + 1).padStart(2, "0")} / 06{" "}
                        <span>· {beat.seconds}s</span>
                      </p>
                      <h2>{beat.title}</h2>
                    </div>
                    <div className="beat-switch">
                      <button
                        className="icon-button"
                        aria-label="Previous beat"
                        disabled={selectedBeat === 0}
                        onClick={() => selectBeat(selectedBeat - 1)}
                      >
                        <Icon name="left" />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Next beat"
                        disabled={selectedBeat === 5}
                        onClick={() => selectBeat(selectedBeat + 1)}
                      >
                        <Icon name="right" />
                      </button>
                    </div>
                  </div>
                  {approved && (playback === "ended" || playback === "paused") && <div className="rehearsal-handoff">
                    <p>Rest your props, then describe what happened. Playback does not record a rehearsal.</p>
                    <button className="secondary-button" onClick={() => {
                      setView("evidence");
                      requestAnimationFrame(() => document.getElementById("rehearsal-report-heading")?.focus());
                    }}>Describe rehearsal <Icon name="arrow" size={14} /></button>
                  </div>}
                  <div className="stage-version-bar">
                    <span
                      className={`revision-label ${version === "candidate" && proposal ? "candidate" : ""}`}
                    >
                      {revoked
                        ? "Historical revision · approval revoked"
                        : approved
                          ? "Approved scene"
                          : "Candidate preview"}
                    </span>
                    {proposal && state?.current ? (
                      <div
                        className="version-switch"
                        role="group"
                        aria-label="Compare revision"
                      >
                        <button
                          aria-pressed={version === "original"}
                          onClick={() => {
                            setVersion("original");
                            setSelectedAction(-1);
                          }}
                        >
                          Original
                        </button>
                        <button
                          aria-pressed={version === "candidate"}
                          onClick={() => {
                            setVersion("candidate");
                            setSelectedAction(-1);
                          }}
                        >
                          Candidate<span>{proposal.affectedBeats.length}</span>
                        </button>
                      </div>
                    ) : (
                      <span className="model-key">
                        <i /> Where your props go
                      </span>
                    )}
                  </div>
                  <div className="stage-step-toolbar">
                    <div className="step-summary">
                      <span>
                        {selectedAction < 0
                          ? "SETUP"
                          : `ACTION ${selectedAction + 1} / ${actionCount}`}
                      </span>
                      <p aria-live="polite">
                        {action
                          ? actionText(action, revision, beat.dialogue)
                          : "Start with the props in the positions below."}
                      </p>
                    </div>
                    <div>
                      <button
                        className="quiet-button"
                        aria-label="Previous action"
                        disabled={selectedBeat === 0 && selectedAction === -1}
                        onClick={() => step(-1)}
                      >
                        <Icon name="left" size={14} />
                      </button>
                      <button
                        className="secondary-button"
                        aria-label="Next action"
                        disabled={
                          selectedBeat === 5 &&
                          selectedAction === actionCount - 1
                        }
                        onClick={() => step(1)}
                      >
                        Next action
                        <Icon name="right" size={14} />
                      </button>
                    </div>
                  </div>
                  <div
                    className={`tabletop-canvas ${actionIssue ? "has-conflict" : ""}`}
                  >
                    <StageView
                      state={stepState}
                      props={revision.props}
                      highlight={highlight}
                      label={`${selectedAction < 0 ? "Before" : "After action " + (selectedAction + 1) + " in"} ${beat.title}`}
                    />
                    <div className="canvas-caption">
                      <span>
                        {selectedAction < 0
                          ? "Starting positions"
                          : `After action ${selectedAction + 1} of ${beat.actions.length}`}
                      </span>
                      <span>
                        {actionIssue
                          ? "Invalid action not applied"
                          : "Symbolic staging · not physical proof"}
                      </span>
                    </div>
                    {playback === "countdown" && (
                      <div className="countdown-overlay" aria-live="polite">
                        <span>GET YOUR HANDS READY</span>
                        <strong key={remaining}>{remaining}</strong>
                        <p>Start with all props in their initial positions.</p>
                      </div>
                    )}
                  </div>
                  <div
                    className="prop-inspect-strip"
                    aria-label="Inspect props"
                  >
                    {revision.props.map((prop, index) => (
                      <button
                        key={prop.id}
                        aria-pressed={selectedProp === prop.id}
                        onClick={() => {
                          setSelectedProp(
                            selectedProp === prop.id ? null : prop.id,
                          );
                          setInspector("props");
                        }}
                      >
                        <i className={`prop-dot prop-${index}`} />
                        <span>{prop.name}</span>
                        <small>
                          {locationName(stepState.locations[prop.id])}
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="cue-script">
                    <span className="eyebrow">SAY</span>
                    <blockquote key={`${revision.id}-${beat.id}`}>
                      “{beat.dialogue || "A moment without dialogue."}”
                    </blockquote>
                  </div>
                  <div className="action-editor">
                    <div className="action-editor-top">
                      <span className="eyebrow">WHAT TO DO</span>
                      <span>
                        {selectedAction < 0
                          ? "Before the first action"
                          : `${selectedAction + 1} / ${beat.actions.length}`}
                      </span>
                    </div>
                    <div
                      className="action-stepper"
                      role="group"
                      aria-label="Action steps"
                    >
                      <button
                        aria-pressed={selectedAction === -1}
                        onClick={() => chooseAction(-1)}
                      >
                        Setup
                      </button>
                      {beat.actions.map((item, index) => (
                        <button
                          key={index}
                          aria-label={`Action ${index + 1}: ${item.type}`}
                          aria-pressed={selectedAction === index}
                          onClick={() => chooseAction(index)}
                        >
                          <span>{index + 1}</span>
                          {item.type}
                          {validation?.issues.some(
                            (issue) =>
                              issue.beatId === beat.id &&
                              issue.actionIndex === index,
                          ) && <b aria-label="Blocking conflict">!</b>}
                        </button>
                      ))}
                    </div>
                    <div
                      className={`current-action ${actionIssue ? "conflict" : ""}`}
                      key={`${revision.id}-${beat.id}-${selectedAction}`}
                    >
                      <span className="action-icon">
                        <Icon
                          name={
                            action?.type === "pause"
                              ? "pause"
                              : action?.type === "speak"
                                ? "spark"
                                : "right"
                          }
                        />
                      </span>
                      <div>
                        <strong>
                          {action
                            ? actionText(action, revision, beat.dialogue)
                            : "Place the props, then step through the staging."}
                        </strong>
                        {actionIssue ? (
                          <p>
                            {actionIssue.message} No state change was applied.
                          </p>
                        ) : (
                          <p>
                            {selectedAction < 0
                              ? "Use Next action to see hands and prop positions change."
                              : "The table reflects the deterministic state after this action."}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {selectedDiff && (
                    <button
                      className="beat-change-note"
                      onClick={() => setView("repairs")}
                    >
                      <span>
                        <Icon name="layers" size={16} />
                        {beat.id.toUpperCase()} changed in this candidate
                      </span>
                      <span>
                        Inspect the diff <Icon name="right" size={14} />
                      </span>
                    </button>
                  )}
                </>
              ))}
            {view === "repairs" && (
              <div className="repairs-view">
                <div className="panel-heading">
                  <p className="eyebrow">KEEP THE STORY. CHANGE THE STAGING.</p>
                  <h2>Choose the artistic cost.</h2>
                  <p>
                    Every alternative is a complete six-beat scene. Your
                    decision stays in Mattermost.
                  </p>
                </div>
                {availableProposals.length === 0 && (
                  <div className="panel-empty">
                    <Icon name="layers" size={30} />
                    <h3>No alternatives yet.</h3>
                    <p>
                      Rehearse the approved scene and tell the stage engineer
                      what was genuinely difficult.
                    </p>
                  </div>
                )}
                <div
                  className="repair-choices"
                  role="group"
                  aria-label="Repair alternatives"
                >
                  {availableProposals.map((item, index) => (
                    <button
                      key={item.id}
                      aria-pressed={repair?.id === item.id}
                      onClick={() => setSelectedProposal(item.id)}
                    >
                      <span>OPTION {String(index + 1).padStart(2, "0")}</span>
                      <strong>
                        {item.affectedBeats
                          .map((id) => id.toUpperCase())
                          .join(" + ")}
                      </strong>
                      <small>{statusLabels[item.status]}</small>
                    </button>
                  ))}
                </div>
                {repair && (
                  <div className="repair-detail">
                    <div className="repair-title">
                      <div>
                        <span
                          className={`status-chip ${repair.status === "eligible" ? "good" : ""}`}
                        >
                          {statusLabels[repair.status]}
                        </span>
                        <h3>{repair.candidate.title}</h3>
                      </div>
                      <button
                        className="primary-button"
                        onClick={() => preview(repair)}
                      >
                        Preview this candidate
                        <Icon name="arrow" size={16} />
                      </button>
                    </div>
                    <div className="artistic-cost">
                      <span className="eyebrow">THE ARTISTIC TRADEOFF</span>
                      {repair.artisticCosts.map((cost, index) => (
                        <p key={index}>{cost}</p>
                      ))}
                    </div>
                    <div className="review-note">
                      <Icon name="check" size={16} />
                      <div>
                        <strong>Stage engineer</strong>
                        <p>
                          {repair.review ??
                            "Review pending. This candidate cannot be approved yet."}
                        </p>
                        {repair.validation.issues.map((issue, index) => (
                          <p className="repair-issue" key={index}>
                            {issue.beatId?.toUpperCase()}: {issue.message}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="diff-list">
                      {repair.diff.map((change) => (
                        <div className="diff-entry" key={change.beatId}>
                          <div className="diff-entry-heading">
                            <h4>
                              {change.beatId.toUpperCase()} ·{" "}
                              {change.after.title}
                            </h4>
                            <span>Changed</span>
                          </div>
                          <div className="diff-columns">
                            <section aria-label={`Before ${change.beatId}`}>
                              <span className="diff-label">Before</span>
                              <BeatText
                                beat={change.before}
                                revision={state?.current ?? repair.candidate}
                              />
                            </section>
                            <section aria-label={`After ${change.beatId}`}>
                              <span className="diff-label">After</span>
                              <BeatText
                                beat={change.after}
                                revision={repair.candidate}
                              />
                            </section>
                          </div>
                        </div>
                      ))}
                    </div>
                    {!repair.diff.length && (
                      <p className="footnote">
                        Initial scene proposal. Preview the candidate to inspect
                        all six beats.
                      </p>
                    )}
                    <p className="footnote">
                      Whole sequence{" "}
                      {repair.validation.valid
                        ? "model checked"
                        : "has conflicts"}
                      . Rechecked transitions:{" "}
                      {repair.dependentTransitions
                        .map((id) => id.toUpperCase())
                        .join(" → ")}
                      . Unaffected beat content is preserved.
                    </p>
                    {repair.status === "eligible" &&
                      repair.validation.valid && (
                        <ApprovalCommand proposal={repair} />
                      )}
                  </div>
                )}
              </div>
            )}
            {view === "exports" && (
              <div className="exports-view">
                <div className="panel-heading">
                  <p className="eyebrow">TAKE THE STAGE WITH YOU</p>
                  <h2>Take your scene with you.</h2>
                  <p>
                    Save the cues and script before you go offline. Both come
                    from the same approved version of your story.
                  </p>
                </div>
                <div className="export-illustration" aria-hidden="true">
                  <div>
                    <span>01 / 06</span>
                    <b>
                      “A place
                      <br />
                      for you.”
                    </b>
                    <i>▶ ━━━━━</i>
                  </div>
                  <div>
                    <span>THE SCRIPT</span>
                    <b>
                      Stories you can
                      <br />
                      actually perform.
                    </b>
                    <i>
                      ━━━━━━
                      <br />
                      ━━━━
                      <br />
                      ━━━━━━
                    </i>
                  </div>
                </div>
                {cueUrl && scriptUrl ? (
                  <>
                    <a
                      className="export-link"
                      href={cueUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="play" size={22} />
                      <span>
                        <strong>Offline cue player</strong>
                        <small>Timed playback · standalone HTML</small>
                      </span>
                      <Icon name="arrow" />
                    </a>
                    <a
                      className="export-link"
                      href={scriptUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="export" size={22} />
                      <span>
                        <strong>Printable script</strong>
                        <small>Dialogue and actions · print-ready HTML</small>
                      </span>
                      <Icon name="arrow" />
                    </a>
                    <div className="artifact-digest">
                      <span>APPROVED REVISION</span>
                      <strong>{artifact?.revisionId}</strong>
                      <code>SHA-256 {artifact?.digest}</code>
                    </div>
                  </>
                ) : (
                  <div className="panel-empty">
                    <h3>
                      {revoked
                        ? "Approval revoked"
                        : approved
                          ? "Artifact delivery pending"
                          : "Available after exact approval"}
                    </h3>
                    <p>
                      {revoked
                        ? "Downloaded exports are historical copies. Do not treat this revision as currently approved."
                        : approved
                          ? "Your revision is saved. Artifact links will appear when rendering completes."
                          : "Inspect an eligible candidate, then approve its exact revision and digest in Mattermost."}
                    </p>
                    <button
                      className="secondary-button"
                      onClick={() => setView("repairs")}
                    >
                      Review alternatives <Icon name="right" size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
            {view === "evidence" && (
              <div className="evidence-view">
                <div className="panel-heading">
                  <p className="eyebrow">AN INSPECTABLE REHEARSAL RECORD</p>
                  <h2>What changed. What happened.</h2>
                  <p>
                    Approval and rehearsal are separate. Only a real performer
                    can report a successful rehearsal.
                  </p>
                </div>
                {approved && revision && !error ? <RehearsalReport
                  key={`${revision.id}:${state?.currentDigest}:${state?.approvalHold}:${state?.needsRepair}`}
                  revisionId={revision.id}
                  connected={connectionStatus === "connected"}
                  successBlocked={!!state?.approvalHold || !!state?.needsRepair}
                /> : <p className="record-warning">{error ? "Reconnect to the application service before preparing a rehearsal message so its revision and approval can be checked." : "Rehearsal messages must refer to an approved revision. Return to the approved scene or approve an exact candidate in Mattermost first."}</p>}
                <section className="record-section">
                  <h3>Revision & approval</h3>
                  <div className="record-revision">
                    <span>{revision?.id ?? "No revision yet"}</span>
                    <strong>
                      {revoked
                        ? "Approval revoked"
                        : approved
                          ? "Approved · immutable content"
                          : "Awaiting exact approval"}
                    </strong>
                  </div>
                  {state?.approvalHold && (
                    <p className="record-warning">
                      Collaboration is on hold. Resolve the pending constraint
                      or revoked instruction.
                    </p>
                  )}
                </section>
                <section className="record-section">
                  <h3>Human observations</h3>
                  {!state?.observations.length && (
                    <p className="muted">No observation has been reported.</p>
                  )}
                  {state?.observations.map((observation) => (
                    <article
                      className="record-observation"
                      key={observation.id}
                    >
                      <small>ORIGINAL WORDS · {observation.revisionId}</small>
                      <blockquote>“{observation.text}”</blockquote>
                      <p>
                        <strong>Engineer interpretation:</strong>{" "}
                        {observation.interpretation ?? "Pending"}
                      </p>
                      <span className="status-chip">
                        {observation.status === "confirmed"
                          ? "Human confirmed"
                          : "Awaiting confirmation"}
                      </span>
                    </article>
                  ))}
                </section>
                <section
                  className="record-section"
                  aria-label="Rehearsal history"
                >
                  <h3>Rehearsal outcomes</h3>
                  {!state?.rehearsals.length && (
                    <p className="muted">
                      No physical rehearsal recorded. Model checked does not
                      mean performed.
                    </p>
                  )}
                  {state?.rehearsals.map((attempt) => (
                    <article className="record-attempt" key={attempt.id}>
                      <span className="status-chip">
                        {attempt.source === "human"
                          ? "Human report"
                          : "Synthetic fixture"}{" "}
                        ·{" "}
                        {attempt.outcome === "success"
                          ? "Success"
                          : "Difficulty"}
                      </span>
                      {attempt.withdrawn && <span className="status-chip">Withdrawn</span>}
                      <p>{attempt.text}</p>
                      <code>{attempt.revisionId}</code>
                    </article>
                  ))}
                </section>
                <section className="record-section">
                  <h3>Work & delivery</h3>
                  {workStatus}
                </section>
              </div>
            )}
          </section>
        </div>
        <aside className="studio-inspector" aria-label="Rehearsal inspector">
          <div
            className="inspector-tabs"
            role="tablist"
            aria-label="Inspector"
            onKeyDown={navigateTabs}
          >
            {(
              [
                ["director", "Director"],
                ["props", "Props"],
                ["activity", "Activity"],
              ] as const
            ).map(([id, label]) => (
              <button
                role="tab"
                key={id}
                aria-selected={inspector === id}
                tabIndex={inspector === id ? 0 : -1}
                onClick={() => setInspector(id)}
              >
                {label}
                {id === "activity" &&
                  pendingJobs.length + pendingDeliveries.length > 0 && (
                    <span>{pendingJobs.length + pendingDeliveries.length}</span>
                  )}
              </button>
            ))}
          </div>
          <div className="inspector-content" key={inspector}>
            {inspector === "director" && (
              <>
                {state?.brief && !state.current && state.retryDraft && <DraftRecovery recovery={state.retryDraft} />}
                {blockingIssue ? (
                  <section className="director-conflict">
                    <span className="eyebrow">ONE BLOCKING CONFLICT</span>
                    <h3>{blockingIssue.message}</h3>
                    <p>
                      {blockingIssue.beatId?.toUpperCase() ?? "Scene"} · Resolve
                      before approval.
                    </p>
                    {blockingIssue.beatId && (
                      <button
                        onClick={() => {
                          const index =
                            revision?.beats.findIndex(
                              (item) => item.id === blockingIssue.beatId,
                            ) ?? 0;
                          selectBeat(Math.max(index, 0));
                          setSelectedAction(blockingIssue.actionIndex ?? -1);
                        }}
                      >
                        Show the action <Icon name="right" size={14} />
                      </button>
                    )}
                  </section>
                ) : (
                  <section className="director-check">
                    <Icon name="check" size={20} />
                    <div>
                      <strong>
                        {validation?.valid
                          ? "The staging checks out."
                          : "Your scene will appear here."}
                      </strong>
                      <p>
                        {validation?.valid
                          ? "Now it needs a real pair of hands."
                          : "Send your brief through the room."}
                      </p>
                    </div>
                  </section>
                )}
                {latestObservation && (
                  <section className="inspector-section">
                    <span className="eyebrow">
                      ORIGINAL PERFORMER OBSERVATION
                    </span>
                    <blockquote>“{latestObservation.text}”</blockquote>
                    <span className="observation-source">
                      {latestObservation.revisionId}
                    </span>
                    <div className="interpretation">
                      <span className="eyebrow">
                        STAGE ENGINEER INTERPRETATION
                      </span>
                      <p>
                        {latestObservation.interpretation ??
                          "Awaiting interpretation. Original words are preserved."}
                      </p>
                      <span className="status-chip">
                        {latestObservation.status === "confirmed"
                          ? "Confirmed by performer"
                          : "Needs human confirmation"}
                      </span>
                    </div>
                  </section>
                )}
                {!!state?.constraints.length && (
                  <section className="inspector-section">
                    <span className="eyebrow">CONFIRMED CONSTRAINTS</span>
                    {state.constraints.map((constraint) => (
                      <p className="constraint-row" key={constraint.id}>
                        <i />
                        {constraint.description}
                      </p>
                    ))}
                  </section>
                )}
                {brief && (
                  <section className="inspector-section scene-brief">
                    <span className="eyebrow">KEEP THIS TRUE</span>
                    <p>{brief.protectedFact}</p>
                    <span className="eyebrow">EMOTIONAL GOAL</span>
                    <p>{brief.emotionalGoal}</p>
                  </section>
                )}
                <p className="inspector-footnote">
                  The model checks hands, props, and transitions. Your actual
                  performance is the final test.
                </p>
              </>
            )}
            {inspector === "props" && (
              <>
                <div className="inspector-heading">
                  <p className="eyebrow">THE PHYSICAL STATE</p>
                  <h3>
                    Three props.
                    <br />
                    Two hands.
                  </h3>
                </div>
                {revision && stepState ? (
                  <>
                    <div className="hands-inspector">
                      {(["left", "right"] as const).map((hand) => (
                        <div
                          key={hand}
                          className={
                            state?.constraints.some(
                              (constraint) =>
                                constraint.unavailableHand === hand,
                            )
                              ? "hand-unavailable"
                              : ""
                          }
                        >
                          <span>{hand === "left" ? "L" : "R"}</span>
                          <div>
                            <small>{hand} hand</small>
                            <strong>
                              {propName(revision, stepState.hands[hand])}
                            </strong>
                            {state?.constraints.some(
                              (constraint) =>
                                constraint.unavailableHand === hand,
                            ) && <em>Must stay free</em>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="position-list">
                      {revision.props.map((prop, index) => (
                        <button
                          className={selectedProp === prop.id ? "selected" : ""}
                          key={prop.id}
                          onClick={() =>
                            setSelectedProp(
                              selectedProp === prop.id ? null : prop.id,
                            )
                          }
                          aria-pressed={selectedProp === prop.id}
                        >
                          <i className={`prop-dot prop-${index}`} />
                          <span>
                            <strong>{prop.name}</strong>
                            <small>
                              {prop.id} ·{" "}
                              {locationName(stepState.locations[prop.id])}
                            </small>
                          </span>
                          <Icon name="arrow" size={14} />
                        </button>
                      ))}
                    </div>
                    <div className="inspector-section">
                      <span className="eyebrow">ENVIRONMENTAL RESOURCES</span>
                      <p>
                        The table, resting place, and cue device are part of the
                        setup. They are not extra story props.
                      </p>
                      <p>
                        Diagrams show symbolic locations, not actual distances,
                        reach, or scale.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="muted">
                    Your props will appear after the writer creates a scene.
                  </p>
                )}
              </>
            )}
            {inspector === "activity" && (
              <>
                <div className={`connection-detail ${connectionStatus}`}>
                  <span className="eyebrow">ROOM CONNECTION</span>
                  <h3>Switch {connectionStatus}</h3>
                  <p>
                    {error
                      ? "The displayed scene may be stale. Restore the API connection."
                      : (state?.connection.detail ??
                        "Waiting for the application service.")}
                  </p>
                </div>
                <section className="inspector-section">
                  <span className="eyebrow">PENDING WORK & DELIVERY</span>
                  {workStatus}
                </section>
                <div className="inspector-section">
                  <span className="eyebrow">COLLABORATORS</span>
                  <div className="collaborator">
                    <span>W</span>
                    <div>
                      <strong>Playwright</strong>
                      <small>Story & artistic alternatives</small>
                    </div>
                  </div>
                  <div className="collaborator">
                    <span>E</span>
                    <div>
                      <strong>Stage engineer</strong>
                      <small>Constraints & whole-scene review</small>
                    </div>
                  </div>
                  <p className="inspector-footnote">
                    Human instructions and approvals stay in Mattermost.
                    Downloaded cues work offline.
                  </p>
                </div>
              </>
            )}
          </div>
        </aside>
      </main>
      <footer className="cue-transport">
        <div className="transport-left">
          <button
            className={`play-main ${playback === "playing" || playback === "countdown" ? "is-playing" : ""}`}
            disabled={!revision}
            onClick={togglePlayback}
            aria-label={
              playback === "playing" || playback === "countdown"
                ? "Pause cues"
                : "Start timed cues"
            }
          >
            <Icon
              name={
                playback === "playing" || playback === "countdown"
                  ? "pause"
                  : "play"
              }
              size={19}
            />
            <span>
              {playback === "playing" || playback === "countdown"
                ? "Pause"
                : playback === "paused"
                  ? "Restart scene"
                  : "Rehearse"}
            </span>
          </button>
          <button
            className="icon-button"
            aria-label="Reset"
            disabled={!revision}
            onClick={() => selectBeat(0)}
          >
            <Icon name="reset" size={18} />
          </button>
          <div className="transport-copy" aria-live="polite" aria-atomic="true">
            <strong>
              {playback === "countdown"
                ? `Hands ready in ${remaining}…`
                : playback === "playing"
                  ? `Beat ${selectedBeat + 1} · ${remaining}s remaining`
                  : playback === "paused"
                    ? "Paused — reset props before restarting"
                    : playback === "ended"
                      ? "Cues finished · no rehearsal recorded"
                      : "Five-second lead-in"}
            </strong>
            <span>
              {playback === "paused"
                ? "Safely place props before restarting."
                : "Start before picking up the props."}
            </span>
          </div>
        </div>
        <div className="transport-timeline" aria-label="Cue progress">
          {revision?.beats.map((item, index) => (
            <button
              key={item.id}
              onClick={() => selectBeat(index)}
              aria-label={`Jump to beat ${index + 1}`}
              className={
                index === selectedBeat
                  ? "active"
                  : index < selectedBeat
                    ? "past"
                    : ""
              }
            >
              <i
                style={{
                  width:
                    index < selectedBeat
                      ? "100%"
                      : index === selectedBeat && playback === "playing"
                        ? `${(1 - remaining / item.seconds) * 100}%`
                        : "0%",
                }}
              />
              <span>{String(index + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
        <div className="transport-help">
          <span>
            <kbd>Space</kbd> play / pause · <kbd>Esc</kbd> pause
          </span>
          <span>Rest props before touching controls.</span>
        </div>
      </footer>
    </div>
  );
}
