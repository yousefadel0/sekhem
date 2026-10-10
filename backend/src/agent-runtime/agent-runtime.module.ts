import { AgentRunRecoveryModule } from "./recovery/agent-run-recovery.module";
import { AgentContextProjectionModule } from "./context-projection/agent-context-projection.module";
import { RuntimeFolderService } from "../trusted-runtime/runtime-folder.service";
import { Module, forwardRef } from "@nestjs/common";
import { AgentRuntimeController } from "./agent-runtime.controller";
import { AgentRuntimeEventsController } from "./agent-runtime.events.controller";
import { AgentRuntimeService } from "./agent-runtime.service";
import { SkillRegistryService } from "./skills/skill-registry.service";
import { DataAccessModule } from "../data-access/data-access.module";
import { ConversationModule } from "../conversation/conversation.module";
import { AuthService } from "../auth/auth.service";
import { AuthzGuard } from "../auth/authz.guard";
import { ResourceAuthorizationService } from "../auth/resource-authz.service";
import { AuditService } from "../audit/audit.service";
import { AiGatewayService } from "../ai-gateway/ai-gateway.service";
import { RuntimeConfigurationService } from "../ai-gateway/runtime-configuration.service";
import { RepositoryContentService } from "../repository-source/repository-content.service";
import { AiGatewayPolicyService } from "../ai-gateway/ai-gateway-policy.service";
import { MockAiGatewayProviderAdapter } from "../ai-gateway/providers/mock-ai-gateway-provider.adapter";
import { OpenAiDryRunProviderAdapter } from "../ai-gateway/providers/openai/openai-dry-run-provider.adapter";
import { AutomationContractService } from "../automation-contract.service";
import { AiGatewayProviderSettingsService } from "../ai-gateway/ai-gateway-provider-settings.service";
import { RepositorySourceProviderRegistry } from "../repository-source/repository-source.provider-registry";
import { RepositorySourceService } from "../repository-source/repository-source.service";
import { ConfigCryptoService } from "../config-crypto.service";
import { VllmOpenAiCompatibleAdapter } from "../ai-gateway/providers/vllm-openai-compatible.adapter";
import { FetchOpenAiTextPreviewTransport } from "../ai-gateway/providers/openai/openai-text-preview.transport";
import { MemoryModule } from "./memory/memory.module";
import { AttachmentModule } from "../attachment/attachment.module";
import { WorkspaceIntelligenceModule } from "../workspace-intelligence/workspace-intelligence.module";
import { WorkspaceCapabilityService } from "./capabilities/workspace-capability.service";
import { WorkspaceSourceResolver } from "./capabilities/workspace-source.resolver";
import { AttachmentCapabilityService } from "./capabilities/attachment-capability.service";
import { FileIntelligenceModule } from "../file-intelligence/file-intelligence.module";
import { ExecutionPlaneService } from "./capabilities/execution-plane.service";
import { ExecutionPolicyService } from "./capabilities/execution-policy.service";
import { ExecutionExecutorRegistry } from "./capabilities/execution-executor.registry";
import { PowerShellExecutor } from "./capabilities/powershell.executor";
import { AgentUnderstandingService } from "./understanding/agent-understanding.service";
import { EvidenceCollectorService } from "./understanding/evidence-collector.service";
import { AgentContextBuilderService } from "./understanding/agent-context-builder.service";
import { AgentContextSerializerService } from "./understanding/agent-context-serializer.service";
import { AgentInitiativeService } from "./initiative/agent-initiative.service";
import { AgentInitiativeController } from "./initiative/agent-initiative.controller";
import { ToolRegistryService } from "./tools/tool-registry.service";
import { ToolScopeService } from "./tools/tool-scope.service";
import { ToolPermissionService } from "./tools/tool-permission.service";
import { ToolRiskService } from "./tools/tool-risk.service";
import { ToolApprovalService } from "./tools/tool-approval.service";
import { ToolAuthorizationService } from "./tools/tool-authorization.service";
import { AgentToolControlService } from "./tools/agent-tool-control.service";
import { AgentDecisionService } from "./tools/agent-decision.service";
import { AgentControlStoreService } from "./tools/agent-control-store.service";
import { RuntimeLedgerService } from "../trusted-runtime/runtime-ledger.service";
import { RuntimeIdentityService } from "../trusted-runtime/runtime-identity.service";
import { RuntimeControlService } from "../trusted-runtime/runtime-control.service";
import { RuntimeExecutionService } from "../trusted-runtime/runtime-execution.service";
import { RuntimeController, RuntimeTransportController } from "../trusted-runtime/runtime.controller";
import { WorkspaceController } from "../workspace-intelligence/workspace.controller";
import { WorkspaceRuntimeService } from "../workspace-intelligence/workspace-runtime.service";
import { WorkspaceRuntimeEvidenceService } from "../workspace-intelligence/workspace-runtime-evidence.service";
import { AgentInspectionService } from "./inspection/agent-inspection.service";
import { AgentPlanExecutionService } from "./execution/agent-plan-execution.service";
import { ExactProposalService } from "./execution/exact-proposal.service";
import { ExactProposalApprovalService } from "./execution/exact-proposal-approval.service";
import { ExactProposalPermitService } from "./execution/exact-proposal-permit.service";

