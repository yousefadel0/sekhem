import { BadRequestException, Injectable } from "@nestjs/common";
import type { RepositorySourceAdapter } from "./repository-source.adapter";
import type { RepositorySourceProviderName } from "./repository-source.dto";
import { GithubRepositorySourceAdapter } from "./providers/github/github-repository-source.adapter";
import { GitlabRepositorySourceAdapter } from "./providers/gitlab/gitlab-repository-source.adapter";
import { LocalRepositorySourceAdapter } from "./providers/local/local-repository-source.adapter";

export type RepositorySourceProviderSelection = string | undefined;

@Injectable()
export class RepositorySourceProviderRegistry {
  private readonly adapters = new Map<RepositorySourceProviderName, RepositorySourceAdapter>([
    ["github", new GithubRepositorySourceAdapter()],
    ["gitlab", new GitlabRepositorySourceAdapter()],
    ["local", new LocalRepositorySourceAdapter()]
  ]);

  resolve(provider: RepositorySourceProviderSelection = this.defaultProvider()): RepositorySourceAdapter {
    const safeProvider = this.normalizeProvider(provider);
    const adapter = this.adapters.get(safeProvider);

    if (!adapter) {
      throw new BadRequestException("Repository source provider is unavailable for read-only status.");
    }

    return adapter;
  }

  private normalizeProvider(provider: RepositorySourceProviderSelection): RepositorySourceProviderName {
    if (provider === undefined || provider === "") {
      return this.defaultProvider();
    }

    if (provider === "github" || provider === "gitlab" || provider === "local") {
      return provider;
    }

    throw new BadRequestException("Repository source provider is unavailable for read-only status.");
  }

  private defaultProvider(): RepositorySourceProviderName {
    const configuredProvider = process.env.SEKHEM_REPOSITORY_SOURCE_PROVIDER;

    if (configuredProvider === "gitlab" || configuredProvider === "local") {
      return configuredProvider;
    }

    return "github";
  }
}
