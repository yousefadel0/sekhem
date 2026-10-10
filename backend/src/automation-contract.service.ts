import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "./data-access/prisma.service";
import { auditEvents, initiatives, projects } from "./data/seed-data";
import type { AuditEventDto } from "./dto";
import { contractActivity, memoRequests, recordedSystemEvents } from "./contract-memory";
import type {
  AiMemoPlaceholderDto,
  AiMemoRequestDto,
  ContractActivityEventDto,
  SystemEventDto,
  SystemEventRequestDto,
  WorkflowCallbackBlockerDto,
  WorkflowCallbackErrorDto,
  WorkflowCallbackEvidenceDto,
  WorkflowCallbackRequestDto,
  WorkflowCallbackResponseDto,
  WorkflowCallbackStatusDto,
  WorkflowCallbackStoredDto,
  WorkflowEventRequestDto,
  WorkflowRunDto
} from "./automation-dto";
import { createWorkflowRuntimeStore, type WorkflowRuntimeStore } from "./workflow-runtime.store";

const WORKFLOW_CALLBACK_STATUSES: WorkflowCallbackStatusDto[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "blocked",
  "cancelled",
  "timed_out"
];

const WORKFLOW_CALLBACK_EVIDENCE_TYPES = ["log", "file", "url", "test", "artifact", "note"];
const WORKFLOW_CALLBACK_BLOCKER_SEVERITIES = ["low", "medium", "high", "critical"];
const FORBIDDEN_CALLBACK_KEYS = ["rawHtml", "rawContent", "fullHeaders", "secrets", "token", "cookie", "credentials", "connectionString", "env"];
const FORBIDDEN_CALLBACK_VALUE_PATTERNS = [
  /database_url\s*[:=]/i,
  /api[_ -]?key\s*[:=]/i,
  /token\s*[:=]/i,
  /password\s*[:=]/i,
  /secret\s*[:=]/i,
  /cookie\s*[:=]/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bat\s+\S+\s*\([^)]*:\d+:\d+\)/
];

@Injectable()
export class AutomationContractService {
  private workflowRuntimeStorePromise: Promise<WorkflowRuntimeStore>;

  constructor(@Optional() @Inject(PrismaService) private readonly prismaService?: PrismaService) {
    this.workflowRuntimeStorePromise = createWorkflowRuntimeStore(this.prismaService);
  }

  setWorkflowRuntimeStoreForTest(store: WorkflowRuntimeStore): void {
    this.workflowRuntimeStorePromise = Promise.resolve(store);
  }

  recordAiGatewayPreviewActivity(
    actor: string,
    action: string,
    target: string,
    title: string,
    description: string,
    status: ContractActivityEventDto["status"]
  ): { auditEvent: AuditEventDto; activityEvent: ContractActivityEventDto } {
    return {
      auditEvent: this.audit(undefined, actor, action, target, "AI Gateway Preview", description, status === "blocked" ? "high" : "low"),
      activityEvent: this.activity(undefined, undefined, "ai_gateway", title, description, status)
    };
  }

  async recordWorkflowEvent(body: WorkflowEventRequestDto): Promise<{ data: WorkflowRunDto; auditEvent: AuditEventDto; activityEvent: ContractActivityEventDto }> {
    this.requireWorkflowBody(body);
    const workflowRuntimeStore = await this.getWorkflowRuntimeStore();
    const now = this.now();
    const run: WorkflowRunDto = {
      id: `workflow-run-${Date.now()}`,
      eventType: body.eventType,
      status: "queued",
      projectId: body.projectId,
      initiativeSlug: body.initiativeSlug,
      requestedBy: body.requestedBy,
      requestedRole: body.requestedRole,
      createdAt: now,
      updatedAt: now,
      note: "Workflow run accepted into durable runtime store. No workflow runtime executed by this endpoint."
    };
    const persistedRun = await workflowRuntimeStore.createRun(run);

    return {
      data: persistedRun,
      auditEvent: this.audit(persistedRun.projectId, body.requestedBy, "workflow_event_accepted", persistedRun.id, "Workflow Contracts", persistedRun.note),
      activityEvent: this.activity(persistedRun.projectId, persistedRun.initiativeSlug, "workflow", "Workflow event accepted", persistedRun.note, "queued")
    };
  }

