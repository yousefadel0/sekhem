import { Module, forwardRef } from "@nestjs/common";
import { ConversationController } from "./conversation.controller";
import { ConversationService } from "./conversation.service";
import { AuthService } from "../auth/auth.service";
import { AuthzGuard } from "../auth/authz.guard";
import { ResourceAuthorizationService } from "../auth/resource-authz.service";
import { DataAccessModule } from "../data-access/data-access.module";
import { AgentRuntimeModule } from "../agent-runtime/agent-runtime.module";
import { MemoryModule } from "../agent-runtime/memory/memory.module";
import { AttachmentModule } from "../attachment/attachment.module";
import { FileIntelligenceModule } from "../file-intelligence/file-intelligence.module";
import { AttachmentCapabilityService } from "../agent-runtime/capabilities/attachment-capability.service";
import { ExecutionModeDetectorService } from "../agent-runtime/execution-mode-detector.service";
import { WorkspaceIntelligenceModule } from "../workspace-intelligence/workspace-intelligence.module";
import { RecommendationService } from "./recommendation.service";

/**
 * ConversationModule
 *
 * Mounts the Conversation subsystem with its HTTP controller, service,
 * and database access through DataAccessModule.
 * Imports AgentRuntimeModule to consume exported AgentRuntimeService.
 * Imports MemoryModule to consume exported MemoryService for memory extraction/persistence.
 * Imports AttachmentModule for attachment retrieval and document grounding.
 */
@Module({
  imports: [DataAccessModule, forwardRef(() => AgentRuntimeModule), MemoryModule, AttachmentModule, FileIntelligenceModule, WorkspaceIntelligenceModule],
  controllers: [ConversationController],
  providers: [RecommendationService, ConversationService, AttachmentCapabilityService, AuthService, AuthzGuard, ResourceAuthorizationService,
    // Default routing is deterministic and server-owned; no extra inference call.
    { provide: ExecutionModeDetectorService, useFactory: () => new ExecutionModeDetectorService() }],
  exports: [ConversationService]
})
export class ConversationModule {}
