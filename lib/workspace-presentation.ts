import { runActivity, runIsActive, inspectionLabel, type AgentRunDetail, type AgentActivity, type EvidenceReceipt } from "./sekhem-agent"

export type StageState = "recorded" | "active" | "pending" | "attention" | "settled"
export interface RunStage { label: string; state: StageState; detail: string }

/** Display only milestones supported by the saved run. Progress never grants execution. */
export function runTimeline(run: AgentRunDetail, events: AgentActivity[] = run.activity ?? []): RunStage[] {
  if (run.inspection) {
    const s = run.inspection, stopped = ["PARTIAL", "FAILED", "CANCELLED"].includes(s.state)
    const inspecting = ["INSPECTION_PLANNED", "ACTION_PROPOSED", "AUTHORIZATION_PENDING", "AWAITING_APPROVAL", "APPROVED", "REVALIDATING", "EXECUTING", "OBSERVING", "VERIFYING"].includes(s.state)
    return [
      { label: "Understanding", state: s.state === "UNDERSTANDING" ? "active" : s.iterations > 0 ? "recorded" : "pending", detail: inspectionLabel(s.state) },
      { label: "Inspection", state: stopped ? "attention" : inspecting && s.current ? "active" : s.executionVerified ? "recorded" : "pending", detail: s.state === "AWAITING_INPUT" ? "Waiting for your instruction" : `${s.iterations}/${s.maxIterations} operations proposed` },
      { label: "Verification", state: s.state === "VERIFYING" ? "active" : s.executionVerified ? "recorded" : "pending", detail: `${s.executionVerified} runtime observations verified` },
      { label: "Result", state: stopped ? "attention" : s.objectiveGrounded ? "settled" : "pending", detail: s.objectiveGrounded ? "Grounded report saved" : runActivity(run) },
    ]
  }
  const has = (...types: string[]) => events.some(event => types.includes(event.eventType))
  const planning = run.presentation?.planning
  const settled = !runIsActive(run.status)
  const failed = run.status === "FAILED" || ["PROVIDER_FAILED", "OUTPUT_TRUNCATED", "INVALID_STRUCTURED_OUTPUT", "BLOCKED", "FAILED"].includes(run.outcome ?? "")
  return [
    { label: "Understanding", state: planning ? planning.understanding.readiness === "UNDERSTANDING_READY" ? "recorded" : "attention" : has("UNDERSTANDING_COMPLETED") ? "recorded" : !settled && has("UNDERSTANDING_STARTED") ? "active" : "pending", detail: planning?.understanding.readiness ?? (has("UNDERSTANDING_STARTED") ? "Request received" : "Not recorded") },
    { label: "Inspection", state: run.presentation?.evidence.length || has("EVIDENCE_COLLECTED") ? "recorded" : !settled && has("CONTEXT_RESOLVED", "EVIDENCE_REQUESTED") ? "active" : "pending", detail: `${run.presentation?.evidence.filter(item => item.read).length ?? 0} sources read` },
    { label: "Planning", state: planning ? planning.plan.validation.valid && planning.plan.readiness === "PLAN_READY" ? "recorded" : "attention" : !settled && (run.status === "PLANNING" || has("PLAN_CREATED")) ? "active" : "pending", detail: planning?.plan.readiness ?? "No saved plan" },
    { label: "Result", state: failed ? "attention" : settled ? "settled" : "pending", detail: settled ? runActivity(run, undefined, planning) : "Awaiting result" },
  ]
}

export function runTone(run: Pick<AgentRunDetail, "status" | "outcome">): "error" | "warning" | "success" | "neutral" {
  if (run.status === "FAILED" || ["PROVIDER_FAILED", "OUTPUT_TRUNCATED", "INVALID_STRUCTURED_OUTPUT", "BLOCKED", "FAILED"].includes(run.outcome ?? "")) return "error"
  if (["PAUSED", "AWAITING_APPROVAL", "CANCELLED"].includes(run.status) || ["NEEDS_EVIDENCE", "NEEDS_USER_INPUT"].includes(run.outcome ?? "")) return "warning"
  if (run.outcome === "PLAN_READY" && run.status === "COMPLETED") return "success"
  return "neutral"
}

