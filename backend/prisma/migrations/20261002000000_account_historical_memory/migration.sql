CREATE TABLE "HistoricalMemoryItem" (
  "id" TEXT PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "derivationKey" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "scope" TEXT NOT NULL CHECK ("scope" IN ('USER_GLOBAL','PROJECT','WORKSPACE')),
  "organizationId" TEXT, "projectId" TEXT, "workspaceId" TEXT, "bindingVersion" INTEGER,
  "entity" TEXT NOT NULL CHECK (length("entity") BETWEEN 1 AND 128),
  "aliases" TEXT[] NOT NULL CHECK (cardinality("aliases") BETWEEN 1 AND 8 AND length(array_to_string("aliases",' ')) <= 512),
  "summary" TEXT NOT NULL CHECK (length("summary") BETWEEN 1 AND 768),
  "category" TEXT NOT NULL CHECK ("category" IN ('STATEMENT','DECISION','RECORDED_OUTCOME')),
  "sourceEventAt" TIMESTAMPTZ NOT NULL,
  "sourceConversationId" TEXT NOT NULL, "sourceMessageId" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL, "sourceRevision" TEXT NOT NULL, "extractorVersion" TEXT NOT NULL,
  "derivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retentionState" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("retentionState" IN ('ACTIVE','FORGOTTEN','SUPERSEDED')),
  "sourceDeleted" BOOLEAN NOT NULL DEFAULT false,
  "searchDocument" TSVECTOR,
  CHECK (("scope"='USER_GLOBAL' AND "organizationId" IS NULL AND "projectId" IS NULL AND "workspaceId" IS NULL AND "bindingVersion" IS NULL)
    OR ("scope"='PROJECT' AND "organizationId" IS NOT NULL AND "projectId" IS NOT NULL AND "workspaceId" IS NULL AND "bindingVersion" IS NULL)
    OR ("scope"='WORKSPACE' AND "organizationId" IS NOT NULL AND "projectId" IS NOT NULL AND "workspaceId" IS NOT NULL AND "bindingVersion" IS NOT NULL AND "bindingVersion">0))
);
CREATE INDEX "HistoricalMemoryItem_scope_idx" ON "HistoricalMemoryItem" ("userId","scope","organizationId","projectId","entity","sourceEventAt");
CREATE INDEX "HistoricalMemoryItem_source_idx" ON "HistoricalMemoryItem" ("userId","sourceConversationId");
CREATE INDEX "HistoricalMemoryItem_search_idx" ON "HistoricalMemoryItem" USING GIN ("searchDocument");
-- Trigger avoids non-immutable generated expressions; every lexical document remains derived.
CREATE FUNCTION historical_memory_search_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchDocument" := to_tsvector('simple', NEW."entity" || ' ' || array_to_string(NEW."aliases",' ') || ' ' || NEW."summary");
  RETURN NEW;
END $$;
CREATE TRIGGER historical_memory_search BEFORE INSERT OR UPDATE OF "entity","aliases","summary"
ON "HistoricalMemoryItem" FOR EACH ROW EXECUTE FUNCTION historical_memory_search_document();
-- Covers explicit deletion and cascaded source deletion without retaining source prose.
CREATE FUNCTION historical_memory_source_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "HistoricalMemoryItem" SET "sourceDeleted"=true WHERE "sourceConversationId"=OLD."id" AND "userId"=OLD."userId";
  RETURN OLD;
END $$;
CREATE TRIGGER historical_memory_source_deleted AFTER DELETE ON "Conversation"
FOR EACH ROW EXECUTE FUNCTION historical_memory_source_deleted();
