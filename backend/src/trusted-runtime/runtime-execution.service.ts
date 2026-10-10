import { startDiagnostic, failureCategory } from "./runtime-start-diagnostics";
import { workflowPauseGateTx } from "../agent-runtime/workflow-pause";
import { omitFields } from "../common/omit-fields";
import { RuntimeFolderService } from "./runtime-folder.service";
import { ForbiddenException, forwardRef, Inject, Injectable, NotFoundException, Logger, OnModuleInit, OnModuleDestroy, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { AgentPlanExecutionService } from "../agent-runtime/execution/agent-plan-execution.service";
import { executionPhaseTx } from "../agent-runtime/execution/plan-execution-state";
import { RuntimeLedgerService, type RuntimeRecord } from "./runtime-ledger.service";
import { RuntimeIdentityService } from "./runtime-identity.service";
import { RuntimeControlService, executionIdentity } from "./runtime-control.service";
import { readCoverageTx } from "./workspace-read-coverage";
import { toolDigest } from "../agent-runtime/tools/tool-contract";
import { RUNTIME_LIMITS, TERMINAL_RUNTIME_STATES, boundedRuntime, runtimeError,
  RUNTIME_MODULE, type RuntimeAuth, type RuntimeAttribution, type RuntimeDevice, type RuntimeExecution, type RuntimeProposal, type RuntimeResult } from "./runtime.contract";

/** Authentication, reauthorization, execution insertion and consumption commit
 * together. The transport only receives an operation after this promise commits. */
@Injectable()
export class RuntimeExecutionService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private sweeping = false;
  private cursor: string | undefined;
  onModuleInit() { this.timer = setInterval(() => { void this.reconcile().catch(() => new Logger("TrustedRuntime").error("Runtime recovery unavailable; no execution retried")); }, 15000); this.timer.unref(); }
  onModuleDestroy() { clearInterval(this.timer); }
  async reconcile() {
    if (this.sweeping) return; this.sweeping = true;
    try { await this.ledger.transaction(async tx => {
      const rows = await tx.auditEvent.findMany({ where: { module: RUNTIME_MODULE, action: { startsWith: "RUNTIME_EXECUTION:" }, OR: ["DISPATCHED", "RUNNING"].map(state => ({ metadata: { path: ["payload", "state"], equals: state } })) }, orderBy: { id: "asc" }, take: 64,
        ...(this.cursor ? { cursor: { id: this.cursor }, skip: 1 } : {}) });
      this.cursor = rows.length === 64 ? rows[rows.length - 1].id : undefined;
      for (const row of rows) { const record = this.ledger.decode<RuntimeExecution>(row, "RUNTIME_EXECUTION"), e = record.payload;
        if (Date.parse(e.lastSeenAt) + RUNTIME_LIMITS.lostMs < Date.now()) await this.unknown(tx, record, "Runtime disconnected; recovery will not repeat the operation"); }
    }); await this.planExecution?.advancePending(); } finally { this.sweeping = false; }
  }
  constructor(@Inject(RuntimeLedgerService) readonly ledger: RuntimeLedgerService, @Inject(RuntimeIdentityService) readonly identity: RuntimeIdentityService,
    @Inject(RuntimeControlService) readonly control: RuntimeControlService,
    @Optional() @Inject(RuntimeFolderService) readonly folders?: RuntimeFolderService,
    @Optional() @Inject(forwardRef(() => AgentPlanExecutionService)) readonly planExecution?: AgentPlanExecutionService) {}
  async request(operation: "connect" | "poll" | "started" | "heartbeat" | "result" | "folder-result", body: any, auth: RuntimeAuth) {
    const diagnostic = operation === "started" ? startDiagnostic("backend", { executionId: body?.executionId, challengeId: auth?.challengeId }) : undefined;
    diagnostic?.emit("TX_REQUESTED");
    let response;
    try { response = await this.ledger.transaction(async tx => {
      diagnostic?.emit("TX_CALLBACK_ENTERED");
      const device = await this.identity.authenticate(tx, operation, body, auth);
      if (operation === "folder-result") { if (!this.folders) runtimeError("FOLDER_PICKER_UNAVAILABLE"); return this.folders.result(tx, device, body); }
      if (operation === "connect") return this.connect(tx, device, body);
      if (operation === "poll") return this.poll(tx, device);
      if (operation === "result") return this.result(tx, device, body);
      const result = await this.heartbeat(tx, device, body, operation === "started");
      diagnostic?.emit("TX_CALLBACK_COMPLETED");
      return result;
    });
    const confirmed = response as { execute?: boolean; cancel?: boolean; state?: string };
    diagnostic?.emit("TX_COMMITTED", { execute: confirmed.execute, cancel: confirmed.cancel, eventCommitted: confirmed.execute === true && confirmed.state === "RUNNING" });
    } catch (error) { diagnostic?.emit("TX_REJECTED_COMMIT_UNCONFIRMED", { category: failureCategory(error) }); throw error; }
    // Receipt acceptance is committed before any next-step authorization. A retry
    // re-sends the receipt only; durable pending records recover continuation.
    if (operation === "result") {
      try { await this.planExecution?.advancePending(); }
      catch { new Logger("TrustedRuntime").error("Receipt retained; plan continuation will be reconciled"); }
    }
    return response;
  }
  private async connect(tx: any, device: RuntimeDevice, body: any) {
    for (const record of await this.ledger.list<RuntimeExecution>(tx, "RUNTIME_EXECUTION", `${device.runtimeId}:active`)) await this.unknown(tx, record, "Runtime reconnected; previous execution outcome is unknown");
    const row = await this.identity.device(tx, device.runtimeId), now = new Date().toISOString();
    const identity = omitFields(device, ["workspaceReadProtocol", "folderPickerProtocol", "conditionalWriteProtocol"]);
    return (await this.ledger.update(tx, row, { ...identity, ...(body?.conditionalWriteProtocol === 1 ? { conditionalWriteProtocol: 1 as const } : {}), ...(body?.folderPickerProtocol === 1 ? { folderPickerProtocol: 1 as const } : {}), ...(body?.workspaceReadProtocol === 1 ? { workspaceReadProtocol: 1 as const } : {}), connectionEpoch: device.connectionEpoch + 1, lastSeenAt: now, updatedAt: now })).payload;
  }
  private async poll(tx: any, device: RuntimeDevice) {
    const active = await this.ledger.list<RuntimeExecution>(tx, "RUNTIME_EXECUTION", `${device.runtimeId}:active`);
    for (const e of active) {
      const deadline = e.payload.startedAt ? Date.parse(e.payload.startedAt) + Number(e.payload.attribution.validatedInput.timeoutMs ?? 30000) + RUNTIME_LIMITS.lostMs : Date.parse(e.payload.attribution.permitExpiresAt);
      if (Date.parse(e.payload.lastSeenAt) + RUNTIME_LIMITS.lostMs < Date.now() || deadline < Date.now()) await this.unknown(tx, e, "Execution heartbeat or dispatch acknowledgement expired");
      else { await this.touch(tx, device); return { execution: null, activeExecutionId: e.payload.attribution.executionId }; }
    }
    const selection = await this.folders?.dispatch(tx, device);
    if (selection) { await this.touch(tx, device); return { execution: null, folderSelection: selection }; }
    const proposals = await this.ledger.list<RuntimeProposal>(tx, "RUNTIME_PROPOSAL", `${device.runtimeId}:approved`, 32);
    if (!proposals.length) { await this.touch(tx, device); return { execution: null }; }
    const available = [];
    for (const candidate of proposals) if (!await workflowPauseGateTx(this.ledger, tx, candidate.payload.runId)) available.push(candidate);
    if (!available.length) { await this.touch(tx, device); return { execution: null }; }
    const record = available[0], p = record.payload;
    const ids = executionIdentity(p);
    const existing = await this.ledger.read<RuntimeExecution>(tx, "RUNTIME_EXECUTION", ids.intentId);
    if (existing) {
      // A duplicate poll never contains another executable payload.
      await this.ledger.update(tx, record, { ...p, state: "DISPATCHED" }, `${p.runtimeId}:settled`);
      return { execution: null, existingExecutionId: ids.executionId, state: existing.payload.state };
    }
    // Validation failures commit a rejected request, but never a permit. Database
    // failures propagate and roll back the entire authentication/dispatch operation.
    try { await this.control.validate(tx, record, device); }
    catch (error) {
      const status = (error as any)?.getStatus?.();
      if (![400, 401, 403, 404, 409].includes(status)) throw error;
      await this.ledger.update(tx, record, { ...p, state: "REJECTED" }, `${p.runtimeId}:settled`);
      const reason = (error as Error)?.message;
      await this.control.event(tx, p.runId, "EXECUTION_BLOCKED", { code: "RUNTIME_REVALIDATION_FAILED",
        ...(/^RUNTIME_[A-Z_]{1,80}$/.test(reason) ? { reason } : {}), recovery: "FRESH_ADMISSION_REQUIRED" });
      await executionPhaseTx(tx, p.runId, "RUNTIME_REVALIDATION_FAILED");
      await tx.agentRun.updateMany({ where: { id: p.runId }, data: { status: "FAILED", failureReason: "Runtime revalidation rejected", completedAt: new Date() } });
      return { execution: null, rejected: true };
    }
    const now = new Date().toISOString(), approval = await tx.agentApproval.findUnique({ where: { id: p.approvalId } });
    if (p.inspection) await this.control.event(tx, p.runId, "INSPECTION_STATE_CHANGED", { state: "REVALIDATING", operationId: p.inspection.operationId });
    const expires = Math.min(Date.now() + RUNTIME_LIMITS.permitMs, new Date(approval.dueAt).getTime(), p.authorizingExpiresAt * 1000);
    if (expires <= Date.now()) runtimeError("RUNTIME_PERMIT_EXPIRED");
    const operationDigest = toolDigest({ runtimeId: p.runtimeId, grantId: p.grantId, grantVersion: p.grantVersion, proposalDigest: p.proposalDigest,
      planId: p.planId, planVersion: p.planVersion, stepId: p.planStepId, tool: p.toolId, toolVersion: p.toolVersion, input: p.validatedInput });
    const idempotencyKey = toolDigest([p.userId, p.proposalId]);
    const permit = { runtimeId: p.runtimeId, grantId: p.grantId, executionIntentId: ids.intentId, proposalId: p.proposalId, runId: p.runId,
      planId: p.planId, planStepId: p.planStepId, tool: p.toolId, toolVersion: p.toolVersion, inputDigest: p.inputDigest, operationDigest, idempotencyKey,
      connectionEpoch: device.connectionEpoch, expiresAt: new Date(expires).toISOString() };
    const attribution: RuntimeAttribution = { executionId: ids.executionId, executionIntentId: ids.intentId, idempotencyKey, runtimeId: p.runtimeId, grantId: p.grantId,
      ...(p.workspaceRead ? { workspaceRead: p.workspaceRead } : {}),
      grantVersion: p.grantVersion, userId: p.userId, organizationId: p.organizationId, projectId: p.projectId, conversationId: p.conversationId, agentRunId: p.runId,
      planId: p.planId, planVersion: p.planVersion, planStepId: p.planStepId, proposalId: p.proposalId, approvalId: p.approvalId!, approvalFingerprint: p.approvalFingerprint!,
      tool: p.toolId, toolVersion: p.toolVersion, validatedInput: p.validatedInput, operationDigest, permitDigest: toolDigest(permit), permitExpiresAt: permit.expiresAt,
      connectionEpoch: device.connectionEpoch, createdAt: now };
    await this.ledger.create(tx, "RUNTIME_IDEMPOTENCY", [p.userId, idempotencyKey], { executionId: ids.executionId, operationDigest });
    let execution = await this.ledger.create<RuntimeExecution>(tx, "RUNTIME_EXECUTION", ids.intentId, { attribution, state: "CREATED", dispatchedAt: null, startedAt: null, finishedAt: null,
      consumedAt: null, lastSeenAt: now, cancellationState: "NONE", verificationState: "PENDING", verifiedAt: null, result: null, error: null }, { immutable: false, route: `${p.runtimeId}:active` });
    execution = await this.ledger.update(tx, execution, { ...execution.payload, state: "AUTHORIZED" });
    if (await this.ledger.read(tx, "RUNTIME_PERMIT_CONSUMPTION", ids.intentId)) runtimeError("RUNTIME_PERMIT_ALREADY_CONSUMED");
    await this.ledger.create(tx, "RUNTIME_PERMIT_CONSUMPTION", ids.intentId, { ...permit, permitDigest: attribution.permitDigest, consumedAt: now });
    execution = await this.ledger.update(tx, execution, { ...execution.payload, state: "DISPATCHED", consumedAt: now, dispatchedAt: now });
    await this.ledger.update(tx, record, { ...p, state: "DISPATCHED" }, `${p.runtimeId}:settled`);
    await tx.agentRun.update({ where: { id: p.runId }, data: { status: "RUNNING", failureReason: null, startedAt: new Date() } });
    await this.control.event(tx, p.runId, "EXECUTION_PERMIT_CREATED", { executionId: ids.executionId, permitDigest: attribution.permitDigest });
    await this.control.event(tx, p.runId, "EXECUTION_DISPATCHED", { executionId: ids.executionId, operationDigest });
    await executionPhaseTx(tx, p.runId, "DISPATCHED");
    await this.touch(tx, device);
    return { execution: execution.payload };
  }
  private async load(tx: any, device: RuntimeDevice, executionId: unknown, operationDigest: unknown) {
    if (typeof executionId !== "string") runtimeError("RUNTIME_EXECUTION_REQUIRED");
    const raw = await tx.auditEvent.findUnique({ where: { id: executionId } });
    if (!raw) throw new NotFoundException("Runtime execution not found");
    const record = this.ledger.decode<RuntimeExecution>(raw, "RUNTIME_EXECUTION"), a = record.payload.attribution;
    if (a.runtimeId !== device.runtimeId || a.connectionEpoch !== device.connectionEpoch || a.userId !== device.userId || a.organizationId !== device.organizationId || a.operationDigest !== operationDigest) throw new ForbiddenException("RUNTIME_RESULT_ATTRIBUTION_INVALID");
    return record;
  }
  private async heartbeat(tx: any, device: RuntimeDevice, body: any, started: boolean) {
    boundedRuntime(body);
    const record = await this.load(tx, device, body.executionId, body.operationDigest), e = record.payload;
    if (TERMINAL_RUNTIME_STATES.includes(e.state)) return { state: e.state, cancel: true };
    let cancel = e.cancellationState === "REQUESTED";
    try { const grant = await this.identity.activeGrant(tx, device.runtimeId, e.attribution.projectId, e.attribution.grantVersion, ["filesystem.list", "filesystem.read", "filesystem.search"].includes(e.attribution.tool));
      if (e.attribution.workspaceRead) { const coverage = await readCoverageTx(this.ledger, tx, grant, e.attribution.workspaceRead.consent, e.attribution.tool, String(e.attribution.validatedInput.path)); if (!coverage || toolDigest(coverage) !== toolDigest(e.attribution.workspaceRead)) runtimeError("WORKSPACE_READ_GRANT_CHANGED"); }
    }
    catch (error) { if (![400, 401, 403, 404].includes((error as any)?.getStatus?.())) throw error; cancel = true; }
    const inspection = await this.ledger.read<any>(tx, "AGENT_INSPECTION", e.attribution.agentRunId);
    if (started && (inspection || e.attribution.workspaceRead || await this.planExecution?.isPlanRunTx(tx, e.attribution.agentRunId))) {
      try {
        const proposal = await this.ledger.read<RuntimeProposal>(tx, "RUNTIME_PROPOSAL", inspection ? [e.attribution.agentRunId, e.attribution.planVersion] : e.attribution.agentRunId);
        if (!proposal) runtimeError("RUNTIME_PROPOSAL_MISSING");
        await this.control.validate(tx, proposal, device, true, true);
      } catch (error) { if (![400, 401, 403, 404, 409].includes((error as any)?.getStatus?.())) throw error; cancel = true; }
    }
    if (started && (e.state !== "DISPATCHED" || Date.parse(e.attribution.permitExpiresAt) <= Date.now())) {
      if (e.state === "RUNNING") return { state: "RUNNING", cancel: true, execute: false };
      await this.unknown(tx, record, "Dispatch acknowledgement arrived after permit expiry"); return { state: "OUTCOME_UNKNOWN", cancel: true, execute: false };
    }
    if (started && cancel) {
      await this.ledger.update(tx, record, { ...e, state: "CANCELLED", finishedAt: new Date().toISOString(), cancellationState: "CONFIRMED", verificationState: "NOT_VERIFIED" }, `${device.runtimeId}:settled`);
      await this.control.event(tx, e.attribution.agentRunId, "EXECUTION_CANCELLED", { executionId: body.executionId, executed: false });
      await executionPhaseTx(tx, e.attribution.agentRunId, "CANCELLED");
      if (!inspection || !["CANCELLED", "FAILED", "COMPLETED"].includes(inspection.payload.state)) {
        await tx.agentRun.updateMany({ where: { id: e.attribution.agentRunId }, data: { status: inspection && e.cancellationState !== "REQUESTED" ? "FAILED" : "CANCELLED",
          ...(inspection && e.cancellationState !== "REQUESTED" ? { failureReason: "RUNTIME_REVALIDATION_FAILED" } : {}), completedAt: new Date() } });
      }
      return { state: "CANCELLED", cancel: true, execute: false };
    }
    if (body.output && (typeof body.output.stdout !== "string" || typeof body.output.stderr !== "string" || Buffer.byteLength(body.output.stdout) > RUNTIME_LIMITS.outputBytes || Buffer.byteLength(body.output.stderr) > RUNTIME_LIMITS.outputBytes)) runtimeError("RUNTIME_OUTPUT_LIMIT");
    const now = new Date().toISOString(), next = { ...e, state: started ? "RUNNING" as const : e.state, startedAt: started ? now : e.startedAt,
      ...(body.output ? { output: { stdout: body.output.stdout, stderr: body.output.stderr } } : {}),
      lastSeenAt: now, cancellationState: cancel ? "REQUESTED" as const : e.cancellationState };
    await this.ledger.update(tx, record, next);
    // A verified execution heartbeat is also evidence that this device is online.
    // Keep the existing write throttle; this does not renew grants or permits.
    await this.touch(tx, device);
    if (started) await this.control.event(tx, e.attribution.agentRunId, "EXECUTION_STARTED", { executionId: e.attribution.executionId });
    if (started) await executionPhaseTx(tx, e.attribution.agentRunId, "EXECUTING");
    if (started) startDiagnostic("backend", { executionId: e.attribution.executionId, agentRunId: e.attribution.agentRunId }).emit("START_EVENT_STAGED");
    if (body.output) {
      await this.control.event(tx, e.attribution.agentRunId, "EXECUTION_OUTPUT", { executionId: e.attribution.executionId, stdout: body.output.stdout, stderr: body.output.stderr });
    }
    return { state: next.state, cancel, execute: started && !cancel };
  }
  private async result(tx: any, device: RuntimeDevice, body: RuntimeResult) {
    boundedRuntime(body);
    const record = await this.load(tx, device, body.executionId, body.operationDigest), e = record.payload;
    const prior = await this.ledger.read<RuntimeResult>(tx, "RUNTIME_RESULT", body.executionId);
    if (prior) { if (prior.payloadDigest !== toolDigest(body)) runtimeError("RUNTIME_RESULT_CONFLICT"); return { state: e.state, duplicate: true }; }
    this.validateResult(body);
    if (e.attribution.tool === "terminal.execute" && ["CANCELLED", "TIMED_OUT"].includes(body.state) && body.verificationResult.notStarted !== true && body.verificationResult.terminationConfirmed !== true) runtimeError("RUNTIME_TERMINATION_UNCONFIRMED");
    if (TERMINAL_RUNTIME_STATES.includes(e.state)) runtimeError("RUNTIME_RESULT_AFTER_SETTLEMENT");
    if (e.state !== "RUNNING") runtimeError("RUNTIME_NOT_STARTED");
    const verified = this.verified(e.attribution, body);
    await this.ledger.create(tx, "RUNTIME_RESULT", body.executionId, body);
    await this.control.event(tx, e.attribution.agentRunId, "VERIFICATION_STARTED", { executionId: body.executionId });
    const state = body.state === "SUCCEEDED" && !verified ? "FAILED" : body.state;
    const now = new Date().toISOString();
    const finished: RuntimeExecution = { ...e, state, finishedAt: body.finishedAt, lastSeenAt: now, error: body.error ?? (body.state === "SUCCEEDED" && !verified ? "RUNTIME_VERIFICATION_FAILED" : null),
      cancellationState: state === "CANCELLED" ? "CONFIRMED" : state === "OUTCOME_UNKNOWN" && e.cancellationState === "REQUESTED" ? "UNKNOWN" : e.cancellationState,
      verificationState: verified ? "VERIFIED" : body.state === "SUCCEEDED" || body.state === "FAILED" ? "FAILED" : "NOT_VERIFIED", verifiedAt: verified ? now : null, result: body };
    await this.ledger.update(tx, record, finished, `${device.runtimeId}:settled`);
    await this.control.event(tx, e.attribution.agentRunId, verified ? "VERIFICATION_SUCCEEDED" : "VERIFICATION_FAILED", { executionId: body.executionId, verification: finished.verificationState });
    await this.control.event(tx, e.attribution.agentRunId, `EXECUTION_${state}`, { executionId: body.executionId, state, exitCode: body.exitCode, durationMs: body.durationMs, stdout: body.stdout, stderr: body.stderr });
    const inspection = await this.ledger.read<any>(tx, "AGENT_INSPECTION", e.attribution.agentRunId);
    const isPlan = this.planExecution ? await this.planExecution.isPlanRunTx(tx, e.attribution.agentRunId) : false;
    if (!inspection && !isPlan) {
      await tx.agentRun.updateMany({ where: { id: e.attribution.agentRunId }, data: { status: state === "SUCCEEDED" ? "COMPLETED" : state === "CANCELLED" ? "CANCELLED" : "FAILED",
        progressPercent: state === "SUCCEEDED" ? 100 : 0, completedAt: state === "SUCCEEDED" ? new Date() : new Date(), failureReason: state === "SUCCEEDED" ? null : state } });
    } else if (inspection && !["CANCELLED", "FAILED", "COMPLETED"].includes(inspection.payload.state)) {
      await tx.agentRun.updateMany({ where: { id: e.attribution.agentRunId }, data: { status: state === "SUCCEEDED" ? "RUNNING" : state === "CANCELLED" ? "CANCELLED" : "FAILED",
        progressPercent: 0, completedAt: null, failureReason: state === "SUCCEEDED" ? null : state } });
    }
    if (isPlan) {
      await this.planExecution!.recordReceiptTx(tx, e.attribution.agentRunId, e.attribution, finished);
    }
    const projectedRun = await tx.agentRun.findUnique({ where: { id: e.attribution.agentRunId }, select: { conversationId: true } });
    if (projectedRun && !inspection && !isPlan) await tx.conversationMessage.create({ data: { id: `rtresult_${body.executionId}`, conversationId: projectedRun.conversationId, senderId: "trusted-runtime", senderType: "assistant",
      content: `${e.attribution.tool}: ${state}. Verification: ${finished.verificationState}. Exit: ${body.exitCode ?? "not applicable"}. Duration: ${body.durationMs} ms. See the execution receipt for actual output.`, metadata: { runtimeAction: true, agentRunId: e.attribution.agentRunId, executionId: body.executionId } } });
    return { state, verificationState: finished.verificationState };
  }
  private validateResult(r: RuntimeResult) {
    if (!r.verificationResult || typeof r.verificationResult !== "object" || Array.isArray(r.verificationResult) || !r.result || typeof r.result !== "object" || Array.isArray(r.result) ||
      !["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "OUTCOME_UNKNOWN"].includes(r.state) || !["VERIFIED", "FAILED", "NOT_VERIFIED"].includes(r.verificationState) ||
      typeof r.stdout !== "string" || typeof r.stderr !== "string" || Buffer.byteLength(r.stdout) > RUNTIME_LIMITS.outputBytes || Buffer.byteLength(r.stderr) > RUNTIME_LIMITS.outputBytes ||
      !Number.isFinite(r.durationMs) || r.durationMs < 0 || !Number.isFinite(Date.parse(r.startedAt)) || !Number.isFinite(Date.parse(r.finishedAt)) || Date.parse(r.finishedAt) < Date.parse(r.startedAt) ||
      (r.exitCode !== null && !Number.isInteger(r.exitCode)) || (r.pid !== null && (!Number.isInteger(r.pid) || r.pid <= 0)) || typeof r.truncated !== "boolean" ||
      (r.error !== null && (typeof r.error !== "string" || r.error.length > 2048))) runtimeError("RUNTIME_RESULT_INVALID");
  }
  private verified(a: RuntimeAttribution, r: RuntimeResult): boolean {
    if (r.state !== "SUCCEEDED" || r.verificationState !== "VERIFIED") return false;
    const v = r.verificationResult;
    if (["filesystem.write", "filesystem.create"].includes(a.tool)) return v.exists === true && v.sha256 === createHash("sha256").update(String(a.validatedInput.content), "utf8").digest("hex");
    if (a.tool === "filesystem.delete") return v.notFound === true;
    if (a.tool === "filesystem.move") return v.sourceAbsent === true && v.destinationExists === true && typeof v.sha256 === "string" && /^[a-f0-9]{64}$/.test(v.sha256);
    if (a.tool === "filesystem.copy") return v.destinationExists === true && v.sourceHash === v.destinationHash && typeof v.sourceHash === "string" && /^[a-f0-9]{64}$/.test(v.sourceHash);
    if (a.tool === "terminal.execute") return r.exitCode === 0 && v.exitCode === 0;
    return v.observed === true;
  }
  async unknown(tx: any, record: RuntimeRecord<RuntimeExecution>, reason: string) {
    const e = record.payload;
    if (TERMINAL_RUNTIME_STATES.includes(e.state)) return;
    await this.ledger.update(tx, record, { ...e, state: "OUTCOME_UNKNOWN", error: reason, finishedAt: new Date().toISOString(), cancellationState: e.cancellationState === "REQUESTED" ? "UNKNOWN" : e.cancellationState, verificationState: "NOT_VERIFIED" }, `${e.attribution.runtimeId}:settled`);
    await this.control.event(tx, e.attribution.agentRunId, "EXECUTION_OUTCOME_UNKNOWN", { executionId: e.attribution.executionId, reason });
    await executionPhaseTx(tx, e.attribution.agentRunId, "OUTCOME_UNKNOWN");
    await tx.agentRun.updateMany({ where: { id: e.attribution.agentRunId }, data: { status: "FAILED", failureReason: "OUTCOME_UNKNOWN", completedAt: new Date() } });
  }
  private async touch(tx: any, device: RuntimeDevice) {
    if (device.lastSeenAt && Date.parse(device.lastSeenAt) + RUNTIME_LIMITS.heartbeatMs > Date.now()) return;
    const record = await this.identity.device(tx, device.runtimeId);
    await this.ledger.update(tx, record, { ...record.payload, lastSeenAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
}
