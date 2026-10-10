import { RuntimeLedgerService } from "../../trusted-runtime/runtime-ledger.service";
import { toolDigest } from "../tools/tool-contract";
import type { RuntimeTool } from "../../trusted-runtime/runtime.contract";
import { WorkspaceStoreService } from "../../workspace-intelligence/workspace-store.service";

export interface ExactPlanAction {
  stepId: string;
  tool: RuntimeTool;
  input: Record<string, unknown>;
  relativePath: string;
  expectedAfterHash?: string;
  change?: { before: string; after: string; originalHash: string; updatedHash: string };
}

/** Execution progress is separate from the immutable engineering plan. */
export interface PlanExecutionState {
  version: 1;
  runId: string; planId: string; planVersion: number; planDigest: string;
  conversationId: string; userId: string; organizationId: string; projectId: string;
  requestId: string;
  session: { id: string; issuedAt: number; expiresAt: number };
  /** Fresh authority applies only to unfinished read-back; the reservation session stays immutable. */
  verificationSession?: { id: string; issuedAt: number; expiresAt: number };
  verificationRequestId?: string;
  workspace: { workspaceId: string; version: number; runtimeId: string; runtimeFingerprint: string; rootPath: string };
  status: "PREPARING" | "BLOCKED" | "AWAITING_APPROVAL" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  reason?: string | null;
  phase?: string;
  actions: ExactPlanAction[];
  exactPermit?: { permitId: string; digest: string; generation: number; executionIntentId: string; binding: Record<string, any> };
  proposalId?: string;
  proposalDigest?: string;
  artifacts?: Array<{ stepId: string; artifactId: string; dependencies: string[] }>;
  completed: Record<string, { receiptId: string; verifiedAt: string; durationMs: number }>;
  observations?: Record<string, import("./step-observation").StepObservation>;
  failureDiagnostics?: Record<string, import("./failure-diagnostic").FailureDiagnostic>;
  executionSource?: import("./repair-attempt").ExecutionSource;
  repair?: import("./repair-attempt").RepairAttempt;
  failureRecordedAt?: string;
  lineageId?: string;
  rootPlanId?: string;
  repairContinuation?: import("./repair-continuation").RepairContinuation;
  pendingReceiptId?: string | null;
  createdAt: string;
}

/** Artifact completion is not a runtime observation or receipt. */
export function planStepSatisfied(state: PlanExecutionState, id: string, visited = new Set<string>()): boolean {
  if (state.completed[id]) return true;
  if (visited.has(id)) return false;
  const artifact = state.artifacts?.find(a => a.stepId === id && a.artifactId === state.proposalId);
  return !!artifact && artifact.dependencies.every(dependency => planStepSatisfied(state, dependency, new Set([...visited, id])));
}

export const executionRecord = (tx: any, runId: string) =>
  new RuntimeLedgerService(tx).read<PlanExecutionState>(tx, "PLAN_EXECUTION", runId);

export function verificationOnlyEligible(s: PlanExecutionState): boolean {
  return s.status === "BLOCKED" && !!s.actions.some(a => a.tool === "filesystem.write" && s.completed[a.stepId]) &&
    s.actions.filter(a => !s.completed[a.stepId]).length > 0 &&
    s.actions.filter(a => !s.completed[a.stepId]).every(a => a.tool === "filesystem.read" && !!a.expectedAfterHash);
}

