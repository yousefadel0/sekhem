export type RepositorySourceReadiness = "ready" | "pending" | "unavailable";
export type RepositorySourceProviderName = "github" | "gitlab" | "local";

export interface RepositorySourceIdentityDto {
  namespace: string;
  name: string;
  fullName: string;
  webUrl: string;
  defaultBranch: string;
}

export interface RepositorySourceBranchSummaryDto {
  name: string;
  isDefault: boolean;
  protectionEnabled: boolean;
  latestCommitSha: string | null;
}

export interface RepositorySourceCommitSummaryDto {
  sha: string;
  title: string;
  committedAt: string | null;
}

export interface RepositorySourceCapabilitiesDto {
  readStatus: true;
  listBranches: true;
  readLatestCommit: true;
  createBranch: false;
  createCommit: false;
  createPullRequest: false;
  createIssue: false;
  triggerWorkflow: false;
}

export interface RepositorySourceStatusDto {
  providerType: "hosted_git" | "local_git";
  providerName: RepositorySourceProviderName;
  repository: RepositorySourceIdentityDto | null;
  branches: RepositorySourceBranchSummaryDto[];
  latestCommit: RepositorySourceCommitSummaryDto | null;
  readiness: RepositorySourceReadiness;
  capabilities: RepositorySourceCapabilitiesDto;
  lastCheckedAt: string;
  message: string;
  errorCode: "REPOSITORY_SOURCE_UNAVAILABLE" | null;
}
