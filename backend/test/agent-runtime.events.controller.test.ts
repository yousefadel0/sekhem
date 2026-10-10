import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { of, Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

// Mock AuthService
class MockAuthService {
  async sessionClaims(_cookieHeader?: string) {
    return {
      sub: 'user-1',
      sessionId: 'sess-1',
      email: 'user1@example.com',
      displayName: 'User One',
      role: 'PM',
      organizationId: 'org-1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any;
  }
}

// Mock AgentRuntimeService
class MockAgentRuntimeService {
  async authorizeRunRead(_runId: string, _claims: any): Promise<void> {}
  createEventObservable(runId: string, _claims: any, _lastEventId?: string): Observable<MessageEvent> {
    const events: MessageEvent[] = [
      { id: `${runId}-1`, type: 'STATUS_CHANGE', event: 'STATUS_CHANGE', data: { newStatus: 'RUNNING' } } as any,
      { id: `${runId}-2`, type: 'PROGRESS', event: 'PROGRESS', data: { progressPercent: 100 } } as any,
    ];
    return of(...events);
  }
}

// Mock AuthzGuard that always allows
import { CanActivate, ExecutionContext } from '@nestjs/common';
class MockAuthzGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean { return true; }
}

import { AgentRuntimeEventsController } from '../src/agent-runtime/agent-runtime.events.controller';
import { AuthService } from '../src/auth/auth.service';
import { AgentRuntimeService } from '../src/agent-runtime/agent-runtime.service';

describe('AgentRuntimeEventsController (SSE) deterministic tests', () => {
  let app: INestApplication;
  before(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AgentRuntimeEventsController],
      providers: [
        { provide: AuthService, useClass: MockAuthService },
        { provide: AgentRuntimeService, useClass: MockAgentRuntimeService },
      ],
    })
      .overrideGuard(MockAuthzGuard)
      .useClass(MockAuthzGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  after(async () => { await app.close(); });

  it('should stream deterministic events for a given run id', async () => {
    const runId = 'run-test-123';
    const response = await request(app.getHttpServer())
      .get(`/agent-runs/${runId}/events`)
      .set('Accept', 'text/event-stream')
      .expect('Content-Type', /text\/event-stream/)
      .expect(200);
    const payload = response.text;
    assert.ok(payload.includes('event: STATUS_CHANGE'));
    assert.ok(payload.includes('event: PROGRESS'));
    assert.ok(payload.includes(`${runId}-1`));
    assert.ok(payload.includes(`${runId}-2`));
  });

  it('should forward Last-Event-ID header to createEventObservable', async () => {
    let capturedLastEventId: string | undefined;
    const mockRuntime = app.get<AgentRuntimeService>(AgentRuntimeService) as any;
    const originalCreate = mockRuntime.createEventObservable;
    mockRuntime.createEventObservable = (runId: string, claims: any, lastEventId?: string) => {
      capturedLastEventId = lastEventId;
      return of({ id: `${runId}-replayed`, type: 'LOG', event: 'LOG', data: { replayed: true } });
    };

    try {
      const runId = 'run-cursor-123';
      const response = await request(app.getHttpServer())
        .get(`/agent-runs/${runId}/events`)
        .set('Accept', 'text/event-stream')
        .set('Last-Event-ID', 'cursor-ev-999')
        .expect('Content-Type', /text\/event-stream/)
        .expect(200);

      assert.equal(capturedLastEventId, 'cursor-ev-999');
      assert.ok(response.text.includes('id: run-cursor-123-replayed'));
      assert.ok(response.text.includes('event: LOG'));
    } finally {
      mockRuntime.createEventObservable = originalCreate;
    }
  });
});
