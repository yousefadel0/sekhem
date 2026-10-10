import assert from 'node:assert/strict';
import { it } from 'node:test';
import { AgentRuntimeEventsController } from '../src/agent-runtime/agent-runtime.events.controller';
import { AgentRuntimeService } from '../src/agent-runtime/agent-runtime.service';

it('JSON replay authenticates with durable session and forwards bounded cursor parameters', async () => {
  const claims = { sub: 'actor' }; let received: any;
  const controller = new AgentRuntimeEventsController({ replayEvents: async (...args: any[]) => { received = args; return { nextCursor: 9, terminalWatermark: 9, replayComplete: true }; } } as any,
    { validateDurableSession: async (cookie: any) => { assert.equal(cookie, 'session'); return claims; } } as any);
  assert.equal((await controller.replayEvents('run', 'session', '8', '1')).replayComplete, true);
  assert.deepEqual(received, ['run', claims, 8, 1]);
});
it('JSON replay cannot bypass invalid durable session', async () => {
  let accessed = false;
  const controller = new AgentRuntimeEventsController({ replayEvents: async () => { accessed = true; } } as any,
    { validateDurableSession: async () => { throw new Error('SESSION_INVALID'); } } as any);
  await assert.rejects(controller.replayEvents('run', 'invalid'), /SESSION_INVALID/); assert.equal(accessed, false);
});
it('JSON replay authorizes run/project before accessing persisted event pages', async () => {
  let accessed = false;
  const service = new AgentRuntimeService(null as any, null as any, null as any,
    { $transaction: async () => { accessed = true; } } as any);
  service.authorizeRunRead = async () => { throw new Error('RUN_FORBIDDEN'); };
  await assert.rejects(service.replayEvents('other', {} as any), /RUN_FORBIDDEN/); assert.equal(accessed, false);
});
