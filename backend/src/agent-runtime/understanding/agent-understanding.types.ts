import type { NormalizedDocumentContent } from "../../file-intelligence/models/normalized-document-content";
import { ASSISTANT_CONTEXT_LIMITS } from "../../ai-gateway/assistant-context-budget";
import type { FileReadOutcome } from "../../file-intelligence/file-read-outcome";
import type { ProviderDiagnostic } from "../../ai-gateway/provider-diagnostic";

/** Shape-only diagnostics; never contains rejected model text. */
export interface PlanningStringDiagnostic {
  presence: "present" | "missing";
  valueKind: "undefined" | "null" | "array" | "object" | "string" | "number" | "boolean";
  trimmedEmpty?: boolean;
  characterCount?: number;
}

/** Server-computed grounding checks only; never contains model text or references. */
export type UnderstandingGroundingDiagnostic =
  | { evidenceReferenceAdmitted: boolean; exactSubstringMatch: boolean;
      comparison?: import("../inspection/grounding-comparison-diagnostic").FactComparisonDiagnostic }
  | { factIdsValid: boolean; support?: import("../inspection/grounding-comparison-diagnostic").InferenceSupportDiagnostic };

export const AGENT_INTENTS = ["CHAT", "CONVERSE", "INSPECT", "UNDERSTAND", "SEARCH", "EXPLAIN", "COMPARE", "DEBUG", "MODIFY", "TEST", "EXECUTE", "VERIFY", "RESEARCH", "PLAN", "INITIATIVE", "SECURITY_REVIEW"] as const;
export type AgentIntent = (typeof AGENT_INTENTS)[number];
export type AgentOperationClass = "READ" | "WRITE" | "EXECUTE";
export type AgentContextSource = "conversation" | "memory" | "attachment" | "workspace" | "repository" | "gitlab" | "artifact";
export type MissingContextCode = "PROJECT_OR_REPOSITORY" | "ATTACHMENT" | "WORKSPACE_SCOPE" | "UNSUPPORTED_SOURCE" | "INSUFFICIENT_EVIDENCE" | "CAPABILITY_NOT_ENABLED";

export const AGENT_UNDERSTANDING_LIMITS = {
  MAX_PLAN_STEPS: 6,
  MAX_EVIDENCE_ITEMS: 5,
  MAX_SELECTED_CAPABILITIES: 4,
  MAX_RETRIES: 1,
  MAX_MODEL_EVIDENCE_CHARS: ASSISTANT_CONTEXT_LIMITS.evidenceChars
} as const;

/** Execution work and a single model context have separate resource budgets. */
export const INSPECTION_RESOURCE_LIMITS = {
  DEFAULT_OPERATIONS: 24,
  MAX_OPERATIONS: 64,
  MAX_CONTEXT_SOURCES: 24,
  /** Inspection only. The gateway still enforces the model window and exact UTF-8 request ceiling. */
  MAX_CONTEXT_CHARS: 64_000,
  MAX_CORRECTIVE_ATTEMPTS: 2
} as const;

export interface AgentEvidence {
  runtimeReference?: import("../../workspace-intelligence/workspace-runtime.contract").RuntimeEvidenceReference;
  outcome?: FileReadOutcome;
  sourceType: AgentContextSource;
  sourceId: string;
  relativePath?: string;
  attachmentId?: string;
  repositoryId?: string;
  /** Bounded normalized content is transient; it is not persisted as private reasoning. */
  content?: Pick<NormalizedDocumentContent, "text" | "extractorId" | "detectedMime" | "truncated">;
  metadata: Record<string, unknown>;
  provenance: string;
  status: "COLLECTED" | "UNAVAILABLE" | "DENIED" | "PENDING";
  warnings: string[];
  /** Existing source-rank used by AgentContextBuilder; not a separate scoring engine. */
  priority?: number;
  /** Existing path/name query score used by AgentContextBuilder. */
  relevanceScore?: number;
  /** Explainable, content-free reason for retention/order. */
  selectionReason?: string;
}

