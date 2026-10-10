ALTER TABLE "AiProviderConfiguration"
ADD COLUMN "structuredOutputDialect" TEXT,
ADD COLUMN "structuredOutputVerifiedAt" TIMESTAMP(3);
