import { BadRequestException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

export const EVENT_PAGE_LIMIT = 128;
const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

/** Read-only snapshot. Transport frames and model output never enter this read model. */
export async function readAgentEventPage(db: Pick<PrismaClient, "$transaction">, runId: string, cursor = 0, limit = EVENT_PAGE_LIMIT) {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > EVENT_PAGE_LIMIT)
    throw new BadRequestException("AGENT_EVENT_CURSOR_INVALID");
  return db.$transaction(async tx => {
    const run = await tx.agentRun.findUnique({ where: { id: runId }, select: { status: true, eventSeq: true, eventTerminalSeq: true } });
    if (!run) throw new NotFoundException("Agent run not found");
    if (!Number.isSafeInteger(run.eventSeq) || run.eventSeq < 0) throw new ServiceUnavailableException("AGENT_EVENT_SEQUENCE_UNAVAILABLE");
    if (cursor > run.eventSeq) throw new BadRequestException("AGENT_EVENT_CURSOR_INVALID");
    const watermark = terminal.has(run.status) ? run.eventTerminalSeq : null;
    if (terminal.has(run.status) && watermark !== run.eventSeq) throw new ServiceUnavailableException("AGENT_EVENT_WATERMARK_INVALID");
    const events = await tx.agentRunEvent.findMany({ where: { agentRunId: runId, seq: { gt: cursor, lte: run.eventSeq } },
      orderBy: { seq: "asc" }, take: limit });
    let nextCursor = cursor;
    for (const e of events) {
      if (e.agentRunId !== runId || e.seq !== nextCursor + 1) throw new ServiceUnavailableException("AGENT_EVENT_SEQUENCE_GAP");
      nextCursor = e.seq;
    }
    if (nextCursor < run.eventSeq && events.length < limit) throw new ServiceUnavailableException("AGENT_EVENT_SEQUENCE_GAP");
    return { runId, events, nextCursor, watermark: run.eventSeq, terminalWatermark: watermark,
      status: run.status, hasMore: nextCursor < run.eventSeq, replayComplete: watermark !== null && nextCursor === watermark };
  }, { isolationLevel: "RepeatableRead" });
}

/** Legacy IDs are aliases only; all subsequent pagination/order uses seq. */
export async function resolveAgentEventCursor(db: Pick<PrismaClient, "agentRunEvent">, runId: string, lastEventId?: string): Promise<number> {
  if (!lastEventId) return 0;
  const prefix = `${runId}:`;
  if (lastEventId.startsWith(prefix)) {
    const suffix = lastEventId.slice(prefix.length);
    if (!/^(0|[1-9][0-9]*)$/.test(suffix) || !Number.isSafeInteger(Number(suffix))) throw new BadRequestException("AGENT_EVENT_CURSOR_INVALID");
    return Number(suffix);
  }
  const event = await db.agentRunEvent.findUnique({ where: { id: lastEventId }, select: { agentRunId: true, seq: true } });
  if (!event || event.agentRunId !== runId) throw new BadRequestException("AGENT_EVENT_CURSOR_INVALID");
  if (!Number.isSafeInteger(event.seq) || event.seq < 1) throw new ServiceUnavailableException("AGENT_EVENT_SEQUENCE_UNAVAILABLE");
  return event.seq;
}
