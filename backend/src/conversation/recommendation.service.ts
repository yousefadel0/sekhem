import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../data-access/prisma.service";
import { Prisma } from "@prisma/client";
import { persistSubmissionFailure } from "./submission-failure";
import { AiGatewayService } from "../ai-gateway/ai-gateway.service";
import { toolDigest } from "../agent-runtime/tools/tool-contract";
import { parseRecommendation, recommendationMessage, assertRecommendationPreservation, RECOMMENDATION_SCHEMA, type Recommendation } from "./recommendation.contract";
export function materiallyDifferent(a: Recommendation, b: Recommendation): boolean {
  const tokens = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const old = tokens(a.objective), next = tokens(b.objective), added = [...next].filter(t => !old.has(t));
  // Changing only words within the same proposed change kind is insufficient
  // evidence of a different approach. Fail closed until structured scope differs.
  return (a.changeKind !== b.changeKind || !!a.strategy && !!b.strategy && a.strategy !== b.strategy) && a.objective !== b.objective && added.length >= 4 && added.length / Math.max(next.size, 1) >= .25;
}
/** Existing conversation messages hold recommendations; never execution authority. */
@Injectable()
export class RecommendationService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(AiGatewayService) private readonly gateway: AiGatewayService) {}
  async latest(conversationId: string) {
    return this.db.conversationMessage.findFirst({ where: { conversationId, senderType: "assistant", metadata: { path: ["recommendation", "sourceRunId"], not: Prisma.DbNull } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  }
  async rejected(conversationId: string, recommendationId: string) {
    return !!await this.db.conversationMessage.findFirst({ where: { conversationId, senderType: "user", AND: [{ metadata: { path: ["recommendationId"], equals: recommendationId } }, { metadata: { path: ["recommendationResponse"], equals: "REJECT" } }] } });
  }
  /** Advisory generation reuses re-admitted certified evidence, never a listing. */
  async suggest(conversation: any, claims: any, message: string, requestId: string, certify: () => Promise<any>) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new BadRequestException("RECOMMENDATION_REQUEST_INVALID");
    const id = `recommendation_${toolDigest([conversation.id, claims.sub, requestId])}`, digest = toolDigest(message);
    const reserved = await this.db.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', conversation.id);
      const saved = await tx.conversationMessage.findUnique({ where: { id } });
      if (saved) {
        if ((saved.metadata as any)?.requestDigest !== digest) throw new ConflictException("RECOMMENDATION_REPLAY_CONFLICT");
        return false;
      }
      await tx.conversationMessage.create({ data: { id, conversationId: conversation.id, senderId: claims.sub, senderType: "user", content: message,
        metadata: { clientMessageId: requestId, requestDigest: digest, recommendationRequest: true } } });
      return true;
    });
    if (!reserved) {
      const reply = await this.db.conversationMessage.findUnique({ where: { id: id + "_reply" } });
      if (!reply) throw new ConflictException("RECOMMENDATION_PENDING_OR_FAILED");
      return reply;
    }
    try {
      const admitted = await certify();
      if (!admitted || admitted.source.sourceConversationId !== conversation.id) throw new ConflictException("CERTIFIED_EVIDENCE_UNAVAILABLE");
      const source = admitted.source;
      const raw = await this.gateway.requestStructuredReasoning({ history: [], question: JSON.stringify({ currentUserRequest: message,
        observed: source.checkpoint.understanding.facts, inferred: source.checkpoint.understanding.inferences, unknowns: source.checkpoint.understanding.unknowns }),
        schema: RECOMMENDATION_SCHEMA, name: "recommendation", purpose: "STRUCTURED_INSPECTION",
        systemInstruction: "Return one bounded improvement recommendation, not a fact, plan, approval or executable action. Use only supplied same-conversation certified evidence. Do not assert unsupported facts. Recommendations are proposed changes, not observations. Do not invent preservation: redesign preservation is UNSPECIFIED unless expressly supplied by the current user. No operations or execution authority." });
      let value: unknown; try { value = JSON.parse(raw); } catch { throw new BadRequestException("RECOMMENDATION_INVALID"); }
      const next = parseRecommendation(value); assertRecommendationPreservation(next, message);
      const fresh = await certify();
      if (!fresh || fresh.source.sourceRunId !== source.sourceRunId || fresh.source.digest !== source.digest ||
        fresh.source.checkpoint.sequence !== source.checkpoint.sequence) throw new ConflictException("UNDERSTANDING_CHANGED");
      return this.db.conversationMessage.create({ data: { id: id + "_reply", conversationId: conversation.id, senderId: "agent", senderType: "assistant",
        content: recommendationMessage(next), metadata: { recommendation: { ...next, generation: 1, sourceRunId: source.sourceRunId,
          sourceSequence: source.checkpoint.sequence, workspaceId: source.binding.workspaceId, bindingVersion: source.binding.version,
          runtimeId: source.binding.runtimeId, runtimeFingerprint: source.binding.runtimeFingerprint }, recommendationRequestId: id } } });
    } catch (error) {
      await persistSubmissionFailure(this.db, conversation, claims.sub, requestId, message, error);
      throw error;
    }
  }
  async accept(conversation: any, claims: any, message: string, requestId: string, prior: any) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new BadRequestException("RECOMMENDATION_REQUEST_INVALID");
    const id = `recommendation_accept_${toolDigest([conversation.id, claims.sub, requestId])}`, digest = toolDigest(message);
    return this.db.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', conversation.id);
      const saved = await tx.conversationMessage.findUnique({ where: { id } });
      if (saved) {
        if ((saved.metadata as any)?.requestDigest !== digest || (saved.metadata as any)?.recommendationId !== prior.id) throw new ConflictException("RECOMMENDATION_REPLAY_CONFLICT");
        return saved;
      }
      const latest = await tx.conversationMessage.findFirst({ where: { conversationId: conversation.id, senderType: "assistant", metadata: { path: ["recommendation", "sourceRunId"], not: Prisma.DbNull } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (latest?.id !== prior.id) throw new ConflictException("RECOMMENDATION_CHANGED");
      return tx.conversationMessage.create({ data: { id, conversationId: conversation.id, senderId: claims.sub, senderType: "user", content: message,
        metadata: { recommendationResponse: "ACCEPT", recommendationId: prior.id, requestDigest: digest, recommendationGeneration: prior.metadata.recommendation.generation,
          sourceRunId: prior.metadata.recommendation.sourceRunId, planningOnly: true } } });
    });
  }
  async reject(conversation: any, claims: any, message: string, requestId: string, prior: any, source: any) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new BadRequestException("RECOMMENDATION_REQUEST_INVALID");
    const id = `recommendation_${toolDigest([conversation.id, claims.sub, requestId])}`, digest = toolDigest(message), previous = prior.metadata.recommendation;
    const reserve = await this.db.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', conversation.id);
      const saved = await tx.conversationMessage.findUnique({ where: { id } });
      if (saved) { if ((saved.metadata as any)?.requestDigest !== digest) throw new ConflictException("RECOMMENDATION_REPLAY_CONFLICT"); return false; }
      const latest = await tx.conversationMessage.findFirst({ where: { conversationId: conversation.id, senderType: "assistant", metadata: { path: ["recommendation", "sourceRunId"], not: Prisma.DbNull } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (latest?.id !== prior.id) throw new ConflictException("RECOMMENDATION_CHANGED");
      await tx.conversationMessage.create({ data: { id, conversationId: conversation.id, senderId: claims.sub, senderType: "user", content: message,
        metadata: { clientMessageId: requestId, recommendationResponse: "REJECT", recommendationId: prior.id, requestDigest: digest } } }); return true;
    });
    if (!reserve) { const replay = await this.db.conversationMessage.findUnique({ where: { id: id + "_reply" } }); if (!replay) throw new ConflictException("RECOMMENDATION_PENDING_OR_FAILED"); return replay; }
    try {
    const raw = await this.gateway.requestStructuredReasoning({ history: [], question: JSON.stringify({ currentUserRequest: message, rejectedRecommendation: previous,
      observed: source.checkpoint.understanding.facts, inferred: source.checkpoint.understanding.inferences }), schema: RECOMMENDATION_SCHEMA, name: "recommendation", purpose: "STRUCTURED_INSPECTION",
      systemInstruction: "Return one materially different improvement recommendation, not a plan, fact, approval or executable action. Use only supplied same-conversation certified source as context. Declare strategy from the contract. Choose a different strategy or changeKind and approach with at least four substantive new objective terms, not a reworded title. Do not invent preservation: redesign preservation is UNSPECIFIED unless expressly supplied by the current user. No operations or unsupported factual claims." });
    let value: unknown; try { value = JSON.parse(raw); } catch { throw new BadRequestException("RECOMMENDATION_INVALID"); }
    const next = parseRecommendation(value); assertRecommendationPreservation(next, message);
    if (!materiallyDifferent(previous, next)) throw new BadRequestException("RECOMMENDATION_NOT_DIFFERENT");
    return this.db.conversationMessage.create({ data: { id: id + "_reply", conversationId: conversation.id, senderId: "agent", senderType: "assistant", content: recommendationMessage(next),
      metadata: { recommendation: { ...previous, ...next, generation: (previous.generation ?? 1) + 1, supersedes: prior.id }, rejectionMessageId: id } } });
    } catch (error) {
      await persistSubmissionFailure(this.db, conversation, claims.sub, requestId, message, error);
      throw error;
    }
  }
}
