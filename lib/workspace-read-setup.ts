import type { RuntimeCapabilityEnrollment, RuntimeTool } from "@/backend/src/trusted-runtime/runtime.contract"

export const workspaceReadTools: RuntimeTool[] = ["filesystem.list", "filesystem.read", "filesystem.search"]

/** Called only by an explicit setup click. Preserve the existing capability ceiling. */
export async function prepareWorkspaceReads(enrollment: RuntimeCapabilityEnrollment | undefined, revision: number,
  configure: (revision: number, tools: RuntimeTool[]) => Promise<RuntimeCapabilityEnrollment>,
  renew: (enrollment: RuntimeCapabilityEnrollment) => Promise<unknown>) {
  const tools = Array.from(new Set([...(enrollment?.capabilities ?? []), ...workspaceReadTools]))
  const current = enrollment && workspaceReadTools.every(t => enrollment.capabilities.includes(t)) && enrollment.status === "ACTIVE" && !enrollment.revokedAt && (enrollment.expiresAt === null || Date.parse(enrollment.expiresAt ?? "") > Date.now())
    ? enrollment : await configure(revision, tools)
  await renew(current)
}
