import { WORKSPACE_INTELLIGENCE_LIMITS } from "../../workspace-intelligence/workspace-intelligence.limits";
import type { FileReadOutcome } from "../../file-intelligence/file-read-outcome";

export const AGENT_FILE_READER_LIMITS = {
  MAX_SEARCH_RESULTS: 20,
  MAX_EVIDENCE_ITEMS: 5,
  MAX_CONTEXT_FILES: 8,
  MAX_LIST_CHILDREN: 200,
  MAX_EVIDENCE_TEXT_CHARS: WORKSPACE_INTELLIGENCE_LIMITS.MAX_INSPECTION_TEXT_CHARS
} as const;

export type AgentFileReaderCapability =
  | "workspace.discover"
  | "workspace.list"
  | "workspace.search"
  | "file.inspect"
  | "evidence.collect";

export interface CapabilityAudit {
  capability: AgentFileReaderCapability;
  agentRunId?: string;
  projectId: string;
  workspaceId: string;
  relativePaths: string[];
  allowed: boolean;
  deniedReason?: string;
  truncated: boolean;
  durationMs: number;
  status: "ok" | "denied" | "failed";
}

export interface EvidenceItem {
  outcome?: FileReadOutcome;
  relativePath: string;
  fileType?: string;
  extractorId?: string;
  text: string;
  truncated: boolean;
  warnings: string[];
  sourceIdentity: string;
}

export interface WorkspaceContext {
  workspaceId: string;
  projectId: string;
  source: "local" | "unknown";
  fileCount?: number;
  directoryCount?: number;
  totalBytes?: number;
  selectedFiles: string[];
  evidence: EvidenceItem[];
  warnings: string[];
  truncated: boolean;
  provenance: string[];
  limitsEncountered: string[];
}
