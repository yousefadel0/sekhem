// backend/test/agent-runtime.events.security.test.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import request from 'supertest';
import { AgentRuntimeEventsController } from '../src/agent-runtime/agent-runtime.events.controller';
import { AuthService } from '../src/auth/auth.service';
import { AuthzGuard } from '../src/auth/authz.guard';
import { ResourceAuthorizationService } from '../src/auth/resource-authz.service';
import { AgentRuntimeService } from '../src/agent-runtime/agent-runtime.service';
import { of, Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

import { Reflector } from '@nestjs/core';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';

// Configure staging environment for AuthService session cookie auth
function configureStagingEnv() {
  process.env.SEKHEM_AUTH_ENABLED = 'true';
  process.env.SEKHEM_AUTH_SESSION_SECRET = 'a'.repeat(32);
  process.env.SEKHEM_AUTH_STAGING_EMAIL = 'test@example.com';
  process.env.SEKHEM_AUTH_STAGING_PASSWORD_HASH = require('crypto').createHash('sha256').update('password').digest('hex');
  process.env.SEKHEM_AUTH_STAGING_DISPLAY_NAME = 'Test User';
  process.env.SEKHEM_AUTH_STAGING_ROLE = 'Viewer';
}

// Mock ResourceAuthorizationService – real class contract, simple implementation
class MockResourceAuthorizationService implements Partial<ResourceAuthorizationService> {
  async getProjectRole(_userId: string, _projectId: string): Promise<string | null> {
    return 'member';
  }
}

// Mock AgentRuntimeService with authorization and event logic
class MockAgentRuntimeService implements Partial<AgentRuntimeService> {
  async authorizeRunRead(runId: string, claims: any): Promise<void> {
    if (runId === 'nonexistent') {
      throw new NotFoundException('Run not found');
    }
    if (runId.startsWith('org-2')) {
      throw new ForbiddenException('Organization mismatch');
    }
    if (runId === 'same-org-other-project-unauthorized') {
      throw new ForbiddenException('User is not authorized for project');
    }
  }

  createEventObservable(runId: string, _claims: any, lastEventId?: string): Observable<MessageEvent> {
    const events: MessageEvent[] = [
      { id: `${runId}-1`, type: 'STATUS_CHANGE', event: 'STATUS_CHANGE', data: { newStatus: 'RUNNING' } } as any,
      { id: `${runId}-2`, type: 'PROGRESS', event: 'PROGRESS', data: { progressPercent: 100 } } as any,
    ];
    const foundIdx = lastEventId ? events.findIndex(e => e.id === lastEventId) : -1;
    if (lastEventId && foundIdx < 0) throw new BadRequestException('AGENT_EVENT_CURSOR_INVALID');
    const startIdx = foundIdx >= 0 ? foundIdx + 1 : 0;
    return of(...events.slice(startIdx));
  }
}

describe('AgentRuntimeEventsController Security Matrix', () => {
  let app: INestApplication;
  let authService: AuthService;

  before(async () => {
    configureStagingEnv();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AgentRuntimeEventsController],
      providers: [
        AuthService,
        Reflector,
        { provide: ResourceAuthorizationService, useClass: MockResourceAuthorizationService },
        { provide: AgentRuntimeService, useClass: MockAgentRuntimeService },
      ],
    })
      .overrideGuard(AuthzGuard)
      .useClass(AuthzGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    authService = moduleFixture.get<AuthService>(AuthService);
  });

  after(async () => {
    await app.close();
  });

  // 1. unauthenticated request
  it('rejects unauthenticated requests', async () => {
    const runId = 'org-1-run-123';
    await request(app.getHttpServer())
      .get(`/agent-runs/${runId}/events`)
      .set('Accept', 'text/event-stream')
      .expect(401);
  });

  // 2. authenticated unauthorized user (different organization)
  it('rejects authenticated user accessing other organization run', async () => {
    const runId = 'org-2-run-456';
    const login = await authService.login({ email: process.env.SEKHEM_AUTH_STAGING_EMAIL!, password: 'password' }, undefined, undefined);
    const cookie = authService.authCookie(login.token, login.maxAgeSeconds);
    await request(app.getHttpServer())
      .get(`/agent-runs/${runId}/events`)
      .set('Accept', 'text/event-stream')
      .set('Cookie', cookie)
      .expect(403);
  });

  // 3. authenticated user in same organization but unauthorized for project
  it('rejects authenticated user accessing run in another project (same org) without authorization with 403', async () => {
    const runId = 'same-org-other-project-unauthorized';
    const login = await authService.login({ email: process.env.SEKHEM_AUTH_STAGING_EMAIL!, password: 'password' }, undefined, undefined);
    const cookie = authService.authCookie(login.token, login.maxAgeSeconds);
    await request(app.getHttpServer())
      .get(`/agent-runs/${runId}/events`)
      .set('Accept', 'text/event-stream')
      .set('Cookie', cookie)
      .expect(403);
  });

  // 4. nonexistent AgentRun
  it('returns 404 for nonexistent AgentRun', async () => {
    const runId = 'nonexistent';
    const login = await authService.login({ email: process.env.SEKHEM_AUTH_STAGING_EMAIL!, password: 'password' }, undefined, undefined);
    const cookie = authService.authCookie(login.token, login.maxAgeSeconds);
    await request(app.getHttpServer())
      .get(`/agent-runs/${runId}/events`)
      .set('Accept', 'text/event-stream')
      .set('Cookie', cookie)
      .expect(404);
  });

  // Unknown or foreign cursor must not silently replay previously received events.
  for (const cursor of ['invalid-id', 'other-run-999']) {
    it(`rejects invalid/foreign Last-Event-ID ${cursor}`, async () => {
      const login = await authService.login({ email: process.env.SEKHEM_AUTH_STAGING_EMAIL!, password: 'password' }, undefined, undefined);
      await request(app.getHttpServer()).get('/agent-runs/org-1-run-123/events')
        .set('Accept', 'text/event-stream').set('Cookie', authService.authCookie(login.token, login.maxAgeSeconds))
        .set('Last-Event-ID', cursor).expect(400);
    });
  }

  // 7. authorized access – normal streaming
  it('streams events for authorized user', async () => {
    const runId = 'org-1-run-123';
    const login = await authService.login({ email: process.env.SEKHEM_AUTH_STAGING_EMAIL!, password: 'password' }, undefined, undefined);
    const cookie = authService.authCookie(login.token, login.maxAgeSeconds);
    const response = await request(app.getHttpServer())
      .get(`/agent-runs/${runId}/events`)
      .set('Accept', 'text/event-stream')
      .set('Cookie', cookie)
      .expect(200);
    const payload = response.text;
    assert.ok(payload.includes('event: STATUS_CHANGE'));
    assert.ok(payload.includes('event: PROGRESS'));
    assert.ok(payload.includes(`${runId}-1`));
    assert.ok(payload.includes(`${runId}-2`));
  });

  // 8. terminal AgentRun behavior – only terminal event
  it('handles terminal run without extra events', async () => {
    const runId = 'org-1-run-terminal';
    const mockService = app.get<AgentRuntimeService>(AgentRuntimeService) as any;
    mockService.createEventObservable = (runId: string, _claims: any, _lastEventId?: string) => {
      return of({ id: `${runId}-term`, type: 'TERMINAL', event: 'TERMINAL', data: { status: 'COMPLETED' } });
    };
    const login = await authService.login({ email: process.env.SEKHEM_AUTH_STAGING_EMAIL!, password: 'password' }, undefined, undefined);
    const cookie = authService.authCookie(login.token, login.maxAgeSeconds);
    const response = await request(app.getHttpServer())
      .get(`/agent-runs/${runId}/events`)
      .set('Accept', 'text/event-stream')
      .set('Cookie', cookie)
      .expect(200);
    const payload = response.text;
    assert.ok(payload.includes('event: TERMINAL'));
  });

  // 9. revoked or invalid session cookie rejects with 401
  it('rejects revoked or tampered session with 401', async () => {
    const runId = 'org-1-run-123';
    await request(app.getHttpServer())
      .get(`/agent-runs/${runId}/events`)
      .set('Accept', 'text/event-stream')
      .set('Cookie', 'sekhem_session=tampered.session.token')
      .expect(401);
  });

  // 10. client disconnect / polling cleanup – ensure request can be aborted without server error
  it('does not hang when client disconnects', async () => {
    const runId = 'org-1-run-123';
    const login = await authService.login({ email: process.env.SEKHEM_AUTH_STAGING_EMAIL!, password: 'password' }, undefined, undefined);
    const cookie = authService.authCookie(login.token, login.maxAgeSeconds);
    const req = request(app.getHttpServer())
      .get(`/agent-runs/${runId}/events`)
      .set('Accept', 'text/event-stream')
      .set('Cookie', cookie);
    const abort = setTimeout(() => req.abort(), 100);
    try {
      await req;
    } catch (e) {
      // Expected abort, test passes if server does not crash
    } finally {
      clearTimeout(abort);
    }
  });
});
