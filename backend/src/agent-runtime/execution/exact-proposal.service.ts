import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import type { SessionClaims } from "../../auth/auth.dto";
import { AiGatewayService } from "../../ai-gateway/ai-gateway.service";
import { WorkspaceRuntimeEvidenceService } from "../../workspace-intelligence/workspace-runtime-evidence.service";
import { RuntimeLedgerService } from "../../trusted-runtime/runtime-ledger.service";
import { AgentInspectionService } from "../inspection/agent-inspection.service";
import { isRecord, toolDigest, validToolId } from "../tools/tool-contract";
import type { AgentPlanningResult } from "../understanding/agent-understanding.types";
import { prepareExactActions } from "./exact-plan-proposal";
import type { ExactPlanAction } from "./plan-execution-state";
import { changeSetForPlan, selectionHead, assertRecommendation, readExactProposal } from "../../conversation/change-selection";
import { createHash } from "node:crypto";
import { runtimeInput } from "../../trusted-runtime/runtime.contract";
import { workspaceTarget } from "../../workspace-intelligence/workspace-runtime.contract";
import { heroConstrainedResult } from "../understanding/hero-title-constraint";

/** Shared immutable plan admission; proposal preparation grants no execution authority. */
export function validateExactPlan(run: any, plan: any, fresh: any, claims: SessionClaims, conversationId: string): AgentPlanningResult {
  const identity = plan?.steps?.[0]?.parameters?.engineeringPlan, result = plan?.steps?.[0]?.parameters?.planning;
  if (!run || run.conversationId !== conversationId || run.userId !== claims.sub || run.projectId !== fresh.conversation.projectId ||
    !plan || plan.version !== run.planVersion || plan.status !== "PLAN_READY" || !identity || !result?.plan?.validation?.valid || result.plan.readiness !== "PLAN_READY") throw new ConflictException("PLAN_READY_REQUIRED");
  const { digest, ...base } = identity;
  if (identity.executionEnabled !== false || identity.planId !== plan.id || identity.planVersion !== plan.version ||
    digest !== toolDigest({ ...base, summary: plan.summary, result }) || identity.sourceRunId !== fresh.sourceRunId ||
    identity.sourceConversationId !== fresh.sourceConversationId || identity.understandingDigest !== fresh.digest ||
    identity.understandingSequence !== fresh.checkpoint.sequence || toolDigest(identity.evidenceReferences) !== toolDigest(fresh.references) ||
    toolDigest(identity.workspace) !== toolDigest({ workspaceId: fresh.binding.workspaceId, bindingVersion: fresh.binding.version,
      runtimeId: fresh.binding.runtimeId, runtimeFingerprint: fresh.binding.runtimeFingerprint })) throw new ConflictException("PLAN_SOURCE_CHANGED");
  return result;
}

const continuationId = (userId: string, conversationId: string, planId: string) => `exact_plan_run_${toolDigest([userId, conversationId, planId])}`;

