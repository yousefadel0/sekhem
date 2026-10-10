import { SEKHEM_ASSISTANT_SYSTEM_PROMPT } from "./sekhem-assistant-identity";
import { parseLlmJsonObject } from "./llm-json.parser";

/** Match the existing provider response ceiling; reject rather than silently truncate. */
export const ASSISTANT_RESPONSE_MAX_CHARS = 128_000;

export function assistantAnswer(content: unknown): string {
  if (typeof content !== "string" || content.length > ASSISTANT_RESPONSE_MAX_CHARS) return "";
  try {
    const parsed = parseLlmJsonObject(content);
    return typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  } catch {
    // Retain the existing plain-text compatibility path.
    return content.trim();
  }
}

/** Chat's existing answer contract; structured reasoning supplies its own schema. */
export const ASSISTANT_ANSWER_OUTPUT_INSTRUCTION =
  "Return one JSON object only with one string field named answer.";

export const ASSISTANT_ANSWER_OUTPUT_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false
};

export const SEKHEM_ASSISTANT_ANSWER_SYSTEM_PROMPT =
  `${SEKHEM_ASSISTANT_SYSTEM_PROMPT} ${ASSISTANT_ANSWER_OUTPUT_INSTRUCTION}`;
