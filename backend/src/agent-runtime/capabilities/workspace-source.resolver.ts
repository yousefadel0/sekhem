import { Injectable } from "@nestjs/common";
import { validatedLocalRepositoryPath } from "../../repository-source/repository-path.policy";
import { WorkspaceIntelligenceError } from "../../workspace-intelligence/workspace-intelligence.errors";
import type { TrustedWorkspaceContext } from "../../workspace-intelligence/models/workspace.types";

@Injectable()
export class WorkspaceSourceResolver {
  /**
   * Resolves a LOCAL workspace root from a trusted caller context or process configuration.
   * Never invents a Project filesystem path.
   */
  resolveLocal(input: {
    workspaceId: string;
    projectId: string;
    name: string;
    trustedRoot?: string;
    authorizedRoots?: string;
  }): TrustedWorkspaceContext {
    const candidate = input.trustedRoot?.trim() || process.env.SEKHEM_WORKSPACE_ROOT?.trim();
    if (!candidate) {
      throw new WorkspaceIntelligenceError("WORKSPACE_SOURCE_UNSUPPORTED");
    }
    let trustedRoot: string;
    try {
      trustedRoot = validatedLocalRepositoryPath(candidate, input.authorizedRoots === undefined ? process.env : { SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS: input.authorizedRoots });
    } catch {
      throw new WorkspaceIntelligenceError("WORKSPACE_ACCESS_DENIED");
    }
    return {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      name: input.name,
      trustedRoot,
      authorizedRoots: input.authorizedRoots
    };
  }
}