/** Resolve the real persisted run; a historical plan is never retargeted or copied. */
export async function exactPlanRunTx(ledger: RuntimeLedgerService, tx: any, plan: any, claims: SessionClaims, conversationId: string, create = false) {
  if (!plan) throw new ConflictException("PLAN_READY_REQUIRED");
  const original = await tx.agentRun.findUnique({ where: { id: plan.agentRunId } });
  if (!original || original.userId !== claims.sub || original.conversationId !== conversationId) throw new ConflictException("PLAN_RUN_PROVENANCE_CHANGED");
  const id = continuationId(claims.sub, conversationId, plan.id), identity = plan.steps?.[0]?.parameters?.engineeringPlan;
  const parts = [claims.sub, conversationId, plan.id];
  const base = { runId: id, originalRunId: original.id, userId: claims.sub, organizationId: claims.organizationId,
    conversationId, projectId: original.projectId, planId: plan.id, planVersion: plan.version, planDigest: identity?.digest,
    stepsDigest: toolDigest(plan.steps), sourceRunId: identity?.sourceRunId, sourceSequence: identity?.understandingSequence,
    sourceDigest: identity?.understandingDigest, workspace: identity?.workspace };
  const prior = await ledger.read<any>(tx, "EXACT_PLAN_CONTINUATION", parts);
  if (prior) {
    const run = await tx.agentRun.findUnique({ where: { id } });
    if (!prior.immutable || toolDigest(prior.payload) !== toolDigest(base) || !run || run.userId !== claims.sub ||
      run.conversationId !== conversationId || run.projectId !== original.projectId || run.planVersion !== plan.version)
      throw new ConflictException("PLAN_RUN_PROVENANCE_CHANGED");
    return run;
  }
  if (original.planVersion === plan.version) return original;
  if (!create) throw new ConflictException("PLAN_READY_REQUIRED");
  if (!Number.isSafeInteger(original.planVersion) || original.planVersion < plan.version || plan.status !== "PLAN_READY" ||
    identity?.planId !== plan.id || identity?.planVersion !== plan.version || !plan.steps?.[0]?.parameters?.planning?.plan?.validation?.valid ||
    !["COMPLETED", "FAILED"].includes(original.status)) throw new ConflictException("PLAN_READY_REQUIRED");
  // Creation is inside the admission transaction: any source/plan validation
  // failure rolls back both the new run and its immutable lineage record.
  const run = await tx.agentRun.create({ data: { id, userId: claims.sub, conversationId, projectId: original.projectId,
    agentName: original.agentName ?? "SekhemEngineer", title: `Exact proposal continuation · Plan ${plan.version}`,
    status: "COMPLETED", planVersion: plan.version, progressPercent: 0, completedAt: new Date() } });
  await ledger.create(tx, "EXACT_PLAN_CONTINUATION", parts, base, { immutable: true });
  await tx.agentRunEvent.create({ data: { id: `${id}_provenance`, agentRunId: id, eventType: "PLAN_CONTINUATION_CREATED", actor: claims.sub,
    payload: { ...base, executionPerformed: false } } });
  return run;
}

/** Read-only relation projection for a continuation with no physical plan FK. */
export async function exactContinuationRunTx(ledger: RuntimeLedgerService, tx: any, run: any) {
  if (!run?.id?.startsWith("exact_plan_run_")) return run;
  const event = await tx.agentRunEvent.findUnique({ where: { id: `${run.id}_provenance` } });
  const p = event?.payload;
  if (!p || event.agentRunId !== run.id || event.eventType !== "PLAN_CONTINUATION_CREATED") throw new ConflictException("PLAN_RUN_PROVENANCE_CHANGED");
  const plan = await tx.agentPlan.findUnique({ where: { id: p.planId } });
  const resolved = await exactPlanRunTx(ledger, tx, plan, { sub: run.userId, organizationId: p.organizationId } as SessionClaims, run.conversationId);
  if (resolved.id !== run.id) throw new ConflictException("PLAN_RUN_PROVENANCE_CHANGED");
  const record = await ledger.read<any>(tx, "EXACT_PLAN_CONTINUATION", [run.userId, run.conversationId, plan.id]);
  if (!record || toolDigest(p) !== toolDigest({ ...record.payload, executionPerformed: false })) throw new ConflictException("PLAN_RUN_PROVENANCE_CHANGED");
  return { ...run, plans: [plan] };
}

export interface ExactProposal {
  changeReview?: { changeSetId: string; changeSetVersion: number; changeSetDigest: string; selectedRevision: number; selectedDigest: string; changeIds: string[]; previousProposalId?: string };
  continuationRunId?: string;
  version: 1; proposalId: string; digest: string; status: "EXACT_PROPOSAL_READY";
  conversationId: string; userId: string; organizationId: string; projectId: string;
  planId: string; planVersion: number; planDigest: string; requestDigest: string;
  sourceRunId: string; sourceSequence: number; sourceDigest: string;
  workspace: { workspaceId: string; bindingVersion: number; runtimeId: string; runtimeFingerprint: string };
  evidenceReferences: any[];
  artifacts: Array<{ stepId: string; artifactId: string; dependencies: string[] }>;
  actions: ExactPlanAction[];
  changes: Array<{ path: string; before: string; after: string; originalHash: string; updatedHash: string }>;
  authorization: "NOT_GRANTED"; executionEnabled: false;
}

