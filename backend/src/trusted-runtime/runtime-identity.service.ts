import { startDiagnostic } from "./runtime-start-diagnostics";
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes, verify } from "node:crypto";
import type { SessionClaims, AuthRoleDto } from "../auth/auth.dto";
import { ResourceAuthorizationService } from "../auth/resource-authz.service";
import { isRecord, toolDigest, toolSubject, validToolId } from "../agent-runtime/tools/tool-contract";
import { RuntimeLedgerService } from "./runtime-ledger.service";
import { developmentReadPolicy, persistentReadAccessTx, workspaceReadTool } from "./development-read-policy";
import { boundedRuntime, RUNTIME_GRANT_RENEWAL_MAX_MS, RUNTIME_LIMITS, RUNTIME_TOOLS, RUNTIME_VERSION, runtimeError, runtimeKey, runtimePublicKey, runtimeSigningText,
  type RuntimeCapabilityEnrollment, type RuntimeAuth, type RuntimeChallenge, type RuntimeDevice, type RuntimeGrant, type RuntimeTool } from "./runtime.contract";

const roles: AuthRoleDto[] = ["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"];
@Injectable()
export class RuntimeIdentityService {
  constructor(@Inject(RuntimeLedgerService) readonly ledger: RuntimeLedgerService) {}

