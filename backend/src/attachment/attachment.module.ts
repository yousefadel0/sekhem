import { Module } from "@nestjs/common";
import { AttachmentService } from "./attachment.service";
import { AttachmentController } from "./attachment.controller";
import { LocalAttachmentStorageService } from "./storage/local-attachment-storage.service";
import { PdfParserService } from "./pdf-parser.service";
import { AuthService } from "../auth/auth.service";
import { AuthzGuard } from "../auth/authz.guard";
import { ResourceAuthorizationService } from "../auth/resource-authz.service";
import { ProjectAccessService } from "../auth/project-access.service";
import { DataAccessModule } from "../data-access/data-access.module";

@Module({
  imports: [DataAccessModule],
  controllers: [AttachmentController],
  providers: [
    AttachmentService,
    LocalAttachmentStorageService,
    PdfParserService,
    AuthService,
    AuthzGuard,
    ResourceAuthorizationService,
    ProjectAccessService
  ],
  exports: [AttachmentService, LocalAttachmentStorageService, PdfParserService]
})
export class AttachmentModule {}
