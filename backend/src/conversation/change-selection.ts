import { BadRequestException, ConflictException } from "@nestjs/common";
import type { SessionClaims } from "../auth/auth.dto";
import { RuntimeLedgerService } from "../trusted-runtime/runtime-ledger.service";
import { isRecord, toolDigest, validToolId } from "../agent-runtime/tools/tool-contract";
import type { ExactProposal } from "../agent-runtime/execution/exact-proposal.service";
import type { ChangeSet } from "./change-set.contract";
export interface ChangeSelection {
  version: 1; revision: number; changeSetId: string; changeSetVersion: number; changeSetDigest: string;
  conversationId: string; workspace: ChangeSet["workspace"]; source: ChangeSet["source"]; plan: ChangeSet["plan"];
  decisions: Record<string, "KEEP" | "REJECT" | "PENDING">; keptChangeIds: string[];
  selectedChanges: ChangeSet["changes"]; authorization: "NOT_GRANTED"; executionEnabled: false;
  actor: { userId: string; organizationId: string; sessionId: string; issuedAt: number; expiresAt: number };
  requestId: string; digest: string;
}
export async function changeSetForPlan(ledger: RuntimeLedgerService, tx: any, user: string, conversation: string, plan: string): Promise<ChangeSet | null> {
  if (!tx.conversationMessage?.findFirst) return null;
  const message = await tx.conversationMessage.findFirst({ where: { conversationId: conversation, senderType: "assistant",
    metadata: { path: ["changeSet", "plan", "id"], equals: plan } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const s = message?.metadata?.changeSet;
  if (!s) return null;
  const row = await ledger.read<ChangeSet>(tx, "CHANGE_SET", [user, conversation, plan, s.recommendation?.id]);
  if (!row?.immutable || toolDigest(row.payload) !== toolDigest(s) || s.userId !== user || s.conversationId !== conversation)
    throw new ConflictException("CHANGE_SET_CHANGED");
  return row.payload;
}
export async function selectionHead(ledger: RuntimeLedgerService, tx: any, set: ChangeSet) {
  return ledger.read<ChangeSelection>(tx, "CHANGE_SELECTION_HEAD", [set.userId, set.conversationId, set.id]);
}
export async function assertRecommendation( tx: any, set: ChangeSet) {
  const acceptance = await tx.conversationMessage.findUnique({ where: { id: set.recommendation.acceptanceId } });
  const recommendation = await tx.conversationMessage.findUnique({ where: { id: set.recommendation.id } });
  const rec = recommendation?.metadata?.recommendation;
  const rejected = await tx.conversationMessage.findFirst({ where: { conversationId: set.conversationId, senderType: "user", AND: [
    { metadata: { path: ["recommendationId"], equals: set.recommendation.id } }, { metadata: { path: ["recommendationResponse"], equals: "REJECT" } } ] } });
  if (!acceptance || acceptance.conversationId !== set.conversationId || acceptance.senderId !== set.userId ||
    acceptance.metadata?.recommendationResponse !== "ACCEPT" || acceptance.metadata?.recommendationId !== set.recommendation.id || acceptance.metadata?.recommendationGeneration !== set.recommendation.generation ||
    !rec || recommendation.conversationId !== set.conversationId || recommendation.senderType !== "assistant" || rec.generation !== set.recommendation.generation ||
    rec.sourceRunId !== set.source.runId || rec.sourceSequence !== set.source.sequence || rec.workspaceId !== set.workspace.workspaceId ||
    rec.bindingVersion !== set.workspace.bindingVersion || rec.runtimeId !== set.workspace.runtimeId || rec.runtimeFingerprint !== set.workspace.runtimeFingerprint || rejected)
    throw new ConflictException("CHANGE_SET_RECOMMENDATION_REJECTED");
}
export async function decideChange(deps: { ledger: RuntimeLedgerService; inspections: any }, conversationId: string, claims: SessionClaims, body: unknown) {
  if (!isRecord(body) || Object.keys(body).sort().join(",") !== "changeId,changeSetDigest,changeSetId,changeSetVersion,decision,expectedRevision,requestId" ||
    !validToolId(body.changeSetId) || !validToolId(body.changeId) || !validToolId(body.requestId) || body.changeSetVersion !== 1 ||
    typeof body.decision !== "string" || !["KEEP", "REJECT", "PENDING"].includes(body.decision) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 ||
    !claims.sessionId || !claims.organizationId || !claims.iat || !claims.exp || claims.exp * 1000 <= Date.now()) throw new BadRequestException("CHANGE_DECISION_INVALID");
  return deps.ledger.transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', conversationId);
    const message = await tx.conversationMessage.findUnique({ where: { id: body.changeSetId } });
    const set = message?.metadata?.changeSet as ChangeSet;
    if (!set || set.userId !== claims.sub || set.organizationId !== claims.organizationId || set.conversationId !== conversationId ||
      set.version !== body.changeSetVersion || set.digest !== body.changeSetDigest || !set.changes.some(c => c.id === body.changeId)) throw new ConflictException("CHANGE_SET_CHANGED");
    const stored = await deps.ledger.read<ChangeSet>(tx, "CHANGE_SET", [claims.sub, conversationId, set.plan.id, set.recommendation.id]);
    if (!stored?.immutable || toolDigest(stored.payload) !== toolDigest(set)) throw new ConflictException("CHANGE_SET_CHANGED");
    const fresh = await deps.inspections.certifiedPlanningSourceTx(tx, claims, conversationId, set.source.runId);
    if (fresh.digest !== set.source.digest || fresh.checkpoint.sequence !== set.source.sequence || fresh.checkpoint.version !== set.source.version ||
      fresh.binding.workspaceId !== set.workspace.workspaceId || fresh.binding.version !== set.workspace.bindingVersion ||
      fresh.binding.runtimeId !== set.workspace.runtimeId || fresh.binding.runtimeFingerprint !== set.workspace.runtimeFingerprint)
      throw new ConflictException("CHANGE_SET_SOURCE_CHANGED");
    await assertRecommendation(tx, set);
    const key = [claims.sub, conversationId, set.id], requestKey = [...key, body.requestId], requestDigest = toolDigest({ body, sessionId: claims.sessionId });
    const replay = await deps.ledger.read<{ requestDigest: string; selection: ChangeSelection }>(tx, "CHANGE_DECISION", requestKey);
    if (replay) {
      if (replay.payload.requestDigest !== requestDigest) throw new ConflictException("CHANGE_DECISION_REPLAY_CONFLICT");
      return replay.payload.selection;
    }
    const head = await selectionHead(deps.ledger, tx, set);
    if ((head?.payload.revision ?? 0) !== body.expectedRevision) throw new ConflictException("CHANGE_SELECTION_STALE");
    if (await deps.ledger.read(tx, "CHANGE_SELECTED_PROPOSAL", [claims.sub, conversationId, set.plan.id])) throw new ConflictException("CHANGE_REVIEW_LOCKED");
    const decisions: ChangeSelection["decisions"] = head ? { ...head.payload.decisions } : Object.fromEntries(set.changes.map(c => [c.id, "PENDING"]));
    decisions[String(body.changeId)] = body.decision as "KEEP" | "REJECT" | "PENDING";
    const base = { version: 1 as const, revision: (head?.payload.revision ?? 0) + 1, changeSetId: set.id, changeSetVersion: set.version, changeSetDigest: set.digest,
      conversationId, workspace: set.workspace, source: set.source, plan: set.plan, decisions,
      keptChangeIds: set.changes.filter(c => decisions[c.id] === "KEEP").map(c => c.id),
      selectedChanges: set.changes.filter(c => decisions[c.id] === "KEEP").map(c => ({ ...c, status: "KEPT" as const })),
      authorization: "NOT_GRANTED" as const, executionEnabled: false as const,
      actor: { userId: claims.sub, organizationId: claims.organizationId, sessionId: claims.sessionId, issuedAt: claims.iat!, expiresAt: claims.exp! }, requestId: String(body.requestId) };
    const selection: ChangeSelection = { ...base, digest: toolDigest(base) };
    await deps.ledger.create(tx, "CHANGE_SELECTION_REVISION", [...key, selection.revision], selection, { immutable: true });
    await deps.ledger.create(tx, "CHANGE_DECISION", requestKey, { requestDigest, selection }, { immutable: true });
    if (head) await deps.ledger.update(tx, head, selection); else await deps.ledger.create(tx, "CHANGE_SELECTION_HEAD", key, selection, { immutable: false });
    return selection;
  });
}

/** Selection changes proposal identity, never its approval/permit validation. No legacy fallback for reviewed plans. */
export async function readExactProposal(ledger: RuntimeLedgerService, tx: any, user: string, conversation: string, plan: string) {
  const set = await changeSetForPlan(ledger, tx, user, conversation, plan);
  if (!set) return ledger.read<ExactProposal>(tx, "EXACT_PROPOSAL", [user, conversation, plan]);
  const selected = await ledger.read<{ key: unknown[]; revision: number; digest: string }>(tx, "CHANGE_SELECTED_PROPOSAL", [user, conversation, plan]);
  if (!selected) return null;
  const head = await selectionHead(ledger, tx, set);
  if (!head || head.payload.revision !== selected.payload.revision || head.payload.digest !== selected.payload.digest) throw new ConflictException("CHANGE_SELECTION_STALE");
  await assertRecommendation(tx, set);
  const expected = set.changes.filter(c => head.payload.decisions[c.id] === "KEEP").map(c => ({ ...c, status: "KEPT" as const }));
  if (toolDigest(expected) !== toolDigest(head.payload.selectedChanges) || head.payload.authorization !== "NOT_GRANTED" || head.payload.executionEnabled !== false) throw new ConflictException("CHANGE_SELECTION_STALE");
  const proposal = await ledger.read<ExactProposal>(tx, "EXACT_PROPOSAL", selected.payload.key);
  const lineage = proposal?.payload.changeReview;
  if (!proposal?.immutable || !lineage || lineage.changeSetId !== set.id || lineage.changeSetVersion !== set.version || lineage.changeSetDigest !== set.digest ||
    lineage.selectedRevision !== head.payload.revision || lineage.selectedDigest !== head.payload.digest ||
    toolDigest(lineage.changeIds) !== toolDigest(head.payload.keptChangeIds) ||
    toolDigest(selected.payload.key) !== toolDigest([user, conversation, plan, set.id, head.payload.revision])) throw new ConflictException("CHANGE_SELECTION_STALE");
  return proposal;
}

/** Read-only authoritative projection; old snapshots alone never enable decisions. */
export async function changeReviewState(deps: { ledger: RuntimeLedgerService; inspections: any }, conversationId: string, claims: SessionClaims, set: ChangeSet) {
  try {
    return await deps.ledger.transaction(async tx => {
      const stored = await changeSetForPlan(deps.ledger, tx, claims.sub, conversationId, set.plan.id);
      if (!stored || stored.id !== set.id || stored.digest !== set.digest || stored.organizationId !== claims.organizationId) throw new ConflictException("CHANGE_SET_CHANGED");
      const head = await selectionHead(deps.ledger, tx, set);
      const locked = !!await deps.ledger.read(tx, "CHANGE_SELECTED_PROPOSAL", [claims.sub, conversationId, set.plan.id]);
      let reason: string | undefined;
      try {
        const fresh = await deps.inspections.certifiedPlanningSourceTx(tx, claims, conversationId, set.source.runId);
        if (fresh.digest !== set.source.digest || fresh.checkpoint.sequence !== set.source.sequence || fresh.checkpoint.version !== set.source.version ||
          fresh.binding.workspaceId !== set.workspace.workspaceId || fresh.binding.version !== set.workspace.bindingVersion ||
          fresh.binding.runtimeId !== set.workspace.runtimeId || fresh.binding.runtimeFingerprint !== set.workspace.runtimeFingerprint) throw new ConflictException("CHANGE_SET_SOURCE_CHANGED");
        await assertRecommendation(tx, set);
      } catch (error) { reason = error instanceof ConflictException ? error.message : "CHANGE_REVIEW_UNAVAILABLE"; }
      return { available: !locked && !reason, locked, ...(reason ? { reason } : {}), changeSetId: set.id, changeSetDigest: set.digest, revision: head?.payload.revision ?? 0,
        decisions: head?.payload.decisions ?? Object.fromEntries(set.changes.map(c => [c.id, "PENDING"])),
        selectedChanges: head?.payload.selectedChanges ?? [],
        history: await Promise.all(Array.from({ length: Math.min(50, head?.payload.revision ?? 0) }, (_, i) =>
          deps.ledger.read<ChangeSelection>(tx, "CHANGE_SELECTION_REVISION", [claims.sub, conversationId, set.id, Math.max(0, (head?.payload.revision ?? 0) - 50) + i + 1]).then(r => r?.payload))) };
    });
  } catch (error) {
    return { available: false, reason: error instanceof ConflictException ? error.message : "CHANGE_REVIEW_UNAVAILABLE" };
  }
}

export async function readChangeDecisionRevision(ledger: RuntimeLedgerService, conversationId: string, claims: SessionClaims, changeSetId: string, revision: number) {
  if (!validToolId(changeSetId) || !Number.isSafeInteger(revision) || revision < 1) throw new BadRequestException("CHANGE_DECISION_INVALID");
  return ledger.transaction(async tx => {
    const message = await tx.conversationMessage.findUnique({ where: { id: changeSetId } });
    const set = message?.metadata?.changeSet as ChangeSet;
    if (!set || set.conversationId !== conversationId || set.userId !== claims.sub || set.organizationId !== claims.organizationId) throw new ConflictException("CHANGE_SET_CHANGED");
    const stored = await ledger.read<ChangeSet>(tx, "CHANGE_SET", [claims.sub, conversationId, set.plan.id, set.recommendation.id]);
    if (!stored?.immutable || toolDigest(stored.payload) !== toolDigest(set)) throw new ConflictException("CHANGE_SET_CHANGED");
    const record = await ledger.read<ChangeSelection>(tx, "CHANGE_SELECTION_REVISION", [claims.sub, conversationId, set.id, revision]);
    if (!record?.immutable) throw new ConflictException("CHANGE_DECISION_REVISION_UNAVAILABLE");
    return record.payload;
  });
}
