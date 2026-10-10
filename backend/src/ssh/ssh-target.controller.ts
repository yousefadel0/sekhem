import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { response } from "../common/api-response";
import { SshTargetService } from "./ssh-target.service";

@Controller("projects/:projectId/ssh-targets")
export class SshTargetController {
  constructor(@Inject(SshTargetService) private readonly service: SshTargetService) {}
  @Get() async list(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string) {
    return response(await this.service.list(cookie, project));
  }
  @Post() async configure(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Body() body: unknown) {
    return response(await this.service.configure(cookie, project, body));
  }
  @Get(":id") async read(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Query("version") version?: string) {
    return response(await this.service.read(cookie, project, id, version === undefined ? undefined : Number(version)));
  }
  @Post(":id/connection-validations") async validate(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Body() body: unknown) {
    return response(await this.service.validate(cookie, project, id, body));
  }
}
