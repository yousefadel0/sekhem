import "reflect-metadata";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { ForbiddenException, NotFoundException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service";
import { AuthController } from "../src/auth/auth.controller";
import { ApiExceptionFilter } from "../src/common/api-exception.filter";
import { AuthzGuard, PROJECT_ID_PARAM_KEY } from "../src/auth/authz.guard";
import { AUTHZ_ROLES_KEY } from "../src/auth/authz.constants";
import { ProjectAccessService } from "../src/auth/project-access.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { PrismaService } from "../src/data-access/prisma.service";
import { AttachmentController } from "../src/attachment/attachment.controller";
import { AttachmentService } from "../src/attachment/attachment.service";
import { AttachmentModule } from "../src/attachment/attachment.module";
import type { AuthRoleDto, SessionClaims } from "../src/auth/auth.dto";

type SessionState = "active" | "revoked" | "expired" | "suspended" | "missing" | "lookup-error" | "missing-user" | "all-revoked";
const states: SessionState[] = ["active", "revoked", "expired", "suspended", "missing", "lookup-error", "missing-user", "all-revoked"];
const testSecret = "p0a-test-only-signing-secret-at-least-32-characters";
const upload = { fileName: "app.js", mimeType: "text/javascript", contentBase64: Buffer.from("// safe source\nexport const value = 1;\n").toString("base64") };

function fixture(state: SessionState = "active", options: {
  projectRole?: AuthRoleDto | null; role?: AuthRoleDto; projectOrg?: string; userOrg?: string;
  conversationOwner?: string; attachmentOwner?: string; attachmentConversation?: string;
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = { sub: "owner", sessionId: "session", email: "owner@example.test", displayName: "Owner",
    role: options.role ?? "PM", organizationId: "org", iat: now - 30, exp: now + 3600 };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const token = `${header}.${payload}.${createHmac("sha256", testSecret).update(`${header}.${payload}`).digest("base64url")}`;
  const cookie = `sekhem_session=${token}`;
  const effects = { conversations: 0, projects: 0, attachments: 0, reads: 0, writes: 0, sent: 0 };
  const attachment = { id: "attachment", userId: options.attachmentOwner ?? "owner", conversationId: options.attachmentConversation ?? "conversation",
    fileName: "app.js", mimeType: "text/javascript", fileSize: 15, category: "doc", storageKey: "opaque", extractedText: "// safe source",
    hasExtractedText: true, isScanned: false, createdAt: new Date() };
  let projectRole = options.projectRole === undefined ? "PM" : options.projectRole;
  const db = {
    user: { findUnique: async () => state === "missing-user" ? null : ({ id: "owner", status: state === "suspended" ? "suspended" : "active",
      organizationId: options.userOrg ?? "org", sessionRevokedAt: state === "all-revoked" ? new Date() : null }) },
    userSession: { findUnique: async () => {
      if (state === "lookup-error") throw new Error("Synthetic database failure: private connection details must not escape");
      return state === "missing" ? null : { userId: "owner", revokedAt: state === "revoked" ? new Date() : null,
        expiresAt: new Date(Date.now() + (state === "expired" ? -60_000 : 3_600_000)) };
    } },
    conversation: { findUnique: async ({ where }: any) => { effects.conversations++; return where.id === "conversation"
      ? { id: "conversation", userId: options.conversationOwner ?? "owner", projectId: "project" } : null; } },
    project: { findUnique: async () => { effects.projects++; return { id: "project", organizationId: options.projectOrg ?? "org" }; } },
    projectMember: { findUnique: async () => projectRole ? { role: projectRole } : null },
    conversationAttachment: {
      findUnique: async () => { effects.attachments++; return attachment; },
      findMany: async () => { effects.attachments++; return [attachment]; },
      create: async ({ data }: any) => { effects.writes++; return { ...attachment, ...data }; }
    }
  };
  const auth = new AuthService(db as never);
  auth.setEnvForTest({ SEKHEM_AUTH_DB_MODE: "true", SEKHEM_AUTH_SESSION_SECRET: testSecret });
  const resources = new ResourceAuthorizationService(db as never);
  const access = new ProjectAccessService(db as never, resources);
  const storage = { read: async () => { effects.reads++; return Buffer.from("// safe source"); }, write: async () => { effects.writes++; } };
  const service = new AttachmentService(db as never, storage as never);
  const controller = new AttachmentController(service, auth, db as never, access);
  const response = { setHeader: () => undefined, send: () => { effects.sent++; } };
  return { auth, claims, cookie, db, resources, access, service, controller, effects, response,
    revokeProject: () => { projectRole = null; } };
}

const endpoints = ["upload", "list", "metadata", "content"] as const;
type Endpoint = typeof endpoints[number];
async function call(f: ReturnType<typeof fixture>, endpoint: Endpoint, cookie = f.cookie) {
  switch (endpoint) {
    case "upload": return f.controller.uploadAttachment("conversation", cookie, upload);
    case "list": return f.controller.listAttachments("conversation", cookie);
    case "metadata": return f.controller.getAttachment("attachment", cookie, "conversation");
    case "content": return f.controller.getAttachmentContent("attachment", cookie, f.response as never, "conversation");
  }
}

function context(cookie: string, projectGuard = false): ExecutionContext {
  const handler = () => undefined;
  if (projectGuard) Reflect.defineMetadata(PROJECT_ID_PARAM_KEY, "projectId", handler);
  else Reflect.defineMetadata(AUTHZ_ROLES_KEY, ["PM"], handler);
  return { getHandler: () => handler, getClass: () => class TestController {}, switchToHttp: () => ({ getRequest: () => ({ headers: { cookie }, params: { projectId: "project" }, query: {} }) }) } as ExecutionContext;
}

describe("P0-A authoritative durable session validation", () => {
  for (const state of states) it(`valid signature + ${state} durable state => ${state === "active" ? "allowed" : "denied"}`, async () => {
    const f = fixture(state);
    assert.equal(f.auth.sessionClaims(f.cookie).sub, "owner", "Signature is valid independently of durable state");
    if (state === "active") assert.equal((await f.auth.validateDurableSession(f.cookie)).sub, "owner");
    else await assert.rejects(f.auth.validateDurableSession(f.cookie), (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.equal(error.getStatus(), 401);
      assert.doesNotMatch(error.message, /private connection|Synthetic database/);
      return true;
    });
  });
});

describe("P0-A2 session status requires authoritative durable validation", () => {
  for (const state of states) it(`GET /auth/session: valid signature + ${state} durable session`, async () => {
    const f = fixture(state);
    assert.equal(f.auth.sessionClaims(f.cookie).sub, f.claims.sub, "Signature is valid independently of durable state");
    let presentations = 0;
    const presentSession = f.auth.session.bind(f.auth);
    f.auth.session = cookie => { presentations++; return presentSession(cookie); };

    // Only the real auth controller/service are mounted; no application bootstrap,
    // live database, provider, or session creation is involved.
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: f.auth }]
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalFilters(new ApiExceptionFilter());
    try {
      await app.init();
      const result = await request(app.getHttpServer()).get("/api/auth/session")
        .set("Cookie", f.cookie).expect(state === "active" ? 200 : 401);
      if (state === "active") {
        assert.deepEqual(result.body.data, {
          authenticated: true,
          user: { id: f.claims.sub, email: f.claims.email, displayName: f.claims.displayName,
            role: f.claims.role, organizationId: f.claims.organizationId, sessionId: f.claims.sessionId },
          expiresAt: new Date(f.claims.exp * 1000).toISOString()
        });
        assert.deepEqual(result.body.errors, []);
      } else {
        assert.equal(result.body.data, null);
        assert.equal(result.body.errors[0].code, "UNAUTHORIZED");
        if (state === "lookup-error") assert.equal(result.body.errors[0].message, "Session validation unavailable");
      }
      assert.ok(Date.parse(result.body.meta.timestamp));
      assert.equal(result.headers["set-cookie"], undefined, "Status reads do not change the session cookie");
      assert.equal(presentations, state === "active" ? 1 : 0, "Durable rejection cannot reach signature-only presentation");
      const serialized = JSON.stringify(result.body);
      assert.doesNotMatch(serialized, /private connection|Synthetic database|tokenHash|sekhem_session=|stack/);
      assert.equal(serialized.includes(testSecret), false);
      assert.equal(serialized.includes(f.cookie.slice("sekhem_session=".length)), false);
      assert.deepEqual(f.effects, { conversations: 0, projects: 0, attachments: 0, reads: 0, writes: 0, sent: 0 });
    } finally { await app.close(); }
  });

  for (const cookie of [undefined, "sekhem_session=invalid"]) it(`session status rejects ${cookie ? "invalid" : "missing"} cookie`, async () => {
    const f = fixture();
    await assert.rejects(new AuthController(f.auth).session(cookie), UnauthorizedException);
  });
});

