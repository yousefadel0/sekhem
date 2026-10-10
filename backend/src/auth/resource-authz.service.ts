import { ForbiddenException, Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../data-access/prisma.service";
import type { Prisma } from "@prisma/client";
import type { AuthRoleDto } from "./auth.dto";
import { isProjectOperator, roleCanUse } from "./role-policy";

export type AuthAction =
  | "READ"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "EXECUTE"
  | "STEER"
  | "APPROVE"
  | "CANCEL"
  | "ADMIN";

export type AuthResourceType =
  | "User"
  | "Group"
  | "Project"
  | "Conversation"
  | "AgentRun"
  | "Artifact"
  | "Approval"
  | "Initiative"
  | "AuditEvent";

export interface AuthSubject {
  userId: string;
  email: string;
  displayName: string;
  role: AuthRoleDto; // System application role
  organizationId?: string;
  isSystemAdmin: boolean;
}

export interface SecurableResource {
  resourceType: AuthResourceType;
  id: string;
  organizationId?: string;
  projectId?: string;
  groupId?: string;
  ownerId?: string;
  userId?: string;
  visibility?: "PRIVATE" | "GROUP" | "PROJECT" | "PUBLIC";
  isCustomerSafe?: boolean;
  requiresApproval?: boolean;
  isDangerousOperation?: boolean;
  requiredRole?: AuthRoleDto;
}

/**
 * ResourceAuthorizationService
 *
 * Centralized authorization engine enforcing:
 * 1. Organization boundary (no cross-tenant access, even for Admins).
 * 2. Real-time durable resolution of Group and Project memberships.
 * 3. User privacy (normal users cannot access another user's private resources).
 * 4. Group and Project isolation.
 * 5. Admin safety gates (Admin cannot bypass dangerous operations or mandatory approvals).
 * 6. Specific action authorization (STEER, CANCEL, APPROVE, EXECUTE).
 * 7. Database-level scope filters to avoid in-memory filtering.
 */
@Injectable()
export class ResourceAuthorizationService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private prisma: any | null = null;

  constructor(@Optional() @Inject(PrismaService) prismaService?: PrismaService) {
    if (prismaService) {
      this.prisma = prismaService;
    }
  }

  async authorize(subject: AuthSubject, action: AuthAction, resource: SecurableResource, transaction?: Prisma.TransactionClient): Promise<boolean> {
    const db = transaction ?? this.prisma;
    // 1. Organization Boundary Check (Absolute)
    // If both subject and resource have an organizationId, they MUST match.
    if (subject.organizationId && resource.organizationId && subject.organizationId !== resource.organizationId) {
      return false; // Cross-organization IDOR blocked
    }

    // Personal projects remain private even to organization administrators.
    // Resolve ownership before the administrator shortcut and membership checks.
    const projectId = resource.projectId ?? (resource.resourceType === "Project" ? resource.id : undefined);
    if (projectId && db) {
      const project = await db.project.findUnique({ where: { id: projectId }, select: { personalOwnerId: true, organizationId: true } });
      if (!project || (project.organizationId && project.organizationId !== subject.organizationId) ||
        (project.personalOwnerId && project.personalOwnerId !== subject.userId)) return false;
    }

    // Private content remains owned by its user, including for organization admins.
    const resourceOwner = resource.ownerId ?? resource.userId;
    if (resource.visibility === "PRIVATE" && resourceOwner !== subject.userId) return false;
    if (["Conversation", "AgentRun"].includes(resource.resourceType) && resource.visibility === undefined &&
      resourceOwner !== subject.userId) return false;

    // Project membership roles cannot confer system administration authority.
    if (action === "ADMIN" && (!subject.isSystemAdmin || subject.role !== "Admin")) return false;

    // 2. Admin Boundary & Safety Policy
    // An Admin has organization-wide visibility/control, BUT cannot bypass safety policies.
    if (subject.isSystemAdmin) {
      // Safety Gate: Dangerous operations (production deployment, destructive tools) cannot be executed directly
      if (action === "EXECUTE" && (resource.isDangerousOperation || resource.requiresApproval)) {
        return false; // Admin cannot bypass mandatory approval gate
      }
      return true;
    }

    // 3. User Privacy Boundary
    // If resource is PRIVATE or owned by a user:
    if (resource.visibility === "PRIVATE") {
      return resourceOwner === subject.userId;
    }

    // If resource has a direct owner and action is destructive (UPDATE / DELETE)
    if (resourceOwner && (action === "UPDATE" || action === "DELETE")) {
      if (resourceOwner !== subject.userId) {
        // Only owner or Admin can update/delete private or user-specific resources
        return false;
      }
    }

    // 4. Group Isolation
    if (resource.groupId) {
      const isMember = await this.isGroupMember(subject.userId, resource.groupId, transaction);
      if (!isMember) {
        return false; // Group resource only visible to verified group members
      }
      if (resource.visibility === "GROUP") {
        return true;
      }
    }

    // 5. Project Isolation & Role Capabilities
    if (resource.projectId) {
      const projectRole = await this.getProjectRole(subject.userId, resource.projectId, transaction);
      if (!projectRole) {
        return false; // Non-members cannot access project resources
      }

      // Check action-specific project permissions
      switch (action) {
        case "READ":
          return true; // All project members can read non-private project resources

        case "CREATE":
        case "UPDATE":
        case "DELETE":
        case "STEER":
        case "CANCEL":
          return isProjectOperator(projectRole);

        case "APPROVE": {
          if (resource.requiredRole) {
            return this.roleMeetsRequirement(projectRole, resource.requiredRole);
          }
          return isProjectOperator(projectRole);
        }

        case "EXECUTE":
          if (resource.requiresApproval || resource.isDangerousOperation) {
            return false; // Requires approval decision before execution
          }
          return isProjectOperator(projectRole);

        case "ADMIN":
          return subject.role === "Admin" && projectRole === "Admin";

        default:
          return false;
      }
    }

    // 6. Non-project resources (e.g. general initiative reads or system resources)
    if (action === "READ") {
      return true;
    }

    return false;
  }

  async assertAuthorized(subject: AuthSubject, action: AuthAction, resource: SecurableResource): Promise<void> {
    const allowed = await this.authorize(subject, action, resource);
    if (!allowed) {
      throw new ForbiddenException(`You do not have permission to perform ${action} on this ${resource.resourceType}.`);
    }
  }

  /**
   * Generates a database-level Prisma WHERE clause filter to scope queries at the SQL level
   * rather than fetching large datasets and filtering in memory.
   */
  async buildDatabaseScopeFilter(subject: AuthSubject, resourceType: AuthResourceType, action: AuthAction = "READ") {
    if (resourceType === "Conversation" || resourceType === "AgentRun") return { userId: subject.userId };
    // Admin has organization-wide visibility
    if (subject.isSystemAdmin) {
      return { ...(subject.organizationId ? { organizationId: subject.organizationId } : {}),
        ...(resourceType === "Project" ? { OR: [{ personalOwnerId: null }, { personalOwnerId: subject.userId }] } : {}) };
    }

    const [userGroupIds, userProjectIds] = await Promise.all([
      this.getUserGroupIds(subject.userId),
      this.getUserProjectIds(subject.userId)
    ]);

    switch (resourceType) {
      case "Project":
        return {
          id: { in: userProjectIds },
          OR: [{ personalOwnerId: null }, { personalOwnerId: subject.userId }],
          ...(subject.organizationId ? { organizationId: subject.organizationId } : {})
        };

      case "Group":
        return {
          id: { in: userGroupIds },
          ...(subject.organizationId ? { organizationId: subject.organizationId } : {})
        };

      case "Artifact":
        return {
          projectId: { in: userProjectIds },
          ...(action === "READ" ? {} : { isCustomerSafe: true })
        };

      default:
        return subject.organizationId ? { organizationId: subject.organizationId } : {};
    }
  }

  // ---------------------------------------------------------------------------
  // Durable State Resolvers (Live DB lookups, no stale JWT cache)
  // ---------------------------------------------------------------------------

  async isGroupMember(userId: string, groupId: string, transaction?: Prisma.TransactionClient): Promise<boolean> {
    const db = transaction ?? this.prisma;
    if (!db) return false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const member = await db.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } }
      });
      return !!member;
    } catch {
      return false;
    }
  }

  async getProjectRole(userId: string, projectId: string, transaction?: Prisma.TransactionClient): Promise<AuthRoleDto | null> {
    const db = transaction ?? this.prisma;
    if (!db) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const member = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } }
      });
      return member?.role ? (member.role as AuthRoleDto) : null;
    } catch {
      return null;
    }
  }

  async getUserGroupIds(userId: string): Promise<string[]> {
    if (!this.prisma) return [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const memberships = await this.prisma.groupMember.findMany({
        where: { userId },
        select: { groupId: true }
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return memberships.map((m: { groupId: string }) => m.groupId);
    } catch {
      return [];
    }
  }

  async getUserProjectIds(userId: string): Promise<string[]> {
    if (!this.prisma) return [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const memberships = await this.prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true }
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return memberships.map((m: { projectId: string }) => m.projectId);
    } catch {
      return [];
    }
  }

  private roleMeetsRequirement(userRole: AuthRoleDto, required: AuthRoleDto): boolean {
    return roleCanUse(userRole, [required]);
  }
}
