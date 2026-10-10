import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query, Optional } from "@nestjs/common";
import { ProjectAccessService } from "./auth/project-access.service";
import { AuthService } from "./auth/auth.service";
import { RequireRoles } from "./auth/roles.decorator";
import { response } from "./common/api-response";
import type {
  ActivityEventDto,
  ApprovalSummaryDto,
  ApiResponseDto,
  AuditEventDto,
  BlockerSummaryDto,
  DbReadinessDto,
  HealthDto,
  InitiativeBlockersResponseDto,
  InitiativeDetailDto,
  InitiativeSummaryDto,
  InitiativeTasksResponseDto,
  ListQuery,
  ModuleDetailDto,
  ModuleSummaryDto,
  ProjectDashboardDto,
  ProjectSummaryDto,
  ReleaseCandidateDetailDto,
  ReleaseCandidateSummaryDto,
  SecurityGateDetailDto,
  TaskDto
} from "./dto";
import { ProductService } from "./product.service";
import { ProductWriteService } from "./product-write.service";
import type {
  ApprovalDecisionRequestDto,
  AuthenticatedAuditActor,
  CreateApprovalRequestDto,
  CreateBlockerRequestDto,
  InitiativeHandoffDraftDto,
  InitiativeHandoffRequestDto,
  SelectExecutionPathRequestDto,
  StartInitiativeRequestDto,
  UpdateTaskStatusRequestDto,
  WriteActionResponseDto,
  WriteActionResult
} from "./write-dto";

@Controller()
export class ProductController {
  constructor(
    @Inject(ProductService) private readonly productService: ProductService,
    @Inject(ProductWriteService) private readonly productWriteService: ProductWriteService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Optional() @Inject(ProjectAccessService) private readonly projectAccess?: ProjectAccessService
  ) {}

  @Get("health")
  health(): ApiResponseDto<HealthDto> {
    return response(this.productService.health());
  }

  @Get("health/db-readiness")
  async dbReadiness(): Promise<ApiResponseDto<DbReadinessDto>> {
    return response(await this.productService.dbReadiness());
  }

  @Get("projects")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async listProjects(@Headers("cookie") cookie?: string): Promise<ApiResponseDto<ProjectSummaryDto[]>> {
    const ids = this.projectAccess ? await this.projectAccess.visibleIds(await this.authService.validateDurableSession(cookie)) : undefined;
    const data = await this.productService.listProjects(ids);
    return response(data, { total: data.length });
  }

  @Post("projects/personal")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async createPersonalProject(@Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    if (!this.projectAccess) throw new Error("PROJECT_ACCESS_UNAVAILABLE");
    return response(await this.projectAccess.createPersonal(await this.authService.validateDurableSession(cookie), body));
  }

  @Get("projects/:id/dashboard")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async getProjectDashboard(@Param("id") id: string, @Headers("cookie") cookie?: string): Promise<ApiResponseDto<ProjectDashboardDto>> {
    if (this.projectAccess) await this.projectAccess.assert(await this.authService.validateDurableSession(cookie), id);
    return response(await this.productService.getDashboard(id));
  }

  @Get("modules")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  listModules(): ApiResponseDto<ModuleSummaryDto[]> {
    const data = this.productService.listModules();
    return response(data, { total: data.length });
  }

  @Get("modules/:slug")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  getModule(@Param("slug") slug: string): ApiResponseDto<ModuleDetailDto> {
    return response(this.productService.getModule(slug));
  }

  @Get("initiatives")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  listInitiatives(@Query() query: ListQuery): ApiResponseDto<InitiativeSummaryDto[]> {
    const data = this.productService.listInitiatives(query);
    return response(data, this.paginationMeta(query, data.length));
  }

  @Get("initiatives/:slug")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  getInitiative(@Param("slug") slug: string): ApiResponseDto<InitiativeDetailDto> {
    return response(this.productService.getInitiative(slug));
  }

  @Post("initiatives/:slug/start")
  @RequireRoles("Admin", "PM")
  startInitiative(
    @Param("slug") slug: string,
    @Body() body: StartInitiativeRequestDto,
    @Headers("cookie") cookieHeader?: string
  ): WriteActionResponseDto<InitiativeSummaryDto> {
    return this.writeResponse(this.productWriteService.startInitiative(slug, body, this.authenticatedActor(cookieHeader)));
  }

  @Post("initiatives/:initiativeId/handoff")
  @RequireRoles("Admin", "PM")
  requestInitiativeHandoff(
    @Param("initiativeId") initiativeId: string,
    @Body() body: InitiativeHandoffRequestDto,
    @Headers("cookie") cookieHeader?: string
  ): WriteActionResponseDto<InitiativeHandoffDraftDto> {
    return this.writeResponse(this.productWriteService.requestInitiativeHandoff(initiativeId, body, this.authenticatedActor(cookieHeader)));
  }

