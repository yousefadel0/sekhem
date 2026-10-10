import "reflect-metadata";
import { readFileSync } from "fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/data-access/prisma.service";
import { AgentRuntimeService } from "../src/agent-runtime/agent-runtime.service";
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

async function main() {
  console.log("══════════════════════════════════════════════════════");
  console.log("SEKHEM REAL GLM END-TO-END FLOW VERIFICATION");
  console.log("══════════════════════════════════════════════════════\n");

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const agentRuntime = app.get(AgentRuntimeService);
  const conversationService = app.get(ConversationService);

  try {
    // 1. Verify real provider and model configuration in DB
    console.log("[1] Checking Provider and Model configuration...");
    const providers = await prisma.aiProviderConfiguration.findMany();
    console.log("    Found providers:", JSON.stringify(providers.map((p: any) => ({ id: p.id, displayName: p.displayName, providerType: p.providerType }))));
    const teletech = providers.find((p: any) => p.displayName?.includes("Teletech") || p.id.includes("teletech"));
    if (!teletech) {
      throw new Error("Teletech AI provider not found in database");
    }
    console.log(`    ✓ Provider found: ${teletech.displayName} (id: ${teletech.id})`);
    console.log(`    ✓ Provider type: ${teletech.providerType}`);
    console.log(`    ✓ BaseUrl: ${teletech.baseUrl}`);
    console.log(`    ✓ DefaultTimeoutMs: ${teletech.defaultTimeoutMs}`);
    console.log(`    ✓ Enabled: ${teletech.enabled}`);
    console.log(`    ✓ Health state: ${teletech.healthState}`);

    const models = await prisma.aiModelConfiguration.findMany({ where: { providerId: teletech.id } });
    const glmModel = models.find((m: any) => m.modelId === "GLM-5.2-Abliterated");
    if (!glmModel) {
      throw new Error("GLM-5.2-Abliterated model not found for provider");
    }
    console.log(`    ✓ Model found: ${glmModel.displayName} (modelId: ${glmModel.modelId})`);
    console.log(`    ✓ Model enabled: ${glmModel.enabled}`);
    console.log(`    ✓ Default for provider: ${glmModel.defaultForProvider}`);

    // 2. Resolve admin user and canonical project
    console.log("\n[2] Resolving operator credentials and project...");
    const adminUser = await prisma.user.findFirst({
      where: { email: "admin@sekhem.local" }
    });
    if (!adminUser) throw new Error("Admin user admin@sekhem.local not found in DB");

    const project = await prisma.project.findUnique({
      where: { id: "project-community-sonic-sovereign" }
    });
    if (!project) throw new Error("Canonical project project-community-sonic-sovereign not found");

    const adminClaims: SessionClaims = {
      sub: adminUser.id,
      sessionId: `sess-${Date.now()}`,
      email: adminUser.email,
      displayName: adminUser.displayName || "Admin User",
      role: "Admin",
      organizationId: project.organizationId,
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    console.log(`    ✓ Operator: ${adminClaims.displayName} (${adminClaims.sub})`);
    console.log(`    ✓ Project: ${project.name} (${project.id})`);

    // 3. Create conversation and post message with triggerAgent: true
    console.log("\n[3] Creating conversation and posting message...");
    const conv = await conversationService.createConversation(adminClaims.sub, {
      projectId: project.id,
      title: "Real GLM SONiC Verification"
    });
    console.log(`    ✓ Conversation created: ${conv.id}`);

    const promptText = "Explain what SONiC is in two short paragraphs.";
    console.log(`    Prompt: "${promptText}"`);

    const triggerRes = await conversationService.postMessage(conv.id, adminClaims, {
      content: promptText,
      triggerAgent: true
    });

    if (!("agentRunId" in triggerRes)) {
      throw new Error("postMessage did not return trigger agent response");
    }
    const runId = triggerRes.agentRunId;
    console.log(`    ✓ AgentRun created: ${runId} (status: ${triggerRes.status})`);

    // 4. Execute the AgentRun against the real provider
    console.log("\n[4] Executing AgentRun against real provider (GLM-5.2-Abliterated)...");
    const startTime = Date.now();
    await agentRuntime.executeRun(runId, adminClaims, promptText);
    const duration = Date.now() - startTime;
    console.log(`    ✓ Execution finished in ${duration}ms`);

    // 5. Verify AgentRun state
    console.log("\n[5] Verifying AgentRun state in database...");
    const runRecord = await prisma.agentRun.findUnique({
      where: { id: runId },
      include: { events: true }
    });
    if (!runRecord) throw new Error("AgentRun not found");
    console.log(`    ✓ Run status: ${runRecord.status}`);
    console.log(`    ✓ Progress: ${runRecord.progressPercent}%`);
    if (runRecord.status !== "COMPLETED") {
      throw new Error(`AgentRun did not complete! Status: ${runRecord.status}, Reason: ${runRecord.failureReason}`);
    }

    // 6. Verify TOOL_RESULT event
    console.log("\n[6] Verifying TOOL_RESULT event and AI Gateway trace...");
    const toolResultEvent = runRecord.events.find((e: any) => e.eventType === "TOOL_RESULT");
    if (!toolResultEvent) throw new Error("TOOL_RESULT event not found in run events");
    const toolPayload = toolResultEvent.payload as any;
    console.log(`    ✓ Tool skillId: ${toolPayload?.skillId}`);
    console.log(`    ✓ Tool summary: ${toolPayload?.summary}`);
    console.log(`    ✓ AI Call model: ${toolPayload?.aiCall?.modelId}`);
    console.log(`    ✓ AI Call providerCallExecuted: ${toolPayload?.aiCall?.providerCallExecuted}`);
    const realMemoContent = toolPayload?.output?.memoContent;
    if (typeof realMemoContent !== "string" || realMemoContent.trim().length === 0) {
      throw new Error("output.memoContent is missing or empty!");
    }
    console.log(`    ✓ Real memoContent length: ${realMemoContent.length} characters`);
    console.log(`    ✓ First 150 chars: "${realMemoContent.slice(0, 150).replace(/\n/g, " ")}..."`);

    // 7. Verify ConversationMessage persistence
    console.log("\n[7] Verifying ConversationMessage persistence in database...");
    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: "asc" }
    });
    console.log(`    Total messages in conversation: ${messages.length}`);
    for (let idx = 0; idx < messages.length; idx++) {
      const m: any = messages[idx];
      console.log(`    [${idx}] id: ${m.id} | senderType: ${m.senderType} | senderId: ${m.senderId} | content: "${m.content.slice(0, 80).replace(/\n/g, " ")}..."`);
    }

    const assistantMessages = messages.filter((m: any) => m.senderType === "assistant");
    if (assistantMessages.length !== 1) {
      throw new Error(`Expected exactly 1 assistant message, found ${assistantMessages.length}`);
    }
    const assistantMsg = assistantMessages[0];

    // Check deterministic ID
    const expectedId = `msg_agent_${runId}`;
    if (assistantMsg.id !== expectedId) {
      throw new Error(`Expected assistant message id to be '${expectedId}', got '${assistantMsg.id}'`);
    }
    console.log(`    ✓ Assistant message ID is deterministic: ${assistantMsg.id}`);

    // Check content equals real model answer
    if (assistantMsg.content !== realMemoContent) {
      throw new Error("Assistant message content does NOT match real output.memoContent!");
    }
    console.log("    ✓ Assistant message content EXACTLY matches real GLM output.memoContent");

    // Check that summary was NOT used
    if (assistantMsg.content === toolPayload?.summary || assistantMsg.content.startsWith("Generated technical memo for:")) {
      throw new Error("Assistant message used summary instead of actual GLM answer!");
    }
    console.log("    ✓ Assistant message does NOT use summary or generic memo prefix");

    // 8. Verify GET /api/conversations/:id returns the assistant message
    console.log("\n[8] Verifying getConversation contract returns the assistant message...");
    const convDetail = await conversationService.getConversation(conv.id, adminClaims.sub);
    const detailAssistant = convDetail.messages.find((m: any) => m.senderType === "assistant");
    if (!detailAssistant) {
      throw new Error("getConversation did not return assistant message!");
    }
    console.log(`    ✓ getConversation returned ${convDetail.messages.length} messages`);
    console.log(`    ✓ Assistant message in detail: id=${detailAssistant.id}, content length=${detailAssistant.content.length}`);

    // 9. Verify duplicate safety / idempotency
    console.log("\n[9] Verifying duplicate safety / idempotency...");
    const dupRes = await conversationService.createAssistantMessage(conv.id, runId, realMemoContent, runRecord.agentName);
    console.log(`    ✓ Re-call createAssistantMessage returned message id: ${dupRes.id}`);
    const messagesAfterDup = await prisma.conversationMessage.findMany({
      where: { conversationId: conv.id }
    });
    const assistantCountAfterDup = messagesAfterDup.filter((m: any) => m.senderType === "assistant").length;
    if (assistantCountAfterDup !== 1) {
      throw new Error(`Duplicate safety failed! Assistant message count is now ${assistantCountAfterDup}`);
    }
    console.log(`    ✓ Exactly 1 assistant message remains in DB (no duplicates created)`);

    console.log("\n══════════════════════════════════════════════════════");
    console.log("✅ ALL 11 VERIFICATION CRITERIA PASSED SUCCESSFULLY!");
    console.log("══════════════════════════════════════════════════════\n");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("❌ VERIFICATION FAILED:", err);
  process.exit(1);
});
