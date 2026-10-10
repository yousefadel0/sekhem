CREATE TABLE "AiProviderConfiguration" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "encryptedApiKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "healthState" TEXT NOT NULL DEFAULT 'untested',
    "defaultTimeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "AiProviderConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiModelConfiguration" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultForProvider" BOOLEAN NOT NULL DEFAULT false,
    "contextWindow" INTEGER NOT NULL,
    "maxOutputTokens" INTEGER NOT NULL,
    "supportedTasks" TEXT[] NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "AiModelConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RepositoryConnection" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "repositoryIdentifier" TEXT NOT NULL,
    "encryptedCredential" TEXT,
    "defaultBranch" TEXT NOT NULL,
    "allowedBranches" TEXT[] NOT NULL,
    "includePaths" TEXT[] NOT NULL,
    "excludePaths" TEXT[] NOT NULL,
    "maximumFileBytes" INTEGER NOT NULL DEFAULT 131072,
    "maximumTotalBytes" INTEGER NOT NULL DEFAULT 1048576,
    "maximumFileCount" INTEGER NOT NULL DEFAULT 100,
    "timeoutMs" INTEGER NOT NULL DEFAULT 15000,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "RepositoryConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RDRadarAnalysisRun" (
    "id" TEXT NOT NULL,
    "repositoryConnectionId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "requestedRef" TEXT NOT NULL,
    "commitSha" TEXT,
    "analysisPurpose" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL DEFAULT 'rd-radar-analysis.v1',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "sanitizedFailureReason" TEXT,
    "result" JSONB NOT NULL DEFAULT '{}',
    "evidenceItemIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "candidateId" TEXT,
    "cancellationRequested" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "RDRadarAnalysisRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConfigurationAuditEvent" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "sanitizedDetails" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConfigurationAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiModelConfiguration_providerId_modelId_key" ON "AiModelConfiguration"("providerId", "modelId");
CREATE INDEX "AiProviderConfiguration_enabled_idx" ON "AiProviderConfiguration"("enabled");
CREATE INDEX "AiModelConfiguration_providerId_enabled_idx" ON "AiModelConfiguration"("providerId", "enabled");
CREATE INDEX "RepositoryConnection_providerType_enabled_idx" ON "RepositoryConnection"("providerType", "enabled");
CREATE INDEX "RDRadarAnalysisRun_status_createdAt_idx" ON "RDRadarAnalysisRun"("status", "createdAt");
CREATE INDEX "RDRadarAnalysisRun_repositoryConnectionId_commitSha_idx" ON "RDRadarAnalysisRun"("repositoryConnectionId", "commitSha");
CREATE INDEX "ConfigurationAuditEvent_resourceType_resourceId_createdAt_idx" ON "ConfigurationAuditEvent"("resourceType", "resourceId", "createdAt");

ALTER TABLE "AiModelConfiguration" ADD CONSTRAINT "AiModelConfiguration_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProviderConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RDRadarAnalysisRun" ADD CONSTRAINT "RDRadarAnalysisRun_repositoryConnectionId_fkey" FOREIGN KEY ("repositoryConnectionId") REFERENCES "RepositoryConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RDRadarAnalysisRun" ADD CONSTRAINT "RDRadarAnalysisRun_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProviderConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RDRadarAnalysisRun" ADD CONSTRAINT "RDRadarAnalysisRun_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AiModelConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
