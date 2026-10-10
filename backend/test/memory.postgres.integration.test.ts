import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PrismaClient } from "@prisma/client";
import { MemoryService } from "../src/agent-runtime/memory/memory.service";
import { isolatedDatabaseUrl } from "./helpers/isolated-database";

describe("UserMemory PostgreSQL Real Persistence Integration Test", { skip: process.env.SEKHEM_MEMORY_DB_TEST !== "1" }, () => {
  const prisma = new PrismaClient({ datasources: { db: { url: isolatedDatabaseUrl() } } });
  const testUserAId = `test-pg-user-a-${Date.now()}`;
  const testUserBId = `test-pg-user-b-${Date.now()}`;
  let memoryService: MemoryService;

  before(async () => {
    // Connect to PostgreSQL
    await prisma.$connect();

    // Create real test users in PostgreSQL to satisfy the foreign key constraint
    await prisma.user.create({
      data: {
        id: testUserAId,
        email: `${testUserAId}@sekhem.test`,
        displayName: "Test User A",
        status: "active"
      }
    });

    await prisma.user.create({
      data: {
        id: testUserBId,
        email: `${testUserBId}@sekhem.test`,
        displayName: "Test User B",
        status: "active"
      }
    });

    memoryService = new MemoryService(prisma as any);
  });

  after(async () => {
    try {
      // Clean up test data from PostgreSQL
      await prisma.userMemory.deleteMany({
        where: { userId: { in: [testUserAId, testUserBId] } }
      });
      await prisma.user.deleteMany({
        where: { id: { in: [testUserAId, testUserBId] } }
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("persists UserMemory directly into PostgreSQL", async () => {
    // Upsert memory using MemoryService
    await memoryService.upsertMemory(
      testUserAId,
      { key: "preferred_name", value: "أحمد", confidence: 1.0 },
      "conv-session-1"
    );

    // Verify row directly in PostgreSQL table via raw PrismaClient query
    const row = await prisma.userMemory.findUnique({
      where: {
        userId_key: {
          userId: testUserAId,
          key: "preferred_name"
        }
      }
    });

    assert.ok(row !== null, "UserMemory row must exist in PostgreSQL");
    assert.equal(row.userId, testUserAId);
    assert.equal(row.key, "preferred_name");
    assert.equal(row.value, "أحمد");
    assert.equal(row.confidence, 1.0);
    assert.equal(row.sourceConversationId, "conv-session-1");
  });

  it("retrieves memory cross-session from PostgreSQL via fresh service instance", async () => {
    // New service instance with no shared in-memory state
    const freshService = new MemoryService(prisma as any);

    const memories = await freshService.getMemoriesForUser(testUserAId);
    assert.equal(memories.length, 1);
    assert.equal(memories[0].key, "preferred_name");
    assert.equal(memories[0].value, "أحمد");

    const context = await freshService.buildMemoryContext(testUserAId);
    assert.ok(context !== null);
    assert.match(context, /أحمد/);
  });

  it("updates memory in PostgreSQL via upsert without duplicating rows", async () => {
    // Update Ahmed -> Mohamed
    await memoryService.upsertMemory(
      testUserAId,
      { key: "preferred_name", value: "محمد", confidence: 1.0 },
      "conv-session-2"
    );

    // Verify count in PostgreSQL is still 1
    const count = await prisma.userMemory.count({
      where: { userId: testUserAId }
    });
    assert.equal(count, 1, "There should be exactly one preferred_name row per user in PostgreSQL");

    // Verify updated value
    const row = await prisma.userMemory.findUnique({
      where: { userId_key: { userId: testUserAId, key: "preferred_name" } }
    });
    assert.equal(row?.value, "محمد");
  });

  it("strictly enforces user isolation in PostgreSQL with zero cross-user leakage", async () => {
    // User B states name is Mohamed
    await memoryService.upsertMemory(
      testUserBId,
      { key: "preferred_name", value: "Mohamed", confidence: 1.0 },
      "conv-session-b"
    );

    // Retrieve memories for User A
    const memA = await memoryService.getMemoriesForUser(testUserAId);
    // Retrieve memories for User B
    const memB = await memoryService.getMemoriesForUser(testUserBId);

    // User A sees only User A's name
    assert.equal(memA.length, 1);
    assert.equal(memA[0].value, "محمد");

    // User B sees only User B's name
    assert.equal(memB.length, 1);
    assert.equal(memB[0].value, "Mohamed");

    // Context for User A contains only User A's name
    const ctxA = await memoryService.buildMemoryContext(testUserAId);
    assert.match(ctxA!, /محمد/);
    assert.doesNotMatch(ctxA!, /Mohamed/);

    // Context for User B contains only User B's name
    const ctxB = await memoryService.buildMemoryContext(testUserBId);
    assert.match(ctxB!, /Mohamed/);
    assert.doesNotMatch(ctxB!, /محمد/);
  });
});