export const activityLabel = (type: string, payload?: unknown) => type === "INSPECTION_STATE_CHANGED" && payload && typeof payload === "object" && "state" in payload ? inspectionLabel(String(payload.state)) : ({
  EXACT_PROPOSAL_READY: "Exact proposal saved", EXACT_PROPOSAL_APPROVAL_REQUESTED: "Exact proposal awaiting approval",
  EXACT_PROPOSAL_APPROVED: "Exact proposal approved · Execution remains separate", EXACT_PROPOSAL_DENIED: "Exact proposal denied",
  EXACT_PROPOSAL_CANCELLED: "Exact proposal approval cancelled", EXACT_EXECUTION_PERMIT_CREATED: "One-use permit saved · No execution yet",
    UNDERSTANDING_STARTED: "Understanding request", UNDERSTANDING_COMPLETED: "Understanding recorded", UNDERSTANDING_CHECKPOINT: "Understanding checkpoint saved · See certification state",
  CONTEXT_RESOLVED: "Context resolved", EVIDENCE_REQUESTED: "Evidence requested", EVIDENCE_COLLECTED: "Evidence recorded",
  PLAN_CREATED: "Plan proposed", PLAN_VALIDATED: "Plan validation recorded", STATUS_CHANGE: "Run status updated",
  ERROR: "Run error recorded", CAPABILITY_SELECTED: "Capability selected", VERIFICATION_REQUIRED: "Verification required",
  AWAITING_INPUT: "Waiting for your instruction", AWAITING_APPROVAL: "Waiting for your approval",
  ACTION_PROPOSED: "Proposed action ready for review", AUTHORIZATION_REQUIRED: "Checking action permissions",
  PLAN_READY: "Validated plan saved", PLAN_EXECUTION_REQUESTED: "Preparing the exact plan for execution",
  EXECUTION_DISPATCHED: "Action sent to Runtime", EXECUTION_STARTED: "Runtime action started",
  EXECUTION_COMPLETED: "Runtime result received", EXECUTION_BLOCKED: "Execution blocked",
  EXECUTION_VERIFIED: "Runtime result verified", CONTROL_ARTIFACT: "Action record saved",
  APPROVAL_REQUESTED: "Waiting for your approval", VERIFICATION_STARTED: "Verifying the result",
  VERIFICATION_SUCCEEDED: "Result verification succeeded", VERIFICATION_FAILED: "Result verification failed",
  EXECUTION_SUCCEEDED: "Runtime action succeeded; see its verification record", EXECUTION_FAILED: "Runtime action failed",
  EXECUTION_CANCELLED: "Runtime action cancelled", EXECUTION_TIMED_OUT: "Runtime action timed out",
  EXECUTION_OUTCOME_UNKNOWN: "Runtime outcome uncertain — review required", EXECUTION_OUTPUT: "Runtime output received",
}[type] ?? "Activity recorded — view details")

export function evidenceSummary(item: EvidenceReceipt, isHistorical = false) {
  const verified = item.runtimeReference?.verificationState === "VERIFIED"
  if (isHistorical && verified) {
    if (item.operation === "filesystem.read" && item.read) return `Reused verified evidence · No runtime read occurred in this run${item.truncated ? " (partial)" : ""}`
    return `Reused verified evidence · Historical observation${item.truncated ? " (partial)" : ""}`
  }
  if (verified && item.operation === "filesystem.list") return "Workspace · Verified directory observation; source contents not read"
  if (verified && item.operation === "filesystem.search") return "Workspace · Verified search observation; matching excerpts only"
  if (verified && item.operation === "filesystem.read" && item.read) return `Source · Verified Runtime read${item.truncated ? " (partial)" : ""}`
  if (verified) return "Verified Runtime observation · See details for inspected scope"
  if (item.read) return `Source · Content read${item.truncated ? " (partial)" : ""}; no verified Runtime receipt attached`
  return ({ DENIED: "Source · Access denied", FAILED: "Source · Reading failed", UNSUPPORTED: "Source · Unsupported content", SCANNED: "Source · Scanned document; text unavailable", IMAGE_UNAVAILABLE: "Source · Image content unavailable" }[item.outcome] ?? "Workspace · Discovered or selected; source contents not read")
}

