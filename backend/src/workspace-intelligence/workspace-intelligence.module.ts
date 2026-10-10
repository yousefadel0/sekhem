import { Module } from "@nestjs/common";
import { WorkspaceStoreService } from "./workspace-store.service";
import { WorkspaceBindingService } from "./workspace-binding.service";
import { ProjectAccessService } from "../auth/project-access.service";
import { AuthService } from "../auth/auth.service";
import { ResourceAuthorizationService } from "../auth/resource-authz.service";
import { FileIntelligenceModule } from "../file-intelligence/file-intelligence.module";
import { WorkspaceDiscoveryService } from "./workspace-discovery.service";
import { WorkspaceIntelligenceService } from "./workspace-intelligence.service";
import { WorkspacePathService } from "./workspace-path.service";
import { WorkspaceSecurityService } from "./security/workspace-security.service";

@Module({
  imports: [FileIntelligenceModule],
  // WorkspaceController is composed in AgentRuntimeModule with the runtime adapter.
  providers: [WorkspacePathService, WorkspaceSecurityService, WorkspaceDiscoveryService, WorkspaceIntelligenceService,
    WorkspaceBindingService, WorkspaceStoreService, ProjectAccessService, AuthService, ResourceAuthorizationService],
  exports: [WorkspaceIntelligenceService, WorkspaceDiscoveryService, WorkspacePathService, WorkspaceSecurityService, WorkspaceBindingService, WorkspaceStoreService, ProjectAccessService]
})
export class WorkspaceIntelligenceModule {}
