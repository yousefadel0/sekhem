"use client"
import { useState } from "react"
import type { RuntimeActionSnapshot } from "./trusted-runtime-control"
import { terminalCommand } from "@/lib/workspace-terminal"

/** Remove terminal control sequences; never interpret OSC links, HTML or cursor commands. */
export function terminalText(text: string) {
  return text.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
}
export function terminalState(snapshot: RuntimeActionSnapshot) {
  const e = snapshot.execution
  if (!e) return snapshot.proposal.state
  if (e.state === "SUCCEEDED") return e.verificationState === "VERIFIED" ? "VERIFIED" : "VERIFICATION INCOMPLETE"
  return e.state === "RUNNING" || e.state === "DISPATCHED" ? "EXECUTING" : e.state
}
export function TerminalAction({ snapshot, busy, error, refresh, approve, reject, cancel, onInspect, onAsk }: {
  snapshot: RuntimeActionSnapshot; busy: boolean; error: string; refresh: () => void
  approve: () => Promise<void>; reject: () => Promise<void>; cancel: () => Promise<void>; onInspect?: () => void; onAsk?: () => void
}) {
  const [review, setReview] = useState(false)
  const { proposal: p, execution: e } = snapshot, r = e?.result
  const state = terminalState(snapshot), output = r ?? e?.output
  return <article className="ide-action" aria-label="Governed terminal action" data-state={state}>
    <header><span>TERMINAL ACTION</span><time dateTime={p.createdAt}>{new Date(p.createdAt).toLocaleTimeString()}</time><strong role="status">{state.replaceAll("_", " ")}</strong></header>
    <pre className="ide-action-command">$ {terminalCommand(p)}</pre>
    <small className="ide-action-cwd">{String(p.validatedInput.cwd)} · one reviewed process</small>
    {error && <p role="alert">{error} <button type="button" onClick={refresh}>Refresh</button></p>}
    <div className="ide-action-controls"><button type="button" aria-expanded={review} onClick={() => setReview(value => !value)}>Review</button>{onInspect && <button type="button" onClick={onInspect}>Inspect · Agent Run</button>}
      {p.state === "AWAITING_APPROVAL" && <><button type="button" className="ide-approve" disabled={busy || !!error} onClick={() => void approve()}>Approve</button><button type="button" disabled={busy || !!error} onClick={() => void reject()}>Reject</button></>}
      {(p.state === "AWAITING_APPROVAL" || p.state === "APPROVED" || state === "EXECUTING") && <button type="button" disabled={busy || !!error || e?.cancellationState === "REQUESTED"} onClick={() => void cancel()}>Cancel</button>}
    </div>
    {p.state === "AWAITING_APPROVAL" && <p className="ide-approval-boundary">Approval required. Review and Enter do not authorize execution.</p>}
    {review && <div className="ide-action-review"><pre>{JSON.stringify(p.validatedInput, null, 2)}</pre><p>{p.preview.description}</p><p>Proposal {p.proposalId} · {p.proposalDigest}</p><p>Approval fingerprint {p.approvalFingerprint ?? "Not available"}</p><p>Grant v{p.grantVersion} · Created {p.createdAt}</p></div>}
    {output && <div className="ide-action-output"><pre aria-label="stdout">{terminalText(output.stdout) || "(stdout empty)"}</pre>{output.stderr && <pre aria-label="stderr" className="ide-stderr">{terminalText(output.stderr)}</pre>}{!r && <small>Partial output · not a verified result</small>}</div>}
    {r && <p className="ide-action-result">Exit {r.exitCode ?? "unknown"} · {r.durationMs} ms · {e?.verificationState}{r.truncated ? " · Output truncated" : ""}<time dateTime={r.finishedAt}> · {new Date(r.finishedAt).toLocaleTimeString()}</time></p>}
    {(e?.error || r?.error) && <p role="alert" className="ide-stderr">{e?.error || r?.error}</p>}
    {e?.state === "OUTCOME_UNKNOWN" && <p role="alert">Outcome uncertain. No automatic retry. Inspect before proposing another action.</p>}
    {e && <details className="ide-action-evidence"><summary>Receipt / permit / verification</summary><p>Receipt {e.attribution.executionId}</p><p>Permit digest {e.attribution.permitDigest} · Consumed {e.consumedAt ?? "not recorded"}</p><p>Runtime {e.attribution.runtimeId}</p><pre>{JSON.stringify(r?.verificationResult ?? { state: e.verificationState }, null, 2)}</pre></details>}
    {onAsk && <button type="button" onClick={onAsk}>Ask SEKHEM</button>}
  </article>
}