describe("P0-A AuthzGuard never recovers from durable rejection with signed claims", () => {
  for (const state of states) it(`guard ${state} state`, async () => {
    const f = fixture(state), guard = new AuthzGuard(f.auth, new Reflector(), f.resources);
    let signatureChecks = 0;
    const original = f.auth.sessionClaims.bind(f.auth);
    f.auth.sessionClaims = cookie => { signatureChecks++; return original(cookie); };
    for (const invoke of [() => guard.extractClaims(f.cookie), () => guard.canActivate(context(f.cookie))]) {
      signatureChecks = 0;
      if (state === "active") await invoke();
      else await assert.rejects(invoke(), UnauthorizedException);
      assert.equal(signatureChecks, 1, "The only signature check belongs to the authoritative validator");
    }
  });

  it("propagates the original durable rejection without calling a signature-only fallback", async () => {
    const denial = new ForbiddenException("Durable policy rejected the session");
    let fallbackCalls = 0;
    const guard = new AuthzGuard({ validateDurableSession: async () => { throw denial; },
      sessionClaims: () => { fallbackCalls++; return fixture().claims; } } as never, new Reflector());
    await assert.rejects(guard.extractClaims("cookie"), error => error === denial);
    assert.equal(fallbackCalls, 0);
  });

  it("rejects a signature-only service instead of treating it as an authenticated session", async () => {
    let fallbackCalls = 0;
    const guard = new AuthzGuard({ sessionClaims: () => { fallbackCalls++; return fixture().claims; } } as never, new Reflector());
    await assert.rejects(guard.extractClaims("cookie"), UnauthorizedException);
    assert.equal(fallbackCalls, 0);
  });

  for (const authorized of [true, false]) it(`preserves project guard decision: ${authorized}`, async () => {
    const f = fixture("active", { projectRole: authorized ? "PM" : null });
    const guard = new AuthzGuard(f.auth, new Reflector(), f.resources);
    if (authorized) assert.equal(await guard.canActivate(context(f.cookie, true)), true);
    else await assert.rejects(guard.canActivate(context(f.cookie, true)), ForbiddenException);
  });
});

