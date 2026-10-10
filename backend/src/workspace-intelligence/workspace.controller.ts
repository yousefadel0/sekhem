import { Controller, Get, Post, Body, Headers, Inject, Optional, Param, Query, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { response } from "../common/api-response";
import { WorkspaceBindingService } from "./workspace-binding.service";
import { WorkspaceDiscoveryService } from "./workspace-discovery.service";
import { WorkspaceIntelligenceService } from "./workspace-intelligence.service";
import { WorkspaceIntelligenceError } from "./workspace-intelligence.errors";
import { WorkspaceRuntimeService } from "./workspace-runtime.service";
import { WorkspaceRuntimeEvidenceService } from "./workspace-runtime-evidence.service";

@Controller("projects/:projectId/workspace")
export class WorkspaceController {
  constructor(@Inject(AuthService) private readonly auth: AuthService,
    @Inject(WorkspaceBindingService) private readonly bindings: WorkspaceBindingService,
    @Inject(WorkspaceDiscoveryService) private readonly discovery: WorkspaceDiscoveryService,
    @Inject(WorkspaceIntelligenceService) private readonly intelligence: WorkspaceIntelligenceService,
    @Optional() @Inject(WorkspaceRuntimeService) private readonly runtime?: WorkspaceRuntimeService,
    @Optional() @Inject(WorkspaceRuntimeEvidenceService) private readonly evidence?: WorkspaceRuntimeEvidenceService) {}

  @Post("bindings/:id/evidence") async requestEvidence(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Body() body: unknown) {
    const claims = await this.auth.validateDurableSession(cookie);
    if (!this.evidence) throw new ServiceUnavailableException("Runtime evidence unavailable");
    return response(await this.evidence.request(claims, project, id, body));
  }
  @Get("bindings/:id/evidence/:requestId") async evidenceStatus(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Param("requestId") requestId: string, @Query("version") version: string) {
    const claims = await this.auth.validateDurableSession(cookie);
    if (!this.evidence) throw new ServiceUnavailableException("Runtime evidence unavailable");
    return response(await this.evidence.observe(claims, project, id, Number(version), requestId));
  }

  private runtimeService() { if (!this.runtime) throw new ServiceUnavailableException("Runtime Workspace unavailable"); return this.runtime; }
  @Post("bindings/:id/read-grant") async allowWorkspaceRead(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Body() body: unknown) {
    return response(await this.runtimeService().readGrant(await this.auth.validateDurableSession(cookie), project, id, body));
  }
  @Post("bindings/:id/read-grant/revoke") async revokeWorkspaceRead(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Body() body: unknown) {
    return response(await this.runtimeService().readGrant(await this.auth.validateDurableSession(cookie), project, id, body, true));
  }
  @Post("bindings/:id/search") async searchWorkspace(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Body() body: unknown) {
    return response(await this.runtimeService().request(await this.auth.validateDurableSession(cookie), project, id, "SEARCH", body));
  }
  @Get("runtime/devices") async runtimeDevices(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string) {
    return response(await this.runtimeService().devices(await this.auth.validateDurableSession(cookie), project));
  }
  @Get("bindings") async runtimeBindings(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string) {
    return response(await this.runtimeService().listBindings(await this.auth.validateDurableSession(cookie), project));
  }
  @Post("bindings") async createBinding(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Body() body: unknown) {
    return response(await this.runtimeService().createBinding(await this.auth.validateDurableSession(cookie), project, body));
  }
  @Get("bindings/:id") async runtimeBinding(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Query("version") version: string) {
    return response(await this.runtimeService().getBinding(await this.auth.validateDurableSession(cookie), project, id, Number(version)));
  }
  @Post("bindings/:id/verify") async verifyBinding(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Body() body: unknown) {
    return response(await this.runtimeService().request(await this.auth.validateDurableSession(cookie), project, id, "VERIFY", body));
  }
  @Post("bindings/:id/tree") async requestTree(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Body() body: unknown) {
    return response(await this.runtimeService().request(await this.auth.validateDurableSession(cookie), project, id, "LIST", body));
  }
  @Post("bindings/:id/file") async requestFile(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Body() body: unknown) {
    return response(await this.runtimeService().request(await this.auth.validateDurableSession(cookie), project, id, "READ", body));
  }
  // GET observes a persisted operation only. It never creates a proposal or executes a read.
  @Get("bindings/:id/tree") async runtimeTree(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Query("version") version: string, @Query("operationId") operation: string, @Query("path") path = "") {
    const claims = await this.auth.validateDurableSession(cookie);
    return response({ view: operation ? await this.runtimeService().operation(claims, project, id, Number(version), operation) : await this.runtimeService().latest(claims, project, id, Number(version), path, "filesystem.list") });
  }
  @Get("bindings/:id/file") async runtimeFile(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string, @Query("version") version: string, @Query("operationId") operation: string) {
    return response({ view: await this.runtimeService().operation(await this.auth.validateDurableSession(cookie), project, id, Number(version), operation) });
  }

  private async bound(cookie: string | undefined, projectId: string, version?: string) {
    const claims = await this.auth.validateDurableSession(cookie);
    return this.bindings.resolve(claims, projectId, version);
  }

  @Get()
  async descriptor(@Headers("cookie") cookie: string | undefined, @Param("projectId") projectId: string) {
    const { binding } = await this.bound(cookie, projectId);
    return response({ ...binding, status: "AVAILABLE", executionAvailable: false });
  }

  @Get("tree")
  async tree(@Headers("cookie") cookie: string | undefined, @Param("projectId") projectId: string,
    @Query("path") path = "", @Query("version") version?: string) {
    const { binding, context } = await this.bound(cookie, projectId, version);
    try { return response({ binding, ...await this.discovery.listDirectory(context, path) }); }
    catch (error) { return this.controlled(error); }
  }

  @Get("file")
  async file(@Headers("cookie") cookie: string | undefined, @Param("projectId") projectId: string,
    @Query("path") path = "", @Query("version") version?: string) {
    const { binding, context } = await this.bound(cookie, projectId, version);
    try {
      const document = await this.intelligence.inspectFile(context, path);
      return response({ binding, path: path.replace(/\\/g, "/"), fileName: document.fileName,
        mimeType: document.detectedMime, language: document.language, text: document.text,
        status: document.scanned ? "SCANNED" : document.truncated ? "TRUNCATED" : "READ", truncated: document.truncated,
        warnings: document.warnings, pageCount: document.pageCount, scanned: document.scanned ?? false });
    } catch (error) { return this.controlled(error); }
  }

  private controlled(error: unknown): never {
    if (error instanceof WorkspaceIntelligenceError) {
      if (["WORKSPACE_PATH_OUTSIDE_ROOT", "WORKSPACE_FILE_ACCESS_DENIED", "WORKSPACE_ACCESS_DENIED"].includes(error.code)) {
        throw new ForbiddenException({ code: error.code, message: "Access to this workspace path is denied." });
      }
      throw error;
    }
    throw new WorkspaceIntelligenceError("WORKSPACE_INSPECTION_FAILED");
  }
}