  /** Reuses current account, organization and ResourceAuthorization semantics.
   * Row locks prevent membership/session changes racing a committed dispatch. */
  async actor(tx: any, userId: string, organizationId: string, projectId?: string, session?: { id: string; issuedAt: number; expiresAt: number }): Promise<SessionClaims> {
    await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id"=$1 FOR SHARE', userId);
    await tx.$queryRawUnsafe('SELECT "userId" FROM "UserRole" WHERE "userId"=$1 FOR SHARE', userId);
    await tx.$queryRawUnsafe('SELECT r."id" FROM "Role" r JOIN "UserRole" ur ON ur."roleId"=r."id" WHERE ur."userId"=$1 FOR SHARE OF r', userId);
    const user = await tx.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
    const role = user?.roles?.[0]?.role?.key as AuthRoleDto;
    if (!user || user.status !== "active" || !organizationId || user.organizationId !== organizationId || !roles.includes(role)) throw new UnauthorizedException("RUNTIME_OWNER_INVALID");
    if (session) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "UserSession" WHERE "id"=$1 FOR SHARE', session.id);
      const row = await tx.userSession.findUnique({ where: { id: session.id } });
      if (!row || row.userId !== userId || row.revokedAt || new Date(row.expiresAt).getTime() <= Date.now() || session.expiresAt * 1000 <= Date.now() ||
        (user.sessionRevokedAt && session.issuedAt <= Math.floor(new Date(user.sessionRevokedAt).getTime() / 1000))) throw new UnauthorizedException("RUNTIME_AUTHORIZING_SESSION_INVALID");
    }
    const claims: SessionClaims = { sub: user.id, email: user.email, displayName: user.displayName, role, organizationId,
      sessionId: session?.id ?? "runtime-device-authentication", iat: session?.issuedAt, exp: session?.expiresAt ?? Math.floor(Date.now() / 1000) + 30 };
    if (projectId) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Project" WHERE "id"=$1 FOR SHARE', projectId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "ProjectMember" WHERE "projectId"=$1 AND "userId"=$2 FOR SHARE', projectId, userId);
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project || project.organizationId !== organizationId) throw new ForbiddenException("RUNTIME_PROJECT_SCOPE_INVALID");
      await new ResourceAuthorizationService(tx).assertAuthorized(toolSubject(claims), "READ", { resourceType: "Project", id: projectId, projectId, organizationId });
    }
    return claims;
  }
  async enrollment(publicKey: unknown, runtimeVersion: unknown) {
    const key = runtimePublicKey(publicKey);
    if (typeof runtimeVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(runtimeVersion)) runtimeError("RUNTIME_VERSION_INVALID");
    const code = randomBytes(12).toString("hex"), now = new Date();
    const challenge: RuntimeChallenge = { challengeId: runtimeKey("RUNTIME_CHALLENGE", ["enroll", code]), runtimeId: runtimeKey("RUNTIME_DEVICE", key.fingerprint), connectionEpoch: 0,
      nonce: randomBytes(32).toString("hex"), operation: "enroll", bodyDigest: toolDigest(key.publicKey), expiresAt: new Date(now.getTime() + 600000).toISOString() };
    await this.ledger.transaction(tx => this.ledger.create(tx, "RUNTIME_CHALLENGE", ["enroll", code], { challenge, ...key, runtimeVersion, proved: false }, { immutable: false }));
    return { code, challenge };
  }
  async proveEnrollment(code: string, timestamp: string, signature: string) {
    return this.ledger.transaction(async tx => {
      const row = await this.ledger.read<any>(tx, "RUNTIME_CHALLENGE", ["enroll", code]);
      if (!row || row.payload.proved || Date.parse(row.payload.challenge.expiresAt) <= Date.now()) throw new UnauthorizedException("RUNTIME_ENROLLMENT_EXPIRED");
      this.signature(row.payload.challenge, timestamp, signature, row.payload.publicKey);
      await this.ledger.update(tx, row, { ...row.payload, proved: true });
      return { proved: true };
    });
  }
  async enroll(claims: SessionClaims, code: string, displayName: string) {
    if (!/^[a-f0-9]{24}$/.test(code) || typeof displayName !== "string" || !displayName.trim() || displayName.length > 80) runtimeError("RUNTIME_ENROLLMENT_INVALID");
    return this.ledger.transaction(async tx => {
      await this.actor(tx, claims.sub, claims.organizationId!, undefined, { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
      const enrollment = await this.ledger.read<any>(tx, "RUNTIME_CHALLENGE", ["enroll", code]);
      if (!enrollment?.payload.proved || Date.parse(enrollment.payload.challenge.expiresAt) <= Date.now()) throw new UnauthorizedException("RUNTIME_ENROLLMENT_INVALID");
      const data = enrollment.payload, prior = await this.ledger.read<RuntimeDevice>(tx, "RUNTIME_DEVICE", data.fingerprint);
      if (prior) { if (prior.payload.userId !== claims.sub || prior.payload.organizationId !== claims.organizationId || prior.payload.status !== "ACTIVE") throw new ForbiddenException("RUNTIME_FINGERPRINT_RESERVED"); return prior.payload; }
      await this.ledger.create(tx, "RUNTIME_AUTH_CONSUMPTION", ["enroll", code], { userId: claims.sub });
      const now = new Date().toISOString();
      const device: RuntimeDevice = { runtimeId: runtimeKey("RUNTIME_DEVICE", data.fingerprint), userId: claims.sub, organizationId: claims.organizationId!, displayName: displayName.trim(),
        publicKey: data.publicKey, fingerprint: data.fingerprint, keyVersion: 1, status: "ACTIVE", connectionEpoch: 0, protocolVersion: RUNTIME_VERSION,
        runtimeVersion: data.runtimeVersion, lastSeenAt: null, createdAt: now, updatedAt: now, revokedAt: null };
      await this.ledger.create(tx, "RUNTIME_FINGERPRINT", data.fingerprint, { runtimeId: device.runtimeId, publicKey: device.publicKey });
      await this.ledger.create(tx, "RUNTIME_DEVICE", data.fingerprint, device, { immutable: false, route: claims.sub });
      return device;
    });
  }
  async device(tx: any, runtimeId: string) {
    const row = await tx.auditEvent.findUnique({ where: { id: runtimeId } });
    if (!row) throw new UnauthorizedException("RUNTIME_UNKNOWN");
    return this.ledger.decode<RuntimeDevice>(row, "RUNTIME_DEVICE");
  }
  async challenge(runtimeId: string, operation: string, body: unknown) {
    if (!["connect", "poll", "started", "heartbeat", "result", "folder-result"].includes(operation)) runtimeError("RUNTIME_OPERATION_INVALID");
    boundedRuntime(body);
    return this.ledger.transaction(async tx => {
      const device = (await this.device(tx, runtimeId)).payload;
      if (device.status !== "ACTIVE") throw new UnauthorizedException("RUNTIME_NOT_ACTIVE");
      const nonce = randomBytes(32).toString("hex");
      const challenge: RuntimeChallenge = { challengeId: runtimeKey("RUNTIME_CHALLENGE", nonce), runtimeId, connectionEpoch: device.connectionEpoch,
        nonce, operation, bodyDigest: toolDigest(body), expiresAt: new Date(Date.now() + RUNTIME_LIMITS.challengeMs).toISOString() };
      await this.ledger.create(tx, "RUNTIME_CHALLENGE", nonce, challenge);
      return challenge;
    });
  }
  async authenticate(tx: any, operation: string, body: unknown, auth: RuntimeAuth): Promise<RuntimeDevice> {
    boundedRuntime(auth); boundedRuntime(body);
    if (!auth || typeof auth.challengeId !== "string") throw new UnauthorizedException("RUNTIME_AUTH_REQUIRED");
    const device = (await this.device(tx, auth.runtimeId)).payload;
    if (device.status !== "ACTIVE" || auth.connectionEpoch !== device.connectionEpoch) throw new UnauthorizedException("RUNTIME_IDENTITY_REVOKED_OR_STALE");
    const raw = await tx.auditEvent.findUnique({ where: { id: auth.challengeId } });
    if (!raw) throw new UnauthorizedException("RUNTIME_CHALLENGE_UNKNOWN");
    const c = this.ledger.decode<RuntimeChallenge>(raw, "RUNTIME_CHALLENGE").payload;
    if (c.runtimeId !== device.runtimeId || c.connectionEpoch !== device.connectionEpoch || c.operation !== operation || c.bodyDigest !== toolDigest(body) || Date.parse(c.expiresAt) <= Date.now()) throw new UnauthorizedException("RUNTIME_CHALLENGE_INVALID");
    this.signature(c, auth.timestamp, auth.signature, device.publicKey);
    const diagnostic = operation === "started" ? startDiagnostic("backend", { challengeId: c.challengeId, executionId: (body as { executionId?: unknown } | null)?.executionId }) : undefined;
    diagnostic?.emit("AUTH_VERIFIED");
    if (await this.ledger.read(tx, "RUNTIME_AUTH_CONSUMPTION", c.challengeId)) throw new UnauthorizedException("RUNTIME_AUTH_REPLAY");
    await this.ledger.create(tx, "RUNTIME_AUTH_CONSUMPTION", c.challengeId, { runtimeId: device.runtimeId, consumedAt: new Date().toISOString() });
    diagnostic?.emit("CONSUMPTION_STAGED");
    await this.actor(tx, device.userId, device.organizationId);
    return device;
  }
  private signature(c: RuntimeChallenge, timestamp: string, signature: string, key: string) {
    if (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp)) || Math.abs(Date.now() - Date.parse(timestamp)) > RUNTIME_LIMITS.challengeMs ||
      typeof signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) throw new UnauthorizedException("RUNTIME_SIGNATURE_INVALID");
    if (!verify(null, Buffer.from(runtimeSigningText(c, timestamp)), key, Buffer.from(signature, "base64"))) throw new UnauthorizedException("RUNTIME_SIGNATURE_INVALID");
  }
  async devices(claims: SessionClaims) {
    return this.ledger.transaction(async tx => { await this.actor(tx, claims.sub, claims.organizationId!); return (await this.ledger.list<RuntimeDevice>(tx, "RUNTIME_DEVICE", claims.sub)).map(r => r.payload); });
  }
  async setDeviceStatus(claims: SessionClaims, runtimeId: string, status: "REVOKED" | "DISABLED") {
    if (!["REVOKED", "DISABLED"].includes(status)) runtimeError("RUNTIME_STATUS_INVALID");
    return this.ledger.transaction(async tx => {
      const record = await this.device(tx, runtimeId); await this.actor(tx, claims.sub, claims.organizationId!);
      if (record.payload.userId !== claims.sub || record.payload.organizationId !== claims.organizationId) throw new ForbiddenException("RUNTIME_OWNER_MISMATCH");
      return (await this.ledger.update(tx, record, { ...record.payload, status, connectionEpoch: record.payload.connectionEpoch + 1, revokedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })).payload;
    });
  }
  /** No historical grant migration or fallback: configuration exists only after this explicit operation. */
  async configureCapabilities(claims: SessionClaims, body: unknown): Promise<RuntimeCapabilityEnrollment> {
    boundedRuntime(body);
    if (!isRecord(body) || Object.keys(body).sort().join(",") !== "capabilities,expectedRevision,mode,projectId,runtimeId" ||
      body.mode !== "TRUSTED_MACHINE" || !validToolId(body.runtimeId) || !validToolId(body.projectId) ||
      !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 ||
      !Array.isArray(body.capabilities) || !body.capabilities.length ||
      body.capabilities.some(c => !RUNTIME_TOOLS.includes(c as RuntimeTool)) ||
      new Set(body.capabilities).size !== body.capabilities.length) runtimeError("RUNTIME_CAPABILITY_ENROLLMENT_INVALID");
    const input = body as { runtimeId: string; projectId: string; capabilities: RuntimeTool[]; expectedRevision: number };
    return this.ledger.transaction(async tx => {
      const device = await this.capabilityConfigurationActor(tx, claims, input.runtimeId, input.projectId);
      const key = [claims.sub, claims.organizationId!, input.projectId, input.runtimeId];
      const prior = await this.ledger.read<RuntimeCapabilityEnrollment>(tx, "RUNTIME_CAPABILITY_ENROLLMENT", key);
      if ((prior?.revision ?? 0) !== input.expectedRevision) runtimeError("RUNTIME_CAPABILITY_ENROLLMENT_CHANGED");
      if (prior && prior.payload.runtimeFingerprint !== device.fingerprint) runtimeError("RUNTIME_IDENTITY_MISMATCH");
      const capabilities = [...input.capabilities].sort();
      if (prior && prior.payload.status === "ACTIVE" && prior.payload.expiresAt === null && prior.payload.revokedAt === null &&
        toolDigest(prior.payload.capabilities) === toolDigest(capabilities)) return prior.payload;
      const enrollment: RuntimeCapabilityEnrollment = { enrollmentId: runtimeKey("RUNTIME_CAPABILITY_ENROLLMENT", key),
        revision: (prior?.revision ?? 0) + 1, userId: claims.sub, organizationId: claims.organizationId!, projectId: input.projectId,
        runtimeId: input.runtimeId, runtimeFingerprint: device.fingerprint, capabilities,
        configuredBy: claims.sub, configuredAt: new Date().toISOString(), status: "ACTIVE", expiresAt: null, revokedAt: null };
      return (prior ? await this.ledger.update(tx, prior, enrollment) :
        await this.ledger.create(tx, "RUNTIME_CAPABILITY_ENROLLMENT", key, enrollment, { immutable: false, route: claims.sub })).payload;
    });
  }
  async capabilityEnrollment(claims: SessionClaims, runtimeId: string, projectId: string): Promise<RuntimeCapabilityEnrollment | null> {
    if (!validToolId(runtimeId) || !validToolId(projectId)) runtimeError("RUNTIME_CAPABILITY_ENROLLMENT_INVALID");
    return this.ledger.transaction(async tx => {
      const device = await this.capabilityConfigurationActor(tx, claims, runtimeId, projectId);
      const row = await this.ledger.read<RuntimeCapabilityEnrollment>(tx, "RUNTIME_CAPABILITY_ENROLLMENT", [claims.sub, claims.organizationId!, projectId, runtimeId]);
      if (row && row.payload.runtimeFingerprint !== device.fingerprint) runtimeError("RUNTIME_IDENTITY_MISMATCH");
      return row?.payload ?? null;
    });
  }
  private async capabilityConfigurationActor(tx: any, claims: SessionClaims, runtimeId: string, projectId: string) {
    const device = (await this.device(tx, runtimeId)).payload;
    const fresh = await this.actor(tx, claims.sub, claims.organizationId!, projectId,
      { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
    await new ResourceAuthorizationService(tx).assertAuthorized(toolSubject(fresh), "EXECUTE",
      { resourceType: "Project", id: projectId, projectId, organizationId: claims.organizationId });
    if (device.userId !== claims.sub || device.organizationId !== claims.organizationId || device.status !== "ACTIVE") throw new ForbiddenException("RUNTIME_OWNER_MISMATCH");
    return device;
  }
  /** Explicit lifecycle renewal only: the caller selects a revision, never capabilities or an expiry timestamp. */
  async renewGrant(claims: SessionClaims, body: unknown): Promise<RuntimeGrant> {
    boundedRuntime(body);
    if (!isRecord(body) || Object.keys(body).sort().join(",") !== "durationSeconds,enrollmentRevision,expectedGrantVersion,projectId,requestId,runtimeId" ||
      !validToolId(body.runtimeId) || !validToolId(body.projectId) || !validToolId(body.requestId) ||
      !Number.isSafeInteger(body.enrollmentRevision) || Number(body.enrollmentRevision) < 1 ||
      !Number.isSafeInteger(body.expectedGrantVersion) || Number(body.expectedGrantVersion) < 0 ||
      !Number.isSafeInteger(body.durationSeconds) || Number(body.durationSeconds) < 1 ||
      Number(body.durationSeconds) * 1000 > RUNTIME_GRANT_RENEWAL_MAX_MS) runtimeError("RUNTIME_GRANT_RENEWAL_INVALID");
    const input = body as { runtimeId: string; projectId: string; requestId: string; enrollmentRevision: number; expectedGrantVersion: number; durationSeconds: number };
    return this.ledger.transaction(async tx => {
      const device = await this.capabilityConfigurationActor(tx, claims, input.runtimeId, input.projectId);
      const enrollmentKey = [claims.sub, claims.organizationId!, input.projectId, input.runtimeId];
      const row = await this.ledger.read<RuntimeCapabilityEnrollment>(tx, "RUNTIME_CAPABILITY_ENROLLMENT", enrollmentKey), e = row?.payload;
      const now = Date.now();
      if (!e || e.status !== "ACTIVE" || e.revokedAt || e.expiresAt === undefined ||
        (e.expiresAt !== null && (!Number.isFinite(Date.parse(e.expiresAt)) || Date.parse(e.expiresAt) <= now))) runtimeError("RUNTIME_CAPABILITY_ENROLLMENT_INVALID");
      if (row!.revision !== input.enrollmentRevision || e.revision !== row!.revision) runtimeError("RUNTIME_CAPABILITY_ENROLLMENT_CHANGED");
      if (e.userId !== claims.sub || e.organizationId !== claims.organizationId || e.projectId !== input.projectId ||
        e.runtimeId !== input.runtimeId || e.runtimeFingerprint !== device.fingerprint ||
        e.enrollmentId !== runtimeKey("RUNTIME_CAPABILITY_ENROLLMENT", enrollmentKey)) runtimeError("RUNTIME_IDENTITY_MISMATCH");
      if (!Array.isArray(e.capabilities) || !e.capabilities.length || e.capabilities.some(c => !RUNTIME_TOOLS.includes(c)) ||
        new Set(e.capabilities).size !== e.capabilities.length) runtimeError("RUNTIME_CAPABILITY_ENROLLMENT_INVALID");
      const grantKey = [input.runtimeId, input.projectId];
      const prior = await this.ledger.read<RuntimeGrant>(tx, "RUNTIME_GRANT", grantKey);
      if (prior && (prior.payload.userId !== claims.sub || prior.payload.organizationId !== claims.organizationId)) throw new ForbiddenException("RUNTIME_OWNER_MISMATCH");
      const requestKey = [...enrollmentKey, input.requestId], requestDigest = toolDigest(input);
      const session = { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp };
      const replay = await this.ledger.read<any>(tx, "RUNTIME_GRANT_RENEWAL", requestKey);
      if (replay) {
        if (replay.payload.requestDigest !== requestDigest || toolDigest(replay.payload.session) !== toolDigest(session)) runtimeError("RUNTIME_GRANT_RENEWAL_CONFLICT");
        if (!prior || toolDigest(prior.payload) !== toolDigest(replay.payload.grant)) runtimeError("RUNTIME_GRANT_RENEWAL_SUPERSEDED");
        return this.activeGrant(tx, input.runtimeId, input.projectId, replay.payload.grant.version);
      }
      if ((prior?.payload.version ?? 0) !== input.expectedGrantVersion) runtimeError("RUNTIME_GRANT_CHANGED");
      const durableSession = await tx.userSession.findUnique({ where: { id: claims.sessionId } });
      const expires = Math.min(now + input.durationSeconds * 1000, claims.exp! * 1000,
        +new Date(durableSession.expiresAt), e.expiresAt === null ? Infinity : Date.parse(e.expiresAt));
      if (!Number.isFinite(expires) || expires <= now) runtimeError("RUNTIME_GRANT_RENEWAL_INVALID");
      const grant: RuntimeGrant = { grantId: runtimeKey("RUNTIME_GRANT", grantKey), runtimeId: input.runtimeId, projectId: input.projectId,
        userId: claims.sub, organizationId: claims.organizationId!, mode: "TRUSTED_MACHINE", capabilities: [...e.capabilities].sort(),
        version: (prior?.payload.version ?? 0) + 1, status: "ACTIVE", createdAt: prior?.payload.createdAt ?? new Date(now).toISOString(),
        expiresAt: developmentReadPolicy() && e.capabilities.every(workspaceReadTool) ? null : new Date(expires).toISOString(), revokedAt: null,
        enrollment: { enrollmentId: e.enrollmentId, revision: e.revision, runtimeFingerprint: e.runtimeFingerprint },
        ...(prior?.payload.workspaceRead ? { workspaceRead: prior.payload.workspaceRead } : {}) };
      await (prior ? this.ledger.update(tx, prior, grant) : this.ledger.create(tx, "RUNTIME_GRANT", grantKey, grant, { immutable: false, route: claims.sub }));
      await this.ledger.create(tx, "RUNTIME_GRANT_RENEWAL", requestKey,
        { requestDigest, session, requestedBy: claims.sub, renewedAt: new Date(now).toISOString(), grant }, { immutable: true });
      return this.activeGrant(tx, input.runtimeId, input.projectId, grant.version);
    });
  }
  async grant(claims: SessionClaims, runtimeId: string, projectId: string, capabilities: RuntimeTool[], expiresAt?: string) {
    if (!Array.isArray(capabilities) || !capabilities.length || capabilities.some(c => !RUNTIME_TOOLS.includes(c)) || new Set(capabilities).size !== capabilities.length ||
      (expiresAt !== undefined && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()))) runtimeError("RUNTIME_GRANT_INVALID");
    return this.ledger.transaction(async tx => {
      const device = (await this.device(tx, runtimeId)).payload;
      const fresh = await this.actor(tx, claims.sub, claims.organizationId!, projectId, { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp });
      await new ResourceAuthorizationService(tx).assertAuthorized(toolSubject(fresh), "EXECUTE", { resourceType: "Project", id: projectId, projectId, organizationId: claims.organizationId });
      if (device.userId !== claims.sub || device.organizationId !== claims.organizationId || device.status !== "ACTIVE") throw new ForbiddenException("RUNTIME_OWNER_MISMATCH");
      const key = [runtimeId, projectId], prior = await this.ledger.read<RuntimeGrant>(tx, "RUNTIME_GRANT", key), now = new Date().toISOString();
      const grant: RuntimeGrant = { grantId: runtimeKey("RUNTIME_GRANT", key), runtimeId, userId: claims.sub, projectId, organizationId: claims.organizationId!, mode: "TRUSTED_MACHINE",
        capabilities: [...capabilities].sort(), version: (prior?.payload.version ?? 0) + 1, status: "ACTIVE", createdAt: prior?.payload.createdAt ?? now, expiresAt: expiresAt ?? null, revokedAt: null };
      return (prior ? await this.ledger.update(tx, prior, grant) : await this.ledger.create(tx, "RUNTIME_GRANT", key, grant, { immutable: false, route: claims.sub })).payload;
    });
  }
  async revokeGrant(claims: SessionClaims, runtimeId: string, projectId: string) {
    return this.ledger.transaction(async tx => {
      await this.actor(tx, claims.sub, claims.organizationId!, projectId);
      const record = await this.ledger.read<RuntimeGrant>(tx, "RUNTIME_GRANT", [runtimeId, projectId]);
      if (!record || record.payload.userId !== claims.sub || record.payload.organizationId !== claims.organizationId) throw new ForbiddenException("RUNTIME_GRANT_INVALID");
      return (await this.ledger.update(tx, record, { ...record.payload, version: record.payload.version + 1, status: "REVOKED", revokedAt: new Date().toISOString() })).payload;
    });
  }
  async activeGrant(tx: any, runtimeId: string, projectId: string, version?: number, readOnly = false): Promise<RuntimeGrant> {
    const row = await this.ledger.read<RuntimeGrant>(tx, "RUNTIME_GRANT", [runtimeId, projectId]), g = row?.payload;
    if (!g || g.status !== "ACTIVE" || g.mode !== "TRUSTED_MACHINE" || (version !== undefined && version !== g.version) || (g.expiresAt !== null && !Number.isFinite(Date.parse(g.expiresAt)))) throw new ForbiddenException("RUNTIME_GRANT_INVALID");
    const persistentReadAccess = await persistentReadAccessTx(this.ledger, tx, g);
    const readBoundary = readOnly || g.capabilities.every(workspaceReadTool);
    if ((developmentReadPolicy() && g.enrollment && readBoundary && !persistentReadAccess) ||
      (g.expiresAt && Date.parse(g.expiresAt) <= Date.now() && !(readBoundary && persistentReadAccess))) throw new ForbiddenException("RUNTIME_GRANT_INVALID");
    const d = (await this.device(tx, runtimeId)).payload;
    if (d.status !== "ACTIVE" || d.userId !== g.userId || d.organizationId !== g.organizationId) throw new ForbiddenException("RUNTIME_GRANT_IDENTITY_INVALID");
    await this.actor(tx, g.userId, g.organizationId, projectId);
    return { ...g, ...(persistentReadAccess ? { persistentReadAccess: true } : {}) };
  }
}
