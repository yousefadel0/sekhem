import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { AuthService } from "./auth/auth.service";
import { RequireRoles } from "./auth/roles.decorator";
import { response } from "./common/api-response";
import type { ApiResponseDto } from "./dto";
import type {
  CollectPreviewRequestDto,
  CreateCandidateInitiativeRequestDto,
  CreateCandidateInitiativeResponseDto,
  CreateEvidenceReviewRequestDto,
  CreateRDRadarEvidenceReviewRequestDto,
  CreateRDRadarEvidenceReviewResponseDto,
  CreatePMDecisionRequestDto,
  CreatePMDecisionResponseDto,
  CreateWorkflowRunSummaryResponseDto,
  RDRadarCandidateDto,
  RDRadarEvidenceReviewDto,
  RDRadarEvidenceResponseDto,
  RDRadarGithubSonicPreviewResponseDto,
  RDRadarGithubStatusDto,
  RDRadarPMDecisionDto,
  RDRadarRealInputRequestDto,
  RDRadarRealInputResponseDto,
  RDRadarStatusDto,
  RDRadarWorkflowRunSummaryDto
} from "./rd-radar.dto";
import { RDRadarService } from "./rd-radar.service";
import type { RDRadarAnalysisRunDto } from "./rd-radar-analysis.dto";
import { RDRadarAnalysisService } from "./rd-radar-analysis.service";

@Controller("rd-radar")
export class RDRadarController {
  constructor(
    @Inject(RDRadarService) private readonly rdRadarService: RDRadarService,
    @Inject(RDRadarAnalysisService) private readonly analysisService: RDRadarAnalysisService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  @Post("analysis-runs")
  @HttpCode(202)
  @RequireRoles("Admin", "PM")
  async runAnalysis(@Body() body: unknown, @Headers("cookie") cookieHeader?: string): Promise<ApiResponseDto<RDRadarAnalysisRunDto>> {
    const actorId = this.authService.session(cookieHeader).user.id;
    return response(await this.analysisService.run(body, actorId));
  }

  @Get("analysis-runs")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async analysisRuns(): Promise<ApiResponseDto<RDRadarAnalysisRunDto[]>> {
    const data = await this.analysisService.list();
    return response(data, { total: data.length });
  }

  @Get("analysis-runs/:id")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async analysisRun(@Param("id") id: string): Promise<ApiResponseDto<RDRadarAnalysisRunDto>> {
    return response(await this.analysisService.get(id));
  }

  @Post("analysis-runs/:id/cancel")
  @RequireRoles("Admin", "PM")
  async cancelAnalysis(@Param("id") id: string): Promise<ApiResponseDto<RDRadarAnalysisRunDto>> {
    return response(await this.analysisService.cancel(id));
  }

  @Get("status")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async status(): Promise<ApiResponseDto<RDRadarStatusDto>> {
    return response(await this.rdRadarService.status());
  }

  @Get("evidence")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async evidence(): Promise<ApiResponseDto<RDRadarEvidenceResponseDto>> {
    return response(await this.rdRadarService.evidence());
  }

  @Post("evidence/collect-preview")
  @RequireRoles("Admin", "PM")
  async collectPreview(@Body() body: CollectPreviewRequestDto): Promise<ApiResponseDto<RDRadarEvidenceResponseDto>> {
    return response(await this.rdRadarService.collectPreview(body));
  }

  @Post("real-input-preview")
  @RequireRoles("Admin", "PM")
  async realInputPreview(@Body() body: RDRadarRealInputRequestDto): Promise<ApiResponseDto<RDRadarRealInputResponseDto>> {
    return response(await this.rdRadarService.realInputPreview(body));
  }

  @Post("reviews")
  @RequireRoles("Admin", "PM", "Technical Reviewer")
  async createReview(@Body() body: CreateEvidenceReviewRequestDto): Promise<ApiResponseDto<{ id: string; accepted: true }>> {
    return response(await this.rdRadarService.createReview(body));
  }

  @Get("evidence-reviews")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async evidenceReviews(@Query("candidateId") candidateId?: string): Promise<ApiResponseDto<RDRadarEvidenceReviewDto[]>> {
    const data = await this.rdRadarService.evidenceReviews(candidateId);
    return response(data, { total: data.length });
  }

  @Post("evidence-reviews")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer")
  async createEvidenceReview(
    @Body() body: CreateRDRadarEvidenceReviewRequestDto
  ): Promise<ApiResponseDto<CreateRDRadarEvidenceReviewResponseDto>> {
    return response(await this.rdRadarService.createEvidenceReview(body));
  }

  @Get("candidates")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async candidates(): Promise<ApiResponseDto<RDRadarCandidateDto[]>> {
    const data = await this.rdRadarService.candidates();
    return response(data, { total: data.length });
  }

  @Post("candidates")
  @RequireRoles("Admin", "PM")
  async createCandidate(@Body() body: CreateCandidateInitiativeRequestDto): Promise<ApiResponseDto<CreateCandidateInitiativeResponseDto>> {
    return response(await this.rdRadarService.createCandidate(body));
  }

  @Get("pm-decisions")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async pmDecisions(@Query("candidateId") candidateId?: string): Promise<ApiResponseDto<RDRadarPMDecisionDto[]>> {
    const data = await this.rdRadarService.pmDecisions(candidateId);
    return response(data, { total: data.length });
  }

  @Post("pm-decisions")
  @RequireRoles("Admin", "PM")
  async createPMDecision(@Body() body: CreatePMDecisionRequestDto): Promise<ApiResponseDto<CreatePMDecisionResponseDto>> {
    return response(await this.rdRadarService.createPMDecision(body));
  }

  @Get("workflow-runs")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async workflowRuns(): Promise<ApiResponseDto<RDRadarWorkflowRunSummaryDto[]>> {
    const data = await this.rdRadarService.workflowRuns();
    return response(data, { total: data.length });
  }

  @Post("workflow-runs")
  @HttpCode(202)
  @RequireRoles("Admin", "PM")
  async createWorkflowRun(@Body() body: unknown): Promise<ApiResponseDto<CreateWorkflowRunSummaryResponseDto>> {
    return response(await this.rdRadarService.createWorkflowRun(body));
  }

  @Get("github-status")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async githubStatus(): Promise<ApiResponseDto<RDRadarGithubStatusDto>> {
    return response(await this.rdRadarService.githubStatus());
  }

  @Get("github-sonic-preview")
  @RequireRoles("Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer")
  async githubSonicPreview(): Promise<ApiResponseDto<RDRadarGithubSonicPreviewResponseDto>> {
    return response(this.rdRadarService.githubSonicPreview());
  }
}
