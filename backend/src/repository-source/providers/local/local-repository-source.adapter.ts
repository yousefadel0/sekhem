import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RepositorySourceAdapter } from "../../repository-source.adapter";
import { READ_ONLY_REPOSITORY_SOURCE_CAPABILITIES } from "../../repository-source.capabilities";
import type { RepositorySourceBranchSummaryDto, RepositorySourceStatusDto } from "../../repository-source.dto";
import { validatedLocalRepositoryPath } from "../../repository-path.policy";

const execFileAsync = promisify(execFile);

type GitRunner = (args: string[]) => Promise<string>;

export class LocalRepositorySourceAdapter implements RepositorySourceAdapter {
  constructor(
    private readonly runGit: GitRunner = (args) => this.runGitCommand(args),
    private readonly repositoryPath = process.env.SEKHEM_LOCAL_REPOSITORY_SOURCE_PATH ?? process.cwd()
  ) {}

  async readStatus(): Promise<RepositorySourceStatusDto> {
    const lastCheckedAt = new Date().toISOString();

    try {
      const [defaultBranch, latestCommitSha, latestCommitTitle, latestCommitDate, branchLines] = await Promise.all([
        this.runGit(["branch", "--show-current"]),
        this.runGit(["rev-parse", "HEAD"]),
        this.runGit(["log", "-1", "--pretty=%s"]),
        this.runGit(["log", "-1", "--format=%cI"]),
        this.runGit(["branch", "--format=%(refname:short)|%(objectname)"])
      ]);
      const branch = this.requiredString(defaultBranch);

      return {
        providerType: "local_git",
        providerName: "local",
        repository: {
          namespace: "local",
          name: "repository",
          fullName: "local/repository",
          webUrl: "local://repository",
          defaultBranch: branch
        },
        branches: this.branchSummaries(branchLines, branch),
        latestCommit: {
          sha: this.requiredString(latestCommitSha),
          title: this.firstLine(this.requiredString(latestCommitTitle)),
          committedAt: this.optionalString(latestCommitDate)
        },
        readiness: "ready",
        capabilities: READ_ONLY_REPOSITORY_SOURCE_CAPABILITIES,
        lastCheckedAt,
        message: "Local repository readiness is available in read-only mode.",
        errorCode: null
      };
    } catch {
      return {
        providerType: "local_git",
        providerName: "local",
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

  private async runGitCommand(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", args, {
      cwd: validatedLocalRepositoryPath(this.repositoryPath),
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 64 * 1024
    });

    return stdout.trim();
  }

  private branchSummaries(value: string, defaultBranch: string): RepositorySourceBranchSummaryDto[] {
    return value
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(0, 5)
      .map((line) => {
        const [name, latestCommitSha] = line.split("|");
        const branchName = this.requiredString(name);

        return {
          name: branchName,
          isDefault: branchName === defaultBranch,
          protectionEnabled: false,
          latestCommitSha: this.optionalString(latestCommitSha)
        };
      });
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