export const AGENT_EVIDENCE_SOURCE_PRIORITY: Record<AgentContextSource, number> = {
  attachment: 50,
  workspace: 40,
  repository: 35,
  gitlab: 35,
  artifact: 20,
  conversation: 10,
  memory: 1
};

export interface AgentContextTruncation {
  selectedEvidenceCount: number;
  totalCandidateEvidenceCount: number;
  droppedEvidenceIds: string[];
  truncatedEvidenceIds: string[];
  remainingEvidenceBudget: number;
}

export function emptyContextTruncation(): AgentContextTruncation {
  return {
    selectedEvidenceCount: 0,
    totalCandidateEvidenceCount: 0,
    droppedEvidenceIds: [],
    truncatedEvidenceIds: [],
    remainingEvidenceBudget: AGENT_UNDERSTANDING_LIMITS.MAX_MODEL_EVIDENCE_CHARS
  };
}

/** Stable identity for deduplication. Provenance first; never content text. */
export function evidenceIdentity(item: AgentEvidence): string {
  if (item.provenance && item.provenance.trim()) return item.provenance.trim();
  if (item.attachmentId && item.attachmentId.trim()) return `attachment:${item.attachmentId.trim()}`;
  const artifactId = item.metadata?.artifactId;
  if (typeof artifactId === "string" && artifactId.trim()) return `artifact:${artifactId.trim()}`;
  if (item.repositoryId && item.relativePath) return `${item.sourceType}:${item.repositoryId}:${item.relativePath}`;
  if (item.relativePath) return `${item.sourceType}:${item.sourceId}:${item.relativePath}`;
  return `${item.sourceType}:${item.sourceId}`;
}

export function evidenceRank(item: AgentEvidence): number {
  return (item.priority ?? AGENT_EVIDENCE_SOURCE_PRIORITY[item.sourceType] ?? 0) + (item.relevanceScore ?? 0);
}

export interface AgentVerificationState {
  required: boolean;
  strategy: "GROUNDED_EVIDENCE" | "TEST_OR_INSPECTION" | "NONE";
  status: "NOT_REQUIRED" | "PENDING" | "VERIFIED" | "FAILED";
  evidenceIds: string[];
  failures: string[];
  completedAt?: string;
}

export interface AgentUnderstandingPlanStep {
  id: string;
  objective: string;
  capability?: string;
  input: Record<string, unknown>;
  expectedResult: string;
  dependencies: string[];
  status: "PLANNED" | "BLOCKED";
  verificationRequired: boolean;
}

/** Phase 4 interprets collected context. None of these types authorize execution. */
export interface AgentInformationRequirement {
  id: string;
  state: "KNOWN" | "UNKNOWN" | "NOT_APPLICABLE";
  description: string;
  whyNeeded: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  /** Inspection gap scope only; never evidence or execution authority. Omission remains required. */
  evidenceCategory?: "REQUIRED_INFORMATION" | "OPTIONAL_VISUAL" | "OPTIONAL_CONTEXT";
}

export interface AgentConstraint {
  id: string;
  source: "USER" | "RUNTIME" | "INFERRED";
  description: string;
  /** Exact request span for a user constraint; evidence never supplies constraints. */
  requestQuote?: string;
  rule: "PLANNING_ONLY" | "CERTIFIED_SOURCE_REUSE" | "NO_WRITE" | "NO_EXECUTE" | "NO_DESTRUCTIVE" | "HERO_TITLE_TEXT_ONLY" | "PACKAGE_VERSION_ONLY" | "UNRESOLVED";
  /** Bounded planning scope only; never executable parameters or authority. */
  packageVersionChange?: { relativePath: "package.json"; before: string; after: string; evidenceRef: string; sourceSha256: string; versionExcerpt: string };
  /** Exact clauses retained when equivalent bounded constraints are normalized. */
  requestQuotes?: string[];
  /** Server-derived engineering scope, never execution authority or model-supplied input. */
  textChange?: {
    relativePath: "index.html"; evidenceRef: string; sourceSha256: string;
    selector: "section.hero h1"; before: string; after: string;
    start: number; end: number; replacement: string; titleExcerpt: string;
  };
}

