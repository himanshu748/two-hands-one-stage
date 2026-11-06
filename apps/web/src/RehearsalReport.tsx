import { useRef, useState, type FormEvent } from "react";
import "./rehearsal-report.css";

type ReportKind = "observe" | "difficulty" | "success";

/** Prepares text only; the authorized performer's Switch message is the evidence. */
export function RehearsalReport({
  revisionId,
  connected,
  successBlocked,
}: {
  revisionId: string;
  connected: boolean;
  successBlocked: boolean;
}) {
  const [kind, setKind] = useState<ReportKind>("observe");
  const [text, setText] = useState("");
  const [performed, setPerformed] = useState(false);
  const [error, setError] = useState("");
  const [command, setCommand] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [copying, setCopying] = useState(false);
  const copyAttempt = useRef(0);
  const message = useRef<HTMLTextAreaElement>(null);
  const invalidate = () => {
    copyAttempt.current += 1;
    setCopying(false);
    setCommand("");
    setCopyStatus("");
    setError("");
  };
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!performed || !text.trim() || text.length > 4000) {
      setError("Confirm that you performed this revision, then describe what actually happened.");
      return;
    }
    if (kind === "success" && successBlocked) {
      setError("Resolve the pending observation or repair before reporting success.");
      return;
    }
    setError("");
    setCopyStatus("");
    copyAttempt.current += 1;
    setCopying(false);
    setCommand(`@two-hands-stage ${kind === "observe" ? "observe" : "outcome"} ${revisionId}${kind === "observe" ? "" : ` ${kind}`} ${text}`);
  }
  async function copy() {
    const attempt = ++copyAttempt.current;
    setCopying(true);
    setCopyStatus("");
    try {
      await navigator.clipboard.writeText(command);
      if (attempt !== copyAttempt.current) return;
      setCopyStatus("Copied, not sent. Paste it in your linked Mattermost channel.");
    } catch {
      if (attempt !== copyAttempt.current) return;
      setCopyStatus("Clipboard unavailable. The message is selected; copy it manually.");
      message.current?.focus();
      message.current?.select();
    } finally {
      if (attempt === copyAttempt.current) setCopying(false);
    }
  }
  return <section className="rehearsal-report" aria-labelledby="rehearsal-report-heading">
    <header>
      <span className="eyebrow">YOUR WORDS · LOCAL DRAFT</span>
      <h3 id="rehearsal-report-heading" tabIndex={-1}>How did it feel to perform?</h3>
      <p>A timer finishing is not a rehearsal. Describe only what you actually performed with your props.</p>
    </header>
    <div className="report-revision"><span>Approved revision</span><code>{revisionId}</code></div>
    {!connected && <p className="report-note" role="note">Switch is disconnected. You can prepare a message here, but it is not delivered or recorded until it reaches the linked room.</p>}
    {successBlocked && <p className="report-note">A constraint, pending observation or approval hold needs attention. You can describe a difficulty; success is unavailable until it is resolved.</p>}
    <form aria-label="Rehearsal report" onSubmit={prepare} noValidate>
      <label htmlFor="report-kind">What would you like to share?</label>
      <select id="report-kind" value={kind} onChange={(event) => { setKind(event.target.value as ReportKind); invalidate(); }}>
        <option value="observe">Ask for a staging repair</option>
        <option value="difficulty">Record a difficult rehearsal</option>
        <option value="success" disabled={successBlocked}>Record a successful rehearsal</option>
      </select>
      <p className="report-help">{kind === "observe" ? "The engineer will interpret your difficulty and ask you to confirm it before a repair. Name the beat or action that was difficult." : kind === "difficulty" ? "This records the outcome only. Choose “Ask for a staging repair” if you want the agents to propose changes." : "Describe what worked in this exact approved revision. No result is inferred from playback or validation."}</p>
      <label htmlFor="report-observation">What actually happened?</label>
      <textarea id="report-observation" value={text} maxLength={4000} rows={5} aria-describedby="report-word-count" onChange={(event) => { setText(event.target.value); invalidate(); }} />
      <small id="report-word-count">{text.length.toLocaleString()} / 4,000 characters · Use your own words.</small>
      <label className="report-confirm"><input type="checkbox" checked={performed} onChange={(event) => { setPerformed(event.target.checked); invalidate(); }} /><span>I performed revision <code>{revisionId}</code> with my actual props.</span></label>
      {error && <p className="report-error" role="alert">{error}</p>}
      <div className="report-actions"><button type="submit" className="secondary-button">Prepare rehearsal message <span aria-hidden="true">↗</span></button><small>Nothing is sent or saved by this form.</small></div>
    </form>
    {command && <div className="report-message">
      <span className="eyebrow">READY TO COPY · NOT SENT</span>
      <label htmlFor="report-command">Your rehearsal message for Mattermost</label>
      <textarea id="report-command" ref={message} value={command} readOnly rows={5} spellCheck={false} />
      <div className="report-actions"><button type="button" className="secondary-button" disabled={copying} onClick={() => { void copy(); }}>{copying ? "Copying message…" : "Copy rehearsal message"}</button><p role="status">{copying ? "Waiting for clipboard access…" : copyStatus || "Review the message, then send it from your authorized performer account."}</p></div>
      <small>Copying does not request a repair, approve a revision, or mark a rehearsal successful.</small>
    </div>}
  </section>;
}
