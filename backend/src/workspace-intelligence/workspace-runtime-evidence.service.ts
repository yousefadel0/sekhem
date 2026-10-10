import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { SessionClaims } from "../auth/auth.dto";
import { RuntimeIdentityService } from "../trusted-runtime/runtime-identity.service";
import { boundedRuntime } from "../trusted-runtime/runtime.contract";
import { isRecord, toolDigest, validToolId } from "../agent-runtime/tools/tool-contract";
import { AGENT_UNDERSTANDING_LIMITS } from "../agent-runtime/understanding/agent-understanding.types";
import { WorkspaceRuntimeService } from "./workspace-runtime.service";
import { WorkspaceStoreService } from "./workspace-store.service";
import { workspaceTarget, type WorkspaceBinding, type WorkspaceOperation, type RuntimeEvidenceRequest, type RuntimeEvidenceReference, type RuntimeEvidenceView, type RuntimeEvidenceState, type WorkspaceOperationView } from "./workspace-runtime.contract";
import { FileIntelligenceSecurityService } from "../file-intelligence/security/file-intelligence-security.service";
import { excludedFromWorkspaceDiscovery } from "./workspace-discovery.policy";

/** Admission only. This service never dispatches work except on explicit request(). */
@Injectable()
export class WorkspaceRuntimeEvidenceService {
  constructor(@Inject(WorkspaceStoreService) private readonly store: WorkspaceStoreService,
    @Inject(WorkspaceRuntimeService) private readonly runtime: WorkspaceRuntimeService,
    @Inject(RuntimeIdentityService) private readonly identity: RuntimeIdentityService) {}

  /** Called only by the persisted Agent loop in the same transaction as its exact plan/proposal. */
  async requestInspectionTx(tx: any, claims: SessionClaims, binding: WorkspaceBinding, runId: string, planVersion: number,
    action: { tool: "filesystem.list" | "filesystem.read" | "filesystem.search"; relativePath: string; query?: string }, conversationId: string, createdAt: string) {
    const target = workspaceTarget(binding.rootPath, action.relativePath);
    new FileIntelligenceSecurityService().assertSafeFileName(target.relativePath);
    if (target.relativePath.split("/").some(excludedFromWorkspaceDiscovery)) throw new ForbiddenException("INSPECTION_EXCLUDED_PATH");
    if (action.tool === "filesystem.read" && !target.relativePath) throw new BadRequestException("WORKSPACE_FILE_REQUIRED");
    await this.store.assertInspectionBindingTx(tx, { ...binding, bindingVersion: binding.version });
    if (binding.userId !== claims.sub || binding.organizationId !== claims.organizationId) throw new ForbiddenException("WORKSPACE_EVIDENCE_SCOPE_MISMATCH");
    const requestId = `inspection_${toolDigest([runId, planVersion])}`, operationId = `wsop_${toolDigest(requestId)}`;
    const request: RuntimeEvidenceRequest = { requestId, workspaceId: binding.workspaceId, bindingVersion: binding.version, runtimeId: binding.runtimeId,
      runtimeFingerprint: binding.runtimeFingerprint, relativePath: target.relativePath, projectId: binding.projectId, organizationId: binding.organizationId,
      userId: claims.sub, conversationId, operationId };
    const operation: WorkspaceOperation = { ...target, operationId, workspaceId: binding.workspaceId, bindingVersion: binding.version, runtimeId: binding.runtimeId,
      projectId: binding.projectId, organizationId: binding.organizationId, userId: claims.sub, conversationId, runtimeRequestId: requestId, runId, planVersion,
      tool: action.tool, kind: action.tool === "filesystem.read" ? "READ" : action.tool === "filesystem.list" ? "LIST" : "SEARCH",
      ...(action.tool === "filesystem.search" ? { query: action.query! } : {}), createdAt };
    await this.store.saveInspectionTx(tx, operation, request);
    return { request, operation };
  }

