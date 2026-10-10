/**
 * MemoryExtractor
 *
 * Deterministic, conservative memory-intent parser for the SEKHEM platform.
 * Recognises only explicit, high-confidence user-fact statements.
 *
 * MVP scope: preferred_name only.
 *
 * Rules:
 *  - Never call an LLM. Zero network I/O.
 *  - Return an empty array when the message does not clearly contain
 *    a supported memory statement. Do not guess.
 *  - Name capture is conservative: 1–40 Arabic/Latin characters.
 *  - Trailing clauses such as "افتكر اسمي", punctuation, or polite closings
 *    are stripped before capture.
 *  - Explicitly rejects question intents (e.g. "اسمي إيه؟", "what is my name?").
 */

export interface MemoryCandidate {
  /** Canonical storage key, e.g. "preferred_name" */
  key: string;
  /** Extracted value, trimmed */
  value: string;
  /** Confidence in [0,1]. 1.0 for explicit pattern matches */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Disallowed tokens: question words, pronouns, particles, verbs, system words
// ---------------------------------------------------------------------------

const DISALLOWED_NAME_TOKENS = new Set([
  // Arabic question words & pronouns
  "ايه", "إيه", "مين", "ايش", "شو", "شنو", "شنهو", "ماذا", "ما", "ازاي", "ازي", "كيف", "فين", "وين", "ليه", "ليش", "متى", "هل",
  // Arabic particles, pronouns & common verbs
  "هو", "هي", "انا", "أنا", "انت", "أنت", "انتي", "أنتي", "ان", "إن", "مش", "لا", "نعم", "ايوه", "أيوه", "اه",
  "افتكر", "احفظ", "تفتكر", "فاكر", "متنساش", "سخم", "سِخِم", "sekhem", "مساعد", "بوت", "اسمك", "اسمي",
  // English question words & auxiliary verbs
  "what", "who", "which", "how", "where", "when", "why", "is", "are", "am", "it", "not", "no", "yes",
  // English system words & verbs
  "remember", "forget", "sekhem", "assistant", "bot", "name", "call", "please"
]);

// ---------------------------------------------------------------------------
// Name extraction patterns
// ---------------------------------------------------------------------------

const ARABIC_PATTERNS: RegExp[] = [
  // "افتكر إن اسمي [name]" / "افتكر ان اسمي [name]"
  /^(?:.*?\b)?افتكر\s+(?:إن|ان)\s+اسمي\s+([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)/u,
  // "افتكر اسمي [name]" (without إن)
  /^(?:.*?\b)?افتكر\s+اسمي\s+([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)/u,
  // "خلي بالك إن اسمي [name]" / "خلي بالك ان اسمي [name]"
  /^(?:.*?\b)?خلي\s+بالك\s+(?:إن|ان)\s+اسمي\s+([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)/u,
  // "ناديني [name]"
  /^(?:.*?\b)?ناديني\s+([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)/u,
  // "أنا اسمي [name]" / "انا اسمي [name]"
  /^(?:.*?\b)?(?:أنا|انا)\s+اسمي\s+([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)/u,
  // "اسمي هو [name]"
  /^(?:.*?\b)?اسمي\s+هو\s+([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)/u,
  // "اسمي [name]"
  /^(?:.*?\b)?اسمي\s+([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)/u,
];

const ENGLISH_PATTERNS: RegExp[] = [
  // "please remember (that) my name is [name]"
  /^(?:.*?\b)?please\s+remember\s+(?:that\s+)?my\s+name\s+is\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/iu,
  // "remember (that) my name is [name]"
  /^(?:.*?\b)?remember\s+(?:that\s+)?my\s+name\s+is\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/iu,
  // "my name is [name]"
  /^(?:.*?\b)?my\s+name\s+is\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/iu,
  // "call me [name]"
  /^(?:.*?\b)?call\s+me\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/iu,
];

const MAX_NAME_LENGTH = 40;

function cleanTrailingClauses(text: string): string {
  return text
    // Strip trailing clauses like "افتكر اسمي", "احفظ اسمي", "متنساش", "please remember", etc.
    .replace(/(?:[،,.\s]+(?:افتكر\s+اسمي|احفظ\s+اسمي|متنساش|يا\s+سخم|يا\s+سِخِم|please\s+remember|remember\s+my\s+name|remember\s+it|remember\s+me|please|thanks).*)$/iu, "")
    // Strip remaining trailing punctuation
    .replace(/[،,.:;!؟?]+$/, "")
    .trim();
}

function isQuestionIntent(message: string): boolean {
  // Check for question marks
  if (/[?؟]/.test(message)) {
    return true;
  }
  // Check for question starters or question words
  const lower = message.trim().toLowerCase();
  const questionWords = [
    "اسمي إيه", "اسمي ايه", "اسمي مين", "ما اسمي", "ما هو اسمي", "هل تعرف اسمي", "تعرف اسمي",
    "what is my name", "what's my name", "who am i", "do you know my name", "do you remember my name"
  ];
  for (const qw of questionWords) {
    if (lower.includes(qw)) {
      return true;
    }
  }
  return false;
}

function isValidNameToken(token: string): boolean {
  if (!token || token.length < 1 || token.length > MAX_NAME_LENGTH) {
    return false;
  }
  const parts = token.trim().split(/\s+/);
  for (const part of parts) {
    const clean = part.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    if (!clean || DISALLOWED_NAME_TOKENS.has(clean)) {
      return false;
    }
  }
  return true;
}

function extractName(message: string): string | null {
  if (isQuestionIntent(message)) {
    return null;
  }

  // Pre-process: strip trailing clauses and punctuation
  const cleaned = cleanTrailingClauses(message.trim());
  if (!cleaned) return null;

  const allPatterns = [...ARABIC_PATTERNS, ...ENGLISH_PATTERNS];
  for (const pattern of allPatterns) {
    const match = pattern.exec(cleaned);
    if (match && match[1]) {
      // Also clean any trailing punctuation or clause from the captured group
      let name = match[1].replace(/[،,.:;!؟?]+$/, "").trim();
      
      // If two words were captured, verify the second word isn't a disallowed word or trailing particle
      const words = name.split(/\s+/);
      if (words.length > 1 && !isValidNameToken(words[1])) {
        name = words[0];
      }

      if (isValidNameToken(name)) {
        return name;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class MemoryExtractor {
  /**
   * Extract zero or more MemoryCandidate objects from a user message.
   * Returns an empty array when no supported explicit memory statement is found.
   * Never guesses. Never infers from non-explicit content.
   */
  extract(message: string): MemoryCandidate[] {
    if (!message || typeof message !== "string") return [];

    const candidates: MemoryCandidate[] = [];

    const name = extractName(message);
    if (name !== null) {
      candidates.push({ key: "preferred_name", value: name, confidence: 1.0 });
    }

    return candidates;
  }
}
