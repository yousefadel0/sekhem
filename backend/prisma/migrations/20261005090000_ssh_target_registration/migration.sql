BEGIN;
-- statement
CREATE TABLE "SshTarget" (
 "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE RESTRICT,
 "organizationId" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "version" INTEGER NOT NULL CHECK ("version" > 0)
);
-- statement
CREATE INDEX "SshTarget_projectId_organizationId_idx" ON "SshTarget"("projectId", "organizationId");
-- statement
CREATE TABLE "SshTargetRevision" (
 "targetId" TEXT NOT NULL REFERENCES "SshTarget"("id") ON DELETE RESTRICT,
 "version" INTEGER NOT NULL CHECK ("version" > 0), "configuration" JSONB NOT NULL,
 "digest" TEXT NOT NULL, "actorId" TEXT NOT NULL, "sessionId" TEXT NOT NULL,
 "requestId" TEXT NOT NULL, "requestDigest" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("targetId", "version"), UNIQUE ("targetId", "requestId")
);
-- statement
CREATE TABLE "SshConnectionValidation" (
 "id" TEXT PRIMARY KEY, "targetId" TEXT NOT NULL REFERENCES "SshTarget"("id") ON DELETE RESTRICT,
 "targetVersion" INTEGER NOT NULL, "targetDigest" TEXT NOT NULL, "requestId" TEXT NOT NULL,
 "requestDigest" TEXT NOT NULL, "actorId" TEXT NOT NULL, "sessionId" TEXT NOT NULL,
 "status" TEXT NOT NULL CHECK ("status" IN ('PENDING','VERIFIED','HOST_KEY_MISMATCH','AUTHENTICATION_FAILED','CONNECTION_FAILED','TIMEOUT','CREDENTIAL_UNAVAILABLE','STALE')),
 "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
 UNIQUE ("targetId", "requestId"),
 FOREIGN KEY ("targetId", "targetVersion") REFERENCES "SshTargetRevision"("targetId", "version")
);
-- statement
CREATE FUNCTION "ssh_revision_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SSH target revisions are immutable'; END $$;
-- statement
CREATE TRIGGER "ssh_revision_immutable" BEFORE UPDATE OR DELETE ON "SshTargetRevision" FOR EACH ROW EXECUTE FUNCTION "ssh_revision_immutable"();
-- statement
CREATE FUNCTION "ssh_validation_terminal"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'SSH validations are durable'; END IF;
 IF OLD."status" <> 'PENDING' OR NEW."status" = 'PENDING' OR NEW."completedAt" IS NULL OR
    (to_jsonb(NEW) - 'status' - 'completedAt') <> (to_jsonb(OLD) - 'status' - 'completedAt') THEN
   RAISE EXCEPTION 'SSH validation transition invalid';
 END IF;
 RETURN NEW;
END $$;
-- statement
CREATE TRIGGER "ssh_validation_terminal" BEFORE UPDATE OR DELETE ON "SshConnectionValidation" FOR EACH ROW EXECUTE FUNCTION "ssh_validation_terminal"();
COMMIT;
