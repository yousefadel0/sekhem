import { isConversationAcknowledgment, requestsConversationExecution, requestsConversationPlan, requestsExactProposal, requestsPlanHandoff, requestsUnderstandingFollowup, planningAcceptanceSection, requestsPendingPlanningContinuation } from "./conversation-intent";
import { requestsWorkspace, requestsWorkspaceVisibility, workspaceFileReferences } from "../agent-runtime/workspace-intent";
import { naturalWorkspaceRequest, requestsProjectUnderstanding, REFERENCE_LIMIT, type WorkspaceReference, type WorkspaceConcept } from "./workspace-reference";
import { currentPlanningInformation, continuationObjective } from "./planning-continuation-information";
import { naturalReview, reviewTarget, projectRecommendationRequest, projectContentAnalysisRequest } from "./review-intent";
export type ConversationRoute = "TERMINAL_PROPOSAL" | "EXACT_PROPOSAL" | "CONVERSATION" | "WORKSPACE" | "INSPECTION" | "INSPECTION_CONTINUATION" | "UNDERSTANDING" | "PLANNING" | "PLAN_EXECUTION" | "APPROVAL_GUIDANCE" | "AMBIGUOUS" | "UNAVAILABLE";
export interface ConversationWorkflowSummary {
  truncated?: boolean;
  eligiblePlans?: Array<{ runId: string; planId: string; planVersion: number; digest: string; proposalId?: string }>;
  activeInspections: Array<{ runId: string; state: string }>;
  certifiedUnderstanding: { runId: string; sequence: number } | null;
  latestPlan: { runId: string; planId: string; readiness: string } | null;
  execution: { runId: string; status: string } | null;
  pendingApprovals: Array<{ runId: string; approvalId?: string }>;
  workflows?: Array<{ runId: string; planId?: string }>;
  workspace: { workspaceId: string; bindingVersion: number; runtimeId: string; runtimeFingerprint: string } | null;
  references?: WorkspaceReference[];
  referencesTruncated?: boolean;
  workspaceFiles?: string[];
  workspaceFilesTruncated?: boolean;
  recentConcepts?: WorkspaceConcept[];
  pendingPlanning?: Array<{ runId: string; sourceRunId: string; objective: string; missingInformationIds: string[] }>;
}
export interface ConversationIntentDecision { route: ConversationRoute; target?: { runId: string; approvalId?: string; planId?: string; planVersion?: number; digest?: string; proposalId?: string }; reason: string; reference?: WorkspaceReference; inspectionInstruction?: string; planningInstruction?: string; planningContinuationMessage?: string; inspectionPlanningObjective?: string }
/** Routing advice only. Never a certification, approval or execution authority. */
export function resolveConversationIntent(text: string, context: ConversationWorkflowSummary, compatibility: { triggerAgent?: boolean; transferToAgent?: boolean; runtimeEvidence?: boolean; automation?: boolean } = {}): ConversationIntentDecision {
  const result = (route: ConversationRoute, reason: string, runId?: string): ConversationIntentDecision => ({ route, reason, ...(runId ? { target: { runId } } : {}) });
  if (compatibility.automation) return result("UNAVAILABLE", "automation-not-enabled");
  // Bounded literal command intent, not shell parsing or execution authority.
  // Other command forms retain their existing handling until explicitly supported.
  if (/^(?:please\s+)?run\s+node\s+--version\s*$/i.test(text.trim())) return context.workspace
    ? result("TERMINAL_PROPOSAL", "explicit-node-version-command") : result("UNAVAILABLE", "workspace-binding-required");
  // Explicit plan handoff and agreement use plan controls. Bare "نفذ" must
  // reach the contextual workflow lookup below, not assume a planning target.
  if ((requestsPlanHandoff(text) && /^نف/.test(text.trim())) || /^موافق[.!؟?\s]*$/.test(text.trim())) {
    if (context.truncated) return result("AMBIGUOUS", "workflow-context-truncated");
    const plans = new Map<string, NonNullable<ConversationWorkflowSummary["eligiblePlans"]>[number]>();
    for (const p of context.eligiblePlans ?? []) if (!plans.has(p.runId) || plans.get(p.runId)!.planVersion < p.planVersion) plans.set(p.runId, p);
    if (plans.size > 1) return result("AMBIGUOUS", "multiple-pending-workflows");
    const plan = [...plans.values()][0];
    return plan ? { route: "APPROVAL_GUIDANCE", reason: "plan-execution-controls-required", target: plan } : result("UNAVAILABLE", "plan-not-eligible");
  }
  if (requestsExactProposal(text)) {
    if (context.truncated) return result("AMBIGUOUS", "workflow-context-truncated");
    const explicit = /\b(?:from|for|with)\s+plan\s+([A-Za-z0-9_-]{1,128})(?=$|[\s.,!?])/i.exec(text)?.[1];
    const latest = new Map<string, NonNullable<ConversationWorkflowSummary["eligiblePlans"]>[number]>();
    for (const p of context.eligiblePlans ?? []) {
      if (explicit && p.planId !== explicit) continue;
      if (!latest.has(p.runId) || latest.get(p.runId)!.planVersion < p.planVersion) latest.set(p.runId, p);
    }
    if (latest.size > 1) return result("AMBIGUOUS", "multiple-proposal-targets");
    const plan = [...latest.values()][0];
    if (!plan) return result("UNAVAILABLE", "plan-not-eligible");
    return { route: "EXACT_PROPOSAL", reason: plan.proposalId ? "reuse-exact-proposal" : "prepare-exact-proposal", target: plan };
  }
  if (projectRecommendationRequest(text) || projectContentAnalysisRequest(text)) {
    if (!context.workspace) return result("UNAVAILABLE", "workspace-binding-required");
    if (workspaceFileReferences(text).some(path => /^(?:[a-z]:\/|\/)|(?:^|\/)\.\.(?:\/|$)/i.test(path)))
      return result("UNAVAILABLE", "workspace-relative-scope-required");
    // A current explicit source read must not be replaced by advice from an
    // older certified checkpoint whose files/scope may differ.
    if (projectContentAnalysisRequest(text) && workspaceFileReferences(text).length)
      return { route: "INSPECTION", reason: "explicit-project-source-review", inspectionInstruction: text };
    if (context.certifiedUnderstanding) return result("UNDERSTANDING", "certified-project-recommendation", context.certifiedUnderstanding.runId);
    if (projectContentAnalysisRequest(text)) return { route: "INSPECTION", reason: "project-content-prerequisite", inspectionInstruction: text };
    return { route: "INSPECTION", reason: "project-recommendation-prerequisite", inspectionInstruction:
      `Review the currently bound workspace project and recommend improvements. Current request: ${text}\nUse authorized root discovery and bounded source reads. Do not modify files or execute commands.` };
  }
  if (requestsWorkspaceVisibility(text)) return result("WORKSPACE", "saved-workspace-visibility");
  if (/^(?:read|inspect|analy[sz]e|review|اقر[اأ]|افحص|حلل|راجع)\s+/i.test(text.trim()) &&
    workspaceFileReferences(text).some(path => /^(?:[a-z]:\/|\/)|(?:^|\/)\.\.(?:\/|$)/i.test(path)))
    return result("UNAVAILABLE", "workspace-relative-scope-required");
  if (naturalReview(text) && !naturalWorkspaceRequest(text)?.concepts.length && !requestsConversationPlan(text) && !requestsConversationExecution(text) && !workspaceFileReferences(text).length) {
    if (!context.workspace) return result("UNAVAILABLE", "workspace-binding-required");
    const files = context.workspaceFiles ?? context.references?.filter(r => r.workspaceId === context.workspace!.workspaceId &&
      r.bindingVersion === context.workspace!.bindingVersion && r.runtimeId === context.workspace!.runtimeId &&
      r.runtimeFingerprint === context.workspace!.runtimeFingerprint).map(r => r.relativePath) ?? [];
    const target = reviewTarget(text, files, context.workspaceFilesTruncated);
    return target ? { route: "INSPECTION", reason: "bounded-natural-review", inspectionInstruction: `Read and analyze ${target}. Current review request: ${text}` }
      : result("AMBIGUOUS", "multiple-workspace-references");
  }
  // Explicit acceptance answers belong to the saved planning request, before
  // workspace keywords inside those answers can start another inspection.
  const acceptance = planningAcceptanceSection(text), planningContinuation = requestsPendingPlanningContinuation(text);
  if (acceptance || planningContinuation) {
    const pending = (context.pendingPlanning ?? []).filter(p => planningContinuation ? p.missingInformationIds.length > 0 : p.missingInformationIds.includes("success-criteria"));
    if (context.truncated && (pending.length || context.latestPlan?.readiness === "PLAN_NOT_READY")) return result("AMBIGUOUS", "workflow-context-truncated");
    if (pending.length > 1) return result("AMBIGUOUS", "multiple-pending-planning-requests");
    if (pending.length === 1) {
      // Continuation controls select the saved workflow; they are not new plan
      // constraints. The planning service retrieves bounded, explicit prior criteria.
      let information;
      try { information = planningContinuation ? currentPlanningInformation(text) : null; }
      catch { return result("UNAVAILABLE", "planning-continuation-information-invalid"); }
      const p = pending[0], instruction = information ? continuationObjective(p.objective, information) : acceptance ? `${p.objective}\n\n${acceptance}` : p.objective;
      if (instruction.length > 4000) return result("UNAVAILABLE", "planning-context-too-large");
      return { route: "PLANNING", reason: "pending-planning-information", target: { runId: p.sourceRunId }, planningInstruction: instruction,
        ...(information ? { planningContinuationMessage: text } : {}) };
    }
    if (planningContinuation || context.latestPlan?.readiness === "PLAN_NOT_READY") return result("UNAVAILABLE", "planning-information-target-unavailable");
  }
  if (/^نف[ّ]?ذ[.!؟?\s]*$/.test(text.trim())) {
    if (context.truncated) return result("AMBIGUOUS", "workflow-context-truncated");
    const targets = [...new Set([
      ...context.activeInspections, ...(context.eligiblePlans ?? []), ...context.pendingApprovals,
      ...(context.execution && !["COMPLETED", "FAILED", "CANCELLED"].includes(context.execution.status) ? [context.execution] : [])
    ].map(workflow => workflow.runId))];
    if (targets.length > 1) return result("AMBIGUOUS", "multiple-pending-workflows");
    if (!targets.length) return result("CONVERSATION", "no-pending-workflow");
    // Show the saved target's state. This continuation never dispatches execution.
    return result("UNDERSTANDING", "persisted-workflow-state", targets[0]);
  }
  const proceed = /^(?:please\s+)?(?:proceed|تمام|اعملها)(?:\s+with\s+plan\s+([A-Za-z0-9_-]{1,128}))?[.!؟?\s]*$/i.exec(text.trim());
  if (proceed) {
    if (context.truncated) return result("AMBIGUOUS", "workflow-context-truncated");
    const plans = [...new Map((context.eligiblePlans ?? []).map(p => [p.planId, p])).values()];
    const matches = proceed[1] ? plans.filter(p => p.planId === proceed[1]) : plans;
    if (matches.length > 1 || (!proceed[1] && matches.length && context.pendingApprovals.some(a => a.runId !== matches[0].runId))) return result("AMBIGUOUS", "multiple-proposal-targets");
    if (matches.length === 1 && matches[0].proposalId && !proceed[1]) {
      const pending = [...new Map(context.pendingApprovals.filter(a => a.runId === matches[0].runId).map(a => [a.approvalId ?? a.runId, a])).values()];
      if (pending.length > 1) return result("AMBIGUOUS", "multiple-pending-approvals");
      if (pending.length === 1) return { route: "APPROVAL_GUIDANCE", reason: "explicit-controls-required", target: pending[0] };
    }
    if (matches.length === 1) return { route: "EXACT_PROPOSAL", reason: matches[0].proposalId ? "reuse-exact-proposal" : "prepare-exact-proposal", target: matches[0] };
    if (proceed[1]) return result("UNAVAILABLE", "plan-not-eligible");
    if (!context.pendingApprovals.length) return result("CONVERSATION", "no-ready-plan");
  }
  const approvalLanguage = /^(?:please\s+)?(?:I\s+)?(?:approve|allow once|grant approval|وافق)(?:\s+(?:(?:the|that|this)\s+)?(?:pending\s+)?(?:proposal|action|change))?[.!؟?\s]*$/i.test(text.trim());
  if (approvalLanguage || (isConversationAcknowledgment(text) && (context.pendingApprovals.length || context.truncated))) {
    if (context.truncated) return result("AMBIGUOUS", "workflow-context-truncated");
    const approvals = [...new Map(context.pendingApprovals.map(a => [a.approvalId ?? a.runId, a])).values()];
    if (approvals.length > 1) return result("AMBIGUOUS", "multiple-pending-approvals");
    if (!approvals.length) return result("CONVERSATION", "no-pending-proposal");
    return { route: "APPROVAL_GUIDANCE", reason: "explicit-controls-required", target: approvals[0] };
  }
  if (/^(?:what happened to|what is the status of)\s+(?:(?:that|this|the)\s+)?(?:pending\s+)?(?:proposal|workflow|change)[?!.\s]*$/i.test(text.trim())) {
    if (context.truncated) return result("AMBIGUOUS", "workflow-context-truncated");
    const candidates = context.workflows ?? [context.latestPlan, context.execution, ...context.pendingApprovals].filter((x): x is {runId:string} => !!x);
    const targets = [...new Set(candidates.map(c => c.runId))];
    if (targets.length > 1) return result("AMBIGUOUS", "multiple-proposal-workflows");
    if (!targets.length) return result("CONVERSATION", "unknown-proposal-reference");
    return result("UNDERSTANDING", "persisted-workflow-state", targets[0]);
  }
  if (compatibility.transferToAgent) return result("PLANNING", "compatibility-handoff");
  if (requestsPlanHandoff(text)) return result("PLAN_EXECUTION", "explicit-plan-execution-request", context.latestPlan?.runId);
  if (requestsProjectUnderstanding(text)) return context.workspace
    ? { route: "INSPECTION", reason: "bound-project-discovery", inspectionInstruction: `Read and understand the currently bound workspace project. Current request: ${text}\nUse authorized root discovery and bounded source reads. Do not modify files or execute commands.` }
    : result("UNAVAILABLE", "workspace-binding-required");
  const natural = naturalWorkspaceRequest(text);
  if (natural) {
    if (!context.workspace) return result("UNAVAILABLE", "workspace-binding-required");
    if (context.truncated || context.referencesTruncated) return result("AMBIGUOUS", "workspace-reference-context-truncated");
    const concepts = natural.concepts.length ? natural.concepts : context.recentConcepts ?? [];
    if (concepts.length > 1 || (!concepts.length && natural.anaphora)) return result("AMBIGUOUS", "workspace-reference-required");
    const all = (context.references ?? []).filter(r => concepts.includes(r.concept));
    if ((context.references?.length ?? 0) > REFERENCE_LIMIT) return result("AMBIGUOUS", "workspace-reference-context-truncated");
    const boundCandidates = all.filter(r => r.workspaceId === context.workspace!.workspaceId && r.bindingVersion === context.workspace!.bindingVersion &&
      r.runtimeId === context.workspace!.runtimeId && r.runtimeFingerprint === context.workspace!.runtimeFingerprint);
    if (!boundCandidates.length && all.length) return result("UNAVAILABLE", "workspace-reference-binding-changed");
    const heroHeading = concepts[0] === "hero" && /\b(?:heading|title)\b|عنوان/i.test(text);
    const candidates = heroHeading ? boundCandidates.filter(r => r.certified && r.targetKind === "HEADING") : boundCandidates;
    if (candidates.length > 1) return result("AMBIGUOUS", "multiple-workspace-references");
    if (!candidates.length && natural.anaphora) return result("AMBIGUOUS", "source-backed-reference-required");
    const reference = candidates[0];
    if (natural.modification && reference?.certified) return { route: "PLANNING", reason: "source-backed-modification", target: { runId: reference.runId }, reference };
    return { route: "INSPECTION", reason: reference ? "source-backed-inspection" : "workspace-concept-evidence-required", ...(reference ? { reference } : {}),
      ...(natural.modification ? { inspectionPlanningObjective: text } : {}),
      inspectionInstruction: `Read and analyze ${concepts[0]}${heroHeading ? " heading" : ""}${reference ? ` in ${reference.relativePath}` : " in the currently bound workspace"}. Use authorized discovery/search to locate relevant source; this concept is not a file path. Complete grounded understanding only. Do not create a modification plan or proposal. Do not modify any file or execute any write.` };
  }
  if (requestsConversationPlan(text) || requestsConversationExecution(text) || (/^(?:please\s+)?change\s+/i.test(text.trim()) && workspaceFileReferences(text).length === 1)) return result("PLANNING", "engineering-intent-requires-certified-plan", context.latestPlan?.runId);
  const continuation = /^(?:please\s+)?(?:continue|resume|go on|كم[ّ]?ل|تابع)(?:\s+(?:the\s+)?(?:inspection|analysis|understanding|الفحص|التحليل))?[.!؟?\s]*$/i.test(text.trim());
  if (continuation) {
    if (context.truncated) return result("AMBIGUOUS", "workflow-context-truncated");
    if (context.activeInspections.length > 1) return result("AMBIGUOUS", "multiple-active-inspections");
    if (context.activeInspections.length === 1) return result("INSPECTION_CONTINUATION", "unique-active-inspection", context.activeInspections[0].runId);
    const plans = context.eligiblePlans ?? [];
    if (plans.length > 1) return result("AMBIGUOUS", "multiple-proposal-targets");
    if (plans.length === 1) return { route: "EXACT_PROPOSAL", reason: "prepare-exact-proposal", target: plans[0] };
    return result("UNAVAILABLE", "no-active-inspection-to-continue");
  }
  if (/^[إا]يه رأيك في (?:المشروع|الكود)[؟?!.\s]*$/.test(text.trim())) return result("CONVERSATION", "workspace-opinion");
  if (/^[إا]يه الموجود في\s+/i.test(text.trim()) && workspaceFileReferences(text).length === 1) return result("INSPECTION", "bounded-file-question");
  if (requestsUnderstandingFollowup(text) && context.certifiedUnderstanding) return result("UNDERSTANDING", "certified-understanding-followup", context.certifiedUnderstanding.runId);
  if (requestsWorkspace(text)) return result("INSPECTION", "new-workspace-inspection");
  if (compatibility.triggerAgent || compatibility.runtimeEvidence) return result("INSPECTION", "explicit-legacy-inspection");
  return result("CONVERSATION", "ordinary-conversation");
}
