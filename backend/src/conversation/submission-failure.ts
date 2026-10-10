import { ConflictException } from "@nestjs/common";
import { toolDigest } from "../agent-runtime/tools/tool-contract";
import { diagnosticFromError } from "../ai-gateway/provider-diagnostic";
import type { PrismaService } from "../data-access/prisma.service";
import { PROVIDER_FAILURE_CODES } from "../ai-gateway/providers/vllm-openai-compatible.adapter";

export function submissionFailureId(conversationId: string, userId: string, requestId: string): string {
  return `submission_failure_${toolDigest([conversationId, userId, requestId])}`;
}
/** Called only after conversation ownership and project authorization. No raw errors. */
export async function persistSubmissionFailure(db: Pick<PrismaService, "$transaction">, conversation: { id: string }, userId: string, requestId: string,
  instruction: string, error: unknown, acceptedMessageId?: string) {
  const id = submissionFailureId(conversation.id, userId, requestId);
  const message = (error as Error)?.message;
  const safeCodes = ["INSPECTION_TARGET_AMBIGUOUS", "INSPECTION_SCOPE_DENIED", "RECOMMENDATION_INVALID", "RECOMMENDATION_NOT_DIFFERENT",
    "RECOMMENDATION_PENDING_OR_FAILED", "RECOMMENDATION_CHANGED", "CERTIFIED_UNDERSTANDING_REQUIRED", "UNDERSTANDING_CHANGED", "PLAN_READY_REQUIRED"];
  const diagnosticCode = diagnosticFromError(error)?.failureCode;
  const code = typeof message === "string" && safeCodes.includes(message) ? message
    : diagnosticCode && PROVIDER_FAILURE_CODES.includes(diagnosticCode) ? diagnosticCode : "REQUEST_FAILED";
  const arabic = /[\u0600-\u06ff]/.test(instruction);
  const explanation = code === "INSPECTION_TARGET_AMBIGUOUS"
    ? arabic ? "طلب التغيير يحتوي أكثر من هدف. حدّد أهداف التعديل بوضوح، أو اطلب مراجعة الملفات قراءة فقط أولًا." : "The change request has multiple targets. Specify the intended changes, or request a read-only review of these files first."
    : arabic ? "تعذّر تأكيد الطلب. راجع الحالة المحفوظة والتفاصيل لمعرفة السبب." : "The request could not be confirmed. Review the saved state and details for the reason.";
  return db.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "Conversation" WHERE "id"=$1 FOR NO KEY UPDATE', conversation.id);
    const prior = acceptedMessageId
      ? await tx.conversationMessage.findUnique({ where: { id: acceptedMessageId } })
      : await tx.conversationMessage.findFirst({ where: { conversationId: conversation.id, senderId: userId, senderType: "user",
        metadata: { path: ["clientMessageId"], equals: requestId } } });
    if (prior && (prior.conversationId !== conversation.id || prior.senderId !== userId || prior.senderType !== "user")) throw new ConflictException("MESSAGE_CONFLICT");
    if (prior && prior.content !== instruction) throw new ConflictException("MESSAGE_CONFLICT");
    if (!prior) await tx.conversationMessage.upsert({ where: { id: id + "_user" }, create: {
      id: id + "_user", conversationId: conversation.id, senderId: userId, senderType: "user", content: instruction,
      metadata: { clientMessageId: requestId } }, update: {} });
    return tx.conversationMessage.upsert({ where: { id }, create: { id, conversationId: conversation.id, senderId: "agent",
      senderType: "assistant", content: arabic ? `${explanation}\nرمز التشخيص: ${code}. لم يُعَد إرسال الطلب تلقائيًا.` : `Request failed: ${code}. ${explanation} No automatic retry was performed.`,
      metadata: { submissionFailure: true, clientMessageId: requestId, code, requestDigest: toolDigest(instruction) } }, update: {} });
  });
}
