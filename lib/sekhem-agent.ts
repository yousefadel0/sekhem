import { fetchSekhemApi, postSekhemApi } from "./sekhem-api"
import type { RuntimeCapabilityEnrollment, RuntimeDevice, RuntimeGrant, RuntimeTool } from "@/backend/src/trusted-runtime/runtime.contract"

/** Registration only. Connection is initiated separately by the local worker. */
export async function pairRuntimeDevice(code: string, displayName: string) {
  const device = await postSekhemApi<RuntimeDevice, Record<string, unknown>>("/trusted-runtime/enroll", { code: code.trim(), displayName: displayName.trim() }, { throwOnError: true })
  if (!device || device.status !== "ACTIVE" || !device.runtimeId) throw new Error("Pairing did not return an active device")
  return device
}

export const getRuntimeCapabilityEnrollment = (runtimeId: string, projectId: string) => fetchSekhemApi<RuntimeCapabilityEnrollment | null>(`/trusted-runtime/devices/${encodeURIComponent(runtimeId)}/projects/${encodeURIComponent(projectId)}/capability-enrollment`, { throwOnError: true, allowNullData: true })
export const configureRuntimeCapabilities = (runtimeId: string, projectId: string, expectedRevision: number, capabilities: RuntimeTool[]) => postSekhemApi<RuntimeCapabilityEnrollment, Record<string, unknown>>("/trusted-runtime/capability-enrollments", { runtimeId, projectId, expectedRevision, capabilities, mode: "TRUSTED_MACHINE" }, { throwOnError: true })
export const renewRuntimeAccess = (enrollment: RuntimeCapabilityEnrollment, expectedGrantVersion: number, requestId: string, durationSeconds = 3600) => postSekhemApi<RuntimeGrant, Record<string, unknown>>("/trusted-runtime/grants/renew", { runtimeId: enrollment.runtimeId, projectId: enrollment.projectId, enrollmentRevision: enrollment.revision, expectedGrantVersion, requestId, durationSeconds }, { throwOnError: true })
import type { WorkspaceBinding as RuntimeWorkspaceBinding, WorkspaceOperationView, WorkspaceReceiptReference, RuntimeWorkspaceReference, RuntimeEvidenceReference, RuntimeEvidenceView, RuntimeEvidenceState } from "@/backend/src/workspace-intelligence/workspace-runtime.contract"
export type { RuntimeWorkspaceBinding, WorkspaceOperationView, WorkspaceReceiptReference, RuntimeWorkspaceReference, RuntimeEvidenceReference, RuntimeEvidenceView, RuntimeEvidenceState }
import type { AgentRunStatus } from "./sekhem-conversation"
import type { InspectionView } from "@/backend/src/agent-runtime/inspection/inspection.types"
export type AgentInspection = InspectionView
export type EngineeringPlanIdentity = import("@/backend/src/agent-runtime/understanding/agent-understanding.types").EngineeringPlanIdentity

