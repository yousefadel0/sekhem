-- SEKHEM Task 4B: Persistent Cross-Session User Memory
-- Migration: 20260917000000_add_user_memory
-- Additive migration. No tables dropped. No data modified.

-- Create UserMemory table (scoped by userId, one row per user+key)
CREATE TABLE IF NOT EXISTS "UserMemory" (
  "id"                   TEXT NOT NULL,
  "userId"               TEXT NOT NULL,
  "key"                  TEXT NOT NULL,
  "value"                TEXT NOT NULL,
  "sourceConversationId" TEXT,
  "confidence"           DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Unique index: one active value per canonical key per user (enables safe upsert)
CREATE UNIQUE INDEX IF NOT EXISTS "UserMemory_userId_key_key"
  ON "UserMemory"("userId", "key");

-- Performance index: fast per-user memory retrieval
CREATE INDEX IF NOT EXISTS "UserMemory_userId_idx"
  ON "UserMemory"("userId");
