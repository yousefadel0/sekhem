import { ConflictException, Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, parse } from "node:path";
import { ProjectAccessService, type ProjectSubject } from "../auth/project-access.service";
import type { TrustedWorkspaceContext, WorkspaceBinding } from "./models/workspace.types";
export type { WorkspaceBinding } from "./models/workspace.types";
import { validatedLocalRepositoryPath } from "../repository-source/repository-path.policy";
import { WorkspaceStoreService } from "./workspace-store.service";

export interface BoundWorkspace { binding: WorkspaceBinding; context: TrustedWorkspaceContext }

@Injectable()
export class WorkspaceBindingService {
  constructor(@Inject(ProjectAccessService) private readonly access: ProjectAccessService,
    @Optional() @Inject(WorkspaceStoreService) private readonly runtimeStore?: WorkspaceStoreService) {}

  async runtimeReference(claims: ProjectSubject, projectId: string) {
    await this.access.assert(claims, projectId);
    const binding = await this.runtimeStore?.getActiveBinding(claims.sub, projectId, claims.organizationId!);
    return binding ? { workspaceId: binding.workspaceId, bindingVersion: binding.version } : undefined;
  }

  async resolve(claims: ProjectSubject, projectId: string, expectedVersion?: string): Promise<BoundWorkspace> {
    await this.access.assert(claims, projectId);
    if (await this.runtimeReference(claims, projectId)) throw new ServiceUnavailableException({ code: "RUNTIME_WORKSPACE_EVIDENCE_REQUIRED", message: "Runtime Workspace selected. Backend filesystem fallback is disabled; explicit runtime evidence integration is not enabled in this phase." });
    try {
      // File is deployment-owned, never writable through an API or conversation metadata.
      const configPath = resolve(__dirname, "../../config/workspace.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      if (config.version !== 1 || config.projectId !== projectId ||
        typeof config.id !== "string" || !/^[a-z0-9_-]{1,64}$/.test(config.id) ||
        typeof config.name !== "string" || !/^[\p{L}\p{N} _.-]{1,80}$/u.test(config.name) ||
        typeof config.root !== "string") throw new Error("unconfigured");
      const root = realpathSync.native(resolve(dirname(configPath), config.root));
      if (root === parse(root).root || !statSync(root).isDirectory()) throw new Error("invalid root");
      // Reuse the existing containment policy with this explicit deployment allowlist.
      const trustedRoot = validatedLocalRepositoryPath(root, { SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS: root });
      const version = createHash("sha256").update(JSON.stringify([config.id, projectId, trustedRoot, config.version])).digest("hex");
      if (expectedVersion !== undefined && expectedVersion !== version) {
        throw new ConflictException({ code: "WORKSPACE_BINDING_CHANGED", message: "Workspace binding changed. Start a new conversation for the current workspace." });
      }
      const binding: WorkspaceBinding = { id: config.id, projectId, name: config.name, version, mode: "READ_ONLY", location: "BACKEND_HOST" };
      return { binding, context: { workspaceId: binding.id, projectId, name: binding.name, trustedRoot, authorizedRoots: root } };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException({ code: "WORKSPACE_UNAVAILABLE", message: "No available read-only workspace is configured for this project." });
    }
  }
}
