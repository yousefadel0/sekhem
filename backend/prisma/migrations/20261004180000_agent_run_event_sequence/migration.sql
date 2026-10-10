BEGIN;
-- statement
ALTER TABLE "AgentRun" ADD COLUMN "eventSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "eventTerminalSeq" INTEGER;
-- statement
ALTER TABLE "AgentRunEvent" ADD COLUMN "seq" INTEGER NOT NULL DEFAULT 0;
-- statement
LOCK TABLE "AgentRunEvent" IN ACCESS EXCLUSIVE MODE;
-- statement
-- Historical ordering is reconstructed once; new append order is server-owned.
WITH ordered AS (
 SELECT "id", row_number() OVER (PARTITION BY "agentRunId" ORDER BY "timestamp", "id") AS n
 FROM "AgentRunEvent"
)
UPDATE "AgentRunEvent" e SET "seq" = ordered.n FROM ordered WHERE e."id" = ordered."id";
-- statement
UPDATE "AgentRun" r SET "eventSeq" = COALESCE((SELECT max(e."seq") FROM "AgentRunEvent" e WHERE e."agentRunId" = r."id"), 0);
-- statement
UPDATE "AgentRun" SET "eventTerminalSeq" = "eventSeq" WHERE "status" IN ('COMPLETED', 'FAILED', 'CANCELLED');
-- statement
DROP INDEX IF EXISTS "AgentRunEvent_agentRunId_timestamp_idx";
-- statement
CREATE UNIQUE INDEX "AgentRunEvent_agentRunId_seq_key" ON "AgentRunEvent"("agentRunId", "seq");
-- statement
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_seq_positive" CHECK ("seq" > 0);
-- statement
CREATE FUNCTION sekhem_agent_event_sequence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- UPDATE obtains the per-run row lock and rolls back with the append transaction.
 -- Ignore supplied seq: callers cannot select, skip or reuse sequence numbers.
 UPDATE "AgentRun" SET "eventSeq" = "eventSeq" + 1,
   "eventTerminalSeq" = CASE WHEN "status" IN ('COMPLETED', 'FAILED', 'CANCELLED')
     THEN "eventSeq" + 1 ELSE NULL END
 WHERE "id" = NEW."agentRunId" RETURNING "eventSeq" INTO NEW."seq";
 IF NOT FOUND THEN RAISE EXCEPTION 'AGENT_RUN_REQUIRED'; END IF;
 RETURN NEW;
END $$;
-- statement
CREATE TRIGGER "AgentRunEvent_sequence" BEFORE INSERT ON "AgentRunEvent"
FOR EACH ROW EXECUTE FUNCTION sekhem_agent_event_sequence();
-- statement
CREATE FUNCTION sekhem_agent_event_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."seq" <> OLD."seq" OR NEW."agentRunId" <> OLD."agentRunId" THEN
   RAISE EXCEPTION 'AGENT_EVENT_SEQUENCE_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;
-- statement
CREATE TRIGGER "AgentRunEvent_sequence_immutable" BEFORE UPDATE ON "AgentRunEvent"
FOR EACH ROW EXECUTE FUNCTION sekhem_agent_event_identity();
-- statement
CREATE FUNCTION sekhem_agent_terminal_watermark() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW."eventTerminalSeq" = CASE WHEN NEW."status" IN ('COMPLETED', 'FAILED', 'CANCELLED')
   THEN NEW."eventSeq" ELSE NULL END;
 RETURN NEW;
END $$;
-- statement
CREATE TRIGGER "AgentRun_terminal_watermark" BEFORE UPDATE OF "status" ON "AgentRun"
FOR EACH ROW EXECUTE FUNCTION sekhem_agent_terminal_watermark();

COMMIT;
