import type { RepositorySourceStatusDto } from "./repository-source.dto";
import { BadRequestException, Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { RuntimeConfigurationService } from "../ai-gateway/runtime-configuration.service";
import type { RepositoryConnectionDto } from "../ai-gateway/runtime-configuration.dto";
import type { RepositoryBranchDto } from "./repository-content.dto";
import { RepositoryContentService } from "./repository-content.service";
import { RepositorySourceProviderRegistry, type RepositorySourceProviderSelection } from "./repository-source.provider-registry";

@Injectable()
export class RepositorySourceService {
  constructor(
    @Inject(RepositorySourceProviderRegistry) private readonly providerRegistry: RepositorySourceProviderRegistry,
    @Optional() @Inject(RuntimeConfigurationService) private readonly configurations?: RuntimeConfigurationService,
    @Optional() @Inject(RepositoryContentService) private readonly content?: RepositoryContentService
  ) {}

  readStatus(provider?: RepositorySourceProviderSelection): Promise<RepositorySourceStatusDto> {
    return this.providerRegistry.resolve(provider).readStatus();
  }

  connections(): Promise<RepositoryConnectionDto[]> {
    return this.config().repositories();
  }

  createConnection(body: unknown): Promise<RepositoryConnectionDto> {
    return this.config().createRepository(body);
  }

  updateConnection(id: string, body: unknown): Promise<RepositoryConnectionDto> {
    return this.config().updateRepository(id, body);
  }

  async testConnection(id: string): Promise<{ connected: true; branches: RepositoryBranchDto[] }> {
    const connection = await this.config().repositoryForUse(id, false);
    const branches = await this.reader().branches(connection);
    if (branches.length === 0) throw new BadRequestException("Repository connection has no configured allowed branch available");
    return { connected: true, branches };
  }

  async branches(id: string): Promise<RepositoryBranchDto[]> {
    return this.reader().branches(await this.config().repositoryForUse(id));
  }

  private config(): RuntimeConfigurationService {
    if (!this.configurations) throw new ServiceUnavailableException("Repository configuration is unavailable");
    return this.configurations;
  }

  private reader(): RepositoryContentService {
    if (!this.content) throw new ServiceUnavailableException("Repository content reader is unavailable");
    return this.content;
  }
}
