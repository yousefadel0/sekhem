import type { RuntimeLedgerService } from "./runtime-ledger.service";
import { persistentReadAccessTx, developmentReadPolicy } from "./development-read-policy";
import { win32 } from "node:path";
import { toolDigest } from "../agent-runtime/tools/tool-contract";
import { FileIntelligenceSecurityService } from "../file-intelligence/security/file-intelligence-security.service";
import { excludedFromWorkspaceDiscovery } from "../workspace-intelligence/workspace-discovery.policy";
import { workspaceTarget } from "../workspace-intelligence/workspace-runtime.contract";
import { runtimeError, WORKSPACE_READ_TOOLS, WORKSPACE_READ_TTL_MS, type RuntimeGrant, type WorkspaceReadConsent, type WorkspaceReadCoverage } from "./runtime.contract";

export function readConsentFingerprint(consent: Omit<WorkspaceReadConsent, "fingerprint" | "status" | "revokedAt">) {
  return toolDigest(consent);
}
export function readConsentUnexpired(consent: WorkspaceReadConsent, persistent = false): boolean {
  return persistent && developmentReadPolicy()
    ? consent.expiresAt === null || Number.isFinite(Date.parse(consent.expiresAt))
    : consent.expiresAt !== null && Number.isFinite(Date.parse(consent.expiresAt)) && Date.parse(consent.expiresAt) > Date.now();
}
export function readCoverage(grant: RuntimeGrant, expected: { workspaceId: string; bindingVersion: number; rootPath: string; runtimeId: string; runtimeFingerprint: string; userId: string; organizationId: string; projectId: string }, tool: string, path: string): WorkspaceReadCoverage | undefined {
  const c = grant.workspaceRead;
  if (!c || c.workspaceId !== expected.workspaceId || c.bindingVersion !== expected.bindingVersion) return;
  const { fingerprint, status, revokedAt, ...signed } = c;
  if (c.kind !== "WORKSPACE_READ" || c.bindingId !== c.workspaceId || fingerprint !== readConsentFingerprint(signed) ||
    c.runtimeId !== grant.runtimeId || c.userId !== grant.userId || c.projectId !== grant.projectId || c.organizationId !== grant.organizationId ||
    ["workspaceId", "bindingVersion", "rootPath", "runtimeId", "runtimeFingerprint", "userId", "organizationId", "projectId"].some(k => (c as any)[k] !== (expected as any)[k]) || c.approvedBy !== c.userId ||
    status !== "ACTIVE" || revokedAt || !readConsentUnexpired(c, grant.persistentReadAccess) ||
    (c.expiresAt !== null && Date.parse(c.expiresAt) - Date.parse(c.approvedAt) > WORKSPACE_READ_TTL_MS) || !Number.isFinite(Date.parse(c.approvedAt)) ||
    toolDigest([...c.capabilities].sort()) !== toolDigest([...WORKSPACE_READ_TOOLS].sort()) || !c.capabilities.includes(tool as any) ||
    grant.status !== "ACTIVE" || !grant.capabilities.includes(tool as any) || (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now() && !(developmentReadPolicy() && grant.persistentReadAccess))) runtimeError("WORKSPACE_READ_GRANT_INVALID");
  const target = workspaceTarget(c.rootPath, win32.relative(c.rootPath, path));
  if (target.absolutePath !== path) runtimeError("WORKSPACE_READ_SCOPE_DENIED");
  new FileIntelligenceSecurityService().assertSafeFileName(target.relativePath);
  if (target.relativePath.split("/").some(excludedFromWorkspaceDiscovery)) runtimeError("WORKSPACE_READ_PATH_DENIED");
  return { kind: "WORKSPACE_READ_GRANT", grantId: grant.grantId, grantVersion: grant.version, consent: c,
    ...(developmentReadPolicy() && grant.persistentReadAccess ? { lifecycle: "DEVELOPMENT_ENROLLED_READ" as const } : {}) };
}

/** New consent heads override historical inline consent, including expired/revoked heads. */
export async function workspaceReadConsentTx(ledger: RuntimeLedgerService, tx: any,
  expected: { userId: string; organizationId: string; projectId: string; workspaceId: string; bindingVersion: number }, grant?: RuntimeGrant) {
  const row = await ledger.read<WorkspaceReadConsent>(tx, "WORKSPACE_READ_CONSENT",
    [expected.userId, expected.organizationId, expected.projectId, expected.workspaceId, expected.bindingVersion]);
  return row?.payload ?? grant?.workspaceRead;
}
/** The grant is never persisted or modified here. Both authorities are validated independently. */
export async function readCoverageTx(ledger: RuntimeLedgerService, tx: any, grant: RuntimeGrant,
  expected: Parameters<typeof readCoverage>[1], tool: string, path: string) {
  const consent = await workspaceReadConsentTx(ledger, tx, expected, grant);
  return readCoverage({ ...grant, persistentReadAccess: await persistentReadAccessTx(ledger, tx, grant), workspaceRead: consent }, expected, tool, path);
}