  async recordWorkflowCallback(body: unknown): Promise<WorkflowCallbackResponseDto> {
    const validationError = this.validateWorkflowCallbackBody(body);
    if (validationError) return validationError;

    const payload = body as WorkflowCallbackRequestDto;
    const workflowRuntimeStore = await this.getWorkflowRuntimeStore();
    const transitionError = await this.validateWorkflowCallbackTransition(payload, workflowRuntimeStore);
    if (transitionError) return transitionError;

    const payloadHash = this.payloadHash(payload);
    const duplicate = await workflowRuntimeStore.getIdempotency(payload.workflowRunId, payload.idempotencyKey);

    if (duplicate) {
      if (duplicate.payloadHash === payloadHash) {
        return {
          accepted: true,
          workflowRunId: duplicate.workflowRunId,
          status: duplicate.status,
          duplicate: true
        };
      }

      return {
        accepted: false,
        workflowRunId: payload.workflowRunId,
        status: "rejected",
        duplicate: false,
        code: "IDEMPOTENCY_CONFLICT",
        message: "Callback was already submitted with different content."
      };
    }

    const stored: WorkflowCallbackStoredDto = {
      ...payload,
      payloadHash,
      acceptedAt: this.now()
    };
    await workflowRuntimeStore.storeCallback(stored);

    this.audit(undefined, "workflow_runtime_private_manual", "workflow_callback_accepted", payload.workflowRunId, "Workflow Callback", `Callback accepted for ${payload.issueId} at step ${payload.step}.`, payload.status === "blocked" || payload.status === "failed" || payload.status === "timed_out" ? "high" : "medium");
    this.activity(undefined, undefined, payload.status === "blocked" ? "blocker" : "workflow", "Workflow callback accepted", `Manual/internal callback accepted for ${payload.issueId}.`, payload.status === "blocked" ? "blocked" : "accepted");

    return {
      accepted: true,
      workflowRunId: payload.workflowRunId,
      status: payload.status,
      duplicate: false
    };
  }

  async listWorkflowRuns(): Promise<WorkflowRunDto[]> {
    const workflowRuntimeStore = await this.getWorkflowRuntimeStore();
    return workflowRuntimeStore.listRuns();
  }

  async getWorkflowRun(id: string): Promise<WorkflowRunDto> {
    const workflowRuntimeStore = await this.getWorkflowRuntimeStore();
    const run = await workflowRuntimeStore.getRun(id);
    if (!run) {
      throw new NotFoundException("Workflow run not found");
    }
    return run;
  }

  requestAiMemo(body: AiMemoRequestDto): { data: AiMemoPlaceholderDto; auditEvent: AuditEventDto; activityEvent: ContractActivityEventDto } {
    this.requireMemoBody(body);
    const now = this.now();
    const memo: AiMemoPlaceholderDto = {
      id: `ai-memo-${Date.now()}-${memoRequests.length + 1}`,
      projectId: body.projectId,
      initiativeSlug: body.initiativeSlug,
      memoType: body.memoType,
      status: "queued",
      requestedBy: body.requestedBy,
      requestedRole: body.requestedRole,
      promptSummary: body.promptSummary,
      sourceRefs: body.sourceRefs ?? [],
      createdAt: now,
      updatedAt: now,
      note: "AI memo request accepted as placeholder only. No AI provider executed."
    };
    memoRequests.push(memo);

    return {
      data: memo,
      auditEvent: this.audit(memo.projectId, body.requestedBy, "ai_memo_request_accepted", memo.id, "AI Memo Contracts", memo.note),
      activityEvent: this.activity(memo.projectId, memo.initiativeSlug, "ai_memo", "AI memo request accepted", memo.note, "queued")
    };
  }

  getAiMemo(id: string): AiMemoPlaceholderDto {
    const memo = memoRequests.find((item) => item.id === id);
    if (!memo) {
      throw new NotFoundException("AI memo placeholder not found");
    }
    return memo;
  }

  recordSystemEvent(body: SystemEventRequestDto): { data: SystemEventDto; auditEvent: AuditEventDto; activityEvent: ContractActivityEventDto } {
    this.requireSystemBody(body);
    const event: SystemEventDto = {
      id: `system-event-${Date.now()}-${recordedSystemEvents.length + 1}`,
      eventType: body.eventType,
      projectId: body.projectId,
      initiativeSlug: body.initiativeSlug,
      severity: body.severity,
      actor: body.actor,
      source: body.source,
      summary: body.summary,
      createdAt: this.now(),
      note: "System event recorded locally only."
    };
    recordedSystemEvents.push(event);

    return {
      data: event,
      auditEvent: this.audit(event.projectId, body.actor, "system_event_recorded", event.id, "System Events", event.summary, event.severity),
      activityEvent: this.activity(event.projectId, event.initiativeSlug, "system", "System event recorded", event.note, "placeholder_recorded")
    };
  }

