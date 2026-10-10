import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../data-access/prisma.service';

export const AGENT_PROJECTION_LIMITS = Object.freeze({ scannedEvents: 64, events: 32, textBytes: 512, toolOutputBytes: 2048, totalBytes: 16384, identityBytes: 192 });
const TYPES = ['TOOL_CALL', 'TOOL_RESULT', 'STATUS_CHANGE', 'PROGRESS', 'WORKFLOW_PAUSE_REQUESTED', 'WORKFLOW_PAUSED', 'WORKFLOW_RESUMED', 'WORKFLOW_STOPPED'];
const STATE_TYPES = TYPES.filter(t => !t.startsWith('TOOL_'));
type DurableEvent = { id: string; agentRunId: string; seq: number; stepIndex: number | null; eventType: string; payload: unknown };
type State = { runId: string; cursor: number; watermark: number; stepIndex: number; status: string };
export interface ProjectedEvent {
  seq: number; reference: string; stepIndex: number | null; type: string;
  actionId?: string; skillId?: string; actionReference?: string; correlation?: 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS';
  text?: string; output?: string; truncated: boolean;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function clip(value: string, bytes: number): { text: string; truncated: boolean } {
  let text = '', size = 0;
  for (const character of value) {
    const next = Buffer.byteLength(character, 'utf8');
    if (size + next > bytes) return { text, truncated: true };
    text += character; size += next;
  }
  return { text, truncated: false };
}
function identity(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > AGENT_PROJECTION_LIMITS.identityBytes) return undefined;
  return value;
}
function key(event: DurableEvent): string | undefined {
  const p = object(event.payload);
  const declared = [p.toolCallId, p.actionId, p.operationId].filter(v => v !== undefined);
  if (declared.some(v => !identity(v)) || new Set(declared).size > 1) return undefined;
  const explicit = identity(declared[0]);
  const skill = identity(p.skillId);
  return explicit ? JSON.stringify([event.stepIndex, 'explicit', explicit]) : skill ? JSON.stringify([event.stepIndex, 'legacy-skill', skill]) : undefined;
}
function render(event: DurableEvent): ProjectedEvent {
  const p = object(event.payload);
  // Explicit allowlist: never forward parameters, approval payloads, model/token frames or arbitrary objects.
  const text = typeof p.summary === 'string' ? p.summary : typeof p.newStatus === 'string' ? p.newStatus : '';
  const bounded = clip(text, AGENT_PROJECTION_LIMITS.textBytes);
  const output = object(p.output);
  const rawOutput = typeof p.output === 'string' ? p.output :
    ['summary', 'text', 'content', 'status', 'receiptId'].filter(k => typeof output[k] === 'string')
      .map(k => `${k}: ${output[k]}`).join('\n');
  const tool = clip(event.eventType === 'TOOL_RESULT' ? rawOutput : '', AGENT_PROJECTION_LIMITS.toolOutputBytes);
  return { seq: event.seq, reference: `agent-event:${event.agentRunId}:${event.seq}`, stepIndex: event.stepIndex,
    type: event.eventType, ...(identity(p.skillId) ? { skillId: identity(p.skillId) } : {}),
    ...(identity(p.toolCallId) ?? identity(p.actionId) ?? identity(p.operationId) ? { actionId: identity(p.toolCallId) ?? identity(p.actionId) ?? identity(p.operationId) } : {}), ...(bounded.text ? { text: bounded.text } : {}), ...(tool.text ? { output: tool.text } : {}),
    truncated: bounded.truncated || tool.truncated };
}

