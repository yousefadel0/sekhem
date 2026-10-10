import { Controller, Get, Inject, Query } from "@nestjs/common";
import { response } from "../common/api-response";
import type { ApiResponseDto } from "../dto";
import type { RepositorySourceStatusDto } from "./repository-source.dto";
import { RepositorySourceService } from "./repository-source.service";

@Controller("repository-source")
export class RepositorySourceController {
  constructor(@Inject(RepositorySourceService) private readonly repositorySourceService: RepositorySourceService) {}

  @Get("status")
  async readStatus(@Query("provider") provider?: string): Promise<ApiResponseDto<RepositorySourceStatusDto>> {
    return response(await this.repositorySourceService.readStatus(provider));
  }
}