export function runtimeActionLabel(state?: string, verification?: string) {
  if (state === "SUCCEEDED") return verification === "VERIFIED" ? "Action result verified" : "Action finished; verification incomplete"
  return ({ AWAITING_APPROVAL: "Waiting for your approval", APPROVED: "Approved; waiting for Runtime", DISPATCHED: "Action sent to Runtime", RUNNING: "Runtime is working", FAILED: "Action failed", CANCELLED: "Action cancelled", OUTCOME_UNKNOWN: "Outcome uncertain — review required", DENIED: "Action denied", EXPIRED: "Action expired" }[state ?? ""] ?? "Loading action state")
}

/** Labels only: raw contract IDs remain the values submitted to authorization handlers. */
export const CAPABILITY_LABELS = {
  "filesystem.list": "Browse workspace", "filesystem.search": "Search workspace", "filesystem.read": "Read files",
  "filesystem.write": "Modify files", "filesystem.create": "Create files", "filesystem.delete": "Delete files",
  "filesystem.move": "Move files", "filesystem.copy": "Copy files", "terminal.execute": "Run a reviewed command",
  "git.read": "Read Git data", "git.write": "Modify Git data", "package.install": "Install packages", "browser.open": "Open web pages",
  "git.status": "View Git status", "git.diff": "View Git changes", "git.log": "View Git history", "git.branch": "View Git branches",
  "git.checkout": "Switch Git revision", "git.add": "Stage Git changes", "git.commit": "Commit Git changes", "git.push": "Push Git changes"
} satisfies Record<import("@/backend/src/trusted-runtime/runtime.contract").RuntimeTool | import("@/backend/src/agent-runtime/tools/tool-contract").ToolPermission, string> & Record<string, string>
export function capabilityLabel(id: string): string {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_LABELS, id) ? CAPABILITY_LABELS[id as keyof typeof CAPABILITY_LABELS] : "Unknown capability"
}
export function capabilityDescription(text: string): string {
  return text.replace(/\b(?:filesystem|terminal|git|package|browser)\.[a-z_]+\b/g, capabilityLabel)
    .replace(/\b[a-f0-9]{64}\b/gi, "[content fingerprint]")
}
export function workspaceAccessSummary(runtime: import("./workspace-runtime-status").WorkspaceRuntimeState): string {
  const consent = runtime.grant?.workspaceRead
  if (runtime.readAuthorized && consent && runtime.grant?.persistentReadAccess) return "Development reading allowed until revoked while runtime and enrollment are active"
  if (runtime.readAuthorized && consent?.expiresAt && Number.isFinite(Date.parse(consent.expiresAt))) return `Reading allowed until ${new Date(consent.expiresAt).toLocaleString()}`
  if (runtime.readConsentStatus === "EXPIRED") return "Reading permission expired"
  if (runtime.readConsentStatus === "REVOKED") return "Reading permission revoked"
  if (runtime.grantStatus === "EXPIRED") return "Runtime access expired · Reading consent is separate"
  if (runtime.grantStatus === "REVOKED" || runtime.bindingStatus === "REVOKED") return "Runtime access revoked · Reading consent is separate"
  if (runtime.readConsentStatus === "STALE" || runtime.bindingStatus === "STALE") return "Reading permission no longer matches this workspace"
  if (runtime.bindingStatus === "OFFLINE" || runtime.connection === "OFFLINE") return "Reading unavailable · Computer offline"
  if (runtime.connection === "UNAVAILABLE" || ["UNAVAILABLE", "UNAUTHORIZED"].includes(runtime.bindingStatus)) return "Workspace reading currently unavailable"
  if (runtime.readConsentStatus === "MISSING") return "Workspace reading permission required"
  return "Workspace reading currently unavailable"
}
