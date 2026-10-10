import { BadRequestException, ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { SessionClaims } from "../auth/auth.dto";
import { toolDigest, isRecord, validToolId } from "../agent-runtime/tools/tool-contract";
import { recommendationPlanningObjective } from "./recommendation.contract";
import { evidenceIdentity } from "../agent-runtime/understanding/agent-understanding.types";
import { heroConstrainedResult } from "../agent-runtime/understanding/hero-title-constraint";
import { exactPlanRunTx, validateExactPlan, validateExactProposal, type ExactProposal } from "../agent-runtime/execution/exact-proposal.service";
import type { ChangeSet, ReviewChange } from "./change-set.contract";
import type { RuntimeLedgerService } from "../trusted-runtime/runtime-ledger.service";
import type { AgentInspectionService } from "../agent-runtime/inspection/agent-inspection.service";
import type { certifiedConversationContext } from "../agent-runtime/understanding/persisted-planning";

type CertifiedContext = NonNullable<Awaited<ReturnType<typeof certifiedConversationContext>>>;
interface Dependencies {
  ledger: RuntimeLedgerService;
  inspections: Pick<AgentInspectionService, "certifiedPlanningSourceTx">;
  certified: (conversationId: string, claims: SessionClaims, instruction: string) => Promise<CertifiedContext | null>;
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Exact contiguous text replacement, never a normalized or model-generated diff. */
export function reviewChange(input: Omit<ReviewChange, "id" | "type" | "status" | "beforeSha256" | "afterSha256">,
  source: string, sourceSha256: string): ReviewChange | null {
  if (!input.path || /^(?:[\\/]|[a-z]:)|(?:^|[\\/])\.\.(?:[\\/]|$)/i.test(input.path) ||
    !Number.isSafeInteger(input.start) || !Number.isSafeInteger(input.end) || input.start < 0 || input.end < input.start || input.end > source.length ||
    sha(source) !== sourceSha256 || source.slice(input.start, input.end) !== input.before ||
    !input.evidenceRef || !input.scope || !input.reason || !input.what || !input.how || input.before.length + input.after.length > 8192)
    throw new ConflictException("CHANGE_SET_EXACT_EVIDENCE_REQUIRED");
  if (input.before === input.after) return null;
  const after = source.slice(0, input.start) + input.after + source.slice(input.end);
  return { ...input, id: `change_${toolDigest(input)}`, type: !input.before ? "ADDED" : !input.after ? "REMOVED" : "MODIFIED",
    status: "PENDING", beforeSha256: sourceSha256, afterSha256: sha(after) };
}

/** Minimize a persisted exact replacement for review; unchanged anchors are not changes. */
export function proposalReviewChange(source: string, replacement: { path: string; before: string; after: string; originalHash: string; updatedHash: string }, evidenceRef: string) {
  const offset = source.indexOf(replacement.before);
  if (!replacement.before || offset < 0 || source.indexOf(replacement.before, offset + 1) >= 0 || sha(source) !== replacement.originalHash ||
    sha(source.slice(0, offset) + replacement.after + source.slice(offset + replacement.before.length)) !== replacement.updatedHash)
    throw new ConflictException("CHANGE_SET_EXACT_EVIDENCE_REQUIRED");
  let prefix = 0, suffix = 0;
  while (prefix < Math.min(replacement.before.length, replacement.after.length) && replacement.before[prefix] === replacement.after[prefix]) prefix++;
  // Keep a surrogate pair together; no Unicode or whitespace normalization.
  if (prefix && /[\uD800-\uDBFF]/.test(replacement.before[prefix - 1])) prefix--;
  while (suffix < Math.min(replacement.before.length, replacement.after.length) - prefix &&
    replacement.before.at(-suffix - 1) === replacement.after.at(-suffix - 1)) suffix++;
  if (suffix && /[\uDC00-\uDFFF]/.test(replacement.before[replacement.before.length - suffix])) suffix--;
  const start = offset + prefix, end = offset + replacement.before.length - suffix;
  return reviewChange({ path: replacement.path, scope: `Certified source range ${start}–${end}`, start, end,
    before: replacement.before.slice(prefix, replacement.before.length - suffix), after: replacement.after.slice(prefix, replacement.after.length - suffix),
    evidenceRef, reason: "Apply the accepted recommendation's persisted exact proposal.", what: "Apply the reviewed source-text change.",
    how: "Apply the exact replacement; leave content outside this range unchanged." }, source, replacement.originalHash);
}

/** Existing ledger lock serializes binding/recommendation checks and immutable review persistence. No runtime dispatch. */
export async function prepareChangeSet(deps: Dependencies, conversationId: string, claims: SessionClaims, body: unknown): Promise<ChangeSet> {
  if (!isRecord(body) || Object.keys(body).sort().join(",") !== "planDigest,planId,planVersion" || !validToolId(body.planId) ||
    !Number.isSafeInteger(body.planVersion) || typeof body.planDigest !== "string" || !/^[a-f0-9]{64}$/.test(body.planDigest))
    throw new BadRequestException("CHANGE_SET_REQUEST_INVALID");
  // Re-admission reads persisted receipts, not the workspace, and makes no model call.
  const certified = await deps.certified(conversationId, claims, "Prepare exact change review from the accepted recommendation.");
  if (!certified) throw new ConflictException("CHANGE_SET_CERTIFIED_SOURCE_REQUIRED");
  return deps.ledger.transaction(async (tx: any) => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', conversationId);
    const fresh = await deps.inspections.certifiedPlanningSourceTx(tx, claims, conversationId, certified.source.sourceRunId);
    if (toolDigest(fresh.binding) !== toolDigest(certified.source.binding) || fresh.digest !== certified.source.digest)
      throw new ConflictException("CHANGE_SET_SOURCE_CHANGED");
    const plan = await tx.agentPlan.findUnique({ where: { id: body.planId } });
    if (plan?.version !== body.planVersion || plan?.steps?.[0]?.parameters?.engineeringPlan?.digest !== body.planDigest)
      throw new ConflictException("CHANGE_SET_PLAN_CHANGED");
    const run = await exactPlanRunTx(deps.ledger, tx, plan, claims, conversationId);
    const result = validateExactPlan(run, plan, fresh, claims, conversationId);
    const acceptance = await tx.conversationMessage.findFirst({ where: { conversationId, senderId: claims.sub, senderType: "user",
      metadata: { path: ["recommendationResponse"], equals: "ACCEPT" } }, orderBy: { createdAt: "desc" } });
    const recommendation = acceptance && await tx.conversationMessage.findUnique({ where: { id: acceptance.metadata?.recommendationId } });
    const rec = recommendation?.metadata?.recommendation;
    const rejected = recommendation && await tx.conversationMessage.findFirst({ where: { conversationId, senderType: "user", AND: [
      { metadata: { path: ["recommendationId"], equals: recommendation.id } },
      { metadata: { path: ["recommendationResponse"], equals: "REJECT" } } ] } });
    if (!rec || rejected || recommendation.conversationId !== conversationId || recommendation.senderType !== "assistant" ||
      (rec.objective !== plan.summary && recommendationPlanningObjective(rec) !== plan.summary) || rec.generation !== acceptance.metadata.recommendationGeneration ||
      rec.sourceRunId !== fresh.sourceRunId || rec.sourceSequence !== fresh.checkpoint.sequence ||
      rec.workspaceId !== fresh.binding.workspaceId || rec.bindingVersion !== fresh.binding.version ||
      rec.runtimeId !== fresh.binding.runtimeId || rec.runtimeFingerprint !== fresh.binding.runtimeFingerprint)
      throw new ConflictException("CHANGE_SET_ACCEPTED_RECOMMENDATION_REQUIRED");
    const key = [claims.sub, conversationId, plan.id, recommendation.id];
    const previous = await deps.ledger.read<ChangeSet>(tx, "CHANGE_SET", key);
    if (previous && !previous.immutable) throw new ConflictException("CHANGE_SET_REPLAY_CONFLICT");
    const proposal = await deps.ledger.read<ExactProposal>(tx, "EXACT_PROPOSAL", [claims.sub, conversationId, plan.id]);
    if (proposal) validateExactProposal(proposal.payload, plan, fresh, claims, conversationId);
    const eligible = certified.context.evidence.filter(e => e.status === "COLLECTED" && e.metadata?.operation === "filesystem.read" &&
      e.runtimeReference?.verificationState === "VERIFIED" && e.runtimeReference.truncated === false && !e.content?.truncated && typeof e.content?.text === "string");
    const constraints = result.plan.constraints.filter(c => c.rule === "HERO_TITLE_TEXT_ONLY");
    const changes: ReviewChange[] = [];
    if (constraints.length) {
      if (constraints.length !== 1 || !constraints[0].textChange) throw new ConflictException("CHANGE_SET_EXACT_CHANGE_REQUIRED");
      const change = constraints[0].textChange;
      const evidence = eligible.filter(e => evidenceIdentity(e) === change.evidenceRef && e.relativePath === change.relativePath);
      if (evidence.length !== 1) throw new ConflictException("CHANGE_SET_EXACT_EVIDENCE_REQUIRED");
      const text = evidence[0].content!.text, after = heroConstrainedResult(text, change);
      if (after === undefined) throw new ConflictException("CHANGE_SET_EXACT_EVIDENCE_REQUIRED");
      const hunk = reviewChange({ path: change.relativePath, scope: change.selector, start: change.start, end: change.end,
        before: text.slice(change.start, change.end), after: change.replacement, evidenceRef: change.evidenceRef,
        reason: "Apply the accepted recommendation's exact Hero heading change.", what: `Change Hero heading from ${change.before} to ${change.after}.`,
        how: "Replace only the certified text range; preserve h1/span markup, whitespace and all other content." }, text, change.sourceSha256);
      if (hunk) changes.push(hunk);
      if (proposal && (proposal.payload.changes.length !== 1 || proposal.payload.changes[0].path !== change.relativePath ||
        proposal.payload.changes[0].originalHash !== sha(text) || proposal.payload.changes[0].updatedHash !== sha(after)))
        throw new ConflictException("CHANGE_SET_PROPOSAL_CHANGED");
    } else {
      if (!proposal || proposal.payload.changes.length > 32) throw new ConflictException("CHANGE_SET_EXACT_CHANGE_REQUIRED");
      for (const replacement of proposal.payload.changes) {
        const evidence = eligible.filter(e => e.relativePath === replacement.path && sha(e.content!.text) === replacement.originalHash);
        if (evidence.length !== 1) throw new ConflictException("CHANGE_SET_EXACT_EVIDENCE_REQUIRED");
        const hunk = proposalReviewChange(evidence[0].content!.text, replacement, evidenceIdentity(evidence[0]));
        if (hunk) changes.push(hunk);
      }
    }
    const proposalLineage = previous ? previous.payload.proposal : proposal ? {
      id: proposal.payload.proposalId, version: proposal.payload.version, digest: proposal.payload.digest } : undefined;
    const base = { version: 1 as const, id: `change_set_${toolDigest([claims.sub, conversationId, plan.id, recommendation.id])}`,
      conversationId, userId: claims.sub, organizationId: claims.organizationId!, projectId: run.projectId,
      workspace: plan.steps[0].parameters.engineeringPlan.workspace,
      source: { runId: fresh.sourceRunId, sequence: fresh.checkpoint.sequence, version: fresh.checkpoint.version, digest: fresh.digest },
      recommendation: { id: recommendation.id, generation: rec.generation, acceptanceId: acceptance.id },
      plan: { id: plan.id, version: plan.version, digest: String(body.planDigest) }, changes,
      ...(proposalLineage ? { proposal: proposalLineage } : {}),
      authorization: "NOT_GRANTED" as const, executionEnabled: false as const };
    const set: ChangeSet = { ...base, digest: toolDigest(base) };
    await deps.ledger.create(tx, "CHANGE_SET", key, set, { immutable: true });
    const message = await tx.conversationMessage.findUnique({ where: { id: set.id } });
    if (message && toolDigest(message.metadata?.changeSet) !== toolDigest(set)) throw new ConflictException("CHANGE_SET_REPLAY_CONFLICT");
    if (!message) await tx.conversationMessage.create({ data: { id: set.id, conversationId, senderId: "agent", senderType: "assistant",
      content: "Change Review — proposed changes only. Review does not approve or execute anything.", metadata: { changeSet: set } } });
    return set;
  });
}
