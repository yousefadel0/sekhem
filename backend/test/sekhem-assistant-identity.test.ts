import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEKHEM_ASSISTANT_SYSTEM_PROMPT } from "../src/ai-gateway/sekhem-assistant-identity";
import { SEKHEM_ASSISTANT_ANSWER_SYSTEM_PROMPT } from "../src/ai-gateway/assistant-answer.contract";

describe("SEKHEM assistant identity instruction", () => {
  it("stays within the AI Gateway system prompt bound and names SEKHEM as the public identity", () => {
    assert.ok(SEKHEM_ASSISTANT_SYSTEM_PROMPT.length > 0);
    assert.ok(SEKHEM_ASSISTANT_SYSTEM_PROMPT.length <= 8_000);
    assert.match(SEKHEM_ASSISTANT_SYSTEM_PROMPT, /You are SEKHEM/);
    assert.match(SEKHEM_ASSISTANT_SYSTEM_PROMPT, /اسمك ايه؟/);
    assert.match(SEKHEM_ASSISTANT_SYSTEM_PROMPT, /who are you/i);
    assert.match(SEKHEM_ASSISTANT_SYSTEM_PROMPT, /Do not volunteer your name, model, or provider on normal technical questions/);
    assert.match(SEKHEM_ASSISTANT_SYSTEM_PROMPT, /internal technical model is GLM-5.2-Abliterated/);
    assert.doesNotMatch(SEKHEM_ASSISTANT_SYSTEM_PROMPT, /Return one JSON object only with one string field named answer/);
    assert.match(SEKHEM_ASSISTANT_ANSWER_SYSTEM_PROMPT, /Return one JSON object only with one string field named answer/);
  });
});
