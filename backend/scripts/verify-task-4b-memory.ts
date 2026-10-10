import "reflect-metadata";
import { readFileSync } from "fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/data-access/prisma.service";
import { ConversationService } from "../src/conversation/conversation.service";
import { MemoryService } from "../src/memory/memory.service";
import type { SessionClaims } from "../src/auth/auth.dto";

function loadEnv(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {}
}

loadEnv(".env");
loadEnv("backend/.env");

async function main() {
  console.log("══════════════════════════════════════════════════════════════════════════");
  console.log("SEKHEM TASK 4B — LIVE TWO-SESSION & MULTI-USER MEMORY VERIFICATION");
  console.log("══════════════════════════════════════════════════════════════════════════\n");

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const conversationService = app.get(ConversationService);
  const memoryService = app.get(MemoryService);

  const timestamp = Date.now();
  const userAId = `user-a-ahmed-${timestamp}`;
  const userBId = `user-b-mohamed-${timestamp}`;

  try {
    // 1. Resolve canonical project
    const project = await prisma.project.findFirst({
      where: { id: "project-community-sonic-sovereign" }
    });
    if (!project) {
      throw new Error("Canonical project project-community-sonic-sovereign not found");
    }
    console.log(`[1] Canonical Project: ${project.name} (${project.id})`);

    // 2. Provision User A and User B in PostgreSQL
    console.log("\n[2] Provisioning test users in PostgreSQL...");
    await prisma.user.create({
      data: {
        id: userAId,
        email: `${userAId}@sekhem.test`,
        displayName: "User A",
        status: "active",
        organizationId: project.organizationId
      }
    });
    await prisma.projectMember.create({
      data: {
        id: `pm-a-${timestamp}`,
        projectId: project.id,
        userId: userAId,
        role: "PM"
      }
    });

    await prisma.user.create({
      data: {
        id: userBId,
        email: `${userBId}@sekhem.test`,
        displayName: "User B",
        status: "active",
        organizationId: project.organizationId
      }
    });
    await prisma.projectMember.create({
      data: {
        id: `pm-b-${timestamp}`,
        projectId: project.id,
        userId: userBId,
        role: "PM"
      }
    });

    const claimsA: SessionClaims = {
      sub: userAId,
      sessionId: `sess-a-${timestamp}`,
      email: `${userAId}@sekhem.test`,
      displayName: "User A",
      role: "PM",
      organizationId: project.organizationId,
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    const claimsB: SessionClaims = {
      sub: userBId,
      sessionId: `sess-b-${timestamp}`,
      email: `${userBId}@sekhem.test`,
      displayName: "User B",
      role: "PM",
      organizationId: project.organizationId,
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    console.log(`    ✓ User A created: ${userAId}`);
    console.log(`    ✓ User B created: ${userBId}`);

    // -------------------------------------------------------------------------
    // Session A (User A)
    // -------------------------------------------------------------------------
    console.log("\n[3] Session A — User A: 'اسمي أحمد، افتكر اسمي.'");
    const convA = await conversationService.createConversation(userAId, {
      projectId: project.id,
      title: "Session A — Name Introduction"
    });
    console.log(`    ✓ Created Conversation A: ${convA.id}`);

    const resA = await conversationService.postMessage(convA.id, claimsA, {
      content: "اسمي أحمد، افتكر اسمي.",
      chat: true
    });
    console.log(`    User A: "اسمي أحمد، افتكر اسمي."`);
    console.log(`    SEKHEM: "${resA.content}"`);

    // Verify UserMemory in PostgreSQL
    const memoryRecordA = await prisma.userMemory.findUnique({
      where: { userId_key: { userId: userAId, key: "preferred_name" } }
    });
    if (!memoryRecordA) {
      throw new Error("FAIL: UserMemory was not persisted in PostgreSQL for User A!");
    }
    console.log(`    ✓ PostgreSQL UserMemory: key='${memoryRecordA.key}', value='${memoryRecordA.value}', sourceConv='${memoryRecordA.sourceConversationId}'`);
    if (memoryRecordA.value !== "أحمد") {
      throw new Error(`FAIL: Expected 'أحمد', got '${memoryRecordA.value}'`);
    }

    // -------------------------------------------------------------------------
    // Session B (User A, new conversation cross-session)
    // -------------------------------------------------------------------------
    console.log("\n[4] Session B — User A in a completely new conversation: 'اسمي إيه؟'");
    const convB = await conversationService.createConversation(userAId, {
      projectId: project.id,
      title: "Session B — Name Recall"
    });
    console.log(`    ✓ Created Conversation B (Zero prior messages): ${convB.id}`);

    const resB = await conversationService.postMessage(convB.id, claimsA, {
      content: "اسمي إيه؟",
      chat: true
    });
    console.log(`    User A: "اسمي إيه؟"`);
    console.log(`    SEKHEM: "${resB.content}"`);

    const answersWithAhmed = resB.content.includes("أحمد") || resB.content.toLowerCase().includes("ahmed");
    if (!answersWithAhmed) {
      throw new Error(`FAIL: SEKHEM response did not contain Ahmed / أحمد! Response was: "${resB.content}"`);
    }
    console.log("    ✓ SUCCESS: SEKHEM answered using Ahmed in a fresh cross-session conversation!");

    // -------------------------------------------------------------------------
    // Multi-User Isolation Verification
    // -------------------------------------------------------------------------
    console.log("\n[5] Multi-User Isolation Verification — User B (Mohamed)");
    const convB1 = await conversationService.createConversation(userBId, {
      projectId: project.id,
      title: "User B — Name Introduction"
    });
    const resB1 = await conversationService.postMessage(convB1.id, claimsB, {
      content: "اسمي محمد، افتكر اسمي.",
      chat: true
    });
    console.log(`    User B: "اسمي محمد، افتكر اسمي."`);
    console.log(`    SEKHEM: "${resB1.content}"`);

    const memoryRecordB = await prisma.userMemory.findUnique({
      where: { userId_key: { userId: userBId, key: "preferred_name" } }
    });
    if (!memoryRecordB || memoryRecordB.value !== "محمد") {
      throw new Error("FAIL: User B memory was not persisted correctly in PostgreSQL!");
    }
    console.log(`    ✓ User B PostgreSQL UserMemory: key='${memoryRecordB.key}', value='${memoryRecordB.value}'`);

    // User B asks for their name in a new conversation
    const convB2 = await conversationService.createConversation(userBId, {
      projectId: project.id,
      title: "User B — Name Recall"
    });
    const resB2 = await conversationService.postMessage(convB2.id, claimsB, {
      content: "اسمي إيه؟",
      chat: true
    });
    console.log(`    User B: "اسمي إيه؟"`);
    console.log(`    SEKHEM: "${resB2.content}"`);

    const answersUserBWithMohamed = resB2.content.includes("محمد") || resB2.content.toLowerCase().includes("mohamed");
    const leaksAhmedToUserB = resB2.content.includes("أحمد") || resB2.content.toLowerCase().includes("ahmed");

    if (!answersUserBWithMohamed) {
      throw new Error(`FAIL: SEKHEM did not answer User B with Mohamed! Response: "${resB2.content}"`);
    }
    if (leaksAhmedToUserB) {
      throw new Error(`CRITICAL SECURITY FAILURE: User B's response leaked User A's name (Ahmed)!`);
    }
    console.log("    ✓ SUCCESS: User B gets 'محمد' (Mohamed) and NO cross-user memory leakage!");

    // Final check: verify User A's memory remains untouched
    const memoryRecordACheck = await prisma.userMemory.findUnique({
      where: { userId_key: { userId: userAId, key: "preferred_name" } }
    });
    if (memoryRecordACheck?.value !== "أحمد") {
      throw new Error("FAIL: User A's memory was altered by User B's interaction!");
    }
    console.log("    ✓ SUCCESS: User A's memory remains strictly isolated as 'أحمد' in PostgreSQL!");

    console.log("\n══════════════════════════════════════════════════════════════════════════");
    console.log("ALL LIVE VERIFICATION CHECKS PASSED PERFECTLY!");
    console.log("══════════════════════════════════════════════════════════════════════════\n");
  } finally {
    // Clean up test data
    console.log("[Cleanup] Cleaning up test records from PostgreSQL...");
    try {
      await prisma.userMemory.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
      const convs = await prisma.conversation.findMany({
        where: { userId: { in: [userAId, userBId] } },
        select: { id: true }
      });
      const convIds = convs.map((c: any) => c.id);
      if (convIds.length > 0) {
        await prisma.conversationMessage.deleteMany({ where: { conversationId: { in: convIds } } });
        await prisma.conversation.deleteMany({ where: { id: { in: convIds } } });
      }
      await prisma.projectMember.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
      console.log("    ✓ Cleaned up test records.");
    } catch (cleanErr) {
      console.warn("Cleanup warning:", cleanErr);
    }
    await app.close();
  }
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err);
  process.exit(1);
});
