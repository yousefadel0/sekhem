import { ForbiddenException, Inject, Injectable, Optional } from "@nestjs/common";
import { AttachmentService } from "../../attachment/attachment.service";
import { PrismaService } from "../../data-access/prisma.service";
import { ResourceAuthorizationService, type AuthSubject } from "../../auth/resource-authz.service";
import { RuntimeConfigurationService } from "../../ai-gateway/runtime-configuration.service";
import { RepositoryContentService } from "../../repository-source/repository-content.service";
import { MemoryService } from "../memory/memory.service";
import { AGENT_FILE_READER_LIMITS } from "../capabilities/workspace-context";
import { fileReadOutcome, hasReadableContent } from "../../file-intelligence/file-read-outcome";
import { AttachmentCapabilityService } from "../capabilities/attachment-capability.service";
import { WorkspaceCapabilityService, type CapabilityRequest } from "../capabilities/workspace-capability.service";
import { WorkspaceStoreService } from "../../workspace-intelligence/workspace-store.service";
import { WorkspaceRuntimeEvidenceService } from "../../workspace-intelligence/workspace-runtime-evidence.service";
import type { RuntimeEvidenceReference } from "../../workspace-intelligence/workspace-runtime.contract";
import type { SessionClaims } from "../../auth/auth.dto";
import { transferredConversation } from "../../conversation/conversation-mode";
import {
  AGENT_UNDERSTANDING_LIMITS,
  extractEvidenceQueryTokens,
  scoreEvidencePath,
  type AgentContextSource,
  type AgentEvidence
} from "./agent-understanding.types";

function boundText(text: string, max: number = AGENT_FILE_READER_LIMITS.MAX_EVIDENCE_TEXT_CHARS): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  let bounded = text.slice(0, max);
  if (/[\uD800-\uDBFF]$/.test(bounded)) bounded = bounded.slice(0, -1);
  return { text: bounded, truncated: true };
}

function isDenied(error: unknown): boolean {
  if (error instanceof ForbiddenException) return true;
  if (error && typeof error === "object" && "getStatus" in error && typeof (error as { getStatus?: unknown }).getStatus === "function") {
    return (error as { getStatus(): number }).getStatus() === 403;
  }
  return false;
}

/**
 * Bounded evidence collector. This uses the existing Attachment Reader rather
 * than storage paths, raw bytes, or a second extractor implementation.
 */
@Injectable()
export class EvidenceCollectorService {
  constructor(
    @Inject(AttachmentCapabilityService) private readonly attachments: AttachmentCapabilityService,
    @Optional() @Inject(WorkspaceCapabilityService) private readonly workspace?: WorkspaceCapabilityService,
    @Optional() @Inject(AttachmentService) private readonly attachmentCatalog?: AttachmentService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
    @Optional() @Inject(RepositoryContentService) private readonly repositoryContent?: RepositoryContentService,
    @Optional() @Inject(RuntimeConfigurationService) private readonly runtimeConfig?: RuntimeConfigurationService,
    @Optional() @Inject(MemoryService) private readonly memory?: MemoryService,
    @Optional() @Inject(ResourceAuthorizationService) private readonly resourceAuthz?: ResourceAuthorizationService,
    @Optional() @Inject(WorkspaceStoreService) private readonly runtimeWorkspaces?: WorkspaceStoreService,
    @Optional() @Inject(WorkspaceRuntimeEvidenceService) private readonly runtimeEvidence?: WorkspaceRuntimeEvidenceService
  ) {}