  private async actor(claims: SessionClaims, projectId: string, conversationId: string) {
    if (!claims.sessionId || !claims.exp) throw new UnauthorizedException("WORKSPACE_EVIDENCE_SESSION_REQUIRED");
    return this.identity.ledger.transaction(async tx => {
      const fresh = await this.identity.actor(tx, claims.sub, claims.organizationId!, projectId,
        { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
      const c = await tx.conversation.findUnique({ where: { id: conversationId } });
      if (!c || c.userId !== fresh.sub || c.projectId !== projectId) throw new ForbiddenException("WORKSPACE_EVIDENCE_CONVERSATION_DENIED");
      return fresh;
    });
  }

  async request(claims: SessionClaims, projectId: string, workspaceId: string, body: unknown): Promise<RuntimeEvidenceView> {
    boundedRuntime(body);
    if (!isRecord(body) || Object.keys(body).some(k => !["bindingVersion", "runtimeId", "relativePath", "conversationId", "requestId"].includes(k)) ||
      !Number.isSafeInteger(body.bindingVersion) || !validToolId(body.runtimeId) || !validToolId(body.conversationId) || !validToolId(body.requestId)) throw new BadRequestException("WORKSPACE_EVIDENCE_REQUEST_INVALID");
    const fresh = await this.actor(claims, projectId, body.conversationId as string);
    const binding = await this.runtime.getBinding(fresh, projectId, workspaceId, Number(body.bindingVersion));
    if (binding.runtimeId !== body.runtimeId) throw new ConflictException("WORKSPACE_EVIDENCE_RUNTIME_MISMATCH");
    const target = workspaceTarget(binding.rootPath, body.relativePath);
    if (!target.relativePath) throw new BadRequestException("WORKSPACE_FILE_REQUIRED");
    // Distinct namespace from viewer reads; an ordinary read cannot be promoted by a client.
    const requestId = `wsevidence_${toolDigest([claims.sub, workspaceId, body.requestId])}`;
    const operationId = `wsop_${toolDigest(`wsrequest_${toolDigest([workspaceId, binding.version, requestId])}`)}`;
    const request = await this.store.saveEvidenceRequest({ requestId, workspaceId, bindingVersion: binding.version,
      runtimeId: binding.runtimeId, runtimeFingerprint: binding.runtimeFingerprint, relativePath: target.relativePath,
      projectId, organizationId: fresh.organizationId!, userId: fresh.sub, conversationId: body.conversationId as string, operationId });
    await this.runtime.request(fresh, projectId, workspaceId, "READ", { bindingVersion: binding.version,
      relativePath: target.relativePath, conversationId: request.conversationId, requestId });
    return this.observe(fresh, projectId, workspaceId, binding.version, requestId);
  }

  private state(view: WorkspaceOperationView): RuntimeEvidenceState {
    switch (view.state) {
      case "READY": return "VERIFIED";
      case "TRUNCATED": return "TRUNCATED";
      case "LOADING": return "PENDING";
      case "APPROVAL_REQUIRED": case "EXECUTING": case "DENIED": case "FAILED": case "STALE": return view.state;
      case "REVOKED": case "UNAUTHORIZED": case "EXPIRED_GRANT": return "DENIED";
      default: return "UNAVAILABLE";
    }
  }

  private async observation(claims: SessionClaims, projectId: string, workspaceId: string, version: number, requestId: string) {
    const request = await this.store.getEvidenceRequest(requestId);
    if (!request || request.userId !== claims.sub || request.organizationId !== claims.organizationId || request.projectId !== projectId ||
      request.workspaceId !== workspaceId || request.bindingVersion !== version) throw new ForbiddenException("WORKSPACE_EVIDENCE_SCOPE_MISMATCH");
    const fresh = await this.actor(claims, projectId, request.conversationId);
    const binding = await this.runtime.getBinding(fresh, projectId, workspaceId, version);
    const historical = await this.store.getEvidenceReceipt(requestId);
    const active = await this.store.getActiveBinding(fresh.sub, projectId, fresh.organizationId!);
    if (active?.workspaceId !== workspaceId || active.version !== version || binding.runtimeId !== request.runtimeId || binding.runtimeFingerprint !== request.runtimeFingerprint) {
      return { view: { request, state: "STALE", reference: historical ?? undefined, historical: !!historical } as RuntimeEvidenceView };
    }
    if (["OFFLINE", "REVOKED", "EXPIRED_GRANT", "UNAUTHORIZED", "STALE"].includes(binding.status)) {
      const state: RuntimeEvidenceState = binding.status === "OFFLINE" ? "UNAVAILABLE" : binding.status === "STALE" ? "STALE" : "DENIED";
      return { view: { request, state, reference: historical ?? undefined, historical: !!historical } as RuntimeEvidenceView };
    }
    const operation = await this.store.getOperation(request.operationId);
    if (!operation) return { view: { request, state: "PENDING", historical: false } as RuntimeEvidenceView };
    if ((operation.kind !== "READ" && !(operation.planVersion && ["LIST", "SEARCH"].includes(operation.kind))) || operation.conversationId !== request.conversationId || operation.relativePath !== request.relativePath || operation.runtimeId !== request.runtimeId) throw new ConflictException("WORKSPACE_EVIDENCE_OPERATION_MISMATCH");
    const result = await this.runtime.operation(fresh, projectId, workspaceId, version, request.operationId);
    const state = this.state(result);
    // Listings/searches are labelled observations, never represented as having read each file.
    let file = result.file;
    if (result.receipt && operation.planVersion && (result.entries || result.matches)) {
      const security = new FileIntelligenceSecurityService();
      const entries = result.entries?.filter(e => {
        try { security.assertSafeFileName(e.path); return !e.path.split("/").some(excludedFromWorkspaceDiscovery); } catch { return false; }
      });
      file = { text: JSON.stringify({ operation: operation.tool, path: operation.relativePath, ...(entries ? { entries } : { matches: result.matches }) }),
        fileName: operation.relativePath || ".", mimeType: "application/json", warnings: ["Runtime directory/search observation only. Listed files were not read in full."] };
    }
    let reference = historical ?? undefined;
    if ((state === "VERIFIED" || state === "TRUNCATED") && file && result.receipt) {
      if (!historical) {
        reference = await this.store.saveEvidenceReceipt({ ...request, receiptId: result.receipt.receiptId,
          observationTime: result.receipt.observedAt, contentIdentity: { status: "UNAVAILABLE" }, truncated: result.receipt.truncated,
          encoding: "utf-8-decoded", sourceType: "runtime-workspace", verificationState: "VERIFIED" });
      }
    }
    return { view: { request, state, reference, historical: !!reference && state !== "VERIFIED" && state !== "TRUNCATED",
      operation, message: result.message } as RuntimeEvidenceView, file };
  }

  async observe(claims: SessionClaims, projectId: string, workspaceId: string, version: number, requestId: string) {
    return (await this.observation(claims, projectId, workspaceId, version, requestId)).view;
  }

  /** Client references are coordinates, never content or proof. Revalidate the authoritative receipt. */
  async admit(claims: SessionClaims, projectId: string, conversationId: string, reference: RuntimeEvidenceReference) {
    boundedRuntime(reference);
    if (!isRecord(reference) || !validToolId(reference.requestId) || reference.conversationId !== conversationId) throw new ForbiddenException("WORKSPACE_EVIDENCE_REFERENCE_INVALID");
    const result = await this.observation(claims, projectId, reference.workspaceId, reference.bindingVersion, reference.requestId);
    if (!["VERIFIED", "TRUNCATED"].includes(result.view.state) || !result.file || !result.view.reference) throw new ConflictException(`WORKSPACE_EVIDENCE_${result.view.state}`);
    if (toolDigest(reference) !== toolDigest(result.view.reference)) throw new ConflictException("WORKSPACE_EVIDENCE_RECEIPT_MISMATCH");
    return { reference: result.view.reference, file: result.file, operation: result.view.operation };
  }

  async validateReferences(claims: SessionClaims, projectId: string, conversationId: string, references: unknown): Promise<RuntimeEvidenceReference[]> {
    if (!Array.isArray(references) || !references.length || references.length > AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS) throw new BadRequestException("WORKSPACE_EVIDENCE_REFERENCES_INVALID");
    const result: RuntimeEvidenceReference[] = [];
    for (const reference of references) result.push((await this.admit(claims, projectId, conversationId, reference)).reference);
    return result;
  }
}
