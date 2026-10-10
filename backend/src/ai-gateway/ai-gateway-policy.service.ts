import { Injectable } from "@nestjs/common";
import type { AiGatewayPolicyReview, AiGatewayRequestType, AiGatewayRiskFlag } from "./ai-gateway-policy.dto";

const ALLOWED_REQUEST_TYPES = new Set<AiGatewayRequestType>([
  "rag_answer_preview",
  "knowledge_summary_preview",
  "repository_context_summary_preview",
  "ai_patch_explanation_preview",
  "risk_review_preview"
]);

const SECRET_FIELD_PATTERN = /secret|token|authorization|password|private[-_ ]?key|\.env/i;
const RAW_LOG_FIELD_PATTERN = /raw[-_ ]?logs?|stack[-_ ]?trace/i;
const SECRET_VALUE_PATTERNS = [
  /\bsecrets?\b/i,
  /\btokens?\b/i,
  /\bauthorization\b/i,
  /\bpassword\b/i,
  /\.env\b/i,
  /private[-_ ]?key/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:10|127)\.(?:\d{1,3}\.){2}\d{1,3}\b/,
  /\b192\.168\.(?:\d{1,3}\.)\d{1,3}\b/,
  /\b172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3}\b/,
  /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.(?:\d{1,3}\.)\d{1,3}\b/,
  /\blocalhost\b/i
];
const RAW_LOG_VALUE_PATTERNS = [/\braw logs?\b/i, /\bstack trace\b/i, /\bat\s+\S+\s+\([^)]+:\d+:\d+\)/i, /\bTraceback \(most recent call last\):/i];
const REPOSITORY_WRITE_PATTERNS = [
  /\bgit\s+(?:add|apply|branch|checkout\s+-b|commit|merge|push|rebase|reset\s+--hard)\b/i,
  /\bgh\s+(?:issue|pr|release)\s+create\b/i
];
const DEPLOYMENT_PATTERNS = [
  /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?deploy\b/i,
  /\bdocker\s+(?:compose\s+up|stack\s+deploy)\b/i,
  /\bhelm\s+upgrade\b/i,
  /\bkubectl\s+apply\b/i,
  /\bsystemctl\s+(?:enable|restart|start)\b/i,
  /\bterraform\s+apply\b/i,
  /\bvercel\s+(?:deploy|--prod)\b/i
];
const FILE_APPLY_PATTERNS = [/\bapply_patch\b/i, /\bgit\s+apply\b/i, /\*\*\* Begin Patch\b/i];
const AUTONOMOUS_EXECUTION_PATTERNS = [
  /\bautonomous(?:ly)?\b/i,
  /\bauto[-_ ]?apply\b/i,
  /\bwithout human (?:approval|review)\b/i,
  /\bexecute automatically\b/i
];

@Injectable()
export class AiGatewayPolicyService {
  reviewRequest(input: unknown): AiGatewayPolicyReview {
    if (!this.isRecord(input) || !ALLOWED_REQUEST_TYPES.has(input.requestType as AiGatewayRequestType)) {
      return this.blockedResult(["UNSUPPORTED_REQUEST_TYPE"], []);
    }

    const riskFlags = new Set<AiGatewayRiskFlag>();
    const redactionsApplied = new Set<AiGatewayRiskFlag>();
    const sanitizedInput = this.sanitizeValue(input, riskFlags, redactionsApplied);

    if (riskFlags.size > 0) {
      return this.blockedResult([...riskFlags], [...redactionsApplied], sanitizedInput);
    }

    return {
      policyStatus: "ALLOWED_PREVIEW_ONLY",
      blocked: false,
      redactionsApplied: [],
      riskFlags: [],
      safeForPreview: true
    };
  }

  private sanitizeValue(value: unknown, riskFlags: Set<AiGatewayRiskFlag>, redactionsApplied: Set<AiGatewayRiskFlag>, fieldName = ""): unknown {
    if (typeof value === "string") {
      return this.sanitizeText(value, fieldName, riskFlags, redactionsApplied);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item, riskFlags, redactionsApplied, fieldName));
    }

    if (!this.isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => {
        if (SECRET_FIELD_PATTERN.test(key)) {
          return [key, this.redactField("SECRET_LIKE_CONTENT", riskFlags, redactionsApplied)];
        }
        if (RAW_LOG_FIELD_PATTERN.test(key)) {
          return [key, this.redactField("RAW_LOG_CONTENT", riskFlags, redactionsApplied)];
        }
        return [key, this.sanitizeValue(nestedValue, riskFlags, redactionsApplied, key)];
      })
    );
  }

  private sanitizeText(
    value: string,
    fieldName: string,
    riskFlags: Set<AiGatewayRiskFlag>,
    redactionsApplied: Set<AiGatewayRiskFlag>
  ): string {
    const matchedFlags = new Set<AiGatewayRiskFlag>();

    if (SECRET_FIELD_PATTERN.test(fieldName) || SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      matchedFlags.add("SECRET_LIKE_CONTENT");
    }
    if (RAW_LOG_FIELD_PATTERN.test(fieldName) || RAW_LOG_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      matchedFlags.add("RAW_LOG_CONTENT");
    }
    if (REPOSITORY_WRITE_PATTERNS.some((pattern) => pattern.test(value))) {
      matchedFlags.add("REPOSITORY_WRITE_REQUESTED");
    }
    if (DEPLOYMENT_PATTERNS.some((pattern) => pattern.test(value))) {
      matchedFlags.add("DEPLOYMENT_REQUESTED");
    }
    if (FILE_APPLY_PATTERNS.some((pattern) => pattern.test(value)) || AUTONOMOUS_EXECUTION_PATTERNS.some((pattern) => pattern.test(value))) {
      matchedFlags.add("HIGH_RISK_ACTION");
    }

    if (matchedFlags.size === 0) {
      return value;
    }

    matchedFlags.forEach((flag) => {
      riskFlags.add(flag);
      redactionsApplied.add(flag);
    });
    riskFlags.add("HIGH_RISK_ACTION");
    return "[redacted]";
  }

  private redactField(flag: AiGatewayRiskFlag, riskFlags: Set<AiGatewayRiskFlag>, redactionsApplied: Set<AiGatewayRiskFlag>): string {
    riskFlags.add(flag);
    riskFlags.add("HIGH_RISK_ACTION");
    redactionsApplied.add(flag);
    return "[redacted]";
  }

  private blockedResult(riskFlags: AiGatewayRiskFlag[], redactionsApplied: AiGatewayRiskFlag[], sanitizedInput?: unknown): AiGatewayPolicyReview {
    return {
      policyStatus: "BLOCKED",
      blocked: true,
      redactionsApplied,
      riskFlags: [...new Set(riskFlags)],
      safeForPreview: false,
      ...(sanitizedInput === undefined ? {} : { sanitizedInput })
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
