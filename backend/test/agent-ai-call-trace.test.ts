import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { persistableAiCallTrace } from "../src/agent-runtime/skills/skill.interface";
import { MemoGeneratorSkill } from "../src/agent-runtime/skills/built-in-skills";

describe("Agent AI call traceability", () => {
  it("persists only whitelist metadata and never credentials", () => {
    const persisted = persistableAiCallTrace({
      kind: "REAL_PROVIDER_CALL",
      providerId: "provider-teletech",
      modelId: "GLM-5.2-Abliterated",
      correlationId: "ai-assistant-1",
      providerCallExecuted: true,
      apiKey: "sk-live",
      encryptedApiKey: "enc",
      authorization: "Bearer x",
      prompt: "secret prompt"
    } as never);

    assert.deepEqual(persisted, {
      kind: "REAL_PROVIDER_CALL",
      providerId: "provider-teletech",
      modelId: "GLM-5.2-Abliterated",
      correlationId: "ai-assistant-1",
      providerCallExecuted: true
    });
    assert.equal(Object.keys(persisted).sort().join(","), "correlationId,kind,modelId,providerCallExecuted,providerId");
  });

  it("never sets providerCallExecuted true unless the real provider call succeeded", () => {
    const persisted = persistableAiCallTrace({
      kind: "PROVIDER_CALL_FAILED",
      providerId: "provider-teletech",
      modelId: "GLM-5.2-Abliterated",
      correlationId: "ai-assistant-2",
      providerCallExecuted: true
    });

    assert.equal(persisted.kind, "PROVIDER_CALL_FAILED");
    assert.equal(persisted.providerCallExecuted, false);
    assert.equal(persisted.providerId, "provider-teletech");
    assert.equal(persisted.modelId, "GLM-5.2-Abliterated");
  });

  const skillContext = {
    agentRunId: "run_1",
    projectId: "project-1",
    userId: "user-1",
    userRole: "PM" as const,
    stepIndex: 0,
    instruction: "ss",
    context: { topic: "ss" }
  };

  it("REAL_PROVIDER succeeds with the real answer and providerCallExecuted=true", async () => {
    const skill = new MemoGeneratorSkill({
      askAssistant: async () => ({
        status: "REAL_PROVIDER",
        answer: "Human review remains required before any action.",
        correlationId: "ai-assistant-live",
        providerId: "provider-teletech",
        modelId: "GLM-5.2-Abliterated",
        providerCallExecuted: true,
        httpClassification: "SUCCESS"
      })
    } as never);

    const result = await skill.execute(skillContext);

    assert.equal(result.success, true);
    assert.deepEqual(result.output, { memoContent: "Human review remains required before any action." });
    assert.match(result.summary ?? "", /^Generated technical memo for:/);
    assert.equal(result.aiCall?.kind, "REAL_PROVIDER_CALL");
    assert.equal(result.aiCall?.providerId, "provider-teletech");
    assert.equal(result.aiCall?.modelId, "GLM-5.2-Abliterated");
    assert.equal(result.aiCall?.correlationId, "ai-assistant-live");
    assert.equal(result.aiCall?.providerCallExecuted, true);
    assert.equal(result.artifacts?.[0]?.content, "Human review remains required before any action.");
  });

  it("PROVIDER_UNAVAILABLE fails with a failure-oriented summary, not a success summary", async () => {
    const skill = new MemoGeneratorSkill({
      askAssistant: async () => ({
        status: "PROVIDER_UNAVAILABLE",
        answer: null,
        correlationId: "ai-assistant-fail",
        providerId: "provider-teletech",
        modelId: "GLM-5.2-Abliterated",
        providerCallExecuted: true,
        httpClassification: "PROVIDER_ERROR"
      })
    } as never);

    const result = await skill.execute(skillContext);

    assert.equal(result.success, false);
    assert.equal(result.output, null);
    assert.equal(result.artifacts, undefined);
    assert.equal(result.summary, "Memo generation failed: PROVIDER_UNAVAILABLE (PROVIDER_ERROR)");
    assert.equal(result.summary?.includes("Generated technical memo for:"), false);
    assert.equal(result.aiCall?.kind, "PROVIDER_CALL_FAILED");
    assert.equal(result.aiCall?.providerCallExecuted, false);
    assert.equal(result.aiCall?.providerId, "provider-teletech");
    assert.equal(result.aiCall?.modelId, "GLM-5.2-Abliterated");
    assert.equal(result.aiCall?.correlationId, "ai-assistant-fail");
  });

  it("POLICY_BLOCKED keeps the existing policy summary", async () => {
    const skill = new MemoGeneratorSkill({
      askAssistant: async () => ({
        status: "POLICY_BLOCKED",
        answer: null,
        correlationId: "ai-assistant-policy",
        providerId: null,
        modelId: null,
        providerCallExecuted: false
      })
    } as never);

    const result = await skill.execute(skillContext);

    assert.equal(result.success, false);
    assert.equal(result.output, null);
    assert.equal(result.summary, "Memo generation blocked by policy");
    assert.equal(result.artifacts, undefined);
    assert.equal(result.aiCall?.providerCallExecuted, false);
  });
});
