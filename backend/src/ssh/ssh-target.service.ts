import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../data-access/prisma.service";
import { AuthService } from "../auth/auth.service";
import { ResourceAuthorizationService } from "../auth/resource-authz.service";
import type { SessionClaims } from "../auth/auth.dto";
import { exactKeys, sshConfiguration, sshDigest, sshId, type SshTargetConfiguration, type SshValidationStatus } from "./ssh-target.contract";
import { SshConnectionService, SshCredentialResolver } from "./ssh-connection.service";

@Injectable()
export class SshTargetService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ResourceAuthorizationService) private readonly authz: ResourceAuthorizationService,
    @Inject(SshCredentialResolver) private readonly credentials: SshCredentialResolver,
    @Inject(SshConnectionService) private readonly connection: SshConnectionService) {}

  private async authorize(tx: any, claims: SessionClaims, projectId: string, configure: boolean) {
    if (!claims.sessionId || !claims.organizationId || claims.exp * 1000 <= Date.now()) throw new ForbiddenException("SSH_SESSION_REQUIRED");
    const project = await tx.project.findUnique({ where: { id: projectId } });
    if (!project || project.organizationId !== claims.organizationId) throw new ForbiddenException("SSH_PROJECT_SCOPE_DENIED");
    await this.authz.assertAuthorized({ userId: claims.sub, email: claims.email, displayName: claims.displayName,
      role: claims.role, organizationId: claims.organizationId, isSystemAdmin: claims.role === "Admin" }, configure ? "UPDATE" : "READ",
      { resourceType: "Project", id: projectId, projectId, organizationId: project.organizationId });
  }
  private async lock(tx: any, id: string) {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", `ssh-target:${id}`);
  }
  private async owned(tx: any, claims: SessionClaims, projectId: string, id: string, configure: boolean) {
    await this.authorize(tx, claims, projectId, configure);
    const target = await tx.sshTarget.findUnique({ where: { id } });
    if (!target || target.projectId !== projectId || target.organizationId !== claims.organizationId || target.ownerId !== claims.sub) throw new NotFoundException("SSH_TARGET_NOT_FOUND");
    return target;
  }
  private configuration(revision: any): SshTargetConfiguration {
    const config = sshConfiguration(revision.configuration);
    if (sshDigest(config) !== revision.digest) throw new ConflictException("SSH_REVISION_DIGEST_CONFLICT");
    return config;
  }

  async list(cookie: string | undefined, projectId: string) {
    sshId(projectId);
    const claims = await this.auth.validateDurableSession(cookie);
    return this.db.$transaction(async tx => {
      await this.authorize(tx, claims, projectId, false);
      const targets = await tx.sshTarget.findMany({ where: { projectId, ownerId: claims.sub, organizationId: claims.organizationId }, orderBy: { id: "asc" }, take: 100 });
      return Promise.all(targets.map(async target => {
        const revision = await tx.sshTargetRevision.findUniqueOrThrow({ where: { targetId_version: { targetId: target.id, version: target.version } } });
        const configuration = this.configuration(revision);
        const validation = await tx.sshConnectionValidation.findFirst({ where: { targetId: target.id, targetVersion: target.version }, orderBy: [{ startedAt: "desc" }, { id: "desc" }] });
        return { id: target.id, version: target.version, configuration, validation, executionAuthority: "NONE" as const };
      }));
    }, { isolationLevel: "RepeatableRead" });
  }

  async configure(cookie: string | undefined, projectId: string, input: unknown) {
    const body = exactKeys(input, ["targetId", "expectedVersion", "requestId", "configuration", "acknowledgement"]);
    const requestId = sshId(body.requestId); sshId(projectId);
    if (!Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 0 || body.acknowledgement !== "PIN_HOST_IDENTITY") throw new BadRequestException("SSH_EXPLICIT_PIN_REQUIRED");
    const config = sshConfiguration(body.configuration);
    const claims = await this.auth.validateDurableSession(cookie);
    if (body.expectedVersion === 0 && body.targetId !== null) throw new BadRequestException("SSH_SERVER_IDENTITY_REQUIRED");
    const id = body.expectedVersion === 0
      ? `ssh_${sshDigest({ projectId, organizationId: claims.organizationId, actor: claims.sub, requestId })}`
      : sshId(body.targetId);
    const digest = sshDigest({ id, projectId, expectedVersion: body.expectedVersion, config, actor: claims.sub, session: claims.sessionId });
    return this.db.$transaction(async tx => {
      await this.lock(tx, id); await this.authorize(tx, claims, projectId, true);
      let target = await tx.sshTarget.findUnique({ where: { id } });
      if (target && (target.ownerId !== claims.sub || target.projectId !== projectId || target.organizationId !== claims.organizationId)) throw new NotFoundException("SSH_TARGET_NOT_FOUND");
      const replay = await tx.sshTargetRevision.findUnique({ where: { targetId_requestId: { targetId: id, requestId } } });
      if (replay) { if (replay.requestDigest !== digest) throw new ConflictException("SSH_REPLAY_CONFLICT"); return replay; }
      if ((target?.version ?? 0) !== body.expectedVersion) throw new ConflictException("SSH_TARGET_STALE");
      if (target) {
        const previous = await tx.sshTargetRevision.findUniqueOrThrow({ where: { targetId_version: { targetId: id, version: target.version } } });
        if (this.configuration(previous).status === "REVOKED") throw new ConflictException("SSH_TARGET_REVOKED");
        target = await tx.sshTarget.update({ where: { id }, data: { version: target.version + 1 } });
      } else {
        if (config.status !== "REGISTERED") throw new BadRequestException("SSH_INITIAL_STATUS_INVALID");
        target = await tx.sshTarget.create({ data: { id, projectId, organizationId: claims.organizationId!, ownerId: claims.sub, version: 1 } });
      }
      return tx.sshTargetRevision.create({ data: { targetId: id, version: target.version, configuration: config as any,
        digest: sshDigest(config), actorId: claims.sub, sessionId: claims.sessionId, requestId, requestDigest: digest } });
    });
  }

  async read(cookie: string | undefined, projectId: string, id: string, version?: number) {
    sshId(projectId); sshId(id);
    if (version !== undefined && (!Number.isSafeInteger(version) || version < 1)) throw new BadRequestException("SSH_VERSION_INVALID");
    const claims = await this.auth.validateDurableSession(cookie);
    return this.db.$transaction(async tx => {
      const target = await this.owned(tx, claims, projectId, id, false);
      const revision = await tx.sshTargetRevision.findUniqueOrThrow({ where: { targetId_version: { targetId: id, version: version ?? target.version } } });
      this.configuration(revision);
      const validation = await tx.sshConnectionValidation.findFirst({ where: { targetId: id, targetVersion: revision.version }, orderBy: [{ startedAt: "desc" }, { id: "desc" }] });
      return { target, revision, validation, executionAuthority: "NONE" as const };
    }, { isolationLevel: "RepeatableRead" });
  }

  async validate(cookie: string | undefined, projectId: string, id: string, input: unknown) {
    const body = exactKeys(input, ["expectedVersion", "requestId", "acknowledgement"]);
    sshId(projectId); sshId(id); const requestId = sshId(body.requestId);
    if (!Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1 || body.acknowledgement !== "VALIDATE_CONNECTION_ONLY") throw new BadRequestException("SSH_VALIDATION_AUTHORIZATION_REQUIRED");
    const claims = await this.auth.validateDurableSession(cookie);
    const requestDigest = sshDigest({ id, projectId, version: body.expectedVersion, actor: claims.sub, session: claims.sessionId });
    const reservation = await this.db.$transaction(async tx => {
      await this.lock(tx, id);
      const target = await this.owned(tx, claims, projectId, id, true);
      if (target.version !== body.expectedVersion) throw new ConflictException("SSH_TARGET_STALE");
      const revision = await tx.sshTargetRevision.findUniqueOrThrow({ where: { targetId_version: { targetId: id, version: target.version } } });
      const config = this.configuration(revision);
      if (config.status !== "REGISTERED") throw new ForbiddenException("SSH_TARGET_REVOKED");
      const replay = await tx.sshConnectionValidation.findUnique({ where: { targetId_requestId: { targetId: id, requestId } } });
      if (replay) { if (replay.requestDigest !== requestDigest) throw new ConflictException("SSH_REPLAY_CONFLICT"); return { replay }; }
      if (await tx.sshConnectionValidation.findFirst({ where: { targetId: id, status: "PENDING" } })) throw new ConflictException("SSH_VALIDATION_UNCERTAIN");
      const record = await tx.sshConnectionValidation.create({ data: { id: `sshcheck_${randomUUID()}`, targetId: id,
        targetVersion: target.version, targetDigest: revision.digest, requestId, requestDigest, actorId: claims.sub, sessionId: claims.sessionId, status: "PENDING" } });
      return { record, config };
    });
    if (reservation.replay) return reservation.replay;
    let status: SshValidationStatus = "CREDENTIAL_UNAVAILABLE";
    let credential: { privateKey: Buffer; passphrase?: string } | undefined;
    try { credential = this.credentials.resolve(reservation.config!.credentialRef, projectId, claims.organizationId!); }
    catch { /* Only safe classification is persisted. */ }
    if (credential) {
      try { status = await this.connection.validate(reservation.config!, credential); }
      catch { status = "CONNECTION_FAILED"; }
      finally { credential.privateKey.fill(0); }
    }
    // Revalidate session/project after transport; failure leaves an explicit uncertain reservation, never success.
    const currentClaims = await this.auth.validateDurableSession(cookie);
    if (currentClaims.sub !== claims.sub || currentClaims.sessionId !== claims.sessionId) throw new ForbiddenException("SSH_SESSION_CHANGED");
    return this.db.$transaction(async tx => {
      await this.lock(tx, id);
      const target = await this.owned(tx, currentClaims, projectId, id, true);
      if (target.version !== reservation.record!.targetVersion) status = "STALE";
      return tx.sshConnectionValidation.update({ where: { id: reservation.record!.id }, data: { status, completedAt: new Date() } });
    });
  }
}
