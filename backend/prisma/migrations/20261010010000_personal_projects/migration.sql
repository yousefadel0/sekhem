-- Existing projects remain shared. New personal projects have an explicit owner.
ALTER TABLE "Project" ADD COLUMN "personalOwnerId" TEXT;
CREATE INDEX "Project_personalOwnerId_idx" ON "Project"("personalOwnerId");
