import { ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { SessionClaims } from "../auth/auth.dto";
import { ResourceAuthorizationService } from "../auth/resource-authz.service";
import { isRecord, toolSubject } from "../agent-runtime/tools/tool-contract";
import { WorkspaceStoreService } from "../workspace-intelligence/workspace-store.service";
import { workspaceRoot } from "../workspace-intelligence/workspace-runtime.contract";
import { RuntimeIdentityService } from "./runtime-identity.service";
import { RUNTIME_LIMITS, runtimeError, type RuntimeDevice } from "./runtime.contract";

export interface FolderSelection {
  selectionId: string; userId: string; organizationId: string; projectId: string; runtimeId: string;
  fingerprint: string; connectionEpoch: number; bindingId: string | null; bindingVersion: number;
  session: { id: string; issuedAt: number; expiresAt: number }; expiresAt: string;
  state: "PENDING" | "DISPATCHED" | "SELECTED" | "CANCELLED" | "EXPIRED";
  rootPath: string | null;
}

/** User-interface request only. A selected path grants no file access and is never model evidence. */
@Injectable()
export class RuntimeFolderService {
  constructor(@Inject(RuntimeIdentityService) private readonly identity: RuntimeIdentityService,
    @Inject(WorkspaceStoreService) private readonly workspaces: WorkspaceStoreService) {}
  private async validate(tx: any, s: FolderSelection, device?: RuntimeDevice) {
    const actor = await this.identity.actor(tx, s.userId, s.organizationId, s.projectId, s.session);
    await new ResourceAuthorizationService(tx).assertAuthorized(toolSubject(actor), "EXECUTE", { resourceType: "Project", id: s.projectId, projectId: s.projectId, organizationId: s.organizationId });
    const d = device ?? (await this.identity.device(tx, s.runtimeId)).payload;
    if (d.runtimeId !== s.runtimeId || d.userId !== s.userId || d.organizationId !== s.organizationId || d.status !== "ACTIVE" || d.fingerprint !== s.fingerprint || d.connectionEpoch !== s.connectionEpoch || d.folderPickerProtocol !== 1) throw new ForbiddenException("FOLDER_RUNTIME_CHANGED");
    if (!d.lastSeenAt || Date.parse(d.lastSeenAt) + RUNTIME_LIMITS.lostMs <= Date.now()) throw new ConflictException("RUNTIME_OFFLINE");
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(1936026472, 1953657906)");
    const b = await this.workspaces.activeBindingTx(tx, s.userId, s.projectId, s.organizationId);
    if ((b?.workspaceId ?? null) !== s.bindingId || (b?.version ?? 0) !== s.bindingVersion) throw new ConflictException("WORKSPACE_BINDING_CHANGED");
  }
  async request(claims: SessionClaims, projectId: string, runtimeId: string) {
    return this.identity.ledger.transaction(async tx => {
      const d = (await this.identity.device(tx, runtimeId)).payload;
      const b = await this.workspaces.activeBindingTx(tx, claims.sub, projectId, claims.organizationId!);
      const s: FolderSelection = { selectionId: randomUUID(), userId: claims.sub, organizationId: claims.organizationId!, projectId, runtimeId,
        fingerprint: d.fingerprint, connectionEpoch: d.connectionEpoch, bindingId: b?.workspaceId ?? null, bindingVersion: b?.version ?? 0,
        session: { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp }, expiresAt: new Date(Date.now() + 180000).toISOString(), state: "PENDING", rootPath: null };
      await this.validate(tx, s, d);
      // At most one dialog per device. A disconnected or ambiguous dialog is never replayed.
      for (const old of await this.identity.ledger.list<FolderSelection>(tx, "RUNTIME_FOLDER_SELECTION", runtimeId)) {
        if (["PENDING", "DISPATCHED"].includes(old.payload.state) && Date.parse(old.payload.expiresAt) > Date.now()) throw new ConflictException("FOLDER_SELECTION_IN_PROGRESS");
        await this.identity.ledger.update(tx, old, { ...old.payload, state: "EXPIRED" }, `${runtimeId}:settled`);
      }
      await this.identity.ledger.create(tx, "RUNTIME_FOLDER_SELECTION", s.selectionId, s, { immutable: false, route: runtimeId });
      return this.view(s);
    });
  }
  async observe(claims: SessionClaims, projectId: string, selectionId: string) {
    return this.identity.ledger.transaction(async tx => {
      const row = await this.identity.ledger.read<FolderSelection>(tx, "RUNTIME_FOLDER_SELECTION", selectionId), s = row?.payload;
      if (!s || s.userId !== claims.sub || s.organizationId !== claims.organizationId || s.projectId !== projectId || s.session.id !== claims.sessionId) throw new ForbiddenException("FOLDER_SELECTION_DENIED");
      await this.validate(tx, s);
      return this.view(Date.parse(s.expiresAt) <= Date.now() ? { ...s, state: "EXPIRED", rootPath: null } : s);
    });
  }
  async dispatch(tx: any, device: RuntimeDevice) {
    if (device.folderPickerProtocol !== 1) return null;
    for (const row of await this.identity.ledger.list<FolderSelection>(tx, "RUNTIME_FOLDER_SELECTION", device.runtimeId)) {
      const s = row.payload;
      if (Date.parse(s.expiresAt) <= Date.now()) { await this.identity.ledger.update(tx, row, { ...s, state: "EXPIRED" }, `${device.runtimeId}:settled`); continue; }
      if (s.state !== "PENDING") continue;
      try { await this.validate(tx, s, device); }
      catch (error) { if (![400, 401, 403, 409].includes((error as any)?.getStatus?.())) throw error; await this.identity.ledger.update(tx, row, { ...s, state: "CANCELLED" }, `${device.runtimeId}:settled`); continue; }
      await this.identity.ledger.update(tx, row, { ...s, state: "DISPATCHED" });
      return { selectionId: s.selectionId, expiresAt: s.expiresAt };
    }
    return null;
  }
  async result(tx: any, device: RuntimeDevice, body: unknown) {
    if (!isRecord(body) || Object.keys(body).some(k => !["selectionId", "rootPath"].includes(k)) || typeof body.selectionId !== "string" || !(body.rootPath === null || typeof body.rootPath === "string")) runtimeError("FOLDER_RESULT_INVALID");
    const row = await this.identity.ledger.read<FolderSelection>(tx, "RUNTIME_FOLDER_SELECTION", body.selectionId);
    if (!row || row.payload.state !== "DISPATCHED" || Date.parse(row.payload.expiresAt) <= Date.now()) throw new ConflictException("FOLDER_SELECTION_EXPIRED_OR_CONSUMED");
    await this.validate(tx, row.payload, device);
    const s: FolderSelection = { ...row.payload, state: body.rootPath === null ? "CANCELLED" : "SELECTED", rootPath: body.rootPath === null ? null : workspaceRoot(body.rootPath) };
    await this.identity.ledger.update(tx, row, s, `${device.runtimeId}:settled`);
    return this.view(s);
  }
  private view(s: FolderSelection) { return { selectionId: s.selectionId, runtimeId: s.runtimeId, expiresAt: s.expiresAt, state: s.state, rootPath: s.rootPath }; }
}
