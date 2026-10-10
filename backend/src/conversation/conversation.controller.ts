import { BadRequestException, Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { response } from "../common/api-response";
import { AuthService } from "../auth/auth.service";
import { AuthzGuard } from "../auth/authz.guard";
import type { CreateConversationDto, UpdateConversationDto, PostMessageDto } from "./conversation.dto";
import { ConversationService } from "./conversation.service";

/**
 * ConversationController
 *
 * All routes require authentication (cookie session).
 * Chat message posting is non-blocking — never waits on agent runs.
 */
@Controller("conversations")
@UseGuards(AuthzGuard)
export class ConversationController {
  constructor(
    @Inject(ConversationService) private readonly conversationService: ConversationService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  /**
   * POST /api/conversations
   * Create a new conversation bound to a project.
   */
  @Post()
  async createConversation(
    @Headers("cookie") cookieHeader: string | undefined,
    @Body() body: CreateConversationDto
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.conversationService.createConversation(claims.sub, body, claims));
  }

  /**
   * GET /api/conversations?projectId=...
   * List conversations for the authenticated user.
   */
  @Get()
  async listConversations(
    @Headers("cookie") cookieHeader: string | undefined,
    @Query("projectId") projectId?: string
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.conversationService.listConversations(claims.sub, projectId, claims));
  }

  /**
   * GET /api/conversations/:id
   * Get conversation with full message history.
   */
  @Get(":id")
  async getConversation(
    @Param("id") id: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.conversationService.getConversation(id, claims.sub, claims));
  }

  @Get(":id/change-sets/:setId/decisions/:revision")
  async changeDecisionRevision(@Param("id") id: string, @Param("setId") setId: string, @Param("revision") revision: string,
    @Headers("cookie") cookieHeader: string | undefined) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.conversationService.changeDecisionRevision(id, claims, setId, Number(revision)));
  }

  @Post(":id/change-decisions")
  async decideChange(@Param("id") id: string, @Headers("cookie") cookieHeader: string | undefined, @Body() body: unknown) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.conversationService.decideChange(id, claims, body));
  }

  @Post(":id/change-sets")
  async prepareChangeSet(@Param("id") id: string, @Headers("cookie") cookieHeader: string | undefined, @Body() body: unknown) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.conversationService.prepareChangeSet(id, claims, body));
  }

  /**
   * PATCH /api/conversations/:id
   * Update conversation title or metadata (e.g. group name).
   */
  @Patch(":id")
  async updateConversation(
    @Param("id") id: string,
    @Headers("cookie") cookieHeader: string | undefined,
    @Body() body: UpdateConversationDto
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    await this.conversationService.getConversation(id, claims.sub, claims);
    return response(await this.conversationService.updateConversation(id, claims.sub, body));
  }

  /**
   * DELETE /api/conversations/:id
   * Delete conversation and cascade its messages, agent runs, and attachments.
   */
  @Delete(":id")
  async deleteConversation(
    @Param("id") id: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    await this.conversationService.getConversation(id, claims.sub, claims);
    return response(await this.conversationService.deleteConversation(id, claims.sub));
  }

  /**
   * POST /api/conversations/:id/messages
   * Post a user message. Non-blocking — does not depend on agent run state.
   * The chat interface can always receive new messages even while an agent is running.
   */
  @Post(":id/messages")
  async postMessage(
    @Param("id") conversationId: string,
    @Headers("cookie") cookieHeader: string | undefined,
    @Body() body: PostMessageDto
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.conversationService.postMessage(conversationId, claims, body));
  }

  @Post(":id/plans")
  async generatePlan(@Param("id") id: string, @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    const claims = await this.authService.validateDurableSession(cookie);
    return response(await this.conversationService.generatePlan(id, claims, body));
  }
  @Post(":id/historical-context")
  async selectHistoricalContext(@Param("id") id: string, @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    const claims = await this.authService.validateDurableSession(cookie);
    return response(await this.conversationService.selectHistoricalContext(id, claims, body));
  }
  @Post(":id/exact-proposals")
  async prepareExactProposal(@Param("id") id: string, @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    const claims = await this.authService.validateDurableSession(cookie);
    return response(await this.conversationService.prepareExactProposal(id, claims, body));
  }
  @Post(":id/plans/decision")
  async decidePlanWorkflow(@Param("id") id: string, @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    return response(await this.conversationService.decidePlanWorkflow(id, await this.authService.validateDurableSession(cookie), body));
  }
  @Post(":id/plans/approve-execution")
  async approvePlanWorkflow(@Param("id") id: string, @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    return response(await this.conversationService.approvePlanWorkflow(id, await this.authService.validateDurableSession(cookie), body));
  }
  @Post(":id/exact-proposals/:proposalId/approval")
  async requestExactApproval(@Param("id") id: string, @Param("proposalId") proposalId: string,
    @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    const claims = await this.authService.validateDurableSession(cookie);
    return response(await this.conversationService.exactProposalApproval(id, proposalId, claims, body, false));
  }
  @Post(":id/exact-proposals/:proposalId/execute")
  async executeExactProposal(@Param("id") id: string, @Param("proposalId") proposalId: string,
    @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    const claims = await this.authService.validateDurableSession(cookie);
    return response(await this.conversationService.executeExactProposal(id, proposalId, claims, body));
  }
  @Post(":id/exact-proposals/:proposalId/task-consent")
  async createTaskConsent(@Param("id") id: string, @Param("proposalId") proposalId: string, @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    return response(await this.conversationService.taskConsent(id, proposalId, await this.authService.validateDurableSession(cookie), body));
  }
  @Post(":id/exact-proposals/:proposalId/approval/task-consent")
  async applyTaskConsent(@Param("id") id: string, @Param("proposalId") proposalId: string, @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    return response(await this.conversationService.taskConsent(id, proposalId, await this.authService.validateDurableSession(cookie), body, true));
  }
  @Post(":id/exact-proposals/:proposalId/session-consent")
  async createSessionConsent(@Param("id") id: string, @Param("proposalId") proposalId: string, @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    return response(await this.conversationService.taskConsent(id, proposalId, await this.authService.validateDurableSession(cookie), body, false, "SESSION"));
  }
  @Get([":id/task-consents/:policyId", ":id/session-consents/:policyId"])
  async readTaskConsent(@Param("id") id: string, @Param("policyId") policyId: string, @Headers("cookie") cookie: string | undefined) {
    return response(await this.conversationService.readTaskConsent(id, policyId, await this.authService.validateDurableSession(cookie)));
  }
  @Delete([":id/task-consents/:policyId", ":id/session-consents/:policyId"])
  async revokeTaskConsent(@Param("id") id: string, @Param("policyId") policyId: string, @Headers("cookie") cookie: string | undefined) {
    return response(await this.conversationService.readTaskConsent(id, policyId, await this.authService.validateDurableSession(cookie), true));
  }
  @Post(":id/executions/:runId/recover-verification")
  async recoverVerification(@Param("id") id: string, @Param("runId") runId: string,
    @Headers("cookie") cookie: string | undefined, @Body() body: { requestId: string }) {
    const claims = await this.authService.validateDurableSession(cookie);
    return response(await this.conversationService.recoverExecutionVerification(id, runId, claims, body?.requestId));
  }
  @Get(":id/executions/:runId/review")
  async reviewExecution(@Param("id") id: string, @Param("runId") runId: string,
    @Headers("cookie") cookie: string | undefined, @Query("planVersion") version?: string) {
    const claims = await this.authService.validateDurableSession(cookie);
    const planVersion = version === undefined ? undefined : Number(version);
    if (planVersion !== undefined && (!Number.isSafeInteger(planVersion) || planVersion < 1)) throw new BadRequestException("EXECUTION_HISTORY_VERSION_INVALID");
    return response(await this.conversationService.reviewExecution(id, runId, claims, planVersion));
  }
  @Post(":id/exact-proposals/:proposalId/permits")
  async issueExactPermit(@Param("id") id: string, @Param("proposalId") proposalId: string,
    @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    const claims = await this.authService.validateDurableSession(cookie);
    return response(await this.conversationService.issueExactProposalPermit(id, proposalId, claims, body));
  }
  @Post(":id/exact-proposals/:proposalId/approval/decision")
  async decideExactApproval(@Param("id") id: string, @Param("proposalId") proposalId: string,
    @Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    const claims = await this.authService.validateDurableSession(cookie);
    return response(await this.conversationService.exactProposalApproval(id, proposalId, claims, body, true));
  }
}
