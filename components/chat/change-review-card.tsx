import React from "react";
import type { ChangeSet, ChangeReviewState, ChangeDecision } from "@/lib/change-review";

export function ChangeReviewCard({ changeSet, state, busy = false, error, onDecision }: { changeSet: ChangeSet; state?: ChangeReviewState; busy?: boolean; error?: string; onDecision?: (id: string, decision: ChangeDecision) => void }) {
  return <section aria-label="Change Review" className="my-4 rounded-lg border border-border bg-surface-2/40 p-4 space-y-4">
    <header><h3 className="font-semibold text-sm">Change Review</h3>
      <p className="text-xs text-muted-foreground mt-1">Proposed changes only · Plan {changeSet.plan.version} · Workspace binding {changeSet.workspace.bindingVersion}</p>
      <p className="text-xs text-muted-foreground mt-1">Review does not approve or execute changes. Existing approval and execution controls still apply.</p>
    </header>
    <p className="text-xs text-muted-foreground">Keep includes a change in the next proposal. Reject excludes it; it never reverses or executes anything.</p>
    {state?.locked && <p className="text-xs">Review is locked to its saved proposal. A new review is required to change this selection.</p>}
    {!state?.available && !state?.locked && <p className="text-xs text-muted-foreground">{state?.reason || "Restore current review state to make decisions."}</p>}
    {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    {changeSet.changes.length === 0 && <p className="text-sm text-muted-foreground">No changes. Unchanged content is omitted.</p>}
    {(["ADDED", "MODIFIED", "REMOVED"] as const).map(type => {
      const changes = changeSet.changes.filter(c => c.type === type);
      if (!changes.length) return null;
      return <section key={type} aria-label={type === "ADDED" ? "Added" : type === "MODIFIED" ? "Modified" : "Removed"}>
        <h4 className="text-xs font-semibold uppercase tracking-wider mb-2">{type === "ADDED" ? "Added" : type === "MODIFIED" ? "Modified" : "Removed"} ({changes.length})</h4>
        {changes.map(change => <article key={change.id} className="border-l-2 border-lime/40 pl-3 py-2 space-y-2">
          <p className="font-mono text-xs break-all">{change.path} · {change.scope} · {state?.decisions?.[change.id] === "KEEP" ? "kept" : state?.decisions?.[change.id] === "REJECT" ? "rejected" : "pending"}</p>
          <dl className="text-sm space-y-1">{([['Why', change.reason], ['What', change.what], ['How', change.how]]).map(([label, text]) =>
            <div key={label}><dt className="inline font-semibold">{label}: </dt><dd className="inline break-words">{text}</dd></div>)}</dl>
          <div className="grid gap-2 sm:grid-cols-2 text-xs"><div><p className="text-muted-foreground">Before</p><pre className="whitespace-pre-wrap break-words rounded bg-surface-2 p-2">{change.before || "(no content)"}</pre></div>
            <div><p className="text-muted-foreground">Proposed after</p><pre className="whitespace-pre-wrap break-words rounded bg-surface-2 p-2">{change.after || "(removed)"}</pre></div></div>
          <div className="flex gap-2">
            <button type="button" className="technical-button" disabled={!state?.available || state.locked || busy || !onDecision} aria-pressed={state?.decisions?.[change.id] === "KEEP"} onClick={() => onDecision?.(change.id, "KEEP")}>Keep</button>
            <button type="button" className="technical-button" disabled={!state?.available || state.locked || busy || !onDecision} aria-pressed={state?.decisions?.[change.id] === "REJECT"} onClick={() => onDecision?.(change.id, "REJECT")}>Reject</button>
          </div>
        </article>)}
      </section>;
    })}
    <details className="text-xs text-muted-foreground"><summary>Source and review provenance</summary>
      <p className="mt-2 break-all">Review: {changeSet.id} · Source checkpoint {changeSet.source.sequence}/{changeSet.source.version} · {changeSet.source.runId}</p>
      <p className="break-all">Accepted recommendation: {changeSet.recommendation.id} · Plan: {changeSet.plan.id}</p>
      <p>Saved review snapshot. Current authorization and workspace binding must be revalidated before any execution.</p>
    </details>
  </section>;
}
