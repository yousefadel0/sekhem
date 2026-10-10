import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EvidenceCollectorService } from "../src/agent-runtime/understanding/evidence-collector.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { AGENT_UNDERSTANDING_LIMITS } from "../src/agent-runtime/understanding/agent-understanding.types";
import { interpretContext } from "../src/agent-runtime/understanding/agent-planning.contract";

function understand(instruction: string, overrides: Partial<Parameters<AgentUnderstandingService["understand"]>[0]> = {}) {
  return new AgentUnderstandingService().understand({
    userId: "user-1",
    projectId: "project-1",
    conversationId: "conversation-1",
    agentRunId: "run-1",
    instruction,
    availableCapabilities: ["attachment_reader", "workspace_reader", "repo_snapshot_reader"],
    workspaceAvailable: true,
    ...overrides
  });
}

describe("Agent Understanding and Planning (5D-0)", () => {
  it("read-operation wrappers stay READ through report interpretation in Arabic and English", () => {
    for (const instruction of [
      "اختبار تشخيص واحد: اقرأ الملف package.json فقط، بمسار نسبي package.json من جذر مساحة العمل OMNIROUTE_TEST، عبر Runtime الحالي. قدم تقريرًا مختصرًا عن اسم المشروع وأوامر scripts مع مراجع من القراءة الفعلية. نفذ قراءة واحدة فقط؛ لا تضف اسم الفولدر إلى المسار، ولا تقرأ ملفًا آخر، ولا تعاود القراءة عند الفشل، ولا تعدل ملفات أو تشغل Terminal أو تغير أي صلاحيات. إذا فشل الطلب اذكر السبب وتوقف.",
      "Read package.json and report its name and scripts with source citations. Execute one reading only; do not modify files or run commands.",
      "نفّذ عملية قراءة README.md فقط؛ لا تعدّل أو تشغّل أوامر.",
      "Run a bounded inspection of README.md; do not edit or execute commands.",
      "Carry out a review of README.md; do not modify or execute anything."
    ]) {
      const context = understand(instruction);
      assert.equal(context.operationClass, "READ", instruction);
      assert.ok(!context.userIntent.includes("EXECUTE") && !context.userIntent.includes("MODIFY"), instruction);
      const base = interpretContext(context, new Map());
      assert.ok(!base.unknowns.some(gap => gap.id === "success-criteria"), instruction);
      assert.ok(!context.selectedCapabilities.includes("terminal.execute"));
    }
  });
  it("read wrappers retain separate positive writes, commands and planning intent", () => {
    for (const [instruction, operation] of [
      ["نفذ قراءة README.md. ثم شغل الأمر المصرح به.", "EXECUTE"],
      ["Execute one reading of README.md. Then run npm test.", "EXECUTE"],
      ["نفذ قراءة README.md. ثم عدل العنوان.", "WRITE"],
      ["Perform an inspection of README.md. Then modify its title.", "WRITE"]
    ]) {
      const context = understand(instruction);
      assert.equal(context.operationClass, operation, instruction);
      assert.ok(interpretContext(context, new Map()).unknowns.some(gap => gap.id === "success-criteria"));
    }
    assert.ok(understand("Read README.md then create an engineering plan.").userIntent.includes("PLAN"));
  });
  it("preserves coordinated read-only intent through understanding in both languages", () => {
    for (const instruction of [
      "اقرأ README.md ولا تعدّل أو تنفّذ أي شيء.",
      "حلّل src/App.tsx ولا تنفّذ أو تعدّل شيئًا.",
      "بص على src/App.tsx وحده وقلّي المسارات اللي Routes بيربطها بكل صفحة. قراءة وتحليل بس؛ ممنوع تعديل الملفات أو تشغيل أوامر.",
      "شوف في src/App.tsx المسارات، ولا تعدّل أو تنفّذ.",
      "Summarize src/App.tsx; do not modify or execute anything.",
      "Read README.md; do not modify or execute anything.",
      "Analyze src/App.tsx; do not execute or modify anything."
    ]) {
      const context = understand(instruction);
      assert.equal(context.operationClass, "READ", instruction);
      assert.ok(!context.userIntent.includes("MODIFY") && !context.userIntent.includes("EXECUTE"), instruction);
    }
  });
  it("retains separately positive changes after coordinated prohibitions", () => {
    for (const instruction of [
      "اقرأ README.md ولا تعدّل أو تنفّذ أي شيء. ثم عدّل العنوان",
      "Read README.md; do not modify or execute anything. Then modify the title."
    ]) {
      const context = understand(instruction);
      assert.ok(context.userIntent.includes("MODIFY"));
      assert.equal(context.operationClass, "WRITE");
      assert.ok(!context.selectedCapabilities.includes("terminal.execute"));
    }
  });
  it("excludes the bounded Arabic negated execution clause from source-only intent", () => {
    for (const instruction of [
      "لا تنفذ أي تعديل أو أمر",
      "اقرأ index.html. لا تنفذ أي تعديل أو أمر.",
      "Read and analyze index.html. راجعلي الـindex وقولي رأيك فيه. لا تنفذ أي تعديل أو أمر ولا تنشئ موافقة أو تصريح تنفيذ."
    ]) {
      const context = understand(instruction);
      assert.ok(!context.userIntent.includes("EXECUTE"));
      assert.equal(context.operationClass, "READ");
    }
  });

  it("preserves positive Arabic execution including a separate command after negation", () => {
    for (const instruction of [
      "نفذ الأمر",
      "نفذ أي تعديل أو أمر",
      "اقرأ index.html. لا تنفذ أي تعديل أو أمر. نفذ الأمر المصرح به."
    ]) {
      const context = understand(instruction);
      assert.ok(context.userIntent.includes("EXECUTE"));
      assert.equal(context.operationClass, "EXECUTE");
    }
  });

  it("keeps a simple conversational message lightweight", () => {
    const context = understand("Hi there", { projectId: undefined });
    assert.deepEqual(context.userIntent, ["CHAT"]);
    assert.equal(context.operationClass, "READ");
    assert.deepEqual(context.selectedCapabilities, []);
    assert.equal(context.plan.length, 1);
    assert.equal(context.verificationState.status, "NOT_REQUIRED");
  });

  it("selects attachment evidence for an explicitly attached explanation", () => {
    const context = understand("Explain this PDF", { attachmentIds: ["att-1"] });
    assert.ok(context.userIntent.includes("EXPLAIN"));
    assert.deepEqual(context.selectedCapabilities, ["attachment_reader"]);
    assert.equal(context.attachmentContext.required, true);
    assert.equal(context.workspaceContext.required, false);
  });

  it("selects the workspace reader for project analysis and authentication search", () => {
    const context = understand("Find where authentication is implemented in this project");
    assert.ok(context.userIntent.includes("SEARCH"));
    assert.deepEqual(context.selectedCapabilities, ["workspace_reader"]);
    assert.equal(context.workspaceContext.required, true);
  });

  it("represents an absent project or workspace as missing context instead of guessing", () => {
    const context = understand("Analyze this project and find the bug", { projectId: undefined, workspaceAvailable: false });
    assert.ok(context.missingContext.includes("PROJECT_OR_REPOSITORY"));
    assert.ok(context.missingContext.includes("WORKSPACE_SCOPE"));
    assert.equal(context.plan.at(-1)?.status, "BLOCKED");
  });

  it("detects a requested attachment that was not supplied", () => {
    const context = understand("Explain this PDF", { attachmentIds: [] });
    assert.ok(context.missingContext.includes("ATTACHMENT"));
    assert.equal(context.plan.at(-1)?.status, "BLOCKED");
  });

  it("recognizes modify and execute intent but never selects execution capability", () => {
    const modify = understand("Fix the authentication bug");
    const execute = understand("Run the tests");
    assert.equal(modify.operationClass, "WRITE");
    assert.equal(execute.operationClass, "EXECUTE");
    assert.ok(modify.selectedCapabilities.includes("workspace_reader"));
    assert.ok(!modify.selectedCapabilities.some((id) => id.includes("powershell") || id.includes("execute")));
    assert.ok(!execute.selectedCapabilities.some((id) => id.includes("powershell") || id.includes("execute")));
    assert.ok(modify.missingContext.includes("CAPABILITY_NOT_ENABLED"));
    assert.ok(execute.missingContext.includes("CAPABILITY_NOT_ENABLED"));
  });

  it("classifies inspect and repository review as read evidence capabilities", () => {
    const inspect = understand("Inspect this workspace");
    assert.ok(inspect.userIntent.includes("INSPECT"));
    assert.ok(inspect.selectedCapabilities.includes("workspace_reader"));
    const repo = understand("Review this repository");
    assert.ok(repo.repositoryContext.required);
    assert.ok(repo.selectedCapabilities.includes("repo_snapshot_reader"));
    assert.ok(repo.selectedCapabilities.includes("workspace_reader"));
  });

  it("classifies the decision-loop intents without enabling unsupported capabilities", () => {
    assert.ok(understand("Create an implementation plan").userIntent.includes("PLAN"));
    assert.ok(understand("Save this as an initiative").userIntent.includes("INITIATIVE"));
    assert.ok(understand("Perform a security review").userIntent.includes("SECURITY_REVIEW"));
    assert.ok(understand("حلل المشروع").userIntent.includes("UNDERSTAND"));
  });

  it("bounds plan steps and attachment references", () => {
    const attachmentIds = Array.from({ length: AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS + 4 }, (_, index) => `att-${index}`);
    const context = understand("Compare these files", { attachmentIds });
    assert.equal(context.attachmentContext.attachmentIds.length, AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS);
    assert.ok(context.plan.length <= AGENT_UNDERSTANDING_LIMITS.MAX_PLAN_STEPS);
  });

  it("collects provenance-labelled bounded evidence via the existing attachment reader", async () => {
    const calls: string[] = [];
    const collector = new EvidenceCollectorService({
      read: async ({ attachmentId }: { attachmentId: string }) => {
        calls.push(attachmentId);
        return {
          sourceType: "CONVERSATION_ATTACHMENT" as const,
          conversationId: "conversation-1",
          attachmentId,
          fileName: `${attachmentId}.txt`,
          mimeType: "text/plain",
          size: 10,
          status: "OK" as const,
          normalizedContent: { text: "grounded", extractorId: "text", detectedMime: "text/plain", truncated: false },
          warnings: [],
          provenance: { sourceType: "CONVERSATION_ATTACHMENT" as const, conversationId: "conversation-1", attachmentId }
        };
      }
    } as never);
    const evidence = await collector.collectAttachments({
      userId: "user-1",
      conversationId: "conversation-1",
      attachmentIds: ["att-1", "att-1", "att-2"]
    });
    assert.deepEqual(calls, ["att-1", "att-2"]);
    assert.equal(evidence[0].status, "COLLECTED");
    assert.equal(evidence[0].provenance, "CONVERSATION_ATTACHMENT:conversation-1:att-1");
    assert.equal(evidence[0].content?.text, "grounded");
  });

  it("represents unavailable attachments without fabricated evidence", async () => {
    const collector = new EvidenceCollectorService({ read: async () => { throw new Error("not found"); } } as never);
    const evidence = await collector.collectAttachments({ userId: "user-1", conversationId: "conversation-1", attachmentIds: ["missing"] });
    assert.equal(evidence[0].status, "UNAVAILABLE");
    assert.equal(evidence[0].content, undefined);
    assert.match(evidence[0].warnings[0], /could not be collected/);
  });

  it("uses existing bounded workspace evidence with preserved provenance", async () => {
    const collector = new EvidenceCollectorService({} as never, {
      collectEvidence: async () => ({
        context: {
          workspaceId: "workspace-1",
          source: "local",
          evidence: [{ relativePath: "src/auth.ts", fileType: "text/plain", extractorId: "text", text: "export const auth = true", truncated: false, warnings: [], sourceIdentity: "project-1:src/auth.ts" }]
        }
      })
    } as never);
    const evidence = await collector.collectWorkspace({ projectId: "project-1", userId: "user-1", userRole: "PM" }, ["src/auth.ts"]);
    assert.equal(evidence[0].sourceType, "workspace");
    assert.equal(evidence[0].provenance, "project-1:src/auth.ts");
    assert.match(evidence[0].content?.text ?? "", /auth/);
  });
});
