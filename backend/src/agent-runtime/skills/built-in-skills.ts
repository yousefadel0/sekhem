import type { AiAssistantResponseDto } from "../../ai-gateway/ai-gateway.dto";
import type { AiGatewayService } from "../../ai-gateway/ai-gateway.service";
import type { RuntimeConfigurationService } from "../../ai-gateway/runtime-configuration.service";
import type { RepositoryContentService } from "../../repository-source/repository-content.service";
import {
  persistableAiCallTrace,
  type AgentAiCallTrace,
  type SkillDefinition,
  type SkillExecutionContext,
  type SkillExecutionResult
} from "./skill.interface";

function memoProviderFailureSummary(result: AiAssistantResponseDto): string {
  const status = result.status === "PROVIDER_UNAVAILABLE" || result.status === "REAL_PROVIDER"
    ? result.status
    : "PROVIDER_UNAVAILABLE";
  const classification =
    typeof result.httpClassification === "string" && result.httpClassification.trim().length > 0
      ? result.httpClassification.trim()
      : null;
  if (classification && classification !== status) {
    return `Memo generation failed: ${status} (${classification})`;
  }
  return `Memo generation failed: ${status}`;
}

function aiCallTraceFromAssistant(result: AiAssistantResponseDto): AgentAiCallTrace {
  const providerCallSucceeded = result.status === "REAL_PROVIDER" && result.providerCallExecuted === true;
  return persistableAiCallTrace({
    kind: providerCallSucceeded ? "REAL_PROVIDER_CALL" : "PROVIDER_CALL_FAILED",
    providerId: typeof result.providerId === "string" ? result.providerId : null,
    modelId: typeof result.modelId === "string" ? result.modelId : null,
    correlationId: typeof result.correlationId === "string" ? result.correlationId : null,
    providerCallExecuted: providerCallSucceeded
  });
}

// ---------------------------------------------------------------------------
// Skill: repo_snapshot_reader
// Reads repository content via the fail-closed, read-only RepositoryContentService.
// All guardrails (path canonicalization, symlink blocking, byte budget, secret regex)
// are enforced by RepositoryContentService. No git writes or deployments.
// ---------------------------------------------------------------------------

export class RepoSnapshotReaderSkill implements SkillDefinition {
  readonly id = "repo_snapshot_reader";
  readonly name = "Repository Snapshot Reader";
  readonly category = "intelligence" as const;
  readonly riskLevel = "low" as const;
  readonly requiresApproval = false;
  readonly isReadOnly = true;
  readonly requiredRoles = ["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"] as const;
  readonly parametersSchema = {
    type: "object",
    properties: {
      repositoryConnectionId: { type: "string", description: "ID of the RepositoryConnection to snapshot" },
      ref: { type: "string", description: "Branch or commit ref to read" }
    },
    required: ["repositoryConnectionId"]
  };

  constructor(
    private readonly runtimeConfig: RuntimeConfigurationService,
    private readonly repoContent: RepositoryContentService
  ) {}

