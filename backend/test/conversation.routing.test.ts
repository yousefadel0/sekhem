// ConversationService routing tests
import assert from 'node:assert/strict';
import { requestsConversationExecution } from '../src/conversation/conversation-mode';
import { describe, it } from 'node:test';
import { ConversationService } from '../src/conversation/conversation.service';
import { ExecutionModeDetectorService } from '../src/agent-runtime/execution-mode-detector.service';

// Minimal mock Prisma with only needed methods
const mockPrisma = {
  $queryRawUnsafe: async () => [],
  $transaction: async (fn: any) => fn(mockPrisma),
  conversation: {
    findUnique: async ({ where }: any) => {
      if (where.id !== 'conv-1') return null;
      return { id: 'conv-1', userId: 'user-1', projectId: 'proj-1', project: { id: 'proj-1', organizationId: 'org-1' },
        metadata: { modeContext: { version: 1, mode: 'CHAT', organizationId: 'org-1', workspace: {
          workspaceId: 'fixture-workspace', bindingVersion: 1, runtimeId: 'fixture-runtime', runtimeFingerprint: 'fixture-fingerprint' } } } };
    },
    update: async () => ({})
  },
  conversationMessage: {
    findUnique: async () => null,
    findFirst: async () => null,
    upsert: async ({ create }: { create: object }) => create,
    create: async ({ data }: any) => ({ ...data, createdAt: new Date() }),
    findMany: async () => []
  },
  agentRun: { create: async ({ data }: any) => ({ ...data, id: 'run-1', status: 'QUEUED' }) }
} as any;

// Mock AgentRuntimeService with only the methods used in postMessage
const mockAgentRuntime = {
  executeChat: async () => ({ answer: 'Hello', modelId: 'GLM-5.2-Abliterated', providerId: 'provider-test' }),
  createRunTx: async (tx: any, claims: any, opts: any) => ({ id: 'run-1', status: 'QUEUED' }),
  scheduleRunExecution: () => {}
} as any;

const mockResourceAuthz = null;
const mockMemoryService = null;
const mockAttachmentService = null;
const mockAttachmentCapabilities = null;
const mockContextBuilder = null;

const detector = new ExecutionModeDetectorService();

function makeService() {
  const service = new ConversationService(
    mockPrisma,
    mockAgentRuntime,
    mockResourceAuthz,
    mockMemoryService,
    mockAttachmentService,
    mockAttachmentCapabilities,
    mockContextBuilder,
    detector
  );
  const binding = { workspaceId: 'fixture-workspace', version: 1, runtimeId: 'fixture-runtime', runtimeFingerprint: 'fixture-fingerprint',
    userId: 'user-1', projectId: 'proj-1', organizationId: 'org-1', displayName: 'Fixture', rootPath: 'D:\\Fixture', status: 'READY' };
  Reflect.set(service, 'runtimeWorkspaces', { getActiveBinding: async () => binding, visibility: async () => ({ binding, listing: null }) });
  return service;
}

describe('ConversationService postMessage routing', () => {
  for (const content of ['Look at this project.', 'Where is authentication implemented?']) it(`keeps engineering follow-up in the same conversation: ${content}`, async () => {
    const response: any = await makeService().postMessage('conv-1', { sub: 'user-1', role: 'PM', organizationId: 'org-1' } as any, { content });
    assert.equal(response.agentRunId, 'run-1'); assert.equal(response.conversationId, 'conv-1');
  });
  for (const content of ['Good morning', 'Hi', 'How are you?', 'Are you an agent?', 'What is BGP?', 'How do I run a service?', 'Explain how to create a project']) it(`ordinary conversation stays Chat: ${content}`, async () => {
    const response: any = await makeService().postMessage('conv-1', { sub: 'user-1', role: 'PM', organizationId: 'org-1' } as any, { content });
    assert.equal(response.agentRunId, undefined);
  });
  it('1. explicit triggerAgent true => execution', async () => {
    const svc = makeService();
    const resp: any = await svc.postMessage('conv-1', { sub: 'user-1', role: 'PM', organizationId: 'org-1' } as any, { content: 'any', triggerAgent: true });
    assert.ok(resp.agentRunId, 'Should contain agentRunId');
  });

  it('2. explicit chat true => normal chat', async () => {
    const svc = makeService();
    const resp: any = await svc.postMessage('conv-1', { sub: 'user-1', role: 'PM', organizationId: 'org-1' } as any, { content: 'hello', chat: true });
    assert.ok(!resp.agentRunId, 'Should not contain agentRunId');
  });

  it('3. casual "Hi" => normal chat', async () => {
    const svc = makeService();
    const resp: any = await svc.postMessage('conv-1', { sub: 'user-1', role: 'PM', organizationId: 'org-1' } as any, { content: 'Hi' });
    assert.ok(!resp.agentRunId, 'Should not contain agentRunId');
  });

  it('routes the MVP examples without client forcing flags', async () => {
    const svc = makeService();
    const claims = { sub: 'user-1', role: 'PM', organizationId: 'org-1' } as any;
    assert.ok(!('agentRunId' in await svc.postMessage('conv-1', claims, { content: 'Hello' })));
    const result: any = await svc.postMessage('conv-1', claims, { content: 'Analyze this project and inspect the authentication implementation.' });
    assert.equal(result.agentRunId, 'run-1');
    assert.equal(result.conversationId, 'conv-1');
    assert.ok(result.messageId);
  });

  it('5. execution "Inspect this workspace" => execution', async () => {
    const svc = makeService();
    const resp: any = await svc.postMessage('conv-1', { sub: 'user-1', role: 'PM', organizationId: 'org-1' } as any, { content: 'Inspect this workspace' });
    assert.ok(resp.agentRunId, 'Should contain agentRunId');
  });

  it('mutation routing is covered by the durable linked-conversation regressions', () => {
    assert.equal(requestsConversationExecution('Analyze the files in this workspace and fix the issue'), true);
  });
});