/**
 * AgentRuntimeModule
 *
 * Encapsulates the Agent Runtime subsystem:
 * - AgentRuntimeController
 * - AgentRuntimeService
 * - SkillRegistryService and built-in skills
 * - Secure integration with DataAccess, Auth, Authorization, Audit, and AI Gateway
 * - Imports MemoryModule for user memory context retrieval in executeChat
 * - Imports AttachmentModule for multimodal attachment loading
 */
@Module({
  imports: [AgentRunRecoveryModule, AgentContextProjectionModule, DataAccessModule, forwardRef(() => ConversationModule), MemoryModule, AttachmentModule, FileIntelligenceModule, WorkspaceIntelligenceModule],
  controllers: [AgentRuntimeController, AgentRuntimeEventsController, AgentInitiativeController, RuntimeController, RuntimeTransportController, WorkspaceController],
  providers: [
    AgentInspectionService,
    RuntimeFolderService, RuntimeLedgerService, RuntimeIdentityService, RuntimeControlService, RuntimeExecutionService, WorkspaceRuntimeService, WorkspaceRuntimeEvidenceService,
    AgentRuntimeService,
    ToolRegistryService,
    ToolScopeService,
    ToolPermissionService,
    ToolRiskService,
    ToolApprovalService,
    ToolAuthorizationService,
    AgentToolControlService,
    AgentDecisionService,
    AgentControlStoreService,
    SkillRegistryService,
    AuthService,
    AuthzGuard,
    ResourceAuthorizationService,
    AuditService,
    AiGatewayService,
    RuntimeConfigurationService,
    RepositoryContentService,
    AiGatewayPolicyService,
    MockAiGatewayProviderAdapter,
    OpenAiDryRunProviderAdapter,
    VllmOpenAiCompatibleAdapter,
    FetchOpenAiTextPreviewTransport,
    AutomationContractService,
    AiGatewayProviderSettingsService,
    RepositorySourceProviderRegistry,
    RepositorySourceService,
    ConfigCryptoService,
    WorkspaceSourceResolver,
    WorkspaceCapabilityService,
    AttachmentCapabilityService,
    AgentUnderstandingService,
    EvidenceCollectorService,
    AgentContextBuilderService,
    AgentContextSerializerService,
    AgentInitiativeService,
    ExecutionPolicyService,
    PowerShellExecutor,
    {
      provide: ExecutionExecutorRegistry,
      useFactory: (powershell: PowerShellExecutor) => {
        const registry = new ExecutionExecutorRegistry();
        registry.register(powershell);
        return registry;
      },
      inject: [PowerShellExecutor]
    },
    ExecutionPlaneService,
    AgentPlanExecutionService,
    ExactProposalService,
    ExactProposalApprovalService,
    ExactProposalPermitService
  ],
  exports: [AiGatewayService, AgentRuntimeService, SkillRegistryService, AgentContextBuilderService, ToolRegistryService, ToolAuthorizationService, RuntimeControlService, RuntimeLedgerService, AgentPlanExecutionService, WorkspaceRuntimeService]
})
export class AgentRuntimeModule {}
