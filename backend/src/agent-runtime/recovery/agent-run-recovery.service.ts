import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../data-access/prisma.service';
import { readAgentEventPage } from '../agent-run-event-replay';
import { AgentContextProjectionService } from '../context-projection/agent-context-projection.service';

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const ACTIVE = ['QUEUED', 'PLANNING', 'RUNNING'];

@Injectable()
export class AgentRunRecoveryService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AgentContextProjectionService) private readonly contexts: AgentContextProjectionService) {}

  private async fence(tx: any, runId: string) {
    // Transaction-scoped and shared by all backend processes. Hash collisions only serialize unrelated runs.
    const rows = await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked', `agent-run-recovery:${runId}`);
    if (rows[0]?.locked !== true) throw new ConflictException('AGENT_RUN_RECOVERY_BUSY');
  }

  private validateState(run: any) {
    if (![...ACTIVE, 'PAUSED', 'AWAITING_APPROVAL', ...TERMINAL].includes(run.status) ||
        !Number.isSafeInteger(run.currentStepIndex) || run.currentStepIndex < 0 ||
        !Number.isSafeInteger(run.planVersion) || run.planVersion < 1)
      throw new ServiceUnavailableException('AGENT_RECOVERY_STATE_INVALID');
  }

  private async validateHistory(tx: any, runId: string, watermark: number) {
    if (!Number.isSafeInteger(watermark) || watermark < 0) throw new ServiceUnavailableException('AGENT_RECOVERY_SEQUENCE_UNAVAILABLE');
    const counts = await tx.agentRunEvent.aggregate({ where: { agentRunId: runId },
      _count: { seq: true }, _min: { seq: true }, _max: { seq: true } });
    if (counts._count.seq !== watermark || counts._min.seq !== (watermark ? 1 : null) || counts._max.seq !== (watermark || null))
      throw new ServiceUnavailableException('AGENT_RECOVERY_HISTORY_INCOMPLETE');
  }

  /** Authenticated run-read callers only. Reconnect has no durable writes or execution authority. */
  async snapshot(runId: string, cursor = 0, limit = 128) {
    return this.db.$transaction(async tx => {
      await this.fence(tx, runId);
      const run = await tx.agentRun.findUnique({ where: { id: runId }, select: {
        status: true, eventSeq: true, currentStepIndex: true, planVersion: true, failureReason: true } });
      if (!run) throw new NotFoundException('Agent run not found');
      this.validateState(run);
      await this.validateHistory(tx, runId, run.eventSeq);
      // Both readers share this PostgreSQL snapshot. Client cursor only limits replay, not recovery context.
      const replay = await readAgentEventPage({ $transaction: (reader: any) => reader(tx) }, runId, cursor, limit);
      const projection = await this.contexts.buildInTransaction(tx, runId, { cursor: run.eventSeq });
      const interruptedActions = projection.events.filter(e => e.type === 'TOOL_CALL' && e.correlation !== 'MATCHED')
        .map(e => ({ reference: e.reference, stepIndex: e.stepIndex, actionId: e.actionId ?? null }));
      const uncertain = projection.truncated || projection.warnings.length > 0 || interruptedActions.length > 0 ||
        run.failureReason === 'RECOVERY_REVALIDATION_REQUIRED';
      const recoveryState = TERMINAL.has(run.status) ? 'TERMINAL' : uncertain ? 'UNCERTAIN' :
        run.status === 'AWAITING_APPROVAL' ? 'AWAITING_APPROVAL' : run.status === 'PAUSED' ? 'PAUSED' : 'RECOVERABLE';
      return { runId, status: run.status, planVersion: run.planVersion, stepIndex: run.currentStepIndex,
        recoveryState, requiresRevalidation: uncertain, interruptedActions, replay, projection,
        executionAuthority: 'NONE' as const, automaticDispatch: false as const };
    }, { isolationLevel: 'RepeatableRead' });
  }

  /** Startup fallback only. Specialized receipt/inspection recovery keeps ownership of its own state. */
  async parkInterrupted(runId: string, interruptedPlanningGeneration = false): Promise<boolean> {
    return this.db.$transaction(async tx => {
      await this.fence(tx, runId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "AgentRun" WHERE "id" = $1 FOR UPDATE', runId);
      const run = await tx.agentRun.findUnique({ where: { id: runId }, select: {
        id: true, status: true, eventSeq: true, currentStepIndex: true, planVersion: true } });
      if (!run) throw new NotFoundException('Agent run not found');
      this.validateState(run);
      if (!ACTIVE.includes(run.status)) return false; // terminal, paused and approval-bound runs stay unchanged
      await this.validateHistory(tx, runId, run.eventSeq);
      const now = new Date();
      const status = interruptedPlanningGeneration ? 'FAILED' : 'PAUSED';
      await tx.agentRun.update({ where: { id: runId }, select: { id: true }, data: { status, failureReason: 'RECOVERY_REVALIDATION_REQUIRED',
        ...(interruptedPlanningGeneration ? { completedAt: now } : { pausedAt: now }) } });
      await tx.agentRunEvent.create({ data: { id: `ev_recovery_${runId}_${run.eventSeq}`, agentRunId: runId,
        eventType: 'RECOVERY_REQUIRED', actor: 'system', stepIndex: run.currentStepIndex,
        payload: { previousStatus: run.status, newStatus: status, sourceSeq: run.eventSeq,
          recoveryState: 'UNCERTAIN', automaticDispatch: false, requiresRevalidation: true } } });
      return true;
    });
  }
}
