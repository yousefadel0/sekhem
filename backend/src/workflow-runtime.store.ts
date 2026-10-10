import { randomUUID } from "node:crypto";
import type { WorkflowCallbackRequestDto, WorkflowCallbackStoredDto, WorkflowRunDto } from "./automation-dto";
import { RuntimeConfigService } from "./runtime-config.service";

export interface WorkflowRuntimeStore {
  createRun(run: WorkflowRunDto): Promise<WorkflowRunDto>;
  listRuns(): Promise<WorkflowRunDto[]>;
  getRun(id: string): Promise<WorkflowRunDto | null>;
  getLatestCallback(workflowRunId: string): Promise<WorkflowCallbackStoredDto | null>;
  getIdempotency(workflowRunId: string, idempotencyKey: string): Promise<WorkflowCallbackStoredDto | null>;
  storeCallback(callback: WorkflowCallbackStoredDto): Promise<void>;
}

type RawQuery = <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
type RawExecute = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

type WorkflowRuntimePrismaClient = {
  $queryRaw: RawQuery;
  $executeRaw: RawExecute;
  $transaction: <T>(fn: (tx: { $executeRaw: RawExecute; $queryRaw: RawQuery }) => Promise<T>) => Promise<T>;
};

type WorkflowRunRow = {
  id: string;
  eventType: string;
  status: string;
  projectId: string;
  initiativeSlug: string | null;
  requestedBy: string;
  requestedRole: string;
  note: string;
  createdAt: Date;
  updatedAt: Date;
};

type WorkflowCallbackRow = {
  workflowRunId: string;
  issueId: string;
  taskId: string | null;
  step: string;
  status: WorkflowCallbackStoredDto["status"];
  resultSummary: string | null;
  evidence: unknown;
  error: unknown;
  blocker: unknown;
  idempotencyKey: string;
  occurredAt: Date;
  payloadHash: string;
  acceptedAt: Date;
};

export async function createWorkflowRuntimeStore(prisma?: WorkflowRuntimePrismaClient): Promise<WorkflowRuntimeStore> {
  const config = new RuntimeConfigService().load();
  const persistenceEnabled = config.runtimeMode === "postgres_read" && config.dataSource === "postgres_read" && config.dbWriteMode === "rd_radar_only";

  if (persistenceEnabled) {
    if (!prisma) {
      throw new Error("Prisma client required for persistent workflow runtime store");
    }
    return new PrismaWorkflowRuntimeStore(prisma);
  }

  return new InProcessWorkflowRuntimeStore();
}

export class InProcessWorkflowRuntimeStore implements WorkflowRuntimeStore {
  private readonly runs = new Map<string, WorkflowRunDto>();
  private readonly callbacks: WorkflowCallbackStoredDto[] = [];
  private readonly idempotency = new Map<string, WorkflowCallbackStoredDto>();

  async createRun(run: WorkflowRunDto): Promise<WorkflowRunDto> {
    this.runs.set(run.id, run);
    return run;
  }

