import { boundedToolJson, isRecord, matchesToolSchema, toolDigest, validToolId, type ToolRequest, type ToolPermission, type ToolRisk } from "./tool-contract";
import type { ToolRegistryService } from "./tool-registry.service";
import type { AgentPlanningResult } from "../understanding/agent-understanding.types";
import type { WorkspaceBinding } from "../../workspace-intelligence/models/workspace.types";

export const CONTROL_ARTIFACT = "AGENT_CONTROL_STATE";
export const CONTROL_POLICY = "phase0a-v1";
export const INTENT_TTL_MS = 5 * 60 * 1000;
export const controlRecordId = (runId: string) => `control_${toolDigest(runId)}`;
export type ControlState = "PLAN_READY" | "DECIDING" | "ACTION_PROPOSED" | "AUTHORIZATION_PENDING" | "AWAITING_APPROVAL" | "APPROVED" | "REVALIDATING" | "EXECUTION_INTENT_CREATED" | "EXECUTION_BLOCKED" | "NEEDS_USER_INPUT" | "FAILED";
export interface ActionProposal {
  proposalId: string; runId: string; planId: string; planVersion: number; planStepId: string;
  userId: string; projectId: string; organizationId: string; conversationId: string;
  toolId: string; toolVersion: string; validatedInput: Record<string, unknown>; purpose: string;
  effect: "READ_ONLY"; scope: ToolRequest["scope"]; risk: ToolRisk; requiredPermissions: readonly ToolPermission[];
  requiresApproval: boolean; workspaceBindingId: string; workspaceBindingVersion: string;
  planDigest: string; verificationDigest: string; policyVersion: typeof CONTROL_POLICY;
  inputDigest: string; scopeDigest: string; createdAt: string; proposalDigest: string;
  preview: { available: true; description: string };
}
export interface ExecutionIntent {
  intentId: string; requestId: string; runId: string; planId: string; planVersion: number; planStepId: string;
  actionProposalId: string; toolRequestId: string; projectId: string; userId: string; conversationId: string;
  organizationId: string; authorizingSessionId: string; policyVersion: typeof CONTROL_POLICY;
  workspaceBindingId: string; workspaceBindingVersion: string; runtimeId: null;
  authorizationReference: string; approvalReference: string | null; proposalDigest: string; inputDigest: string; scopeDigest: string;
  status: "BOUNDARY_BLOCKED" | "CANCELLED" | "EXPIRED" | "INVALIDATED";
  issuedAt: string; expiresAt: string; idempotencyKey: string; executionAllowed: false; dispatchable: false;
}
export interface ControlSnapshot {
  version: 1; revision: number; runId: string; state: ControlState; code: string;
  proposal?: ActionProposal; request?: ToolRequest; approvalId?: string; approvalFingerprint?: string;
  intent?: ExecutionIntent; executionPerformed: false;
}
export class ControlValidationError extends Error {}
const reject = (code: string): never => { throw new ControlValidationError(code); };

export function persistedPlanning(run: any) {
  const plan = run.plans?.[0];
  const work = Array.isArray(plan?.steps) && plan.steps.length === 1 ? plan.steps[0] : undefined;
  const planning = work?.planningOnly === true && work.skillId === "" ? work.parameters?.planning as AgentPlanningResult : undefined;
  if (!plan || plan.agentRunId !== run.id || plan.version !== run.planVersion || plan.status !== "PLAN_READY" ||
    planning?.version !== 1 || planning.plan?.readiness !== "PLAN_READY" || planning.plan.authorization !== "NOT_GRANTED" ||
    planning.plan.validation?.valid !== true || planning.understanding?.readiness !== "UNDERSTANDING_READY" ||
    !Array.isArray(planning.plan.steps) || !planning.plan.steps.length || planning.plan.steps.length > 6) reject("INVALID_PLAN_STEP");
  return { plan, planning: planning!, parameters: work.parameters };
}

