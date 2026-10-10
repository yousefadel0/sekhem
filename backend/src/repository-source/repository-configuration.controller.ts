import { Body, Controller, Get, Headers, Inject, Param, Patch, Post } from "@nestjs/common";
import type { RepositoryConnectionDto } from "../ai-gateway/runtime-configuration.dto";
import { AuthService } from "../auth/auth.service";
import { RequireRoles } from "../auth/roles.decorator";
import { response } from "../common/api-response";
import type { ApiResponseDto } from "../dto";
import type { RepositoryBranchDto } from "./repository-content.dto";
import { RepositorySourceService } from "./repository-source.service";

@Controller("repository-source")
export class RepositoryConfigurationController {
  constructor(
    @Inject(RepositorySourceService) private readonly repositorySourceService: RepositorySourceService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  @Get("connections")
  @RequireRoles("Admin", "PM")
  async connections(): Promise<ApiResponseDto<RepositoryConnectionDto[]>> {
    const data = await this.repositorySourceService.connections();
    return response(data, { total: data.length });
  }

  @Post("connections")
  @RequireRoles("Admin")
  async createConnection(@Body() body: unknown, @Headers("cookie") cookieHeader?: string): Promise<ApiResponseDto<RepositoryConnectionDto>> {
    return response(await this.repositorySourceService.createConnection(this.bodyWithActor(body, cookieHeader)));
  }

  @Patch("connections/:id")
  @RequireRoles("Admin")
  async updateConnection(@Param("id") id: string, @Body() body: unknown, @Headers("cookie") cookieHeader?: string): Promise<ApiResponseDto<RepositoryConnectionDto>> {
    return response(await this.repositorySourceService.updateConnection(id, this.bodyWithActor(body, cookieHeader)));
  }

  @Post("connections/:id/test")
  @RequireRoles("Admin")
  async testConnection(@Param("id") id: string): Promise<ApiResponseDto<{ connected: true; branches: RepositoryBranchDto[] }>> {
    return response(await this.repositorySourceService.testConnection(id));
  }

  @Get("connections/:id/branches")
  @RequireRoles("Admin", "PM")
  async branches(@Param("id") id: string): Promise<ApiResponseDto<RepositoryBranchDto[]>> {
    const data = await this.repositorySourceService.branches(id);
    return response(data, { total: data.length });
  }

  private bodyWithActor(body: unknown, cookieHeader?: string): unknown {
    if (typeof body !== "object" || body === null || Array.isArray(body)) return body;
    const user = this.authService.session(cookieHeader).user;
    return { ...body, changedBy: `${user.displayName} [${user.role}]` };
  }
}
