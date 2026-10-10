import { Inject, Injectable, Optional } from "@nestjs/common";
import { WorkspaceIntelligenceError } from "../../workspace-intelligence/workspace-intelligence.errors";
import { WorkspaceCapabilityService, type CapabilityRequest } from "../capabilities/workspace-capability.service";
import { excludedFromWorkspaceDiscovery, workspaceDiscoveryPriority, workspaceFileCategory, workspacePathRelevance, workspaceQueryTokens } from "../../workspace-intelligence/workspace-discovery.policy";
import { fileReadOutcome } from "../../file-intelligence/file-read-outcome";
import { AgentUnderstandingService } from "./agent-understanding.service";
import {
  AGENT_EVIDENCE_SOURCE_PRIORITY,
  AGENT_UNDERSTANDING_LIMITS,
  INSPECTION_RESOURCE_LIMITS,
  emptyContextTruncation,
  evidenceIdentity,
  evidenceRank,
  extractEvidenceQueryTokens,
  isBroadWorkspaceReview,
  scoreEvidencePath,
  type AgentContext,
  type AgentEvidence,
  type AgentUnderstandingInput
} from "./agent-understanding.types";
import { EvidenceCollectorService } from "./evidence-collector.service";
import { AgentContextSerializerService } from "./agent-context-serializer.service";
import { WorkspaceBindingService } from "../../workspace-intelligence/workspace-binding.service";
import { workspaceFileReferences } from "../workspace-intent";

/**
 * Builds the safe, bounded context that is actually supplied to reasoning.
 * Evidence contents are deliberately transient: only source metadata is
 * persisted by callers in audit events.
 */
@Injectable()
export class AgentContextBuilderService {
  constructor(
    @Inject(AgentUnderstandingService) private readonly understanding: AgentUnderstandingService,
    @Inject(EvidenceCollectorService) private readonly evidenceCollector: EvidenceCollectorService,
    @Inject(AgentContextSerializerService) private readonly serializer: AgentContextSerializerService,
    @Optional() @Inject(WorkspaceCapabilityService) private readonly workspace?: WorkspaceCapabilityService,
    @Optional() @Inject(WorkspaceBindingService) private readonly bindings?: WorkspaceBindingService
  ) {}

  /** Runtime loop entry point: empty evidence never falls back to the backend filesystem. */
  async buildRuntimeInspection(input: AgentUnderstandingInput & { userRole: CapabilityRequest["userRole"]; organizationId: string }): Promise<AgentContext> {
    if (!input.sessionClaims || input.sessionClaims.sub !== input.userId || input.sessionClaims.organizationId !== input.organizationId || !input.projectId || !input.conversationId ||
      !Array.isArray(input.runtimeEvidence) || input.runtimeEvidence.length > INSPECTION_RESOURCE_LIMITS.MAX_CONTEXT_SOURCES) throw new Error("Runtime inspection scope unavailable");
    const context = this.understanding.understand({ ...input, workspaceAvailable: true });
    context.workspaceContext = { required: true, available: true };
    // Keep each existing admission batch bounded and independently authorized.
    const evidence: AgentEvidence[] = [];
    for (let index = 0; index < input.runtimeEvidence.length; index += AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS) {
      evidence.push(...await this.evidenceCollector.collectRuntimeWorkspace(input.sessionClaims, input.projectId, input.conversationId,
        input.runtimeEvidence.slice(index, index + AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS)));
    }
    const transferred = await this.evidenceCollector.collectTransferredWorkspace?.(input.sessionClaims, input.projectId, input.conversationId);
    if (transferred) {
      evidence.push(...transferred.evidence);
      context.transferredEvidenceConversationId = transferred.sourceConversationId;
      context.warnings.push("Transferred observations retain their original source conversation and receipt identity. They are historical observations, not new reads or permission.");
    }
    if (input.attachmentIds?.length) evidence.push(...await this.evidenceCollector.collectAttachments({ userId: input.userId, conversationId: input.conversationId, attachmentIds: input.attachmentIds, agentRunId: input.agentRunId }));
    context.evidence = this.deduplicateEvidence(this.prioritizeEvidence(evidence, input.instruction, new Set(evidence.map(evidenceIdentity)))).slice(0, INSPECTION_RESOURCE_LIMITS.MAX_CONTEXT_SOURCES);
    const selectedIds = new Set(context.evidence.map(evidenceIdentity));
    context.truncation = { ...emptyContextTruncation(), totalCandidateEvidenceCount: evidence.length, selectedEvidenceCount: context.evidence.length,
      droppedEvidenceIds: evidence.filter(e => !selectedIds.has(evidenceIdentity(e))).map(evidenceIdentity), truncatedEvidenceIds: context.evidence.filter(e => e.content?.truncated).map(evidenceIdentity) };
    context.truncated = context.truncation.droppedEvidenceIds.length > 0 || context.truncation.truncatedEvidenceIds.length > 0;
    context.warnings.push("Only verified runtime observations below are available. Directory listings and search matches do not establish full file contents. No backend filesystem fallback is permitted.");
    return context;
  }

