import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";

const service = new AgentUnderstandingService();
function context(instruction: string) {
  return service.understand({ userId: "test-user", instruction, workspaceAvailable: true,
    availableCapabilities: ["workspace_reader"] });
}

test("read targets containing operation words do not add operational intent", () => {
  for (const path of ["sekhem-e2e-test.txt", "deploy.sh", "fix.ts", "verify.test.ts", "src/run-test.ts", "C:\\project\\deploy.ps1"]) {
    const result = context(`Read ${path} and summarize its content. Read only.`);
    assert.equal(result.operationClass, "READ", path);
    for (const intent of ["VERIFY", "TEST", "EXECUTE", "MODIFY", "PLAN"]) {
      assert.ok(!result.userIntent.includes(intent as never), `${path}: ${intent}`);
    }
  }
  const arabic = context("اقرأ sekhem-e2e-test.txt ولخص النص بمصدره. قراءة فقط دون تعديل الملفات أو تشغيل الأوامر.");
  assert.equal(arabic.operationClass, "READ");
  assert.ok(!arabic.userIntent.includes("VERIFY"));
});

test("explicit operations surrounding a file target retain their intent", () => {
  assert.ok(context("Run deploy.sh").userIntent.includes("EXECUTE"));
  assert.ok(context("Read test.ts then run the tests").userIntent.includes("VERIFY"));
  assert.ok(context("Modify fix.ts").userIntent.includes("MODIFY"));
  assert.ok(context("Plan changes to roadmap.md").userIntent.includes("PLAN"));
  assert.ok(context("Change the package.json version to 2.0.0").userIntent.includes("MODIFY"));
});
