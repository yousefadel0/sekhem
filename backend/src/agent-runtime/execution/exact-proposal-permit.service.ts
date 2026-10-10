import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import type { SessionClaims } from "../../auth/auth.dto";
import { ResourceAuthorizationService } from "../../auth/resource-authz.service";
import { RuntimeIdentityService } from "../../trusted-runtime/runtime-identity.service";
import { RuntimeLedgerService } from "../../trusted-runtime/runtime-ledger.service";
import { RUNTIME_LIMITS } from "../../trusted-runtime/runtime.contract";
import { WorkspaceRuntimeEvidenceService } from "../../workspace-intelligence/workspace-runtime-evidence.service";
import { isRecord, toolDigest, toolSubject, validToolId } from "../tools/tool-contract";
import { ExactProposalApprovalService } from "./exact-proposal-approval.service";

/** One-use workflow permit. Runtime tool authorization and dispatch remain separate gates. */
@Injectable()
export class ExactProposalPermitService {
  constructor(@Inject(RuntimeLedgerService) private readonly ledger: RuntimeLedgerService,
    @Inject(ExactProposalApprovalService) private readonly approvals: ExactProposalApprovalService,
    @Inject(WorkspaceRuntimeEvidenceService) private readonly evidence: WorkspaceRuntimeEvidenceService,
    @Inject(RuntimeIdentityService) private readonly identity: RuntimeIdentityService,
    @Inject(ResourceAuthorizationService) private readonly resources: ResourceAuthorizationService) {}

