/** Shared deterministic routing/context semantics. Intent never grants permission. */
export function requestsSourceAnalysis(instruction: string): boolean {
  const text = instruction.normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").toLowerCase();
  // Require a concrete file and an inspection request, not a mention of analysis.
  return workspaceFileReferences(instruction).length > 0 && (
    /\b(?:read|inspect|analy[sz]e|review|summari[sz]e|look\s+at)\b/.test(text) ||
    /(?:اقر[أا]|افحص|حلل|لخص|راجع|(?:بص|شوف)\s+(?:على|في)|قراءة\s+وتحليل|(?:نفذ|شغل)\s+(?:عملية\s+)?(?:قراءة|فحص|تحليل|مراجعة)(?=$|[\s،؛,.!?؟]))/.test(text));
}

export function requestsWorkspaceVisibility(instruction: string): boolean {
  const text = instruction.trim().toLowerCase();
  if (text.length > 240 || /\b(read|inspect|analy[sz]e|understand|explain|review|fix|modify|edit|run|execute|create|update|search|list|delete|move|copy|write|replace)\b|(?:اقر[اأ]|افحص|حلل|اشرح|اصلح|صلح|عدل|عدّل|غير|غيّر|نفذ|شغل|دور|احذف|انسخ|انقل)/.test(text)) return false;
  if (/^(?:what (?:files|folders|directories) are (?:here|in (?:this|the|my) (?:project|workspace))|[إا]يه الموجود هنا)[?.!؟\s]*$/.test(text)) return true;
  return /\b(?:can you see|do you see|is .+ connected|which .+ connected)\b/.test(text) && /\b(project|workspace|repo|repository|files?|folder)\b/.test(text)
    || /(?:شايف|ظاهر|متوصل|متصله|متصلة)/.test(text) && /(?:المشروع|الملفات|الفايلات|الفولدر|المجلد|مساحة العمل)/.test(text);
}

export function workspaceFileReferences(instruction: string, maximum = 5): string[] {
  // Unquoted before/after diff notation describes verification, not a second
  // workspace target. Keep quoted targets and actual path prefixes untouched.
  const source = instruction.replace(/\b(?:sections\/components|functions\/components)\b(?![\\/])/gi, (value, offset) => {
    // Unquoted compound prose is not a pathname. Explicit quoted paths remain intact.
    const prefix = instruction.slice(0, offset);
    return /(?:\bmain\s+|أهم\s+الـ)$/.test(prefix) && !/["'`][^"'`]*$/.test(prefix) ? value.replace("/", " and ") : value;
  }).replace(/(^|[\s(])before\/after(?=\s+diff\b)/gi, "$1before and after")
    // This bounded preservation phrase describes source formatting, not a
    // second path. Quoted paths and directory-prefixed paths remain targets.
    .replace(/(^|[\s(])surrounding structure\/whitespace(?=,\s+and all other content(?:[.!?]|$))/gi, "$1surrounding structure and whitespace")
    .replace(/(^|\r?\n)([ \t]*-[ \t]+)surrounding structure\/whitespace([ \t]*\r?\n)(?=[ \t]*-[ \t]+all other content[ \t]*(?:\r?\n|$))/gi, "$1$2surrounding structure and whitespace$3");
  // Quoted numeric version operands in a bounded replacement are values, not paths.
  // Do not strip numeric filenames mentioned as actual targets outside this form.
  const targets = source.replace(/(\bversion\b[^"'\r\n]{0,120}(?:\bfrom|من)\s+)["']\d+\.\d+\.\d+["']\s*(?:to|إلى|الى|→)\s*["']\d+\.\d+\.\d+["']/gi, "$1version values")
    // The same bounded replacement may use bare version values. Require both
    // complete operands; directory prefixes and filename suffixes stay targets.
    .replace(/(\bversion\b[^"'\r\n]{0,120}(?:\bfrom|من)\s+)\d+\.\d+\.\d+\s*(?:to|إلى|الى|→)\s*\d+\.\d+\.\d+(?![\w.\\/-])/gi, "$1version values");
  const matches = targets.match(/(?:[a-z]:[\\/]|[\\/])?(?:[\w@.-]+[\\/])+[\w@.-]+|\.[\w-]+|[\w-]+\.[\w.-]+|\b(?:Dockerfile|Makefile|LICENSE)\b/gi) ?? [];
  return [...new Set(matches.map(value => value.replace(/[.,;:]+$/, "").replace(/\\/g, "/")))].slice(0, maximum);
}

export function requestsWorkspace(instruction: string): boolean {
  if (requestsWorkspaceVisibility(instruction)) return false;
  const text = instruction.trim().normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").toLowerCase();
  const action = /\b(read|look|make|send|inspect|analy[sz]e|review|fix|implement|modify|run|execute|create|update|refactor|debug|find|search|show|list|explain|where|understand|compare|test|verify|check)\b/.test(text)
    || /(اقرأ|افحص|حلل|اصلح|المشروع|الكود|المستودع)/.test(text) || requestsSourceAnalysis(instruction);
  if (!action) return false;
  const file = workspaceFileReferences(instruction).length > 0;
  const boundTarget = /\b(?:this|the|my|our|current|selected)\s+(?:project|workspace|repository|repo|codebase|code|files?)\b/.test(text)
    || /\b(?:in|within|from)\s+(?:(?:this|the|my|our|current)\s+)?(?:workspace|repository|codebase)\b/.test(text);
  if (file || boundTarget) return true;
  if (/^(?:explain\s+(?:how|what)|how\s+(?:do|does|can|should|to)|what\s+(?:is|are))\b/.test(text)) return false;
  if (/\b(attached|attachment|uploaded|pdf|document)\b/.test(text)) return false;
  // Route imperative follow-ups to the existing control plane. Intent is never a permit.
  if (/^(?:please\s+)?(?:now\s+)?(?:execute(?:\s+(?:it|the plan))?|run\s+(?:the\s+)?tests|send\s+(?:it|the plan)\s+to\s+(?:the\s+)?agent)[.!?]*$/.test(text)) return true;
  if (/\b(?:make|create|update)\s+(?:a|the)\s+plan\s+to\s+(?:replace|migrate|refactor|implement)\b/.test(text)) return true;
  return /\b(workspace|project|repository|codebase|authentication|frontend|backend|source code|bug)\b/.test(text)
    || /^(?:please\s+)?read\s+[\w-]+\s*[.!?]?$/.test(text)
    || /(المشروع|الكود|المستودع)/.test(text);
}
