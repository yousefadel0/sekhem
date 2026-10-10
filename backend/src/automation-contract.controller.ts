import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { AutomationContractService } from "./automation-contract.service";
import { AuthService } from "./auth/auth.service";
import { MachineCallbackGuard } from "./auth/machine-callback.guard";
import { RequireRoles } from "./auth/roles.decorator";
import type {
  AiMemoPlaceholderDto,
  AiMemoRequestDto,
  ContractActionResponseDto,
  ContractReadResponseDto,
  SystemEventDto,
  SystemEventRequestDto,
  WorkflowCallbackResponseDto,
  WorkflowEventRequestDto,
  WorkflowRunDto
} from "./automation-dto";

@Controller()
export class AutomationContractController {
  constructor(
    @Inject(AutomationContractService) private readonly automationContractService: AutomationContractService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  @Post("workflows/events")
  @RequireRoles("Admin", "PM")
  async recordWorkflowEvent(
    @Body() body: WorkflowEventRequestDto,
    @Headers("cookie") cookieHeader?: string
  ): Promise<ContractActionResponseDto<WorkflowRunDto>> {
    const actor = this.authenticatedActor(cookieHeader);
    return this.actionResponse(await this.automationContractService.recordWorkflowEvent({
      ...body,
      requestedBy: actor.displayName,
      requestedRole: actor.role
    }));
  }

  @Post("workflows/callbacks")
  @HttpCode(202)
  @UseGuards(MachineCallbackGuard)
  async recordWorkflowCallback(@Body() body: unknown): Promise<WorkflowCallbackResponseDto> {
    return this.automationContractService.recordWorkflowCallback(body);
  }

  @Get("workflows/runs")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async listWorkflowRuns(): Promise<ContractReadResponseDto<WorkflowRunDto[]>> {
    const data = await this.automationContractService.listWorkflowRuns();
    return {
      data,
      meta: {
        timestamp: new Date().toISOString(),
        total: data.length
      },
      errors: []
    };
  }

  @Get("workflows/runs/:id")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async getWorkflowRun(@Param("id") id: string): Promise<ContractReadResponseDto<WorkflowRunDto>> {
    return {
      data: await this.automationContractService.getWorkflowRun(id),
      meta: {
        timestamp: new Date().toISOString()
      },
      errors: []
    };
  }

  @Post("ai/memos/request")
  @RequireRoles("Admin", "PM")
  requestAiMemo(@Body() body: AiMemoRequestDto, @Headers("cookie") cookieHeader?: string): ContractActionResponseDto<AiMemoPlaceholderDto> {
    const actor = this.authenticatedActor(cookieHeader);
    return this.actionResponse(this.automationContractService.requestAiMemo({
      ...body,
      requestedBy: actor.displayName,
      requestedRole: actor.role
    }));
  }

  @Get("ai/memos/:id")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  getAiMemo(@Param("id") id: string): ContractReadResponseDto<AiMemoPlaceholderDto> {
    return {
      data: this.automationContractService.getAiMemo(id),
      meta: {
        timestamp: new Date().toISOString()
      },
      errors: []
    };
  }

  @Post("system/events")
  @RequireRoles("Admin", "PM")
  recordSystemEvent(@Body() body: SystemEventRequestDto, @Headers("cookie") cookieHeader?: string): ContractActionResponseDto<SystemEventDto> {
    const actor = this.authenticatedActor(cookieHeader);
    return this.actionResponse(this.automationContractService.recordSystemEvent({
      ...body,
      actor: `${actor.displayName} [${actor.role}]`
    }));
  }

  private authenticatedActor(cookieHeader?: string): { displayName: string; role: string } {
    const user = this.authService.session(cookieHeader).user;
    return { displayName: user.displayName, role: user.role };
  }

  private actionResponse<T>(result: { data: T; auditEvent: ContractActionResponseDto<T>["auditEvent"]; activityEvent: ContractActionResponseDto<T>["activityEvent"] }): ContractActionResponseDto<T> {
    return {
      data: result.data,
      auditEvent: result.auditEvent,
      activityEvent: result.activityEvent,
      meta: {
        timestamp: new Date().toISOString()
      },
      errors: []
    };
  }
}
