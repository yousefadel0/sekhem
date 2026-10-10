"use client"
import { WorkflowPauseControls } from "./workflow-pause-controls"
import { useState } from "react"
import { recoverExecutionVerification } from "@/lib/sekhem-conversation"
import { capabilityLabel, capabilityDescription } from "@/lib/workspace-presentation"
import { runActivity, type AgentRunSummary, type AgentRunDetail, type EvidenceReceipt, type WorkspaceBinding, type PlanningResult } from "@/lib/sekhem-agent"
import { evidenceSummary, runTone } from "@/lib/workspace-presentation"
import { ArrowUpRight } from "lucide-react"
import { ExactProposalApprovalCard } from "./exact-proposal-approval-card"
import { PlanExecutionApproval } from "./plan-execution-approval"
import { WorkflowActivityIndicator } from "./thinking-indicator"
import { ImplementationSummary, ExactChangePreview } from "./implementation-summary"
import { WorkflowContinuationNotice } from "./workflow-continuation-notice"
import { editorReference } from "@/lib/editor-document"
export const EXECUTION_UNAVAILABLE = "SEKHEM can inspect and plan this task, but local execution is not connected."

export function RuntimeEvidenceProvenance({ reference }: { reference: import("@/lib/sekhem-agent").RuntimeEvidenceReference }) {
  return <dl className="space-y-1 break-all text-xs" aria-label="Runtime evidence provenance">
    <dt>Workspace</dt><dd>{reference.workspaceId} · Binding v{reference.bindingVersion}</dd>
    <dt>Runtime</dt><dd>{reference.runtimeId}</dd><dt>Fingerprint</dt><dd>{reference.runtimeFingerprint}</dd>
    <dt>File</dt><dd>{reference.relativePath}</dd><dt>Receipt · {reference.verificationState}</dt><dd>{reference.receiptId}</dd>
    <dt>Observed</dt><dd>{reference.observationTime}</dd><dt>Operation</dt><dd>{reference.operationId}</dd>
    <dt>Content identity</dt><dd>Unavailable · UTF-8 decoded text; original bytes were not inspected.{reference.truncated && " Truncated."}</dd>
  </dl>
}

export function EvidenceList({ evidence, binding, onOpen, inspection }: { evidence: EvidenceReceipt[]; binding?: WorkspaceBinding | null; onOpen: (binding: WorkspaceBinding, path: string) => void; inspection?: import("@/lib/sekhem-agent").AgentInspection | null }) {
  return <div className="response-evidence-list space-y-3 text-xs">
    <p>{evidence.filter(item => item.read).length} sources read · {evidence.filter(item => item.selected).length} selected for context</p>
    {evidence.length === 0 && <p className="text-muted-foreground">No evidence receipt is available yet.</p>}
    {evidence.map(item => <div key={item.id} className="rounded border border-border/50 p-2 space-y-1">
      {binding && item.sourceType === "workspace" && item.relativePath ?
        <button type="button" className="break-all text-left text-lime underline" onClick={() => onOpen(binding, editorReference(item.label)?.path === item.relativePath ? item.label : item.relativePath!)}>{item.label}</button> : <p className="break-all">{item.label}</p>}
      <p>{evidenceSummary(item, !!item.runtimeReference && (!inspection || !inspection.operations.some(op => op.request.operationId === item.runtimeReference!.operationId)))}</p>
      <p className="text-muted-foreground">{item.read ? "Read" : "Not read"} · {item.selected ? "Selected for context" : "Not selected"}</p>
      <p className="text-muted-foreground">{item.selectionReason}</p>
      <details><summary>View evidence details</summary><p>{item.sourceType} · {item.outcome} · {item.id}</p>
        {item.runtimeReference && <><p>Historical observation saved with this run; current access is checked before reuse.</p><RuntimeEvidenceProvenance reference={item.runtimeReference} /></>}
      </details>
    </div>)}
    {evidence.length > 0 && <p className="text-muted-foreground">Context selection does not establish which source influenced the model’s answer.</p>}
  </div>
}

