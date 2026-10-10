import type { RepositorySourceAdapter } from "../../repository-source.adapter";
import type {
  RepositorySourceBranchSummaryDto,
  RepositorySourceStatusDto
} from "../../repository-source.dto";
import { READ_ONLY_REPOSITORY_SOURCE_CAPABILITIES } from "../../repository-source.capabilities";

type Fetcher = typeof fetch;

type HostedRepositoryResponse = {
  name?: unknown;
  full_name?: unknown;
  html_url?: unknown;
  default_branch?: unknown;
  owner?: {
    login?: unknown;
  };
};

type HostedBranchResponse = {
  name?: unknown;
  protected?: unknown;
  commit?: {
    sha?: unknown;
  };
};

type HostedCommitResponse = {
  sha?: unknown;
  commit?: {
    message?: unknown;
    committer?: {
      date?: unknown;
    };
  };
};

export class GithubRepositorySourceAdapter implements RepositorySourceAdapter {
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly repositoryFullName = process.env.SEKHEM_REPOSITORY_SOURCE_REPOSITORY ?? "sonic-net/sonic-buildimage"
  ) {}

  async readStatus(): Promise<RepositorySourceStatusDto> {
    const lastCheckedAt = new Date().toISOString();

    try {
      const repositoryPath = this.repositoryPath();
      const repository = await this.readJson<HostedRepositoryResponse>(`https://api.github.com/repos/${repositoryPath}`);
      const defaultBranch = this.requiredString(repository.default_branch);
      const branches = await this.readJson<HostedBranchResponse[]>(
        `https://api.github.com/repos/${repositoryPath}/branches?per_page=5`
      );
      const latestCommit = await this.readJson<HostedCommitResponse>(
        `https://api.github.com/repos/${repositoryPath}/commits/${encodeURIComponent(defaultBranch)}`
      );
      const namespace = this.requiredString(repository.owner?.login);
      const name = this.requiredString(repository.name);
      const fullName = this.requiredString(repository.full_name);
      const webUrl = this.requiredString(repository.html_url);

      return {
        providerType: "hosted_git",
        providerName: "github",
        repository: {
          namespace,
          name,
          fullName,
          webUrl,
          defaultBranch
        },
        branches: branches.map((branch) => this.branchSummary(branch, defaultBranch)),
        latestCommit: {
          sha: this.requiredString(latestCommit.sha),
          title: this.firstLine(this.requiredString(latestCommit.commit?.message)),
          committedAt: this.optionalString(latestCommit.commit?.committer?.date)
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
        providerName: "github",
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
        accept: "application/vnd.github+json",
        "user-agent": "sekhem-repository-readiness"
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!result.ok) {
      throw new Error("Repository source read failed");
    }

    return (await result.json()) as T;
  }

  private repositoryPath(): string {
    if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(this.repositoryFullName)) {
      throw new Error("Repository source configuration is invalid");
    }

    return this.repositoryFullName
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
  }

  private branchSummary(branch: HostedBranchResponse, defaultBranch: string): RepositorySourceBranchSummaryDto {
    const name = this.requiredString(branch.name);

    return {
      name,
      isDefault: name === defaultBranch,
      protectionEnabled: branch.protected === true,
      latestCommitSha: this.optionalString(branch.commit?.sha)
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
