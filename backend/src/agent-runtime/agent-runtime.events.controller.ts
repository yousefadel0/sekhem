import { Controller, Query, Get, Param, Headers, UseGuards, Sse, Inject, type MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AuthzGuard } from '../auth/authz.guard';
import { AgentRuntimeService } from './agent-runtime.service';
import type { SessionClaims } from '../auth/auth.dto';

/**
 * SSE endpoint for streaming AgentRunEvents to the frontend.
 *
 * Guarantees:
 * - Authenticated via durable session cookie (no JWT in query)
 * - Authorization scoped to the requesting user's organization/project
 * - Supports Last-Event-ID to resume missed events with total ordering
 * - Server-owned per-run sequence pagination
 */
@Controller('agent-runs')
@UseGuards(AuthzGuard)
export class AgentRuntimeEventsController {
  constructor(
    @Inject(AgentRuntimeService) private readonly agentRuntime: AgentRuntimeService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get(':id/recovery')
  async recoverRun(
    @Param('id') id: string,
    @Headers('cookie') cookieHeader: string | undefined,
    @Query('cursor') cursor = '0',
    @Query('limit') limit = '128',
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return this.agentRuntime.recoverRunSnapshot(id, claims, Number(cursor), Number(limit));
  }

  @Get(':id/events/replay')
  async replayEvents(
    @Param('id') id: string,
    @Headers('cookie') cookieHeader: string | undefined,
    @Query('cursor') cursor = '0',
    @Query('limit') limit = '128',
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return this.agentRuntime.replayEvents(id, claims, Number(cursor), Number(limit));
  }

  /**
   * Stream persisted AgentRunEvent records for a given run.
   *
   * @param id          AgentRun identifier
   * @param cookieHeader Session cookie header for auth
   * @param lastEventId Optional Last‑Event‑ID header for replay
   */
  @Get(':id/events')
  @Sse()
  async streamEvents(
    @Param('id') id: string,
    @Headers('cookie') cookieHeader: string | undefined,
    @Headers('last-event-id') lastEventId?: string,
  ): Promise<Observable<MessageEvent>> {
    const claims: SessionClaims = typeof this.authService.validateDurableSession === 'function'
      ? await this.authService.validateDurableSession(cookieHeader)
      : await this.authService.sessionClaims(cookieHeader);
    // Authorize read access to the run (reuse service method)
    await this.agentRuntime.authorizeRunRead(id, claims);
    // Return a hot observable that polls the DB for new events
    return this.agentRuntime.createEventObservable(id, claims, lastEventId);
  }
}
