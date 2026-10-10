import { Body, Controller, Get, Headers, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { response } from "../common/api-response";
import { AuthService } from "../auth/auth.service";
import { AuthzGuard } from "../auth/authz.guard";
import { AgentRuntimeService } from "./agent-runtime.service";
import type { StartAgentRunDto, PauseRunDto, SteerRunDto } from "./agent-run.dto";
import { AgentInspectionService } from "./inspection/agent-inspection.service";

/**
 * AgentRuntimeController
 *
 * Exposes durable asynchronous agent execution endpoints:
 * - POST /api/agent-runs: Persists AgentRun and returns immediately with QUEUED status.
 * - GET /api/agent-runs: Returns organization/project-scoped run summaries.
 * - GET /api/agent-runs/:id: Returns full run detail, active plan, and pending approvals.
 */
@Controller("agent-runs")
@UseGuards(AuthzGuard)
export class AgentRuntimeController {
  constructor(
    @Inject(AgentRuntimeService) private readonly agentRuntime: AgentRuntimeService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AgentInspectionService) private readonly inspections: AgentInspectionService
  ) {}

  /**
   * GET /api/agent-runs
   * Lists runs visible to the authenticated subject. Scope is enforced in the service.
   */
  @Get()
  async listAgentRuns(@Headers("cookie") cookieHeader: string | undefined) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    const data = await this.agentRuntime.listRuns(claims);
    return response(data, { total: data.length });
  }

  @Post(":id/inspection/decision")
  async inspectionDecision(@Param("id") id: string, @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    return response(await this.inspections.approve(id, await this.authService.validateDurableSession(cookie), body));
  }

  /**
   * POST /api/agent-runs
   * Enforces server-side actor derivation, tenant isolation, and project role check.
   * Schedules background execution and returns immediately.
   */
  @Post()
  async createAgentRun(
    @Headers("cookie") cookieHeader: string | undefined,
    @Body() body: StartAgentRunDto
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.agentRuntime.createRun(claims, body));
  }

  /**
   * GET /api/agent-runs/:id
   * Reads run detail with plan steps and pending approvals.
   * Enforces project membership read authorization.
   */
  @Get(":id")
  async getAgentRun(
    @Param("id") id: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.agentRuntime.getRun(id, claims));
  }

  // ---------------------------------------------------------------------------
  // Control endpoints
  // ---------------------------------------------------------------------------

  @Post(':id/pause')
  async pauseRun(@Param('id') id: string, @Headers('cookie') cookieHeader: string, @Body() body: PauseRunDto) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.agentRuntime.pauseRun(id, claims, body));
  }

  @Post(':id/resume')
  async resumeRun(@Param('id') id: string, @Headers('cookie') cookieHeader: string, @Body() body: PauseRunDto) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.agentRuntime.resumeRun(id, claims, body));
  }

  @Post(':id/steer')
  async steerRun(@Param('id') id: string, @Headers('cookie') cookieHeader: string, @Body() body: SteerRunDto) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.agentRuntime.steerRun(id, claims, body));
  }

  @Post(':id/tool-approvals/:approvalId/decision')
  async decideToolApproval(@Param('id') id: string, @Param('approvalId') approvalId: string,
    @Headers('cookie') cookieHeader: string, @Body() body: unknown) {
    await this.authService.validateDurableSession(cookieHeader);
    return response(await this.agentRuntime.approveAction(id, approvalId, cookieHeader, body));
  }

  @Post(':id/decision')
  async decideAction(@Param('id') id: string, @Headers('cookie') cookieHeader: string, @Body() body: unknown) {
    await this.authService.validateDurableSession(cookieHeader);
    return response(await this.agentRuntime.decideAction(id, cookieHeader, body));
  }

  @Post(':id/cancel')
  async cancelRun(@Param('id') id: string, @Headers('cookie') cookieHeader: string, @Body() body: import('./agent-run.dto').CancelRunDto) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.agentRuntime.cancelRun(id, claims, body));
  }

}
