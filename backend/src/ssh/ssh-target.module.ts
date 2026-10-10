import { Module } from "@nestjs/common";
import { DataAccessModule } from "../data-access/data-access.module";
import { AuthService } from "../auth/auth.service";
import { ResourceAuthorizationService } from "../auth/resource-authz.service";
import { SshTargetService } from "./ssh-target.service";
import { SshTargetController } from "./ssh-target.controller";
import { SshCredentialResolver, SshConnectionService } from "./ssh-connection.service";

@Module({ imports: [DataAccessModule], controllers: [SshTargetController],
  providers: [AuthService, ResourceAuthorizationService, SshTargetService, SshCredentialResolver, SshConnectionService] })
export class SshTargetModule {}