export interface AgentSuccessCriterion {
  id: string;
  description: string;
  source: "USER" | "RUNTIME";
  requestQuote?: string;
}

export interface AgentUnderstanding {
  intent: AgentIntent[];
  objective: string;
  scope: Array<{ id: string; kind: "PROJECT" | "EVIDENCE"; reference: string; evidenceRefs: string[] }>;
  constraints: AgentConstraint[];
  expectedOutcome: { description: string; source: "USER" | "RUNTIME" };
  successCriteria: AgentSuccessCriterion[];
  /** Facts are verified source excerpts, not model-authored semantic assertions. */
  facts: Array<{ id: string; kind: "SOURCE_EXCERPT"; text: string; evidenceRef: string; start: number; end: number }>;
  inferences: Array<{ id: string; text: string; factIds: string[]; uncertainty: string }>;
  hypotheses: Array<{ id: string; text: string; evidenceRefs: string[]; uncertainty: string }>;
  unknowns: AgentInformationRequirement[];
  evidenceRefs: string[];
  evidenceGaps: Array<{ requirementId: string; evidenceRefs: string[] }>;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  readiness: "UNDERSTANDING_READY" | "NEEDS_EVIDENCE" | "NEEDS_CLARIFICATION" | "INSUFFICIENT_CONTEXT";
}

export interface AgentPlannedStep extends AgentUnderstandingPlanStep {
  type: "INSPECT" | "ANALYZE" | "PROPOSE" | "IMPLEMENT" | "VERIFY";
  purpose: string;
  requiredEvidence: string[];
  missingInformationIds: string[];
  scopeRefs: string[];
  effect: "READ_ONLY" | "WRITE" | "EXECUTE" | "DESTRUCTIVE";
  risk: "LOW" | "MEDIUM" | "HIGH";
  verification: { status: "PLANNED"; criterionIds: string[] };
}

export interface AgentPlan {
  objective: string;
  assumptions: Array<{ id: string; description: string; status: "UNVERIFIED" }>;
  constraints: AgentConstraint[];
  steps: AgentPlannedStep[];
  missingInformation: AgentInformationRequirement[];
  stopConditions: string[];
  successCriteria: AgentSuccessCriterion[];
  readiness: "PLAN_READY" | "PLAN_NOT_READY";
  authorization: "NOT_GRANTED";
  validation: { valid: boolean; issues: Array<{ code: string; path: string; stringDiagnostic?: PlanningStringDiagnostic; groundingDiagnostic?: UnderstandingGroundingDiagnostic }> };
}

export interface AgentPlanningResult {
  version: 1;
  understanding: AgentUnderstanding;
  plan: AgentPlan;
  /** All engineering-planning unknowns, including retained nonblocking limitations. */
  planningInformation?: import("./planning-information").PlanningInformation[];
  /** Server-derived observability only; never changes validation or readiness. */
  readinessDiagnostic?: import("./planning-readiness-diagnostic").PlanningReadinessDiagnostic;
}