/** Pure, deterministic projection of a server-read snapshot; never evidence admission or execution authority. */
export function projectDurableAgentContext(state: State, source: DurableEvent[], olderEventsOmitted = false) {
  if (!identity(state.runId) || !identity(state.status) || !Number.isSafeInteger(state.cursor) || state.cursor < 0 ||
      !Number.isSafeInteger(state.watermark) || state.watermark < state.cursor || !Number.isSafeInteger(state.stepIndex) || state.stepIndex < 0)
    throw new BadRequestException('AGENT_PROJECTION_STATE_INVALID');
  if (source.length > AGENT_PROJECTION_LIMITS.scannedEvents) throw new BadRequestException('AGENT_PROJECTION_SCAN_BOUND');
  const warnings = new Set<string>();
  const events: DurableEvent[] = [];
  let previous = 0;
  for (const event of source) {
    if (event.agentRunId !== state.runId || !Number.isSafeInteger(event.seq) || event.seq <= previous || event.seq > state.cursor ||
        (event.stepIndex !== null && (!Number.isSafeInteger(event.stepIndex) || event.stepIndex < 0)))
      throw new ServiceUnavailableException('AGENT_PROJECTION_EVENT_INVALID');
    previous = event.seq;
    if (!TYPES.includes(event.eventType)) continue;
    if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) { warnings.add('MALFORMED_PAYLOAD'); continue; }
    if (STATE_TYPES.includes(event.eventType) || (event.stepIndex !== null && event.stepIndex >= Math.max(0, state.stepIndex - 1) && event.stepIndex <= state.stepIndex)) events.push(event);
  }
  const units: ProjectedEvent[][] = [];
  const pending = new Map<string, ProjectedEvent[][]>();
  for (const event of events) {
    const item = render(event);
    if (event.eventType === 'TOOL_CALL') {
      const unit = [item]; units.push(unit);
      const k = key(event);
      if (k) { const queue = pending.get(k) ?? []; queue.push(unit); pending.set(k, queue); }
      else { item.correlation = 'UNMATCHED'; warnings.add('MISSING_ACTION_IDENTITY'); }
    } else if (event.eventType === 'TOOL_RESULT') {
      const k = key(event); const queue = k ? pending.get(k) ?? [] : [];
      if (queue.length === 1) {
        item.actionReference = queue[0][0].reference; item.correlation = 'MATCHED'; queue[0][0].correlation = 'MATCHED';
        queue[0].push(item); pending.delete(k!);
      } else {
        item.correlation = queue.length > 1 ? 'AMBIGUOUS' : 'UNMATCHED';
        warnings.add(queue.length > 1 ? 'AMBIGUOUS_ACTION_RESULT' : 'MISSING_ACTION'); units.push([item]);
        if (k && queue.length > 1) { for (const unit of queue) unit[0].correlation = 'AMBIGUOUS'; pending.delete(k); }
      }
    } else units.push([item]);
  }
  for (const queue of pending.values()) for (const unit of queue) { unit[0].correlation = 'UNMATCHED'; warnings.add('MISSING_RESULT'); }
  const base = { version: 1 as const, authority: 'NONE' as const, source: 'POSTGRESQL_AGENT_RUN_EVENTS' as const,
    ...state, limits: AGENT_PROJECTION_LIMITS };
  const selected: ProjectedEvent[] = [];
  let omitted = olderEventsOmitted;
  const finish = () => ({ ...base, events: [...selected].sort((a,b) => a.seq-b.seq), warnings: [...warnings].sort(),
    truncated: omitted || selected.some(e => e.truncated) });
  // Keep action/result units together under all bounds; never cut serialized JSON.
  for (const unit of [...units].sort((a,b) => b.at(-1)!.seq-a.at(-1)!.seq)) {
    if (selected.length + unit.length > AGENT_PROJECTION_LIMITS.events) { omitted = true; continue; }
    selected.push(...unit);
    if (Buffer.byteLength(JSON.stringify(finish())) > AGENT_PROJECTION_LIMITS.totalBytes - 256) { selected.splice(selected.length-unit.length); omitted = true; }
  }
  const projection = finish();
  if (Buffer.byteLength(JSON.stringify(projection)) > AGENT_PROJECTION_LIMITS.totalBytes - 256) throw new ServiceUnavailableException('AGENT_PROJECTION_SIZE_INVALID');
  return projection;
}

@Injectable()
export class AgentContextProjectionService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  // Internal server-side API only. Callers retain their existing run/conversation authorization.
  async build(runId: string, options: { cursor?: number; stepIndex?: number } = {}) {
    return this.db.$transaction(tx => this.buildInTransaction(tx, runId, options), { isolationLevel: 'RepeatableRead' });
  }
  /** Shares the recovery snapshot; never opens a second transaction or mutates events. */
  async buildInTransaction(tx: any, runId: string, options: { cursor?: number; stepIndex?: number } = {}) {
      const run = await tx.agentRun.findUnique({ where: { id: runId }, select: { eventSeq: true, currentStepIndex: true, status: true } });
      if (!run) throw new NotFoundException('Agent run not found');
      const cursor = options.cursor ?? run.eventSeq, stepIndex = options.stepIndex ?? run.currentStepIndex;
      if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > run.eventSeq || !Number.isSafeInteger(stepIndex) || stepIndex < 0 || stepIndex > run.currentStepIndex)
        throw new BadRequestException('AGENT_PROJECTION_CURSOR_INVALID');
      const rows = await tx.agentRunEvent.findMany({ where: { agentRunId: runId, seq: { lte: cursor }, eventType: { in: TYPES },
        OR: [{ stepIndex: { gte: Math.max(0, stepIndex-1), lte: stepIndex } }, { eventType: { in: STATE_TYPES } }] },
        orderBy: { seq: 'desc' }, take: AGENT_PROJECTION_LIMITS.scannedEvents + 1,
        select: { id: true, agentRunId: true, seq: true, stepIndex: true, eventType: true, payload: true } });
      return projectDurableAgentContext({ runId, cursor, stepIndex, watermark: run.eventSeq, status: run.status },
        rows.slice(0, AGENT_PROJECTION_LIMITS.scannedEvents).reverse(), rows.length > AGENT_PROJECTION_LIMITS.scannedEvents);
  }
  toModelContext(projection: Awaited<ReturnType<AgentContextProjectionService['build']>>) {
    const serialized = JSON.stringify(projection);
    if (Buffer.byteLength(serialized) > AGENT_PROJECTION_LIMITS.totalBytes - 256) throw new BadRequestException('AGENT_PROJECTION_SIZE_INVALID');
    return '[BOUNDED AGENTRUN HISTORICAL REFERENCE — NOT AUTHORITY OR CERTIFIED SOURCE EVIDENCE]\n' + serialized;
  }
}