  async build(input: AgentUnderstandingInput & {
    userRole: CapabilityRequest["userRole"];
    organizationId?: string;
    trustedRoot?: string;
  }): Promise<AgentContext> {
    const runtimeEvidence = Boolean(input.runtimeEvidence?.length);
    const initiallyAvailable = runtimeEvidence || Boolean(this.workspace);
    const context = this.understanding.understand({ ...input, workspaceAvailable: initiallyAvailable });
    const isChat = context.userIntent.length === 1 && context.userIntent[0] === "CHAT";
    const evidence: AgentEvidence[] = [];
    let workspaceEvidence: AgentEvidence[] = [];
    let exactWorkspaceRequest = false;

    if (context.attachmentContext.attachmentIds.length > 0 && input.conversationId) {
      evidence.push(...await this.evidenceCollector.collectAttachments({
        userId: input.userId,
        conversationId: input.conversationId,
        attachmentIds: context.attachmentContext.attachmentIds,
        agentRunId: input.agentRunId
      }));
    }

    if (!runtimeEvidence && input.conversationId && this.shouldDiscoverConversationAttachments(context, input.instruction)) {
      const extra = await this.evidenceCollector.collectConversationAttachments?.({
        userId: input.userId,
        conversationId: input.conversationId,
        instruction: input.instruction,
        excludeIds: evidence.map((item) => item.attachmentId).filter((id): id is string => Boolean(id)),
        agentRunId: input.agentRunId
      }) ?? [];
      evidence.push(...extra);
      if (extra.some((item) => item.status === "COLLECTED")) {
        context.missingContext = context.missingContext.filter((code) => code !== "ATTACHMENT");
        if (!context.selectedCapabilities.includes("attachment_reader") && input.availableCapabilities.includes("attachment_reader")) {
          context.selectedCapabilities = [...context.selectedCapabilities, "attachment_reader"].slice(0, AGENT_UNDERSTANDING_LIMITS.MAX_SELECTED_CAPABILITIES);
        }
      }
    }

    if (runtimeEvidence) {
      if (!input.projectId || !input.conversationId || input.sessionClaims?.sub !== input.userId || input.sessionClaims?.organizationId !== input.organizationId) throw new Error("Runtime evidence scope is unavailable");
      workspaceEvidence = await this.evidenceCollector.collectRuntimeWorkspace(input.sessionClaims, input.projectId, input.conversationId, input.runtimeEvidence!);
      evidence.push(...workspaceEvidence);
      exactWorkspaceRequest = true;
      context.warnings.push("Only the explicitly admitted runtime files were inspected. Other project files have not been inspected. Receipts are observations at their recorded time, not a claim of current file contents.");
    }

    if (!runtimeEvidence && context.workspaceContext.required && this.workspace && input.projectId) {
      const request: CapabilityRequest = {
        projectId: input.projectId,
        workspaceId: input.projectId,
        name: input.projectId,
        trustedRoot: input.trustedRoot,
        workspaceVersion: input.workspaceVersion,
        userId: input.userId,
        userRole: input.userRole,
        organizationId: input.organizationId,
        agentRunId: input.agentRunId
      };
      try {
        if (this.bindings) {
          const bound = await this.bindings.resolve({ sub: input.userId, role: input.userRole,
            organizationId: input.organizationId, email: "", displayName: "" }, input.projectId, input.workspaceVersion);
          context.workspaceBinding = bound.binding;
          Object.assign(request, bound.context, { isSystemAdmin: input.userRole === "Admin" });
        }
        const references = workspaceFileReferences(input.instruction);
        // The shared intent detector also recognizes a simple extensionless read.
        const extensionless = input.instruction.match(/^(?:please\s+)?read\s+([\w-]+)\s*[.!?]?$/i)?.[1];
        const explicitPaths = references.length ? references : extensionless ? [extensionless] : [];
        exactWorkspaceRequest = explicitPaths.length > 0;
        let selectedPaths = explicitPaths;
        if (!exactWorkspaceRequest) {
          // One bounded traversal. Query ranking must not repeat discovery for
          // generic words such as "inspect" or "workspace".
          const discovery = await this.workspace.discover(request, undefined, input.instruction);
          selectedPaths = this.selectWorkspaceFiles(discovery.tree.root, input.instruction);
          if (discovery.tree.truncated) {
            context.warnings.push("Workspace discovery was truncated by configured security limits.");
            context.truncated = true;
          }
        }
        // Explicit relative paths go directly to the existing authorized reader;
        // no discovery prerequisite and no basename substitution.
        workspaceEvidence = await this.evidenceCollector.collectWorkspace(request, selectedPaths);
        evidence.push(...workspaceEvidence);
        context.workspaceContext.available = true;
        if (selectedPaths.length === 0) {
          const warning = "No relevant workspace evidence was found within configured discovery limits.";
          context.warnings.push(warning);
          evidence.push({ sourceType: "workspace", sourceId: input.projectId, metadata: {},
            provenance: `${input.projectId}:workspace`, status: "UNAVAILABLE", warnings: [warning] });
        }
      } catch (error) {
        context.workspaceContext.available = false;
        if (!context.missingContext.includes("WORKSPACE_SCOPE")) context.missingContext.push("WORKSPACE_SCOPE");
        const code = this.errorCode(error);
        const denied = fileReadOutcome(error) === "DENIED";
        evidence.push({
          sourceType: "workspace",
          sourceId: input.projectId,
          metadata: {},
          provenance: `${input.projectId}:workspace`,
          status: denied ? "DENIED" : "UNAVAILABLE",
          warnings: [`Workspace evidence is unavailable (${code}).`]
        });
        context.warnings.push(`Workspace evidence is unavailable (${code}).`);
        context.selectedCapabilities = context.selectedCapabilities.filter((item) => item !== "workspace_reader");
      }
    }

    if (!runtimeEvidence && context.repositoryContext.required && input.projectId) {
      const repositoryEvidence = await this.evidenceCollector.collectRepository?.({
        userId: input.userId,
        userRole: input.userRole,
        organizationId: input.organizationId,
        projectId: input.projectId,
        instruction: input.instruction,
        repositoryConnectionId: input.repositoryConnectionId,
        agentRunId: input.agentRunId
      }) ?? [];
      evidence.push(...repositoryEvidence);
      context.repositoryContext.available = repositoryEvidence.some((item) => item.status === "COLLECTED");
    }

    if (!runtimeEvidence && input.projectId && this.shouldCollectProjectEvidence(context)) {
      evidence.push(...await this.evidenceCollector.collectArtifacts?.({
        userId: input.userId,
        userRole: input.userRole,
        organizationId: input.organizationId,
        projectId: input.projectId,
        instruction: input.instruction
      }) ?? []);
    }

    if (!runtimeEvidence && input.conversationId && input.hasConversationHistory && this.shouldCollectProjectEvidence(context)) {
      evidence.push(...await this.evidenceCollector.collectConversation?.({
        userId: input.userId,
        conversationId: input.conversationId,
        instruction: input.instruction
      }) ?? []);
    }

    if (!runtimeEvidence && !isChat && input.hasMemoryContext) {
      evidence.push(...await this.evidenceCollector.collectMemory?.({ userId: input.userId }) ?? []);
    }

    const explicitEvidenceIds = new Set(exactWorkspaceRequest ? workspaceEvidence.map(evidenceIdentity) : []);
    const ranked = this.prioritizeEvidence(evidence, input.instruction, explicitEvidenceIds);
    const unique = this.deduplicateEvidence(ranked);
    context.evidence = unique.slice(0, AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS);
    for (const item of context.evidence) {
      if (item.status !== "COLLECTED") context.warnings.push(...item.warnings);
    }
    const dropped = unique.slice(AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS);
    context.truncation = {
      ...emptyContextTruncation(),
      totalCandidateEvidenceCount: unique.length,
      selectedEvidenceCount: context.evidence.length,
      droppedEvidenceIds: dropped.map((item) => evidenceIdentity(item)),
      truncatedEvidenceIds: context.evidence.filter((item) => item.content?.truncated).map((item) => evidenceIdentity(item)),
      remainingEvidenceBudget: AGENT_UNDERSTANDING_LIMITS.MAX_MODEL_EVIDENCE_CHARS
    };
    if (dropped.length > 0) {
      context.truncated = true;
      context.warnings.push("Evidence was capped at the configured item limit.");
    }
    if (context.evidence.some((item) => item.content?.truncated)) {
      context.truncated = true;
      context.warnings.push("One or more evidence sources were truncated by configured limits.");
    }
    if ((context.attachmentContext.required || context.workspaceContext.required) && !context.evidence.some((item) => item.status === "COLLECTED")) {
      if (!context.missingContext.includes("INSUFFICIENT_EVIDENCE")) context.missingContext.push("INSUFFICIENT_EVIDENCE");
    }
    if (context.workspaceContext.required) {
      const retained = new Set(context.evidence.filter(item => item.status === "COLLECTED").map(evidenceIdentity));
      const collected = workspaceEvidence.filter(item => retained.has(evidenceIdentity(item)));
      if (collected.length === 0 || (exactWorkspaceRequest && collected.length < workspaceEvidence.length)) {
        if (!context.missingContext.includes("INSUFFICIENT_EVIDENCE")) context.missingContext.push("INSUFFICIENT_EVIDENCE");
      }
    }
    context.verificationState.evidenceIds = context.evidence.filter((item) => item.status === "COLLECTED").map((item) => item.provenance);
    return context;
  }