export function PlanningView({ planning, runtimeAction = false, engineeringPlan, execution }: { planning?: PlanningResult | null; runtimeAction?: boolean; engineeringPlan?: import("@/lib/sekhem-agent").EngineeringPlanIdentity; execution?: AgentRunSummary["execution"] }) {
  if (!planning) return <p className="text-xs text-muted-foreground">No persisted understanding or plan is available yet.</p>
  const { understanding, plan } = planning
  return <div className="space-y-5 text-sm" aria-label="Understanding and plan">
    {engineeringPlan && <PersistedPlanIdentity plan={engineeringPlan} status={plan.readiness} />}
    <section className="space-y-2"><h3 className="font-semibold">Understanding</h3>
      <p>{understanding.objective}</p><p className="text-xs text-cyan">{understanding.readiness}</p>
      <h4 className="font-medium">Scope</h4><ul className="list-disc pl-4">{understanding.scope.map(scope => <li className="break-all" key={scope.id}>{scope.reference}</li>)}</ul>
      <h4 className="font-medium">Constraints</h4>{understanding.constraints.map(item => <p className="text-xs" key={item.id}>{item.description}</p>)}
      <h4 className="font-medium">Unknowns</h4>{understanding.unknowns.length === 0 ? <p className="text-xs">None recorded</p> : understanding.unknowns.map(item => <p className="text-xs text-amber" key={item.id}>{item.description}</p>)}
    </section>
    <section className="space-y-2"><h3 className="font-semibold">Evidence-grounded findings</h3>
      {understanding.facts?.length ? understanding.facts.map(fact => <div className="planning-finding" key={fact.id}><p>{fact.text}</p><span className="panel-caption">Source excerpt · {fact.evidenceRef}</span></div>) : <p className="text-xs text-muted-foreground">No verified source excerpts recorded.</p>}
      {understanding.inferences?.map(item => <div className="planning-finding" key={item.id}><p>{item.text}</p><span className="panel-caption">Model interpretation · {item.uncertainty}</span></div>)}
      {understanding.hypotheses?.map(item => <div className="planning-finding" key={item.id}><p>{item.text}</p><span className="panel-caption">Hypothesis · {item.uncertainty}</span></div>)}
    </section>
    <section className="space-y-2"><h3 className="font-semibold">Proposed plan</h3><p className="text-xs text-cyan">{plan.readiness} · Authorization: {plan.authorization}</p>
      <ol className="plan-steps list-decimal pl-5 space-y-2">{plan.steps.map(step => <li key={step.id}><p>{capabilityDescription(step.objective || step.purpose)}</p><details><summary>Step details</summary><p className="text-xs text-muted-foreground">{step.type} · {step.status} · {step.effect}</p><p className="text-xs text-muted-foreground">Dependencies: {step.dependencies ? step.dependencies.length ? step.dependencies.join(", ") : "None recorded" : "Not available in this record"}</p></details>{step.expectedResult && <p className="text-xs">Expected result: {step.expectedResult}</p>}</li>)}</ol>
      {plan.steps.length === 0 && <p className="text-xs">No validated steps available.</p>}
      <h4 className="font-medium">Missing information</h4>{plan.missingInformation.length === 0 ? <p className="text-xs">None recorded</p> : plan.missingInformation.map(item => <p className="text-xs text-amber" key={item.id}>{item.description}</p>)}
      <h4 className="font-medium">Stop conditions</h4>{plan.stopConditions.map((item, index) => <p className="text-xs" key={index}>{item}</p>)}
      <h4 className="font-medium">Success criteria</h4>{plan.successCriteria.map(item => <p className="text-xs" key={item.id}>{item.description}</p>)}
      {!plan.validation.valid && <p className="text-xs text-amber">Plan validation: {plan.validation.issues.map(issue => issue.code).join(", ")}</p>}
    </section>
    <p className="rounded border border-amber/30 p-3 text-xs text-amber">{execution ? "Execution progress, completed actions and verification are shown in the execution details." : engineeringPlan ? "Engineering intent only. No execution is authorized or performed." : runtimeAction ? "This is the proposed action plan. Current authorization, actual execution and verification are recorded in the runtime receipt." : <>Execution unavailable. {EXECUTION_UNAVAILABLE} No proposed step has been executed.</>}</p>
  </div>
}

