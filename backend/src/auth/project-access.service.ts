import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { isProjectOperator } from "./role-policy";
import { PrismaService } from "../data-access/prisma.service";
import { ResourceAuthorizationService, type AuthAction } from "./resource-authz.service";
import type { SessionClaims } from "./auth.dto";
import type { Prisma } from "@prisma/client";
export type ProjectSubject = Pick<SessionClaims, "sub" | "email" | "displayName" | "role" | "organizationId">;

/** Resolves real resource/organization identity before applying existing policy. */
@Injectable()
export class ProjectAccessService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ResourceAuthorizationService) private readonly resources: ResourceAuthorizationService) {}

  subject(claims: ProjectSubject) {
    return { userId: claims.sub, email: claims.email, displayName: claims.displayName,
      role: claims.role, organizationId: claims.organizationId, isSystemAdmin: claims.role === "Admin" };
  }

  async createPersonal(claims: SessionClaims, input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).join() !== "name" || typeof (input as any).name !== "string") throw new BadRequestException("PROJECT_NAME_REQUIRED");
    const name = (input as { name: string }).name.trim();
    if (!name || name.length > 120 || /[\u0000-\u001f]/.test(name)) throw new BadRequestException("PROJECT_NAME_INVALID");
    if (!isProjectOperator(claims.role)) throw new ForbiddenException("PROJECT_ROLE_REQUIRED");
    return this.db.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id: claims.sub }, select: { status: true, organizationId: true } });
      if (user?.status !== "active" || !claims.organizationId || user.organizationId !== claims.organizationId) throw new ForbiddenException("CURRENT_ORGANIZATION_REQUIRED");
      const id = `personal_${randomUUID()}`;
      return tx.project.create({ data: { id, slug: id, name, customerFacingName: name,
        status: "active", phase: "development", platform: "personal", organizationId: claims.organizationId,
        personalOwnerId: claims.sub, members: { create: { userId: claims.sub, role: claims.role } } } });
    });
  }

  async assert(claims: ProjectSubject, projectId: string, action: AuthAction = "READ") {
    const project = await this.db.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException("Project not found");
    if (project.personalOwnerId && project.personalOwnerId !== claims.sub) throw new NotFoundException("Project not found");
    if (!claims.organizationId || project.organizationId !== claims.organizationId) {
      throw new ForbiddenException("Project organization access denied");
    }
    await this.assertOrganizationMembership(claims);
    await this.resources.assertAuthorized(this.subject(claims), action, {
      resourceType: "Project", id: project.id, projectId: project.id, organizationId: project.organizationId
    });
    return project;
  }

  async visibleIds(claims: SessionClaims): Promise<string[]> {
    if (!claims.organizationId) return [];
    await this.assertOrganizationMembership(claims);
    const scope = await this.resources.buildDatabaseScopeFilter(this.subject(claims), "Project") as Prisma.ProjectWhereInput;
    const projects = await this.db.project.findMany({ where: { AND: [scope, {
      organizationId: claims.organizationId
    }] }, select: { id: true } });
    return projects.map(project => project.id);
  }

  private async assertOrganizationMembership(claims: ProjectSubject): Promise<void> {
    // AdminService provisions the User.organizationId relation. Read it afresh:
    // a stale signed organization claim must not survive reassignment/removal.
    const user = await this.db.user.findUnique({ where: { id: claims.sub }, select: { organizationId: true, status: true } });
    if (!user || user.status !== "active" || !user.organizationId || user.organizationId !== claims.organizationId) {
      throw new ForbiddenException("Current organization membership is required");
    }
  }
}
