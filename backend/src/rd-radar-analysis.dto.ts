import type { SafeSchemaValidationIssue } from "./ai-gateway/rd-radar-output.schema";

export type RDRadarAnalysisStatus = "RUNNING" | "FAIL" | "ABORTED" | "REVIEW_REQUIRED";

export interface RDRadarAnalysisRequestDto {
  idempotencyKey: string;
  repositoryConnectionId: string;
  branch?: string;
  commit?: string;
  reference?: string;
  providerId: string;
  modelId: string;
  analysisPurpose: string;
  includePaths?: string[];
}

export interface RDRadarCitationDto {
  citationId: string;
  repository: string;
  commitSha: string;
  path: string;
  startLine: number;
  endLine: number;
}

export interface RDRadarFindingDto {
  title: string;
  category: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence: number;
  citations: RDRadarCitationDto[];
  businessImpact: string;
  technicalRisk: string;
  recommendation: string;
  uncertainty: string;
  requiredAdditionalEvidence: string[];
  candidateDraftRecommendation: string;
}

export interface RDRadarAnalysisResultDto {
  schemaVersion: "rd-radar-analysis.v1";
  summary: string;
  findings: RDRadarFindingDto[];
  runtimeMetadata?: {
    providerCallExecuted: boolean;
    durationMs: number;
    httpClassification: string;
    httpStatus: number | null;
    finishReason: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
    configuredMaxOutputTokens: number;
  };
  validationIssues?: SafeSchemaValidationIssue[];
}

export interface RDRadarAnalysisRunDto {
  id: string;
  repositoryConnectionId: string;
  providerId: string;
  modelId: string;
  requestedRef: string;
  commitSha: string | null;
  analysisPurpose: string;
  promptVersion: string;
  status: RDRadarAnalysisStatus;
  sanitizedFailureReason: string | null;
  result: RDRadarAnalysisResultDto | Record<string, never>;
  evidenceItemIds: string[];
  candidateId: string | null;
  startedAt: string;
  completedAt: string | null;
}
