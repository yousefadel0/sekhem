import { Body, Controller, Headers, Inject, Module, Param, Post } from "@nestjs/common";
import { response } from "../common/api-response";
import { DataAccessModule } from "../data-access/data-access.module";
import { WorkspaceIntelligenceModule } from "../workspace-intelligence/workspace-intelligence.module";
import { AuthService } from "../auth/auth.service";
import { BrowserService } from "./browser.service";
@Controller("projects/:projectId/browser")
class BrowserController {
  constructor(@Inject(BrowserService) private readonly browser: BrowserService) {}
  @Post() async open(@Headers("cookie") cookie: string | undefined, @Param("projectId") projectId: string, @Body() body: unknown) { return response(await this.browser.open(cookie, projectId, body)); }
  @Post(":id/actions") async action(@Headers("cookie") cookie: string | undefined, @Param("projectId") projectId: string, @Param("id") id: string, @Body() body: unknown) { return response(await this.browser.action(cookie, projectId, id, body)); }
}
@Module({ imports: [DataAccessModule, WorkspaceIntelligenceModule], controllers: [BrowserController], providers: [AuthService, BrowserService] })
export class BrowserModule {}