  private validate(body: unknown): asserts body is Record<string, any> {
    if (!isRecord(body) || Object.keys(body).filter(k => k !== "requestId").sort().join(",") !== "approvalId,planId,proposalDigest,proposalVersion" ||
      (body.requestId !== undefined && !validToolId(body.requestId)) ||
      !validToolId(body.approvalId) || !validToolId(body.planId) || body.proposalVersion !== 1 ||
      typeof body.proposalDigest !== "string" || !/^[a-f0-9]{64}$/.test(body.proposalDigest)) throw new BadRequestException("EXACT_PERMIT_REQUEST_INVALID");
  }
  private async admit(tx: any, conversationId: string, proposalId: string, claims: SessionClaims, body: any) {
    const a = await this.approvals.approvedTx(tx, conversationId, proposalId, claims, body);
    await this.resources.assertAuthorized(toolSubject(a.reviewer), "EXECUTE", { resourceType: "Project", id: a.run.projectId,
      projectId: a.run.projectId, organizationId: claims.organizationId });
    const grant = await this.identity.activeGrant(tx, a.proposal.workspace.runtimeId, a.run.projectId);
    const device = (await this.identity.device(tx, a.proposal.workspace.runtimeId)).payload;
    if (grant.userId !== claims.sub || grant.organizationId !== claims.organizationId ||
      device.fingerprint !== a.proposal.workspace.runtimeFingerprint ||
      a.proposal.actions.some(action => !grant.capabilities.includes(action.tool))) throw new ConflictException("EXACT_PERMIT_RUNTIME_CHANGED");
    const binding = { ...a.binding, approvalId: a.approval.id, approvalState: "APPROVED", approvalDecisionBy: a.approval.decidedBy,
      approvalDecidedAt: new Date(a.approval.decidedAt).toISOString(), actionsDigest: toolDigest(a.proposal.actions), grantId: grant.grantId,
      grantVersion: grant.version, connectionEpoch: device.connectionEpoch,
      sessionId: claims.sessionId, sessionIssuedAt: claims.iat, sessionExpiresAt: claims.exp };
    return { ...a, grant, binding };
  }
  async issue(conversationId: string, proposalId: string, claims: SessionClaims, body: unknown) {
    this.validate(body);
    if (!validToolId(proposalId)) throw new BadRequestException("EXACT_PERMIT_REQUEST_INVALID");
    const key = [claims.sub, conversationId, proposalId], initial = await this.ledger.transaction(tx => this.admit(tx, conversationId, proposalId, claims, body));
    for (const ref of initial.fresh.references) await this.evidence.admit(claims, initial.run.projectId, initial.fresh.sourceConversationId, ref);
    return this.ledger.transaction(async tx => {
      const current = await this.admit(tx, conversationId, proposalId, claims, body);
      if (toolDigest(current.binding) !== toolDigest(initial.binding)) throw new ConflictException("EXACT_PERMIT_SOURCE_CHANGED");
      await this.unusedTx(tx, key);
      const head = await this.ledger.read<any>(tx, "EXACT_PERMIT_HEAD", key);
      const generation = head?.payload.generation ?? 1;
      const prior = await this.ledger.read<any>(tx, "EXACT_EXECUTION_PERMIT", this.issuanceKey(key, generation));
      if (prior && !prior.immutable) throw new ConflictException("EXACT_PERMIT_CHANGED");
      if (head && (!prior || head.payload.permitId !== prior.payload.permitId || head.payload.requestId !== prior.payload.requestId)) throw new ConflictException("EXACT_PERMIT_CHANGED");
      const replay = body.requestId && await this.ledger.read<any>(tx, "EXACT_PERMIT_GENERATION", [...key, body.requestId]);
      if (replay && (replay.payload.generation !== generation || replay.payload.permitId !== prior?.payload.permitId)) throw new ConflictException("EXACT_PERMIT_SUPERSEDED");
      if (prior) {
        if (!body.requestId || prior.payload.requestId === body.requestId) {
          await this.checkTx(tx, prior.payload, current.binding); return prior.payload;
        }
        if (Date.parse(prior.payload.expiresAt) > Date.now()) {
          await this.checkTx(tx, prior.payload, current.binding, true);
          throw new ConflictException("EXACT_PERMIT_REQUEST_CONFLICT");
        }
        // admit() validates current approval, session, active grant and action
        // capabilities. An expired-unused renewal captures their current state;
        // artifact, grant identity and connection bindings still match exactly.
        const renewalBinding: Record<string, unknown> = { ...current.binding };
        for (const field of ["approvalId", "generation", "requestId", "fingerprint", "approvalDecisionBy", "approvalDecidedAt", "taskConsent",
          "sessionId", "sessionIssuedAt", "sessionExpiresAt", "grantVersion"]) {
          if (Object.prototype.hasOwnProperty.call(prior.payload.binding, field)) renewalBinding[field] = prior.payload.binding[field];
          else delete renewalBinding[field]; // Legacy approval bindings omit generation/requestId.
        }
        await this.checkTx(tx, prior.payload, renewalBinding, true);
      } else if (head || replay) throw new ConflictException("EXACT_PERMIT_CHANGED");
      const nextGeneration = prior ? generation + 1 : 1;
      const issuanceKey = this.issuanceKey(key, nextGeneration);
      // PostgreSQL's default now() is transaction start, earlier than admission.
      // Use one timestamp for persisted creation and the maximum expiry bound.
      const createdAt = new Date(Date.now());
      const expires = Math.min(createdAt.getTime() + RUNTIME_LIMITS.permitMs, +new Date(current.approval.dueAt), claims.exp! * 1000,
        current.grant.expiresAt ? Date.parse(current.grant.expiresAt) : Infinity);
      if (!Number.isFinite(expires) || expires <= Date.now()) throw new ConflictException("EXACT_PERMIT_EXPIRED");
      const base = { version: 1, kind: "EXACT_EXECUTION_PERMIT", permitId: `exactpermit_${toolDigest(issuanceKey)}`, binding: current.binding,
        ...(body.requestId ? { generation: nextGeneration, requestId: body.requestId } : {}),
        expiresAt: new Date(expires).toISOString(), oneUse: true, runtimeDispatchEnabled: false };
      const permit = { ...base, digest: toolDigest(base) };
      await this.ledger.create(tx, "EXACT_EXECUTION_PERMIT", issuanceKey, permit, { immutable: true, createdAt });
      if (body.requestId) {
        const next = { generation: nextGeneration, requestId: body.requestId, permitId: permit.permitId };
        await this.ledger.create(tx, "EXACT_PERMIT_GENERATION", [...key, body.requestId], next, { immutable: true });
        if (head) await this.ledger.update(tx, head, next);
        else await this.ledger.create(tx, "EXACT_PERMIT_HEAD", key, next, { immutable: false });
      }
      await tx.agentRunEvent.create({ data: { agentRunId: current.run.id, eventType: "EXACT_EXECUTION_PERMIT_CREATED", actor: claims.sub,
        payload: { permitId: permit.permitId, digest: permit.digest, approvalId: body.approvalId, executionPerformed: false } } });
      return permit;
    });
  }
  private issuanceKey(key: string[], generation: number) {
    if (!Number.isSafeInteger(generation) || generation < 1 || generation > 10000) throw new ConflictException("EXACT_PERMIT_GENERATION_LIMIT");
    return generation === 1 ? key : [...key, generation];
  }
  private async unusedTx(tx: any, key: string[]) {
    // Scope-wide reservation prevents a second execution across all issuances.
    if (await this.ledger.read(tx, "EXACT_PERMIT_CONSUMPTION", key) ||
      await this.ledger.read(tx, "EXACT_PERMIT_CONSUMPTION", `exactpermit_${toolDigest(key)}`)) throw new ConflictException("EXACT_PERMIT_CONSUMED");
  }
  private async checkTx(tx: any, permit: any, binding: any, allowExpired = false) {
    const { digest, ...base } = permit;
    if (digest !== toolDigest(base) || permit.kind !== "EXACT_EXECUTION_PERMIT" || permit.oneUse !== true ||
      toolDigest(permit.binding) !== toolDigest(binding)) throw new ConflictException("EXACT_PERMIT_CHANGED");
    if (!Number.isFinite(Date.parse(permit.expiresAt)) || (!allowExpired && Date.parse(permit.expiresAt) <= Date.now())) throw new ConflictException("EXACT_PERMIT_EXPIRED");
    if (await this.ledger.read(tx, "EXACT_PERMIT_CONSUMPTION", permit.permitId)) throw new ConflictException("EXACT_PERMIT_CONSUMED");
  }
  /** Internal atomic reservation for the production executor, never exposed as a dispatch endpoint. */
  async consumeTx(tx: any, conversationId: string, proposalId: string, claims: SessionClaims, body: unknown, executionIntentId: string, expected?: { permitId: string; generation: number }) {
    this.validate(body);
    if (!validToolId(executionIntentId) || !validToolId(proposalId)) throw new BadRequestException("EXACT_PERMIT_REQUEST_INVALID");
    const current = await this.admit(tx, conversationId, proposalId, claims, body);
    const key = [claims.sub, conversationId, proposalId];
    await this.unusedTx(tx, key);
    const head = await this.ledger.read<any>(tx, "EXACT_PERMIT_HEAD", key);
    if (head && body.requestId !== head.payload.requestId) throw new ConflictException("EXACT_PERMIT_SUPERSEDED");
    const record = await this.ledger.read<any>(tx, "EXACT_EXECUTION_PERMIT", this.issuanceKey(key, head?.payload.generation ?? 1));
    if (!record || !record.immutable) throw new ConflictException("EXACT_PERMIT_REQUIRED");
    if (head && (record.payload.permitId !== head.payload.permitId || record.payload.requestId !== head.payload.requestId)) throw new ConflictException("EXACT_PERMIT_CHANGED");
    if (!head && body.requestId !== record.payload.requestId) throw new ConflictException("EXACT_PERMIT_CHANGED");
    if (expected && (record.payload.permitId !== expected.permitId || (record.payload.generation ?? 1) !== expected.generation))
      throw new ConflictException("EXACT_PERMIT_SUPERSEDED");
    await this.checkTx(tx, record.payload, current.binding);
    await this.ledger.create(tx, "EXACT_PERMIT_CONSUMPTION", record.payload.permitId,
      { permitId: record.payload.permitId, permitDigest: record.payload.digest, executionIntentId, consumedAt: new Date().toISOString() }, { immutable: true });
    await this.ledger.create(tx, "EXACT_PERMIT_CONSUMPTION", key,
      { permitId: record.payload.permitId, permitDigest: record.payload.digest, executionIntentId }, { immutable: true });
    return record.payload;
  }
}