  toReasoningPrompt(context: AgentContext, visibleEvidence?: Map<string, string>, compactRuntime = false): string {
    return this.serializer.forReasoning(context, visibleEvidence, compactRuntime);
  }

  evidenceAuditPayload(context: AgentContext): Record<string, unknown> {
    return {
      evidenceCount: context.evidence.length,
      collectedCount: context.evidence.filter((item) => item.status === "COLLECTED").length,
      deniedCount: context.evidence.filter((item) => item.status === "DENIED").length,
      sourceTypes: [...new Set(context.evidence.map((item) => item.sourceType))],
      statuses: context.evidence.map((item) => item.status),
      outcomes: context.evidence.map((item) => item.outcome ?? (item.status === "COLLECTED" ? item.content?.truncated ? "TRUNCATED" : "READ" : item.status)),
      provenance: context.evidence.map((item) => item.provenance),
      runtimeEvidence: context.evidence.flatMap(item => item.runtimeReference ? [item.runtimeReference] : []),
      relativePaths: context.evidence.map((item) => item.relativePath).filter((path): path is string => Boolean(path)),
      attachmentIds: context.evidence.map((item) => item.attachmentId).filter((id): id is string => Boolean(id)),
      truncated: context.truncated,
      selectedEvidenceCount: context.truncation.selectedEvidenceCount,
      totalCandidateEvidenceCount: context.truncation.totalCandidateEvidenceCount,
      droppedEvidenceIds: context.truncation.droppedEvidenceIds,
      truncatedEvidenceIds: context.truncation.truncatedEvidenceIds,
      remainingEvidenceBudget: context.truncation.remainingEvidenceBudget,
      warnings: context.warnings,
      missingContext: context.missingContext
    };
  }