  private validateWorkflowCallbackBody(value: unknown): WorkflowCallbackResponseDto | null {
    if (!this.isRecord(value)) return this.rejected("VALIDATION_ERROR", "Callback payload is invalid.");
    if (this.hasUnsafeCallbackContent(value)) return this.rejected("VALIDATION_ERROR", "Callback payload is invalid.");

    const workflowRunId = this.stringField(value, "workflowRunId");
    const issueId = this.stringField(value, "issueId");
    const taskId = value.taskId === undefined ? undefined : this.stringField(value, "taskId");
    const step = this.stringField(value, "step");
    const status = this.stringField(value, "status");
    const idempotencyKey = this.stringField(value, "idempotencyKey");
    const occurredAt = this.stringField(value, "occurredAt");

    if (!workflowRunId || !issueId || !step || !status || !idempotencyKey || !occurredAt) {
      return this.rejected("VALIDATION_ERROR", "Callback payload is invalid.");
    }

    if (!/^PROD-\d{2}\.\d{3}$/.test(issueId)) {
      return this.rejected("VALIDATION_ERROR", "Callback payload is invalid.");
    }

    if (taskId && !/^PROD-\d{2}\.\d{3}$/.test(taskId)) {
      return this.rejected("VALIDATION_ERROR", "Callback payload is invalid.");
    }

    if (!WORKFLOW_CALLBACK_STATUSES.includes(status as WorkflowCallbackStatusDto)) {
      return this.rejected("VALIDATION_ERROR", "Callback payload is invalid.");
    }

    if (Number.isNaN(Date.parse(occurredAt))) {
      return this.rejected("VALIDATION_ERROR", "Callback payload is invalid.");
    }

    const statusValue = status as WorkflowCallbackStatusDto;
    const resultSummary = value.resultSummary === undefined ? undefined : this.stringField(value, "resultSummary");
    if (statusValue === "succeeded" && !resultSummary) {
      return this.rejected("VALIDATION_ERROR", "Callback payload is invalid.");
    }

    if ((statusValue === "failed" || statusValue === "timed_out") && !this.validCallbackError(value.error)) {
      return this.rejected("VALIDATION_ERROR", "Callback payload is invalid.");
    }

    if (statusValue === "blocked" && !this.validCallbackBlocker(value.blocker)) {
      return this.rejected("VALIDATION_ERROR", "Callback payload is invalid.");
    }

    if (value.evidence !== undefined && !this.validCallbackEvidence(value.evidence)) {
      return this.rejected("VALIDATION_ERROR", "Callback payload is invalid.");
    }

    return null;
  }

  private async validateWorkflowCallbackTransition(payload: WorkflowCallbackRequestDto, workflowRuntimeStore: WorkflowRuntimeStore): Promise<WorkflowCallbackResponseDto | null> {
    const previous = await workflowRuntimeStore.getLatestCallback(payload.workflowRunId);
    if (!previous) {
      return payload.status === "queued" || payload.status === "running"
        ? null
        : this.rejected("INVALID_TRANSITION", "Workflow state transition is not allowed.", payload.workflowRunId);
    }

    const allowedTransitions: Record<WorkflowCallbackStatusDto, WorkflowCallbackStatusDto[]> = {
      queued: ["running"],
      running: ["succeeded", "failed", "blocked", "cancelled", "timed_out"],
      succeeded: [],
      failed: ["blocked", "running"],
      blocked: ["running"],
      cancelled: [],
      timed_out: ["blocked"]
    };

    if (previous.status === payload.status || allowedTransitions[previous.status].includes(payload.status)) {
      return null;
    }

    return this.rejected("INVALID_TRANSITION", "Workflow state transition is not allowed.", payload.workflowRunId);
  }

  private validCallbackEvidence(value: unknown): value is WorkflowCallbackEvidenceDto[] {
    return Array.isArray(value) && value.every((item) => {
      if (!this.isRecord(item)) return false;
      return WORKFLOW_CALLBACK_EVIDENCE_TYPES.includes(String(item.type)) && Boolean(this.stringField(item, "label")) && Boolean(this.stringField(item, "value"));
    });
  }

  private validCallbackError(value: unknown): value is WorkflowCallbackErrorDto {
    if (!this.isRecord(value)) return false;
    return Boolean(this.stringField(value, "message"));
  }

  private validCallbackBlocker(value: unknown): value is WorkflowCallbackBlockerDto {
    if (!this.isRecord(value)) return false;
    return Boolean(this.stringField(value, "reason")) && Boolean(this.stringField(value, "owner")) && WORKFLOW_CALLBACK_BLOCKER_SEVERITIES.includes(String(value.severity)) && Boolean(this.stringField(value, "pmDecisionNeeded"));
  }

