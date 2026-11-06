import { useState, type FormEvent } from "react";
import { BriefSchema, PROP_IDS } from "@two-hands/domain";
import "./brief-composer.css";

type Field = "title" | "p1" | "p2" | "p3" | "emotionalGoal" | "protectedFact";
type Fields = Record<Field, string>;
const emptyFields: Fields = { title: "", p1: "", p2: "", p3: "", emotionalGoal: "", protectedFact: "" };

export function DraftRecovery({ recovery }: { recovery: { eligible: boolean; remaining: number; reason: string } }) {
  const [copyStatus, setCopyStatus] = useState("");
  const command = "@two-hands-writer retry-draft";
  return <section className="brief-recovery" aria-label="First draft recovery">
    <span className="eyebrow">FIRST DRAFT</span>
    <h3>{recovery.eligible ? "Ask for another draft" : "Draft status"}</h3>
    <p>{recovery.reason}</p>
    <small>{recovery.remaining} {recovery.remaining === 1 ? "retry" : "retries"} remaining. Your original brief stays the same.</small>
    {recovery.eligible && <>
      <label htmlFor="retry-draft-command">Send in Mattermost</label>
      <textarea id="retry-draft-command" readOnly value={command} rows={2} />
      <button type="button" onClick={() => { void (async () => {
        try { await navigator.clipboard.writeText(command); setCopyStatus("Copied. Send it in Mattermost to request a new draft."); }
        catch { setCopyStatus("Select and copy the message above. Clipboard is unavailable."); }
      })(); }}>Copy retry instruction</button>
      <p role="status">{copyStatus || "Copying does not send a request or approve a scene."}</p>
    </>}
  </section>;
}

/** A local drafting aid only. The authenticated Mattermost message starts the scene. */
export function BriefComposer({ connected }: { connected: boolean }) {
  const [sceneId] = useState(() => `scene-${crypto.randomUUID()}`);
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [errors, setErrors] = useState<Partial<Record<Field | "props", string>>>({});
  const [command, setCommand] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  function update(field: Field, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setCommand("");
    setCopyState("idle");
    setErrors({});
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = BriefSchema.safeParse({
      sceneId,
      title: fields.title.trim(),
      props: PROP_IDS.map((id) => ({ id, name: fields[id].trim() })),
      emotionalGoal: fields.emotionalGoal.trim(),
      protectedFact: fields.protectedFact.trim(),
    });
    if (!result.success) {
      const next: Partial<Record<Field | "props", string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] === "props"
          ? typeof issue.path[1] === "number" ? PROP_IDS[issue.path[1]] ?? "props" : "props"
          : issue.path[0] as Field;
        next[key] ??= issue.message;
      }
      setErrors(next);
      setCommand("");
      return;
    }
    setErrors({});
    setCopyState("idle");
    setCommand(`@two-hands-writer brief ${JSON.stringify(result.data, null, 2)}`);
  }
  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(command);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }
  function field(id: Field, label: string, limit: number, multiline = false) {
    const shared = {
      id: `brief-${id}`, name: id, value: fields[id], maxLength: limit,
      "aria-invalid": !!errors[id],
      "aria-describedby": errors[id] ? `brief-${id}-error` : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(id, event.target.value),
    };
    return <div className="brief-field">
      <label htmlFor={shared.id}>{label}</label>
      {multiline ? <textarea {...shared} rows={3} /> : <input {...shared} type="text" autoComplete="off" />}
      {errors[id] && <span className="brief-field-error" id={`brief-${id}-error`}>{errors[id]}</span>}
    </div>;
  }
  return <div className="brief-composer">
    <header className="brief-intro">
      <span className="eyebrow">YOUR FIRST SCENE · LOCAL DRAFT</span>
      <h2>Three objects. One small story.</h2>
      <p>Name three objects you have nearby. The writing helper will turn them into a short play for you to read aloud and act out at your table.</p>
    </header>
    {!connected && <p className="brief-connection" role="note">Switch is not connected. You can draft here; the agents can begin only after your message reaches the linked Mattermost channel.</p>}
    <form onSubmit={prepare} noValidate aria-label="Scene brief">
      {Object.keys(errors).length > 0 && <p className="brief-error-summary" role="alert">Check the marked fields. Include three distinct props and complete your scene brief.</p>}
      {field("title", "Scene title", 160)}
      <fieldset className="brief-props">
        <legend>Your three props</legend>
        <p>For example: a folded note, a cup and a key. You’ll also need a stable table and a screen to follow the instructions.</p>
        <div>{PROP_IDS.map((id, index) => <div key={id}>{field(id, `Prop ${index + 1}`, 80)}</div>)}</div>
        {errors.props && <p className="brief-field-error">{errors.props}</p>}
      </fieldset>
      {field("emotionalGoal", "Emotional goal", 2000, true)}
      <p className="brief-field-help">What should the audience feel by the end?</p>
      {field("protectedFact", "Protected story fact", 2000, true)}
      <p className="brief-field-help">One thing that must stay true, even if the story changes. For example: “The note belongs to someone who has not returned.”</p>
      <div className="brief-prepare"><button type="submit">Prepare Mattermost message <span aria-hidden="true">↗</span></button><small>Draft stays in this view. Nothing is sent or saved.</small></div>
    </form>
    {command && <section className="brief-message" aria-labelledby="brief-message-heading">
      <span className="eyebrow">READY TO COPY · NOT SENT</span>
      <h3 id="brief-message-heading">Start the conversation in Mattermost</h3>
      <p>Copy this exact message into your linked channel using your authorized performer account. The writer receives the brief through Switch. This is a new-scene instruction, not approval.</p>
      <label htmlFor="brief-command">Your Mattermost message</label>
      <textarea id="brief-command" value={command} readOnly rows={13} spellCheck={false} />
      <div className="brief-copy-row"><button type="button" onClick={() => { void copyMessage(); }}>Copy brief message</button><p role="status">{copyState === "copied" ? "Copied. Paste it in Mattermost to begin." : copyState === "failed" ? "Clipboard unavailable. Select and copy the message above." : "Review every field before sending."}</p></div>
      <small>Scene ID: <code>{sceneId}</code> · Kept stable while you edit this draft.</small>
    </section>}
  </div>;
}
