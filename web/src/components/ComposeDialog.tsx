import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Image, LockKeyhole, Paperclip, X } from "lucide-react";
import type { PostKind } from "../types";

const kinds: Array<{ value: PostKind; label: string; hint: string }> = [
  { value: "request", label: "Request", hint: "Find someone for a job" },
  { value: "service", label: "Service", hint: "Offer what you do" },
  { value: "update", label: "Update", hint: "Share work in progress" },
  { value: "proof", label: "Proof", hint: "Attach evidence to a job" },
];

export function ComposeDialog({
  open,
  connected,
  submitting,
  onClose,
  onConnect,
  onSubmit,
}: {
  open: boolean;
  connected: boolean;
  submitting: boolean;
  onClose: () => void;
  onConnect: () => void;
  onSubmit: (input: { kind: PostKind; body: string; jobId?: string }) => Promise<void>;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const [kind, setKind] = useState<PostKind>("request");
  const [body, setBody] = useState("");
  const [jobId, setJobId] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("dialog-open");
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.classList.remove("dialog-open"); };
  }, [open, onClose, submitting]);

  if (!open) return null;

  const fee = kind === "request" || kind === "service" ? "0.10" : "0.01";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!connected) { onConnect(); return; }
    await onSubmit({ kind, body, ...(kind === "proof" && jobId ? { jobId } : {}) });
    setBody("");
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <section ref={dialogRef} className="compose-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="compose-dialog__header">
          <div><span className="eyebrow">Create on NimSocial</span><h2 id={titleId}>What are you putting to work?</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close composer" disabled={submitting}><X /></button>
        </header>

        <form onSubmit={submit}>
          <fieldset className="kind-selector">
            <legend>Post type</legend>
            {kinds.map((item) => (
              <label key={item.value} className={kind === item.value ? "is-selected" : ""}>
                <input type="radio" name="kind" value={item.value} checked={kind === item.value} onChange={() => setKind(item.value)} />
                <strong>{item.label}</strong><small>{item.hint}</small>
              </label>
            ))}
          </fieldset>

          <label className="field" htmlFor="post-body">
            <span>{kind === "request" ? "Describe the outcome you need" : kind === "service" ? "Describe the value you provide" : "Share a specific, verifiable update"}</span>
            <textarea id="post-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} minLength={1} required autoFocus placeholder={kind === "request" ? "Include the deliverable, context, and what a good result looks like…" : "Keep it concrete. Useful proof beats broad claims…"} />
            <small>{body.length}/2,000</small>
          </label>

          {kind === "proof" && (
            <label className="field" htmlFor="job-reference"><span>Job reference</span><input id="job-reference" value={jobId} onChange={(event) => setJobId(event.target.value)} placeholder="Select an accepted job" required /></label>
          )}

          <div className="attachment-row">
            <button type="button" disabled title="Media upload is planned after the first payment flow"><Image size={18} /> Media</button>
            <button type="button" disabled title="Evidence attachments are planned after the first payment flow"><Paperclip size={18} /> Evidence</button>
            <span>Attachments coming next</span>
          </div>

          <div className="payment-review">
            <div className="payment-review__icon"><LockKeyhole size={20} /></div>
            <div><span>Publication payment</span><strong>{fee} NIM</strong><small>Confirms intent and anchors a compact post reference.</small></div>
            <CheckCircle2 size={20} aria-label="Payment details ready" />
          </div>

          {!connected && <p className="inline-note">Open NimSocial in Nimiq Pay to connect your wallet and approve publication.</p>}

          <footer className="compose-dialog__footer">
            <button className="button button--quiet" type="button" onClick={onClose} disabled={submitting}>Cancel</button>
            <button className="button button--primary" type="submit" disabled={submitting || body.trim().length === 0}>
              {submitting ? <><span className="spinner" /> Waiting for wallet</> : connected ? <>Review & pay <ArrowRight size={18} /></> : <>Connect to continue <ArrowRight size={18} /></>}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