export interface WorkspaceBinding { id: string; projectId: string; name: string; version: string; mode: "READ_ONLY"; location: "BACKEND_HOST" | "TRUSTED_RUNTIME"; runtime?: RuntimeWorkspaceBinding }
export interface WorkspaceDescriptor extends WorkspaceBinding { status: "AVAILABLE"; executionAvailable: false }
export interface WorkspaceNode { path: string; name: string; type: "file" | "directory"; children?: WorkspaceNode[]; metadata?: { kind?: string; language?: string } }
export interface WorkspaceTree { binding: WorkspaceBinding; root: WorkspaceNode; truncated: boolean; warnings: string[] }
export interface WorkspaceFile { binding: WorkspaceBinding; path: string; fileName: string; mimeType: string; language?: string; text: string; status: string; truncated: boolean; warnings: string[]; scanned: boolean; runtimeReceipt?: WorkspaceReceiptReference }
export interface EvidenceReceipt { operation?: string; runtimeReference?: RuntimeEvidenceReference; id: string; sourceType: string; label: string; relativePath?: string; attachmentId?: string; outcome: string; discovered: boolean; read: boolean; selected: boolean; usedInAnswer: "UNKNOWN"; truncated: boolean; selectionReason: string }
interface Information { id: string; description: string; whyNeeded?: string }
export interface PlanningResult {
  understanding: {
    objective: string; scope: { id: string; reference: string }[]; constraints: Information[]; unknowns: Information[]; readiness: string;
    facts?: { id: string; text: string; evidenceRef: string }[]; inferences?: { id: string; text: string; factIds: string[]; uncertainty: string }[]; hypotheses?: { id: string; text: string; evidenceRefs: string[]; uncertainty: string }[]
  }
  plan: { readiness: string; authorization: string; constraints?: { rule: string }[]; steps: { id: string; type: string; objective: string; purpose: string; status: string; effect: string; risk?: "LOW" | "MEDIUM" | "HIGH"; dependencies?: string[]; expectedResult?: string }[]; missingInformation: Information[]; stopConditions: string[]; successCriteria: Information[]; validation: { valid: boolean; issues: { code: string; path: string }[] } }
}
export interface AgentRunSummary {
  runtimeActionReceipt?: { id: string; state: string; verificationState: string; target: string } | null
  workflowPause?: import("@/backend/src/agent-runtime/workflow-pause").WorkflowPause | null
  workflowDecision?: import("@/backend/src/agent-runtime/execution/workflow-decision").WorkflowDecision | null
  workflow?: import("@/backend/src/conversation/workflow-presentation.contract").DownstreamWorkflowView;
  execution?: import("@/backend/src/agent-runtime/execution/plan-execution-state").PlanExecutionView | null
  planVersion?: number
  inspection?: AgentInspection | null
  control?: AgentControlSnapshot | null
  id: string; agentName: string; title: string; status: AgentRunStatus; progressPercent: number;
  outcome?: "PLAN_READY" | "NEEDS_USER_INPUT" | "NEEDS_EVIDENCE" | "PROVIDER_FAILED" | "OUTPUT_TRUNCATED" | "INVALID_STRUCTURED_OUTPUT" | "FAILED" | "BLOCKED" | "CANCELLED" | "PAUSED" | "COMPLETED" | null;
  startedAt: string | null; completedAt: string | null; createdAt: string; updatedAt?: string
}
/** Bounded safe per-event details projected by the backend snapshot; never raw payloads. */
export interface AgentActivityDetails { status?: string; reason?: string; diagnostic?: string; receipt?: string; approval?: string; reference?: string }
export interface AgentActivity { id: string; agentRunId: string; eventType: string; timestamp: string | Date; payload?: unknown; details?: AgentActivityDetails }
export interface AgentRunDetail extends AgentRunSummary {
  conversationId: string; projectId: string; failureReason: string | null;
  presentation?: { engineeringPlan?: EngineeringPlanIdentity; originatingMessageId?: string; workspace: WorkspaceBinding | null; evidence: EvidenceReceipt[]; warnings: string[]; planning: PlanningResult | null; executionAvailable: false | null; executionPerformed: false | null; executionAuthority?: "RUNTIME_LEDGER" }
  activity?: AgentActivity[]
  artifacts?: { id: string; title: string; artifactType: string; summary: string | null; version: number; createdAt: string }[]
  pendingApprovals: { id: string; approvalType: string; status: string; requiredRole: string; revisedPlan?: unknown; dueAt: string | null }[]
}
export const runIsTerminal = (status: string) => ["COMPLETED", "FAILED", "CANCELLED"].includes(status)
/** Paused runs are settled for display/selection, but can resume through existing controls. */
export const runIsActive = (status: string) => ["QUEUED", "PLANNING", "RUNNING", "AWAITING_APPROVAL"].includes(status)
/** Presentation only: persisted control/decision state takes precedence over an inner step. */
export function workflowControlState(run: AgentRunSummary): "RUNNING" | "PAUSE_REQUESTED" | "PAUSED" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED" | "REJECTED" | "SKIPPED" | "UNAVAILABLE" {
  if (run.workflowDecision) return run.workflowDecision.decision === "SKIP" ? "SKIPPED" : "REJECTED"
  if (runIsTerminal(run.status)) return run.status as "COMPLETED" | "FAILED" | "CANCELLED"
  if (run.workflowPause?.state === "PAUSE_REQUESTED") return "PAUSE_REQUESTED"
  if (run.status === "PAUSED" || run.workflowPause?.state === "PAUSED") return "PAUSED"
  if (run.status === "AWAITING_APPROVAL" || run.inspection?.state === "AWAITING_APPROVAL" || run.execution?.status === "AWAITING_APPROVAL") return "AWAITING_APPROVAL"
  if (run.execution && ["FAILED", "BLOCKED", "CANCELLED", "COMPLETED"].includes(run.execution.status) || run.inspection && ["FAILED", "AWAITING_INPUT", "COMPLETED", "CANCELLED"].includes(run.inspection.state)) return "UNAVAILABLE"
  return runIsActive(run.status) ? "RUNNING" : "UNAVAILABLE"
}
export type WorkflowPhase = "ANALYZING" | "UNDERSTANDING" | "INSPECTING" | "PLANNING" | "PLAN_READY" | "PROPOSAL_READY" | "WAITING_FOR_APPROVAL" | "EXECUTING" | "VERIFYING" | "COMPLETED" | "FAILED" | "BLOCKED" | "QUEUED" | "PAUSED" | "CANCELLED" | "OUTCOME_UNKNOWN" | "PAUSE_REQUESTED" | "SKIPPED" | "APPROVED" | "READING_BACK";
/** Derived labels only. Never authorization, an optimistic transition or a new lifecycle. */
export function runPhase(run: AgentRunSummary, now = Date.now()): WorkflowPhase {
  // A terminal durable run outranks an older inner-step projection.
  if (run.status === "CANCELLED") return "CANCELLED";
  if (run.status === "FAILED") return run.execution?.reason === "OUTCOME_UNKNOWN" || run.execution?.phase === "OUTCOME_UNKNOWN"
    ? "OUTCOME_UNKNOWN" : run.outcome === "BLOCKED" ? "BLOCKED" : "FAILED";
  const scheduling = workflowControlState(run);
  if (scheduling === "PAUSE_REQUESTED" || scheduling === "PAUSED") return scheduling;
  if (scheduling === "SKIPPED") return "SKIPPED";
  if (scheduling === "REJECTED") return "BLOCKED";
  if (scheduling === "AWAITING_APPROVAL") return "WAITING_FOR_APPROVAL";
  if (run.execution?.status === "CANCELLED" || run.inspection?.state === "CANCELLED") return "CANCELLED";
  const e = run.execution;
  if (e) {
    if (e.reason === "OUTCOME_UNKNOWN" || e.phase === "OUTCOME_UNKNOWN") return "OUTCOME_UNKNOWN";
    if (e.status === "FAILED") return "FAILED";
    if (e.status === "BLOCKED") return "BLOCKED";
    if (e.status === "AWAITING_APPROVAL") return "WAITING_FOR_APPROVAL";
    if (e.status === "COMPLETED") return e.totalSteps > 0 && e.completedSteps === e.totalSteps && !!e.receipts?.length &&
      e.receipts.every(receipt => receipt.runtimeReference?.verificationState === "VERIFIED") ? "COMPLETED" : "BLOCKED";
    if (e.phase === "WAITING_RUNTIME" && e.completedSteps > 0) return "READING_BACK";
    if (e.phase === "WAITING_RUNTIME") return "APPROVED";
    if (e.phase === "VERIFYING") return "VERIFYING";
    if (e.phase === "EXECUTING") return "EXECUTING";
    return "QUEUED";
  }
  if (run.status === "PAUSED") return "PAUSED";
  const s = run.inspection;
  if (s) {
    if (s.state === "FAILED") return "FAILED";
    if (s.state === "COMPLETED") return s.objectiveGrounded && s.understanding?.status === "GROUNDED" &&
      s.understanding.understanding.readiness === "UNDERSTANDING_READY" ? "COMPLETED" : "BLOCKED";
    if (["PARTIAL", "NEEDS_MORE_EVIDENCE", "AWAITING_INPUT"].includes(s.state)) return "BLOCKED";
    if (s.state === "AWAITING_APPROVAL") return "WAITING_FOR_APPROVAL";
    if (s.state === "REQUESTED") return "QUEUED";
    return ["UNDERSTANDING", "REPORTING"].includes(s.state) ? "UNDERSTANDING" : "INSPECTING";
  }
  if (run.status === "PLANNING") return "PLANNING";
  const w = run.workflow;
  if (w) {
    if (w.proposal.state === "STALE") return "BLOCKED";
    const a = w.approval;
    if (a && (!a.deadline || Date.parse(a.deadline) <= now || ["EXPIRED", "STALE", "DENIED", "CANCELLED"].includes(a.state))) return "BLOCKED";
    if (a?.state === "PENDING" && a.actionable) return "WAITING_FOR_APPROVAL";
    if (w.permit && ["EXPIRED", "STALE", "CONSUMED"].includes(w.permit.state)) return "BLOCKED";
    return "PROPOSAL_READY";
  }
  if (run.outcome === "PLAN_READY") return "PLAN_READY";
  if (run.status === "QUEUED") return "QUEUED";
  if (run.status === "AWAITING_APPROVAL") return "WAITING_FOR_APPROVAL";
  // A coarse COMPLETED flag alone proves neither certification nor read-back.
  if (run.status === "COMPLETED") return "BLOCKED";
  return "ANALYZING";
}
export function workflowPhaseLabel(phase: WorkflowPhase): string {
  return ({
    ANALYZING: "Analyzing", UNDERSTANDING: "Understanding", INSPECTING: "Inspecting source", PLANNING: "Planning", PLAN_READY: "Plan ready · No proposal yet",
    PROPOSAL_READY: "Exact proposal ready", WAITING_FOR_APPROVAL: "Waiting for approval", EXECUTING: "Applying the authorized change",
    VERIFYING: "Verifying the result", COMPLETED: "Completed and verified", FAILED: "Failed", BLOCKED: "Blocked · Review saved details",
    PAUSE_REQUESTED: "Pause requested", SKIPPED: "Skipped · required step", APPROVED: "Approved · Waiting for runtime", READING_BACK: "Reading changed source back", QUEUED: "Queued", PAUSED: "Paused", CANCELLED: "Cancelled", OUTCOME_UNKNOWN: "Outcome unknown · Review required"
  })[phase];
}
export function workflowNeedsRefresh(run: AgentRunSummary, now = Date.now()): boolean {
  if (runIsActive(run.status)) return true;
  if (!run.workflow || run.execution && ["COMPLETED", "FAILED", "CANCELLED"].includes(run.execution.status)) return false;
  const a = run.workflow.approval, p = run.workflow.permit;
  if (run.workflow.consent?.policies.some(c => c.state === "ACTIVE" && Date.parse(c.reference.expiresAt) > now)) return true;
  return run.workflow.proposal.state === "READY" && (!a || (a.deadline !== null && Date.parse(a.deadline) > now &&
    ["PENDING", "APPROVED"].includes(a.state))) && (!p || p.state === "UNUSED" && Date.parse(p.deadline) > now);
}
/** Explorer/editor receipts do not replace the conversation's actual Agent result. */
export function conversationAgentRun(history: AgentRunSummary[], details: Record<string, AgentRunDetail | undefined>): AgentRunSummary | undefined {
  const latest = history.filter(run => !run.id.startsWith("rtrun_")).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return latest ? details[latest.id] ?? latest : undefined;
}
export function evidenceDisplayStatus(item: EvidenceReceipt): string {
  return item.truncated && item.runtimeReference?.truncated === false ? "MODEL EXCERPT SHORTENED" : item.outcome;
}
export function runActivity(run: AgentRunSummary, eventType?: string, plan?: PlanningResult | null): string {
  if (run.workflowPause?.state === "PAUSED") return "Paused";
  if (run.id?.startsWith("rtrun_") && run.status === "COMPLETED" && run.runtimeActionReceipt?.id &&
    run.runtimeActionReceipt.state === "SUCCEEDED" && run.runtimeActionReceipt.verificationState === "VERIFIED") return "Action verified";
  if (run.id?.startsWith("rtrun_") && run.status === "COMPLETED" && !run.runtimeActionReceipt && !run.execution) return "Completion recorded · Inspect execution receipt";
  if (run.workflow && !run.execution) return workflowPhaseLabel(runPhase(run));
  if (run.execution?.status === "COMPLETED" && runPhase(run) !== "COMPLETED") return "Verification incomplete · Review saved details";
  if (run.inspection?.state === "COMPLETED" && runPhase(run) !== "COMPLETED") return "Understanding incomplete · Review saved details";
  if (run.status === "PLANNING" && !run.inspection && !run.execution) return "Planning";
  if (run.status === "CANCELLED") return "Cancelled"
  if (run.execution) {
    const e = run.execution
    if (e.status === "COMPLETED") return "Change verified"
    if (e.status === "BLOCKED") return "Waiting for the required information or authorization"
    if (e.status === "FAILED") return e.reason === "OUTCOME_UNKNOWN" ? "Result unknown · Review before continuing" : "Execution stopped · Review the result"
    if (e.status === "CANCELLED") return "Change cancelled"
    if (e.status === "PREPARING") return "Preparing the exact change"
    if (e.status === "AWAITING_APPROVAL") return "Review the change and approve"
    return ({ WAITING_RUNTIME: "Waiting for the runtime", DISPATCHED: "Waiting for the runtime to start", EXECUTING: "Applying or checking the approved change", VERIFYING: "Checking the result" } as Record<string, string>)[e.phase ?? ""] ?? "Execution in progress"
  }
  if (run.inspection) {
    if (run.inspection.code === "OUTPUT_TRUNCATED") return "Output truncated · Plan not ready"
    if (run.inspection.state === "FAILED") return run.inspection.operations.some(op => op.action?.tool === "filesystem.read" && op.verification === "VERIFIED") ? "Some sources read · Analysis stopped"
      : run.inspection.evidence.length > 0 ? "Observations retained · Analysis stopped" : "Analysis stopped · No verified read completed"
    return inspectionLabel(run.inspection.state)
  }
  if (run.control && run.status !== "FAILED") return controlLabel(run.control)
  if (run.status === "PAUSED") return "Paused"
  if (run.status === "COMPLETED" || run.status === "FAILED") {
    const failures = { PROVIDER_FAILED: "Provider failed", OUTPUT_TRUNCATED: "Output truncated", INVALID_STRUCTURED_OUTPUT: "Invalid structured output", FAILED: "Failed", BLOCKED: "Blocked" }
    if (run.outcome && run.outcome in failures) return failures[run.outcome as keyof typeof failures]
    if (run.status === "FAILED") return "Failed"
    if (run.outcome === "NEEDS_USER_INPUT") return "Needs user input"
    if (run.outcome === "NEEDS_EVIDENCE") return "Needs evidence"
    if (run.outcome === "COMPLETED") return "Completion recorded · Verification unavailable"
    if (run.outcome === "PLAN_READY") return "Plan ready · Completed"
    if (plan) return plan.plan.readiness === "PLAN_READY" && plan.plan.validation.valid ? "Plan ready · Completed" : "Planning incomplete"
    return "Completion recorded · Verification unavailable"
  }
  if (run.status === "QUEUED") return "Queued"
  if (run.status === "AWAITING_APPROVAL") return "Awaiting approval"
  if (run.id?.startsWith("rtrun_") && run.status === "RUNNING") return "Executing"
  if (eventType === "EVIDENCE_REQUESTED" || eventType === "CONTEXT_RESOLVED") return "Gathering evidence"
  if (["EVIDENCE_COLLECTED", "PLAN_CREATED", "PLAN_VALIDATED", "UNDERSTANDING_COMPLETED"].includes(eventType ?? "")) return "Planning"
  return "Understanding"
}
export function inspectionLabel(state: string): string {
  return ({
    REQUESTED: "Requested", UNDERSTANDING: "Understanding", INSPECTION_PLANNED: "Inspecting", ACTION_PROPOSED: "Inspection proposed",
    AUTHORIZATION_PENDING: "Checking authorization", AWAITING_APPROVAL: "Waiting for approval", AWAITING_INPUT: "Waiting for your instruction", APPROVED: "Approved · Revalidation required",
    REVALIDATING: "Revalidating", EXECUTING: "Reading workspace", OBSERVING: "Observing evidence", VERIFYING: "Verifying evidence", NEEDS_MORE_EVIDENCE: "Needs more evidence",
    REPORTING: "Preparing grounded report", COMPLETED: "Completed", PARTIAL: "Understanding incomplete", FAILED: "Failed", CANCELLED: "Cancelled"
  } as Record<string, string>)[state] ?? state
}
export interface AgentControlSnapshot {
  version: 1; revision: number; runId: string; state: string; code: string; executionPerformed: false
  proposal?: {
    proposalId: string; proposalDigest: string; planId: string; planVersion: number; planStepId: string; toolId: string; toolVersion: string;
    purpose: string; effect: string; risk: string; scope: { workspaceId: string; paths: string[] }; workspaceBindingVersion: string;
    validatedInput: Record<string, unknown>; preview: { available: boolean; description: string }
  }
  approvalId?: string; approvalFingerprint?: string
  intent?: { intentId: string; status: string; expiresAt: string; runtimeId: null; dispatchable: false; executionAllowed: false }
}
export function controlLabel(control: AgentControlSnapshot): string {
  if (control.intent?.status === "CANCELLED") return "Execution intent cancelled"
  if (control.intent?.status === "EXPIRED" || (control.intent && Date.parse(control.intent.expiresAt) <= Date.now())) return "Execution intent expired"
  if (control.intent?.status === "INVALIDATED") return "Execution intent invalidated"
  if (control.state === "AWAITING_APPROVAL") return "Action requires approval"
  if (control.state === "APPROVED") return "Approved · Revalidation required"
  if (control.code === "EXECUTION_BOUNDARY_NOT_IMPLEMENTED") return "Execution blocked · Local Runtime unavailable"
  if (control.state === "ACTION_PROPOSED") return "Action proposed · Authorization required"
  if (control.state === "NEEDS_USER_INPUT") return "Action details required"
  if (control.state === "EXECUTION_BLOCKED") return "Execution blocked"
  return "Decision in progress"
}
export const getAgentRun = (id: string) => fetchSekhemApi<AgentRunDetail>(`/agent-runs/${encodeURIComponent(id)}`, { throwOnError: true })
export const getWorkspace = (projectId: string) => fetchSekhemApi<WorkspaceDescriptor>(`/projects/${encodeURIComponent(projectId)}/workspace`, { throwOnError: true })
export const getWorkspaceTree = (binding: WorkspaceBinding, path = "") => {
  if (binding.location !== "BACKEND_HOST") throw new Error("Runtime Workspace requires an approved runtime listing")
  return fetchSekhemApi<WorkspaceTree>(`/projects/${encodeURIComponent(binding.projectId)}/workspace/tree?path=${encodeURIComponent(path)}&version=${binding.version}`, { throwOnError: true })
}
export const getWorkspaceFile = (binding: WorkspaceBinding, path: string) => {
  if (binding.location !== "BACKEND_HOST") throw new Error("Runtime Workspace requires an approved runtime read")
  return fetchSekhemApi<WorkspaceFile>(`/projects/${encodeURIComponent(binding.projectId)}/workspace/file?path=${encodeURIComponent(path)}&version=${binding.version}`, { throwOnError: true })
}
export interface WorkspaceRuntimeDevice { runtimeId: string; displayName: string; fingerprint: string; status: string; online: boolean; lastSeenAt: string | null; folderPickerProtocol?: 1 | null }
export interface FolderSelection { selectionId: string; runtimeId: string; expiresAt: string; state: "PENDING" | "DISPATCHED" | "SELECTED" | "CANCELLED" | "EXPIRED"; rootPath: string | null }
export const chooseWorkspaceFolder = (projectId: string, runtimeId: string) => postSekhemApi<FolderSelection, { runtimeId: string }>(`/trusted-runtime/projects/${encodeURIComponent(projectId)}/folder-selections`, { runtimeId }, { throwOnError: true })
export const getFolderSelection = (projectId: string, id: string) => fetchSekhemApi<FolderSelection>(`/trusted-runtime/projects/${encodeURIComponent(projectId)}/folder-selections/${encodeURIComponent(id)}`, { throwOnError: true })
const workspaceApi = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/workspace`
export const getWorkspaceDevices = (projectId: string) => fetchSekhemApi<WorkspaceRuntimeDevice[]>(`${workspaceApi(projectId)}/runtime/devices`, { throwOnError: true })
export const getWorkspaceBindings = (projectId: string) => fetchSekhemApi<{ activeWorkspaceId: string | null; bindings: RuntimeWorkspaceBinding[] }>(`${workspaceApi(projectId)}/bindings`, { throwOnError: true })
export const getRuntimeWorkspaceBinding = (projectId: string, ref: RuntimeWorkspaceReference) => fetchSekhemApi<RuntimeWorkspaceBinding>(`${workspaceApi(projectId)}/bindings/${encodeURIComponent(ref.workspaceId)}?version=${ref.bindingVersion}`, { throwOnError: true })
export const createWorkspaceBinding = (projectId: string, body: { runtimeId: string; rootPath: string; displayName: string; requestId: string }) => postSekhemApi<RuntimeWorkspaceBinding, typeof body>(`${workspaceApi(projectId)}/bindings`, body, { throwOnError: true })
/** Connect identity only. Verification/listing remains a separate explicit Explorer operation. */
export async function openWorkspaceBinding(projectId: string, body: Parameters<typeof createWorkspaceBinding>[1], ensureConversation: (binding: RuntimeWorkspaceBinding) => Promise<string>) {
  const binding = await createWorkspaceBinding(projectId, body)
  if (!binding) throw new Error("Binding unavailable")
  await ensureConversation(binding)
  return binding
}
export const runtimeWorkspaceDescriptor = (b: RuntimeWorkspaceBinding): WorkspaceBinding => ({ id: b.workspaceId, projectId: b.projectId, name: b.displayName, version: String(b.version), location: "TRUSTED_RUNTIME", mode: "READ_ONLY", runtime: b })
export const setWorkspaceReadGrant = (binding: RuntimeWorkspaceBinding, expectedGrantVersion: number, revoke = false, durationMinutes = 60) => postSekhemApi(`${workspaceApi(binding.projectId)}/bindings/${encodeURIComponent(binding.workspaceId)}/read-grant${revoke ? "/revoke" : ""}`, { bindingVersion: binding.version, expectedGrantVersion, ...(revoke ? {} : { durationMinutes }) }, { throwOnError: true })
export async function requestWorkspaceOperation(binding: RuntimeWorkspaceBinding, kind: "verify" | "tree" | "file" | "search", conversationId: string, relativePath = "", query?: string) {
  const body = { conversationId, relativePath, bindingVersion: binding.version, requestId: crypto.randomUUID(), ...(kind === "search" ? { query } : {}) }
  const result = await postSekhemApi<WorkspaceOperationView, typeof body>(`${workspaceApi(binding.projectId)}/bindings/${encodeURIComponent(binding.workspaceId)}/${kind}`, body, { throwOnError: true })
  if (!result) throw new Error("Workspace operation unavailable")
  return result
}
export async function getWorkspaceOperation(binding: RuntimeWorkspaceBinding, path = "", operation?: WorkspaceOperationView) {
  const r = await fetchSekhemApi<{ view: WorkspaceOperationView | null }>(`${workspaceApi(binding.projectId)}/bindings/${encodeURIComponent(binding.workspaceId)}/${operation?.operation.tool === "filesystem.read" ? "file" : "tree"}?version=${binding.version}&path=${encodeURIComponent(path)}${operation ? `&operationId=${encodeURIComponent(operation.operation.operationId)}` : ""}`, { throwOnError: true })
  return r?.view ?? null
}
export function workspaceOperationFile(binding: WorkspaceBinding, view: WorkspaceOperationView): WorkspaceFile | null {
  if (!view.file || !view.receipt || !["READY", "TRUNCATED"].includes(view.state) || binding.id !== view.receipt.workspaceId || binding.version !== String(view.receipt.bindingVersion)) return null
  return { binding, path: view.receipt.relativePath, ...view.file, status: view.state, truncated: view.receipt.truncated, scanned: false, runtimeReceipt: view.receipt }
}
export async function requestRuntimeEvidence(binding: RuntimeWorkspaceBinding, conversationId: string, relativePath: string) {
  const body = { conversationId, relativePath, bindingVersion: binding.version, runtimeId: binding.runtimeId, requestId: crypto.randomUUID() }
  const result = await postSekhemApi<RuntimeEvidenceView, typeof body>(`${workspaceApi(binding.projectId)}/bindings/${encodeURIComponent(binding.workspaceId)}/evidence`, body, { throwOnError: true })
  if (!result) throw new Error("Runtime evidence unavailable")
  return result
}
export async function getRuntimeEvidence(binding: RuntimeWorkspaceBinding, requestId: string) {
  const result = await fetchSekhemApi<RuntimeEvidenceView>(`${workspaceApi(binding.projectId)}/bindings/${encodeURIComponent(binding.workspaceId)}/evidence/${encodeURIComponent(requestId)}?version=${binding.version}`, { throwOnError: true })
  if (!result) throw new Error("Runtime evidence unavailable")
  return result
}
