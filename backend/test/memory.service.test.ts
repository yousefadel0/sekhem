import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryExtractor } from "../src/agent-runtime/memory/memory-extractor";
import { MemoryService } from "../src/agent-runtime/memory/memory.service";

describe("MemoryExtractor", () => {
  const extractor = new MemoryExtractor();

  it("extracts Arabic preferred name from explicit declaration 'اسمي أحمد، افتكر اسمي.'", () => {
    const candidates = extractor.extract("اسمي أحمد، افتكر اسمي.");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].key, "preferred_name");
    assert.equal(candidates[0].value, "أحمد");
    assert.equal(candidates[0].confidence, 1.0);
  });

  it("extracts Arabic name when trailing clause has no comma 'اسمي أحمد افتكر اسمي'", () => {
    const candidates = extractor.extract("اسمي أحمد افتكر اسمي");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].key, "preferred_name");
    assert.equal(candidates[0].value, "أحمد");
  });

  it("extracts Arabic name with 'افتكر إن اسمي [name]'", () => {
    const candidates = extractor.extract("افتكر إن اسمي محمد");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].value, "محمد");
  });

  it("extracts Arabic name with 'افتكر ان اسمي [name]'", () => {
    const candidates = extractor.extract("افتكر ان اسمي محمود");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].value, "محمود");
  });

  it("extracts Arabic name with 'ناديني [name]'", () => {
    const candidates = extractor.extract("ناديني كريم");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].value, "كريم");
  });

  it("extracts Arabic name with 'أنا اسمي [name]'", () => {
    const candidates = extractor.extract("أنا اسمي يوسف");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].value, "يوسف");
  });

  it("extracts English name from 'My name is Ahmed, remember my name.'", () => {
    const candidates = extractor.extract("My name is Ahmed, remember my name.");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].key, "preferred_name");
    assert.equal(candidates[0].value, "Ahmed");
    assert.equal(candidates[0].confidence, 1.0);
  });

  it("extracts English name from 'Please remember that my name is Sarah'", () => {
    const candidates = extractor.extract("Please remember that my name is Sarah");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].value, "Sarah");
  });

  it("extracts English name from 'Call me Omar'", () => {
    const candidates = extractor.extract("Call me Omar");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].value, "Omar");
  });

  // Rejection tests (Questions, Arbitrary statements, Guessing prevention)
  it("rejects questions asking for name: 'اسمي إيه؟'", () => {
    const candidates = extractor.extract("اسمي إيه؟");
    assert.equal(candidates.length, 0);
  });

  it("rejects questions without question mark: 'اسمي ايه'", () => {
    const candidates = extractor.extract("اسمي ايه");
    assert.equal(candidates.length, 0);
  });

  it("rejects questions: 'ما هو اسمي؟'", () => {
    const candidates = extractor.extract("ما هو اسمي؟");
    assert.equal(candidates.length, 0);
  });

  it("rejects English questions: 'What is my name?'", () => {
    const candidates = extractor.extract("What is my name?");
    assert.equal(candidates.length, 0);
  });

  it("rejects standalone command without name: 'افتكر اسمي'", () => {
    const candidates = extractor.extract("افتكر اسمي");
    assert.equal(candidates.length, 0);
  });

  it("rejects arbitrary chat messages: 'I like pizza'", () => {
    const candidates = extractor.extract("I like pizza");
    assert.equal(candidates.length, 0);
  });

  it("rejects arbitrary technical requests: 'Create a Next.js login page'", () => {
    const candidates = extractor.extract("Create a Next.js login page");
    assert.equal(candidates.length, 0);
  });

  it("rejects empty or whitespace-only inputs", () => {
    assert.equal(extractor.extract("").length, 0);
    assert.equal(extractor.extract("   ").length, 0);
  });
});