export function validateExactProposal(proposal: ExactProposal, plan: any, fresh: any, claims: SessionClaims, conversationId: string) {
  const { digest, ...base } = proposal;
  if (digest !== toolDigest(base) || proposal.status !== "EXACT_PROPOSAL_READY" || proposal.authorization !== "NOT_GRANTED" || proposal.executionEnabled !== false ||
    proposal.conversationId !== conversationId || proposal.userId !== claims.sub || proposal.organizationId !== claims.organizationId ||
    proposal.planId !== plan.id || proposal.planVersion !== plan.version || proposal.planDigest !== plan.steps[0].parameters.engineeringPlan.digest ||
    proposal.sourceRunId !== fresh.sourceRunId || proposal.sourceSequence !== fresh.checkpoint.sequence || proposal.sourceDigest !== fresh.digest ||
    toolDigest(proposal.workspace) !== toolDigest(plan.steps[0].parameters.engineeringPlan.workspace) || toolDigest(proposal.evidenceReferences) !== toolDigest(fresh.references)) throw new ConflictException("EXACT_PROPOSAL_SOURCE_CHANGED");
}

@Injectable()
export class ExactProposalService {
  constructor(@Inject(RuntimeLedgerService) private readonly ledger: RuntimeLedgerService,
    @Inject(AgentInspectionService) private readonly inspections: AgentInspectionService,
    @Inject(AiGatewayService) private readonly gateway: AiGatewayService,
    @Inject(WorkspaceRuntimeEvidenceService) private readonly evidence: WorkspaceRuntimeEvidenceService) {}

