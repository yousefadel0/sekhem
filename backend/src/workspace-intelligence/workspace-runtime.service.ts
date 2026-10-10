import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { win32 } from "node:path";
import type { SessionClaims } from "../auth/auth.dto";
import { ProjectAccessService } from "../auth/project-access.service";
import { RuntimeIdentityService } from "../trusted-runtime/runtime-identity.service";
import { RuntimeControlService } from "../trusted-runtime/runtime-control.service";
import { RUNTIME_LIMITS, boundedRuntime, type RuntimeDevice, type RuntimeGrant } from "../trusted-runtime/runtime.contract";
import { isRecord, toolDigest, validToolId } from "../agent-runtime/tools/tool-contract";
import { FileIntelligenceSecurityService } from "../file-intelligence/security/file-intelligence-security.service";
import { FileIntelligenceError } from "../file-intelligence/file-intelligence.errors";
import { WorkspaceStoreService } from "./workspace-store.service";
import { readCoverage, workspaceReadConsentTx } from "../trusted-runtime/workspace-read-coverage";
import { persistentReadAccessTx } from "../trusted-runtime/development-read-policy";
import { excludedFromWorkspaceDiscovery } from "./workspace-discovery.policy";
import { workspaceRoot, workspaceTarget, type WorkspaceBinding, type WorkspaceOperation, type WorkspaceOperationView, type WorkspaceStatus } from "./workspace-runtime.contract";

@Injectable()
export class WorkspaceRuntimeService {
  constructor(@Inject(WorkspaceStoreService) private readonly store: WorkspaceStoreService,
    @Inject(RuntimeIdentityService) private readonly identity: RuntimeIdentityService,
    @Inject(RuntimeControlService) private readonly control: RuntimeControlService,
    @Inject(ProjectAccessService) private readonly projects: ProjectAccessService) {}

  /** Read-only projection of existing authority and historical observations, never a permit. */
  async context(claims: SessionClaims, projectId: string) {
    await this.projects.assert(claims, projectId);
    const visibility = await this.store.visibility(claims.sub, projectId, claims.organizationId!);
    const b = visibility.binding;
    if (!b) return { ...visibility, availability: "UNBOUND", runtime: null, readCapabilities: [] as string[] };
    const availability = await this.availability(claims, b);
    const access = await this.identity.ledger.transaction(async tx => {
      const device = (await this.identity.device(tx, b.runtimeId)).payload;
      if (device.userId !== claims.sub || device.organizationId !== claims.organizationId || device.fingerprint !== b.runtimeFingerprint) return { runtime: null, readCapabilities: [] as string[] };
      const grant = (await this.identity.ledger.read<RuntimeGrant>(tx, "RUNTIME_GRANT", [b.runtimeId, b.projectId]))?.payload;
      const consent = await workspaceReadConsentTx(this.identity.ledger, tx, { ...b, bindingVersion: b.version }, grant);
      // Current operation checks still run at proposal and dispatch. This is display metadata only.
      const covered = availability === "READY" && !!grant && device.workspaceReadProtocol === 1 && consent?.status === "ACTIVE" &&
        readCoverage({ ...grant!, persistentReadAccess: await persistentReadAccessTx(this.identity.ledger, tx, grant!), workspaceRead: consent }, { ...b, bindingVersion: b.version }, "filesystem.list", b.rootPath);
      return { runtime: { runtimeId: b.runtimeId, fingerprint: b.runtimeFingerprint, status: device.status, lastSeenAt: device.lastSeenAt },
        readCapabilities: covered ? [...covered.consent.capabilities] : [] as string[] };
    });
    return { ...visibility, availability, ...access };
  }

