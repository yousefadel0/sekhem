import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { ResourceAuthorizationService, type AuthAction, type AuthSubject } from "../../auth/resource-authz.service";
import type { PermissionDecision, ToolPermission, ToolScope, TrustedToolWorkspace } from "./tool-contract";

const actions: Record<ToolPermission, AuthAction> = {
  "filesystem.read": "READ", "filesystem.write": "UPDATE", "filesystem.delete": "DELETE", "terminal.execute": "EXECUTE",
  "git.read": "READ", "git.write": "UPDATE", "package.install": "EXECUTE", "browser.open": "EXECUTE"
};
@Injectable()
export class ToolPermissionService {
  constructor(@Inject(ResourceAuthorizationService) private readonly resources: ResourceAuthorizationService) {}
  async check(subject: AuthSubject, required: readonly ToolPermission[], workspace: TrustedToolWorkspace | undefined, scope: ToolScope, organizationId?: string, projectId = workspace?.projectId, transaction?: Prisma.TransactionClient): Promise<PermissionDecision[]> {
    const result: PermissionDecision[] = [];
    for (const permission of [...new Set(required)]) {
      const granted = Array.isArray(workspace?.permissions) && workspace.permissions.includes(permission);
      // Base application permission is checked identically before/after approval.
      const allowed = granted && !!projectId && !!actions[permission] && await this.resources.authorize(subject, actions[permission], {
        resourceType: "Project", id: projectId, projectId, organizationId
      }, transaction);
      result.push({ permission, allowed, reason: !granted ? "WORKSPACE_GRANT_MISSING" : allowed ? "GRANTED" : "RESOURCE_PERMISSION_DENIED", scope });
    }
    return result;
  }
}