  async collectRuntimeWorkspace(claims: SessionClaims | undefined, projectId: string, conversationId: string, references: RuntimeEvidenceReference[]): Promise<AgentEvidence[]> {
    if (!this.runtimeEvidence || !claims) throw new ForbiddenException("WORKSPACE_EVIDENCE_AUTHORITY_REQUIRED");
    const result: AgentEvidence[] = [];
    for (const ref of references) {
      const { reference, file, operation } = await this.runtimeEvidence.admit(claims, projectId, conversationId, ref);
      // Runtime admission already bounds and validates the read. Do not apply
      // the legacy document-extractor cap again; the serializer accounts for
      // all evidence bodies and provenance within the existing shared budget.
      const bounded = boundText(file.text, AGENT_UNDERSTANDING_LIMITS.MAX_MODEL_EVIDENCE_CHARS), truncated = reference.truncated || bounded.truncated;
      result.push({ sourceType: "workspace", sourceId: reference.operationId, relativePath: reference.relativePath,
        // Receipt identity is already immutable and globally unique. Keep full
        // coordinates in runtimeReference without repeating them in every model citation.
        runtimeReference: reference, provenance: `runtime:${reference.receiptId}`,
        status: "COLLECTED", outcome: truncated ? "TRUNCATED" : operation && operation.tool !== "filesystem.read" ? "SCANNED" : "READ", warnings: file.warnings,
        metadata: { runtimeEvidence: reference, ...(operation ? { operation: operation.tool } : {}) }, content: { text: bounded.text, truncated, extractorId: "verified-runtime-read", detectedMime: file.mimeType } });
    }
    return result;
  }