export interface AgentContext {
  /** Set only after the existing certified planning-source admission succeeds. */
  certifiedSourceReuse?: boolean;
  /** Server-resolved parent after relationship validation and authoritative receipt re-admission. */
  transferredEvidenceConversationId?: string;
  providerDiagnostics?: ProviderDiagnostic[];
  workspaceBinding?: import("../../workspace-intelligence/models/workspace.types").WorkspaceBinding;
  userId: string;
  projectId?: string;
  conversationId?: string;
  agentRunId?: string;
  userIntent: AgentIntent[];
  objective: string;
  operationClass: AgentOperationClass;
  constraints: string[];
  conversationContext: { hasHistory: boolean; attachmentIds: string[] };
  memoryContext: { available: boolean; advisory: true };
  workspaceContext: { required: boolean; available: boolean };
  attachmentContext: { required: boolean; attachmentIds: string[] };
  repositoryContext: { required: boolean; available: boolean };
  evidence: AgentEvidence[];
  availableCapabilities: string[];
  selectedCapabilities: string[];
  plan: AgentUnderstandingPlanStep[];
  verificationState: AgentVerificationState;
  missingContext: MissingContextCode[];
  assumptions: Array<{ key: string; value: string; source: "explicit" | "system" }>;
  warnings: string[];
  /** True when one or more bounded sources or evidence bodies were shortened. */
  truncated: boolean;
  truncation: AgentContextTruncation;
}

export interface AgentUnderstandingInput {
  runtimeEvidence?: import("../../workspace-intelligence/workspace-runtime.contract").RuntimeEvidenceReference[];
  sessionClaims?: import("../../auth/auth.dto").SessionClaims;
  workspaceVersion?: string;
  userId: string;
  projectId?: string;
  conversationId?: string;
  agentRunId?: string;
  instruction: string;
  attachmentIds?: string[];
  hasConversationHistory?: boolean;
  hasMemoryContext?: boolean;
  workspaceAvailable?: boolean;
  repositoryAvailable?: boolean;
  /** Existing RepositoryConnection id when the caller already resolved one; never a client filesystem path. */
  repositoryConnectionId?: string;
  availableCapabilities: string[];
}

export const EVIDENCE_READ_SKILLS = ["attachment_reader", "workspace_reader", "repo_snapshot_reader"] as const;

const EVIDENCE_STOPWORDS = new Set([
  "the", "a", "an", "this", "that", "these", "those", "where", "what", "when", "who", "why", "how",
  "is", "are", "was", "were", "be", "been", "being", "in", "on", "of", "for", "to", "and", "or", "not",
  "please", "can", "you", "we", "our", "my", "me", "it", "its", "with", "from", "into", "about",
  "find", "show", "tell", "look", "need", "want"
]);

/** Bounded query tokens for path/name relevance. Not a semantic index. */
export function extractEvidenceQueryTokens(instruction: string): string[] {
  return [...new Set(instruction.toLowerCase().split(/[^a-z0-9_\u0600-\u06ff]+/i).filter((token) => {
    if (token.length < 3) return false;
    return !EVIDENCE_STOPWORDS.has(token);
  }))];
}

export function scoreEvidencePath(pathOrName: string, tokens: string[], important = false): number {
  const hay = pathOrName.toLowerCase();
  const parts = hay.split(/[^a-z0-9\u0600-\u06ff]+/).filter((part) => part.length >= 3);
  let score = important ? 2 : 0;
  for (const token of tokens) {
    if (hay.includes(token) || parts.some((part) => token.includes(part) || part.includes(token))) score += 4;
  }
  return score;
}

export function preferredReadSkillId(selectedCapabilities: string[]): string | undefined {
  return EVIDENCE_READ_SKILLS.find((id) => selectedCapabilities.includes(id));
}

export function isBroadWorkspaceReview(instruction: string): boolean {
  return /\b(architecture|overview|structure|entire|whole)\b/i.test(instruction)
    || /\b(analyze|analyse|review)\s+this\s+(project|workspace|repository|codebase)\b/i.test(instruction);
}
export interface EngineeringPlanIdentity {
  version: 1; planId: string; planVersion: number; digest: string; executionEnabled: false;
  sourceRunId: string; sourceConversationId: string; understandingSequence: number; understandingDigest: string;
  workspace: { workspaceId: string; bindingVersion: number; runtimeId: string; runtimeFingerprint: string };
  evidenceReferences: import("../../workspace-intelligence/workspace-runtime.contract").RuntimeEvidenceReference[];
  previousPlanId: string | null;
}
export interface PlanningCheckpointResponse { runId: string; planId: string; version: number; status: string; digest?: string }

