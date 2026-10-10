import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../data-access/prisma.service";
import type { SessionClaims } from "../../auth/auth.dto";
import { modeContext } from "../../conversation/conversation-mode";
import { boundHistoricalResults, deriveHistoricalStatement, historicalRequest, historyDigest, type HistoricalMemoryContext } from "./historical-memory";

@Injectable()
export class HistoricalMemoryService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  /** Called after a message commit. Reads only that conversation's newest bounded sources. */
  async deriveCommitted(conversationId: string, userId: string): Promise<void> {
    try {
      await this.db.$transaction(async tx => {
        const conversation = await tx.conversation.findUnique({ where: { id: conversationId }, include: { project: true } });
        if (!conversation || conversation.userId !== userId || conversation.status !== "active") return;
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, `history:${conversationId}`);
        const workspace = modeContext(conversation)?.workspace;
        const rows = await tx.conversationMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: 5 });
        for (const message of rows) {
          const metadata = message.metadata as any;
          if (metadata?.historicalContext || metadata?.accountHistoricalMemory) continue;
          let certifiedDigest: string | null = null;
          let derived = message.senderType === "user" && message.senderId === userId ? deriveHistoricalStatement(message.content) : null;
          // Never derive a verified outcome from assistant prose. Check the persisted completed
          // run and its certified source checkpoint; the summary records inspection only.
          if (message.senderType === "agent" && metadata?.inspectionReport && metadata?.outcome === "COMPLETED") {
            const run = await tx.agentRun.findUnique({ where: { id: metadata.agentRunId }, include: { plans: { orderBy: { version: "desc" }, take: 1 } } });
            const checkpoint = (run?.plans[0]?.steps as any)?.[0]?.parameters?.understanding;
            const topic = deriveHistoricalStatement(run?.plans[0]?.summary ?? "");
            if (topic && run?.status === "COMPLETED" && run.userId === userId && run.conversationId === conversationId &&
              checkpoint?.status === "GROUNDED" && checkpoint?.understanding?.readiness === "UNDERSTANDING_READY" &&
              checkpoint?.evidence?.some((item: any) => item.read === true && item.selected === true && item.truncated === false)) {
              certifiedDigest = historyDigest([run.id, run.plans[0].version, checkpoint]);
              derived = { ...topic, personal: false, category: "RECORDED_OUTCOME", summary: `A persisted certified inspection completed for ${topic.entity}. This records historical understanding only, not a file change or current runtime state.` };
            }
          }
          if (!derived) continue;
          const digest = historyDigest([message.senderType, message.content, certifiedDigest]);
          const key = historyDigest([userId, conversationId, message.id, digest, "history-v1"]);
          await tx.$executeRawUnsafe(`UPDATE "HistoricalMemoryItem" SET "retentionState"='SUPERSEDED'
            WHERE "userId"=$1 AND "sourceMessageId"=$2 AND "derivationKey"<>$3 AND "retentionState"='ACTIVE'`, userId, message.id, key);
          // Source revision is provenance, not a mutable conversation-level idempotency key.
          await tx.$executeRawUnsafe(`INSERT INTO "HistoricalMemoryItem"
            ("id", "derivationKey", "userId", "scope", "organizationId", "projectId", "workspaceId", "bindingVersion", "entity", "aliases", "summary", "category", "sourceEventAt", "sourceConversationId", "sourceMessageId", "sourceDigest", "sourceRevision", "extractorVersion", "revision")
            SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11,$12,$13,$14,$15,$16,$17,'history-v1',
              (SELECT COALESCE(MAX("revision"),0)+1 FROM "HistoricalMemoryItem" WHERE "userId"=$3 AND "sourceMessageId"=$15)
            WHERE NOT EXISTS (SELECT 1 FROM "HistoricalMemoryItem" WHERE "userId"=$3 AND "sourceMessageId"=$15 AND "retentionState"='FORGOTTEN')
            ON CONFLICT ("derivationKey") DO NOTHING`,
            `history_${key}`, key, userId, derived.personal ? "USER_GLOBAL" : workspace ? "WORKSPACE" : "PROJECT", derived.personal ? null : conversation.project.organizationId, derived.personal ? null : conversation.projectId,
            derived.personal ? null : workspace?.workspaceId ?? null, derived.personal ? null : workspace?.bindingVersion ?? null, derived.entity, derived.aliases, derived.summary, derived.category,
            message.createdAt, conversationId, message.id, digest, conversation.updatedAt.toISOString());
        }
      });
    } catch { /* Auxiliary derivation cannot break the committed conversation. Retrieval reports availability. */ }
  }

  /** Scope is computed by existing authenticated project access, never supplied by the client. */
  async retrieve(claims: SessionClaims, text: string, visibleProjectIds: () => Promise<string[]>, now = new Date()): Promise<HistoricalMemoryContext | null> {
    const request = historicalRequest(text, now);
    if (!request) return null;
    try {
      const user = await this.db.user.findUnique({ where: { id: claims.sub }, select: { status: true, organizationId: true } });
      if (!user || user.status !== "active" || (user.organizationId ?? null) !== (claims.organizationId ?? null)) throw new Error("MEMORY_ACCESS_UNAVAILABLE");
      const projects = await visibleProjectIds();
      const tokens = request.subject.split(" ").filter(Boolean).slice(0, 8);
      // Plain lexemes only; query text can never inject SQL or tsquery operators.
      const search = tokens.map(token => token.replace(/[^\p{L}\p{N}_-]/gu, "")).filter(Boolean).join(" | ");
      const rows = await this.db.$queryRawUnsafe<any[]>(`WITH matches AS (SELECT "id","revision","scope","projectId","workspaceId","bindingVersion","entity","aliases","summary","category","sourceEventAt","sourceConversationId","sourceMessageId","sourceDigest","sourceRevision","extractorVersion","derivedAt","sourceDeleted" FROM "HistoricalMemoryItem"
        WHERE "userId"=$1 AND "retentionState"='ACTIVE'
        AND ("scope"='USER_GLOBAL' OR ("organizationId"=$2 AND "projectId"=ANY($3::text[])))
        AND ($4='' OR "searchDocument" @@ to_tsquery('simple',$4))
        AND ($5::timestamptz IS NULL OR "sourceEventAt">=$5::timestamptz)
        AND ($6::timestamptz IS NULL OR "sourceEventAt"<=$6::timestamptz)
        ), groups AS (SELECT DISTINCT "projectId","workspaceId","entity" FROM matches LIMIT 2)
        SELECT matches.*,(SELECT count(*)::int FROM groups) AS "matchGroups" FROM matches
        ORDER BY "sourceEventAt" DESC,"id" ASC LIMIT 5`, claims.sub, claims.organizationId ?? null, projects, search, request.after, request.before);
      const result = boundHistoricalResults(rows, request.subject);
      if (!request.forget || result.state === "AMBIGUOUS") return result;
      await this.db.$executeRawUnsafe(`UPDATE "HistoricalMemoryItem" SET "retentionState"='FORGOTTEN'
        WHERE "userId"=$1 AND "retentionState"='ACTIVE'
        AND ("scope"='USER_GLOBAL' OR ("organizationId"=$2 AND "projectId"=ANY($3::text[])))
        AND ($4='' OR "searchDocument" @@ to_tsquery('simple',$4))
        AND ($5::timestamptz IS NULL OR "sourceEventAt">=$5::timestamptz)
        AND ($6::timestamptz IS NULL OR "sourceEventAt"<=$6::timestamptz)`, claims.sub, claims.organizationId ?? null, projects, search, request.after, request.before);
      return { state: "FORGOTTEN", items: [] };
    } catch { return { state: "UNAVAILABLE", items: [], code: "HISTORICAL_MEMORY_UNAVAILABLE" }; }
  }

  async markSourceDeletedTx(tx: any, userId: string, conversationId: string): Promise<void> {
    await tx.$executeRawUnsafe(`UPDATE "HistoricalMemoryItem" SET "sourceDeleted"=true WHERE "userId"=$1 AND "sourceConversationId"=$2`, userId, conversationId);
  }
}
