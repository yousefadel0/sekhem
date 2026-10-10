import { startDiagnostic, failureCategory } from "./runtime-start-diagnostics";
import { workspaceReadConsentTx } from "./workspace-read-coverage";
import { persistentReadAccessTx } from "./development-read-policy";
import { RuntimeFolderService } from "./runtime-folder.service";
import { Body, Controller, Get, Headers, HttpException, Inject, Param, Post, Req, Res, UnauthorizedException, Optional } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "../auth/auth.service";
import { response } from "../common/api-response";
import { RuntimeIdentityService } from "./runtime-identity.service";
import { RuntimeControlService, type ProposeRuntimeAction } from "./runtime-control.service";
import { RuntimeExecutionService } from "./runtime-execution.service";
import { boundedRuntime, RUNTIME_LABEL, RUNTIME_MODULE, runtimeError, type RuntimeGrant, type RuntimeTool } from "./runtime.contract";

@Controller("trusted-runtime")
export class RuntimeController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(RuntimeIdentityService) private readonly identity: RuntimeIdentityService,
    @Inject(RuntimeControlService) private readonly control: RuntimeControlService,
    @Optional() @Inject(RuntimeFolderService) private readonly folders?: RuntimeFolderService) {}
  @Post("projects/:projectId/folder-selections") async chooseFolder(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Body() body: any) {
    boundedRuntime(body); if (!this.folders || !body || typeof body.runtimeId !== "string" || Object.keys(body).length !== 1) runtimeError("FOLDER_SELECTION_INVALID");
    return response(await this.folders.request(await this.auth.validateDurableSession(cookie), project, body.runtimeId));
  }
  @Get("projects/:projectId/folder-selections/:id") async folderSelection(@Headers("cookie") cookie: string | undefined, @Param("projectId") project: string, @Param("id") id: string) {
    if (!this.folders) runtimeError("FOLDER_PICKER_UNAVAILABLE");
    return response(await this.folders.observe(await this.auth.validateDurableSession(cookie), project, id));
  }
  @Get("devices") async devices(@Headers("cookie") cookie: string | undefined) { return response({ label: RUNTIME_LABEL, devices: await this.identity.devices(await this.auth.validateDurableSession(cookie)) }); }
  @Get("grants") async grants(@Headers("cookie") cookie: string | undefined) {
    const claims = await this.auth.validateDurableSession(cookie);
    return response(await this.identity.ledger.transaction(async tx => { await this.identity.actor(tx, claims.sub, claims.organizationId!);
      return Promise.all((await this.identity.ledger.list<RuntimeGrant>(tx, "RUNTIME_GRANT", claims.sub)).map(async row => {
        const g = { ...row.payload, persistentReadAccess: await persistentReadAccessTx(this.identity.ledger, tx, row.payload) }, b = await this.control.workspaces?.activeBindingTx(tx, claims.sub, g.projectId, claims.organizationId!);
        // Compatibility projection only; the RuntimeGrant ledger payload is never changed.
        return b?.runtimeId === g.runtimeId ? { ...g, workspaceRead: await workspaceReadConsentTx(this.identity.ledger, tx, { ...b, bindingVersion: b.version }, g) } : g;
      })); }));
  }
  @Post("enroll") async enroll(@Headers("cookie") cookie: string | undefined, @Body() body: any) {
    boundedRuntime(body); return response(await this.identity.enroll(await this.auth.validateDurableSession(cookie), body.code, body.displayName));
  }
  @Post("devices/:id/status") async status(@Headers("cookie") cookie: string | undefined, @Param("id") id: string, @Body() body: any) {
    boundedRuntime(body); return response(await this.identity.setDeviceStatus(await this.auth.validateDurableSession(cookie), id, body.status));
  }
  @Post("capability-enrollments") async configureCapabilities(@Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    return response(await this.identity.configureCapabilities(await this.auth.validateDurableSession(cookie), body));
  }
  @Get("devices/:runtimeId/projects/:projectId/capability-enrollment") async capabilityEnrollment(
    @Headers("cookie") cookie: string | undefined, @Param("runtimeId") runtimeId: string, @Param("projectId") projectId: string) {
    return response(await this.identity.capabilityEnrollment(await this.auth.validateDurableSession(cookie), runtimeId, projectId));
  }
  @Post("grants") async grant(@Headers("cookie") cookie: string | undefined, @Body() body: { runtimeId: string; projectId: string; capabilities: RuntimeTool[]; expiresAt?: string; mode: string }) {
    boundedRuntime(body); if (body.mode !== "TRUSTED_MACHINE") runtimeError("RUNTIME_MODE_ACKNOWLEDGEMENT_REQUIRED");
    return response(await this.identity.grant(await this.auth.validateDurableSession(cookie), body.runtimeId, body.projectId, body.capabilities, body.expiresAt));
  }
  @Post("grants/renew") async renewGrant(@Headers("cookie") cookie: string | undefined, @Body() body: unknown) {
    return response(await this.identity.renewGrant(await this.auth.validateDurableSession(cookie), body));
  }
  @Post("grants/revoke") async revoke(@Headers("cookie") cookie: string | undefined, @Body() body: any) {
    boundedRuntime(body); return response(await this.identity.revokeGrant(await this.auth.validateDurableSession(cookie), body.runtimeId, body.projectId));
  }
  @Post("proposals") async propose(@Headers("cookie") cookie: string | undefined, @Body() body: ProposeRuntimeAction) {
    return response(await this.control.propose(await this.auth.validateDurableSession(cookie), body));
  }
  @Get("runs/:id") async snapshot(@Headers("cookie") cookie: string | undefined, @Param("id") id: string) {
    return response(await this.control.snapshot(await this.auth.validateDurableSession(cookie), id));
  }
  @Post("runs/:id/decision") async decide(@Headers("cookie") cookie: string | undefined, @Param("id") id: string, @Body() body: any) {
    boundedRuntime(body); return response(await this.control.approve(await this.auth.validateDurableSession(cookie), id, body.fingerprint, body.decision));
  }
  @Post("runs/:id/cancel") async cancel(@Headers("cookie") cookie: string | undefined, @Param("id") id: string) {
    return response(await this.control.cancel(await this.auth.validateDurableSession(cookie), id));
  }
}