/** Deliberately narrow projection, not command synthesis. Evidence names never grant scope. */
export function deriveAction(run: any, registry: ToolRegistryService, createdAt: string, selectedStepId?: string): ActionProposal {
  const { plan, planning, parameters } = persistedPlanning(run);
  const binding = parameters.workspaceBinding as WorkspaceBinding | undefined;
  if (!binding || binding.projectId !== run.projectId || binding.mode !== "READ_ONLY" || binding.location !== "BACKEND_HOST" || !binding.version || !validToolId(binding.id)) reject("WORKSPACE_BINDING_REQUIRED");
  const step = selectedStepId ? planning.plan.steps.find(s => s.id === selectedStepId) : planning.plan.steps[0];
  if (!step || step.status !== "PLANNED") reject("INVALID_PLAN_STEP");
  if (step!.effect !== "READ_ONLY" || step!.type !== "INSPECT") reject("DETAILED_EXECUTION_PREVIEW_UNAVAILABLE");
  if (!Array.isArray(step!.dependencies) || step!.dependencies.length) reject("DEPENDENCY_NOT_SATISFIED");
  if (!Array.isArray(step!.scopeRefs) || !step!.scopeRefs.length || !Array.isArray(step!.requiredEvidence) || !step!.requiredEvidence.length ||
    !Array.isArray(planning.understanding.scope) || !Array.isArray(parameters.evidenceReceipt)) reject("INSUFFICIENT_SCOPE");
  const scopes = step!.scopeRefs.map(id => planning.understanding.scope.find(s => s.id === id));
  if (scopes.some(s => !s || (s.kind === "PROJECT" && s.reference !== run.projectId))) reject("SCOPE_VIOLATION");
  const receipts = parameters.evidenceReceipt.filter((e: any) => e.sourceType === "workspace" && e.read === true && e.selected === true &&
    ["READ", "TRUNCATED"].includes(e.outcome) && typeof e.relativePath === "string" && step!.requiredEvidence.includes(e.id) &&
    scopes.some(s => s?.kind === "EVIDENCE" && s.reference === e.relativePath && s.evidenceRefs.includes(e.id)));
  // Multiple targets need explicit action decomposition, never an arbitrary choice.
  if (receipts.length !== 1 || step!.requiredEvidence.some(id => !parameters.evidenceReceipt.some((e: any) => e.id === id && e.read && e.selected))) reject("INSUFFICIENT_SCOPE");
  const path = receipts[0].relativePath as string;
  if (!path || path.length > 1024 || path.startsWith("/") || /[\\:\x00-\x1f*?"<>|]/.test(path) || path.split("/").some(s => !s || s === "." || s === "..")) reject("SCOPE_VIOLATION");
  const tool = registry.resolve("filesystem.read", "1.0.0");
  if (step!.risk !== tool.riskLevel) reject("RISK_MISMATCH");
  if (!Array.isArray(planning.plan.constraints) || planning.plan.constraints.some(c => c.rule === "UNRESOLVED")) reject("POLICY_BLOCKED");
  if (!step!.verification || step!.verification.status !== "PLANNED" || !Array.isArray(step!.verification.criterionIds) ||
    !step!.verification.criterionIds.length || step!.verification.criterionIds.some(id => !planning.plan.successCriteria.some(c => c.id === id))) reject("VERIFICATION_MISMATCH");
  const input = { path }, scope = { workspaceId: binding!.id, paths: [path] };
  if (!matchesToolSchema(input, tool.inputSchema) || !run.project?.organizationId || !run.conversationId || !step!.purpose?.trim()) reject("INVALID_INPUT");
  const operation = { runId: run.id, planId: plan.id, planVersion: plan.version, planStepId: step!.id,
    userId: run.userId, projectId: run.projectId, organizationId: run.project.organizationId, conversationId: run.conversationId,
    toolId: tool.id, toolVersion: tool.version, validatedInput: input, purpose: step!.purpose,
    effect: "READ_ONLY" as const, scope, risk: tool.riskLevel, requiredPermissions: [...tool.requiredPermissions],
    requiresApproval: tool.approvalRequirement === "REQUIRED", workspaceBindingId: binding!.id, workspaceBindingVersion: binding!.version,
    planDigest: toolDigest(plan.steps), verificationDigest: toolDigest({ step: step!.verification, required: step!.verificationRequired, criteria: planning.plan.successCriteria, expectations: tool.verificationExpectations }),
    policyVersion: CONTROL_POLICY as typeof CONTROL_POLICY, inputDigest: toolDigest(input), scopeDigest: toolDigest(scope) };
  const proposalDigest = toolDigest(operation);
  return { ...operation, proposalId: `proposal_${proposalDigest}`, createdAt, proposalDigest,
    preview: { available: true, description: `Read bounded source from ${path}. No file modification, command, or verification is authorized.` } };
}

export function validateAction(run: any, value: unknown, registry: ToolRegistryService): ActionProposal {
  if (!boundedToolJson(value) || !isRecord(value) || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || !validToolId(value.planStepId)) reject("INVALID_ACTION_PROPOSAL");
  let expected: ActionProposal;
  try { expected = deriveAction(run, registry, (value as any).createdAt, (value as any).planStepId); }
  catch (error) { if (error instanceof ControlValidationError) throw error; return reject("INVALID_TOOL"); }
  if (toolDigest(value) !== toolDigest(expected)) reject("ACTION_BINDING_CHANGED");
  return expected!;
}
export function actionRequest(proposal: ActionProposal): ToolRequest {
  return { id: `request_${proposal.proposalDigest}`, runId: proposal.runId, planId: proposal.planId, planVersion: proposal.planVersion,
    planStepId: proposal.planStepId, toolId: proposal.toolId, toolVersion: proposal.toolVersion,
    input: structuredClone(proposal.validatedInput), purpose: proposal.purpose, scope: structuredClone(proposal.scope), requestedBy: "AGENT",
    risk: proposal.risk, requiresApproval: proposal.requiresApproval };
}
export function controlSnapshot(row: any): ControlSnapshot | undefined {
  if (!row) return;
  const s = row.metadata;
  if (row.artifactType !== CONTROL_ARTIFACT || row.id !== controlRecordId(row.agentRunId) || !boundedToolJson(s) || !isRecord(s) || s.version !== 1 ||
    s.runId !== row.agentRunId || s.executionPerformed !== false || !Number.isSafeInteger(s.revision) ||
    Object.keys(s).some(k => !["version", "revision", "runId", "state", "code", "proposal", "request", "approvalId", "approvalFingerprint", "intent", "executionPerformed"].includes(k)) ||
    !["PLAN_READY", "DECIDING", "ACTION_PROPOSED", "AUTHORIZATION_PENDING", "AWAITING_APPROVAL", "APPROVED", "REVALIDATING", "EXECUTION_INTENT_CREATED", "EXECUTION_BLOCKED", "NEEDS_USER_INPUT", "FAILED"].includes(String(s.state))) reject("INVALID_CONTROL_STATE");
  if (s.intent !== undefined && (!isRecord(s.intent) || !s.proposal || !s.request || s.intent.runtimeId !== null || s.intent.executionAllowed !== false ||
    s.intent.dispatchable !== false || s.intent.runId !== s.runId || !["BOUNDARY_BLOCKED", "CANCELLED", "EXPIRED", "INVALIDATED"].includes(String(s.intent.status)) ||
    typeof s.intent.expiresAt !== "string" || !Number.isFinite(Date.parse(s.intent.expiresAt)))) reject("INVALID_CONTROL_STATE");
  return structuredClone(s) as unknown as ControlSnapshot;
}
/** Read-only presentation; expiry is truthful even before a reconciliation writes it. */
export function presentControl(artifacts: any[], run?: any): ControlSnapshot | null {
  const row = artifacts?.find(a => a.artifactType === CONTROL_ARTIFACT && (!run || (a.agentRunId === run.id && a.projectId === run.projectId)));
  try {
    const state = controlSnapshot(row);
    if (!state) return null;
    if (state.intent && Date.parse(state.intent.expiresAt) <= Date.now() && state.intent.status === "BOUNDARY_BLOCKED") {
      state.intent.status = "EXPIRED"; state.state = "EXECUTION_BLOCKED"; state.code = "INTENT_EXPIRED";
    }
    return state;
  } catch { return { version: 1, revision: 0, runId: run?.id ?? row?.agentRunId, state: "EXECUTION_BLOCKED", code: "INVALID_CONTROL_STATE", executionPerformed: false }; }
}
