import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LlmJsonCompatibilityError, parseLlmJsonObject } from "../src/ai-gateway/llm-json.parser";

function code(error: unknown): string | undefined {
  return error instanceof LlmJsonCompatibilityError ? error.code : undefined;
}

describe("bounded LLM JSON compatibility parser", () => {
  it("accepts strict JSON and surrounding whitespace or BOM", () => {
    assert.deepEqual(parseLlmJsonObject('{"ok":true}'), { ok: true });
    assert.deepEqual(parseLlmJsonObject('\uFEFF  {"ok":true}\r\n'), { ok: true });
  });

  it("accepts exactly one JSON fence", () => {
    assert.deepEqual(parseLlmJsonObject('```json\n{"ok":true}\n```'), { ok: true });
  });

  it("accepts one balanced object with a short explanatory prefix and suffix", () => {
    assert.deepEqual(parseLlmJsonObject('Result follows: {"ok":true} End.'), { ok: true });
  });

  it("balances braces inside quoted strings and escaped characters", () => {
    assert.deepEqual(parseLlmJsonObject('Result: {"text":"a } brace and \\"quote\\"","nested":{"ok":true}} done'), {
      text: 'a } brace and "quote"', nested: { ok: true }
    });
  });

  it("rejects truncated JSON without exposing its content", () => {
    const marker = "raw-private-model-text";
    assert.throws(
      () => parseLlmJsonObject(`{"value":"${marker}"`),
      (error) => code(error) === "LLM_JSON_TRUNCATED" && !String(error).includes(marker)
    );
  });

  it("rejects ambiguous multiple objects", () => {
    assert.throws(() => parseLlmJsonObject('{"one":1} and {"two":2}'), (error) => code(error) === "LLM_JSON_MALFORMED");
  });
});