describe("MemoryService with Mock Prisma", () => {
  // In-memory store simulating PostgreSQL UserMemory table
  const memoryStore: Array<{
    id: string;
    userId: string;
    key: string;
    value: string;
    confidence: number;
    sourceConversationId?: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  const mockPrisma = {
    userMemory: {
      upsert: async (args: {
        where: { userId_key: { userId: string; key: string } };
        update: { value: string; confidence: number; sourceConversationId?: string; updatedAt: Date };
        create: { userId: string; key: string; value: string; confidence: number; sourceConversationId?: string };
      }) => {
        const existing = memoryStore.find(
          (m) => m.userId === args.where.userId_key.userId && m.key === args.where.userId_key.key
        );
        if (existing) {
          existing.value = args.update.value;
          existing.confidence = args.update.confidence;
          existing.sourceConversationId = args.update.sourceConversationId;
          existing.updatedAt = args.update.updatedAt;
          return existing;
        }
        const created = {
          id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId: args.create.userId,
          key: args.create.key,
          value: args.create.value,
          confidence: args.create.confidence,
          sourceConversationId: args.create.sourceConversationId,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        memoryStore.push(created);
        return created;
      },
      findMany: async (args: { where: { userId: string }; select?: { key: boolean; value: boolean } }) => {
        return memoryStore
          .filter((m) => m.userId === args.where.userId)
          .map((m) => ({ key: m.key, value: m.value }));
      }
    }
  };

  it("upserts memory and retrieves it for the user", async () => {
    const service = new MemoryService(mockPrisma as any);
    const userId = "user-123";

    await service.upsertMemory(userId, { key: "preferred_name", value: "أحمد", confidence: 1.0 }, "conv-1");

    const memories = await service.getMemoriesForUser(userId);
    assert.equal(memories.length, 1);
    assert.equal(memories[0].key, "preferred_name");
    assert.equal(memories[0].value, "أحمد");
  });

  it("upsert updates existing key without creating duplicates (User A = Ahmed -> Mohamed)", async () => {
    const service = new MemoryService(mockPrisma as any);
    const userId = "user-upsert-test";

    await service.upsertMemory(userId, { key: "preferred_name", value: "أحمد", confidence: 1.0 }, "conv-1");
    await service.upsertMemory(userId, { key: "preferred_name", value: "محمد", confidence: 1.0 }, "conv-2");

    const memories = await service.getMemoriesForUser(userId);
    assert.equal(memories.length, 1, "Should have exactly 1 record for preferred_name");
    assert.equal(memories[0].value, "محمد", "Value should be updated to Mohamed");
  });

  it("strictly isolates User A memories from User B", async () => {
    const service = new MemoryService(mockPrisma as any);
    const userA = "user-A";
    const userB = "user-B";

    await service.upsertMemory(userA, { key: "preferred_name", value: "أحمد", confidence: 1.0 }, "conv-A");
    await service.upsertMemory(userB, { key: "preferred_name", value: "محمد", confidence: 1.0 }, "conv-B");

    const memA = await service.getMemoriesForUser(userA);
    const memB = await service.getMemoriesForUser(userB);

    assert.equal(memA.length, 1);
    assert.equal(memA[0].value, "أحمد");

    assert.equal(memB.length, 1);
    assert.equal(memB[0].value, "محمد");
  });

  it("buildMemoryContext formats context without exposing DB IDs or confidence", async () => {
    const service = new MemoryService(mockPrisma as any);
    const userId = "user-ctx-test";

    await service.upsertMemory(userId, { key: "preferred_name", value: "أحمد", confidence: 1.0 }, "conv-ctx");

    const context = await service.buildMemoryContext(userId);
    assert.ok(context !== null);
    assert.match(context, /أحمد/);
    assert.match(context, /الاسم المفضل/);
    // Ensure no internal DB fields or confidence leaked
    assert.doesNotMatch(context, /confidence/i);
    assert.doesNotMatch(context, /1\.0/);
    assert.doesNotMatch(context, /cuid/i);
    assert.doesNotMatch(context, /id:/i);
  });

  it("buildMemoryContext returns null when user has no memories", async () => {
    const service = new MemoryService(mockPrisma as any);
    const context = await service.buildMemoryContext("user-no-memories");
    assert.equal(context, null);
  });

  it("isolates database failure safely without throwing", async () => {
    const failingPrisma = {
      userMemory: {
        upsert: async () => {
          throw new Error("DB connection lost");
        },
        findMany: async () => {
          throw new Error("DB connection lost");
        }
      }
    };

    const service = new MemoryService(failingPrisma as any);
    // Upsert must not throw
    await assert.doesNotReject(async () => {
      await service.upsertMemory("user-err", { key: "preferred_name", value: "أحمد", confidence: 1.0 }, null);
    });

    // Retrieval must return empty array on failure
    const memories = await service.getMemoriesForUser("user-err");
    assert.deepEqual(memories, []);

    // buildMemoryContext must return null on failure
    const context = await service.buildMemoryContext("user-err");
    assert.equal(context, null);
  });
});
