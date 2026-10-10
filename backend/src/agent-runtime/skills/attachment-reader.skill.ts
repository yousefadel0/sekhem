import { FileIntelligenceError } from "../../file-intelligence/file-intelligence.errors";
import { fileReadOutcome } from "../../file-intelligence/file-read-outcome";
import { AttachmentCapabilityService } from "../capabilities/attachment-capability.service";
import type { SkillDefinition, SkillExecutionContext, SkillExecutionResult } from "./skill.interface";

/** Read-only skill for explicit conversation attachment references. */
export class AttachmentReaderSkill implements SkillDefinition {
  readonly id = "attachment_reader";
  readonly name = "Attachment Reader";
  readonly category = "intelligence" as const;
  readonly riskLevel = "low" as const;
  readonly requiresApproval = false;
  readonly isReadOnly = true;
  readonly requiredRoles = ["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"] as const;
  readonly parametersSchema = {
    type: "object",
    properties: {
      conversationId: { type: "string" },
      attachmentIds: { type: "array", items: { type: "string" }, maxItems: 5 }
    },
    required: ["conversationId", "attachmentIds"]
  };

  constructor(private readonly capabilities: AttachmentCapabilityService) {}

  async execute(input: SkillExecutionContext): Promise<SkillExecutionResult> {
    const params = input.context ?? {};
    const conversationId = typeof params.conversationId === "string" ? params.conversationId.trim() : "";
    const attachmentIds = Array.isArray(params.attachmentIds)
      ? [...new Set(params.attachmentIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))].slice(0, 5)
      : [];
    if (!conversationId || attachmentIds.length === 0) {
      return { success: false, output: { capability: "attachment.read", code: "ATTACHMENT_REFERENCE_REQUIRED" }, summary: "conversationId and attachmentIds are required." };
    }

    try {
      const reads = await Promise.all(attachmentIds.map((attachmentId) => this.capabilities.read({
        userId: input.userId,
        conversationId,
        attachmentId,
        agentRunId: input.agentRunId
      })));
      // The runtime persists skill output in events. Keep raw normalized text out of
      // that audit trail; provenance, limits, and extractor metadata remain auditable.
      return {
        success: true,
        output: {
          capability: "attachment.read",
          attachments: reads.map((read) => ({
            sourceType: read.sourceType,
            conversationId: read.conversationId,
            attachmentId: read.attachmentId,
            fileName: read.fileName,
            mimeType: read.mimeType,
            size: read.size,
            status: read.status,
            metadata: read.metadata,
            warnings: read.warnings,
            truncated: read.truncated,
            provenance: read.provenance,
            audit: read.audit
          }))
        },
        summary: `Read ${reads.length} attachment${reads.length === 1 ? "" : "s"} through File Intelligence.`
      };
    } catch (error) {
      const code = error instanceof FileIntelligenceError ? error.code : "ATTACHMENT_READ_FAILED";
      return { success: false, failureCode: fileReadOutcome(error) === "DENIED" ? "BLOCKED" : "FAILED", output: { capability: "attachment.read", code }, summary: "Attachment read failed." };
    }
  }
}
