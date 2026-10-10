import "reflect-metadata";
import { readFileSync } from "fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/data-access/prisma.service";
import { ConversationService } from "../src/conversation/conversation.service";
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
  } catch { }
}

loadEnv("backend/.env");

async function runTest() {
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("LIVE REAL GLM-5.2 CHAT LOOP VERIFICATION");
  console.log("══════════════════════════════════════════════════════════════════\n");

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const conversationService = app.get(ConversationService);

  try {
    // 1. Resolve user and project
    const adminUser = await prisma.user.findFirst({ where: { email: "admin@sekhem.local" } });
    if (!adminUser) throw new Error("admin@sekhem.local not found");
    const project = await prisma.project.findUnique({ where: { id: "project-community-sonic-sovereign" } });
    if (!project) throw new Error("Canonical project not found");

    const claims: SessionClaims = {
      sub: adminUser.id,
      sessionId: `sess-${Date.now()}`,
      email: adminUser.email,
      displayName: adminUser.displayName || "Admin User",
      role: "Admin",
      organizationId: project.organizationId,
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    // 2. Create a conversation
    const conv = await conversationService.createConversation(claims.sub, {
      projectId: project.id,
      title: "Real Chat Loop Verification"
    });
    console.log(`[Setup] Conversation created: ${conv.id}\n`);

    // TEST 1: "Hi"
    console.log("──────────────────────────────────────────────────────────────────");
    console.log("TEST 1: User says 'Hi'");
    console.log("──────────────────────────────────────────────────────────────────");
    const t1Start = Date.now();
    const res1 = await conversationService.postMessage(conv.id, claims, {
      content: "Hi",
      senderType: "user",
      chat: true
    });
    const t1Duration = Date.now() - t1Start;

    console.log(`✓ Response received in ${t1Duration}ms`);
    console.log(`✓ Response id: ${res1.id}`);
    console.log(`✓ Response senderType: ${res1.senderType}`);
    console.log(`✓ Response senderId: ${res1.senderId}`);
    console.log(`✓ Assistant Response Content:\n"${res1.content}"\n`);

    if (res1.senderType !== "assistant") {
      throw new Error(`Expected senderType 'assistant', got '${res1.senderType}'`);
    }
    if (!res1.content || res1.content.trim().length === 0) {
      throw new Error("Assistant response content is empty!");
    }
    if (res1.content.includes("Technical Memo") || res1.content.includes("Summary:")) {
      throw new Error("Response was formatted as a Technical Memo!");
    }

    // TEST 2: "What is SONiC?"
    console.log("──────────────────────────────────────────────────────────────────");
    console.log("TEST 2: User says 'What is SONiC?'");
    console.log("──────────────────────────────────────────────────────────────────");
    const t2Start = Date.now();
    const res2 = await conversationService.postMessage(conv.id, claims, {
      content: "What is SONiC?",
      senderType: "user",
      chat: true
    });
    const t2Duration = Date.now() - t2Start;

    console.log(`✓ Response received in ${t2Duration}ms`);
    console.log(`✓ Response id: ${res2.id}`);
    console.log(`✓ Response senderType: ${res2.senderType}`);
    console.log(`✓ Response senderId: ${res2.senderId}`);
    console.log(`✓ Assistant Response Content:\n"${res2.content}"\n`);

    if (res2.senderType !== "assistant") {
      throw new Error(`Expected senderType 'assistant', got '${res2.senderType}'`);
    }
    if (!res2.content.toLowerCase().includes("sonic") && !res2.content.toLowerCase().includes("network")) {
      throw new Error("Response does not address SONiC!");
    }
    if (res2.content.includes("Technical Memo")) {
      throw new Error("Response was formatted as a Technical Memo!");
    }

    // TEST 3: "Explain BGP in simple terms"
    console.log("──────────────────────────────────────────────────────────────────");
    console.log("TEST 3: User says 'Explain BGP in simple terms'");
    console.log("──────────────────────────────────────────────────────────────────");
    const t3Start = Date.now();
    const res3 = await conversationService.postMessage(conv.id, claims, {
      content: "Explain BGP in simple terms",
      senderType: "user",
      chat: true
    });
    const t3Duration = Date.now() - t3Start;

    console.log(`✓ Response received in ${t3Duration}ms`);
    console.log(`✓ Response id: ${res3.id}`);
    console.log(`✓ Response senderType: ${res3.senderType}`);
    console.log(`✓ Response senderId: ${res3.senderId}`);
    console.log(`✓ Assistant Response Content:\n"${res3.content}"\n`);

    if (res3.senderType !== "assistant") {
      throw new Error(`Expected senderType 'assistant', got '${res3.senderType}'`);
    }
    if (!res3.content.toLowerCase().includes("bgp") && !res3.content.toLowerCase().includes("routing") && !res3.content.toLowerCase().includes("protocol") && !res3.content.toLowerCase().includes("internet")) {
      throw new Error("Response does not address BGP!");
    }

    // 3. Verify Database Persistence of all messages
    console.log("──────────────────────────────────────────────────────────────────");
    console.log("VERIFYING DATABASE PERSISTENCE");
    console.log("──────────────────────────────────────────────────────────────────");
    const detail = await conversationService.getConversation(conv.id, claims.sub);
    console.log(`✓ Total persisted messages in conversation: ${detail.messages.length}`);
    for (let idx = 0; idx < detail.messages.length; idx++) {
      const m = detail.messages[idx];
      console.log(`  [${idx}] [${m.senderType.toUpperCase()}] (${m.id}): "${m.content.slice(0, 80).replace(/\n/g, " ")}..."`);
    }

    if (detail.messages.length !== 6) {
      throw new Error(`Expected exactly 6 persisted messages (3 user + 3 assistant), got ${detail.messages.length}`);
    }

    // Check no AgentRun was created for normal chat
    const agentRuns = await prisma.agentRun.findMany({ where: { conversationId: conv.id } });
    console.log(`✓ AgentRuns linked to conversation: ${agentRuns.length}`);
    if (agentRuns.length !== 0) {
      throw new Error(`Expected 0 AgentRuns for normal chat, found ${agentRuns.length}`);
    }

    console.log("\n══════════════════════════════════════════════════════════════════");
    console.log("✅ ALL 3 LIVE REAL GLM CHAT TESTS PASSED SUCCESSFULLY!");
    console.log("══════════════════════════════════════════════════════════════════\n");
  } finally {
    await app.close();
  }
}

runTest().catch((err) => {
  console.error("❌ LIVE TEST FAILED:", err);
  process.exit(1);
});