  async collectTransferredWorkspace(claims: SessionClaims, projectId: string, conversationId: string) {
    if (!this.prisma) return null;
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.userId !== claims.sub || conversation.projectId !== projectId) throw new ForbiddenException("CONVERSATION_TRANSFER_SCOPE_INVALID");
    const transfer = await transferredConversation(this.prisma, conversation);
    if (!transfer) return null;
    const evidence = await this.collectRuntimeWorkspace(claims, projectId, transfer.parent.id, transfer.source.evidence);
    return { sourceConversationId: transfer.parent.id as string, evidence };
  }

  async collectAttachments(input: {
    userId: string;
    conversationId: string;
    attachmentIds: string[];
    agentRunId?: string;
  }): Promise<AgentEvidence[]> {
    const ids = [...new Set(input.attachmentIds.filter((id) => typeof id === "string" && id.trim()))]
      .slice(0, AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS);
    const evidence: AgentEvidence[] = [];
    for (const attachmentId of ids) {
      evidence.push(await this.readAttachment(input.userId, input.conversationId, attachmentId, input.agentRunId));
    }
    return evidence;
  }

  async collectConversationAttachments(input: {
    userId: string;
    conversationId: string;
    instruction: string;
    excludeIds?: string[];
    agentRunId?: string;
  }): Promise<AgentEvidence[]> {
    if (!this.attachmentCatalog) return [];
    let listed;
    try {
      listed = await this.attachmentCatalog.listAttachmentsForConversation(input.userId, input.conversationId);
    } catch (error) {
      return [{
        sourceType: "attachment",
        sourceId: input.conversationId,
        metadata: {},
        provenance: `CONVERSATION_ATTACHMENT:${input.conversationId}`,
        status: isDenied(error) ? "DENIED" : "UNAVAILABLE",
        warnings: [isDenied(error) ? "Conversation attachment listing was denied." : "Conversation attachments could not be listed."]
      }];
    }
    const excluded = new Set(input.excludeIds ?? []);
    const tokens = extractEvidenceQueryTokens(input.instruction);
    const ranked = listed
      .filter((item) => !excluded.has(item.id))
      .map((item) => ({
        item,
        score: scoreEvidencePath(item.fileName, tokens) + (item.category === "pdf" && /\b(pdf|document|requirements?|spec)\b/i.test(input.instruction) ? 3 : 0)
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.fileName.localeCompare(b.item.fileName, "en"))
      .slice(0, AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS);
    const evidence: AgentEvidence[] = [];
    for (const entry of ranked) {
      evidence.push(await this.readAttachment(input.userId, input.conversationId, entry.item.id, input.agentRunId));
    }
    return evidence;
  }

  async collectWorkspace(request: CapabilityRequest, relativePaths: string[]): Promise<AgentEvidence[]> {
    if (!this.workspace) {
      return [{
        sourceType: "workspace",
        sourceId: request.workspaceId ?? request.projectId,
        metadata: {},
        provenance: `${request.projectId}:workspace`,
        status: "UNAVAILABLE",
        warnings: ["Workspace evidence collection is unavailable in this environment."]
      }];
    }
    const collected = await this.workspace.collectEvidence(request, relativePaths);
    return collected.context.evidence.map((item) => ({
      sourceType: "workspace" as const,
      sourceId: collected.context.workspaceId,
      relativePath: item.relativePath,
      outcome: item.outcome ?? (item.truncated ? "TRUNCATED" : "READ"),
      content: hasReadableContent(item.outcome) ? {
        text: item.text,
        extractorId: item.extractorId ?? "unknown",
        detectedMime: item.fileType ?? "application/octet-stream",
        truncated: item.truncated
      } : undefined,
      metadata: { source: collected.context.source },
      provenance: item.sourceIdentity,
      status: hasReadableContent(item.outcome) ? "COLLECTED" as const : item.outcome === "DENIED" ? "DENIED" as const : "UNAVAILABLE" as const,
      warnings: item.warnings
    })).slice(0, AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS);
  }

  async collectRepository(input: {
    userId: string;
    userRole: AuthSubject["role"];
    organizationId?: string;
    projectId: string;
    instruction: string;
    repositoryConnectionId?: string;
    agentRunId?: string;
  }): Promise<AgentEvidence[]> {
    if (!this.repositoryContent || !this.runtimeConfig || !input.repositoryConnectionId) {
      return [{
        sourceType: "repository",
        sourceId: input.projectId,
        metadata: {},
        provenance: `${input.projectId}:repository`,
        status: "UNAVAILABLE",
        warnings: ["Repository evidence requires an authorized repository connection id."]
      }];
    }
    try {
      await this.assertProjectRead(input);
      const connection = await this.runtimeConfig.repositoryForUse(input.repositoryConnectionId);
      const snapshot = await this.repositoryContent.snapshot(connection, connection.defaultBranch);
      const tokens = extractEvidenceQueryTokens(input.instruction);
      const ranked = snapshot.chunks
        .map((chunk) => ({ chunk, score: scoreEvidencePath(chunk.path, tokens) }))
        .sort((a, b) => b.score - a.score || a.chunk.path.localeCompare(b.chunk.path, "en"));
      const selected = (ranked.some((entry) => entry.score > 0) ? ranked.filter((entry) => entry.score > 0) : ranked)
        .slice(0, AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS);
      const sourceType: AgentContextSource = connection.providerType === "gitlab" ? "gitlab" : "repository";
      return selected.map((entry) => {
        const bounded = boundText(entry.chunk.content);
        return {
          sourceType,
          sourceId: connection.id,
          repositoryId: connection.id,
          relativePath: entry.chunk.path,
          content: {
            text: bounded.text,
            extractorId: "repository_snapshot",
            detectedMime: "text/plain",
            truncated: bounded.truncated
          },
          metadata: { repository: snapshot.repository, commitSha: snapshot.commitSha, providerType: connection.providerType },
          provenance: `${connection.id}:${snapshot.commitSha}:${entry.chunk.path}`,
          status: "COLLECTED" as const,
          warnings: bounded.truncated ? ["Repository chunk truncated to the evidence text limit."] : []
        };
      });
    } catch (error) {
      return [{
        sourceType: "repository",
        sourceId: input.repositoryConnectionId,
        repositoryId: input.repositoryConnectionId,
        metadata: {},
        provenance: `${input.repositoryConnectionId}:repository`,
        status: isDenied(error) ? "DENIED" : "UNAVAILABLE",
        warnings: [isDenied(error) ? "Repository evidence collection was denied." : "Repository evidence could not be collected."]
      }];
    }
  }

  async collectArtifacts(input: {
    userId: string;
    userRole: AuthSubject["role"];
    organizationId?: string;
    projectId: string;
    instruction: string;
  }): Promise<AgentEvidence[]> {
    if (!this.prisma) return [];
    try {
      if (this.resourceAuthz) {
        await this.resourceAuthz.assertAuthorized(this.subject(input), "READ", {
          resourceType: "Artifact",
          id: input.projectId,
          projectId: input.projectId,
          organizationId: input.organizationId
        });
      }
      const rows = await this.prisma.agentArtifact.findMany({
        where: { projectId: input.projectId, isCustomerSafe: true },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, title: true, artifactType: true, content: true, summary: true }
      });
      const tokens = extractEvidenceQueryTokens(input.instruction);
      const ranked = (Array.isArray(rows) ? rows : [])
        .map((row: { id: string; title: string; artifactType: string; content: string; summary: string | null }) => ({
          row,
          score: scoreEvidencePath(`${row.title} ${row.artifactType} ${row.summary ?? ""}`, tokens)
        }))
        .filter((entry: { score: number }) => entry.score > 0)
        .sort((a: { score: number; row: { title: string } }, b: { score: number; row: { title: string } }) => b.score - a.score || a.row.title.localeCompare(b.row.title, "en"))
        .slice(0, Math.min(2, AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS));
      return ranked.map((entry: { row: { id: string; title: string; artifactType: string; content: string } }) => {
        const bounded = boundText(entry.row.content ?? "");
        return {
          sourceType: "artifact" as const,
          sourceId: entry.row.id,
          content: {
            text: bounded.text,
            extractorId: "agent_artifact",
            detectedMime: "text/plain",
            truncated: bounded.truncated
          },
          metadata: { artifactId: entry.row.id, title: entry.row.title, artifactType: entry.row.artifactType, customerSafe: true },
          provenance: `AGENT_ARTIFACT:${input.projectId}:${entry.row.id}`,
          status: "COLLECTED" as const,
          warnings: bounded.truncated ? ["Artifact content truncated to the evidence text limit."] : []
        };
      });
    } catch (error) {
      return [{
        sourceType: "artifact",
        sourceId: input.projectId,
        metadata: {},
        provenance: `AGENT_ARTIFACT:${input.projectId}`,
        status: isDenied(error) ? "DENIED" : "UNAVAILABLE",
        warnings: [isDenied(error) ? "Artifact evidence collection was denied." : "Artifact evidence could not be collected."]
      }];
    }
  }

  async collectConversation(input: {
    userId: string;
    conversationId: string;
    instruction: string;
  }): Promise<AgentEvidence[]> {
    if (!this.prisma) return [];
    try {
      const conv = await this.prisma.conversation.findUnique({
        where: { id: input.conversationId },
        select: { id: true, userId: true }
      });
      if (!conv) {
        return [{
          sourceType: "conversation",
          sourceId: input.conversationId,
          metadata: {},
          provenance: `CONVERSATION:${input.conversationId}`,
          status: "UNAVAILABLE",
          warnings: ["Conversation was not found for evidence collection."]
        }];
      }
      if (conv.userId !== input.userId) {
        return [{
          sourceType: "conversation",
          sourceId: input.conversationId,
          metadata: {},
          provenance: `CONVERSATION:${input.conversationId}`,
          status: "DENIED",
          warnings: ["Conversation evidence collection was denied."]
        }];
      }
      let messages = await this.prisma.conversationMessage.findMany({
        where: { conversationId: input.conversationId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, content: true, senderType: true, metadata: true }
      });
      if (this.runtimeWorkspaces) messages = await this.runtimeWorkspaces.modelMessages(messages);
      const tokens = extractEvidenceQueryTokens(input.instruction);
      const ranked = (Array.isArray(messages) ? messages : [])
        .filter((message: { content?: string; metadata?: any }) => !message.metadata?.historicalContext && !message.metadata?.accountHistoricalMemory && typeof message.content === "string" && message.content.trim())
        .map((message: { id: string; content: string; senderType: string }) => ({
          message,
          score: scoreEvidencePath(message.content, tokens)
        }))
        .filter((entry: { score: number }) => entry.score > 0)
        .slice(0, 2);
      return ranked.map((entry: { message: { id: string; content: string; senderType: string } }) => {
        const bounded = boundText(entry.message.content);
        return {
          sourceType: "conversation" as const,
          sourceId: entry.message.id,
          content: {
            text: bounded.text,
            extractorId: "conversation_message",
            detectedMime: "text/plain",
            truncated: bounded.truncated
          },
          metadata: { messageId: entry.message.id, senderType: entry.message.senderType },
          provenance: `CONVERSATION:${input.conversationId}:${entry.message.id}`,
          status: "COLLECTED" as const,
          warnings: []
        };
      });
    } catch (error) {
      return [{
        sourceType: "conversation",
        sourceId: input.conversationId,
        metadata: {},
        provenance: `CONVERSATION:${input.conversationId}`,
        status: isDenied(error) ? "DENIED" : "UNAVAILABLE",
        warnings: ["Conversation evidence could not be collected."]
      }];
    }
  }

  async collectMemory(input: { userId: string }): Promise<AgentEvidence[]> {
    if (!this.memory) return [];
    try {
      const text = await this.memory.buildMemoryContext(input.userId);
      if (!text) return [];
      const bounded = boundText(text);
      return [{
        sourceType: "memory",
        sourceId: input.userId,
        content: {
          text: bounded.text,
          extractorId: "user_memory",
          detectedMime: "text/plain",
          truncated: bounded.truncated
        },
        metadata: { advisory: true },
        provenance: `MEMORY:${input.userId}`,
        status: "COLLECTED",
        warnings: ["Memory is advisory and is not a substitute for source evidence."]
      }];
    } catch {
      return [];
    }
  }

  private async readAttachment(userId: string, conversationId: string, attachmentId: string, agentRunId?: string): Promise<AgentEvidence> {
    try {
      const read = await this.attachments.read({ userId, conversationId, attachmentId, agentRunId });
      const bounded = boundText(read.normalizedContent.text);
      return {
        sourceType: "attachment",
        sourceId: attachmentId,
        attachmentId,
        outcome: read.status !== "OK" ? "SCANNED" : read.normalizedContent.truncated || bounded.truncated ? "TRUNCATED" : "READ",
        content: {
          text: bounded.text,
          extractorId: read.normalizedContent.extractorId,
          detectedMime: read.normalizedContent.detectedMime,
          truncated: read.normalizedContent.truncated || bounded.truncated
        },
        metadata: { fileName: read.fileName, size: read.size, status: read.status },
        provenance: `${read.provenance.sourceType}:${read.provenance.conversationId}:${attachmentId}`,
        status: read.status === "OK" ? "COLLECTED" : "UNAVAILABLE",
        warnings: read.warnings
      };
    } catch (error) {
      const outcome = fileReadOutcome(error);
      return {
        sourceType: "attachment",
        sourceId: attachmentId,
        attachmentId,
        outcome,
        metadata: {},
        provenance: `CONVERSATION_ATTACHMENT:${conversationId}:${attachmentId}`,
        status: outcome === "DENIED" ? "DENIED" : "UNAVAILABLE",
        warnings: [`Attachment could not be collected. Read outcome: ${outcome}.`]
      };
    }
  }

  private subject(input: { userId: string; userRole: AuthSubject["role"]; organizationId?: string }): AuthSubject {
    return {
      userId: input.userId,
      email: "",
      displayName: "",
      role: input.userRole,
      organizationId: input.organizationId,
      isSystemAdmin: input.userRole === "Admin"
    };
  }

  private async assertProjectRead(input: {
    userId: string;
    userRole: AuthSubject["role"];
    organizationId?: string;
    projectId: string;
  }): Promise<void> {
    if (!this.resourceAuthz) return;
    await this.resourceAuthz.assertAuthorized(this.subject(input), "READ", {
      resourceType: "Project",
      id: input.projectId,
      projectId: input.projectId,
      organizationId: input.organizationId
    });
  }
}
