import type { RepositorySourceCapabilitiesDto } from "./repository-source.dto";

export const READ_ONLY_REPOSITORY_SOURCE_CAPABILITIES: RepositorySourceCapabilitiesDto = {
  readStatus: true,
  listBranches: true,
  readLatestCommit: true,
  createBranch: false,
  createCommit: false,
  createPullRequest: false,
  createIssue: false,
  triggerWorkflow: false
};
