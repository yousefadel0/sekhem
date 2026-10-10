import type { SkillDefinition, SkillExecutionContext, SkillExecutionResult } from "./skill.interface";
import { WorkspaceCapabilityService, type CapabilityRequest } from "../capabilities/workspace-capability.service";
import { WorkspaceIntelligenceError } from "../../workspace-intelligence/workspace-intelligence.errors";
import { fileReadOutcome } from "../../file-intelligence/file-read-outcome";

export class WorkspaceReaderSkill implements SkillDefinition {
  readonly id = "workspace_reader";
  readonly name = "Workspace Reader";
  readonly category = "intelligence" as const;
  readonly riskLevel = "low" as const;
  readonly requiresApproval = false;
  readonly isReadOnly = true;
  readonly requiredRoles = ["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"] as const;
  readonly parametersSchema = {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["discover", "list", "search", "inspect", "evidence", "auto"]
      },
      relativePath: { type: "string" },
      query: { type: "string" },
      paths: { type: "array", items: { type: "string" } },
      trustedRoot: { type: "string", description: "Internal trusted local root established by the caller, never a client absolute browse path" }
    }
  };

  constructor(private readonly capabilities: WorkspaceCapabilityService) {}

  async execute(input: SkillExecutionContext): Promise<SkillExecutionResult> {
    const params = input.context ?? {};
    const request: CapabilityRequest = {
      projectId: input.projectId,
      workspaceId: input.projectId,
      name: input.projectId,
      trustedRoot: typeof params.trustedRoot === "string" ? params.trustedRoot : undefined,
      userId: input.userId,
      userRole: input.userRole,
      organizationId: typeof params.organizationId === "string" ? params.organizationId : undefined,
      workspaceVersion: typeof params.workspaceVersion === "string" ? params.workspaceVersion : undefined,
      agentRunId: input.agentRunId
    };

    const operation = this.resolveOperation(typeof params.operation === "string" ? params.operation : "auto", input.instruction, params);

    try {
      if (operation === "discover") {
        const result = await this.capabilities.discover(request, typeof params.relativePath === "string" ? params.relativePath : undefined);
        return {
          success: true,
          output: {
            capability: "workspace.discover",
            tree: result.tree,
            context: result.context,
            audit: result.audit
          },
          summary: `Discovered ${result.tree.fileCount} files and ${result.tree.directoryCount} directories.`
        };
      }

      if (operation === "list") {
        const dir = typeof params.relativePath === "string" ? params.relativePath : "";
        const result = await this.capabilities.list(request, dir);
        return {
          success: true,
          output: { capability: "workspace.list", path: result.path, children: result.children, audit: result.audit },
          summary: `Listed ${result.children.length} entries in ${result.path || "."}.`
        };
      }

      if (operation === "search") {
        const query = typeof params.query === "string" ? params.query : input.instruction;
        const result = await this.capabilities.search(request, query, typeof params.relativePath === "string" ? params.relativePath : undefined);
        return {
          success: true,
          output: { capability: "workspace.search", matches: result.matches, truncated: result.truncated, audit: result.audit },
          summary: `Found ${result.matches.length} matching paths.`
        };
      }

      if (operation === "inspect") {
        const relativePath = typeof params.relativePath === "string" ? params.relativePath : "";
        const result = await this.capabilities.inspect(request, relativePath);
        return {
          success: true,
          output: {
            capability: "file.inspect",
            document: result.document,
            audit: result.audit
          },
          summary: `Inspected ${result.document.fileName} via ${result.document.extractorId}.`
        };
      }

      const paths = Array.isArray(params.paths) ? params.paths.filter((p): p is string => typeof p === "string") : [];
      const result = await this.capabilities.collectEvidence(request, paths);
      return {
        success: true,
        output: { capability: "evidence.collect", context: result.context, audit: result.audit },
        summary: `Collected evidence from ${result.context.evidence.length} files.`
      };
    } catch (err) {
      const code = err instanceof WorkspaceIntelligenceError ? err.code : "WORKSPACE_INSPECTION_FAILED";
      return {
        success: false,
        failureCode: fileReadOutcome(err) === "DENIED" ? "BLOCKED" : "FAILED",
        output: { capability: operation, code },
        summary: err instanceof WorkspaceIntelligenceError ? err.message : "Workspace read failed."
      };
    }
  }

  private resolveOperation(requested: string, instruction: string, params: Record<string, unknown>): "discover" | "list" | "search" | "inspect" | "evidence" {
    if (requested === "discover" || requested === "list" || requested === "search" || requested === "inspect" || requested === "evidence") {
      return requested;
    }
    if (Array.isArray(params.paths) && params.paths.length > 0) return "evidence";
    if (typeof params.query === "string" && params.query.trim()) return "search";
    if (typeof params.relativePath === "string" && params.relativePath.includes(".")) return "inspect";
    if (typeof params.relativePath === "string") return "list";
    const lower = instruction.toLowerCase();
    if (lower.includes("search") || lower.includes("where is") || lower.includes("find ")) return "search";
    if (lower.includes("read ") || lower.includes("inspect ")) return "inspect";
    if (lower.includes("list ")) return "list";
    return "discover";
  }
}
