import { Module } from "@nestjs/common";
import { BrowserModule } from "./browser/browser.module";
import { SshTargetModule } from "./ssh/ssh-target.module";
import { AiPatchController } from "./ai-patch.controller";
import { AiPatchService } from "./ai-patch.service";
import { AiGatewayController } from "./ai-gateway/ai-gateway.controller";
import { AiGatewayProviderSettingsService } from "./ai-gateway/ai-gateway-provider-settings.service";
import { AiGatewayPolicyService } from "./ai-gateway/ai-gateway-policy.service";
import { AiGatewayService } from "./ai-gateway/ai-gateway.service";
import { MockAiGatewayProviderAdapter } from "./ai-gateway/providers/mock-ai-gateway-provider.adapter";
import { OpenAiDryRunProviderAdapter } from "./ai-gateway/providers/openai/openai-dry-run-provider.adapter";
import { VllmOpenAiCompatibleAdapter } from "./ai-gateway/providers/vllm-openai-compatible.adapter";
import { ProviderAdapterRegistry } from "./ai-gateway/provider-adapter.registry";
import { RuntimeConfigurationService } from "./ai-gateway/runtime-configuration.service";
import { FetchOpenAiTextPreviewTransport } from "./ai-gateway/providers/openai/openai-text-preview.transport";
import { AutomationContractController } from "./automation-contract.controller";
import { AutomationContractService } from "./automation-contract.service";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AuthzGuard } from "./auth/authz.guard";
import { MachineCallbackGuard } from "./auth/machine-callback.guard";
import { ResourceAuthorizationService } from "./auth/resource-authz.service";
import { AdminController } from "./admin/admin.controller";
import { AdminService } from "./admin/admin.service";
import { AuditService } from "./audit/audit.service";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeService } from "./knowledge.service";
import { ProductController } from "./product.controller";
import { ProductService } from "./product.service";
import { ProductWriteService } from "./product-write.service";
import { RDRadarController } from "./rd-radar.controller";
import { RDRadarService } from "./rd-radar.service";
import { RDRadarAnalysisService } from "./rd-radar-analysis.service";
import { ConfigCryptoService } from "./config-crypto.service";
import { RepositorySourceController } from "./repository-source/repository-source.controller";
import { RepositoryConfigurationController } from "./repository-source/repository-configuration.controller";
import { RepositorySourceProviderRegistry } from "./repository-source/repository-source.provider-registry";
import { RepositorySourceService } from "./repository-source/repository-source.service";
import { RepositoryContentService } from "./repository-source/repository-content.service";
import { RagController } from "./rag/rag.controller";
import { RagService } from "./rag/rag.service";
import { DataAccessModule } from "./data-access/data-access.module";
import { ConversationModule } from "./conversation/conversation.module";
import { AgentRuntimeModule } from "./agent-runtime/agent-runtime.module";
import { MemoryModule } from "./agent-runtime/memory/memory.module";
import { AttachmentModule } from "./attachment/attachment.module";
import { FileIntelligenceModule } from "./file-intelligence/file-intelligence.module";
import { WorkspaceIntelligenceModule } from "./workspace-intelligence/workspace-intelligence.module";

@Module({
  imports: [
    BrowserModule,
    DataAccessModule,
    SshTargetModule,
    ConversationModule,
    AgentRuntimeModule,
    MemoryModule,
    AttachmentModule,
    FileIntelligenceModule,
    WorkspaceIntelligenceModule
  ],
  controllers: [
    ProductController,
    AutomationContractController,
    RDRadarController,
    AiPatchController,
    AiGatewayController,
    KnowledgeController,
    RepositorySourceController,
    RepositoryConfigurationController,
    RagController,
    AuthController,
    AdminController
  ],
  providers: [
    ProductService,
    ProductWriteService,
    AutomationContractService,
    RDRadarService,
    RDRadarAnalysisService,
    AiPatchService,
    AiGatewayPolicyService,
    AiGatewayProviderSettingsService,
    MockAiGatewayProviderAdapter,
    FetchOpenAiTextPreviewTransport,
    OpenAiDryRunProviderAdapter,
    VllmOpenAiCompatibleAdapter,
    ProviderAdapterRegistry,
    ConfigCryptoService,
    RuntimeConfigurationService,
    AiGatewayService,
    KnowledgeService,
    RepositorySourceProviderRegistry,
    RepositorySourceService,
    RepositoryContentService,
    RagService,
    AuthService,
    AuthzGuard,
    MachineCallbackGuard,
    ResourceAuthorizationService,
    AdminService,
    AuditService
  ]
})
export class AppModule {}
