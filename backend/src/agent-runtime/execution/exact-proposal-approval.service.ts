import { readExactProposal } from "../../conversation/change-selection";
import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import type { SessionClaims } from "../../auth/auth.dto";
import { ResourceAuthorizationService } from "../../auth/resource-authz.service";
import { AuditService } from "../../audit/audit.service";
import { RuntimeIdentityService } from "../../trusted-runtime/runtime-identity.service";
import { RuntimeLedgerService } from "../../trusted-runtime/runtime-ledger.service";
import { WorkspaceRuntimeEvidenceService } from "../../workspace-intelligence/workspace-runtime-evidence.service";
import { AgentInspectionService } from "../inspection/agent-inspection.service";
import { isRecord, toolDigest, toolSubject, validToolId } from "../tools/tool-contract";
import { TOOL_APPROVAL_TTL_MS } from "../tools/tool-approval.service";
import { exactPlanRunTx, validateExactPlan, validateExactProposal, type ExactProposal } from "./exact-proposal.service";
import { TaskConsentService, type TaskConsentReference } from "../tools/task-consent.service";

/** Records a human decision about an artifact, never authorizes a tool operation. */
@Injectable()
export class ExactProposalApprovalService {
  constructor(@Inject(RuntimeLedgerService) private readonly ledger: RuntimeLedgerService,
    @Inject(AgentInspectionService) private readonly inspections: AgentInspectionService,
    @Inject(WorkspaceRuntimeEvidenceService) private readonly evidence: WorkspaceRuntimeEvidenceService,
    @Inject(RuntimeIdentityService) private readonly identity: RuntimeIdentityService,
    @Inject(ResourceAuthorizationService) private readonly resources: ResourceAuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService) {}