  @Post("initiatives/:slug/execution-paths/:pathId/select")
  @RequireRoles("Admin", "PM")
  selectExecutionPath(
    @Param("slug") slug: string,
    @Param("pathId") pathId: string,
    @Body() body: SelectExecutionPathRequestDto,
    @Headers("cookie") cookieHeader?: string
  ): WriteActionResponseDto<InitiativeSummaryDto> {
    return this.writeResponse(this.productWriteService.selectExecutionPath(slug, pathId, body, this.authenticatedActor(cookieHeader)));
  }

  @Get("initiatives/:slug/tasks")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  getInitiativeTasks(@Param("slug") slug: string): ApiResponseDto<InitiativeTasksResponseDto> {
    return response(this.productService.getInitiativeTasks(slug));
  }

  @Patch("tasks/:id/status")
  @RequireRoles("Admin", "PM")
  updateTaskStatus(
    @Param("id") id: string,
    @Body() body: UpdateTaskStatusRequestDto,
    @Headers("cookie") cookieHeader?: string
  ): WriteActionResponseDto<TaskDto> {
    return this.writeResponse(this.productWriteService.updateTaskStatus(id, body, this.authenticatedActor(cookieHeader)));
  }

  @Get("initiatives/:slug/activity")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  getInitiativeActivity(@Param("slug") slug: string): ApiResponseDto<ActivityEventDto[]> {
    const data = this.productService.getInitiativeActivity(slug);
    return response(data, { total: data.length });
  }

  @Get("initiatives/:slug/blockers")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  getInitiativeBlockers(@Param("slug") slug: string): ApiResponseDto<InitiativeBlockersResponseDto> {
    return response(this.productService.getInitiativeBlockers(slug));
  }

  @Get("approvals")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async listApprovals(@Query() query: ListQuery): Promise<ApiResponseDto<ApprovalSummaryDto[]>> {
    const data = await this.productService.listApprovals(query);
    return response(data, this.paginationMeta(query, data.length));
  }

  @Post("approvals")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer")
  createApproval(
    @Body() body: CreateApprovalRequestDto,
    @Headers("cookie") cookieHeader?: string
  ): WriteActionResponseDto<ApprovalSummaryDto> {
    return this.writeResponse(this.productWriteService.createApproval(body, this.authenticatedActor(cookieHeader)));
  }

  @Post("approvals/:id/decision")
  @RequireRoles("Admin", "PM")
  decideApproval(
    @Param("id") id: string,
    @Body() body: ApprovalDecisionRequestDto,
    @Headers("cookie") cookieHeader?: string
  ): WriteActionResponseDto<ApprovalSummaryDto> {
    return this.writeResponse(this.productWriteService.decideApproval(id, body, this.authenticatedActor(cookieHeader)));
  }

  @Get("security-gates/:id")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  getSecurityGate(@Param("id") id: string): ApiResponseDto<SecurityGateDetailDto> {
    return response(this.productService.getSecurityGate(id));
  }

  @Get("release-candidates")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  listReleaseCandidates(@Query() query: ListQuery): ApiResponseDto<ReleaseCandidateSummaryDto[]> {
    const data = this.productService.listReleaseCandidates(query);
    return response(data, this.paginationMeta(query, data.length));
  }

  @Get("release-candidates/:id")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  getReleaseCandidate(@Param("id") id: string): ApiResponseDto<ReleaseCandidateDetailDto> {
    return response(this.productService.getReleaseCandidate(id));
  }

  @Get("blockers")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  listBlockers(@Query() query: ListQuery): ApiResponseDto<BlockerSummaryDto[]> {
    const data = this.productService.listBlockers(query);
    return response(data, this.paginationMeta(query, data.length));
  }

  @Post("blockers")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer")
  createBlocker(
    @Body() body: CreateBlockerRequestDto,
    @Headers("cookie") cookieHeader?: string
  ): WriteActionResponseDto<BlockerSummaryDto> {
    return this.writeResponse(this.productWriteService.createBlocker(body, this.authenticatedActor(cookieHeader)));
  }

  @Get("audit-events")
  @RequireRoles("Admin", "PM")
  async listAuditEvents(@Query() query: ListQuery): Promise<ApiResponseDto<AuditEventDto[]>> {
    const data = await this.productService.listAuditEvents(query);
    return response(data, this.paginationMeta(query, data.length));
  }

  private paginationMeta(query: ListQuery, total: number): { page?: number; pageSize?: number; total: number } {
    return {
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      total
    };
  }

  private writeResponse<T>(result: WriteActionResult<T>): WriteActionResponseDto<T> {
    return {
      data: result.data,
      auditEvent: result.auditEvent,
      meta: {
        timestamp: new Date().toISOString()
      },
      errors: []
    };
  }

  private authenticatedActor(cookieHeader?: string): AuthenticatedAuditActor {
    const user = this.authService.session(cookieHeader).user;

    return {
      displayName: user.displayName,
      role: user.role
    };
  }
}
