import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { AgentRuntimeService } from '../src/agent-runtime/agent-runtime.service';
import type { SessionClaims } from '../src/auth/auth.dto';

describe('AgentRuntimeService.createEventObservable Keyset & Lifecycle tests', () => {
  const mockClaims: SessionClaims = {
    sub: 'user-1',
    sessionId: 'sess-1',
    email: 'user@example.test',
    displayName: 'Test User',
    role: 'PM',
    organizationId: 'org-1',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  function createMockRuntimeService(initialData: {
    runs?: Record<string, { status: string; projectId: string; userId: string }>;
    events?: Array<{ id: string; agentRunId: string; timestamp: Date; seq?: number; eventType: string; payload?: any }>;
    resourceAuthzHandler?: (subject: any, action: string, resource: any) => Promise<void>;
  }) {
    const runs = new Map<string, any>(Object.entries(initialData.runs ?? {}));
    const counters = new Map<string, number>();
    const events = (initialData.events ?? []).map(e => { const seq = e.seq ?? (counters.get(e.agentRunId) ?? 0) + 1; counters.set(e.agentRunId, seq); return { ...e, seq }; });

    const mockPrisma: any = {
      agentRun: {
        findUnique: async ({ where }: any) => {
          const run = runs.get(where.id);
          const eventSeq = events.filter(e => e.agentRunId === where.id).length;
          return run ? { id: where.id, ...run, eventSeq, eventTerminalSeq: ["COMPLETED", "FAILED", "CANCELLED"].includes(run.status) ? eventSeq : null } : null;
        },
      },
      agentRunEvent: {
        findUnique: async ({ where }: any) => {
          const ev = events.find((e) => e.id === where.id);
          return ev ? { ...ev } : null;
        },
        findMany: async ({ where, orderBy, take }: any) => {
          let list = events.filter((e) => e.agentRunId === where.agentRunId);
          list = list.filter(e => e.seq > where.seq.gt && e.seq <= where.seq.lte);
          list.sort((a, b) => a.seq - b.seq);
          return list.slice(0, take ?? list.length).map((e) => ({ ...e }));
        },
      },
    };

    mockPrisma.$transaction = async (callback: any) => callback(mockPrisma);

    const mockResourceAuthz: any = {
      assertAuthorized: initialData.resourceAuthzHandler ?? (async () => {}),
    };

    // Instantiate AgentRuntimeService with mockResourceAuthz (2nd) and mockPrisma (4th)
    const service = new AgentRuntimeService(
      null as any,
      mockResourceAuthz,
      null as any,
      mockPrisma,
    );

    return {
      service,
      events,
      runs,
      mockResourceAuthz,
    };
  }

  // 1. replay after Last-Event-ID
  it('replays events strictly after Last-Event-ID', async () => {
    const runId = 'run-replay-1';
    const t1 = new Date(1000);
    const t2 = new Date(2000);
    const t3 = new Date(3000);

    const { service } = createMockRuntimeService({
      runs: { [runId]: { status: 'RUNNING', projectId: 'p1', userId: 'u1' } },
      events: [
        { id: 'ev_1', agentRunId: runId, timestamp: t1, eventType: 'STATUS_CHANGE', payload: { newStatus: 'RUNNING' } },
        { id: 'ev_2', agentRunId: runId, timestamp: t2, eventType: 'THOUGHT', payload: { thought: 'thinking' } },
        { id: 'ev_3', agentRunId: runId, timestamp: t3, eventType: 'PROGRESS', payload: { progress: 50 } },
      ],
    });

    const observable = service.createEventObservable(runId, mockClaims, 'ev_1', {
      pollIntervalMs: 50,
      keepaliveIntervalMs: 500,
    });

    const emitted: any[] = [];
    await new Promise<void>((resolve) => {
      const sub = observable.subscribe({
        next: (ev) => {
          emitted.push(ev);
          if (emitted.length === 2) {
            sub.unsubscribe();
            resolve();
          }
        },
      });
    });

    assert.equal(emitted.length, 2);
    assert.equal(emitted[0].id, `${runId}:2`);
    assert.equal(emitted[1].id, `${runId}:3`);
  });

  // 2. same-millisecond events deterministic ordering and tie-breaking
  it('orders by persisted sequence despite identical timestamps and reverse lexical IDs', async () => {
    const runId = 'run-same-ms';
    const sameTime = new Date(5000);

    const { service } = createMockRuntimeService({
      runs: { [runId]: { status: 'RUNNING', projectId: 'p1', userId: 'u1' } },
      events: [
        { id: 'ev_ms_b', seq: 2, agentRunId: runId, timestamp: sameTime, eventType: 'LOG', payload: { msg: 'second' } },
        { id: 'ev_ms_a', seq: 1, agentRunId: runId, timestamp: sameTime, eventType: 'LOG', payload: { msg: 'first' } },
        { id: 'ev_ms_c', seq: 3, agentRunId: runId, timestamp: sameTime, eventType: 'LOG', payload: { msg: 'third' } },
      ],
    });

    // Replay after ev_ms_a (which is alphabetically first at same timestamp)
    const observable = service.createEventObservable(runId, mockClaims, 'ev_ms_a', {
      pollIntervalMs: 50,
      keepaliveIntervalMs: 500,
    });

    const emitted: any[] = [];
    await new Promise<void>((resolve) => {
      const sub = observable.subscribe({
        next: (ev) => {
          emitted.push(ev);
          if (emitted.length === 2) {
            sub.unsubscribe();
            resolve();
          }
        },
      });
    });

    assert.equal(emitted.length, 2);
    assert.equal(emitted[0].id, `${runId}:2`);
    assert.equal(emitted[1].id, `${runId}:3`);
  });

  for (const lastEventId of ['missing', 'other:1']) {
    it(`rejects unknown or foreign replay cursor ${lastEventId}`, async () => {
      const { service } = createMockRuntimeService({ runs: { target: { status: 'RUNNING', projectId: 'p', userId: 'u' } } });
      await assert.rejects(new Promise<void>((resolve, reject) => service.createEventObservable('target', mockClaims, lastEventId).subscribe({ complete: resolve, error: reject })), /AGENT_EVENT_CURSOR_INVALID/);
    });
  }

  // 5. terminal final drain + subscriber completion
  it('performs final drain on terminal status and completes the observable', async () => {
    const runId = 'run-terminal-drain';
    const { service, events, runs } = createMockRuntimeService({
      runs: { [runId]: { status: 'RUNNING', projectId: 'p1', userId: 'u1' } },
      events: [
        { id: 'ev_1', agentRunId: runId, timestamp: new Date(1000), eventType: 'PLANNING' },
      ],
    });

    const observable = service.createEventObservable(runId, mockClaims, undefined, {
      pollIntervalMs: 30,
      keepaliveIntervalMs: 500,
    });

    const emitted: any[] = [];
    let completed = false;

    await new Promise<void>((resolve) => {
      observable.subscribe({
        next: (ev) => {
          emitted.push(ev);
          if (ev.id === `${runId}:1`) {
            // Concurrently commit a trailing event AND update status to COMPLETED
            events.push({
              id: 'ev_terminal_summary', seq: 2,
              agentRunId: runId,
              timestamp: new Date(2000),
              eventType: 'STATUS_CHANGE',
              payload: { newStatus: 'COMPLETED' },
            });
            runs.set(runId, { status: 'COMPLETED', projectId: 'p1', userId: 'u1' });
          }
        },
        complete: () => {
          completed = true;
          resolve();
        },
      });
    });

    assert.equal(completed, true, 'Observable should have completed');
    assert.equal(emitted.length, 3, 'Initial, trailing and explicit stream drain');
    assert.equal(emitted[0].id, `${runId}:1`);
    assert.equal(emitted[1].id, `${runId}:2`);
    assert.equal(emitted[2].type, 'stream-drained');
  });

  it('bounds terminal replay pages without dropping events', async () => {
    const runId = 'paged-terminal';
    const events = Array.from({ length: 300 }, (_, i) => ({ id: `event-${String(i).padStart(4, '0')}`, agentRunId: runId, timestamp: new Date(1000), eventType: 'PROGRESS' }));
    const { service } = createMockRuntimeService({ runs: { [runId]: { status: 'COMPLETED', projectId: 'p1', userId: 'u1' } }, events });
    const received: string[] = [];
    await new Promise<void>((resolve, reject) => service.createEventObservable(runId, mockClaims, undefined, { pollIntervalMs: 10, keepaliveIntervalMs: 500 }).subscribe({
      next: e => { if ((e as any).id) received.push((e as any).id); }, complete: resolve, error: reject
    }));
    assert.deepEqual(received, events.map((e, i) => `${runId}:${i + 1}`));
  });

  // 6. idle keepalive emits ping
  it('emits keepalive ping on idle threshold', async () => {
    const runId = 'run-idle-ping';
    const { service } = createMockRuntimeService({
      runs: { [runId]: { status: 'RUNNING', projectId: 'p1', userId: 'u1' } },
      events: [],
    });

    // pollIntervalMs: 20ms, keepaliveIntervalMs: 40ms -> idleThreshold = 2 polls
    const observable = service.createEventObservable(runId, mockClaims, undefined, {
      pollIntervalMs: 20,
      keepaliveIntervalMs: 40,
    });

    const emitted: any[] = [];
    await new Promise<void>((resolve) => {
      const sub = observable.subscribe({
        next: (ev) => {
          emitted.push(ev);
          if (ev.type === 'ping') {
            sub.unsubscribe();
            resolve();
          }
        },
      });
    });

    assert.ok(emitted.length >= 1);
    assert.equal(emitted[0].type, 'ping');
    assert.equal(emitted[0].data.authoritative, false);
    assert.equal(emitted[0].id, undefined);
    assert.ok(emitted[0].data?.timestamp);
  });

  // 7. authorizeRunRead authorization checks
  describe('AgentRuntimeService.authorizeRunRead authorization matrix', () => {
    it('throws NotFoundException (404) for nonexistent AgentRun', async () => {
      const { service } = createMockRuntimeService({ runs: {} });
      await assert.rejects(
        async () => {
          await service.authorizeRunRead('nonexistent-run', mockClaims);
        },
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.ok(err.message.includes('not found'));
          return true;
        }
      );
    });

    it('throws ForbiddenException (403) when run belongs to different project in same org and user is unauthorized', async () => {
      let capturedSecurableResource: any = null;
      const runId = 'run-diff-project';
      const targetProjectId = 'project-restricted-xyz';

      const { service } = createMockRuntimeService({
        runs: {
          [runId]: { status: 'RUNNING', projectId: targetProjectId, userId: 'other-user' },
        },
        resourceAuthzHandler: async (_subject, _action, resource) => {
          capturedSecurableResource = resource;
          if (resource.projectId === targetProjectId) {
            throw new ForbiddenException(`User is not authorized for project '${resource.projectId}'`);
          }
        },
      });

      await assert.rejects(
        async () => {
          await service.authorizeRunRead(runId, mockClaims);
        },
        (err: any) => {
          assert.ok(err instanceof ForbiddenException);
          assert.ok(err.message.includes(targetProjectId));
          return true;
        }
      );

      // Verify that authorizeRunRead actually retrieved the real projectId from DB and passed it to assertAuthorized
      assert.ok(capturedSecurableResource !== null);
      assert.equal(capturedSecurableResource.resourceType, 'AgentRun');
      assert.equal(capturedSecurableResource.id, runId);
      assert.equal(capturedSecurableResource.projectId, targetProjectId);
      assert.equal(capturedSecurableResource.organizationId, mockClaims.organizationId);
    });

    it('succeeds for authorized project member', async () => {
      let authorizedCalled = false;
      const runId = 'run-allowed-project';
      const allowedProjectId = 'project-allowed-123';

      const { service } = createMockRuntimeService({
        runs: {
          [runId]: { status: 'RUNNING', projectId: allowedProjectId, userId: 'other-user' },
        },
        resourceAuthzHandler: async (_subject, action, resource) => {
          authorizedCalled = true;
          assert.equal(action, 'READ');
          assert.equal(resource.projectId, allowedProjectId);
        },
      });

      await service.authorizeRunRead(runId, mockClaims);
      assert.equal(authorizedCalled, true);
    });
  });
});
