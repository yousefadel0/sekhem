import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { AttachmentController } from "../src/attachment/attachment.controller";
import { AttachmentService } from "../src/attachment/attachment.service";
import type { SessionClaims } from "../src/auth/auth.dto";
import { ProjectAccessService } from "../src/auth/project-access.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";

describe("AttachmentController session cookie auth", () => {
  const userAClaims: SessionClaims = {
    sub: "user_A",
    sessionId: "sess_A",
    email: "a@example.test",
    displayName: "User A",
    role: "PM",
    organizationId: "org-acme",
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  const userBClaims: SessionClaims = {
    ...userAClaims,
    sub: "user_B",
    sessionId: "sess_B",
    email: "b@example.test",
    displayName: "User B"
  };

  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const uploadBody = {
    fileName: "photo.png",
    mimeType: "image/png",
    contentBase64: pngBytes.toString("base64")
  };

  function fakeAuthService() {
    return {
      async validateDurableSession(cookieHeader: string | undefined): Promise<SessionClaims> {
        if (!cookieHeader) {
          throw new UnauthorizedException("Authentication required");
        }
        if (cookieHeader.includes("sekhem_session=user_A")) {
          return userAClaims;
        }
        if (cookieHeader.includes("sekhem_session=user_B")) {
          return userBClaims;
        }
        throw new UnauthorizedException("Authentication required");
      }
    };
  }

  function fakePrisma(ownerUserId: string) {
    return {
      user: { findUnique: async () => ({ status: "active", organizationId: "org-acme" }) },
      project: { findUnique: async () => ({ id: "project", organizationId: "org-acme" }) },
      projectMember: { findUnique: async () => ({ role: "PM" }) },
      conversation: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          if (where.id === "conv_userA") {
            return { id: "conv_userA", userId: ownerUserId, projectId: "project" };
          }
          return null;
        }
      },
      conversationAttachment: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "att_1",
          conversationId: data.conversationId,
          userId: data.userId,
          fileName: data.fileName,
          mimeType: data.mimeType,
          fileSize: data.fileSize,
          category: data.category,
          hasExtractedText: data.hasExtractedText,
          isScanned: data.isScanned,
          createdAt: new Date("2026-01-01T00:00:00.000Z")
        })
      }
    };
  }

  function controllerForOwner(ownerUserId = "user_A") {
    const storage = { write: async () => undefined };
    const db = fakePrisma(ownerUserId);
    const attachmentService = new AttachmentService(db as never, storage as never);
    const access = new ProjectAccessService(db as never, new ResourceAuthorizationService(db as never));
    return new AttachmentController(attachmentService, fakeAuthService() as never, db as never, access);
  }

  it("authenticated attachment request succeeds and wraps { data, meta, errors }", async () => {
    const controller = controllerForOwner("user_A");
    const result = await controller.uploadAttachment("conv_userA", "sekhem_session=user_A", uploadBody);

    assert.equal(result.errors.length, 0);
    assert.ok(result.meta.timestamp);
    assert.equal(result.data?.id, "att_1");
    assert.equal(result.data?.userId, "user_A");
    assert.equal(result.data?.conversationId, "conv_userA");
    assert.equal(result.data?.fileName, "photo.png");
  });

  it("rejects a missing session cookie", async () => {
    const controller = controllerForOwner("user_A");
    await assert.rejects(
      async () => {
        await controller.uploadAttachment("conv_userA", undefined, uploadBody);
      },
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.equal((err as UnauthorizedException).message, "Authentication required");
        return true;
      }
    );
  });

  it("rejects an invalid session cookie", async () => {
    const controller = controllerForOwner("user_A");
    await assert.rejects(
      async () => {
        await controller.uploadAttachment("conv_userA", "sekhem_session=forged", uploadBody);
      },
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.equal((err as UnauthorizedException).message, "Authentication required");
        return true;
      }
    );
  });

  it("enforces conversation ownership using claims.sub, not a client userId", async () => {
    const controller = controllerForOwner("user_A");
    await assert.rejects(
      async () => {
        await controller.uploadAttachment("conv_userA", "sekhem_session=user_B", {
          ...uploadBody,
          userId: "user_A"
        } as typeof uploadBody & { userId: string });
      },
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        assert.match(
          (err as ForbiddenException).message,
          /Cannot access attachments for a conversation belonging to another user/
        );
        return true;
      }
    );
  });
});
