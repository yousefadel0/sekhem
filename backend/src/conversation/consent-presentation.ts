import type { SessionClaims } from "../auth/auth.dto";
import { ResourceAuthorizationService } from "../auth/resource-authz.service";
import { RuntimeIdentityService } from "../trusted-runtime/runtime-identity.service";
import { RuntimeLedgerService } from "../trusted-runtime/runtime-ledger.service";
import { WorkspaceStoreService } from "../workspace-intelligence/workspace-store.service";
import { TaskConsentService, type TaskConsentReference } from "../agent-runtime/tools/task-consent.service";
import { toolSubject, toolDigest } from "../agent-runtime/tools/tool-contract";

import type { ConsentState, ConsentView, ConsentPresentation } from "./workflow-presentation.contract";
const codes = new Set(["TASK_CONSENT_REVOKED", "TASK_CONSENT_EXPIRED", "TASK_CONSENT_CHANGED", "TASK_CONSENT_SCOPE_CHANGED", "TASK_CONSENT_PLAN_CHANGED", "TASK_CONSENT_INVALID", "TASK_CONSENT_CAPABILITY_DENIED", "TASK_CONSENT_EXPLICIT_ACTION_REQUIRED", "SESSION_CONSENT_SESSION_CHANGED", "WORKSPACE_BINDING_STALE"]);
/** Safe read-only projection; never creates consent or inherited approval. */
export async function projectConsent(db: any, proposal: any, plan: any, selected: TaskConsentReference | undefined, claims?: SessionClaims, stale = false): Promise<ConsentPresentation> {
  const safeReference = (r: TaskConsentReference): TaskConsentReference => ({ policyId: r.policyId, generation: r.generation, digest: r.digest, expiresAt: r.expiresAt, consentedBy: r.consentedBy,
    ...(r.scope === "SESSION" ? { scope: "SESSION", session: r.session && { id: r.session.id, issuedAt: r.session.issuedAt, expiresAt: r.session.expiresAt } } : {}) });
  const unavailable: ConsentPresentation = { eligible: false, reasons: ["CONSENT_CONTEXT_UNAVAILABLE"], state: "UNAVAILABLE", policies: [],
    ...(selected ? { selected: { reference: safeReference(selected), type: selected.scope === "SESSION" ? "SESSION" : "TASK", revision: 0, state: "UNAVAILABLE", reasons: ["CONSENT_CONTEXT_UNAVAILABLE"], revocable: false } as ConsentView } : {}) };
  if (!claims || !db.$transaction) return unavailable;
  const ledger = new RuntimeLedgerService(db), identity = new RuntimeIdentityService(ledger), resources = new ResourceAuthorizationService(db);
  const policies = new TaskConsentService(ledger, identity, resources);
  try { return await ledger.transaction(async tx => {
    const session = { id: claims.sessionId, issuedAt: claims.iat ?? 0, expiresAt: claims.exp };
    const actor = await identity.actor(tx, claims.sub, claims.organizationId!, proposal.projectId, session);
    if (proposal.userId !== claims.sub || proposal.organizationId !== claims.organizationId) return unavailable;
    await resources.assertAuthorized(toolSubject(actor), "APPROVE", { resourceType: "Approval", id: proposal.proposalId, projectId: proposal.projectId, organizationId: proposal.organizationId, requiredRole: "Technical Reviewer" });
    const views: ConsentView[] = [];
    const project = async (reference: TaskConsentReference): Promise<ConsentView> => {
      const record = await ledger.read<any>(tx, "TASK_CONSENT", reference.policyId);
      const p = record?.payload;
      const head = p && await ledger.read<any>(tx, "TASK_CONSENT_HEAD", policies.key(p));
      let state: ConsentState = !record?.immutable || record.payloadDigest !== reference.digest ? "INVALID" : head?.payload.policyId !== reference.policyId ? "SUPERSEDED" : head.payload.status === "REVOKED" ? "REVOKED" : Date.parse(reference.expiresAt) <= Date.now() ? "EXPIRED" : stale ? "STALE" : "ACTIVE";
      const reasons: string[] = [];
      if (state === "ACTIVE") try { await policies.selectTx(tx, proposal, claims, reference); }
      catch (error) { const code = (error as Error).message; reasons.push(codes.has(code) ? code : "CONSENT_VALIDATION_UNAVAILABLE"); state = code === "TASK_CONSENT_INVALID" ? "INVALID" : codes.has(code) ? "STALE" : "UNAVAILABLE"; }
      if (!reasons.length && state !== "ACTIVE") reasons.push(`CONSENT_${state}`);
      const sameSession = reference.scope !== "SESSION" || toolDigest(reference.session ?? null) === toolDigest(session);
      return { type: reference.scope === "SESSION" ? "SESSION" : "TASK", reference: safeReference(reference), revision: head?.revision ?? record?.revision ?? 1, state, reasons,
        revocable: sameSession && ["ACTIVE", "EXPIRED", "STALE"].includes(state) && head?.payload.policyId === reference.policyId };
    };
    for (const key of [policies.key(proposal), policies.key({ ...proposal, scope: "SESSION", session })]) {
      const head = await ledger.read<any>(tx, "TASK_CONSENT_HEAD", key);
      if (head) { const h = head.payload; views.push(await project({ policyId: h.policyId, generation: h.generation, digest: h.digest, expiresAt: h.expiresAt, consentedBy: h.consentedBy, ...(h.scope === "SESSION" ? { scope: "SESSION", session: h.session } : {}) })); }
    }
    const selectedView = selected ? await project(selected) : undefined;
    let eligible = !stale, reasons: string[] = stale ? ["PROPOSAL_BINDING_CHANGED"] : [];
    try {
      const binding = await new WorkspaceStoreService(tx).activeBindingTx(tx, claims.sub, proposal.projectId, claims.organizationId!);
      if (!binding) throw new Error("WORKSPACE_BINDING_STALE");
      await new WorkspaceStoreService(tx).assertInspectionBindingTx(tx, { ...proposal.workspace, ...{ userId: claims.sub, organizationId: claims.organizationId!, projectId: proposal.projectId, rootPath: binding.rootPath } });
      const actions = proposal.actions;
      if (!Array.isArray(actions) || !actions.length || actions.length > 6 || new Set(actions.map((a: any) => a.stepId)).size !== actions.length || actions.some((a: any) => !policies.eligible(a, plan, binding.rootPath))) throw new Error("TASK_CONSENT_EXPLICIT_ACTION_REQUIRED");
      const grant = await identity.activeGrant(tx, binding.runtimeId, proposal.projectId);
      const device = (await identity.device(tx, binding.runtimeId)).payload;
      if (grant.userId !== claims.sub || grant.organizationId !== claims.organizationId || device.fingerprint !== proposal.workspace.runtimeFingerprint || actions.some((a: any) => !grant.capabilities.includes(a.tool))) throw new Error("TASK_CONSENT_CAPABILITY_DENIED");
      for (const a of actions) await resources.assertAuthorized(toolSubject(actor), a.tool === "filesystem.write" ? "UPDATE" : "READ", { resourceType: "Project", id: proposal.projectId, projectId: proposal.projectId, organizationId: claims.organizationId });
    } catch (error) { eligible = false; const code = (error as Error).message; reasons.push(codes.has(code) ? code : "CONSENT_VALIDATION_UNAVAILABLE"); }
    return { eligible, reasons, state: !selected && views.filter(v => v.state === "ACTIVE").length > 1 ? "AMBIGUOUS" : "AVAILABLE", policies: views, ...(selectedView ? { selected: selectedView } : {}) };
  }); } catch { return unavailable; }
}