  private hasUnsafeCallbackContent(value: unknown): boolean {
    if (Array.isArray(value)) return value.some((item) => this.hasUnsafeCallbackContent(item));
    if (!this.isRecord(value)) {
      return typeof value === "string" && FORBIDDEN_CALLBACK_VALUE_PATTERNS.some((pattern) => pattern.test(value));
    }

    return Object.entries(value).some(([key, nestedValue]) => {
      if (FORBIDDEN_CALLBACK_KEYS.some((field) => field.toLowerCase() === key.toLowerCase())) return true;
      return this.hasUnsafeCallbackContent(nestedValue);
    });
  }

  private rejected(code: WorkflowCallbackResponseDto["code"], message: string, workflowRunId?: string): WorkflowCallbackResponseDto {
    return {
      accepted: false,
      workflowRunId,
      status: "rejected",
      duplicate: false,
      code,
      message
    };
  }

  private payloadHash(payload: WorkflowCallbackRequestDto): string {
    return createHash("sha256").update(this.stableStringify(payload)).digest("hex");
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(",")}]`;
    if (!this.isRecord(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`).join(",")}}`;
  }

  private stringField(value: Record<string, unknown>, field: string): string | null {
    const fieldValue = value[field];
    return typeof fieldValue === "string" && fieldValue.trim().length > 0 ? fieldValue : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private requireWorkflowBody(body: WorkflowEventRequestDto): void {
    this.requireString(body.eventType, "eventType");
    this.requireString(body.projectId, "projectId");
    this.requireString(body.requestedBy, "requestedBy");
    this.requireString(body.requestedRole, "requestedRole");
    this.requireProject(body.projectId);
    this.requireInitiative(body.initiativeSlug);
  }

  private requireMemoBody(body: AiMemoRequestDto): void {
    this.requireString(body.projectId, "projectId");
    this.requireString(body.initiativeSlug, "initiativeSlug");
    this.requireString(body.memoType, "memoType");
    this.requireString(body.requestedBy, "requestedBy");
    this.requireString(body.requestedRole, "requestedRole");
    this.requireString(body.promptSummary, "promptSummary");
    this.requireProject(body.projectId);
    this.requireInitiative(body.initiativeSlug);
  }

  private requireSystemBody(body: SystemEventRequestDto): void {
    this.requireString(body.eventType, "eventType");
    this.requireString(body.actor, "actor");
    this.requireString(body.source, "source");
    this.requireString(body.severity, "severity");
    this.requireString(body.summary, "summary");
    if (body.projectId) this.requireProject(body.projectId);
    this.requireInitiative(body.initiativeSlug);
  }

  private requireProject(projectId: string): void {
    if (!projects.some((item) => item.id === projectId || item.slug === projectId)) {
      throw new BadRequestException("projectId is invalid");
    }
  }

  private requireInitiative(initiativeSlug?: string): void {
    if (initiativeSlug && !initiatives.some((item) => item.slug === initiativeSlug || item.id === initiativeSlug)) {
      throw new BadRequestException("initiativeSlug is invalid");
    }
  }

  private getWorkflowRuntimeStore(): Promise<WorkflowRuntimeStore> {
    return this.workflowRuntimeStorePromise;
  }

  private audit(projectId: string | undefined, actor: string, action: string, target: string, module: string, details: string, riskLevel: AuditEventDto["riskLevel"] = "medium"): AuditEventDto {
    const event: AuditEventDto = {
      id: `audit-contract-${Date.now()}-${auditEvents.length + 1}`,
      projectId,
      timestamp: this.now(),
      action,
      actor,
      actorType: "user",
      target,
      module,
      details,
      riskLevel,
      sourceType: "manual"
    };
    auditEvents.push(event);
    return event;
  }

  private activity(projectId: string | undefined, initiativeSlug: string | undefined, type: ContractActivityEventDto["type"], title: string, description: string, status: ContractActivityEventDto["status"]): ContractActivityEventDto {
    const event: ContractActivityEventDto = {
      id: `activity-contract-${Date.now()}-${contractActivity.length + 1}`,
      projectId,
      initiativeSlug,
      type,
      title,
      description,
      sourceType: "system",
      status,
      createdAt: this.now()
    };
    contractActivity.push(event);
    return event;
  }

  private requireString(value: unknown, field: string): void {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required`);
    }
  }

  private now(): string {
    return new Date().toISOString();
  }
}
