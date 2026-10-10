require('reflect-metadata');
const { AgentRuntimeService } = require('../src/agent-runtime/agent-runtime.service.ts');
const { SkillRegistryService } = require('../src/agent-runtime/skills/skill-registry.service.ts');
if (process.env.SEKHEM_ADMIN_DB_VERIFY !== '1') throw new Error('EXPLICIT_ADMIN_DATABASE_VERIFICATION_REQUIRED');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { AdminService } = require('../src/admin/admin.service.ts');
const { AuthService } = require('../src/auth/auth.service.ts');
const { AuditService } = require('../src/audit/audit.service.ts');
const { ResourceAuthorizationService } = require('../src/auth/resource-authz.service.ts');
const { ProjectAccessService } = require('../src/auth/project-access.service.ts');
const { ConversationService } = require('../src/conversation/conversation.service.ts');
const { ConversationController } = require('../src/conversation/conversation.controller.ts');
const { AdminController } = require('../src/admin/admin.controller.ts');
const { AuthzGuard } = require('../src/auth/authz.guard.ts');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const text = line.trim(), separator = text.indexOf('=');
  if (separator > 0 && !text.startsWith('#') && !process.env[text.slice(0, separator).trim()]) process.env[text.slice(0, separator).trim()] = text.slice(separator + 1).trim();
}
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/sekhem_product_dev') throw new Error('LOCAL_DEVELOPMENT_DATABASE_REQUIRED');
const db = new PrismaClient(), suffix = randomUUID(), orgId = `admin_test_${suffix}`, rollback = new Error('EXPECTED_TEST_ROLLBACK');
const evidence = { checkedAt: new Date().toISOString(), database: 'sekhem_product_dev', mode: 'real PostgreSQL; all fixtures rolled back', checks: [] };
(async () => {
  const identity = await db.$queryRawUnsafe('SELECT current_database() AS name');
  assert.equal(identity[0].name, 'sekhem_product_dev');
  try {
    await db.$transaction(async tx => {
      // Uncommitted fixtures are invisible to the running application's other connections.
      await tx.organization.create({ data: { id: orgId, slug: orgId, name: 'Admin verification fixture' } });
      const adapter = new Proxy(tx, { get: (target, key) => key === '$transaction' ? work => work(tx) : Reflect.get(target, key) });
      const auth = new AuthService(adapter);
      auth.setEnvForTest({ NODE_ENV: 'development', SEKHEM_AUTH_DB_MODE: 'true', SEKHEM_AUTH_SESSION_SECRET: randomBytes(32).toString('hex') });
      const audit = new AuditService(auth, adapter), admin = new AdminService(auth, audit, adapter), resources = new ResourceAuthorizationService(adapter);
      const password = randomBytes(24).toString('base64url'), fixtureId = `admin_fixture_${suffix}`;
      const adminRole = await tx.role.findUnique({ where: { key: 'Admin' } }); assert.ok(adminRole);
      await tx.user.create({ data: { id: fixtureId, organizationId: orgId, email: `${fixtureId}@example.test`, displayName: 'Fixture Admin', passwordHash: await auth.hashPassword(password) } });
      await tx.userRole.create({ data: { userId: fixtureId, roleId: adminRole.id } });
      const actorLogin = await auth.login({ email: `${fixtureId}@example.test`, password });
      const actor = await auth.validateDurableSession(auth.authCookie(actorLogin.token, actorLogin.maxAgeSeconds));
      const a = await admin.createUser({ email: `alpha_${suffix}@example.test`, displayName: 'Alpha', password, role: 'Viewer' }, actor);
      const b = await admin.createUser({ email: `beta_${suffix}@example.test`, displayName: 'Beta', password, role: 'Viewer' }, actor);
      assert.equal(await tx.userRole.count({ where: { userId: { in: [a.id, b.id] } } }), 2);
      assert.equal((await admin.listUsers(actor)).length, 3);
      evidence.checks.push('Two accounts and their roles persisted inside transaction; list scoped to fixture organization');
      const loginA = await auth.login({ email: a.email, password }), cookieA = auth.authCookie(loginA.token, loginA.maxAgeSeconds);
      const loginB = await auth.login({ email: b.email, password }), cookieB = auth.authCookie(loginB.token, loginB.maxAgeSeconds);
      const subjectA = await auth.validateDurableSession(cookieA), subjectB = await auth.validateDurableSession(cookieB);
      assert.notEqual(subjectA.sub, subjectB.sub);
      evidence.checks.push('Both accounts authenticate through real password hashing, session persistence and durable validation');
      const project = await tx.project.create({ data: { id: `project_${suffix}`, slug: `project_${suffix}`, name: 'Fixture', customerFacingName: 'Fixture', status: 'active', phase: 'test', platform: 'test', organizationId: orgId } });
      await admin.addProjectMember(project.id, { userId: a.id, role: 'Viewer' }, actor);
      await admin.addProjectMember(project.id, { userId: b.id, role: 'Viewer' }, actor);
      const conversationA = await tx.conversation.create({ data: { projectId: project.id, userId: a.id, title: 'Private Alpha' } });
      const conversationB = await tx.conversation.create({ data: { projectId: project.id, userId: b.id, title: 'Private Beta' } });
      const modelFixture = { askAssistant: async () => ({ status: 'REAL_PROVIDER', answer: 'ROLE_CHAT_FIXTURE_OK', correlationId: 'fixture' }) };
      const registry = new SkillRegistryService(modelFixture, {}, {});
      const agents = new AgentRuntimeService(registry, resources, audit, adapter);
      const scheduled = [];
      agents.scheduleRunExecution = (id, claims) => scheduled.push({ id, userId: claims.sub });
      const conversations = new ConversationService(adapter, agents, resources, undefined, undefined, undefined, undefined, undefined, new ProjectAccessService(adapter, resources));
      const module = await Test.createTestingModule({ controllers: [AdminController, ConversationController], providers: [AuthzGuard,
        { provide: AdminService, useValue: admin }, { provide: ConversationService, useValue: conversations },
        { provide: AuthService, useValue: auth }, { provide: ResourceAuthorizationService, useValue: resources }] }).compile();
      const app = module.createNestApplication();
      try {
        await app.init();
        const adminCookie = auth.authCookie(actorLogin.token, actorLogin.maxAgeSeconds);
        await request(app.getHttpServer()).get('/admin/users').set('Cookie', cookieA).expect(403);
        await request(app.getHttpServer()).get(`/conversations/${conversationA.id}`).set('Cookie', cookieA).expect(200);
        await request(app.getHttpServer()).get(`/conversations/${conversationB.id}`).set('Cookie', cookieA).expect(404);
        await request(app.getHttpServer()).get(`/conversations/${conversationA.id}`).set('Cookie', cookieB).expect(404);
        await request(app.getHttpServer()).get(`/conversations/${conversationB.id}`).set('Cookie', adminCookie).expect(404);
        const list = await request(app.getHttpServer()).get(`/conversations?projectId=${project.id}`).set('Cookie', cookieA).expect(200);
        assert.equal(list.body.data.length, 1); assert.equal(list.body.data[0].id, conversationA.id);
        for (const [role, label] of [['PM', 'AI'], ['Security Reviewer', 'Security'], ['Technical Reviewer', 'Software'], ['Admin', 'Admin'], ['Viewer', 'Network']]) {
          const user = await admin.createUser({ email: `role_${label.toLowerCase()}_${suffix}@example.test`, displayName: label, password, role }, actor);
          await admin.addProjectMember(project.id, { userId: user.id, role }, actor);
          const login = await auth.login({ email: user.email, password });
          const cookie = auth.authCookie(login.token, login.maxAgeSeconds);
          const claims = await auth.validateDurableSession(cookie);
          assert.equal(claims.role, role);
          const visible = await new ProjectAccessService(adapter, resources).visibleIds(claims);
          assert.ok(visible.includes(project.id));
          const own = await request(app.getHttpServer()).post('/conversations').set('Cookie', cookie).send({ projectId: project.id, title: `Role ${label} fixture` }).expect(201);
          const conversationId = own.body.data.id;
          const chat = await request(app.getHttpServer()).post(`/conversations/${conversationId}/messages`).set('Cookie', cookie).send({ content: 'Hello, reply briefly.', chat: true }).expect(201);
          assert.equal(chat.body.data.content, 'ROLE_CHAT_FIXTURE_OK');
          assert.equal(await tx.conversationMessage.count({ where: { conversationId } }), 2);
          const run = await request(app.getHttpServer()).post(`/conversations/${conversationId}/messages`).set('Cookie', cookie).send({ content: 'Generate technical memo for project architecture', triggerAgent: true }).expect(201);
          assert.equal(run.body.data.status, 'QUEUED');
          const savedRun = await tx.agentRun.findUnique({ where: { id: run.body.data.agentRunId } });
          assert.equal(savedRun.userId, user.id);
          assert.ok(scheduled.some(row => row.id === savedRun.id && row.userId === user.id));
          await request(app.getHttpServer()).get('/admin/users').set('Cookie', cookie).expect(role === 'Admin' ? 200 : 403);
          await request(app.getHttpServer()).get(`/conversations/${conversationB.id}`).set('Cookie', cookie).expect(404);
          evidence.checks.push({ role: label, login: 'PASS', project: 'PASS', chatHttpPersistence: 'PASS', agentHttpQueuePersistence: 'PASS', adminControl: role === 'Admin' ? 'ALLOW_200' : 'DENY_403', otherUserChat: 'DENY_404' });
        }
        evidence.modelExecution = 'STUBBED: deterministic chat fixture; Agent scheduling observed but no background model/tool execution';
        evidence.checks.push('Real HTTP controllers plus PostgreSQL isolate two users in the same project; Admin cannot read their conversations; Viewer cannot enter admin routes');
      } finally { await app.close(); }
      assert.equal(await resources.authorize({ userId: actor.sub, role: actor.role, organizationId: orgId, email: actor.email, displayName: actor.displayName, isSystemAdmin: true }, 'READ', { resourceType: 'Conversation', id: 'fixture-private', userId: b.id, organizationId: orgId }), false);
      await assert.rejects(admin.listUsers(actor, 'outside-fixture'));
      evidence.checks.push('Private content authorization rejects Admin; cross-organization list rejects');
      await admin.updateUser(a.id, { role: 'Admin' }, actor);
      assert.equal(await tx.userRole.count({ where: { userId: a.id } }), 1);
      await assert.rejects(auth.validateDurableSession(cookieA));
      const newLogin = await auth.login({ email: a.email, password });
      assert.equal(newLogin.session.user.role, 'Admin');
      assert.equal((await auth.validateDurableSession(auth.authCookie(newLogin.token, newLogin.maxAgeSeconds))).role, 'Admin');
      evidence.checks.push('Role replacement persisted; previous session revoked; fresh login derives the new role');
      await admin.updateUser(b.id, { status: 'suspended' }, actor);
      await assert.rejects(auth.validateDurableSession(cookieB));
      await assert.rejects(auth.login({ email: b.email, password }));
      evidence.checks.push('Suspension rejects existing session and new login');
      const group = await admin.createGroup({ name: 'Fixture group', slug: `group_${suffix}` }, actor);
      await admin.addGroupMember(group.id, { userId: a.id }, actor);
      assert.equal((await admin.listGroups(actor))[0].members[0].userId, a.id);
      const history = await admin.listAudit(actor);
      assert.ok(history.some(event => event.action === 'USER_CREATE'));
      assert.ok(history.some(event => event.action === 'GROUP_MEMBER_ADD'));
      assert.ok(history.every(event => !('metadata' in event) && !('details' in event)));
      evidence.checks.push('Group membership and scoped audit persisted; audit projection excludes raw metadata');
      throw rollback;
    }, { timeout: 60000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await db.organization.count({ where: { id: orgId } }), 0);
  assert.equal(await db.user.count({ where: { organizationId: orgId } }), 0);
  evidence.fixtureRollbackVerified = true;
  fs.writeFileSync('.runtime-state/roles-postgres-evidence.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
})().catch(error => { console.error(error.code ?? error.name); process.exitCode = 1; }).finally(() => db.$disconnect());