function PersistedPlanIdentity({ plan, status }: { plan: import("@/lib/sekhem-agent").EngineeringPlanIdentity; status: string }) {
  return <details className="space-y-2 break-all text-xs" aria-label="Persisted plan details"><summary>Plan details</summary>
    <dl className="space-y-1"><dt>Version / status</dt><dd>{plan.planVersion} · {status}</dd><dt>Plan ID</dt><dd>{plan.planId}</dd><dt>Digest</dt><dd>{plan.digest}</dd>
      <dt>Source understanding</dt><dd>{plan.sourceRunId} · checkpoint {plan.understandingSequence}</dd>
      <dt>Workspace binding</dt><dd>{plan.workspace.workspaceId} · version {plan.workspace.bindingVersion}</dd>
      <dt>Verified observations</dt><dd>{plan.evidenceReferences.length}</dd></dl>
  </details>
}

export function CompactPlanCard({ planning, identity, onProceed, onReview, onAsk, disabled = false }: { planning: PlanningResult; identity: import("@/lib/sekhem-agent").EngineeringPlanIdentity; onProceed?: () => void; onReview?: () => void; onAsk?: () => void; disabled?: boolean }) {
  const ready = planning.plan.readiness === "PLAN_READY" && planning.plan.validation.valid
  return <section className="response-plan-card rounded-xl border border-border/60 bg-muted/10 p-4 space-y-4 text-sm" aria-label="Modification plan">
    <h4 className="font-semibold">Plan · {ready ? "Ready" : "Needs information"}</h4>
    <ImplementationSummary planning={planning} />
    <PersistedPlanIdentity plan={identity} status={planning.plan.readiness} />
    <div className="flex flex-wrap items-center gap-3">{ready && onProceed && <button className="rounded-md bg-lime px-4 py-2 font-medium text-black disabled:opacity-50" type="button" disabled={disabled} onClick={onProceed}>Proceed</button>}
      {onReview && <button type="button" onClick={onReview}>Review</button>}{onAsk && <button type="button" onClick={onAsk}>Ask a question</button>}</div>
    <p className="text-xs text-muted-foreground">Proceed prepares the exact proposal only. Approval and execution are separate.</p>
  </section>
}

export function CompactProposalCard({ proposal, onReview, onAsk, planning, approvalControls, approvalPending = false }: { onReview?: () => void; onAsk?: () => void; planning?: PlanningResult | null; approvalControls?: React.ReactNode; approvalPending?: boolean; proposal: NonNullable<AgentRunSummary["workflow"]>["proposal"] }) {
  return <section className="response-proposal-card rounded-xl border border-border/60 bg-muted/10 p-4 space-y-4 text-sm" aria-label="Exact modification proposal">
    <h4 className="font-semibold">Exact proposal · {proposal.state === "READY" ? "Ready for review" : "Stale · Revalidation required"}</h4>
    {planning && <details><summary>Plan / expected result</summary><ImplementationSummary planning={planning} /></details>}
    <details><summary>Review exact changes · {proposal.changes?.length ?? 0} change(s)</summary><ExactChangePreview changes={proposal.changes} /></details>
    {!!proposal.verification?.length && <div><h5 className="text-xs font-medium text-muted-foreground">Proposal verification</h5>{proposal.verification.map((item, index) => <p key={index}>{item}</p>)}</div>}
    <p>Preservation: replacement is limited to the persisted exact change; unrelated content must remain unchanged.</p>
    <details className="break-all text-xs"><summary>Proposal identity · Version {proposal.version}</summary><p>{proposal.id}</p><p>{proposal.digest}</p></details>
    {approvalControls && <details open={approvalPending || undefined}><summary className="w-fit cursor-pointer rounded-md bg-lime px-4 py-2 font-medium text-black">{proposal.state === "READY" ? "Proceed" : "Review approval requirements"}</summary><p className="my-2 text-xs text-muted-foreground">Proceed only opens approval review. No approval or execution is submitted.</p>{approvalControls}</details>}
    <div className="flex flex-wrap gap-3">{onReview && <button type="button" onClick={onReview}>Review</button>}{onAsk && <button type="button" onClick={onAsk}>Ask a question</button>}</div>
    <p className="text-xs">Next: request human approval separately. Proposal readiness does not approve, issue a permit, or execute.</p>
  </section>
}

