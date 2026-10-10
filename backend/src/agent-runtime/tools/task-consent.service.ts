import { BadRequestException, ConflictException } from "@nestjs/common";
import { win32 } from "node:path";
import { createHash } from "node:crypto";
import type { SessionClaims } from "../../auth/auth.dto";
import { ResourceAuthorizationService } from "../../auth/resource-authz.service";
import { RuntimeLedgerService } from "../../trusted-runtime/runtime-ledger.service";
import { RuntimeIdentityService } from "../../trusted-runtime/runtime-identity.service";
import { WorkspaceStoreService } from "../../workspace-intelligence/workspace-store.service";
import { workspaceTarget } from "../../workspace-intelligence/workspace-runtime.contract";
import { ToolRegistryService } from "./tool-registry.service";
import { isRecord, matchesToolSchema, toolDigest, toolSubject, validToolId } from "./tool-contract";
import type { ExactProposal } from "../execution/exact-proposal.service";

import type { ConsentSession, TaskConsentReference } from "./consent.contract";
export type { ConsentSession, TaskConsentReference } from "./consent.contract";
export const TASK_CONSENT_MAX_MS = 15 * 60 * 1000;
/** Human consent only. Callers keep all existing permission, evidence and execution gates. */
export class TaskConsentService {
  constructor(readonly ledger: RuntimeLedgerService, readonly identity: RuntimeIdentityService,
    readonly resources: ResourceAuthorizationService) {}
  key(p: any) {
    const artifact = [p.userId, p.organizationId, p.projectId, p.conversationId, p.planId, p.planVersion, p.planDigest];
    return p.scope === "SESSION" ? ["SESSION", ...artifact, p.session.id, p.session.issuedAt, p.session.expiresAt] : artifact;
  }
  private session(claims: SessionClaims): ConsentSession { return { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp }; }
  eligible(action: any, plan: any, root: string): boolean {
    try {
      const step = plan.steps[0].parameters.planning.plan.steps.find((s: any) => s.id === action.stepId);
      const tool = new ToolRegistryService().resolve(action.tool, "2.0.0");
      if (!step || !["filesystem.read", "filesystem.list", "filesystem.search", "filesystem.write"].includes(action.tool) ||
        tool.riskLevel === "HIGH" || !matchesToolSchema(action.input, tool.inputSchema) || (action.tool === "filesystem.write" ? step.type !== "IMPLEMENT" || step.effect !== "WRITE" ||
          typeof action.input.expectedSha256 !== "string" || !action.change || !/\.html$/i.test(action.relativePath) ||
          !plan.steps[0].parameters.planning.plan.constraints.some((c: any) => c.rule === "HERO_TITLE_TEXT_ONLY") : step.effect !== "READ_ONLY" || !["INSPECT", "VERIFY"].includes(step.type))) return false;
      if (action.tool === "filesystem.write") {
        // Only the existing source-validated text contract proves this write
        // has no command, security or external effect. Other writes stay explicit.
        const changes = plan.steps[0].parameters.planning.plan.constraints.filter((c: any) => c.rule === "HERO_TITLE_TEXT_ONLY");
        if (changes.length !== 1 || changes[0].textChange?.relativePath !== action.relativePath ||
          changes[0].textChange.sourceSha256 !== action.input.expectedSha256 || action.change.originalHash !== action.input.expectedSha256 ||
          action.change.updatedHash !== action.expectedAfterHash || createHash("sha256").update(action.input.content, "utf8").digest("hex") !== action.expectedAfterHash) return false;
      }
      return workspaceTarget(root, win32.relative(root, action.input.path)).absolutePath === action.input.path;
    } catch { return false; }
  }
  async createTx(tx: any, claims: SessionClaims, proposal: ExactProposal, plan: any, rootPath: string, requestId: string, durationSeconds: number, scope: "TASK" | "SESSION" = "TASK") {
    if (!validToolId(requestId) || !Number.isSafeInteger(durationSeconds) || durationSeconds < 1 || durationSeconds * 1000 > TASK_CONSENT_MAX_MS)
      throw new BadRequestException("TASK_CONSENT_REQUEST_INVALID");
    const actor = await this.identity.actor(tx, claims.sub, claims.organizationId!, proposal.projectId, { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
    await this.resources.assertAuthorized(toolSubject(actor), "APPROVE", { resourceType: "Approval", id: proposal.proposalId,
      projectId: proposal.projectId, organizationId: proposal.organizationId, requiredRole: "Technical Reviewer" });
    const actions = proposal.actions.filter(a => this.eligible(a, plan, rootPath));
    if (new Set(proposal.actions.map(a => a.stepId)).size !== proposal.actions.length) throw new ConflictException("TASK_CONSENT_AMBIGUOUS_ACTIONS");
    for (const action of actions) await this.resources.assertAuthorized(toolSubject(actor), action.tool === "filesystem.write" ? "UPDATE" : "READ",
      { resourceType: "Project", id: proposal.projectId, projectId: proposal.projectId, organizationId: proposal.organizationId });
    if (!actions.length || proposal.actions.length > 6) throw new ConflictException("TASK_CONSENT_NO_ELIGIBLE_ACTIONS");
    const session = this.session(claims);
    if (scope !== "TASK" && scope !== "SESSION") throw new BadRequestException("TASK_CONSENT_REQUEST_INVALID");
    const scoped = scope === "SESSION" ? { scope, session } : {};
    const key = this.key({ ...proposal, ...scoped }), requestDigest = toolDigest({ proposalDigest: proposal.digest, requestId, durationSeconds, ...scoped });
    const prior = await this.ledger.read<any>(tx, "TASK_CONSENT_REQUEST", [...key, requestId]);
    if (prior) {
      if (prior.payload.requestDigest !== requestDigest) throw new ConflictException("TASK_CONSENT_REQUEST_CONFLICT");
      return this.checkTx(tx, prior.payload.reference, { ...proposal, session });
    }
    const head = await this.ledger.read<any>(tx, "TASK_CONSENT_HEAD", key);
    if (head && (!["ACTIVE", "REVOKED"].includes(head.payload.status) || !Number.isFinite(Date.parse(head.payload.expiresAt)))) throw new ConflictException("TASK_CONSENT_INVALID");
    if (head?.payload.status === "ACTIVE" && Date.parse(head.payload.expiresAt) > Date.now()) throw new ConflictException("TASK_CONSENT_ALREADY_EXISTS");
    const generation = (head?.payload.generation ?? 0) + 1;
    if (!Number.isSafeInteger(generation) || generation > 10000) throw new ConflictException("TASK_CONSENT_GENERATION_LIMIT");
    const row = scope === "SESSION" ? await tx.userSession.findUnique({ where: { id: session.id } }) : null;
    if (scope === "SESSION" && (!validToolId(session.id) || !Number.isSafeInteger(session.issuedAt) || !Number.isSafeInteger(session.expiresAt) || !row)) throw new ConflictException("SESSION_CONSENT_SESSION_INVALID");
    const policyId = `${scope === "SESSION" ? "sessionconsent" : "taskconsent"}_${toolDigest([...key, generation])}`;
    const expiresAt = new Date(Math.min(Date.now() + durationSeconds * 1000, scope === "SESSION" ? Math.min(session.expiresAt * 1000, +new Date(row.expiresAt)) : Infinity)).toISOString();
    const payload = { kind: "TASK_CONSENT", version: 1, policyId, generation, ...scoped, ...proposal.workspace,
      userId: proposal.userId, organizationId: proposal.organizationId, projectId: proposal.projectId, conversationId: proposal.conversationId,
      planId: proposal.planId, planVersion: proposal.planVersion, planDigest: proposal.planDigest, stepsDigest: toolDigest(plan.steps),
      proposalId: proposal.proposalId, proposalDigest: proposal.digest, sourceRunId: proposal.sourceRunId, sourceSequence: proposal.sourceSequence, sourceDigest: proposal.sourceDigest,
      sourceFingerprint: toolDigest({ workspace: proposal.workspace, sourceRunId: proposal.sourceRunId, sourceSequence: proposal.sourceSequence,
        sourceDigest: proposal.sourceDigest, evidenceReferences: proposal.evidenceReferences }),
      rootPath, actions, requestId, consentedBy: actor.sub, consentedAt: new Date().toISOString(), expiresAt, executionEnabled: false };
    const reference: TaskConsentReference = { policyId, generation, digest: toolDigest(payload), expiresAt, consentedBy: actor.sub, ...scoped };
    await this.ledger.create(tx, "TASK_CONSENT", policyId, payload);
    const state = { ...reference, status: "ACTIVE", key, revokedAt: null };
    if (head) await this.ledger.update(tx, head, state); else await this.ledger.create(tx, "TASK_CONSENT_HEAD", key, state, { immutable: false });
    await this.ledger.create(tx, "TASK_CONSENT_REQUEST", [...key, requestId], { requestDigest, reference });
    await tx.agentRunEvent.create({ data: { agentRunId: plan.agentRunId, actor: actor.sub, eventType: scope === "SESSION" ? "SESSION_CONSENT_CREATED" : "TASK_CONSENT_CREATED", payload: { ...reference, planId: plan.id, executionEnabled: false } } });
    return this.checkTx(tx, reference, { ...proposal, session });
  }
  async matchTx(tx: any, proposal: ExactProposal): Promise<TaskConsentReference | undefined> {
    if (!proposal.actions.length || proposal.actions.length > 6 || new Set(proposal.actions.map(a => a.stepId)).size !== proposal.actions.length)
      throw new ConflictException("TASK_CONSENT_AMBIGUOUS_ACTIONS");
    const head = await this.ledger.read<any>(tx, "TASK_CONSENT_HEAD", this.key(proposal));
    if (!head) return undefined;
    const reference = await this.checkTx(tx, head.payload, proposal);
    const policy = (await this.ledger.read<any>(tx, "TASK_CONSENT", reference.policyId))!.payload;
    return proposal.actions.every(a => policy.actions.some((allowed: any) => toolDigest(allowed) === toolDigest(a))) ? reference : undefined;
  }
  async selectTx(tx: any, proposal: ExactProposal, claims: SessionClaims, selected?: TaskConsentReference): Promise<TaskConsentReference | undefined> {
    if (!proposal.actions.length || proposal.actions.length > 6 || new Set(proposal.actions.map(a => a.stepId)).size !== proposal.actions.length)
      throw new ConflictException("TASK_CONSENT_AMBIGUOUS_ACTIONS");
    const context = { ...proposal, session: this.session(claims) };
    const keys = [this.key(proposal), this.key({ ...proposal, scope: "SESSION", session: context.session })];
    const heads = await Promise.all(keys.map(key => this.ledger.read<any>(tx, "TASK_CONSENT_HEAD", key)));
    if (heads.some(head => head && (!["ACTIVE", "REVOKED"].includes(head.payload.status) || !Number.isFinite(Date.parse(head.payload.expiresAt)))))
      throw new ConflictException("TASK_CONSENT_INVALID");
    const candidates: TaskConsentReference[] = [];
    if (selected) {
      await this.checkTx(tx, selected, context);
      const p = (await this.ledger.read<any>(tx, "TASK_CONSENT", selected.policyId))!.payload;
      if (!proposal.actions.length || new Set(proposal.actions.map(a => a.stepId)).size !== proposal.actions.length ||
        !proposal.actions.every(a => p.actions.some((allowed: any) => toolDigest(allowed) === toolDigest(a)))) throw new ConflictException("TASK_CONSENT_EXPLICIT_ACTION_REQUIRED");
      return selected;
    }
    for (const head of heads) if (head && head.payload.status === "ACTIVE" && Date.parse(head.payload.expiresAt) > Date.now()) {
      await this.checkTx(tx, head.payload, context);
      const p = (await this.ledger.read<any>(tx, "TASK_CONSENT", head.payload.policyId))!.payload;
      if (proposal.actions.length && proposal.actions.every(a => p.actions.some((a2: any) => toolDigest(a2) === toolDigest(a))))
        candidates.push({ policyId: p.policyId, generation: p.generation, digest: head.payload.digest, expiresAt: p.expiresAt, consentedBy: p.consentedBy,
          ...(p.scope === "SESSION" ? { scope: "SESSION", session: p.session } : {}) });
    }
    if (candidates.length > 1) throw new ConflictException("CONSENT_POLICY_AMBIGUOUS");
    return candidates[0];
  }
  async checkTx(tx: any, reference: TaskConsentReference, context: any, action?: { stepId: string; tool: string; input: unknown }) {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(1936026472, 1953657905)");
    if (!isRecord(reference) || !validToolId(reference.policyId)) throw new ConflictException("TASK_CONSENT_INVALID");
    const record = await this.ledger.read<any>(tx, "TASK_CONSENT", reference.policyId);
    if (!record?.immutable || record.payloadDigest !== reference.digest) throw new ConflictException("TASK_CONSENT_CHANGED");
    const p = record.payload, head = await this.ledger.read<any>(tx, "TASK_CONSENT_HEAD", this.key(p));
    if (p.scope !== undefined && p.scope !== "SESSION") throw new ConflictException("TASK_CONSENT_INVALID");
    if (p.scope === "SESSION") {
      if (reference.scope !== "SESSION" || !reference.session || toolDigest(reference.session) !== toolDigest(p.session) ||
        !context.session || toolDigest(context.session) !== toolDigest(p.session)) throw new ConflictException("SESSION_CONSENT_SESSION_CHANGED");
      await this.identity.actor(tx, p.userId, p.organizationId, p.projectId, p.session);
    } else if (reference.scope !== undefined || reference.session !== undefined) throw new ConflictException("TASK_CONSENT_INVALID");
    if (!head || head.payload.policyId !== p.policyId || head.payload.digest !== record.payloadDigest || head.payload.generation !== p.generation || reference.generation !== p.generation ||
      head.payload.status !== "ACTIVE") throw new ConflictException("TASK_CONSENT_REVOKED");
    if (!Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= Date.now() || p.expiresAt !== reference.expiresAt || p.consentedBy !== reference.consentedBy) throw new ConflictException("TASK_CONSENT_EXPIRED");
    for (const field of ["userId", "organizationId", "projectId", "conversationId", "planId", "planVersion"]) if (p[field] !== context[field]) throw new ConflictException("TASK_CONSENT_SCOPE_CHANGED");
    for (const field of ["planDigest", "sourceRunId", "sourceDigest", "sourceSequence", "sourceFingerprint", "proposalId"]) if (context[field] !== undefined && context[field] !== p[field]) throw new ConflictException("TASK_CONSENT_SCOPE_CHANGED");
    if (context.workspace && toolDigest(context.workspace) !== toolDigest({ workspaceId: p.workspaceId, bindingVersion: p.bindingVersion, runtimeId: p.runtimeId, runtimeFingerprint: p.runtimeFingerprint })) throw new ConflictException("TASK_CONSENT_SCOPE_CHANGED");
    if ((context.proposalDigest && context.proposalDigest !== p.proposalDigest) || (context.digest && context.digest !== p.proposalDigest)) throw new ConflictException("TASK_CONSENT_SCOPE_CHANGED");
    const plan = await tx.agentPlan.findUnique({ where: { id: p.planId } });
    if (!plan || plan.version !== p.planVersion || toolDigest(plan.steps) !== p.stepsDigest) throw new ConflictException("TASK_CONSENT_PLAN_CHANGED");
    if (p.actions.some((a: any) => !this.eligible(a, plan, p.rootPath))) throw new ConflictException("TASK_CONSENT_EXPLICIT_ACTION_REQUIRED");
    const run = await tx.agentRun.findUnique({ where: { id: plan.agentRunId } });
    if (!run || run.planVersion !== p.planVersion || run.conversationId !== p.conversationId || run.userId !== p.userId || run.projectId !== p.projectId) throw new ConflictException("TASK_CONSENT_PLAN_CHANGED");
    await new WorkspaceStoreService(tx).assertInspectionBindingTx(tx, { ...p, version: p.bindingVersion });
    const actor = await this.identity.actor(tx, p.consentedBy, p.organizationId, p.projectId);
    await this.resources.assertAuthorized(toolSubject(actor), "APPROVE", { resourceType: "Approval", id: p.policyId, projectId: p.projectId, organizationId: p.organizationId, requiredRole: "Technical Reviewer" });
    const grant = await this.identity.activeGrant(tx, p.runtimeId, p.projectId), device = (await this.identity.device(tx, p.runtimeId)).payload;
    if (grant.userId !== p.userId || grant.organizationId !== p.organizationId || device.fingerprint !== p.runtimeFingerprint ||
      p.actions.some((a: any) => !grant.capabilities.includes(a.tool))) throw new ConflictException("TASK_CONSENT_CAPABILITY_DENIED");
    if (action && !p.actions.some((a: any) => a.stepId === action.stepId && a.tool === action.tool && toolDigest(a.input) === toolDigest(action.input))) throw new ConflictException("TASK_CONSENT_ACTION_DENIED");
    return { policyId: p.policyId, generation: p.generation, digest: record.payloadDigest, expiresAt: p.expiresAt, consentedBy: p.consentedBy,
      ...(p.scope === "SESSION" ? { scope: "SESSION", session: p.session } : {}) } as TaskConsentReference;
  }
  async revokeTx(tx: any, claims: SessionClaims, reference: TaskConsentReference) {
    const record = await this.ledger.read<any>(tx, "TASK_CONSENT", reference.policyId);
    if (!record || record.payload.userId !== claims.sub || record.payload.organizationId !== claims.organizationId) throw new ConflictException("TASK_CONSENT_SCOPE_CHANGED");
    const p = record.payload;
    await this.identity.actor(tx, claims.sub, claims.organizationId!, p.projectId, { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
    await this.resources.assertAuthorized(toolSubject(claims), "APPROVE", { resourceType: "Approval", id: p.policyId, projectId: p.projectId, organizationId: p.organizationId, requiredRole: "Technical Reviewer" });
    const head = await this.ledger.read<any>(tx, "TASK_CONSENT_HEAD", this.key(p));
    if (!head || head.payload.policyId !== reference.policyId || head.payload.digest !== reference.digest) throw new ConflictException("TASK_CONSENT_CHANGED");
    if (head.payload.status === "REVOKED") return head.payload;
    const state = { ...head.payload, status: "REVOKED", revokedAt: new Date().toISOString() };
    await this.ledger.update(tx, head, state);
    await tx.agentRunEvent.create({ data: { agentRunId: (await tx.agentPlan.findUnique({ where: { id: p.planId } })).agentRunId,
      actor: claims.sub, eventType: p.scope === "SESSION" ? "SESSION_CONSENT_REVOKED" : "TASK_CONSENT_REVOKED", payload: { policyId: reference.policyId, generation: reference.generation, executionEnabled: false } } });
    return state;
  }
}