  private shouldDiscoverConversationAttachments(context: AgentContext, instruction: string): boolean {
    return context.attachmentContext.required || /\b(pdf|document|attachment|requirements?|spec|specification|upload)\b/i.test(instruction);
  }

  private shouldCollectProjectEvidence(context: AgentContext): boolean {
    return context.workspaceContext.required
      || context.repositoryContext.required
      || context.userIntent.some((intent) => ["DEBUG", "SEARCH", "INSPECT", "COMPARE", "SECURITY_REVIEW", "MODIFY"].includes(intent));
  }

  private selectWorkspaceFiles(
    root: { type: string; path: string; children?: Array<{ type: string; path: string; children?: any[] }> },
    instruction: string
  ): string[] {
    const files: string[] = [];
    const visit = (node: { type: string; path: string; children?: Array<{ type: string; path: string; children?: any[] }> }) => {
      if (node.type === "file" && node.path && !node.path.split("/").slice(0, -1).some(excludedFromWorkspaceDiscovery)) files.push(node.path);
      for (const child of node.children ?? []) visit(child);
    };
    visit(root);
    const tokens = workspaceQueryTokens(instruction);
    const ranked = files.map((path) => ({
      path,
      relevance: workspacePathRelevance(path, tokens),
      score: workspaceDiscoveryPriority(path, false, tokens)
    })).sort((a, b) => b.score - a.score || a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path, "en"));
    if (tokens.length > 0 && !isBroadWorkspaceReview(instruction)) {
      // A semantic miss is an evidence gap, never an unrelated-file fallback.
      return ranked.filter(item => item.relevance > 0).slice(0, AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS).map(item => item.path);
    }
    // A broad review gets a representative bounded mix instead of five
    // manifests or generated files from the first subtree.
    const representatives = ["manifest", "source", "config", "test", "docs"].flatMap(category => {
      const match = ranked.find(item => workspaceFileCategory(item.path) === category);
      return match ? [match.path] : [];
    });
    return [...new Set([...representatives, ...ranked.map(item => item.path)])].slice(0, AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS);
  }

  private prioritizeEvidence(evidence: AgentEvidence[], instruction: string, explicitEvidenceIds = new Set<string>()): AgentEvidence[] {
    const tokens = extractEvidenceQueryTokens(instruction);
    const enriched = evidence.map((item) => this.enrichEvidenceMetadata(item, tokens));
    return enriched.sort((a, b) => {
      const requestedDifference = Number(explicitEvidenceIds.has(evidenceIdentity(b))) - Number(explicitEvidenceIds.has(evidenceIdentity(a)));
      if (requestedDifference) return requestedDifference;
      if (a.status === "COLLECTED" && b.status !== "COLLECTED") return -1;
      if (b.status === "COLLECTED" && a.status !== "COLLECTED") return 1;
      const aRank = evidenceRank(a);
      const bRank = evidenceRank(b);
      if (bRank !== aRank) return bRank - aRank;
      return evidenceIdentity(a).localeCompare(evidenceIdentity(b), "en");
    });
  }

  private enrichEvidenceMetadata(item: AgentEvidence, tokens: string[]): AgentEvidence {
    const priority = item.priority ?? AGENT_EVIDENCE_SOURCE_PRIORITY[item.sourceType] ?? 0;
    const queryTarget = `${item.relativePath ?? ""} ${String(item.metadata?.fileName ?? item.metadata?.title ?? "")}`.trim();
    const relevanceScore = item.relevanceScore ?? (queryTarget ? scoreEvidencePath(queryTarget, tokens) : 0);
    const selectionReason = item.selectionReason ?? `source_priority=${priority},query_relevance=${relevanceScore},status=${item.status}`;
    return {
      ...item,
      priority,
      relevanceScore,
      selectionReason
    };
  }

  deduplicateEvidence(evidence: AgentEvidence[]): AgentEvidence[] {
    const result: AgentEvidence[] = [];
    const seenKeys = new Map<string, AgentEvidence>();

    for (const item of evidence) {
      const keys = this.candidateIdentityKeys(item);
      const existing = keys.map((k) => seenKeys.get(k)).find((match): match is AgentEvidence => Boolean(match));

      if (!existing) {
        result.push(item);
        for (const k of keys) {
          seenKeys.set(k, item);
        }
      } else {
        this.mergeDuplicateMetadata(existing, item);
        for (const k of keys) {
          if (!seenKeys.has(k)) {
            seenKeys.set(k, existing);
          }
        }
      }
    }

    return result;
  }

  private candidateIdentityKeys(item: AgentEvidence): string[] {
    const keys: string[] = [];
    const prov = item.provenance?.trim();
    if (prov) {
      keys.push(`prov:${prov}`);
    }
    if (item.sourceType && item.sourceId && item.relativePath) {
      keys.push(`path:${item.sourceType}:${item.sourceId}:${item.relativePath}`);
    }
    if (item.repositoryId && item.relativePath) {
      keys.push(`path:${item.sourceType}:${item.repositoryId}:${item.relativePath}`);
    }
    if (item.attachmentId?.trim()) {
      keys.push(`att:${item.attachmentId.trim()}`);
    }
    const artifactId = item.metadata?.artifactId;
    if (typeof artifactId === "string" && artifactId.trim()) {
      keys.push(`art:${artifactId.trim()}`);
    }
    if (keys.length === 0) {
      keys.push(`source:${item.sourceType}:${item.sourceId}`);
    }
    return keys;
  }

  private mergeDuplicateMetadata(existing: AgentEvidence, duplicate: AgentEvidence): void {
    const warningSet = new Set(existing.warnings);
    for (const warning of duplicate.warnings) {
      if (warning && !warningSet.has(warning)) {
        existing.warnings.push(warning);
        warningSet.add(warning);
      }
    }

    if (duplicate.metadata && typeof duplicate.metadata === "object") {
      for (const [key, value] of Object.entries(duplicate.metadata)) {
        if (existing.metadata[key] === undefined && value !== undefined) {
          existing.metadata[key] = value;
        }
      }
    }

    if (!existing.relativePath && duplicate.relativePath) {
      existing.relativePath = duplicate.relativePath;
    }
    if (!existing.attachmentId && duplicate.attachmentId) {
      existing.attachmentId = duplicate.attachmentId;
    }
    if (!existing.repositoryId && duplicate.repositoryId) {
      existing.repositoryId = duplicate.repositoryId;
    }

    if (existing.status === "PENDING" && duplicate.status === "COLLECTED") {
      existing.status = duplicate.status;
      if (!existing.content && duplicate.content) {
        existing.content = duplicate.content;
      }
    }
  }

  private errorCode(error: unknown): string {
    if (error instanceof WorkspaceIntelligenceError) return error.code;
    if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
      return (error as { code: string }).code;
    }
    return "WORKSPACE_INSPECTION_FAILED";
  }
}
