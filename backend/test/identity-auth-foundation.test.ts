import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { AuthService } from "../src/auth/auth.service";
import { ResourceAuthorizationService, type AuthSubject, type SecurableResource } from "../src/auth/resource-authz.service";
import { AuditService } from "../src/audit/audit.service";

describe("Identity and Authorization Foundation", () => {
  // ---------------------------------------------------------------------------
  // 1. Password Hashing (Self-Describing Scrypt:v1)
  // ---------------------------------------------------------------------------
  describe("1. Password Hashing (scrypt:v1)", () => {
    it("generates self-describing scrypt:v1 hashes with random salt and verifies constant-time", async () => {
      const auth = new AuthService();
      const password = "SuperSecretPassword123!";

      const hash = await auth.hashPassword(password);

      // Verify self-describing format: scrypt:v1:N=16384:r=8:p=1:<salt>:<hash>
      assert.match(hash, /^scrypt:v1:N=16384:r=8:p=1:[a-f0-9]{32}:[a-f0-9]{128}$/);

      // Verify correct password succeeds
      const valid = await auth.verifyScryptPassword(password, hash);
      assert.equal(valid, true);

      // Verify wrong password fails
      const invalid = await auth.verifyScryptPassword("WrongPassword!", hash);
      assert.equal(invalid, false);

      // Verify needsRehash
      assert.equal(auth.needsRehash(hash), false);
      assert.equal(auth.needsRehash("legacy_sha256_hash"), true);
      assert.equal(auth.needsRehash("scrypt:legacy_salt:legacy_hash"), true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Token Hashing (Raw JWT Never Persisted in DB)
  // ---------------------------------------------------------------------------
  describe("2. Token Hashing Security", () => {
    it("stores only a one-way sha256 hash of the session token in UserSession", async () => {
      let capturedSessionRecord: { tokenHash: string; userId: string } | null = null;
      const mockPrisma = {
        user: {
          findUnique: async () => ({
            id: "user-100",
            email: "alice@acme.test",
            displayName: "Alice Smith",
            passwordHash: await new AuthService().hashPassword("correct-pass"),
            status: "active",
            organizationId: "org-acme",
            roles: [{ role: { key: "PM" } }]
          })
        },
        userSession: {
          create: async ({ data }: { data: { tokenHash: string; userId: string } }) => {
            capturedSessionRecord = data;
            return data;
          },
          findUnique: async () => null
        }
      };

      const auth = new AuthService(mockPrisma as any);
      auth.setEnvForTest({
        SEKHEM_AUTH_ENABLED: "true",
        SEKHEM_AUTH_DB_MODE: "true",
        SEKHEM_AUTH_SESSION_SECRET: "test-secret-at-least-32-chars-long-12345"
      });

      const { token, session } = await auth.login({
        email: "alice@acme.test",
        password: "correct-pass"
      });

      assert.ok(token);
      assert.equal(session.user.id, "user-100");
      assert.ok(capturedSessionRecord, "UserSession must be created");

      // Verify tokenHash is one-way SHA-256 and NOT the raw token
      const expectedTokenHash = createHash("sha256").update(token).digest("hex");
      assert.equal(capturedSessionRecord!.tokenHash, expectedTokenHash);
      assert.notEqual(capturedSessionRecord!.tokenHash, token, "Raw token must NEVER be stored");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Session Revocation & Invalidation
  // ---------------------------------------------------------------------------
  describe("3. Session Revocation & Account Suspension", () => {
    it("immediately rejects valid tokens if user account is suspended", async () => {
      let userStatus = "active";
      let sessionRecord: Record<string, unknown> | null = null;
      const mockPrisma = {
        user: {
          findUnique: async () => ({
            id: "user-suspended-test",
            email: "bob@acme.test",
            displayName: "Bob Jones",
            passwordHash: await new AuthService().hashPassword("pass123"),
            status: userStatus,
            roles: [{ role: { key: "Viewer" } }]
          })
        },
        userSession: {
          create: async ({ data }: { data: Record<string, unknown> }) => { sessionRecord = data; return data; },
          findUnique: async () => sessionRecord
        }
      };

      const auth = new AuthService(mockPrisma as any);
      auth.setEnvForTest({
        SEKHEM_AUTH_ENABLED: "true",
        SEKHEM_AUTH_DB_MODE: "true",
        SEKHEM_AUTH_SESSION_SECRET: "test-secret-at-least-32-chars-long-12345"
      });

      const { token } = await auth.login({ email: "bob@acme.test", password: "pass123" });
      const cookie = auth.authCookie(token, 3600);

      // Active state: session valid
      const sessionBefore = await auth.validateDurableSession(cookie);
      assert.ok(sessionBefore.sub);

      // Suspend user in DB
      userStatus = "suspended";

      // Attempt session check with same valid JWT token -> MUST FAIL IMMEDIATELY
      await assert.rejects(
        async () => auth.validateDurableSession(cookie),
        /Account is suspended or deactivated/
      );
    });

    it("immediately invalidates existing sessions when user.sessionRevokedAt is updated", async () => {
      let sessionRevokedAt: Date | null = null;
      let sessionRecord: Record<string, unknown> | null = null;
      const mockPrisma = {
        user: {
          findUnique: async () => ({
            id: "user-revocation-test",
            email: "charlie@acme.test",
            displayName: "Charlie",
            passwordHash: await new AuthService().hashPassword("pass123"),
            status: "active",
            sessionRevokedAt,
            roles: [{ role: { key: "Viewer" } }]
          })
        },
        userSession: {
          create: async ({ data }: { data: Record<string, unknown> }) => { sessionRecord = data; return data; },
          findUnique: async () => sessionRecord
        }
      };

      const auth = new AuthService(mockPrisma as any);
      auth.setEnvForTest({
        SEKHEM_AUTH_ENABLED: "true",
        SEKHEM_AUTH_DB_MODE: "true",
        SEKHEM_AUTH_SESSION_SECRET: "test-secret-at-least-32-chars-long-12345"
      });

      const { token } = await auth.login({ email: "charlie@acme.test", password: "pass123" });
      const cookie = auth.authCookie(token, 3600);

      // Session is valid
      const sessionBefore = await auth.validateDurableSession(cookie);
      assert.ok(sessionBefore.sub);

      // Admin revokes all sessions by setting sessionRevokedAt to future/current timestamp
      sessionRevokedAt = new Date(Date.now() + 2000);

      // Must be rejected immediately
      await assert.rejects(
        async () => auth.validateDurableSession(cookie),
        /Session has been revoked/
      );
    });

    it("allows re-login after account reactivation", async () => {
      // Initialize user status as suspended to test reactivation flow
      let userStatus: string = "suspended";
      const mockPrisma = {
        user: {
          findUnique: async () => ({
            id: "user-reactivate-test",
            email: "david@acme.test",
            displayName: "David",
            passwordHash: await new AuthService().hashPassword("pass123"),
            status: userStatus,
            roles: [{ role: { key: "Viewer" } }]
          })
        },
        userSession: {
          create: async () => ({})
        }
      };
      const auth = new AuthService(mockPrisma as any);
      auth.setEnvForTest({
        SEKHEM_AUTH_ENABLED: "true",
        SEKHEM_AUTH_DB_MODE: "true",
        SEKHEM_AUTH_SESSION_SECRET: "test-secret-at-least-32-chars-long-12345"
      });

      // Login while suspended fails
      await assert.rejects(
        async () => auth.login({ email: "david@acme.test", password: "pass123" }),
        /Account is suspended or deactivated/
      );

      // Admin reactivates account
      userStatus = "active";

      // Re-login succeeds
      const result = await auth.login({ email: "david@acme.test", password: "pass123" });
      assert.equal(result.session.authenticated, true);
      assert.equal(result.session.user.id, "user-reactivate-test");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Centralized Resource Authorization & IDOR Protection
  // ---------------------------------------------------------------------------
  describe("4. Centralized Resource Authorization (authorize)", () => {
    const authz = new ResourceAuthorizationService();

    it("cross-organization IDOR: prevents user in Org A from accessing Org B resources, even if Admin in Org A", async () => {
      const orgAAdmin: AuthSubject = {
        userId: "admin-org-a",
        email: "admin@a.test",
        displayName: "Org A Admin",
        role: "Admin",
        organizationId: "org-a",
        isSystemAdmin: true
      };

      const orgBProject: SecurableResource = {
        resourceType: "Project",
        id: "project-in-org-b",
        organizationId: "org-b"
      };

      // Org A Admin CANNOT access Org B resource
      const allowed = await authz.authorize(orgAAdmin, "READ", orgBProject);
      assert.equal(allowed, false, "Cross-organization access must be denied");

      await assert.rejects(
        async () => authz.assertAuthorized(orgAAdmin, "READ", orgBProject),
        /You do not have permission/
      );
    });

    it("user privacy: prevents User A from accessing User B private resources", async () => {
      const userA: AuthSubject = {
        userId: "user-a",
        email: "a@test.com",
        displayName: "User A",
        role: "Viewer",
        organizationId: "org-a",
        isSystemAdmin: false
      };

      const userBPrivateConversation: SecurableResource = {
        resourceType: "Conversation",
        id: "conv-user-b-secret",
        organizationId: "org-a",
        ownerId: "user-b",
        visibility: "PRIVATE"
      };

      const allowed = await authz.authorize(userA, "READ", userBPrivateConversation);
      assert.equal(allowed, false, "User A must not access User B private conversation");
    });

    it("group isolation: prevents non-members from accessing group resources", async () => {
      const nonMember: AuthSubject = {
        userId: "user-non-member",
        email: "outside@test.com",
        displayName: "Outside User",
        role: "Viewer",
        organizationId: "org-a",
        isSystemAdmin: false
      };

      const mockPrisma = {
        groupMember: {
          findUnique: async () => null // Not a member
        }
      };
      const authzMock = new ResourceAuthorizationService(mockPrisma as any);

      const groupResource: SecurableResource = {
        resourceType: "Artifact",
        id: "art-group-secure",
        organizationId: "org-a",
        groupId: "group-security-ops",
        visibility: "GROUP"
      };

      const allowed = await authzMock.authorize(nonMember, "READ", groupResource);
      assert.equal(allowed, false, "Non-group members must be denied");
    });

    it("concurrent membership revocation: removing ProjectMember immediately removes access without JWT expiry", async () => {
      let isProjectMember = true;

      const mockPrisma = {
        project: { findUnique: async () => ({ personalOwnerId: null, organizationId: "org-a" }) },
        projectMember: {
          findUnique: async () => (isProjectMember ? { role: "Technical Reviewer" } : null)
        }
      };
      const authzMock = new ResourceAuthorizationService(mockPrisma as any);

      const subject: AuthSubject = {
        userId: "engineer-1",
        email: "eng@test.com",
        displayName: "Engineer",
        role: "Technical Reviewer",
        organizationId: "org-a",
        isSystemAdmin: false
      };

      const projectResource: SecurableResource = {
        resourceType: "Project",
        id: "project-core",
        projectId: "project-core",
        organizationId: "org-a"
      };

      // 1. Initially allowed
      const allowedBefore = await authzMock.authorize(subject, "READ", projectResource);
      assert.equal(allowedBefore, true);

      // 2. Admin revokes project membership in database
      isProjectMember = false;

      // 3. Next authorize call immediately fails without waiting for any JWT expiry
      const allowedAfter = await authzMock.authorize(subject, "READ", projectResource);
      assert.equal(allowedAfter, false, "Revocation in durable state must take effect immediately");
    });

    it("admin safety gates: Admin cannot bypass dangerous operations or mandatory approvals", async () => {
      const adminSubject: AuthSubject = {
        userId: "admin-1",
        email: "admin@test.com",
        displayName: "Admin User",
        role: "Admin",
        organizationId: "org-a",
        isSystemAdmin: true
      };

      const dangerousDeployment: SecurableResource = {
        resourceType: "AgentRun",
        id: "run-prod-deploy",
        userId: adminSubject.userId,
        organizationId: "org-a",
        isDangerousOperation: true
      };

      const unapprovedTool: SecurableResource = {
        resourceType: "AgentRun",
        id: "run-unapproved-tool",
        userId: adminSubject.userId,
        organizationId: "org-a",
        requiresApproval: true
      };

      // Admin execution on dangerous operation MUST be denied
      const allowedDangerous = await authz.authorize(adminSubject, "EXECUTE", dangerousDeployment);
      assert.equal(allowedDangerous, false, "Admin must not bypass dangerous operation policy");

      // Admin execution on unapproved tool MUST be denied
      const allowedUnapproved = await authz.authorize(adminSubject, "EXECUTE", unapprovedTool);
      assert.equal(allowedUnapproved, false, "Admin must not bypass approval requirement");

      // Admin can inspect their own run; dangerous execution still requires approval.
      const allowedRead = await authz.authorize(adminSubject, "READ", dangerousDeployment);
      assert.equal(allowedRead, true, "Admin can inspect dangerous run");
    });

    it("authorizes discrete actions: STEER, CANCEL, APPROVE", async () => {
      const mockPrisma = {
        project: { findUnique: async () => ({ personalOwnerId: null, organizationId: "org-a" }) },
        projectMember: {
          findUnique: async () => ({ role: "Technical Reviewer" })
        }
      };
      const authzMock = new ResourceAuthorizationService(mockPrisma as any);

      const reviewerSubject: AuthSubject = {
        userId: "reviewer-1",
        email: "rev@test.com",
        displayName: "Reviewer",
        role: "Technical Reviewer",
        organizationId: "org-a",
        isSystemAdmin: false
      };

      const runResource: SecurableResource = {
        resourceType: "AgentRun",
        id: "run-42",
        visibility: "PROJECT",
        projectId: "project-1",
        organizationId: "org-a",
        requiredRole: "Technical Reviewer"
      };

      // Technical Reviewer can STEER and APPROVE
      assert.equal(await authzMock.authorize(reviewerSubject, "STEER", runResource), true);
      assert.equal(await authzMock.authorize(reviewerSubject, "APPROVE", runResource), true);

      // Network (legacy Viewer) can STEER as a verified project member
      const viewerSubject: AuthSubject = {
        ...reviewerSubject,
        userId: "viewer-1",
        role: "Viewer"
      };
      const mockPrismaViewer = {
        project: { findUnique: async () => ({ personalOwnerId: null, organizationId: "org-a" }) },
        projectMember: {
          findUnique: async () => ({ role: "Viewer" })
        }
      };
      const authzViewer = new ResourceAuthorizationService(mockPrismaViewer as any);
      assert.equal(await authzViewer.authorize(viewerSubject, "STEER", runResource), true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Server-Derived Audit Logging
  // ---------------------------------------------------------------------------
  describe("5. Audit Actor Derivation & Secret Stripping", () => {
    it("derives audit actor from verified session claims and redacts sensitive parameters", async () => {
      const auth = new AuthService();
      auth.setEnvForTest({
        SEKHEM_AUTH_ENABLED: "true",
        SEKHEM_AUTH_STAGING_EMAIL: "auditor@sekhem.test",
        SEKHEM_AUTH_STAGING_PASSWORD_HASH: createHash("sha256").update("password123").digest("hex"),
        SEKHEM_AUTH_SESSION_SECRET: "test-secret-at-least-32-chars-long-12345",
        SEKHEM_AUTH_STAGING_ROLE: "Admin"
      });

      const audit = new AuditService(auth);

      const { token } = await auth.login({ email: "auditor@sekhem.test", password: "password123" });
      const cookie = auth.authCookie(token, 3600);

      const record = await audit.recordSecurityEvent(cookie, {
        action: "TEST_MUTATION",
        resourceType: "Project",
        resourceId: "project-100",
        details: {
          password: "plain-secret-password",
          apiToken: "secret-token-12345",
          safeSetting: "enabled"
        }
      });

      // Derived actor matches session
      assert.equal(record.actorEmail, "auditor@sekhem.test");
      assert.equal(record.actorRole, "Admin");
      assert.ok(record.sessionId);

      // Sensitive fields must be redacted
      assert.equal(record.details.password, "[REDACTED]");
      assert.equal(record.details.apiToken, "[REDACTED]");
      assert.equal(record.details.safeSetting, "enabled");
    });
  });
});
