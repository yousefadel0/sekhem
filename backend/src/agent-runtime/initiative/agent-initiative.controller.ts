import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { response } from "../../common/api-response";
import { AuthService } from "../../auth/auth.service";
import { AuthzGuard } from "../../auth/authz.guard";
import type { CreateAgentInitiativeDto, CreateAgentInitiativeVersionDto, DecideAgentInitiativeVersionDto, TransitionAgentInitiativeDto, UpdateAgentInitiativeTaskDto } from "./agent-initiative.dto";
import { AgentInitiativeService } from "./agent-initiative.service";

@Controller("agent-initiatives")
@UseGuards(AuthzGuard)
export class AgentInitiativeController {
  constructor(@Inject(AgentInitiativeService) private readonly initiatives: AgentInitiativeService, @Inject(AuthService) private readonly auth: AuthService) {}
  @Post() async create(@Headers("cookie") cookie: string | undefined, @Body() body: CreateAgentInitiativeDto) { return response(await this.initiatives.create(await this.auth.sessionClaims(cookie), body)); }
  @Get() async resolve(@Headers("cookie") cookie: string | undefined, @Query("projectId") projectId: string, @Query("q") q: string) { return response(await this.initiatives.resolve(await this.auth.sessionClaims(cookie), projectId, q)); }
  @Get(":id") async get(@Headers("cookie") cookie: string | undefined, @Param("id") id: string) { return response(await this.initiatives.get(await this.auth.sessionClaims(cookie), id)); }
  @Patch(":id") async transition(@Headers("cookie") cookie: string | undefined, @Param("id") id: string, @Body() body: TransitionAgentInitiativeDto) { return response(await this.initiatives.transition(await this.auth.sessionClaims(cookie), id, body.status, body.notes)); }
  @Post(":id/versions") async version(@Headers("cookie") cookie: string | undefined, @Param("id") id: string, @Body() body: CreateAgentInitiativeVersionDto) { return response(await this.initiatives.createVersion(await this.auth.sessionClaims(cookie), id, body)); }
  @Get(":id/versions/:version") async getVersion(@Headers("cookie") cookie: string | undefined, @Param("id") id: string, @Param("version") version: string) { return response(await this.initiatives.getVersion(await this.auth.sessionClaims(cookie), id, Number(version))); }
  @Post(":id/versions/:version/select") async selectVersion(@Headers("cookie") cookie: string | undefined, @Param("id") id: string, @Param("version") version: string, @Body() body: DecideAgentInitiativeVersionDto) { return response(await this.initiatives.selectApprovedVersion(await this.auth.sessionClaims(cookie), id, Number(version), body?.notes)); }
  @Post(":id/versions/:version/approve") async approve(@Headers("cookie") cookie: string | undefined, @Param("id") id: string, @Param("version") version: string, @Body() body: DecideAgentInitiativeVersionDto) { return response(await this.initiatives.decide(await this.auth.sessionClaims(cookie), id, Number(version), "APPROVE", body?.notes)); }
  @Post(":id/versions/:version/reject") async reject(@Headers("cookie") cookie: string | undefined, @Param("id") id: string, @Param("version") version: string, @Body() body: DecideAgentInitiativeVersionDto) { return response(await this.initiatives.decide(await this.auth.sessionClaims(cookie), id, Number(version), "REJECT", body?.notes)); }
  @Get(":id/resume") async resume(@Headers("cookie") cookie: string | undefined, @Param("id") id: string) { return response(await this.initiatives.resume(await this.auth.sessionClaims(cookie), id)); }
  @Patch("tasks/:taskId") async task(@Headers("cookie") cookie: string | undefined, @Param("taskId") taskId: string, @Body() body: UpdateAgentInitiativeTaskDto) { return response(await this.initiatives.updateTask(await this.auth.sessionClaims(cookie), taskId, body)); }
}