  /** Reuse revalidates the immutable artifact without changing endpoint replay semantics. */
  async continuePlan(conversationId: string, claims: SessionClaims, body: unknown) {
    return this.prepare(conversationId, claims, body, true);
  }
  async prepare(conversationId: string, claims: SessionClaims, body: unknown, reuse = false): Promise<ExactProposal> {
    if (!isRecord(body) || Object.keys(body).sort().join(",") !== "planDigest,planId,planVersion,requestId" ||
      !validToolId(body.planId) || !validToolId(body.requestId) || !Number.isSafeInteger(body.planVersion) || Number(body.planVersion) < 1 ||
      typeof body.planDigest !== "string" || !/^[a-f0-9]{64}$/.test(body.planDigest)) throw new BadRequestException("EXACT_PROPOSAL_REQUEST_INVALID");
    const review = await this.ledger.transaction(tx => changeSetForPlan(this.ledger, tx, claims.sub, conversationId, String(body.planId)));
    if (review) return this.prepareSelected(conversationId, claims, body, reuse);
    const key = [claims.sub, conversationId, body.planId], requestDigest = toolDigest(body);
    const admit = async (tx: any) => {
      const fresh = await this.inspections.certifiedPlanningSourceTx(tx, claims, conversationId);
      const plan = await tx.agentPlan.findUnique({ where: { id: body.planId } });
      const existing = await this.ledger.read<ExactProposal>(tx, "EXACT_PROPOSAL", key);
      const run = await exactPlanRunTx(this.ledger, tx, plan, claims, conversationId, !existing);
      if (existing && existing.payload.continuationRunId !== (run.id !== plan.agentRunId ? run.id : undefined)) throw new ConflictException("PLAN_RUN_PROVENANCE_CHANGED");
      const result = validateExactPlan(run, plan, fresh, claims, conversationId);
      if (plan.version !== body.planVersion || plan.steps[0].parameters.engineeringPlan.digest !== body.planDigest) throw new ConflictException("PLAN_SOURCE_CHANGED");
      return { fresh, plan, run, result };
    };
    const admitted = await this.ledger.transaction(async tx => {
      const source = await admit(tx), prior = await this.ledger.read<ExactProposal>(tx, "EXACT_PROPOSAL", key);
      if (prior) {
        validateExactProposal(prior.payload, source.plan, source.fresh, claims, conversationId);
        if (!reuse && prior.payload.requestDigest !== requestDigest) throw new ConflictException("EXACT_PROPOSAL_REQUEST_CONFLICT");
      }
      return { ...source, prior };
    });
    for (const reference of admitted.fresh.references) await this.evidence.admit(claims, admitted.fresh.conversation.projectId, admitted.fresh.sourceConversationId, reference);
    if (admitted.prior) return admitted.prior.payload;
    const actions = await prepareExactActions({ gateway: this.gateway, evidence: this.evidence }, claims, admitted.fresh, admitted.result);
    // Re-admission owns its own ledger transaction; keep it outside the final lock.
    for (const reference of admitted.fresh.references) await this.evidence.admit(claims, admitted.fresh.conversation.projectId, admitted.fresh.sourceConversationId, reference);
    return this.ledger.transaction(async tx => {
      const { fresh, plan, run, result } = await admit(tx);
      if (fresh.digest !== admitted.fresh.digest || toolDigest(plan.steps) !== toolDigest(admitted.plan.steps)) throw new ConflictException("EXACT_PROPOSAL_SOURCE_CHANGED");
      const prior = await this.ledger.read<ExactProposal>(tx, "EXACT_PROPOSAL", key);
      if (prior) {
        validateExactProposal(prior.payload, plan, fresh, claims, conversationId);
        if (!reuse && prior.payload.requestDigest !== requestDigest) throw new ConflictException("EXACT_PROPOSAL_REQUEST_CONFLICT");
        return prior.payload;
      }
      const proposalId = `exact_proposal_${toolDigest(key)}`;
      const base = { version: 1 as const, proposalId, status: "EXACT_PROPOSAL_READY" as const, conversationId, userId: claims.sub,
        ...(run.id !== plan.agentRunId ? { continuationRunId: run.id } : {}),
        organizationId: claims.organizationId!, projectId: run.projectId, planId: plan.id, planVersion: plan.version, planDigest: String(body.planDigest), requestDigest,
        sourceRunId: fresh.sourceRunId, sourceSequence: fresh.checkpoint.sequence, sourceDigest: fresh.digest,
        workspace: plan.steps[0].parameters.engineeringPlan.workspace, evidenceReferences: fresh.references,
        artifacts: result.plan.steps.filter(s => s.type === "PROPOSE" && s.effect === "READ_ONLY").map(s => ({ stepId: s.id, artifactId: proposalId, dependencies: s.dependencies })),
        actions, changes: actions.flatMap(a => a.change ? [{ path: a.relativePath, ...a.change }] : []), authorization: "NOT_GRANTED" as const, executionEnabled: false as const };
      const proposal: ExactProposal = { ...base, digest: toolDigest(base) };
      await this.ledger.create(tx, "EXACT_PROPOSAL", key, proposal, { immutable: true });
      await tx.agentRunEvent.create({ data: { id: proposalId, agentRunId: run.id, eventType: "EXACT_PROPOSAL_READY", actor: claims.sub,
        payload: { proposalId, digest: proposal.digest, planId: plan.id, planVersion: plan.version, executionPerformed: false } } });
      await tx.conversationMessage.create({ data: { id: `${proposalId}_result`, conversationId, senderId: "agent", senderType: "assistant",
        content: `EXACT_PROPOSAL_READY · ${proposalId}\n` + proposal.changes.map(c => `${c.path}\nBefore:\n${c.before}\nAfter:\n${c.after}`).join("\n") + "\nAuthorization NOT_GRANTED. No operation executed.",
        metadata: { exactProposalId: proposalId, exactProposalDigest: proposal.digest, planId: plan.id, planVersion: plan.version, executionPerformed: false } } });
      await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      return proposal;
    });
  }