  async execute(input: SkillExecutionContext): Promise<SkillExecutionResult> {
    const params = input.context ?? {};
    const repositoryConnectionId = typeof params.repositoryConnectionId === "string" ? params.repositoryConnectionId : "";
    const ref = typeof params.ref === "string" ? params.ref : "main";

    if (!repositoryConnectionId) {
      return { success: false, output: null, summary: "repositoryConnectionId is required" };
    }

    try {
      // Fetch the RepositoryUseConfiguration from DB via RuntimeConfigurationService.
      // Then take a read-only snapshot via RepositoryContentService.
      // All security guardrails (path policy, symlink blocking, byte budget) apply.
      const connection = await this.runtimeConfig.repositoryForUse(repositoryConnectionId);
      const snapshot = await this.repoContent.snapshot(connection, ref);
      return {
        success: true,
        output: {
          repository: snapshot.repository,
          commitSha: snapshot.commitSha,
          fileCount: snapshot.fileCount,
          totalBytes: snapshot.totalBytes,
          skippedFiles: snapshot.skippedFiles,
          chunkCount: snapshot.chunks.length
        },
        summary: `Read ${snapshot.fileCount} files (${snapshot.totalBytes} bytes) from ${snapshot.repository}@${snapshot.commitSha}`
      };
    } catch (error: unknown) {
      return {
        success: false,
        output: null,
        summary: `Snapshot failed: ${error instanceof Error ? error.message : "unknown error"}`
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Skill: memo_generator
// Generates technical memo drafts via the AiGatewayService.
// All LLM inference routes through AiGatewayService — no direct provider calls.
// Produces an AgentArtifact of type TECHNICAL_MEMO.
// ---------------------------------------------------------------------------

export class MemoGeneratorSkill implements SkillDefinition {
  readonly id = "memo_generator";
  readonly name = "Technical Memo Generator";
  readonly category = "documentation" as const;
  readonly riskLevel = "medium" as const;
  readonly requiresApproval = false;
  readonly isReadOnly = true;
  readonly requiredRoles = ["Admin", "PM", "Technical Reviewer"] as const;
  readonly parametersSchema = {
    type: "object",
    properties: {
      topic: { type: "string", description: "The topic or initiative to generate a memo for" },
      context: { type: "string", description: "Additional context or instructions" }
    },
    required: ["topic"]
  };

  constructor(private readonly aiGateway: AiGatewayService) {}

  async execute(input: SkillExecutionContext): Promise<SkillExecutionResult> {
    const params = input.context ?? {};
    const topic = typeof params.topic === "string" ? params.topic : input.instruction;

    const question = `Generate a concise technical memo for: ${topic}. Format as structured sections: Summary, Background, Technical Details, Risks, Recommendations. Keep it factual and cite that human review is required before any action.`;

    const result = await this.aiGateway.askAssistant({ question, requestedBy: input.userId });
    const aiCall = aiCallTraceFromAssistant(result);

    if (result.status === "POLICY_BLOCKED") {
      return { success: false, failureCode: "BLOCKED", output: null, summary: "Memo generation blocked by policy", aiCall };
    }

    if (result.status !== "REAL_PROVIDER" || typeof result.answer !== "string" || result.answer.trim().length === 0) {
      return {
        success: false,
        output: null,
        summary: memoProviderFailureSummary(result),
        failureCode: result.finishReason === "length" ? "OUTPUT_TRUNCATED" : result.httpClassification === "INVALID_SCHEMA" ? "INVALID_STRUCTURED_OUTPUT" : "PROVIDER_FAILED",
        aiCall
      };
    }

    return {
      success: true,
      output: { memoContent: result.answer },
      summary: `Generated technical memo for: ${topic}`,
      aiCall,
      artifacts: [
        {
          title: `Technical Memo: ${topic}`,
          artifactType: "TECHNICAL_MEMO",
          content: result.answer,
          summary: `Auto-generated memo on '${topic}'. Requires human review before use.`,
          isCustomerSafe: false
        }
      ]
    };
  }
}

// ---------------------------------------------------------------------------
// Skill: security_finding_analyzer
// Analyzes security findings from the project against policy gates.
// Read-only, analytical only. Requires Technical Reviewer role minimum.
// ---------------------------------------------------------------------------

export class SecurityFindingAnalyzerSkill implements SkillDefinition {
  readonly id = "security_finding_analyzer";
  readonly name = "Security Finding Analyzer";
  readonly category = "analysis" as const;
  readonly riskLevel = "medium" as const;
  readonly requiresApproval = false;
  readonly isReadOnly = true;
  readonly requiredRoles = ["Admin", "PM", "Technical Reviewer", "Security Reviewer"] as const;
  readonly parametersSchema = {
    type: "object",
    properties: {
      findings: { type: "array", description: "Array of security finding objects to analyze" },
      policyThreshold: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Minimum severity to flag" }
    }
  };

  async execute(input: SkillExecutionContext): Promise<SkillExecutionResult> {
    const params = input.context ?? {};
    const findings: unknown[] = Array.isArray(params.findings) ? params.findings : [];
    const threshold = typeof params.policyThreshold === "string" ? params.policyThreshold : "high";

    const SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const thresholdRank = SEVERITY_RANK[threshold] ?? 3;

    const flagged = findings.filter((f) => {
      if (typeof f !== "object" || f === null) return false;
      const severity = (f as Record<string, unknown>).severity;
      return typeof severity === "string" && (SEVERITY_RANK[severity] ?? 0) >= thresholdRank;
    });

    const summary = `Analyzed ${findings.length} findings. ${flagged.length} meet or exceed '${threshold}' severity threshold. Human review required before taking any remediation action.`;

    return {
      success: true,
      output: { total: findings.length, flaggedCount: flagged.length, flagged, threshold },
      summary,
      artifacts: flagged.length > 0
        ? [{
            title: `Security Analysis Report — ${flagged.length} Flagged Findings`,
            artifactType: "VALIDATION_REPORT",
            content: JSON.stringify({ summary, flagged }, null, 2),
            summary,
            isCustomerSafe: false
          }]
        : []
    };
  }
}

// ---------------------------------------------------------------------------
// Skill: blocker_investigator
// Summarizes blocker logs and rollback requirements.
// High risk — requires approval before execution to avoid leaking internal rollback details.
// ---------------------------------------------------------------------------

export class BlockerInvestigatorSkill implements SkillDefinition {
  readonly id = "blocker_investigator";
  readonly name = "Blocker Investigator";
  readonly category = "analysis" as const;
  readonly riskLevel = "high" as const;
  readonly requiresApproval = true; // MUST pause for human approval
  readonly isReadOnly = true;
  readonly requiredRoles = ["Admin", "PM", "Technical Reviewer"] as const;
  readonly parametersSchema = {
    type: "object",
    properties: {
      blockers: { type: "array", description: "Array of blocker objects to analyze" }
    }
  };

  async execute(input: SkillExecutionContext): Promise<SkillExecutionResult> {
    const params = input.context ?? {};
    const blockers: unknown[] = Array.isArray(params.blockers) ? params.blockers : [];

    const summaries = blockers.map((b) => {
      if (typeof b !== "object" || b === null) return null;
      const bl = b as Record<string, unknown>;
      return {
        title: bl.title,
        severity: bl.severity,
        cause: bl.cause,
        suggestedAction: bl.suggestedAction,
        rollbackOption: bl.rollbackOption,
        requiresHumanReview: true
      };
    }).filter(Boolean);

    const content = JSON.stringify({ blockers: summaries, note: "All rollback actions require explicit human authorization." }, null, 2);

    return {
      success: true,
      output: { blockerCount: summaries.length, summaries },
      summary: `Investigated ${summaries.length} blockers. All rollback actions flagged for human authorization.`,
      artifacts: [{
        title: `Blocker Investigation Report — ${summaries.length} Blockers`,
        artifactType: "AUDIT_SUMMARY",
        content,
        summary: `${summaries.length} blockers investigated. Human authorization required for any rollback.`,
        isCustomerSafe: false
      }]
    };
  }
}
