-- FP-01 Workflow Runtime + Persistence
-- Additive migration plan only. Do not apply without explicit PM migration approval.
-- Safety: creates new tables and indexes only; no destructive changes, no data deletion, no reset.

CREATE TABLE IF NOT EXISTS "WorkflowRun" (
  "id" TEXT PRIMARY KEY,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "initiativeSlug" TEXT,
  "requestedBy" TEXT NOT NULL,
  "requestedRole" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "WorkflowCallback" (
  "id" TEXT PRIMARY KEY,
  "workflowRunId" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "taskId" TEXT,
  "step" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "resultSummary" TEXT,
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "error" JSONB,
  "blocker" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowCallback_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WorkflowRunState" (
  "id" TEXT PRIMARY KEY,
  "workflowRunId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "resultSummary" TEXT,
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "error" JSONB,
  "blocker" JSONB,
  "blockerId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowRunState_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DO $$
BEGIN
  IF to_regclass('"Blocker"') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'WorkflowRunState_blockerId_fkey'
        AND conrelid = '"WorkflowRunState"'::regclass
    )
  THEN
    ALTER TABLE "WorkflowRunState"
      ADD CONSTRAINT "WorkflowRunState_blockerId_fkey"
      FOREIGN KEY ("blockerId") REFERENCES "Blocker"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "WorkflowCallbackIdempotency" (
  "workflowRunId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "callbackId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowCallbackIdempotency_pkey" PRIMARY KEY ("workflowRunId", "idempotencyKey"),
  CONSTRAINT "WorkflowCallbackIdempotency_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkflowCallbackIdempotency_callbackId_fkey" FOREIGN KEY ("callbackId") REFERENCES "WorkflowCallback"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WorkflowRun_status_idx" ON "WorkflowRun"("status");
CREATE INDEX IF NOT EXISTS "WorkflowRun_projectId_idx" ON "WorkflowRun"("projectId");
CREATE INDEX IF NOT EXISTS "WorkflowRun_initiativeSlug_idx" ON "WorkflowRun"("initiativeSlug");
CREATE INDEX IF NOT EXISTS "WorkflowCallback_workflowRunId_idx" ON "WorkflowCallback"("workflowRunId");
CREATE INDEX IF NOT EXISTS "WorkflowCallback_issueId_idx" ON "WorkflowCallback"("issueId");
CREATE INDEX IF NOT EXISTS "WorkflowCallback_status_idx" ON "WorkflowCallback"("status");
CREATE INDEX IF NOT EXISTS "WorkflowRunState_workflowRunId_idx" ON "WorkflowRunState"("workflowRunId");
CREATE INDEX IF NOT EXISTS "WorkflowRunState_status_idx" ON "WorkflowRunState"("status");
CREATE INDEX IF NOT EXISTS "WorkflowRunState_blockerId_idx" ON "WorkflowRunState"("blockerId");
