/**
 * Future workspace sources. 5C implements LOCAL_WORKSPACE only.
 * GitLab/GitHub providers must be added as real adapters later — never faked.
 */
export type WorkspaceSourceKind =
  | "LOCAL_WORKSPACE"
  | "GITLAB_REPOSITORY"
  | "GITHUB_REPOSITORY"
  | "OTHER_SUPPORTED_SOURCE";

export const IMPLEMENTED_WORKSPACE_SOURCES: readonly WorkspaceSourceKind[] = ["LOCAL_WORKSPACE"];

export const RESERVED_GITLAB_READ_CAPABILITIES = [
  "gitlab.list_projects",
  "gitlab.list_repositories",
  "gitlab.list_tree",
  "gitlab.read_file",
  "gitlab.search"
] as const;

export const RESERVED_GITLAB_MUTATION_CAPABILITIES = [
  "gitlab.create_branch",
  "gitlab.write_file",
  "gitlab.commit",
  "gitlab.push",
  "gitlab.create_merge_request"
] as const;

export interface WorkspaceSourceProvider {
  readonly kind: WorkspaceSourceKind;
}

export class LocalWorkspaceSourceProvider implements WorkspaceSourceProvider {
  readonly kind = "LOCAL_WORKSPACE" as const;
}