@Controller("trusted-runtime/transport")
export class RuntimeTransportController {
  private readonly rate = new Map<string, { at: number; count: number }>();
  constructor(@Inject(RuntimeIdentityService) private readonly identity: RuntimeIdentityService, @Inject(RuntimeExecutionService) private readonly executions: RuntimeExecutionService) {}
  private tls(req: Request, limited = false) {
    if (!(req.socket as any).encrypted) throw new UnauthorizedException("RUNTIME_HTTPS_REQUIRED");
    if (limited) {
      const now = Date.now(), key = req.socket.remoteAddress ?? "unknown";
      for (const [id, bucket] of this.rate) if (now - bucket.at > 60000) this.rate.delete(id);
      const bucket = this.rate.get(key) ?? { at: now, count: 0 };
      if (++bucket.count > 120 || this.rate.size > 1024) throw new HttpException("RUNTIME_RATE_LIMIT", 429);
      this.rate.set(key, bucket);
    }
  }
  @Post("enrollment") async enrollment(@Req() req: Request, @Body() body: any) {
    this.tls(req, true); boundedRuntime(body); return response(await this.identity.enrollment(body.publicKey, body.runtimeVersion));
  }
  @Post("enrollment-proof") async proof(@Req() req: Request, @Body() body: any) {
    this.tls(req, true); boundedRuntime(body); return response(await this.identity.proveEnrollment(body.code, body.timestamp, body.signature));
  }
  @Post("challenge") async challenge(@Req() req: Request, @Body() body: any) {
    this.tls(req, true); boundedRuntime(body); return response(await this.identity.challenge(body.runtimeId, body.operation, body.payload));
  }
  @Post(":operation") async operation(@Req() req: Request, @Param("operation") operation: string, @Body() body: any, @Res({ passthrough: true }) res?: Response) {
    const diagnostic = operation === "started" ? startDiagnostic("backend", { executionId: body?.payload?.executionId, challengeId: body?.auth?.challengeId }) : undefined;
    diagnostic?.emit("BACKEND_RECEIVED");
    if (diagnostic && res) {
      res.once("finish", () => diagnostic.emit("RESPONSE_FINISHED", { status: res.statusCode }));
      res.once("close", () => { if (!res.writableFinished) diagnostic.emit("RESPONSE_CLOSED_EARLY", { status: res.statusCode }); });
    }
    try {
    this.tls(req); boundedRuntime(body);
    if (!["connect", "poll", "started", "heartbeat", "result", "folder-result"].includes(operation)) runtimeError("RUNTIME_OPERATION_INVALID");
    const result = await this.executions.request(operation as any, body.payload, body.auth);
    const confirmation = result as { execute?: boolean; cancel?: boolean };
    diagnostic?.emit("RESPONSE_READY", { execute: confirmation.execute, cancel: confirmation.cancel });
    return response(result);
    } catch (error) { diagnostic?.emit("BACKEND_REJECTED", { category: failureCategory(error) }); throw error; }
  }
}