  async readGrant(claims: SessionClaims, projectId: string, id: string, body: unknown, revoke = false) {
    boundedRuntime(body);
    if (!isRecord(body) || Object.keys(body).some(k => !["bindingVersion", "expectedGrantVersion", "requestId", ...(revoke ? [] : ["durationMinutes"])].includes(k)) ||
      (body.requestId !== undefined && !validToolId(body.requestId)) || !Number.isSafeInteger(body.bindingVersion) || !Number.isSafeInteger(body.expectedGrantVersion) || Number(body.expectedGrantVersion) < 0) throw new BadRequestException("WORKSPACE_READ_GRANT_INVALID");
    const binding = await this.owned(claims, projectId, id, Number(body.bindingVersion));
    return this.control.workspaceReadConsent(claims, binding, { expectedGrantVersion: Number(body.expectedGrantVersion), ...(body.requestId ? { requestId: body.requestId as string } : {}), ...(revoke ? { revoke: true } : { durationMinutes: body.durationMinutes as number }) });
  }

  async devices(claims: SessionClaims, projectId: string) {
    await this.projects.assert(claims, projectId);
    return (await this.identity.devices(claims)).filter(d => d.userId === claims.sub && d.organizationId === claims.organizationId).map(d => ({
      runtimeId: d.runtimeId, folderPickerProtocol: d.folderPickerProtocol ?? null, displayName: d.displayName, fingerprint: d.fingerprint, status: d.status, lastSeenAt: d.lastSeenAt,
      online: d.status === "ACTIVE" && !!d.lastSeenAt && Date.parse(d.lastSeenAt) + RUNTIME_LIMITS.lostMs > Date.now()
    }));
  }
  private async owned(claims: SessionClaims, projectId: string, id: string, version?: number) {
    await this.projects.assert(claims, projectId);
    const b = await this.store.getBinding(id);
    if (!b || b.userId !== claims.sub || b.organizationId !== claims.organizationId || b.projectId !== projectId) throw new ForbiddenException("WORKSPACE_ACCESS_DENIED");
    if (version !== undefined && (!Number.isSafeInteger(version) || version !== b.version)) throw new ConflictException("WORKSPACE_BINDING_CHANGED");
    return b;
  }
  private async availability(claims: SessionClaims, b: WorkspaceBinding): Promise<WorkspaceStatus> {
    return this.identity.ledger.transaction(async tx => {
      const d = (await this.identity.device(tx, b.runtimeId)).payload;
      if (d.userId !== claims.sub || d.organizationId !== claims.organizationId) return "UNAUTHORIZED";
      if (d.fingerprint !== b.runtimeFingerprint) return "STALE";
      if (d.status !== "ACTIVE") return "REVOKED";
      const g = (await this.identity.ledger.read<RuntimeGrant>(tx, "RUNTIME_GRANT", [b.runtimeId, b.projectId]))?.payload;
      if (g?.expiresAt && Date.parse(g.expiresAt) <= Date.now() && !await persistentReadAccessTx(this.identity.ledger, tx, g)) return "EXPIRED_GRANT";
      if (!g || g.status !== "ACTIVE" || !g.capabilities.includes("filesystem.list") || !g.capabilities.includes("filesystem.read")) return "UNAUTHORIZED";
      // Reuse authoritative identity/grant/account/project checks. No signature-only authorization.
      await this.identity.activeGrant(tx, b.runtimeId, b.projectId, undefined, true);
      if (!d.lastSeenAt || Date.parse(d.lastSeenAt) + RUNTIME_LIMITS.lostMs <= Date.now()) return "OFFLINE";
      return b.status;
    });
  }
  async getBinding(claims: SessionClaims, projectId: string, id: string, version?: number) {
    const b = await this.owned(claims, projectId, id, version);
    return { ...b, status: await this.availability(claims, b) };
  }
  async listBindings(claims: SessionClaims, projectId: string) {
    await this.projects.assert(claims, projectId);
    const bindings = await this.store.listBindings(claims.sub, projectId, claims.organizationId!);
    const active = await this.store.getActiveBinding(claims.sub, projectId, claims.organizationId!);
    const resolved = [];
    for (const binding of bindings) resolved.push(await this.getBinding(claims, projectId, binding.workspaceId));
    return { activeWorkspaceId: active?.workspaceId ?? null, bindings: resolved };
  }
  async createBinding(claims: SessionClaims, projectId: string, body: unknown) {
    await this.projects.assert(claims, projectId, "EXECUTE");
    if (!isRecord(body) || Object.keys(body).some(k => !["runtimeId", "rootPath", "displayName", "requestId"].includes(k)) ||
      !validToolId(body.runtimeId) || !validToolId(body.requestId) || typeof body.displayName !== "string" || !body.displayName.trim() || body.displayName.length > 80) throw new BadRequestException("WORKSPACE_BINDING_INVALID");
    const rootPath = workspaceRoot(body.rootPath);
    const device = (await this.devices(claims, projectId)).find(d => d.runtimeId === body.runtimeId);
    if (!device || device.status !== "ACTIVE") throw new ForbiddenException("WORKSPACE_RUNTIME_UNAVAILABLE");
    // An offline identity can retain a binding, but cannot be verified or read until it reconnects.
    return this.store.createBinding({ userId: claims.sub, organizationId: claims.organizationId!, projectId, runtimeId: device.runtimeId,
      runtimeFingerprint: device.fingerprint, rootPath, displayName: body.displayName.trim() }, body.requestId as string);
  }
  async request(claims: SessionClaims, projectId: string, id: string, kind: WorkspaceOperation["kind"], body: unknown): Promise<WorkspaceOperationView> {
    boundedRuntime(body);
    if (!isRecord(body) || Object.keys(body).some(k => !["bindingVersion", "relativePath", "conversationId", "requestId", ...(kind === "SEARCH" ? ["query"] : [])].includes(k)) ||
      !Number.isSafeInteger(body.bindingVersion) || !validToolId(body.conversationId) || !validToolId(body.requestId) || !["VERIFY", "LIST", "READ", "SEARCH"].includes(kind) ||
      (kind === "SEARCH" && (typeof body.query !== "string" || !body.query.trim() || body.query.length > 512))) throw new BadRequestException("WORKSPACE_OPERATION_INVALID");
    const b = await this.owned(claims, projectId, id, Number(body.bindingVersion));
    const active = await this.store.getActiveBinding(claims.sub, projectId, claims.organizationId!);
    if (active?.workspaceId !== b.workspaceId) throw new ConflictException("WORKSPACE_BINDING_STALE");
    const status = await this.availability(claims, b);
    if (!["READY", "VERIFYING", "DIRECTORY_MISSING"].includes(status)) throw new ConflictException({ code: status, message: `Workspace ${status.toLowerCase()}` });
    if (kind !== "VERIFY" && (!b.verifiedAt || b.status !== "READY")) throw new ConflictException("WORKSPACE_VERIFICATION_REQUIRED");
    const target = workspaceTarget(b.rootPath, kind === "VERIFY" ? "" : body.relativePath ?? "");
    if (kind === "READ" && !target.relativePath) throw new BadRequestException("WORKSPACE_FILE_REQUIRED");
    if (kind === "READ") new FileIntelligenceSecurityService().assertSafeFileName(target.relativePath);
    if (kind !== "VERIFY") {
      new FileIntelligenceSecurityService().assertSafeFileName(target.relativePath);
      if (target.relativePath.split("/").some(excludedFromWorkspaceDiscovery)) throw new ForbiddenException("WORKSPACE_PATH_DENIED");
    }
    const runtimeRequestId = `wsrequest_${toolDigest([b.workspaceId, b.version, body.requestId])}`;
    const operation = await this.store.saveOperation({ operationId: `wsop_${toolDigest(runtimeRequestId)}`, workspaceId: b.workspaceId, bindingVersion: b.version,
      projectId, organizationId: claims.organizationId!, userId: claims.sub, runtimeId: b.runtimeId, conversationId: body.conversationId as string,
      runtimeRequestId, runId: `rtrun_${toolDigest([claims.sub, body.conversationId, runtimeRequestId])}`,
      kind, tool: kind === "READ" ? "filesystem.read" : kind === "SEARCH" ? "filesystem.search" : "filesystem.list", ...(kind === "SEARCH" ? { query: body.query as string } : {}), ...target, createdAt: new Date().toISOString() });
    // Intent first, deterministic runtime request second. A retry can only recreate the same approved READ operation.
    await this.control.propose(claims, { projectId, conversationId: operation.conversationId, runtimeId: b.runtimeId, tool: operation.tool,
      input: { path: target.absolutePath, ...(kind === "SEARCH" ? { query: body.query } : {}) }, requestId: runtimeRequestId, purpose: `Workspace ${kind.toLowerCase()} · ${b.workspaceId} · v${b.version}` }, { binding: b, operationId: operation.operationId });
    // Presentation reference only. It cannot supply a path or grant authority.
    await this.identity.ledger.transaction(async tx => {
      const conversation = await tx.conversation.findUnique({ where: { id: operation.conversationId } });
      if (!conversation || conversation.userId !== claims.sub || conversation.projectId !== projectId) throw new ForbiddenException("WORKSPACE_CONVERSATION_DENIED");
      await tx.conversation.update({ where: { id: conversation.id }, data: { metadata: { ...(conversation.metadata ?? {}), runtimeWorkspace: { workspaceId: b.workspaceId, bindingVersion: b.version } } } });
    });
    return this.operation(claims, projectId, id, b.version, operation.operationId);
  }
  async operation(claims: SessionClaims, projectId: string, id: string, version: number, operationId: string): Promise<WorkspaceOperationView> {
    const b = await this.owned(claims, projectId, id, version), op = await this.store.getOperation(operationId);
    if (!op || op.workspaceId !== b.workspaceId || op.bindingVersion !== b.version || op.userId !== claims.sub || op.organizationId !== claims.organizationId || op.projectId !== projectId || op.runtimeId !== b.runtimeId) throw new ForbiddenException("WORKSPACE_OPERATION_DENIED");
    const availability = await this.availability(claims, b);
    if (availability === "OFFLINE" || availability === "REVOKED" || availability === "EXPIRED_GRANT" || availability === "UNAUTHORIZED" || availability === "STALE") return { operation: op, state: availability };
    const snapshot = await this.control.snapshot(claims, op.runId, op.planVersion);
    if (!snapshot) return { operation: op, state: "FAILED", message: "Saved operation cannot be verified because its Runtime proposal is missing; execution outcome is unknown. This status check does not retry the operation. A new operation requires current authorization and an explicit request." };
    const { proposal: p, execution: e } = snapshot;
    const expectedInput = { path: op.absolutePath, ...(op.tool === "filesystem.search" ? { query: op.query } : {}) };
    if (p.projectId !== projectId || p.userId !== claims.sub || p.organizationId !== claims.organizationId || p.runtimeId !== op.runtimeId ||
      p.conversationId !== op.conversationId || p.runId !== op.runId || p.toolId !== op.tool || toolDigest(p.validatedInput) !== toolDigest(expectedInput) ||
      (op.planVersion !== undefined && (p.planVersion !== op.planVersion || p.inspection?.operationId !== op.operationId || p.inspection.workspaceId !== b.workspaceId || p.inspection.bindingVersion !== b.version || p.inspection.runtimeFingerprint !== b.runtimeFingerprint))) throw new ConflictException("WORKSPACE_RECEIPT_MISMATCH");
    if (!e && p.state === "AWAITING_APPROVAL") {
      const obsolete = await this.identity.ledger.transaction(async tx => {
        const grant = (await this.identity.ledger.read<RuntimeGrant>(tx, "RUNTIME_GRANT", [p.runtimeId, p.projectId]))?.payload;
        const approval = p.approvalId ? await tx.agentApproval.findUnique({ where: { id: p.approvalId }, select: { status: true, dueAt: true } }) : null;
        if (!grant || grant.status !== "ACTIVE" || grant.grantId !== p.grantId || grant.version !== p.grantVersion) return "The previous approval is stale because the Runtime grant changed. Request a new operation when needed.";
        if (!approval || approval.status !== "PENDING" || !approval.dueAt || new Date(approval.dueAt).getTime() <= Date.now() || !Number.isFinite(new Date(approval.dueAt).getTime())) return "The previous approval expired or is no longer pending. Request a new operation when needed.";
        return null;
      });
      if (obsolete) return { operation: op, state: "STALE", message: obsolete };
    }
    if (!e) return { operation: op, state: p.state === "AWAITING_APPROVAL" ? "APPROVAL_REQUIRED" : p.state === "APPROVED" ? "EXECUTING" : "DENIED",
      ...(["REJECTED", "CANCELLED"].includes(p.state) ? { message: `The previous Runtime proposal was ${p.state.toLowerCase()} before execution. This is not a filesystem permission result. Request a new operation explicitly when needed.` } : {}) };
    if (e.attribution.proposalId !== p.proposalId || e.attribution.runtimeId !== op.runtimeId || e.attribution.tool !== op.tool ||
      toolDigest(e.attribution.validatedInput) !== toolDigest(expectedInput) || (op.planVersion !== undefined && (e.attribution.agentRunId !== op.runId || e.attribution.planId !== p.planId || e.attribution.planVersion !== op.planVersion || e.attribution.userId !== op.userId || e.attribution.projectId !== op.projectId || e.attribution.conversationId !== op.conversationId || e.attribution.organizationId !== op.organizationId))) throw new ConflictException("WORKSPACE_RECEIPT_MISMATCH");
    if (["CREATED", "AUTHORIZED", "DISPATCHED", "RUNNING"].includes(e.state)) return { operation: op, state: "EXECUTING" };
    const r = e.result;
    if (e.state !== "SUCCEEDED" || e.verificationState !== "VERIFIED" || !r || r.executionId !== e.attribution.executionId || r.operationDigest !== e.attribution.operationDigest) {
      const missing = r?.error === "ENOENT" || r?.error === "ENOTDIR", denied = r?.error === "EACCES" || r?.error === "EPERM";
      if (missing && op.relativePath === "" && b.status !== "DIRECTORY_MISSING") await this.store.updateBinding(b.workspaceId, b.revision, { status: "DIRECTORY_MISSING" });
      return { operation: op, state: missing ? op.kind === "READ" ? "NOT_FOUND" : "DIRECTORY_MISSING" : denied ? "DENIED" : "FAILED", message: e.state === "OUTCOME_UNKNOWN" ? "Runtime outcome unknown. This operation is not replayed automatically." : "Runtime did not return a verified successful result." };
    }
    const receipt = { workspaceId: b.workspaceId, bindingVersion: b.version, runtimeId: b.runtimeId, relativePath: op.relativePath,
      receiptId: e.attribution.executionId, observedAt: r.finishedAt, operationId: op.operationId, truncated: r.truncated };
    if (op.tool === "filesystem.list") {
      if (r.result.path !== op.absolutePath || !Array.isArray(r.result.entries) || r.result.entries.length > RUNTIME_LIMITS.entries) throw new ConflictException("WORKSPACE_RECEIPT_INVALID");
      const entries = r.result.entries.map((entry: any) => {
        if (!isRecord(entry) || typeof entry.name !== "string" || /[\\/]/.test(entry.name) || !["file", "directory", "other"].includes(String(entry.type))) throw new ConflictException("WORKSPACE_RECEIPT_INVALID");
        const child = workspaceTarget(b.rootPath, [op.relativePath, entry.name].filter(Boolean).join("/"));
        return { name: entry.name, path: child.relativePath, type: entry.type as "file" | "directory" | "other" };
      });
      if (op.kind === "VERIFY" && b.verificationReceiptId !== receipt.receiptId && (!b.verifiedAt || Date.parse(receipt.observedAt) > Date.parse(b.verifiedAt))) {
        try { await this.store.verifyBinding(b, receipt.receiptId, receipt.observedAt); }
        catch (error) { if (!(error instanceof ConflictException)) throw error; const fresh = await this.store.getBinding(id); if (fresh?.verificationReceiptId !== receipt.receiptId) throw error; }
      }
      // Project the same navigation policy used by request(). Keep the signed
      // receipt intact; excluded children must not appear as loadable folders.
      const security = new FileIntelligenceSecurityService();
      const accessible = entries.filter(entry => {
        if (entry.path.split("/").some(excludedFromWorkspaceDiscovery)) return false;
        try { security.assertSafeFileName(entry.path); return true; }
        catch (error) { if (error instanceof FileIntelligenceError) return false; throw error; }
      });
      return { operation: op, state: r.truncated ? "TRUNCATED" : "READY", receipt, entries: accessible,
        ...(accessible.length !== entries.length ? { message: "Some entries are excluded by workspace access policy." } : {}) };
    }
    if (op.tool === "filesystem.search") {
      if (!Array.isArray(r.result.matches) || r.result.matches.length > 64) throw new ConflictException("WORKSPACE_RECEIPT_INVALID");
      const security = new FileIntelligenceSecurityService();
      const matches = r.result.matches.map((m: any) => {
        if (!isRecord(m) || typeof m.path !== "string" || typeof m.text !== "string" || m.text.length > 256 || !Number.isSafeInteger(m.line) || Number(m.line) < 1) throw new ConflictException("WORKSPACE_RECEIPT_INVALID");
        const relativePath = win32.relative(b.rootPath, m.path).replace(/\\/g, "/"), target = workspaceTarget(b.rootPath, relativePath);
        if (target.absolutePath !== m.path || !(relativePath === op.relativePath || !op.relativePath || relativePath.startsWith(`${op.relativePath}/`))) throw new ConflictException("WORKSPACE_RECEIPT_MISMATCH");
        security.assertSafeFileName(relativePath); security.assertNoSecrets(m.text);
        if (relativePath.split("/").some(excludedFromWorkspaceDiscovery)) throw new ConflictException("WORKSPACE_RECEIPT_INVALID");
        return { path: relativePath, line: Number(m.line), text: m.text };
      });
      return { operation: op, state: r.truncated ? "TRUNCATED" : "READY", receipt, matches };
    }
    if (r.result.path !== op.absolutePath || typeof r.stdout !== "string" || typeof r.result.bytesRead !== "number" || r.result.bytesRead > RUNTIME_LIMITS.readBytes) throw new ConflictException("WORKSPACE_RECEIPT_INVALID");
    const ext = win32.extname(op.relativePath).toLowerCase();
    if (/\.(?:exe|dll|bin|zip|7z|rar|tar|gz|db|sqlite|sqlite3|pdf|png|jpe?g|gif|webp|ico|woff2?|ttf|mp[34]|wav|docx?|xlsx?|pptx?)$/i.test(op.relativePath) ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ufffd]/.test(r.stdout) || Buffer.byteLength(r.stdout) !== r.result.bytesRead || /^(?:MZ|PK\x03\x04|%PDF-|SQLite format)/.test(r.stdout)) return { operation: op, state: "UNSUPPORTED", receipt, message: "Unsupported content or decoding. Original bytes are not available from this runtime read." };
    try { const security = new FileIntelligenceSecurityService(); security.assertSafeFileName(op.relativePath); security.assertNoSecrets(r.stdout); }
    catch { return { operation: op, state: "DENIED", message: "Content is not admitted to the Workspace viewer." }; }
    return { operation: op, state: r.truncated ? "TRUNCATED" : "READY", receipt, file: { text: r.stdout, fileName: win32.basename(op.relativePath),
      mimeType: ext === ".html" ? "text/html" : "text/plain", language: ext.slice(1) || "text",
      warnings: ["UTF-8 decoded text returned by the runtime; original bytes were not inspected.", ...(r.truncated ? ["Read limited to 32 KiB; content is incomplete."] : [])] } };
  }
  async latest(claims: SessionClaims, projectId: string, id: string, version: number, path: string, tool: WorkspaceOperation["tool"]) {
    const b = await this.owned(claims, projectId, id, version), target = workspaceTarget(b.rootPath, path);
    const op = (await this.store.listOperations(id)).find(o => o.bindingVersion === version && o.relativePath === target.relativePath && o.tool === tool);
    return op ? this.operation(claims, projectId, id, version, op.operationId) : null;
  }
}