describe("P0-A attachment endpoints use real durable and project authorization", () => {
  for (const endpoint of endpoints) {
    for (const state of states) it(`${endpoint}: ${state} session`, async () => {
      const f = fixture(state);
      if (state === "active") {
        await call(f, endpoint);
        assert.ok(f.effects.projects > 0, "Must run existing project authorization");
      } else {
        await assert.rejects(call(f, endpoint), UnauthorizedException);
        assert.deepEqual(f.effects, { conversations: 0, projects: 0, attachments: 0, reads: 0, writes: 0, sent: 0 });
      }
    });

    for (const [name, options] of [
      ["unauthorized project", { projectRole: null }],
      ["foreign organization", { projectOrg: "foreign-org" }],
      ["foreign organization even for Admin", { projectOrg: "foreign-org", role: "Admin" }],
      ["stale organization claim", { userOrg: "new-org" }],
      ["conversation ownership violation", { conversationOwner: "another-user" }]
    ] as const) it(`${endpoint}: rejects ${name} before attachment operations`, async () => {
      const f = fixture("active", options);
      await assert.rejects(call(f, endpoint), error => error instanceof ForbiddenException || error instanceof NotFoundException);
      assert.equal(f.effects.attachments, 0);
      assert.equal(f.effects.reads + f.effects.writes + f.effects.sent, 0);
    });

    it(`${endpoint}: rechecks revoked project membership with the same active session`, async () => {
      const f = fixture();
      await call(f, endpoint);
      f.revokeProject();
      const previous = { ...f.effects };
      await assert.rejects(call(f, endpoint), ForbiddenException);
      assert.equal(f.effects.attachments, previous.attachments);
      assert.equal(f.effects.reads + f.effects.writes + f.effects.sent, previous.reads + previous.writes + previous.sent);
    });

    it(`${endpoint}: rejects an invalid cryptographic signature`, async () => {
      const f = fixture();
      await assert.rejects(call(f, endpoint, "sekhem_session=forged"), UnauthorizedException);
      assert.equal(f.effects.conversations + f.effects.projects + f.effects.attachments, 0);
    });
  }

  for (const endpoint of ["metadata", "content"] as const) {
    it(`${endpoint}: preserves attachment ownership`, async () => {
      const f = fixture("active", { attachmentOwner: "another-user" });
      await assert.rejects(call(f, endpoint), error => error instanceof ForbiddenException || error instanceof NotFoundException);
      assert.equal(f.effects.reads + f.effects.sent, 0);
    });
    it(`${endpoint}: rejects an owned attachment addressed through a different conversation`, async () => {
      const f = fixture("active", { attachmentConversation: "other-conversation" });
      await assert.rejects(call(f, endpoint), error => error instanceof ForbiddenException || error instanceof NotFoundException);
      assert.equal(f.effects.reads + f.effects.sent, 0);
    });
  }

  it("all five project roles can read and upload owned attachments", async () => {
    for (const role of ["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"] as const) {
      const f = fixture("active", { role, projectRole: role });
      await call(f, "metadata");
      await call(f, "upload");
      assert.equal(f.effects.writes, 2, `${role}: storage write and attachment record`);
    }
  });

  it("production AttachmentModule wires durable validation and existing project authorization over HTTP", async () => {
    const f = fixture();
    const module = await Test.createTestingModule({ imports: [AttachmentModule] })
      .overrideProvider(PrismaService).useValue(f.db)
      .overrideProvider(AttachmentService).useValue(f.service)
      .compile();
    const auth = module.get(AuthService);
    auth.setEnvForTest({ SEKHEM_AUTH_DB_MODE: "true", SEKHEM_AUTH_SESSION_SECRET: testSecret });
    const app = module.createNestApplication();
    try {
      await app.init();
      await request(app.getHttpServer()).get("/conversations/conversation/attachments/attachment").set("Cookie", f.cookie).expect(200);
      f.revokeProject();
      await request(app.getHttpServer()).get("/conversations/conversation/attachments/attachment").set("Cookie", f.cookie).expect(403);
      f.db.userSession.findUnique = async () => { throw new Error("Synthetic DB lookup failure"); };
      await request(app.getHttpServer()).get("/conversations/conversation/attachments/attachment").set("Cookie", f.cookie).expect(401);
      assert.equal(f.effects.reads + f.effects.writes + f.effects.sent, 0);
    } finally { await app.close(); }
  });
});
