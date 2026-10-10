export type RuntimeProviderType = "vllm_openai_compatible" | "mock";
export type RuntimeProviderHealth = "untested" | "healthy" | "unavailable";
export type StructuredOutputDialect = "LLAMACPP_JSON_SCHEMA" | "OPENAI_JSON_SCHEMA" | "VLLM_STRUCTURED_OUTPUTS" | "JSON_OBJECT_ONLY";
export type RuntimeTaskCategory = "repository_analysis" | "risk_review" | "evidence_summary";
export type RepositoryConnectionProviderType = "github" | "gitlab" | "local";

export interface RuntimeProviderDto {
  id: string;
  displayName: string;
  providerType: RuntimeProviderType;
  baseUrl: string;
  apiKeyConfigured: boolean;
  enabled: boolean;
  healthState: RuntimeProviderHealth;
  defaultTimeoutMs: number;
  structuredOutputDialect: StructuredOutputDialect | null;
  structuredOutputVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeModelDto {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
  defaultForProvider: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  supportedTasks: RuntimeTaskCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryConnectionDto {
  id: string;
  displayName: string;
  providerType: RepositoryConnectionProviderType;
  repositoryIdentifier: string;
  credentialConfigured: boolean;
  defaultBranch: string;
  allowedBranches: string[];
  includePaths: string[];
  excludePaths: string[];
  maximumFileBytes: number;
  maximumTotalBytes: number;
  maximumFileCount: number;
  timeoutMs: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeProviderUseConfiguration extends RuntimeProviderDto {
  apiKey: string | null;
}

export interface RepositoryUseConfiguration extends RepositoryConnectionDto {
  credential: string | null;
}
