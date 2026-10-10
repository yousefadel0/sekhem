import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AdminService } from "../src/admin/admin.service";
import { AdminController } from "../src/admin/admin.controller";
import { AuthService } from "../src/auth/auth.service";
import { AuditService } from "../src/audit/audit.service";
import { AuthzGuard } from "../src/auth/authz.guard";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import type { SessionClaims } from "../src/auth/auth.dto";
const request = require("supertest");

const claims: SessionClaims = { sub: "admin-a", organizationId: "org-a", role: "Admin", sessionId: "admin-session",
  email: "admin@example.test", displayName: "Admin", exp: Math.floor(Date.now() / 1000) + 3600 };
function fixture() {
  let state: any = { users: [{ id: "admin-a", organizationId: "org-a", status: "active" }, { id: "user-a", organizationId: "org-a", status: "active" },
    { id: "user-b", organizationId: "org-b", status: "active" }], roles: [{ id: "role-admin", key: "Admin" }, { id: "role-viewer", key: "Viewer" }],
    userRoles: [{ userId: "user-a", roleId: "role-admin" }], sessions: [{ userId: "user-a", revokedAt: null }], audit: [], members: [] };
  let failRole = false, failAudit = false;
  const matches = (row: any, where: any) => Object.entries(where ?? {}).every(([k, v]) => row[k] === v);
  const selected = (row: any, select: any) => select ? Object.fromEntries(Object.keys(select).filter(k => select[k]).map(k => [k, row[k]])) : structuredClone(row);
  const db: any = {
    user: {
      findFirst: async ({ where }: any) => state.users.find((u: any) => matches(u, where)) ?? null,
      findMany: async ({ where, select }: any) => state.users.filter((u: any) => matches(u, where)).map((u: any) => selected(u, select)),
      create: async ({ data, select }: any) => { state.users.push(data); return selected(data, select); },
      update: async ({ where, data, select }: any) => { const row = state.users.find((u: any) => matches(u, where)); assert.ok(row); Object.assign(row, data); return selected(row, select); }
    },
    role: { findUnique: async ({ where }: any) => state.roles.find((r: any) => matches(r, where)) ?? null },
    userRole: { create: async ({ data }: any) => { if (failRole) throw new Error("role write failed"); state.userRoles.push(data); return data; },
      deleteMany: async ({ where }: any) => { state.userRoles = state.userRoles.filter((r: any) => !matches(r, where)); } },
    userSession: { updateMany: async ({ where, data }: any) => { for (const s of state.sessions) if (matches(s, where)) Object.assign(s, data); } },
    project: { findFirst: async ({ where }: any) => matches({ id: "project-a", organizationId: "org-a" }, where) ? { id: "project-a", organizationId: "org-a" } : null },
    group: { findFirst: async ({ where }: any) => matches({ id: "group-a", organizationId: "org-a" }, where) ? { id: "group-a", organizationId: "org-a" } : null },
    projectMember: { findMany: async () => [], upsert: async ({ create }: any) => { state.members.push(create); return create; }, deleteMany: async () => {} },
    groupMember: { upsert: async ({ create }: any) => { state.members.push(create); return create; }, deleteMany: async () => {} },
    $transaction: async (work: any) => { const before = structuredClone(state); try { return await work(db); } catch (e) { state = before; throw e; } }
  };
  const auth: any = { hashPassword: async (password: string) => new AuthService().hashPassword(password),
    validateDurableSession: async (cookie: string) => { if (cookie === "admin") return claims; if (cookie === "viewer") return { ...claims, role: "Viewer" }; throw new UnauthorizedException(); } };
  const audit: any = { recordWithClaimsTx: async (_tx: any, _claims: any, input: any) => { if (failAudit) throw new Error("audit write failed"); state.audit.push(input); },
    recordWithClaims: async (_claims: any, input: any) => { state.audit.push(input); } };
  return { db, auth, audit, service: new AdminService(auth, audit, db), state: () => state,
    failRole: () => { failRole = true; }, failAudit: () => { failAudit = true; } };
}
const create = { email: " New@Example.test ", displayName: " New User ", password: "test-password-only", role: "Viewer" };

