import { assertConversationTool, assertConversationBinding, modeContext, conversationMode } from "../conversation/conversation-mode";
import { ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { WorkspaceStoreService } from "../workspace-intelligence/workspace-store.service";
import { workspaceTarget, type WorkspaceBinding } from "../workspace-intelligence/workspace-runtime.contract";
import type { SessionClaims } from "../auth/auth.dto";
import { ResourceAuthorizationService } from "../auth/resource-authz.service";
import { ToolAuthorizationService } from "../agent-runtime/tools/tool-authorization.service";
import { ToolApprovalService } from "../agent-runtime/tools/tool-approval.service";
import { ToolRegistryService } from "../agent-runtime/tools/tool-registry.service";
import { boundedToolJson, isRecord, toolDigest, toolSubject, validToolId, type TrustedToolWorkspace } from "../agent-runtime/tools/tool-contract";
import { RuntimeLedgerService, type RuntimeRecord } from "./runtime-ledger.service";
import { RuntimeIdentityService } from "./runtime-identity.service";
import { exactRuntimePlan } from "./runtime-plan";
import { readConsentFingerprint, readConsentUnexpired, readCoverageTx, workspaceReadConsentTx } from "./workspace-read-coverage";
import { persistentReadAccessTx, workspaceReadTool } from "./development-read-policy";
import { executionPhaseTx } from "../agent-runtime/execution/plan-execution-state";
import { WORKSPACE_READ_TOOLS, WORKSPACE_READ_TTL_MS, type WorkspaceReadConsent } from "./runtime.contract";
import { RUNTIME_LABEL, RUNTIME_LIMITS, boundedRuntime, runtimeBinding, runtimeError, runtimeInput, runtimeKey, runtimePaths, runtimePermissions, runtimeRequest,
  type RuntimeDevice, type RuntimeExecution, type RuntimeGrant, type RuntimeProposal, type RuntimeTool } from "./runtime.contract";

export interface ProposeRuntimeAction { conversationId: string; projectId: string; runtimeId: string; tool: RuntimeTool; input: Record<string, unknown>; purpose: string; requestId: string }
export function executionIdentity(p: RuntimeProposal) { const intentId = `rtintent_${toolDigest([p.proposalId, p.proposalDigest])}`; return { intentId, executionId: runtimeKey("RUNTIME_EXECUTION", intentId) }; }
@Injectable()
export class RuntimeControlService {
  constructor(@Inject(RuntimeLedgerService) readonly ledger: RuntimeLedgerService, @Inject(RuntimeIdentityService) readonly identity: RuntimeIdentityService,
    @Inject(ToolAuthorizationService) readonly authorization: ToolAuthorizationService, @Inject(ToolApprovalService) readonly approvals: ToolApprovalService,
    @Inject(ToolRegistryService) readonly registry: ToolRegistryService,
    @Optional() @Inject(WorkspaceStoreService) readonly workspaces?: WorkspaceStoreService) {}

  async workspaceReadConsent(claims: SessionClaims, binding: WorkspaceBinding,
    body: { expectedGrantVersion: number; durationMinutes?: number; revoke?: boolean; requestId?: string }) {
    return this.ledger.transaction(async tx => {
      if (!this.workspaces) runtimeError("WORKSPACE_UNAVAILABLE");
      const fresh = await this.identity.actor(tx, claims.sub, claims.organizationId!, binding.projectId, { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
      if (binding.userId !== fresh.sub || binding.organizationId !== fresh.organizationId) runtimeError("WORKSPACE_ACCESS_DENIED");
      const resources = new ResourceAuthorizationService(tx);
      await resources.assertAuthorized(toolSubject(fresh), "EXECUTE", { resourceType: "Project", id: binding.projectId, projectId: binding.projectId, organizationId: binding.organizationId });
      await resources.assertAuthorized(toolSubject(fresh), "APPROVE", { resourceType: "Approval", id: binding.workspaceId, projectId: binding.projectId, organizationId: binding.organizationId, requiredRole: "Technical Reviewer" });
      await this.workspaces.assertInspectionBindingTx(tx, { ...binding, bindingVersion: binding.version });
      const device = (await this.identity.device(tx, binding.runtimeId)).payload;
      if (device.status !== "ACTIVE" || device.fingerprint !== binding.runtimeFingerprint || device.userId !== fresh.sub || device.organizationId !== fresh.organizationId) runtimeError("RUNTIME_IDENTITY_MISMATCH");
      const grant = await this.ledger.read<RuntimeGrant>(tx, "RUNTIME_GRANT", [binding.runtimeId, binding.projectId]);
      if ((grant?.payload.version ?? 0) !== body.expectedGrantVersion) runtimeError("WORKSPACE_READ_GRANT_CHANGED");
      if (body.requestId !== undefined && !validToolId(body.requestId)) runtimeError("WORKSPACE_READ_GRANT_INVALID");
      const key = [fresh.sub, binding.organizationId, binding.projectId, binding.workspaceId, binding.version];
      const prior = await this.ledger.read<WorkspaceReadConsent>(tx, "WORKSPACE_READ_CONSENT", key);
      const old = await workspaceReadConsentTx(this.ledger, tx, { ...binding, bindingVersion: binding.version }, grant?.payload);
      const persistent = !!grant && await persistentReadAccessTx(this.ledger, tx, grant.payload);
      const matchingOld = old?.workspaceId === binding.workspaceId && old.bindingVersion === binding.version ? old : undefined;
      const requestDigest = toolDigest(body);
      const replay = body.requestId ? await this.ledger.read<any>(tx, "WORKSPACE_READ_CONSENT_REQUEST", [...key, body.requestId]) : null;
      if (replay) {
        if (replay.payload.requestDigest !== requestDigest || !prior || toolDigest(prior.payload) !== toolDigest(replay.payload.consent)) runtimeError("WORKSPACE_READ_GRANT_CHANGED");
        if (!body.revoke && (prior.payload.status !== "ACTIVE" || !readConsentUnexpired(prior.payload, persistent))) runtimeError("WORKSPACE_READ_GRANT_INVALID");
        return prior.payload;
      }
      let consent: WorkspaceReadConsent;
      if (body.revoke) {
        if (!matchingOld) runtimeError("WORKSPACE_READ_GRANT_MISSING");
        const { status } = matchingOld!;
        const scope = omitFields(matchingOld!, ["fingerprint", "status", "revokedAt"]);
        const next = { ...scope, version: scope.version + (status === "REVOKED" ? 0 : 1) };
        consent = status === "REVOKED" ? matchingOld! : { ...next, fingerprint: readConsentFingerprint(next), status: "REVOKED", revokedAt: new Date().toISOString() };
      } else {
        if (!Number.isSafeInteger(body.durationMinutes) || body.durationMinutes! < 1 || body.durationMinutes! * 60000 > WORKSPACE_READ_TTL_MS) runtimeError("WORKSPACE_READ_DURATION_INVALID");
        if (!device.lastSeenAt || Date.parse(device.lastSeenAt) + RUNTIME_LIMITS.lostMs <= Date.now()) runtimeError("RUNTIME_OFFLINE");
        // Repeated active consent submissions do not extend the lease. Explicit expiry renewal creates a new revision.
        if (matchingOld?.status === "ACTIVE" && readConsentUnexpired(matchingOld, persistent) &&
          (persistent || (matchingOld.expiresAt !== null && Date.parse(matchingOld.expiresAt) - Date.parse(matchingOld.approvedAt) === body.durationMinutes! * 60000))) {
          // Validate historical consent before reusing it; no runtime grant is created.
          const scope = omitFields(matchingOld, ["fingerprint", "status", "revokedAt"]);
          if (matchingOld.fingerprint !== readConsentFingerprint(scope) || matchingOld.runtimeFingerprint !== binding.runtimeFingerprint || matchingOld.rootPath !== binding.rootPath) runtimeError("WORKSPACE_READ_GRANT_INVALID");
          consent = matchingOld;
        } else {
          const now = Date.now();
          const scope = { kind: "WORKSPACE_READ" as const, workspaceId: binding.workspaceId, bindingId: binding.workspaceId, bindingVersion: binding.version, rootPath: binding.rootPath,
            runtimeId: binding.runtimeId, runtimeFingerprint: binding.runtimeFingerprint, userId: fresh.sub, organizationId: binding.organizationId, projectId: binding.projectId,
            capabilities: [...WORKSPACE_READ_TOOLS], version: (matchingOld?.version ?? 0) + 1, approvedBy: fresh.sub, approvedAt: new Date(now).toISOString(), expiresAt: persistent ? null : new Date(now + body.durationMinutes! * 60000).toISOString() };
          consent = { ...scope, status: "ACTIVE", revokedAt: null, fingerprint: readConsentFingerprint(scope) };
        }
      }
      if (!prior) await this.ledger.create(tx, "WORKSPACE_READ_CONSENT", key, consent, { immutable: false, route: fresh.sub });
      else if (toolDigest(prior.payload) !== toolDigest(consent)) await this.ledger.update(tx, prior, consent);
      if (body.requestId) await this.ledger.create(tx, "WORKSPACE_READ_CONSENT_REQUEST", [...key, body.requestId],
        { requestDigest, requestedBy: fresh.sub, consent }, { immutable: true });
      return consent;
    });
  }

  async proposeInspectionTx(tx: any, claims: SessionClaims, runId: string, planVersion: number, binding: WorkspaceBinding,
    body: { tool: RuntimeTool; relativePath: string; query?: string; purpose: string; operationId: string }) {
    if (!this.workspaces || !["filesystem.list", "filesystem.read", "filesystem.search"].includes(body.tool)) runtimeError("INSPECTION_TOOL_DENIED");
    const fresh = await this.identity.actor(tx, claims.sub, claims.organizationId!, binding.projectId,
      { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
    await new ResourceAuthorizationService(tx).assertAuthorized(toolSubject(fresh), "EXECUTE", { resourceType: "Project", id: binding.projectId, projectId: binding.projectId, organizationId: claims.organizationId });
    await this.workspaces.assertInspectionBindingTx(tx, { ...binding, bindingVersion: binding.version });
    const device = (await this.identity.device(tx, binding.runtimeId)).payload;
    if (!device.lastSeenAt || Date.parse(device.lastSeenAt) + RUNTIME_LIMITS.lostMs <= Date.now()) runtimeError("RUNTIME_OFFLINE");
    const grant = await this.identity.activeGrant(tx, binding.runtimeId, binding.projectId, undefined, true);
    if (grant.userId !== fresh.sub || !grant.capabilities.includes(body.tool)) runtimeError("RUNTIME_CAPABILITY_NOT_GRANTED");
    const target = workspaceTarget(binding.rootPath, body.relativePath);
    const input = runtimeInput(body.tool, { path: target.absolutePath, ...(body.tool === "filesystem.search" ? { query: body.query } : {}) });
    const run = await tx.agentRun.findUnique({ where: { id: runId }, include: { plans: { orderBy: { version: "desc" }, take: 1 } } });
    const plan = run?.plans?.[0], planning = plan?.steps?.[0]?.parameters?.planning, step = planning?.plan?.steps?.[0];
    const conversation = run && await tx.conversation.findUnique({ where: { id: run.conversationId } });
    if (!run || run.userId !== fresh.sub || run.projectId !== binding.projectId || conversation?.userId !== fresh.sub || conversation.projectId !== binding.projectId ||
      run.planVersion !== planVersion || plan?.version !== planVersion || plan.status !== "PLAN_READY" || planning?.plan?.readiness !== "PLAN_READY" ||
      planning.plan.authorization !== "NOT_GRANTED" || planning.plan.validation?.valid !== true || step?.effect !== "READ_ONLY" || step.capability !== body.tool ||
      step.purpose !== body.purpose || toolDigest(step.input) !== toolDigest(input)) runtimeError("RUNTIME_PLAN_CHANGED");
    const key = [runId, planVersion], prior = await this.ledger.read<RuntimeProposal>(tx, "RUNTIME_PROPOSAL", key);
    if (prior) {
      if (prior.payload.inputDigest !== toolDigest(input) || prior.payload.planDigest !== toolDigest(plan.steps) || prior.payload.inspection?.operationId !== body.operationId) runtimeError("RUNTIME_IDEMPOTENCY_CONFLICT");
      return prior.payload;
    }
    const tool = this.registry.resolve(body.tool, "2.0.0"), scope = { workspaceId: binding.workspaceId, paths: runtimePaths(input) };
    const coverage = await readCoverageTx(this.ledger, tx, grant, { ...binding, bindingVersion: binding.version }, body.tool, String(input.path));
    const immutable = { runtimeId: device.runtimeId, grantId: grant.grantId, grantVersion: grant.version, connectionEpoch: device.connectionEpoch,
      ...(coverage ? { workspaceRead: coverage } : {}),
      userId: fresh.sub, organizationId: fresh.organizationId!, projectId: binding.projectId, conversationId: run.conversationId, runId, planId: plan.id, planVersion, planStepId: step.id,
      toolId: body.tool, toolVersion: "2.0.0" as const, validatedInput: input, purpose: body.purpose, effect: "READ_ONLY" as const, risk: tool.riskLevel, scope,
      planDigest: toolDigest(plan.steps), inputDigest: toolDigest(input), scopeDigest: toolDigest(scope), verificationDigest: toolDigest(step.verification),
      workspaceBindingId: binding.workspaceId, workspaceBindingVersion: String(binding.version), policyVersion: "trusted-runtime-v1" as const, createdAt: new Date().toISOString(),
      inspection: { workspaceId: binding.workspaceId, bindingVersion: binding.version, runtimeFingerprint: binding.runtimeFingerprint, rootPath: binding.rootPath, operationId: body.operationId } };
    const p: RuntimeProposal = { ...immutable, proposalId: `rtproposal_${toolDigest(key)}`, proposalDigest: toolDigest(immutable),
      preview: { available: true, description: `${body.tool}: ${body.relativePath || "."}. Workspace-bound read-only inspection; approval applies to this exact operation.` },
      approvalId: null, approvalFingerprint: null, state: "AWAITING_APPROVAL", authorizingSessionId: claims.sessionId, authorizingIssuedAt: claims.iat ?? 0, authorizingExpiresAt: claims.exp };
    const decision = await this.authorization.authorize(runId, runtimeRequest(p), fresh, this.workspace(p, grant), { forceApproval: true, actionBinding: runtimeBinding(p), ...(coverage ? { workspaceRead: coverage } : {}) }, tx);
    if (decision.status !== (coverage ? "AUTHORIZED" : "APPROVAL_REQUIRED") || !decision.approvalId) runtimeError(decision.code ?? "RUNTIME_APPROVAL_REQUIRED");
    const approval = await tx.agentApproval.findUnique({ where: { id: decision.approvalId } });
    p.approvalId = approval.id; p.approvalFingerprint = approval.revisedPlan.fingerprint;
    if (coverage) p.state = "APPROVED";
    await this.ledger.create(tx, "RUNTIME_PROPOSAL", key, p, { immutable: false, route: `${device.runtimeId}:${coverage ? "approved" : "pending"}` });
    return p;
  }

  async propose(claims: SessionClaims, body: ProposeRuntimeAction, workspace?: { binding: WorkspaceBinding; operationId: string }, agentTransition?: WorkspaceBinding) {
    boundedRuntime(body, RUNTIME_LIMITS.inputBytes + 4096);
    if (!isRecord(body) || Object.keys(body).some(k => !["conversationId", "projectId", "runtimeId", "tool", "input", "purpose", "requestId"].includes(k)) ||
      ![body.conversationId, body.projectId, body.runtimeId, body.requestId].every(validToolId) || typeof body.purpose !== "string" || !body.purpose.trim() || body.purpose.length > 512) runtimeError("RUNTIME_PROPOSAL_INVALID");
    const input = runtimeInput(body.tool, body.input), tool = this.registry.resolve(body.tool, "2.0.0");
    const runId = `rtrun_${toolDigest([claims.sub, body.conversationId, body.requestId])}`;
    return this.ledger.transaction(async tx => {
      const fresh = await this.identity.actor(tx, claims.sub, claims.organizationId!, body.projectId, { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
      await new ResourceAuthorizationService(tx).assertAuthorized(toolSubject(fresh), "EXECUTE", { resourceType: "Project", id: body.projectId, projectId: body.projectId, organizationId: claims.organizationId });
      if (agentTransition) await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', body.conversationId);
      const conversation = await tx.conversation.findUnique({ where: { id: body.conversationId } });
      if (!conversation || conversation.userId !== claims.sub || conversation.projectId !== body.projectId) throw new ForbiddenException("RUNTIME_CONVERSATION_SCOPE_INVALID");
      // Internal conversation dispatcher only; never accepted from the request body.
      // The lifecycle transition and proposal commit together, after existing authority checks.
      if (agentTransition) {
        if (body.tool !== "terminal.execute" || workspace || !this.workspaces || conversationMode(conversation) === "AUTOMATION") runtimeError("RUNTIME_CONVERSATION_SCOPE_INVALID");
        assertConversationBinding(conversation, agentTransition);
        if (agentTransition.userId !== fresh.sub || agentTransition.organizationId !== fresh.organizationId ||
          agentTransition.projectId !== body.projectId || agentTransition.runtimeId !== body.runtimeId || input.cwd !== agentTransition.rootPath) runtimeError("WORKSPACE_ACCESS_DENIED");
        await this.workspaces.assertInspectionBindingTx(tx, { ...agentTransition, bindingVersion: agentTransition.version });
        const currentGrant = await this.identity.activeGrant(tx, body.runtimeId, body.projectId);
        const currentDevice = (await this.identity.device(tx, body.runtimeId)).payload;
        if (!currentGrant.capabilities.includes(body.tool)) throw new ForbiddenException("RUNTIME_CAPABILITY_NOT_GRANTED");
        if (currentDevice.fingerprint !== agentTransition.runtimeFingerprint) runtimeError("RUNTIME_IDENTITY_MISMATCH");
        if (conversationMode(conversation) === "CHAT") {
          const context = { ...modeContext(conversation), version: 1, mode: "AGENT", organizationId: fresh.organizationId,
            workspace: { workspaceId: agentTransition.workspaceId, bindingVersion: agentTransition.version,
              runtimeId: agentTransition.runtimeId, runtimeFingerprint: agentTransition.runtimeFingerprint } };
          conversation.metadata = { ...conversation.metadata, modeContext: context };
          await tx.conversation.update({ where: { id: conversation.id }, data: { metadata: conversation.metadata } });
        }
      }
      assertConversationTool(conversation, body.tool);
      if (conversationMode(conversation) === "CHAT" && !workspace) throw new ForbiddenException("NORMAL_CHAT_WORKSPACE_OPERATION_REQUIRED");
      if (modeContext(conversation)?.workspace) {
        const bound = await this.workspaces?.activeBindingTx(tx, claims.sub, body.projectId, claims.organizationId!);
        assertConversationBinding(conversation, bound);
        if (bound?.runtimeId !== body.runtimeId) throw new ForbiddenException("RUNTIME_CONVERSATION_SCOPE_INVALID");
      }
      const grant = await this.identity.activeGrant(tx, body.runtimeId, body.projectId, undefined, workspaceReadTool(body.tool)), device = (await this.identity.device(tx, body.runtimeId)).payload;
      if (grant.userId !== claims.sub || !grant.capabilities.includes(body.tool)) throw new ForbiddenException("RUNTIME_CAPABILITY_NOT_GRANTED");
      let coverage: RuntimeProposal["workspaceRead"];
      if (workspace && workspace.binding.status === "READY") {
        if (!this.workspaces || workspace.binding.runtimeId !== device.runtimeId || workspace.binding.userId !== fresh.sub || workspace.binding.projectId !== body.projectId || workspace.binding.organizationId !== fresh.organizationId) runtimeError("WORKSPACE_ACCESS_DENIED");
        await this.workspaces.assertInspectionBindingTx(tx, { ...workspace.binding, bindingVersion: workspace.binding.version });
        if (!device.lastSeenAt || Date.parse(device.lastSeenAt) + RUNTIME_LIMITS.lostMs <= Date.now()) runtimeError("RUNTIME_OFFLINE");
        coverage = await readCoverageTx(this.ledger, tx, grant, { ...workspace.binding, bindingVersion: workspace.binding.version }, body.tool, String(input.path));
      }
      const prior = await this.ledger.read<RuntimeProposal>(tx, "RUNTIME_PROPOSAL", runId);
      if (prior) {
        if (prior.payload.runtimeId !== body.runtimeId || prior.payload.toolId !== body.tool || toolDigest(prior.payload.validatedInput) !== toolDigest(input) || prior.payload.purpose !== body.purpose) runtimeError("RUNTIME_IDEMPOTENCY_CONFLICT");
        return { runId, proposal: prior.payload };
      }
      const planning = exactRuntimePlan(body.projectId, body.tool, input, body.purpose, tool.riskLevel), planId = `rtplan_${toolDigest(runId)}`;
      const messageId = `rtmsg_${toolDigest(runId)}`;
      const steps = [{ planningOnly: true, index: 0, title: "Exact user-requested runtime action", description: body.purpose, skillId: "", requiresApproval: true,
        parameters: { planning, originatingMessageId: messageId, evidenceReceipt: [], contextWarnings: ["User-authored exact action plan. Consult the runtime receipt for execution and verification."], runtimeAction: true } }];
      await tx.conversationMessage.create({ data: { id: messageId, conversationId: body.conversationId, senderId: claims.sub, senderType: "user",
        content: `${body.purpose}\n${body.tool}\n${JSON.stringify(input)}`, metadata: { runtimeAction: true, agentRunId: runId } } });
      await tx.agentRun.create({ data: { id: runId, conversationId: body.conversationId, projectId: body.projectId, userId: claims.sub,
        agentName: "SekhemEngineer", title: body.purpose, status: "AWAITING_APPROVAL", planVersion: 1, progressPercent: 0 } });
      await tx.agentPlan.create({ data: { id: planId, agentRunId: runId, version: 1, summary: body.purpose, steps, requiresApproval: true, status: "PLAN_READY" } });
      const scoped = workspace?.binding.status === "READY" ? workspace : undefined;
      const scope = { workspaceId: scoped?.binding.workspaceId ?? grant.grantId, paths: runtimePaths(input) }, now = new Date().toISOString();
      const immutable = { runtimeId: device.runtimeId, grantId: grant.grantId, grantVersion: grant.version, connectionEpoch: device.connectionEpoch,
        ...(coverage ? { workspaceRead: coverage } : {}),
        ...(scoped ? { workspaceOperation: { workspaceId: scoped.binding.workspaceId, bindingVersion: scoped.binding.version, rootPath: scoped.binding.rootPath, runtimeFingerprint: scoped.binding.runtimeFingerprint, operationId: scoped.operationId } } : {}),
        userId: claims.sub, organizationId: claims.organizationId!, projectId: body.projectId, conversationId: body.conversationId, runId, planId, planVersion: 1, planStepId: "exact_action",
        toolId: body.tool, toolVersion: "2.0.0" as const, validatedInput: input, purpose: body.purpose, effect: planning.plan.steps[0].effect, risk: tool.riskLevel,
        scope, planDigest: toolDigest(steps), inputDigest: toolDigest(input), scopeDigest: toolDigest(scope), verificationDigest: toolDigest(planning.plan.steps[0].verification),
        workspaceBindingId: scoped?.binding.workspaceId ?? grant.grantId, workspaceBindingVersion: String(scoped?.binding.version ?? grant.version), policyVersion: "trusted-runtime-v1" as const, createdAt: now };
      const proposal: RuntimeProposal = { ...immutable, proposalId: `rtproposal_${toolDigest(runId)}`, proposalDigest: toolDigest(immutable),
        preview: { available: true, description: RUNTIME_LABEL }, approvalId: null, approvalFingerprint: null, state: "AWAITING_APPROVAL",
        authorizingSessionId: claims.sessionId, authorizingIssuedAt: claims.iat ?? 0, authorizingExpiresAt: claims.exp };
      const decision = await this.authorization.authorize(runId, runtimeRequest(proposal), fresh, this.workspace(proposal, grant), { forceApproval: true, actionBinding: runtimeBinding(proposal), ...(coverage ? { workspaceRead: coverage } : {}) }, tx);
      if (decision.status !== (coverage ? "AUTHORIZED" : "APPROVAL_REQUIRED") || !decision.approvalId) runtimeError(decision.code ?? "RUNTIME_APPROVAL_REQUIRED");
      const approval = await tx.agentApproval.findUnique({ where: { id: decision.approvalId } });
      proposal.approvalId = approval.id; proposal.approvalFingerprint = approval.revisedPlan.fingerprint;
      if (coverage) proposal.state = "APPROVED";
      await this.ledger.create(tx, "RUNTIME_PROPOSAL", runId, proposal, { immutable: false, route: `${device.runtimeId}:${coverage ? "approved" : "pending"}` });
      if (coverage) { await tx.agentRun.update({ where: { id: runId }, data: { status: "RUNNING" } }); await this.event(tx, runId, "WORKSPACE_READ_AUTHORIZED", { grantId: grant.grantId, grantVersion: grant.version, consentFingerprint: coverage.consent.fingerprint }); }
      await this.event(tx, runId, "PLAN_READY", { source: "USER_EXACT_ACTION", executionPerformed: false });
      await this.event(tx, runId, "ACTION_PROPOSED", { proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest, executionPerformed: false });
      await tx.conversation.update({ where: { id: body.conversationId }, data: { updatedAt: new Date() } });
      return { runId, proposal };
    });
  }
  workspace(p: RuntimeProposal, grant: RuntimeGrant): TrustedToolWorkspace {
    const coordinates = p.inspection ?? p.workspaceOperation;
    return { workspaceId: p.workspaceBindingId, projectId: grant.projectId, trustedRoot: "TRUSTED_MACHINE", allowedPaths: runtimePaths(p.validatedInput), permissions: runtimePermissions(grant.capabilities),
      ...(coordinates ? { runtimeWorkspace: { workspaceId: coordinates.workspaceId, bindingVersion: coordinates.bindingVersion, rootPath: coordinates.rootPath, runtimeFingerprint: coordinates.runtimeFingerprint } } : {}),
      runtimeGrant: { mode: grant.mode, runtimeId: grant.runtimeId, grantId: grant.grantId, projectId: grant.projectId, version: grant.version, capabilities: grant.capabilities } };
  }
  async validate(tx: any, record: RuntimeRecord<RuntimeProposal>, device: RuntimeDevice, requireApproved = true, startAcknowledgement = false) {
    const p = record.payload;
    const immutable = omitFields(p, ["proposalId", "proposalDigest", "preview", "approvalId", "approvalFingerprint", "state",
      "authorizingSessionId", "authorizingIssuedAt", "authorizingExpiresAt"]);
    if (toolDigest(immutable) !== p.proposalDigest) runtimeError("RUNTIME_PROPOSAL_CHANGED");
    if (p.runtimeId !== device.runtimeId || p.userId !== device.userId || p.organizationId !== device.organizationId || p.connectionEpoch !== device.connectionEpoch) runtimeError("RUNTIME_PROPOSAL_IDENTITY_CHANGED");
    const conversation = await tx.conversation.findUnique({ where: { id: p.conversationId } });
    if (!conversation || conversation.userId !== p.userId || conversation.projectId !== p.projectId) runtimeError("RUNTIME_CONVERSATION_SCOPE_INVALID");
    assertConversationTool(conversation, p.toolId);
    if (modeContext(conversation)?.workspace) {
      const binding = await this.workspaces?.activeBindingTx(tx, p.userId, p.projectId, p.organizationId);
      assertConversationBinding(conversation, binding);
      if (binding?.runtimeId !== p.runtimeId) runtimeError("RUNTIME_CONVERSATION_SCOPE_INVALID");
    }
    if (p.workspaceOperation) {
      if (!this.workspaces || !WORKSPACE_READ_TOOLS.includes(p.toolId as any)) runtimeError("WORKSPACE_TOOL_DENIED");
      await this.workspaces.assertInspectionBindingTx(tx, { ...p, ...p.workspaceOperation });
    }
    if (p.inspection) {
      if (!this.workspaces || !["filesystem.list", "filesystem.read", "filesystem.search"].includes(p.toolId)) runtimeError("INSPECTION_TOOL_DENIED");
      await this.workspaces.assertInspectionBindingTx(tx, { ...p, ...p.inspection });
      const loop = (await this.ledger.read<any>(tx, "AGENT_INSPECTION", p.runId))?.payload;
      if (!loop || ["FAILED", "COMPLETED", "CANCELLED"].includes(loop.state) || loop.current?.planVersion !== p.planVersion || loop.iterations > loop.maxIterations) runtimeError("INSPECTION_NOT_ACTIVE");
    }
    if (!boundedToolJson(p.validatedInput) || toolDigest(runtimeInput(p.toolId, p.validatedInput)) !== p.inputDigest) runtimeError("RUNTIME_INPUT_CHANGED");
    if (p.toolId === "filesystem.write" && "expectedSha256" in p.validatedInput && device.conditionalWriteProtocol !== 1) runtimeError("CONDITIONAL_WRITE_WORKER_UPGRADE_REQUIRED");
    const grant = await this.identity.activeGrant(tx, p.runtimeId, p.projectId, p.grantVersion, workspaceReadTool(p.toolId));
    if (grant.grantId !== p.grantId || !grant.capabilities.includes(p.toolId)) runtimeError("RUNTIME_GRANT_CHANGED");
    if (p.workspaceRead) {
      if (device.workspaceReadProtocol !== 1) runtimeError("WORKSPACE_READ_WORKER_UPGRADE_REQUIRED");
      const coordinates = p.inspection ?? p.workspaceOperation;
      if (!coordinates) runtimeError("WORKSPACE_READ_SCOPE_DENIED");
      const coverage = await readCoverageTx(this.ledger, tx, grant, { ...p, ...coordinates }, p.toolId, String(p.validatedInput.path));
      if (!coverage || toolDigest(coverage) !== toolDigest(p.workspaceRead)) runtimeError("WORKSPACE_READ_GRANT_CHANGED");
    }
    const fresh = await this.identity.actor(tx, p.userId, p.organizationId, p.projectId, { id: p.authorizingSessionId, issuedAt: p.authorizingIssuedAt, expiresAt: p.authorizingExpiresAt });
    await new ResourceAuthorizationService(tx).assertAuthorized(toolSubject(fresh), "EXECUTE", { resourceType: "Project", id: p.projectId, projectId: p.projectId, organizationId: p.organizationId });
    // The run lock also serializes with existing steering/cancellation/deletion.
    await tx.$queryRawUnsafe('SELECT "id" FROM "AgentRun" WHERE "id"=$1 FOR UPDATE', p.runId);
    const run = await tx.agentRun.findUnique({ where: { id: p.runId }, include: { plans: { orderBy: { version: "desc" }, take: 1 } } });
    if (!run || run.userId !== p.userId || run.conversationId !== p.conversationId || run.projectId !== p.projectId || run.plans[0]?.id !== p.planId ||
      run.planVersion !== p.planVersion || toolDigest(run.plans[0]?.steps) !== p.planDigest) runtimeError("RUNTIME_PLAN_CHANGED");
    if (requireApproved) {
      if ((p.state !== "APPROVED" && !(startAcknowledgement && p.state === "DISPATCHED")) || !p.approvalId) runtimeError("RUNTIME_APPROVAL_REQUIRED");
      const approval = await tx.agentApproval.findUnique({ where: { id: p.approvalId } });
      if (!approval || approval.status !== "APPROVED" || approval.revisedPlan?.fingerprint !== p.approvalFingerprint || !approval.decidedBy) runtimeError("RUNTIME_APPROVAL_INVALID");
      const reviewer = await this.identity.actor(tx, approval.decidedBy, p.organizationId, p.projectId);
      await new ResourceAuthorizationService(tx).assertAuthorized(toolSubject(reviewer), "APPROVE", { resourceType: "Approval", id: approval.id, projectId: p.projectId, organizationId: p.organizationId, requiredRole: "Technical Reviewer" });
    }
    const decision = await this.authorization.authorize(p.runId, runtimeRequest(p), fresh, this.workspace(p, grant), { approvalId: p.approvalId ?? undefined, forceApproval: true, actionBinding: runtimeBinding(p), ...(p.workspaceRead ? { workspaceRead: p.workspaceRead } : {}) }, tx);
    if (requireApproved ? decision.status !== "AUTHORIZED" : !["AUTHORIZED", "APPROVAL_REQUIRED"].includes(decision.status)) runtimeError(decision.code ?? "RUNTIME_AUTHORIZATION_DENIED");
    return { fresh, grant, run };
  }
  async approve(claims: SessionClaims, runId: string, fingerprint: string, decision: "APPROVED" | "DENIED", planVersion?: number) {
    if (!["APPROVED", "DENIED"].includes(decision)) runtimeError("RUNTIME_DECISION_INVALID");
    return this.ledger.transaction(async tx => {
      const record = await this.ledger.read<RuntimeProposal>(tx, "RUNTIME_PROPOSAL", planVersion === undefined ? runId : [runId, planVersion]);
      if (!record) throw new NotFoundException("Runtime proposal not found");
      const p = record.payload;
      const reviewer = await this.identity.actor(tx, claims.sub, claims.organizationId!, p.projectId, { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
      if (claims.organizationId !== p.organizationId || fingerprint !== p.approvalFingerprint || !p.approvalId || !["AWAITING_APPROVAL", "APPROVED"].includes(p.state)) runtimeError("RUNTIME_APPROVAL_INVALID");
      const device = (await this.identity.device(tx, p.runtimeId)).payload;
      await this.validate(tx, record, device, false);
      await this.approvals.decide(tx, runId, p.approvalId, reviewer, decision, fingerprint);
      await executionPhaseTx(tx, runId, decision === "APPROVED" ? "WAITING_RUNTIME" : "REJECTED");
      return (await this.ledger.update(tx, record, { ...p, state: decision === "APPROVED" ? "APPROVED" : "REJECTED" }, `${p.runtimeId}:${decision === "APPROVED" ? "approved" : "settled"}`)).payload;
    });
  }
  async snapshot(claims: SessionClaims, runId: string, planVersion?: number) {
    return this.ledger.transaction(async tx => {
      const proposal = await this.ledger.read<RuntimeProposal>(tx, "RUNTIME_PROPOSAL", planVersion === undefined ? runId : [runId, planVersion]);
      if (!proposal) return null;
      const p = proposal.payload;
      await this.identity.actor(tx, claims.sub, claims.organizationId!, p.projectId);
      if (p.userId !== claims.sub || p.organizationId !== claims.organizationId) throw new ForbiddenException("RUNTIME_OWNER_MISMATCH");
      const execution = await this.ledger.read<RuntimeExecution>(tx, "RUNTIME_EXECUTION", executionIdentity(p).intentId);
      return { proposal: p, execution: execution?.payload ?? null };
    });
  }
  async cancel(claims: SessionClaims, runId: string, allowMissing = false) {
    return this.ledger.transaction(async tx => { const record = await this.ledger.read<RuntimeProposal>(tx, "RUNTIME_PROPOSAL", runId); if (!record) { if (allowMissing) return null; throw new NotFoundException("Runtime action not found"); }
      const p = record.payload; await this.identity.actor(tx, claims.sub, claims.organizationId!, p.projectId);
      if (p.userId !== claims.sub) throw new ForbiddenException("RUNTIME_OWNER_MISMATCH"); return this.cancelRunTx(tx, runId); });
  }
  async cancelRunTx(tx: any, runId: string, planVersion?: number) {
    const record = await this.ledger.read<RuntimeProposal>(tx, "RUNTIME_PROPOSAL", planVersion === undefined ? runId : [runId, planVersion]);
    if (!record) return null;
    const p = record.payload, execution = await this.ledger.read<RuntimeExecution>(tx, "RUNTIME_EXECUTION", executionIdentity(p).intentId);
    if (!execution) {
      await this.ledger.update(tx, record, { ...p, state: "CANCELLED" }, `${p.runtimeId}:settled`);
      await tx.agentApproval.updateMany({ where: { id: p.approvalId, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "CANCELLED", decision: "CANCELLED" } });
      await this.event(tx, runId, "EXECUTION_CANCELLED", { executed: false });
      await executionPhaseTx(tx, runId, "CANCELLED");
      await tx.agentRun.updateMany({ where: { id: runId }, data: { status: "CANCELLED", cancellationReason: "Cancelled before runtime dispatch", completedAt: new Date() } });
      return { state: "CANCELLED", executed: false };
    }
    if (!["DISPATCHED", "RUNNING"].includes(execution.payload.state)) {
      await executionPhaseTx(tx, runId, "CANCELLED");
      return execution.payload;
    }
    return (await this.ledger.update(tx, execution, { ...execution.payload, cancellationState: "REQUESTED" })).payload;
  }
  async event(tx: any, runId: string, eventType: string, payload: Record<string, unknown>) {
    // The projection may legitimately be absent after conversation deletion.
    await tx.$queryRawUnsafe('SELECT "id" FROM "AgentRun" WHERE "id"=$1 FOR KEY SHARE', runId);
    const run = await tx.agentRun.findUnique({ where: { id: runId }, select: { id: true } });
    if (run) await tx.agentRunEvent.create({ data: { agentRunId: runId, eventType, actor: "trusted-runtime", payload } });
  }
}
import { omitFields } from "../common/omit-fields";