  private async prepareSelected(conversationId: string, claims: SessionClaims, body: any, reuse: boolean): Promise<ExactProposal> {
    const admit = async (tx: any) => {
      const set = await changeSetForPlan(this.ledger, tx, claims.sub, conversationId, body.planId);
      if (!set || set.organizationId !== claims.organizationId || set.plan.version !== body.planVersion || set.plan.digest !== body.planDigest) throw new ConflictException("CHANGE_SET_CHANGED");
      const fresh = await this.inspections.certifiedPlanningSourceTx(tx, claims, conversationId, set.source.runId);
      const plan = await tx.agentPlan.findUnique({ where: { id: set.plan.id } });
      const run = await exactPlanRunTx(this.ledger, tx, plan, claims, conversationId, true);
      const result = validateExactPlan(run, plan, fresh, claims, conversationId);
      if (fresh.digest !== set.source.digest || fresh.checkpoint.sequence !== set.source.sequence || fresh.checkpoint.version !== set.source.version ||
        toolDigest(set.workspace) !== toolDigest(plan.steps[0].parameters.engineeringPlan.workspace)) throw new ConflictException("CHANGE_SET_SOURCE_CHANGED");
      await assertRecommendation(tx, set);
      const head = await selectionHead(this.ledger, tx, set);
      if (!head || !head.payload.keptChangeIds.length) throw new ConflictException("CHANGE_SELECTION_KEEP_REQUIRED");
      const selection = head.payload;
      const kept = set.changes.filter(c => selection.decisions[c.id] === "KEEP");
      if (toolDigest(kept.map(c => c.id)) !== toolDigest(selection.keptChangeIds)) throw new ConflictException("CHANGE_SELECTION_STALE");
      const prior = await readExactProposal(this.ledger, tx, claims.sub, conversationId, plan.id);
      if (prior) { validateExactProposal(prior.payload, plan, fresh, claims, conversationId); if (!reuse && prior.payload.requestDigest !== toolDigest(body)) throw new ConflictException("EXACT_PROPOSAL_REQUEST_CONFLICT"); }
      return { set, selection, kept, fresh, plan, run, result, prior };
    };
    const a = await this.ledger.transaction(admit);
    for (const reference of a.fresh.references) await this.evidence.admit(claims, a.fresh.conversation.projectId, a.fresh.sourceConversationId, reference);
    if (a.prior) return a.prior.payload;
    const paths = [...new Set(a.kept.map(c => c.path))];
    const steps = a.result.plan.steps.filter(s => !(s.type === "PROPOSE" && s.effect === "READ_ONLY"));
    const writes = steps.filter(s => s.type === "IMPLEMENT" && s.effect === "WRITE"), reads = steps.filter(s => s.type === "VERIFY" && s.effect === "READ_ONLY");
    if (paths.length !== 1 || writes.length !== 1 || reads.length !== 1 || steps.length !== 2 ||
      ![writes[0], reads[0]].every(step => { const scope = a.result.understanding.scope.filter(s => step.scopeRefs.includes(s.id) && s.kind === "EVIDENCE"); return scope.length > 0 && scope.every(s => s.reference === paths[0]); })) throw new ConflictException("CHANGE_SELECTION_PLAN_SCOPE_UNSUPPORTED");
    let source: string | undefined;
    for (const ref of a.fresh.references.filter(r => r.relativePath === paths[0] && !r.truncated)) {
      const admitted = await this.evidence.admit(claims, a.fresh.conversation.projectId, a.fresh.sourceConversationId, ref);
      if (admitted.operation?.tool !== "filesystem.read" || admitted.reference.truncated || typeof admitted.file.text !== "string") continue;
      if (a.kept.every(c => (c.evidenceRef === `runtime:${ref.receiptId}` || c.evidenceRef === ref.receiptId) && c.beforeSha256 === createHash("sha256").update(admitted.file.text).digest("hex"))) source = admitted.file.text;
    }
    if (source === undefined) throw new ConflictException("CHANGE_SET_EXACT_EVIDENCE_REQUIRED");
    const ordered = [...a.kept].sort((x, y) => x.start - y.start);
    for (let i = 0; i < ordered.length; i++) {
      const c = ordered[i];
      if (!Number.isSafeInteger(c.start) || !Number.isSafeInteger(c.end) || c.start < 0 || c.end < c.start || c.end > source.length || source.slice(c.start, c.end) !== c.before ||
        i > 0 && (ordered[i - 1].end > c.start || ordered[i - 1].start === c.start)) throw new ConflictException("CHANGE_SELECTION_RANGE_INVALID");
    }
    let after = source;
    for (const c of [...ordered].reverse()) after = after.slice(0, c.start) + c.after + after.slice(c.end);
    for (const constraint of a.result.plan.constraints.filter(c => c.rule === "HERO_TITLE_TEXT_ONLY"))
      if (!constraint.textChange || heroConstrainedResult(source, constraint.textChange) !== after) throw new ConflictException("HERO_SCOPE_VIOLATION");
    const hash = (s: string) => createHash("sha256").update(s).digest("hex"), originalHash = hash(source), updatedHash = hash(after);
    const start = ordered[0].start, end = ordered.at(-1)!.end, before = source.slice(start, end);
    const proposed = after.slice(start, after.length - (source.length - end));
    if (before.length + proposed.length > 8192 || originalHash === updatedHash) throw new ConflictException("CHANGE_SELECTION_RANGE_INVALID");
    const path = workspaceTarget(a.fresh.binding.rootPath, paths[0]);
    const actions: ExactPlanAction[] = [{ stepId: writes[0].id, tool: "filesystem.write", relativePath: path.relativePath,
      input: runtimeInput("filesystem.write", { path: path.absolutePath, content: after, expectedSha256: originalHash }), expectedAfterHash: updatedHash,
      change: { before, after: proposed, originalHash, updatedHash } }, { stepId: reads[0].id, tool: "filesystem.read", relativePath: path.relativePath,
      input: runtimeInput("filesystem.read", { path: path.absolutePath }), expectedAfterHash: updatedHash }];
    return this.ledger.transaction(async tx => {
      const b = await admit(tx);
      if (b.selection.digest !== a.selection.digest || b.set.digest !== a.set.digest || b.fresh.digest !== a.fresh.digest) throw new ConflictException("CHANGE_SELECTION_STALE");
      if (b.prior) return b.prior.payload;
      const key = [claims.sub, conversationId, b.plan.id, b.set.id, b.selection.revision], proposalId = `exact_proposal_${toolDigest(key)}`;
      const base = { version: 1 as const, proposalId, status: "EXACT_PROPOSAL_READY" as const, conversationId, userId: claims.sub, organizationId: claims.organizationId!, projectId: b.run.projectId,
        ...(b.run.id !== b.plan.agentRunId ? { continuationRunId: b.run.id } : {}), planId: b.plan.id, planVersion: b.plan.version, planDigest: body.planDigest, requestDigest: toolDigest(body),
        sourceRunId: b.fresh.sourceRunId, sourceSequence: b.fresh.checkpoint.sequence, sourceDigest: b.fresh.digest, workspace: b.set.workspace, evidenceReferences: b.fresh.references,
        artifacts: b.result.plan.steps.filter(s => s.type === "PROPOSE" && s.effect === "READ_ONLY").map(s => ({ stepId: s.id, artifactId: proposalId, dependencies: s.dependencies })),
        actions, changes: [{ path: paths[0], before, after: proposed, originalHash, updatedHash }], authorization: "NOT_GRANTED" as const, executionEnabled: false as const,
        changeReview: { changeSetId: b.set.id, changeSetVersion: b.set.version, changeSetDigest: b.set.digest, selectedRevision: b.selection.revision,
          selectedDigest: b.selection.digest, changeIds: b.selection.keptChangeIds, ...(b.set.proposal ? { previousProposalId: b.set.proposal.id } : {}) } };
      const proposal: ExactProposal = { ...base, digest: toolDigest(base) };
      await this.ledger.create(tx, "EXACT_PROPOSAL", key, proposal, { immutable: true });
      await this.ledger.create(tx, "CHANGE_SELECTED_PROPOSAL", [claims.sub, conversationId, b.plan.id], { key, revision: b.selection.revision, digest: b.selection.digest }, { immutable: true });
      await tx.agentRunEvent.create({ data: { id: proposalId, agentRunId: b.run.id, eventType: "EXACT_PROPOSAL_READY", actor: claims.sub, payload: { proposalId, digest: proposal.digest, planId: b.plan.id, planVersion: b.plan.version, executionPerformed: false, changeReview: proposal.changeReview } } });
      await tx.conversationMessage.create({ data: { id: `${proposalId}_result`, conversationId, senderId: "agent", senderType: "assistant", content: "Exact proposal ready from kept changes. Human approval is still required. Nothing was executed.", metadata: { exactProposalId: proposalId, exactProposalDigest: proposal.digest, planId: b.plan.id, planVersion: b.plan.version, executionPerformed: false } } });
      await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      return proposal;
    });
  }
}