  async listRuns(): Promise<WorkflowRunDto[]> {
    return [...this.runs.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getRun(id: string): Promise<WorkflowRunDto | null> {
    return this.runs.get(id) ?? null;
  }

  async getLatestCallback(workflowRunId: string): Promise<WorkflowCallbackStoredDto | null> {
    return [...this.callbacks].reverse().find((item) => item.workflowRunId === workflowRunId) ?? null;
  }

  async getIdempotency(workflowRunId: string, idempotencyKey: string): Promise<WorkflowCallbackStoredDto | null> {
    return this.idempotency.get(this.idempotencyStoreKey(workflowRunId, idempotencyKey)) ?? null;
  }

  async storeCallback(callback: WorkflowCallbackStoredDto): Promise<void> {
    const existingRun = this.runs.get(callback.workflowRunId);
    const now = new Date().toISOString();
    const run: WorkflowRunDto = existingRun ?? {
      id: callback.workflowRunId,
      eventType: "system.event_recorded",
      status: callback.status,
      projectId: "workflow-runtime-private",
      requestedBy: "workflow_runtime_private_manual",
      requestedRole: "system",
      createdAt: now,
      updatedAt: now,
      note: "Callback-created workflow runtime run. No public trigger executed."
    };

    this.runs.set(callback.workflowRunId, {
      ...run,
      status: callback.status,
      updatedAt: callback.acceptedAt
    });
    this.callbacks.push(callback);
    this.idempotency.set(this.idempotencyStoreKey(callback.workflowRunId, callback.idempotencyKey), callback);
  }

  private idempotencyStoreKey(workflowRunId: string, idempotencyKey: string): string {
    return `${workflowRunId}:${idempotencyKey}`;
  }
}

export class PrismaWorkflowRuntimeStore implements WorkflowRuntimeStore {
  constructor(private readonly prisma: WorkflowRuntimePrismaClient) {}

  async createRun(run: WorkflowRunDto): Promise<WorkflowRunDto> {
    await this.prisma.$executeRaw`
      INSERT INTO "WorkflowRun" (
        "id", "eventType", "status", "projectId", "initiativeSlug", "requestedBy", "requestedRole", "note", "createdAt", "updatedAt"
      ) VALUES (
        ${run.id}, ${run.eventType}, ${run.status}, ${run.projectId}, ${run.initiativeSlug ?? null}, ${run.requestedBy}, ${run.requestedRole}, ${run.note}, ${new Date(run.createdAt)}, ${new Date(run.updatedAt)}
      )
      ON CONFLICT ("id") DO UPDATE SET
        "eventType" = EXCLUDED."eventType",
        "status" = EXCLUDED."status",
        "projectId" = EXCLUDED."projectId",
        "initiativeSlug" = EXCLUDED."initiativeSlug",
        "requestedBy" = EXCLUDED."requestedBy",
        "requestedRole" = EXCLUDED."requestedRole",
        "note" = EXCLUDED."note",
        "updatedAt" = EXCLUDED."updatedAt"
    `;

    return run;
  }

  async listRuns(): Promise<WorkflowRunDto[]> {
    const rows = await this.prisma.$queryRaw<WorkflowRunRow[]>`
      SELECT "id", "eventType", "status", "projectId", "initiativeSlug", "requestedBy", "requestedRole", "note", "createdAt", "updatedAt"
      FROM "WorkflowRun"
      ORDER BY "createdAt" DESC
    `;

    return rows.map((row: WorkflowRunRow) => this.mapRun(row));
  }

  async getRun(id: string): Promise<WorkflowRunDto | null> {
    const rows = await this.prisma.$queryRaw<WorkflowRunRow[]>`
      SELECT "id", "eventType", "status", "projectId", "initiativeSlug", "requestedBy", "requestedRole", "note", "createdAt", "updatedAt"
      FROM "WorkflowRun"
      WHERE "id" = ${id}
      LIMIT 1
    `;

    return rows[0] ? this.mapRun(rows[0]) : null;
  }

  async getLatestCallback(workflowRunId: string): Promise<WorkflowCallbackStoredDto | null> {
    const rows = await this.prisma.$queryRaw<WorkflowCallbackRow[]>`
      SELECT "workflowRunId", "issueId", "taskId", "step", "status", "resultSummary", "evidence", "error", "blocker", "idempotencyKey", "occurredAt", "payloadHash", "acceptedAt"
      FROM "WorkflowCallback"
      WHERE "workflowRunId" = ${workflowRunId}
      ORDER BY "acceptedAt" DESC
      LIMIT 1
    `;

    return rows[0] ? this.mapCallback(rows[0]) : null;
  }

  async getIdempotency(workflowRunId: string, idempotencyKey: string): Promise<WorkflowCallbackStoredDto | null> {
    const rows = await this.prisma.$queryRaw<WorkflowCallbackRow[]>`
      SELECT callback."workflowRunId", callback."issueId", callback."taskId", callback."step", callback."status", callback."resultSummary", callback."evidence", callback."error", callback."blocker", callback."idempotencyKey", callback."occurredAt", callback."payloadHash", callback."acceptedAt"
      FROM "WorkflowCallbackIdempotency" idem
      JOIN "WorkflowCallback" callback ON callback."id" = idem."callbackId"
      WHERE idem."workflowRunId" = ${workflowRunId} AND idem."idempotencyKey" = ${idempotencyKey}
      LIMIT 1
    `;

    return rows[0] ? this.mapCallback(rows[0]) : null;
  }

  async storeCallback(callback: WorkflowCallbackStoredDto): Promise<void> {
    await this.ensureRunForCallback(callback);

    const callbackId = `workflow-callback-${randomUUID()}`;
    const stateId = `workflow-state-${randomUUID()}`;
    const occurredAt = new Date(callback.occurredAt);
    const acceptedAt = new Date(callback.acceptedAt);
    const evidenceJson = JSON.stringify(callback.evidence ?? []);
    const errorJson = callback.error ? JSON.stringify(callback.error) : null;
    const blockerJson = callback.blocker ? JSON.stringify(callback.blocker) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "WorkflowCallback" (
          "id", "workflowRunId", "issueId", "taskId", "step", "status", "resultSummary", "evidence", "error", "blocker", "idempotencyKey", "occurredAt", "payloadHash", "acceptedAt"
        ) VALUES (
          ${callbackId}, ${callback.workflowRunId}, ${callback.issueId}, ${callback.taskId ?? null}, ${callback.step}, ${callback.status}, ${callback.resultSummary ?? null}, ${evidenceJson}::jsonb, ${errorJson}::jsonb, ${blockerJson}::jsonb, ${callback.idempotencyKey}, ${occurredAt}, ${callback.payloadHash}, ${acceptedAt}
        )
      `;

      await tx.$executeRaw`
        INSERT INTO "WorkflowCallbackIdempotency" (
          "workflowRunId", "idempotencyKey", "payloadHash", "callbackId", "createdAt"
        ) VALUES (
          ${callback.workflowRunId}, ${callback.idempotencyKey}, ${callback.payloadHash}, ${callbackId}, ${acceptedAt}
        )
      `;

      await tx.$executeRaw`
        INSERT INTO "WorkflowRunState" (
          "id", "workflowRunId", "status", "step", "resultSummary", "evidence", "error", "blocker", "occurredAt", "createdAt"
        ) VALUES (
          ${stateId}, ${callback.workflowRunId}, ${callback.status}, ${callback.step}, ${callback.resultSummary ?? null}, ${evidenceJson}::jsonb, ${errorJson}::jsonb, ${blockerJson}::jsonb, ${occurredAt}, ${acceptedAt}
        )
      `;

      await tx.$executeRaw`
        UPDATE "WorkflowRun"
        SET "status" = ${callback.status}, "updatedAt" = ${acceptedAt}
        WHERE "id" = ${callback.workflowRunId}
      `;
    });
  }

  private async ensureRunForCallback(callback: WorkflowCallbackStoredDto): Promise<void> {
    const existing = await this.getRun(callback.workflowRunId);
    if (existing) return;

    await this.createRun({
      id: callback.workflowRunId,
      eventType: "system.event_recorded",
      status: callback.status,
      projectId: "workflow-runtime-private",
      requestedBy: "workflow_runtime_private_manual",
      requestedRole: "system",
      createdAt: callback.acceptedAt,
      updatedAt: callback.acceptedAt,
      note: "Callback-created workflow runtime run. No public trigger executed."
    });
  }

  private mapRun(row: WorkflowRunRow): WorkflowRunDto {
    return {
      id: row.id,
      eventType: row.eventType as WorkflowRunDto["eventType"],
      status: row.status as WorkflowRunDto["status"],
      projectId: row.projectId,
      initiativeSlug: row.initiativeSlug ?? undefined,
      requestedBy: row.requestedBy,
      requestedRole: row.requestedRole,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      note: row.note
    };
  }

  private mapCallback(row: WorkflowCallbackRow): WorkflowCallbackStoredDto {
    return {
      workflowRunId: row.workflowRunId,
      issueId: row.issueId,
      taskId: row.taskId ?? undefined,
      step: row.step,
      status: row.status,
      resultSummary: row.resultSummary ?? undefined,
      evidence: this.arrayOrEmpty(row.evidence) as WorkflowCallbackRequestDto["evidence"],
      error: this.objectOrUndefined(row.error) as WorkflowCallbackRequestDto["error"],
      blocker: this.objectOrUndefined(row.blocker) as WorkflowCallbackRequestDto["blocker"],
      idempotencyKey: row.idempotencyKey,
      occurredAt: row.occurredAt.toISOString(),
      payloadHash: row.payloadHash,
      acceptedAt: row.acceptedAt.toISOString()
    };
  }

  private arrayOrEmpty(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private objectOrUndefined(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  }
}
