import { BadGatewayException } from "@nestjs/common";

export type LlmJsonFailureCode =
  | "LLM_JSON_NO_OBJECT"
  | "LLM_JSON_MALFORMED"
  | "LLM_JSON_TRUNCATED"
  | "LLM_JSON_SCHEMA_INVALID";

export class LlmJsonCompatibilityError extends BadGatewayException {
  constructor(readonly code: LlmJsonFailureCode) {
    super("Provider returned incompatible structured output");
  }
}

const MAX_EXPLANATORY_TEXT = 512;

export function parseLlmJsonObject(content: string): Record<string, unknown> {
  const normalized = content.replace(/^\uFEFF/, "").trim();
  if (!normalized) throw new LlmJsonCompatibilityError("LLM_JSON_NO_OBJECT");

  const strict = strictObject(normalized);
  if (strict.ok) return strict.value;

  if (normalized.startsWith("```")) {
    const fenced = /^```json\s*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(normalized);
    if (!fenced) {
      throw new LlmJsonCompatibilityError(normalized.includes("```", 3) ? "LLM_JSON_MALFORMED" : "LLM_JSON_TRUNCATED");
    }
    return parseSingleCandidate(fenced[1]!.trim());
  }

  const spans: Array<{ start: number; end: number }> = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let strayClosingBrace = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;
    if (start < 0) {
      if (character === "{") {
        start = index;
        depth = 1;
      } else if (character === "}") {
        strayClosingBrace = true;
      }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        spans.push({ start, end: index + 1 });
        start = -1;
      }
    }
  }

  if (start >= 0 || quoted || escaped) throw new LlmJsonCompatibilityError("LLM_JSON_TRUNCATED");
  if (spans.length === 0) {
    throw new LlmJsonCompatibilityError(strayClosingBrace ? "LLM_JSON_MALFORMED" : "LLM_JSON_NO_OBJECT");
  }
  if (spans.length !== 1 || strayClosingBrace) throw new LlmJsonCompatibilityError("LLM_JSON_MALFORMED");

  const span = spans[0]!;
  const surroundingLength = normalized.slice(0, span.start).trim().length + normalized.slice(span.end).trim().length;
  if (surroundingLength > MAX_EXPLANATORY_TEXT) throw new LlmJsonCompatibilityError("LLM_JSON_MALFORMED");
  return parseSingleCandidate(normalized.slice(span.start, span.end));
}

function parseSingleCandidate(candidate: string): Record<string, unknown> {
  const parsed = strictObject(candidate);
  if (parsed.ok) return parsed.value;
  const balance = objectBalance(candidate);
  throw new LlmJsonCompatibilityError(balance === "incomplete" ? "LLM_JSON_TRUNCATED" : balance === "absent" ? "LLM_JSON_NO_OBJECT" : "LLM_JSON_MALFORMED");
}

function strictObject(value: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? { ok: true, value: parsed as Record<string, unknown> }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

function objectBalance(value: string): "complete" | "incomplete" | "absent" {
  let depth = 0;
  let seen = false;
  let quoted = false;
  let escaped = false;
  for (const character of value) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") { depth += 1; seen = true; }
    else if (character === "}") depth -= 1;
  }
  if (!seen) return "absent";
  return depth > 0 || quoted || escaped ? "incomplete" : "complete";
}