test("account creation persists normalized identity and role atomically without returning secrets", async () => {
  const h = fixture(), user = await h.service.createUser(create, claims);
  assert.equal(user.email, "new@example.test"); assert.equal(user.organizationId, "org-a");
  assert.equal(h.state().userRoles.at(-1).userId, user.id);
  assert.ok(h.state().users.at(-1).passwordHash); assert.doesNotMatch(JSON.stringify(user), /password|hash|test-password/);
  assert.equal(h.state().audit.at(-1).action, "USER_CREATE");
});
for (const failure of ["role", "audit"] as const) test(`${failure} write failure rolls back the account and all dependent changes`, async () => {
  const h = fixture(), before = structuredClone(h.state()); failure === "role" ? h.failRole() : h.failAudit();
  await assert.rejects(h.service.createUser(create, claims), /write failed/); assert.deepEqual(h.state(), before);
});
test("unknown role fails before creating an account", async () => {
  const h = fixture(), before = structuredClone(h.state());
  await assert.rejects(h.service.createUser({ ...create, role: "CTO" }, claims), /ADMIN_ROLE_INVALID/);
  assert.deepEqual(h.state(), before);
});
test("duplicate records return a conflict without exposing Prisma details or reporting success", async () => {
  const h = fixture(), before = structuredClone(h.state());
  h.db.user.create = async () => { throw Object.assign(new Error("private Prisma connection details"), { code: "P2002" }); };
  await assert.rejects(h.service.createUser(create, claims), (error: any) => {
    assert.equal(error.getStatus(), 409); assert.equal(error.message, "ADMIN_DUPLICATE_RECORD"); return true;
  });
  assert.deepEqual(h.state(), before);
});
test("role changes replace the role and revoke old sessions in the same transaction", async () => {
  const h = fixture(); await h.service.updateUser("user-a", { role: "Viewer" }, claims);
  assert.deepEqual(h.state().userRoles, [{ userId: "user-a", roleId: "role-viewer" }]);
  assert.ok(h.state().sessions[0].revokedAt); assert.ok(h.state().users[1].sessionRevokedAt);
  assert.equal(h.state().audit.at(-1).details.role, "Viewer");
});
test("suspension revokes sessions and audit failure restores both account and sessions", async () => {
  const h = fixture(), before = structuredClone(h.state()); h.failAudit();
  await assert.rejects(h.service.updateUser("user-a", { status: "suspended" }, claims)); assert.deepEqual(h.state(), before);
  const success = fixture(); await success.service.updateUser("user-a", { status: "suspended" }, claims);
  assert.equal(success.state().users[1].status, "suspended"); assert.ok(success.state().sessions[0].revokedAt);
});
test("organization-scoped lists and mutations reject cross-organization identifiers", async () => {
  const h = fixture(); assert.deepEqual((await h.service.listUsers(claims)).map((u: any) => u.id), ["admin-a", "user-a"]);
  await assert.rejects(h.service.listUsers(claims, "org-b"));
  await assert.rejects(h.service.createUser({ ...create, organizationId: "org-b" }, claims));
  await assert.rejects(h.service.updateUser("user-b", { status: "suspended" }, claims));
  await assert.rejects(h.service.updateUser("user-a", { organizationId: "org-b" }, claims));
  await assert.rejects(h.service.addProjectMember("project-a", { userId: "user-b" }, claims));
  await assert.rejects(h.service.addGroupMember("group-a", { userId: "user-b" }, claims));
  assert.deepEqual(h.state().members, []);
});
test("non-admin and organization-less actors cannot use admin service directly; self-lockout is rejected", async () => {
  const h = fixture();
  await assert.rejects(h.service.listUsers({ ...claims, role: "Viewer" }));
  await assert.rejects(h.service.listUsers({ ...claims, organizationId: undefined }));
  await assert.rejects(h.service.updateUser(claims.sub, { role: "Viewer" }, claims), /SELF_LOCKOUT/);
  await assert.rejects(h.service.updateUser(claims.sub, { status: "suspended" }, claims), /SELF_LOCKOUT/);
});
test("real HTTP admin class role guard rejects unauthenticated and Viewer requests", async () => {
  const h = fixture(), module = await Test.createTestingModule({ controllers: [AdminController], providers: [AuthzGuard,
    { provide: AdminService, useValue: h.service }, { provide: AuthService, useValue: h.auth }, { provide: AuditService, useValue: h.audit }] }).compile();
  const app = module.createNestApplication();
  try { await app.init();
    await request(app.getHttpServer()).get("/admin/users").expect(401);
    await request(app.getHttpServer()).get("/admin/users").set("Cookie", "viewer").expect(403);
    const result = await request(app.getHttpServer()).get("/admin/users").set("Cookie", "admin").expect(200);
    assert.deepEqual(result.body.data.map((u: any) => u.id), ["admin-a", "user-a"]);
    await request(app.getHttpServer()).get("/admin/users?organizationId=org-b").set("Cookie", "admin").expect(403);
    await request(app.getHttpServer()).patch("/admin/users/user-b").set("Cookie", "admin").send({ status: "suspended" }).expect(404);
  } finally { await app.close(); }
});
test("Admin cannot read or control another user's private content; default chat/run filters remain owner-only", async () => {
  const service = new ResourceAuthorizationService(), subject = { userId: claims.sub, email: claims.email, displayName: claims.displayName,
    role: claims.role, organizationId: claims.organizationId, isSystemAdmin: true };
  for (const resourceType of ["Conversation", "AgentRun"] as const) {
    for (const action of ["READ", "UPDATE", "DELETE", "STEER", "CANCEL", "APPROVE"] as const) {
      assert.equal(await service.authorize(subject, action, { resourceType, id: "private", userId: "user-a", organizationId: "org-a" }), false);
    }
    assert.deepEqual(await service.buildDatabaseScopeFilter(subject, resourceType), { userId: claims.sub });
  }
  assert.equal(await service.authorize(subject, "READ", { resourceType: "Artifact", id: "private", ownerId: "user-a", visibility: "PRIVATE" }), false);
  assert.equal(await service.authorize(subject, "READ", { resourceType: "Conversation", id: "own", userId: claims.sub, visibility: "PRIVATE" }), true);
  assert.equal(await service.authorize(subject, "EXECUTE", { resourceType: "AgentRun", id: "own", userId: claims.sub, requiresApproval: true }), false);
});
