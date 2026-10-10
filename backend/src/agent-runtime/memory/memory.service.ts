import { Injectable, Logger, Optional, Inject } from "@nestjs/common";
import { PrismaService } from "../../data-access/prisma.service";
import { MemoryExtractor, type MemoryCandidate } from "./memory-extractor";

export { type MemoryCandidate };

export interface UserMemoryDto {
  key: string;
  value: string;
}

/**
 * MemoryService
 *
 * Owns all persistent user-memory operations for SEKHEM:
 *  - extractCandidates   — delegates to MemoryExtractor (pure parsing, no LLM, no I/O)
 *  - upsertMemory        — persists/updates a single memory entry for a user in PostgreSQL
 *  - getMemoriesForUser  — retrieves all stored memories for a user (user-scoped)
 *  - buildMemoryContext  — formats a compact system-prompt context string
 *
 * Security guarantees:
 *  - All DB queries are strictly scoped by the server-authoritative userId (claims.sub).
 *  - No userId is accepted from frontend request bodies for memory reads/writes.
 *  - Memory context string contains no DB IDs, confidence values, or internal keys.
 *  - Private memory values are never logged.
 *
 * Failure isolation:
 *  - Memory errors are caught internally and logged at warn level (without user values).
 *  - Auxiliary memory failure never throws to callers, preserving normal chat behavior.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly prisma: any | null;
  private readonly extractor: MemoryExtractor;

  constructor(
    @Optional() @Inject(PrismaService) prismaService?: PrismaService
  ) {
    this.prisma = prismaService ?? null;
    this.extractor = new MemoryExtractor();
  }

  // ---------------------------------------------------------------------------
  // Extraction (pure, no I/O)
  // ---------------------------------------------------------------------------

  /**
   * Extract zero or more MemoryCandidate objects from a user message.
   * Delegates to MemoryExtractor. Never calls an LLM. Zero network I/O.
   */
  extractCandidates(message: string): MemoryCandidate[] {
    try {
      return this.extractor.extract(message);
    } catch {
      // Extraction must never break normal chat flow
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /**
   * Persist or update a memory entry for a user.
   * Uses upsert semantics: if (userId, key) already exists, update value/updatedAt.
   * Private values are never included in log output.
   *
   * @param userId          Server-authoritative user ID from session claims.
   * @param candidate       Extracted memory candidate.
   * @param conversationId  Originating conversation for audit trail (nullable).
   */
  async upsertMemory(
    userId: string,
    candidate: MemoryCandidate,
    conversationId: string | null
  ): Promise<void> {
    if (!this.prisma) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.prisma.userMemory.upsert({
        where: { userId_key: { userId, key: candidate.key } },
        update: {
          value: candidate.value,
          confidence: candidate.confidence,
          sourceConversationId: conversationId ?? undefined,
          updatedAt: new Date()
        },
        create: {
          userId,
          key: candidate.key,
          value: candidate.value,
          confidence: candidate.confidence,
          sourceConversationId: conversationId ?? undefined
        }
      });
      this.logger.log(`Memory upserted for user [key=${candidate.key}]`);
    } catch (err) {
      // Log key name only — never the value (private user data)
      this.logger.warn(
        `Failed to upsert memory [key=${candidate.key}]: ${(err as Error).message}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Retrieval
  // ---------------------------------------------------------------------------

  /**
   * Retrieve all stored memories for a user.
   * Always scoped by the server-authoritative userId.
   * Returns empty array on any failure (memory errors must not break chat).
   */
  async getMemoriesForUser(userId: string): Promise<UserMemoryDto[]> {
    if (!this.prisma) return [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const rows = await this.prisma.userMemory.findMany({
        where: { userId },
        select: { key: true, value: true },
        orderBy: { createdAt: "asc" as const }
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      this.logger.warn(`Failed to retrieve memories for user: ${(err as Error).message}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Context formatting
  // ---------------------------------------------------------------------------

  /**
   * Build a compact, assistant-safe memory context string for injection into
   * the SEKHEM system prompt.
   *
   * Returns null when the user has no stored memories or on any error.
   * The returned string contains no DB IDs, confidence values, internal keys,
   * or implementation details.
   */
  async buildMemoryContext(userId: string): Promise<string | null> {
    try {
      const memories = await this.getMemoriesForUser(userId);
      if (!memories || memories.length === 0) return null;

      const lines: string[] = [];
      for (const mem of memories) {
        if (mem.key === "preferred_name") {
          lines.push(`- الاسم المفضل للمستخدم / Preferred user name: ${mem.value}`);
        }
      }

      if (lines.length === 0) return null;

      return `معلومات محفوظة عن المستخدم (Application-provided user context):\n${lines.join("\n")}`;
    } catch (err) {
      this.logger.warn(`Failed to build memory context: ${(err as Error).message}`);
      return null;
    }
  }
}