export function AgentRunCard({ run, detail, activity, onSelect, onAsk, onProceed, proceedDisabled = false, conversationId, onChanged, stale = false, approvalMode = "MANUAL" }: { approvalMode?: "MANUAL" | "TASK"; run: AgentRunSummary; detail?: AgentRunDetail; activity?: string; onSelect: () => void; onAsk?: () => void; onProceed?: (planId: string) => void; proceedDisabled?: boolean; conversationId?: string; onChanged?: () => Promise<void>; stale?: boolean }) {
  // Cached detail may fill in the current snapshot, but cannot replace its identity or status.
  if (detail && (detail.id !== run.id || detail.planVersion !== run.planVersion)) detail = undefined
  if (detail) detail = { ...detail, status: run.status, outcome: run.outcome }
  const presentation = detail?.presentation
  const savedWorkflow = detail?.workflow ?? run.workflow
  // A reused run may retain a previous proposal. It is not this plan's review.
  const workflow = savedWorkflow && (!presentation?.engineeringPlan || savedWorkflow.proposal.planId === presentation.engineeringPlan.planId) ? savedWorkflow : undefined
  const inspection = detail?.inspection ?? run.inspection
  const execution = detail?.execution ?? run.execution
  const verifiedRuntimeAction = run.id.startsWith("rtrun_") && runActivity({ ...run, runtimeActionReceipt: detail?.id === run.id && detail.planVersion === run.planVersion ? detail.runtimeActionReceipt ?? run.runtimeActionReceipt : run.runtimeActionReceipt }) === "Action verified"
  const readSources = presentation?.evidence.filter(item => item.read && item.operation === "filesystem.read") ?? []
  const workspaceOperationTitle = run.id.startsWith("rtrun_") && /^Workspace (verify|list|read|search) · /.test(run.title)
    ? /^Workspace read /.test(run.title) ? "Reading a workspace file" : /^Workspace search /.test(run.title) ? "Searching project evidence" : "Reviewing project structure"
    : null
  if (verifiedRuntimeAction && readSources.length && !inspection && !execution && !workflow) return <article className="chat-run-card text-xs" aria-label="Agent activity">
    {readSources.map(item => <p key={item.id}>✓ {item.label} · Verified source read{item.truncated ? " · truncated" : ""}</p>)}
    <details><summary>Activity details</summary><p>{readSources.length} sources read · Saved receipt verified</p><button type="button" onClick={onSelect}>View receipts and workspace binding</button></details>
  </article>
  return <article className="response-agent-card space-y-2 text-xs text-muted-foreground" aria-label="Agent activity" dir="auto">
    {verifiedRuntimeAction ? <span role="status">Action verified{stale ? " · Saved state" : ""}</span> : inspection || execution || workflow || presentation?.engineeringPlan || !run.id.startsWith("rtrun_") ? <WorkflowActivityIndicator run={{ ...run, ...detail, workflow }} stale={stale} conversational /> : <span role="status" className={`run-status tone-${runTone(run)}`}>{runActivity({ ...run, runtimeActionReceipt: detail?.id === run.id && detail.planVersion === run.planVersion ? detail.runtimeActionReceipt ?? run.runtimeActionReceipt : run.runtimeActionReceipt }, activity, presentation?.planning)}</span>}
    <p>{inspection ? inspection.state === "FAILED" ? inspection.operations.some(op => op.verification === "VERIFIED") || inspection.evidence.length > 0 ? "Verified observations are saved, but the analysis could not be completed. See Details." : "Project analysis could not start. See Details." : "Reviewing the project to answer your request." : workspaceOperationTitle || presentation?.planning?.understanding.objective || run.title}</p>
    {(run.status === "FAILED" || ["NEEDS_USER_INPUT", "NEEDS_EVIDENCE"].includes(run.outcome ?? "")) && <p className="text-xs text-amber">{runActivity(run)}</p>}
    {detail?.workflowDecision && <p role="status">{detail.workflowDecision.decision === "SKIP" ? "Skipped · required step; workflow stopped" : "Rejected · no execution authorized"}</p>}
    {execution?.recovery && <ExecutionRecoveryNotice execution={execution} conversationId={conversationId} stale={stale} onReview={onSelect} onChanged={onChanged} />}
    {!execution && <WorkflowContinuationNotice run={{ ...run, ...detail, workflow, execution }} stale={stale} />}
    {workflow?.proposal ? <CompactProposalCard key={workflow.proposal.id} approvalPending={!execution && workflow.approval?.state === "PENDING"} proposal={workflow.proposal} planning={presentation?.planning} onReview={onSelect} onAsk={onAsk} approvalControls={conversationId ? <ExactProposalApprovalCard key={`${conversationId}:${workflow.proposal.id}`} conversationId={conversationId} workflow={workflow} stale={stale || !!detail?.workflowDecision} onChanged={onChanged} /> : undefined} /> : presentation?.engineeringPlan && presentation.planning ? <CompactPlanCard onReview={onSelect} onAsk={onAsk} planning={presentation.planning} identity={presentation.engineeringPlan} disabled={stale || proceedDisabled} onProceed={onProceed ? () => onProceed(presentation.engineeringPlan!.planId) : undefined} /> : null}
    {presentation?.engineeringPlan && !presentation.planning && <PersistedPlanIdentity plan={presentation.engineeringPlan} status="PLAN_READY" />}
    {!execution && conversationId && presentation?.engineeringPlan && presentation.planning?.plan.readiness === "PLAN_READY" && presentation.planning.plan.validation.valid &&
      <PlanExecutionApproval key={`${conversationId}:${presentation.engineeringPlan.planId}`} conversationId={conversationId}
        plan={presentation.engineeringPlan} approvalMode={approvalMode} disabled={detail?.workflowPause?.state !== undefined && detail.workflowPause.state !== "RUNNING" || !!detail?.workflowDecision || stale || proceedDisabled || !!workflow?.approval && ["DENIED", "CANCELLED", "STALE", "INVALID"].includes(workflow.approval.state) || !!workflow && workflow.proposal.state !== "READY"} onChanged={onChanged}
        delegationEligible={presentation.planning.plan.constraints?.some(c => c.rule === "HERO_TITLE_TEXT_ONLY") === true &&
          presentation.planning.plan.steps.filter(s => s.effect === "WRITE").length === 1 &&
          presentation.planning.plan.steps.every(s => s.type === "PROPOSE" && s.effect === "READ_ONLY" || s.type === "IMPLEMENT" && s.effect === "WRITE" || ["INSPECT", "VERIFY"].includes(s.type) && s.effect === "READ_ONLY")} />}
    {inspection ? <p>Sources · {inspection.operations.filter(op => op.action.tool === "filesystem.read" && op.verification === "VERIFIED").length}</p> : readSources.length > 0 ? <p>Sources · {readSources.length}</p> : null}
    {!!detail?.pendingApprovals.length && <p className="text-amber">Approval required · Review the pending action before continuing.</p>}
    {inspection?.state === "AWAITING_INPUT" && <p>Waiting for your clarification.</p>}
    <WorkflowPauseControls key={run.id} run={{ ...run, ...detail }} stale={stale} onChanged={onChanged} />
    <details className="text-xs" data-chat-details><summary className="cursor-pointer text-muted-foreground">Details</summary>
    {inspection && <p>{inspection.operations.filter(op => op.action.tool === "filesystem.read" && op.verification === "VERIFIED").length} Runtime source reads verified</p>}
    {workspaceOperationTitle && <p className="break-all">{run.title}</p>}
    {inspection && <p>{presentation?.planning?.understanding.objective || run.title}</p>}
    {execution && <WorkflowContinuationNotice run={{ ...run, ...detail, workflow, execution }} stale={stale} />}
    {inspection && inspection.operations.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Inspection details · {inspection.operations.length} operations</summary><ul className="space-y-1 text-xs" aria-label="Observed Agent progress">{inspection.operations.map(op => <li key={op.request.operationId} className="break-words"><details><summary>Operation details</summary>{op.action.tool}</details>
      {capabilityLabel(op.action.tool)} · {op.action.relativePath || "Workspace root"} · {op.verification === "VERIFIED" ? op.state === "TRUNCATED" ? "Verified · truncated observation" : "Observation verified" : op.state === "AWAITING_APPROVAL" ? "Awaiting approval" : op.state.toLowerCase().replaceAll("_", " ")}
    </li>)}</ul></details>}
    {!!execution?.receipts?.length && <ul className="space-y-1 text-xs" aria-label="Verified workflow steps">{execution.receipts.map(receipt => <li key={receipt.id}>{receipt.read ? "Read-back" : "Approved change"} · {receipt.label} · {receipt.runtimeReference?.verificationState === "VERIFIED" ? "Verified" : "Verification unavailable"}</li>)}</ul>}
    {inspection?.understanding && <p className="text-xs text-muted-foreground">{inspection.understanding.status === "INTERMEDIATE" ? run.status === "PAUSED" || inspection.state === "AWAITING_INPUT" ? "Findings saved; waiting for your clarification. Understanding is incomplete." : "Intermediate findings saved; understanding is not yet certified." : inspection.understanding.status === "PARTIAL" ? "Findings saved with remaining gaps. Understanding is incomplete." : "Understanding saved for the inspected scope."}</p>}
    {detail?.pendingApprovals.length ? <p className="text-xs text-amber">{detail.pendingApprovals.length} approval request(s) awaiting review. {execution || inspection || workflow || presentation?.engineeringPlan || run.id.startsWith("rtrun_") ? "Execution requires approval and revalidation." : "Execution remains unavailable."}</p> : null}
    <p className="text-xs text-muted-foreground">{execution ? `Plan execution · ${execution.completedSteps} of ${execution.totalSteps} steps verified. Results appear in this conversation.` : inspection ? `Workspace inspection · ${inspection.executionVerified} observations verified. Results appear in this conversation.` : run.id.startsWith("rtrun_") ? "Workspace operation · Open details for verified results" : "Planning only · Approval and execution are separate"}</p>
    <button type="button" className="flex items-center gap-2" onClick={onSelect}>View details<ArrowUpRight size={12} /></button>
    </details>
  </article>
}

