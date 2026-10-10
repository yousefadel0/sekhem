import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../data-access/prisma.service";
import { AuthService } from "../auth/auth.service";
import { AuditService } from "../audit/audit.service";
import type { SessionClaims } from "../auth/auth.dto";

export interface CreateOrganizationDto {
  slug: string;
  name: string;
  description?: string;
}

export interface CreateUserDto {
  email: string;
  displayName: string;
  password: string;
  role?: string;
  organizationId?: string;
}

export interface UpdateUserDto {
  displayName?: string;
  status?: "active" | "suspended";
  role?: string;
  organizationId?: string;
}

export interface CreateGroupDto {
  slug: string;
  name: string;
  description?: string;
  organizationId?: string;
}

export interface AddGroupMemberDto {
  userId: string;
  role?: string;
}

export interface AddProjectMemberDto {
  userId: string;
  role?: string;
}

/**
 * AdminService
 *
 * Implements administrative user, organization, group, and project governance.
 * Enforces:
 * 1. Immediate session revocation upon user suspension or deletion.
 * 2. Self-describing scrypt password hashing for user creation.
 * 3. Security audit event recording for every mutation via AuditService.
 * 4. Passwords and hashes are strictly masked from all return types.
 */
@Injectable()
export class AdminService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private prisma: any | null = null;

  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional() @Inject(PrismaService) prismaService?: PrismaService
  ) {
    if (prismaService) {
      this.prisma = prismaService;
    }
  }

  /**
   * @deprecated Retained strictly as a test seam. Production must use NestJS DI.
   */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  private requirePrisma(): void {
    if (!this.prisma) {
      throw new NotFoundException("Database not available in this environment");
    }
  }

  private organization(actor: SessionClaims, requested?: string): string {
    if (actor.role !== "Admin" || !actor.organizationId || (requested !== undefined && requested !== actor.organizationId)) {
      throw new ForbiddenException("ADMIN_ORGANIZATION_ACCESS_DENIED");
    }
    return actor.organizationId;
  }

  private async owned(db: any, kind: "user" | "group" | "project", id: string, actor: SessionClaims) {
    const organizationId = this.organization(actor);
    const resource = await db[kind].findFirst({ where: { id, organizationId } });
    if (!resource) throw new NotFoundException("ADMIN_RESOURCE_NOT_FOUND");
    if (kind === "project" && resource.personalOwnerId && resource.personalOwnerId !== actor.sub) throw new NotFoundException("ADMIN_RESOURCE_NOT_FOUND");
    return resource;
  }

  private async role(db: any, key: string) {
    if (!["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"].includes(key)) throw new BadRequestException("ADMIN_ROLE_INVALID");
    const role = await db.role.findUnique({ where: { key } });
    if (!role) throw new BadRequestException("ADMIN_ROLE_NOT_CONFIGURED");
    return role;
  }

  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try { return await this.prisma.$transaction(work); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new ConflictException("ADMIN_DUPLICATE_RECORD");
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Organizations
  // ---------------------------------------------------------------------------

  async createOrganization(dto: CreateOrganizationDto, actorClaims: SessionClaims) {
    this.requirePrisma();
    this.organization(actorClaims);

    if (typeof dto.slug !== "string" || !dto.slug.trim() || typeof dto.name !== "string" || !dto.name.trim()) {
      throw new BadRequestException("slug and name are required");
    }
    return this.transaction(async tx => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const organization = await tx.organization.create({
        data: {
          slug: dto.slug.toLowerCase().trim(),
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null
        }
    });

    await this.auditService.recordWithClaimsTx(tx, actorClaims, {
      action: "ORGANIZATION_CREATE",
      resourceType: "Organization",
      resourceId: organization.id,
      details: { slug: organization.slug, name: organization.name }
    });

    return organization;
    });
  }

  async listOrganizations(actorClaims: SessionClaims) {
    this.requirePrisma();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.prisma.organization.findMany({
      where: { id: this.organization(actorClaims) },
      orderBy: { createdAt: "desc" }
    });
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  async listUsers(actorClaims: SessionClaims, organizationId?: string) {
    this.requirePrisma();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.prisma.user.findMany({
      where: { organizationId: this.organization(actorClaims, organizationId) },
      select: {
        id: true,
        email: true,
        displayName: true,
        organizationId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        roles: { include: { role: { select: { key: true, name: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async createUser(dto: CreateUserDto, actorClaims: SessionClaims) {
    this.requirePrisma();
    const organizationId = this.organization(actorClaims, dto.organizationId);
    if (typeof dto.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email.trim()) ||
      typeof dto.password !== "string" || !dto.password || typeof dto.displayName !== "string" || !dto.displayName.trim()) {
      throw new BadRequestException("email and password are required");
    }

    const passwordHash = await this.authService.hashPassword(dto.password);
    const userId = `usr_${randomUUID()}`;
    return this.transaction(async tx => {
      const roleKey = dto.role ?? "Viewer", roleRecord = await this.role(tx, roleKey);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const user = await tx.user.create({
        data: {
          id: userId,
          email: dto.email.toLowerCase().trim(),
          displayName: dto.displayName.trim() || dto.email,
          passwordHash,
          organizationId,
          status: "active"
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          organizationId: true,
          status: true,
          createdAt: true
        }
    });

    await tx.userRole.create({ data: { userId: user.id, roleId: roleRecord.id } });

    await this.auditService.recordWithClaimsTx(tx, actorClaims, {
      action: "USER_CREATE",
      resourceType: "User",
      resourceId: user.id,
      details: { email: user.email, role: roleKey }
    });

    return user;
    });
  }

  async updateUser(id: string, dto: UpdateUserDto, actorClaims: SessionClaims) {
    this.requirePrisma();
    this.organization(actorClaims, dto.organizationId);
    if (dto.status !== undefined && !["active", "suspended"].includes(dto.status)) throw new BadRequestException("ADMIN_STATUS_INVALID");
    if (dto.displayName !== undefined && (typeof dto.displayName !== "string" || !dto.displayName.trim())) throw new BadRequestException("ADMIN_NAME_INVALID");
    if (id === actorClaims.sub && (dto.status === "suspended" || (dto.role !== undefined && dto.role !== "Admin"))) throw new BadRequestException("ADMIN_SELF_LOCKOUT_DENIED");
    return this.transaction(async tx => {
      await this.owned(tx, "user", id, actorClaims);
      const roleRecord = dto.role !== undefined ? await this.role(tx, dto.role) : null;

      const data: Record<string, unknown> = {};
      if (dto.displayName) data.displayName = dto.displayName.trim();
      if (dto.status) data.status = dto.status;
      const revoke = dto.status === "suspended" || roleRecord !== null;
      const now = new Date();
      if (revoke) data.sessionRevokedAt = now;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const updated = await tx.user.update({
        where: { id, organizationId: actorClaims.organizationId },
        data,
        select: {
          id: true,
          email: true,
          displayName: true,
          organizationId: true,
          status: true,
          updatedAt: true
        }
    });

    // If status is changed to suspended, IMMEDIATELY revoke all active sessions
    if (roleRecord) {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.create({ data: { userId: id, roleId: roleRecord.id } });
    }
    if (revoke) await tx.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } });

    await this.auditService.recordWithClaimsTx(tx, actorClaims, {
      action: "USER_UPDATE",
      resourceType: "User",
      resourceId: updated.id,
      details: { status: dto.status, displayName: dto.displayName, role: dto.role }
    });

    return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------

  async listGroups(actorClaims: SessionClaims, organizationId?: string) {
    this.requirePrisma();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.prisma.group.findMany({
      where: { organizationId: this.organization(actorClaims, organizationId) },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, displayName: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async createGroup(dto: CreateGroupDto, actorClaims: SessionClaims) {
    this.requirePrisma();
    const organizationId = this.organization(actorClaims, dto.organizationId);

    if (typeof dto.slug !== "string" || !dto.slug.trim() || typeof dto.name !== "string" || !dto.name.trim()) {
      throw new BadRequestException("slug and name are required");
    }
    return this.transaction(async tx => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const group = await tx.group.create({
        data: {
          slug: dto.slug.toLowerCase().trim(),
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null,
          organizationId
        }
    });

    await this.auditService.recordWithClaimsTx(tx, actorClaims, {
      action: "GROUP_CREATE",
      resourceType: "Group",
      resourceId: group.id,
      details: { slug: group.slug, name: group.name }
    });

    return group;
    });
  }

  async addGroupMember(groupId: string, dto: AddGroupMemberDto, actorClaims: SessionClaims) {
    this.requirePrisma();
    return this.transaction(async tx => {
      await this.owned(tx, "group", groupId, actorClaims);
      await this.owned(tx, "user", dto.userId, actorClaims);

      if (!dto.userId) {
        throw new BadRequestException("userId is required");
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const member = await tx.groupMember.upsert({
        where: { groupId_userId: { groupId, userId: dto.userId } },
        create: { groupId, userId: dto.userId, role: dto.role ?? "member" },
        update: { role: dto.role ?? "member" }
    });

    await this.auditService.recordWithClaimsTx(tx, actorClaims, {
      action: "GROUP_MEMBER_ADD",
      resourceType: "Group",
      resourceId: groupId,
      details: { memberUserId: dto.userId, role: dto.role ?? "member" }
    });

    return member;
    });
  }

  async removeGroupMember(groupId: string, userId: string, actorClaims: SessionClaims) {
    this.requirePrisma();
    return this.transaction(async tx => {
      await this.owned(tx, "group", groupId, actorClaims);
      await this.owned(tx, "user", userId, actorClaims);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await tx.groupMember.deleteMany({
        where: { groupId, userId }
    });

    await this.auditService.recordWithClaimsTx(tx, actorClaims, {
      action: "GROUP_MEMBER_REMOVE",
      resourceType: "Group",
      resourceId: groupId,
      details: { removedUserId: userId }
    });

    return { removed: true, groupId, userId };
    });
  }

  // ---------------------------------------------------------------------------
  // Project Memberships
  // ---------------------------------------------------------------------------

  async listProjectMembers(projectId: string, actorClaims: SessionClaims) {
    this.requirePrisma();
    await this.owned(this.prisma, "project", projectId, actorClaims);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, email: true, displayName: true } }
      }
    });
  }

  async addProjectMember(projectId: string, dto: AddProjectMemberDto, actorClaims: SessionClaims) {
    this.requirePrisma();
    return this.transaction(async tx => {
      const project = await this.owned(tx, "project", projectId, actorClaims);
      if (project.personalOwnerId) throw new ForbiddenException("PERSONAL_PROJECT_MEMBERSHIP_IS_OWNER_MANAGED");
      await this.owned(tx, "user", dto.userId, actorClaims);
      await this.role(tx, dto.role ?? "Viewer");

      if (!dto.userId) {
        throw new BadRequestException("userId is required");
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const member = await tx.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: dto.userId } },
        create: { projectId, userId: dto.userId, role: dto.role ?? "Viewer" },
        update: { role: dto.role ?? "Viewer" }
    });

    await this.auditService.recordWithClaimsTx(tx, actorClaims, {
      action: "PROJECT_MEMBER_ADD",
      resourceType: "Project",
      resourceId: projectId,
      details: { memberUserId: dto.userId, role: dto.role ?? "Viewer" }
    });

    return member;
    });
  }

  async removeProjectMember(projectId: string, userId: string, actorClaims: SessionClaims) {
    this.requirePrisma();
    return this.transaction(async tx => {
      const project = await this.owned(tx, "project", projectId, actorClaims);
      if (project.personalOwnerId) throw new ForbiddenException("PERSONAL_PROJECT_MEMBERSHIP_IS_OWNER_MANAGED");
      await this.owned(tx, "user", userId, actorClaims);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await tx.projectMember.deleteMany({
        where: { projectId, userId }
    });

    await this.auditService.recordWithClaimsTx(tx, actorClaims, {
      action: "PROJECT_MEMBER_REMOVE",
      resourceType: "Project",
      resourceId: projectId,
      details: { removedUserId: userId }
    });

    return { removed: true, projectId, userId };
    });
  }

  async listAudit(actorClaims: SessionClaims) {
    this.requirePrisma();
    return this.prisma.auditEvent.findMany({ where: { metadata: { path: ["organizationId"], equals: this.organization(actorClaims) } },
      select: { id: true, action: true, actor: true, target: true, module: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
  }
}