  async request(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown) {
    return this.apply(conversationId, proposalId, claims, body, false);
  }
  async decide(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown) {
    return this.apply(conversationId, proposalId, claims, body, true);
  }
  /** Resolve the current saved decision without requesting or deciding again. */
  async currentExactApproval(conversationId: string, proposalId: string, claims: SessionClaims, body: any) {
    return this.ledger.transaction(async tx => {
      const key = [claims.sub, conversationId, proposalId];
      const head = await this.ledger.read<any>(tx, "EXACT_APPROVAL_HEAD", key);
      const approvalId = this.generationId(key, head?.payload.generation ?? 1);
      const row = await tx.agentApproval.findUnique({ where: { id: approvalId } });
      if (!head && !row) return null;
      // Invalid, pending, revoked or expired saved decisions must never fall
      // back to creating a different approval request.
      const admitted = await this.approvedTx(tx, conversationId, proposalId, claims,
        { ...body, approvalId, ...(head ? { requestId: head.payload.requestId } : {}) });
      return { approvalId, status: admitted.approval.status, dueAt: admitted.approval.dueAt,
        generation: head?.payload.generation ?? 1, requestId: head?.payload.requestId,
        binding: admitted.binding, executionEnabled: false };
    });
  }
  private policies() { return new TaskConsentService(this.ledger, this.identity, this.resources); }
  async currentTaskConsent(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown) {
    return this.ledger.transaction(async tx => {
      const admitted = await this.admitTx(tx, conversationId, proposalId, claims, body, true);
      return this.policies().matchTx(tx, admitted.proposal);
    });
  }
  async readTaskConsent(conversationId: string, policyId: string, claims: SessionClaims, revoke = false) {
    if (!validToolId(policyId)) throw new BadRequestException("TASK_CONSENT_REQUEST_INVALID");
    return this.ledger.transaction(async tx => {
      const record = await this.ledger.read<any>(tx, "TASK_CONSENT", policyId);
      const p = record?.payload;
      if (!record || p.userId !== claims.sub || p.organizationId !== claims.organizationId || p.conversationId !== conversationId) throw new ConflictException("TASK_CONSENT_SCOPE_CHANGED");
      await this.identity.actor(tx, claims.sub, claims.organizationId!, p.projectId, { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
      const reference: TaskConsentReference = { policyId, generation: p.generation, digest: record.payloadDigest, expiresAt: p.expiresAt, consentedBy: p.consentedBy,
        ...(p.scope === "SESSION" ? { scope: "SESSION", session: p.session } : {}) };
      if (p.scope === "SESSION" && (claims.sessionId !== p.session.id || claims.iat !== p.session.issuedAt || claims.exp !== p.session.expiresAt)) throw new ConflictException("SESSION_CONSENT_SESSION_CHANGED");
      if (revoke) return this.policies().revokeTx(tx, claims, reference);
      const head = await this.ledger.read<any>(tx, "TASK_CONSENT_HEAD", this.policies().key(p));
      return { ...reference, planId: p.planId, planVersion: p.planVersion, planDigest: p.planDigest, workspaceId: p.workspaceId, bindingVersion: p.bindingVersion,
        status: head?.payload.policyId !== policyId ? "SUPERSEDED" : head.payload.status === "REVOKED" ? "REVOKED" : Date.parse(p.expiresAt) <= Date.now() ? "EXPIRED" : "ACTIVE", executionEnabled: false };
    });
  }
  async taskConsent(conversationId: string, proposalId: string, claims: SessionClaims, body: any, scope: "TASK" | "SESSION" = "TASK") {
    if (!isRecord(body) || Object.keys(body).sort().join(",") !== "durationSeconds,planId,proposalDigest,proposalVersion,requestId")
      throw new BadRequestException("TASK_CONSENT_REQUEST_INVALID");
    return this.ledger.transaction(async tx => {
      const admitted = await this.admitTx(tx, conversationId, proposalId, claims, body, true);
      return this.policies().createTx(tx, claims, admitted.proposal,
        await tx.agentPlan.findUnique({ where: { id: body.planId } }), admitted.fresh.binding.rootPath, body.requestId as string, body.durationSeconds as number, scope);
    });
  }
  async requestTaskApproval(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown) {
    if (!isRecord(body)) throw new BadRequestException("TASK_CONSENT_REQUEST_INVALID");
    const { consent: selected, ...request } = body;
    if (Object.prototype.hasOwnProperty.call(body, "consent") && !isRecord(selected)) throw new BadRequestException("TASK_CONSENT_REQUEST_INVALID");
    const consent = await this.ledger.transaction(async tx => {
      const admitted = await this.admitTx(tx, conversationId, proposalId, claims, request, true);
      const head = await this.ledger.read<any>(tx, "EXACT_APPROVAL_HEAD", [claims.sub, conversationId, proposalId]);
      const old = await tx.agentApproval.findUnique({ where: { id: this.generationId([claims.sub, conversationId, proposalId], head?.payload.generation ?? 1) } });
      const stored = old?.revisedPlan?.taskConsent;
      // Replays pin their selected consent. Fresh task-generation renewal retains
      // legacy behavior, but cannot silently switch to a SESSION policy.
      const pinned = selected ?? (stored?.scope === "SESSION" || stored && (!request.requestId || request.requestId === head?.payload.requestId) ? stored : undefined);
      let reference = await this.policies().selectTx(tx, admitted.proposal, claims, pinned as TaskConsentReference | undefined);
      if (!reference) reference = await this.policies().matchTx(tx, admitted.proposal);
      if (!selected && stored && reference?.scope !== stored.scope) throw new ConflictException("CONSENT_POLICY_SELECTION_REQUIRED");
      if (!reference) throw new ConflictException("TASK_CONSENT_EXPLICIT_ACTION_REQUIRED");
      return reference;
    });
    return this.apply(conversationId, proposalId, claims, request, false, consent);
  }
  private async apply(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown, deciding: boolean, consent?: TaskConsentReference) {
    const keys = deciding ? "approvalId,decision,fingerprint,planId,proposalDigest,proposalVersion" : "planId,proposalDigest,proposalVersion";
    if (!isRecord(body) || Object.keys(body).filter(k => deciding || k !== "requestId").sort().join(",") !== keys ||
      (!deciding && body.requestId !== undefined && !validToolId(body.requestId)) || !validToolId(proposalId) || !validToolId(body.planId) ||
      body.proposalVersion !== 1 || typeof body.proposalDigest !== "string" || !/^[a-f0-9]{64}$/.test(body.proposalDigest) ||
      (deciding && (!validToolId(body.approvalId) || typeof body.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(body.fingerprint) ||
        typeof body.decision !== "string" || !["APPROVED", "DENIED", "CANCELLED"].includes(body.decision)))) throw new BadRequestException("EXACT_APPROVAL_REQUEST_INVALID");
    const key = [claims.sub, conversationId, proposalId];
    const admit = (tx: any) => this.admitTx(tx, conversationId, proposalId, claims, body, false, consent);
    const initial = await this.ledger.transaction(admit);
    for (const ref of initial.fresh.references) await this.evidence.admit(claims, initial.fresh.conversation.projectId, initial.fresh.sourceConversationId, ref);
    return this.ledger.transaction(async tx => {
      const current = await admit(tx);
      if (toolDigest(current.binding) !== toolDigest(initial.binding)) throw new ConflictException("EXACT_PROPOSAL_SOURCE_CHANGED");
      let head = await this.ledger.read<any>(tx, "EXACT_APPROVAL_HEAD", key);
      let generation = head?.payload.generation ?? 1;
      let approvalId = this.generationId(key, generation);
      if (head && head.payload.approvalId !== approvalId) throw new ConflictException("EXACT_APPROVAL_CHANGED");
      let binding = this.generationBinding(current.binding, head?.payload);
      let row = await tx.agentApproval.findUnique({ where: { id: approvalId } });
      if (deciding && (!row || body.approvalId !== approvalId)) throw new ConflictException("EXACT_APPROVAL_REQUIRED");
      if (head && !row) throw new ConflictException("EXACT_APPROVAL_CHANGED");
      // A new explicitly consented policy generation replaces consent only.
      // Historical approval rows remain untouched; all artifact bindings match.
      let retiredConsent = false;
      const oldConsent = row?.revisedPlan?.taskConsent, newConsent = (binding as any).taskConsent;
      if (row && !deciding && body.requestId && newConsent && (!oldConsent || oldConsent.policyId !== newConsent.policyId)) {
        const old = oldConsent && await this.ledger.read<any>(tx, "TASK_CONSENT", oldConsent.policyId);
        const oldArtifact = omitFields(row.revisedPlan, ["fingerprint", "taskConsent"]);
        const newArtifact = omitFields(binding, ["fingerprint", "taskConsent"]);
        retiredConsent = (!oldConsent || (!!old?.immutable && old.payloadDigest === oldConsent.digest)) && toolDigest(oldArtifact) === toolDigest(newArtifact);
      }
      if (row && (row.approvalType !== "EXACT_PROPOSAL" || row.agentRunId !== current.run.id || row.requestedBy !== claims.sub ||
        (!retiredConsent && toolDigest(row.revisedPlan) !== toolDigest(binding)))) throw new ConflictException("EXACT_APPROVAL_CHANGED");
      if (!deciding && body.requestId) {
        const replay = await this.ledger.read<any>(tx, "EXACT_APPROVAL_GENERATION", [...key, body.requestId]);
        if (replay && replay.payload.approvalId !== approvalId) throw new ConflictException("EXACT_APPROVAL_SUPERSEDED");
      }
      if (!deciding && row) {
        const deadline = row.dueAt && +new Date(row.dueAt);
        if (!row.dueAt || !Number.isFinite(deadline)) throw new ConflictException("APPROVAL_EXPIRED");
        if (deadline <= Date.now() || row.status === "EXPIRED" || retiredConsent) {
          if (!body.requestId || head?.payload.requestId === body.requestId) throw new ConflictException("APPROVAL_EXPIRED");
          if (!["PENDING", "APPROVED", "EXPIRED"].includes(row.status)) throw new ConflictException("APPROVAL_ALREADY_DECIDED");
          generation++;
          if (!Number.isSafeInteger(generation) || generation > 10000) throw new ConflictException("EXACT_APPROVAL_GENERATION_LIMIT");
          approvalId = this.generationId(key, generation);
          const next = { generation, approvalId, requestId: body.requestId as string };
          binding = this.generationBinding(current.binding, next);
          await this.ledger.create(tx, "EXACT_APPROVAL_GENERATION", [...key, body.requestId], next, { immutable: true });
          head = head ? await this.ledger.update(tx, head, next) : await this.ledger.create(tx, "EXACT_APPROVAL_HEAD", key, next, { immutable: false });
          row = null; // The expired row remains untouched. New ID, new deadline, new decision.
        } else if (body.requestId && head && head.payload.requestId !== body.requestId) throw new ConflictException("EXACT_APPROVAL_REQUEST_CONFLICT");
      }
      if (!row) {
        const inherited = (binding as any).taskConsent as TaskConsentReference | undefined;
        row = await tx.agentApproval.create({ data: { id: approvalId, agentRunId: current.run.id, approvalType: "EXACT_PROPOSAL", status: inherited ? "APPROVED" : "PENDING",
          requestedBy: claims.sub, requiredRole: "Technical Reviewer", revisedPlan: binding, dueAt: new Date(Math.min(Date.now() + TOOL_APPROVAL_TTL_MS, inherited ? Date.parse(inherited.expiresAt) : Infinity)),
          ...(inherited ? { decision: "APPROVED", decidedBy: inherited.consentedBy, decidedAt: new Date() } : {}),
          notes: inherited ? "Consent inherited from the explicit task policy; no new human action decision is asserted. Execution remains separate." : "Approval of this exact artifact is not tool authorization or an Execution Permit." } });
        await this.event(tx, current.run.id, claims, "EXACT_PROPOSAL_APPROVAL_REQUESTED", approvalId, binding.fingerprint);
      }
      if (!row.dueAt || !Number.isFinite(+new Date(row.dueAt)) || +new Date(row.dueAt) <= Date.now()) throw new ConflictException("APPROVAL_EXPIRED");
      if (deciding) {
        if (body.approvalId !== approvalId || body.fingerprint !== binding.fingerprint) throw new ConflictException("EXACT_APPROVAL_CHANGED");
        if (row.status !== "PENDING") {
          if (row.status !== body.decision || row.decision !== body.decision || row.decidedBy !== claims.sub || !row.decidedAt) throw new ConflictException("APPROVAL_ALREADY_DECIDED");
        } else {
          const updated = await tx.agentApproval.updateMany({ where: { id: approvalId, status: "PENDING" }, data: {
            status: body.decision, decision: body.decision, decidedBy: current.reviewer.sub, decidedAt: new Date() } });
          if (updated.count !== 1) throw new ConflictException("APPROVAL_ALREADY_DECIDED");
          await this.event(tx, current.run.id, claims, `EXACT_PROPOSAL_${body.decision}`, approvalId, binding.fingerprint);
          row = await tx.agentApproval.findUnique({ where: { id: approvalId } });
        }
      }
      return { approvalId, generation, status: row.status, dueAt: row.dueAt, binding, executionEnabled: false };
    });
  }
  private async admitTx(tx: any, conversationId: string, proposalId: string, claims: SessionClaims, body: any, ignorePolicy = false, consent?: TaskConsentReference) {
    if (!isRecord(body) || !validToolId(body.planId) || !validToolId(proposalId) || body.proposalVersion !== 1 || typeof body.proposalDigest !== "string" || !/^[a-f0-9]{64}$/.test(body.proposalDigest)) throw new BadRequestException("EXACT_APPROVAL_REQUEST_INVALID");
    const approvalId = `exactapproval_${toolDigest([claims.sub, conversationId, proposalId])}`;
      const fresh = await this.inspections.certifiedPlanningSourceTx(tx, claims, conversationId);
      const plan = await tx.agentPlan.findUnique({ where: { id: body.planId } });
      const run = await exactPlanRunTx(this.ledger, tx, plan, claims, conversationId);
      validateExactPlan(run, plan, fresh, claims, conversationId);
      const record = await readExactProposal(this.ledger, tx, claims.sub, conversationId, body.planId);
      if (!record || !record.immutable) throw new ConflictException("EXACT_PROPOSAL_REQUIRED");
      const p = record.payload;
      if (p.continuationRunId !== (run.id !== plan.agentRunId ? run.id : undefined)) throw new ConflictException("PLAN_RUN_PROVENANCE_CHANGED");
      validateExactProposal(p, plan, fresh, claims, conversationId);
      if (p.proposalId !== proposalId || p.version !== body.proposalVersion || p.digest !== body.proposalDigest || p.projectId !== run.projectId) throw new ConflictException("EXACT_PROPOSAL_SOURCE_CHANGED");
      const reviewer = await this.identity.actor(tx, claims.sub, claims.organizationId!, run.projectId,
        { id: claims.sessionId!, issuedAt: claims.iat ?? 0, expiresAt: claims.exp! });
      await this.resources.assertAuthorized(toolSubject(reviewer), "APPROVE", { resourceType: "Approval", id: approvalId,
        projectId: run.projectId, organizationId: claims.organizationId, requiredRole: "Technical Reviewer" });
      const base = { kind: "EXACT_PROPOSAL_APPROVAL", version: 1, proposalId: p.proposalId, proposalVersion: p.version, proposalDigest: p.digest,
        planId: p.planId, planVersion: p.planVersion, planDigest: p.planDigest, conversationId, projectId: p.projectId,
        userId: p.userId, organizationId: p.organizationId, workspace: p.workspace, sourceRunId: p.sourceRunId,
        sourceSequence: p.sourceSequence, sourceDigest: p.sourceDigest,
        sourceFingerprint: toolDigest({ workspace: p.workspace, sourceRunId: p.sourceRunId, sourceSequence: p.sourceSequence,
          sourceDigest: p.sourceDigest, evidenceReferences: p.evidenceReferences }), executionEnabled: false };
      const head = await this.ledger.read<any>(tx, "EXACT_APPROVAL_HEAD", [claims.sub, conversationId, proposalId]);
      const row = await tx.agentApproval.findUnique({ where: { id: this.generationId([claims.sub, conversationId, proposalId], head?.payload.generation ?? 1) } });
      const stored = row?.revisedPlan?.taskConsent as TaskConsentReference | undefined;
      const reference = ignorePolicy ? undefined : consent ?? stored;
      if (reference) {
        await this.policies().checkTx(tx, reference, { ...p, session: { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp } });
        const match = await this.policies().selectTx(tx, p, claims, reference);
        if (!match || toolDigest(match) !== toolDigest(reference)) throw new ConflictException("TASK_CONSENT_EXPLICIT_ACTION_REQUIRED");
      }
      const bound = { ...base, ...(reference ? { taskConsent: reference } : {}) };
      return { fresh, run, reviewer, proposal: p, binding: { ...bound, fingerprint: toolDigest(bound) } };
  }
  async approvedTx(tx: any, conversationId: string, proposalId: string, claims: SessionClaims, body: any) {
    const admitted = await this.admitTx(tx, conversationId, proposalId, claims, body);
    const row = await tx.agentApproval.findUnique({ where: { id: body.approvalId } });
    const key = [claims.sub, conversationId, proposalId];
    const head = await this.ledger.read<any>(tx, "EXACT_APPROVAL_HEAD", key);
    const expectedId = this.generationId(key, head?.payload.generation ?? 1);
    if (head && head.payload.approvalId !== expectedId) throw new ConflictException("EXACT_APPROVAL_CHANGED");
    admitted.binding = this.generationBinding(admitted.binding, head?.payload);
    if (!row || row.id !== expectedId || row.agentRunId !== admitted.run.id || row.approvalType !== "EXACT_PROPOSAL" ||
      row.requestedBy !== claims.sub || row.status !== "APPROVED" || row.decision !== "APPROVED" || !row.decidedAt || !row.decidedBy ||
      toolDigest(row.revisedPlan) !== toolDigest(admitted.binding)) throw new ConflictException("EXACT_APPROVAL_REQUIRED");
    if (!row.dueAt || !Number.isFinite(+new Date(row.dueAt)) || +new Date(row.dueAt) <= Date.now()) throw new ConflictException("APPROVAL_EXPIRED");
    const reviewer = await this.identity.actor(tx, row.decidedBy, claims.organizationId!, admitted.run.projectId);
    await this.resources.assertAuthorized(toolSubject(reviewer), "APPROVE", { resourceType: "Approval", id: row.id,
      projectId: admitted.run.projectId, organizationId: claims.organizationId, requiredRole: "Technical Reviewer" });
    return { ...admitted, approval: row };
  }
  private generationId(key: string[], generation: number) {
    if (!Number.isSafeInteger(generation) || generation < 1 || generation > 10000) throw new ConflictException("EXACT_APPROVAL_CHANGED");
    return `exactapproval_${toolDigest(generation === 1 ? key : [...key, generation])}`;
  }
  private generationBinding(binding: any, head?: { generation: number; requestId: string }) {
    if (!head) return binding; // Preserve already-approved legacy fingerprints.
    if (!validToolId(head.requestId)) throw new ConflictException("EXACT_APPROVAL_CHANGED");
    const base = omitFields(binding, ["fingerprint"]);
    const value = { ...base, generation: head.generation, requestId: head.requestId };
    return { ...value, fingerprint: toolDigest(value) };
  }
  private async event(tx: any, runId: string, claims: SessionClaims, eventType: string, approvalId: string, fingerprint: string) {
    const payload = { approvalId, fingerprint, executionEnabled: false };
    await tx.agentRunEvent.create({ data: { agentRunId: runId, eventType, actor: claims.sub, payload } });
    await this.audit.recordWithClaimsTx(tx, claims, { action: eventType, resourceType: "AgentRun", resourceId: runId, details: payload });
  }
}
import { omitFields } from "../../common/omit-fields";
