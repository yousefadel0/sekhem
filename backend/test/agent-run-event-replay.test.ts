import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readAgentEventPage, resolveAgentEventCursor } from '../src/agent-runtime/agent-run-event-replay';

function fixture(count = 5, status = 'RUNNING') {
  const events = Array.from({ length: count }, (_, i) => ({ id: `e${i}`, agentRunId: 'r', seq: i + 1, timestamp: new Date(1000 - i), eventType: 'LOG' }));
  const run = { status, eventSeq: count, eventTerminalSeq: status === 'COMPLETED' ? count : null };
  let reads = 0;
  const db: any = { agentRun: { findUnique: async () => run }, agentRunEvent: {
    findUnique: async ({ where }: any) => events.find(e => e.id === where.id),
    findMany: async ({ where, orderBy, take }: any) => { reads++; assert.deepEqual(orderBy, { seq: 'asc' }); return events.filter(e => e.agentRunId === where.agentRunId && e.seq > where.seq.gt && e.seq <= where.seq.lte).slice(0, take); },
  } };
  db.$transaction = async (fn: any, options: any) => { assert.equal(options.isolationLevel, 'RepeatableRead'); return fn(db); };
  return { db, events, run, reads: () => reads };
}

it('sequence cursor pagination is bounded and strictly after cursor', async () => {
  const f = fixture(); const p = await readAgentEventPage(f.db, 'r', 2, 2);
  assert.deepEqual(p.events.map((e: any) => e.seq), [3, 4]); assert.equal(p.nextCursor, 4); assert.equal(p.hasMore, true);
});
it('reconnect/reload uses persisted sequence without duplicating events or creating authority', async () => {
  const f = fixture(3, 'COMPLETED'); const p = await readAgentEventPage(f.db, 'r', 0, 2);
  const cursor = await resolveAgentEventCursor(f.db, 'r', `r:${p.nextCursor}`);
  const restored = await readAgentEventPage(f.db, 'r', cursor);
  assert.deepEqual(restored.events.map((e: any) => e.seq), [3]);
  assert.deepEqual(await readAgentEventPage(f.db, 'r', cursor), restored);
  assert.equal(f.events.length, 3); assert.equal(f.run.eventSeq, 3);
});
it('terminal watermark becomes complete only after all bounded pages', async () => {
  const f = fixture(3, 'COMPLETED');
  assert.equal((await readAgentEventPage(f.db, 'r', 0, 2)).replayComplete, false);
  const p = await readAgentEventPage(f.db, 'r', 2); assert.equal(p.terminalWatermark, 3); assert.equal(p.replayComplete, true);
});
it('running and paused runs cannot claim terminal replay completeness', async () => {
  for (const status of ['RUNNING', 'PAUSED', 'AWAITING_APPROVAL']) {
    const f = fixture(0, status); assert.equal((await readAgentEventPage(f.db, 'r')).replayComplete, false);
  }
});
it('rejects out-of-bounds cursors and page sizes', async () => {
  const f = fixture();
  for (const [cursor, limit] of [[-1, 1], [6, 1], [0, 129], [0, 0], [NaN, 1]]) await assert.rejects(readAgentEventPage(f.db, 'r', cursor, limit), /CURSOR_INVALID/);
});
it('foreign run cursors fail closed; legacy IDs resolve to sequence', async () => {
  const f = fixture(); assert.equal(await resolveAgentEventCursor(f.db, 'r', 'e2'), 3);
  await assert.rejects(resolveAgentEventCursor(f.db, 'other', 'e2'), /CURSOR_INVALID/);
  await assert.rejects(resolveAgentEventCursor(f.db, 'r', 'other:3'), /CURSOR_INVALID/);
});
it('missing persisted sequence or inconsistent watermark fails closed', async () => {
  const f = fixture(2, 'COMPLETED'); f.run.eventTerminalSeq = 1;
  await assert.rejects(readAgentEventPage(f.db, 'r'), /WATERMARK_INVALID/);
  f.run.eventTerminalSeq = 2; f.events.splice(0, 1);
  await assert.rejects(readAgentEventPage(f.db, 'r'), /SEQUENCE_GAP/);
});
it('SSE/transient frames are not inputs to the authoritative replay read model', async () => {
  const f = fixture(0); const transient = { type: 'stream-drained', data: { status: 'COMPLETED', seq: 99 } };
  assert.equal(transient.data.status, 'COMPLETED');
  const p = await readAgentEventPage(f.db, 'r'); assert.equal(p.watermark, 0); assert.equal(p.replayComplete, false); assert.deepEqual(p.events, []);
});
