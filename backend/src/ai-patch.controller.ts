import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common";
import { AuthService } from "./auth/auth.service";
import { RequireRoles } from "./auth/roles.decorator";
import type { ApiResponseDto } from "./dto";
import type {
  AiPatchApprovalGateRequestDto,
  AiPatchAuditResponseDto,
  AiPatchArtifactDto,
  AiPatchArtifactRequestDto,
  AiPatchDraftDto,
  AiPatchDraftRequestDto,
  AiPatchDraftStatusRequestDto
} from "./ai-patch-dto";
import { AiPatchService } from "./ai-patch.service";
import { response } from "./common/api-response";

@Controller("ai-patch")
export class AiPatchController {
  constructor(
    @Inject(AiPatchService) private readonly aiPatchService: AiPatchService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  @Post("drafts")
  @RequireRoles("Admin", "PM", "Technical Reviewer")
  createDraft(@Body() body: AiPatchDraftRequestDto, @Headers("cookie") cookieHeader?: string): ApiResponseDto<AiPatchDraftDto> {
    return response(this.aiPatchService.createDraft({ ...body, requestedBy: this.authenticatedActor(cookieHeader) }));
  }

  @Get("drafts/:draftId")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  getDraft(@Param("draftId") draftId: string): ApiResponseDto<AiPatchDraftDto> {
    return response(this.aiPatchService.getDraft(draftId));
  }

  @Get("drafts/:draftId/audit")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  getAudit(@Param("draftId") draftId: string): ApiResponseDto<AiPatchAuditResponseDto> {
    return response(this.aiPatchService.getAudit(draftId));
  }

  @Post("drafts/:draftId/status")
  @RequireRoles("Admin", "PM", "Technical Reviewer")
  updateDraftStatus(@Param("draftId") draftId: string, @Body() body: AiPatchDraftStatusRequestDto, @Headers("cookie") cookieHeader?: string): ApiResponseDto<AiPatchDraftDto> {
    return response(this.aiPatchService.updateDraftStatus(draftId, { ...body, changedBy: this.authenticatedActor(cookieHeader) }));
  }

  @Post("drafts/:draftId/approve")
  @RequireRoles("Admin", "PM")
  approveDraft(@Param("draftId") draftId: string, @Body() body: AiPatchApprovalGateRequestDto, @Headers("cookie") cookieHeader?: string): ApiResponseDto<AiPatchDraftDto> {
    return response(this.aiPatchService.approveDraft(draftId, { ...body, changedBy: this.authenticatedActor(cookieHeader) }));
  }

  @Post("drafts/:draftId/reject")
  @RequireRoles("Admin", "PM")
  rejectDraft(@Param("draftId") draftId: string, @Body() body: AiPatchApprovalGateRequestDto, @Headers("cookie") cookieHeader?: string): ApiResponseDto<AiPatchDraftDto> {
    return response(this.aiPatchService.rejectDraft(draftId, { ...body, changedBy: this.authenticatedActor(cookieHeader) }));
  }

  @Post("drafts/:draftId/stop")
  @RequireRoles("Admin", "PM")
  stopDraft(@Param("draftId") draftId: string, @Body() body: AiPatchApprovalGateRequestDto, @Headers("cookie") cookieHeader?: string): ApiResponseDto<AiPatchDraftDto> {
    return response(this.aiPatchService.stopDraft(draftId, { ...body, changedBy: this.authenticatedActor(cookieHeader) }));
  }

  @Post("drafts/:draftId/artifacts")
  @RequireRoles("Admin", "PM", "Technical Reviewer")
  createArtifact(
    @Param("draftId") draftId: string,
    @Body() body: AiPatchArtifactRequestDto,
    @Headers("cookie") cookieHeader?: string
  ): ApiResponseDto<AiPatchArtifactDto> {
    return response(this.aiPatchService.createArtifact(draftId, body, this.authenticatedActor(cookieHeader)));
  }

  @Get("drafts/:draftId/artifacts")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  listArtifacts(@Param("draftId") draftId: string): ApiResponseDto<AiPatchArtifactDto[]> {
    return response(this.aiPatchService.listArtifacts(draftId));
  }

  @Get("drafts/:draftId/artifacts/:artifactId")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  getArtifact(@Param("draftId") draftId: string, @Param("artifactId") artifactId: string): ApiResponseDto<AiPatchArtifactDto> {
    return response(this.aiPatchService.getArtifact(draftId, artifactId));
  }

  private authenticatedActor(cookieHeader?: string): string {
    const user = this.authService.session(cookieHeader).user;
    return `${user.displayName} [${user.role}]`;
  }
}
