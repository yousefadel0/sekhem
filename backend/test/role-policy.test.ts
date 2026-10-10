import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { roleCanUse } from "../src/auth/role-policy";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { SkillRegistryService } from "../src/agent-runtime/skills/skill-registry.service";

const roles = ["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"] as const;
for (const role of roles) test(`${role}: equal project actions and skills; no admin privilege inheritance`, async () => {
  const auth = new ResourceAuthorizationService({ project: { findUnique: async () => ({ personalOwnerId: null, organizationId: "org" }) }, projectMember: { findUnique: async () => ({ role }) } } as any);
  const subject = { userId: "owner", email: "owner@example.test", displayName: "Owner", role, organizationId: "org", isSystemAdmin: role === "Admin" };
  const project = { resourceType: "Project" as const, id: "project", projectId: "project", organizationId: "org" };
  for (const action of ["READ", "CREATE", "UPDATE", "DELETE", "STEER", "CANCEL", "APPROVE", "EXECUTE"] as const) assert.equal(await auth.authorize(subject, action, project), true, action);
  assert.equal(roleCanUse(role, ["Admin"]), role === "Admin");
  assert.equal(await auth.authorize(subject, "ADMIN", project), role === "Admin");
  assert.equal(await auth.authorize(subject, "EXECUTE", { ...project, requiresApproval: true }), false);
  assert.equal(await auth.authorize(subject, "READ", { ...project, organizationId: "other" }), false);
  assert.equal(await auth.authorize(subject, "READ", { ...project, resourceType: "Conversation", visibility: "PRIVATE", ownerId: "other" }), false);
  const registry = new SkillRegistryService({} as any, {} as any, {} as any);
  const adminRegistry = new SkillRegistryService({} as any, {} as any, {} as any);
  assert.deepEqual(registry.getAvailableSkills(role).map(s => s.id), adminRegistry.getAvailableSkills("Admin").map(s => s.id));
});
test("unknown roles and revoked membership fail closed", async () => {
  assert.equal(roleCanUse("unknown", ["PM"]), false);
  const auth = new ResourceAuthorizationService({ project: { findUnique: async () => ({ personalOwnerId: null }) }, projectMember: { findUnique: async () => null } } as any);
  assert.equal(await auth.authorize({ userId: "owner", email: "x", displayName: "X", role: "Viewer", isSystemAdmin: false }, "CREATE", { resourceType: "Project", id: "p", projectId: "p" }), false);
});
