import type { RepositorySourceAdapter } from "../../repository-source.adapter";
import { READ_ONLY_REPOSITORY_SOURCE_CAPABILITIES } from "../../repository-source.capabilities";
import type { RepositorySourceBranchSummaryDto, RepositorySourceStatusDto } from "../../repository-source.dto";
import { validatedGitlabBaseUrl } from "../../gitlab-url.policy";

type Fetcher = typeof fetch;

type GitlabProjectResponse = {
  path?: unknown;
  path_with_namespace?: unknown;
  web_url?: unknown;
  default_branch?: unknown;
  namespace?: {
    full_path?: unknown;
  };
};

type GitlabBranchResponse = {
  name?: unknown;
  protected?: unknown;
  commit?: {
    id?: unknown;
  };
};

type GitlabCommitResponse = {
  id?: unknown;
  title?: unknown;
  committed_date?: unknown;
};

export class GitlabRepositorySourceAdapter implements RepositorySourceAdapter {
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly projectPath = process.env.SEKHEM_GITLAB_REPOSITORY_SOURCE_PROJECT ?? "gitlab-org/gitlab",
    private readonly baseUrl = process.env.SEKHEM_GITLAB_BASE_URL ?? "https://gitlab.com",
    private readonly env: Partial<Pick<NodeJS.ProcessEnv, "SEKHEM_GITLAB_BASE_URL" | "SEKHEM_GITLAB_ALLOWED_BASE_URLS">> = process.env
  ) {}

  async readStatus(): Promise<RepositorySourceStatusDto> {
    const lastCheckedAt = new Date().toISOString();

    try {
      const projectPath = this.projectPathSegment();
      const apiBase = `${validatedGitlabBaseUrl(this.baseUrl, this.env)}/api/v4`;
      const project = await this.readJson<GitlabProjectResponse>(`${apiBase}/projects/${projectPath}`);
      const defaultBranch = this.requiredString(project.default_branch);
      const branches = await this.readJson<GitlabBranchResponse[]>(
        `${apiBase}/projects/${projectPath}/repository/branches?per_page=5`
      );
      const latestCommit = await this.readJson<GitlabCommitResponse>(
        `${apiBase}/projects/${projectPath}/repository/commits/${encodeURIComponent(defaultBranch)}`
      );

      return {
        providerType: "hosted_git",
        providerName: "gitlab",
        repository: {
          namespace: this.requiredString(project.namespace?.full_path),
          name: this.requiredString(project.path),
          fullName: this.requiredString(project.path_with_namespace),
          webUrl: this.requiredString(project.web_url),
          defaultBranch
        },
        branches: branches.map((branch) => this.branchSummary(branch, defaultBranch)),
        latestCommit: {
          sha: this.requiredString(latestCommit.id),
          title: this.firstLine(this.requiredString(latestCommit.title)),
          committedAt: this.optionalString(latestCommit.committed_date)
        },
        readiness: "ready",
        capabilities: READ_ONLY_REPOSITORY_SOURCE_CAPABILITIES,
        lastCheckedAt,
        message: "Repository readiness is available in read-only mode.",
        errorCode: null
      };
    } catch {
      return {
        providerType: "hosted_git",
        providerName: "gitlab",
        repository: null,
        branches: [],
        latestCommit: null,
        readiness: "unavailable",
        capabilities: READ_ONLY_REPOSITORY_SOURCE_CAPABILITIES,
        lastCheckedAt,
        message: "Repository readiness is temporarily unavailable. This view remains read-only.",
        errorCode: "REPOSITORY_SOURCE_UNAVAILABLE"
      };
    }
  }

  private async readJson<T>(url: string): Promise<T> {
    const result = await this.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "sekhem-repository-readiness"
      },
      redirect: "error",
      signal: AbortSignal.timeout(5000)
    });

    if (!result.ok) {
      throw new Error("Repository source read failed");
    }

    return (await result.json()) as T;
  }

  private projectPathSegment(): string {
    if (!/^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)+$/i.test(this.projectPath)) {
      throw new Error("Repository source configuration is invalid");
    }

    return encodeURIComponent(this.projectPath);
  }

  private branchSummary(branch: GitlabBranchResponse, defaultBranch: string): RepositorySourceBranchSummaryDto {
    const name = this.requiredString(branch.name);

    return {
      name,
      isDefault: name === defaultBranch,
      protectionEnabled: branch.protected === true,
      latestCommitSha: this.optionalString(branch.commit?.id)
    };
  }

  private requiredString(value: unknown): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("Repository source response is incomplete");
    }

    return value.trim();
  }

  private optionalString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  }

  private firstLine(value: string): string {
    return value.split(/\r?\n/, 1)[0] ?? value;
  }
}