export function ExecutionRecoveryNotice({ execution, conversationId, stale = false, onReview, onChanged }: {
  execution: NonNullable<AgentRunSummary["execution"]>; conversationId?: string; stale?: boolean; onReview: () => void; onChanged?: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const recover = async () => {
    if (!conversationId || stale || busy || execution.recovery !== "VERIFICATION_ONLY") return
    setBusy(true); setError(null)
    try { await recoverExecutionVerification(conversationId, execution.runId, `verification-${crypto.randomUUID()}`); await onChanged?.() }
    catch { setError("Verification recovery could not be authorized. Review saved details; the write was not repeated.") }
    finally { setBusy(false) }
  }
  return <section className="space-y-2 text-xs" aria-label="Execution recovery">
    <p>{execution.recovery === "VERIFICATION_ONLY" ? "The write receipt is saved. Only read-back remains; the write will not be repeated." :
      execution.recovery === "PREPARATION_REVIEW" ? "Preparation was interrupted. The saved reservation needs review; work will not restart automatically." :
        "The outcome is unknown. Review authoritative receipts before continuing; no write will be retried automatically."}</p>
    {execution.recovery === "VERIFICATION_ONLY" && conversationId && <button type="button" disabled={stale || busy} onClick={() => void recover()}>Recover verification only</button>}
    <button type="button" onClick={onReview}>Review saved execution</button>
    {error && <p role="alert">{error}</p>}
  </section>
}
