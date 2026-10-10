import type { PlanningResult } from "@/lib/sekhem-agent"

/** Saved plan content only; presentation is never execution authority. */
export function ImplementationSummary({ planning }: { planning: PlanningResult }) {
  const steps = planning.plan.steps
  const risks = [...new Set(steps.map(step => step.risk).filter(Boolean))]
  return <div className="implementation-summary space-y-3 text-sm">
    <div><h5 className="text-xs font-medium text-muted-foreground">What SEKHEM understood</h5><p>{planning.understanding.objective}</p></div>
    <div><h5 className="text-xs font-medium text-muted-foreground">Files / scope</h5><ul className="space-y-1">{planning.understanding.scope?.map(scope => <li key={scope.id} className="break-words font-mono text-xs">{scope.reference}</li>)}</ul>{!planning.understanding.scope?.length && <p>Scope unavailable in this snapshot. Review saved details.</p>}</div>
    <div><h5 className="text-xs font-medium text-muted-foreground">What changes</h5><ul className="list-disc space-y-1 pl-4">{steps.filter(step => step.effect === "WRITE").map(step => <li key={step.id}>{step.objective || step.purpose}</li>)}</ul></div>
    <div><h5 className="text-xs font-medium text-muted-foreground">Expected result</h5>{steps.some(step => step.expectedResult) ? steps.filter(step => step.expectedResult).map(step => <p key={step.id}>{step.expectedResult}</p>) : planning.plan.successCriteria.map(item => <p key={item.id}>{item.description}</p>)}</div>
    <div><h5 className="text-xs font-medium text-muted-foreground">Verification method</h5>{steps.filter(step => step.type === "VERIFY").map(step => <p key={step.id}>{step.objective || step.purpose}</p>)}{!steps.some(step => step.type === "VERIFY") && <p>No verification step recorded. Review saved criteria.</p>}</div>
    <div><h5 className="text-xs font-medium text-muted-foreground">What is preserved</h5>{planning.understanding.constraints.length ? planning.understanding.constraints.map(item => <p key={item.id}>{item.description}</p>) : <p>No preservation constraints recorded.</p>}</div>
    {!!risks.length && <p className="text-xs text-muted-foreground">Recorded step risk: {risks.join(" · ")}</p>}
  </div>
}

export function ExactChangePreview({ changes }: { changes?: Array<{ path: string; before: string; after: string }> }) {
  return <div className="exact-change-preview space-y-3" aria-label="Exact change preview">
    {changes?.length ? changes.map(change => <div key={change.path} className="overflow-hidden rounded-lg border border-border/60">
      <h5 className="break-words bg-muted/30 px-3 py-2 font-mono text-xs">{change.path}</h5>
      <div className="grid gap-px bg-border/50 sm:grid-cols-2">
        <div className="min-w-0 bg-background p-3"><h6 className="mb-2 text-xs text-muted-foreground">Before</h6><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{change.before}</pre></div>
        <div className="min-w-0 bg-background p-3"><h6 className="mb-2 text-xs text-lime">After · proposed</h6><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{change.after}</pre></div>
      </div>
    </div>) : <p>Exact change preview unavailable in this snapshot.</p>}
    <p className="text-xs text-muted-foreground">Exact replacement excerpts from the saved proposal; not a full-file comparison.</p>
  </div>
}
