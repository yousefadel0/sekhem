-- SEKHEM Task 4C: Persistent Conversation Attachments
-- Migration: 20260917120000_add_conversation_attachment
-- Additive migration. No tables dropped. No data modified.

CREATE TABLE IF NOT EXISTS "ConversationAttachment" (
  "id"               TEXT NOT NULL,
  "conversationId"   TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "fileName"         TEXT NOT NULL,
  "mimeType"         TEXT NOT NULL,
  "fileSize"         INTEGER NOT NULL,
  "category"         TEXT NOT NULL,
  "storageKey"       TEXT NOT NULL,
  "extractedText"    TEXT,
  "hasExtractedText" BOOLEAN NOT NULL DEFAULT false,
  "isScanned"        BOOLEAN NOT NULL DEFAULT false,
  "metadata"         JSONB NOT NULL DEFAULT '{}',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversationAttachment_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConversationAttachment_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ConversationAttachment_conversationId_idx"
  ON "ConversationAttachment"("conversationId");

CREATE INDEX IF NOT EXISTS "ConversationAttachment_userId_idx"
  ON "ConversationAttachment"("userId");
