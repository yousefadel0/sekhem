import { readExactProposal } from "./change-selection";
import { RuntimeLedgerService } from "../trusted-runtime/runtime-ledger.service";
import { toolDigest } from "../agent-runtime/tools/tool-contract";
import { ServiceUnavailableException } from "@nestjs/common";
import type { SessionClaims } from "../auth/auth.dto";
import { projectConsent } from "./consent-presentation";
import { exactContinuationRunTx } from "../agent-runtime/execution/exact-proposal.service";
import type { DownstreamWorkflowView } from "./workflow-presentation.contract";
export type { DownstreamWorkflowView } from "./workflow-presentation.contract";

/** Read-only presentation. These fields are never admission or execution authority. */

export async function projectDownstreamWorkflow(db: any, run: any, conversation: any, now = Date.now(), claims?: SessionClaims): Promise<DownstreamWorkflowView | undefined> {
  if (!db.auditEvent?.findUnique) return undefined;
  const ledger = new RuntimeLedgerService(db);
  run = await exactContinuationRunTx(ledger, db, run);
  const plan = run.plans?.[0];
  if (!plan?.id) return undefined;
  let record;
  try { record = await readExactProposal(ledger, db, conversation.userId, conversation.id, plan.id); }
  catch (error) {
    if (error instanceof Error && ["CHANGE_SET_RECOMMENDATION_REJECTED", "CHANGE_SELECTION_STALE", "CHANGE_SET_CHANGED"].includes(error.message)) return undefined;
    throw error;
  }
  if (!record) return undefined;
  const p = record.payload;
  if (typeof p.proposalId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(p.proposalId) || p.version !== 1 ||
    typeof p.digest !== "string" || !/^[a-f0-9]{64}$/.test(p.digest)) throw new ServiceUnavailableException("RUNTIME_LEDGER_CORRUPT");
  const identity = plan.steps?.[0]?.parameters?.engineeringPlan;
  const workspace = conversation.metadata?.runtimeWorkspace;
  const { digest: proposalDigest, ...proposalBase } = p;
  const stale = !record.immutable || p.conversationId !== conversation.id || p.userId !== conversation.userId ||
    (p.continuationRunId !== undefined && p.continuationRunId !== run.id) ||
    (run.id?.startsWith("exact_plan_run_") && p.continuationRunId !== run.id) ||
    p.projectId !== conversation.projectId || p.planId !== plan.id || p.planVersion !== run.planVersion ||
    p.planDigest !== identity?.digest || p.status !== "EXACT_PROPOSAL_READY" || proposalDigest !== toolDigest(proposalBase) ||
    (workspace && (workspace.workspaceId !== p.workspace.workspaceId || workspace.bindingVersion !== p.workspace.bindingVersion));
  const view: DownstreamWorkflowView = { observedAt: now, proposal: { id: p.proposalId, version: p.version, digest: p.digest,
    revision: record.revision, state: stale ? "STALE" : "READY", planId: plan.id,
    verification: Array.isArray(p.actions) && p.actions.some((a: any) => a.tool === "filesystem.read" && /^[a-f0-9]{64}$/.test(a.expectedAfterHash ?? "")) ? ["Read-back and expected content hash comparison", "Exact-change preservation check"] : [],
    changes: Array.isArray(p.changes) ? p.changes.slice(0, 1).filter((c: any) => typeof c.path === "string" && c.path.length <= 1024 && typeof c.before === "string" && c.before.length <= 8192 && typeof c.after === "string" && c.after.length <= 8192).map((c: any) => ({ path: c.path, before: c.before, after: c.after })) : [], ...(stale ? { blocker: "PROPOSAL_BINDING_CHANGED" } : {}) } };
  const key = [conversation.userId, conversation.id, p.proposalId];
  const head = await ledger.read<any>(db, "EXACT_APPROVAL_HEAD", key);
  const generation = head?.payload.generation ?? 1;
  if (!Number.isSafeInteger(generation) || generation < 1 || generation > 10000) throw new ServiceUnavailableException("RUNTIME_LEDGER_CORRUPT");
  const approvalId = `exactapproval_${toolDigest(generation === 1 ? key : [...key, generation])}`;
  const approval = await db.agentApproval.findUnique({ where: { id: approvalId } });
  if (approval) {
    const b = approval.revisedPlan;
    const { fingerprint: decisionFingerprint, ...decisionBinding } = b ?? {};
    const changed = stale || decisionFingerprint !== toolDigest(decisionBinding) || typeof b?.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(b.fingerprint) || (head && (b.generation !== generation || b.requestId !== head.payload.requestId)) || (head && head.payload.approvalId !== approvalId) || approval.agentRunId !== run.id ||
      approval.approvalType !== "EXACT_PROPOSAL" || b?.proposalId !== p.proposalId || b?.proposalDigest !== p.digest ||
      b?.proposalVersion !== p.version || b?.planId !== p.planId || b?.planVersion !== p.planVersion || b?.planDigest !== p.planDigest ||
      b?.conversationId !== conversation.id || toolDigest(b?.workspace ?? null) !== toolDigest(p.workspace) || b?.sourceDigest !== p.sourceDigest ||
      b?.sourceRunId !== p.sourceRunId || b?.sourceSequence !== p.sourceSequence ||
      b?.sourceFingerprint !== toolDigest({ workspace: p.workspace, sourceRunId: p.sourceRunId, sourceSequence: p.sourceSequence,
        sourceDigest: p.sourceDigest, evidenceReferences: p.evidenceReferences });
    const deadline = approval.dueAt && Number.isFinite(+new Date(approval.dueAt)) ? new Date(approval.dueAt).toISOString() : null;
    const expired = !deadline || Date.parse(deadline) <= now;
    const state = changed || !["PENDING", "APPROVED", "DENIED", "CANCELLED", "EXPIRED"].includes(approval.status) ? "STALE" : expired && ["PENDING", "APPROVED", "EXPIRED"].includes(approval.status) ? "EXPIRED" : approval.status;
    view.approval = { id: approvalId, generation, revision: head?.revision ?? 1, state, deadline,
      actionable: state === "PENDING", ...(!changed ? { fingerprint: b.fingerprint } : {}), ...(changed || expired ? { blocker: changed ? "APPROVAL_BINDING_CHANGED" : "APPROVAL_EXPIRED" } : {}) };
  }
  view.consent = await projectConsent(db, p, plan, approval?.revisedPlan?.taskConsent, claims, stale);
  if (view.consent.selected && view.consent.selected.state !== "ACTIVE" && view.approval && ["PENDING", "APPROVED"].includes(view.approval.state)) {
    view.approval = { ...view.approval, state: "STALE", actionable: false, blocker: view.consent.selected.reasons[0] };
  }
  const permitHead = await ledger.read<any>(db, "EXACT_PERMIT_HEAD", key);
  const permitGeneration = permitHead?.payload.generation ?? 1;
  if (!Number.isSafeInteger(permitGeneration) || permitGeneration < 1 || permitGeneration > 10000) throw new ServiceUnavailableException("RUNTIME_LEDGER_CORRUPT");
  const permit = await ledger.read<any>(db, "EXACT_EXECUTION_PERMIT", permitGeneration === 1 ? key : [...key, permitGeneration]);
  if (permit) {
    const value = permit.payload;
    if (typeof value.permitId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.permitId)) throw new ServiceUnavailableException("RUNTIME_LEDGER_CORRUPT");
    const consumed = await ledger.read(db, "EXACT_PERMIT_CONSUMPTION", value.permitId);
    const changed = stale || (permitHead && permitHead.payload.permitId !== value.permitId) ||
      value.binding?.proposalDigest !== p.digest || value.binding?.approvalId !== approvalId ||
      (value.binding?.generation ?? 1) !== generation;
    const state = consumed ? "CONSUMED" : changed ? "STALE" : !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= now ? "EXPIRED" : "UNUSED";
    view.permit = { id: value.permitId, generation: permitGeneration, revision: permitHead?.revision ?? permit.revision,
      state, deadline: Number.isFinite(Date.parse(value.expiresAt)) ? new Date(value.expiresAt).toISOString() : "", ...(state === "STALE" || state === "EXPIRED" ? { blocker: `PERMIT_${state}` } : {}) };
  }
  return view;
}