/** Proves reservation linkage from immutable ledger records, not presentation metadata. */
export async function exactExecutionReservationTx(tx: any, s: PlanExecutionState): Promise<boolean> {
  if (!s.exactPermit || !s.proposalId) return false;
  const p = s.exactPermit, ledger = new RuntimeLedgerService(tx), key = [s.userId, s.conversationId, s.proposalId];
  const record = await ledger.read<any>(tx, "EXACT_EXECUTION_PERMIT", p.generation === 1 ? key : [...key, p.generation]);
  const consumption = await ledger.read<any>(tx, "EXACT_PERMIT_CONSUMPTION", p.permitId);
  const global = await ledger.read<any>(tx, "EXACT_PERMIT_CONSUMPTION", key);
  if (!record?.immutable || !consumption?.immutable || !global?.immutable) return false;
  const { digest, ...base } = record.payload, b = p.binding;
  return digest === p.digest && digest === toolDigest(base) && record.payload.oneUse === true &&
    record.payload.permitId === p.permitId && toolDigest(record.payload.binding) === toolDigest(b) &&
    p.executionIntentId === s.requestId && consumption.payload.executionIntentId === s.requestId &&
    global.payload.executionIntentId === s.requestId && global.payload.permitId === p.permitId &&
    global.payload.permitDigest === p.digest && consumption.payload.permitDigest === p.digest &&
    b.proposalId === s.proposalId && b.proposalDigest === s.proposalDigest && b.planId === s.planId && b.planVersion === s.planVersion &&
    b.conversationId === s.conversationId && b.userId === s.userId && b.organizationId === s.organizationId &&
    b.workspace.workspaceId === s.workspace.workspaceId && b.workspace.bindingVersion === s.workspace.version &&
    b.workspace.runtimeId === s.workspace.runtimeId && b.workspace.runtimeFingerprint === s.workspace.runtimeFingerprint &&
    b.actionsDigest === toolDigest(s.actions) && b.sessionId === s.session.id && b.sessionIssuedAt === s.session.issuedAt && b.sessionExpiresAt === s.session.expiresAt;
}

export interface PlanExecutionView {
  lineageId?: string; rootPlanId?: string;
  version: 1; runId: string; planId: string; planVersion: number; revision: number;
  status: PlanExecutionState["status"]; phase?: string; reason?: string | null;
  completedSteps: number; totalSteps: number;
  observations?: import("./step-observation").StepObservation[];
  failureDiagnostics?: import("./failure-diagnostic").FailureDiagnostic[];
  repair?: import("./repair-attempt").RepairAttempt;
  recovery?: "REVIEW_ONLY" | "VERIFICATION_ONLY" | "PREPARATION_REVIEW";
  changes: Array<{ path: string; before: string; after: string; originalHash: string; updatedHash: string }>;
  receipts?: import("../understanding/agent-presentation").EvidenceReceipt[];
}

export async function executionPhaseTx(tx: any, runId: string, phase: string) {
  const record = await executionRecord(tx, runId);
  if (!record || ["COMPLETED", "FAILED", "CANCELLED"].includes(record.payload.status)) return;
  const status = ["REJECTED", "CANCELLED"].includes(phase) ? "CANCELLED" : ["OUTCOME_UNKNOWN", "RUNTIME_REVALIDATION_FAILED"].includes(phase) ? "FAILED" : "RUNNING";
  await new RuntimeLedgerService(tx).update(tx, record, { ...record.payload, status, phase,
    ...(status === "CANCELLED" ? { pendingReceiptId: null } : {}),
    ...(status === "FAILED" ? { reason: phase, pendingReceiptId: null } : {}) }, ["FAILED", "CANCELLED"].includes(status) ? "settled" : "active");
  await tx.agentRun.update({ where: { id: runId }, data: { status, updatedAt: new Date(),
    ...(["FAILED", "CANCELLED"].includes(status) ? { completedAt: new Date(), failureReason: phase } : {}) } });
}

/** Only server-persisted exact actions can activate a planning-only contract. */
export async function authorizedPlanExecution(tx: any, run: any, request: Record<string, unknown>) {
  const plan = run.plans?.[0];
  if (!plan?.steps?.[0]?.parameters?.engineeringPlan) return undefined;
  if (!tx.auditEvent?.findUnique) return null;
  const record = await executionRecord(tx, run.id);
  const s = record?.payload;
  if (!s || !["RUNNING", "AWAITING_APPROVAL"].includes(s.status) || s.userId !== run.userId ||
    s.conversationId !== run.conversationId || s.projectId !== run.projectId || s.planId !== plan.id ||
    s.planVersion !== plan.version || s.planDigest !== toolDigest(plan.steps)) return null;
  if (!(await exactExecutionReservationTx(tx, s))) return null;
  const action = s.actions.find(a => a.stepId === request.planStepId);
  if (!action || action.tool !== request.toolId || toolDigest(action.input) !== toolDigest(request.input) || s.completed[action.stepId]) return null;
  try { await new WorkspaceStoreService(tx).assertInspectionBindingTx(tx, { ...s.workspace, bindingVersion: s.workspace.version,
    userId: s.userId, organizationId: s.organizationId, projectId: s.projectId }); }
  catch { return null; }
  return s;
}
