import type { RuntimeLedgerService } from "./runtime-ledger.service";
import { WORKSPACE_READ_TOOLS, type RuntimeCapabilityEnrollment, type RuntimeDevice, type RuntimeGrant } from "./runtime.contract";

export const developmentReadPolicy = () => process.env.NODE_ENV === "development";
export const workspaceReadTool = (tool: string) => (WORKSPACE_READ_TOOLS as readonly string[]).includes(tool);
/** Current ledger configuration, never historical grant inference or a client flag. */
export async function persistentReadAccessTx(ledger: RuntimeLedgerService, tx: any, grant: RuntimeGrant): Promise<boolean> {
  if (!developmentReadPolicy() || grant.mode !== "TRUSTED_MACHINE" || grant.status !== "ACTIVE" || grant.revokedAt || !grant.enrollment) return false;
  // Device IDs are the ledger record IDs; their canonical key is the public-key fingerprint.
  const deviceRow = await tx.auditEvent.findUnique({ where: { id: grant.runtimeId } });
  const device = deviceRow ? ledger.decode<RuntimeDevice>(deviceRow, "RUNTIME_DEVICE").payload : undefined;
  const row = await ledger.read<RuntimeCapabilityEnrollment>(tx, "RUNTIME_CAPABILITY_ENROLLMENT", [grant.userId, grant.organizationId, grant.projectId, grant.runtimeId]);
  const e = row?.payload;
  return !!device && device.status === "ACTIVE" && device.userId === grant.userId && device.organizationId === grant.organizationId && !!e &&
    e.status === "ACTIVE" && !e.revokedAt && e.expiresAt !== undefined && (e.expiresAt === null || Date.parse(e.expiresAt) > Date.now()) &&
    e.userId === grant.userId && e.organizationId === grant.organizationId && e.projectId === grant.projectId && e.runtimeId === grant.runtimeId &&
    e.enrollmentId === grant.enrollment.enrollmentId && e.revision === row!.revision && e.revision === grant.enrollment.revision &&
    e.runtimeFingerprint === device.fingerprint && grant.enrollment.runtimeFingerprint === device.fingerprint &&
    grant.capabilities.some(workspaceReadTool) && grant.capabilities.every(c => e.capabilities.includes(c));
}
