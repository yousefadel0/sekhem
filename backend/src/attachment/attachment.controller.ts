import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards
} from "@nestjs/common";
import type { Response } from "express";
import { response } from "../common/api-response";
import { AuthService } from "../auth/auth.service";
import { AuthzGuard } from "../auth/authz.guard";
import { AttachmentService } from "./attachment.service";
import type { SessionClaims } from "../auth/auth.dto";
import { ProjectAccessService } from "../auth/project-access.service";
import { PrismaService } from "../data-access/prisma.service";

@Controller("conversations/:conversationId/attachments")
@UseGuards(AuthzGuard)
export class AttachmentController {
  constructor(
    @Inject(AttachmentService) private readonly attachmentService: AttachmentService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProjectAccessService) private readonly projectAccess: ProjectAccessService
  ) {}

  @Post()
  async uploadAttachment(
    @Param("conversationId") conversationId: string,
    @Headers("cookie") cookieHeader: string | undefined,
    @Body() body: { fileName?: string; mimeType?: string; contentBase64?: string }
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);

    if (!body || !body.fileName || !body.mimeType || !body.contentBase64) {
      throw new BadRequestException("fileName, mimeType, and contentBase64 are required");
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(body.contentBase64, "base64");
    } catch {
      throw new BadRequestException("Invalid base64 payload");
    }

    await this.authorizeConversation(claims, conversationId, "UPDATE");
    return response(
      await this.attachmentService.uploadAttachment(claims.sub, conversationId, {
        fileName: body.fileName,
        mimeType: body.mimeType,
        buffer
      })
    );
  }

  @Get()
  async listAttachments(
    @Param("conversationId") conversationId: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    await this.authorizeConversation(claims, conversationId, "READ");
    return response(await this.attachmentService.listAttachmentsForConversation(claims.sub, conversationId));
  }

  @Get(":attachmentId")
  async getAttachment(
    @Param("attachmentId") attachmentId: string,
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("conversationId") conversationId: string
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    await this.authorizeConversation(claims, conversationId, "READ");
    const attachment = await this.attachmentService.getAttachment(claims.sub, attachmentId);
    if (attachment.conversationId !== conversationId) throw new NotFoundException("Attachment not found");
    return response(attachment);
  }

  @Get(":attachmentId/content")
  async getAttachmentContent(
    @Param("attachmentId") attachmentId: string,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res() res: Response,
    @Param("conversationId") conversationId: string
  ): Promise<void> {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    await this.authorizeConversation(claims, conversationId, "READ");
    const file = await this.attachmentService.getAttachmentBufferForConversation(claims.sub, conversationId, attachmentId);

    // Untrusted uploads are downloads, never active same-origin documents.
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.send(file.buffer);
  }

  private async authorizeConversation(claims: SessionClaims, conversationId: string, action: "READ" | "UPDATE"): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId }, select: { userId: true, projectId: true }
    });
    if (!conversation) throw new NotFoundException("Conversation not found");
    if (conversation.userId !== claims.sub) {
      throw new ForbiddenException("Cannot access attachments for a conversation belonging to another user");
    }
    // Same project/org policy used for conversation reads and message posting.
    await this.projectAccess.assert(claims, conversation.projectId, action);
  }
}
