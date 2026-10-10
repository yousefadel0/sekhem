-- Restore the current AuditEvent columns omitted from a fresh local baseline.
ALTER TABLE "AuditEvent"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "riskLevel" "RiskLevel" DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS "sourceType" "SourceType" NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
