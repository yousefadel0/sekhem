/** Routing only. A positive match requests engineering intent, never a permit. */
export function requestsConversationExecution(value: string): boolean {
  const text = value.trim().normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "");
  if (/^(?:explain\s+(?:how|what)|how\s+(?:do|does|can|should|to)|what\s+(?:is|are)|اشرح|كيف)\b/i.test(text)) return false;
  // Execute/run describes the requested operation, not necessarily a mutation.
  // Remove only the wrapper of a direct inspection noun; retain any separately
  // requested change or command. This is routing advice, never authorization.
  const withoutNegations = positiveEngineeringActionText(text);
  return /\b(?:create|write|edit|modify|delete|remove|move|copy|rename|implement|fix|refactor|deploy|install|execute|run|commit|push|replace|migrate)\b/i.test(withoutNegations)
    || /(?:نفذ|نفّذ|شغل|شغّل|احذف|عدّل|عدل|أنشئ|انشئ|اصلح|أصلح|انقل|انسخ)/.test(withoutNegations)
    // "غير" is also descriptive negation (e.g. "شيء غير موجود").
    // Match it only as a positive command starting a bounded clause.
    || /(?:^|[\n،؛,.!?؟]|\s(?:ثم|وبعدين|بعدها|لكن)\s)\s*(?:(?:طيب|طب|من فضلك|لو سمحت)\s+)?و?غير\s+(?!(?:موجود|مذكور|واضح|معروف|متاح|مسموح|مطلوب)(?=$|[\s،؛,.!?؟]))[^\s،؛,.!?؟]/.test(withoutNegations)
    || /\b(?:send|transfer)\b.*\bagent\b/i.test(text);
}
/** Shared action interpretation for routing and understanding; never authority. */
export function positiveEngineeringActionText(value: string): string {
  return positiveEngineeringIntentText(value)
    .replace(/\b(?:execute|run|perform|carry out)\s+(?:(?:a|an|the|one|single|bounded|read-only)\s+)*(?:reading|inspection|analysis|review)(?=$|[\s,.;!?])/gi, " ")
    .replace(/(^|[\s،؛,.!?؟])(?:و)?(?:نفذ|شغل)\s+(?:(?:عملية|واحدة|واحد)\s+)?(?:قراءة|فحص|تحليل|مراجعة)(?=$|[\s،؛,.!?؟])/g, "$1 ");
}
/** Shared bounded prohibition handling; interpretation only, never authority. */
export function positiveEngineeringIntentText(value: string): string {
  const text = value.trim().normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "");
  // Negation extends through coordinated actions, but stops at a new clause
  // or an explicit positive transition ("but", "then", "instead", "however").
  return text.replace(/\b(?:do not|don't|never)\s+(?:start|launch|create|write|edit|modify|delete|remove|move|copy|rename|implement|fix|refactor|deploy|install|execute|run|commit|push|replace|migrate)\b(?:(?![;!?\n]|\.(?:\s|$)|,(?!\s*(?:and|or|nor)\b)|\b(?:but|then|instead|however)\b)[\s\S])*/gi, clause => {
    if (/^\b(?:do not|don't|never)\s+(?:start|launch)\b/i.test(clause)) return "";
    if (/\b(?:and|or|nor)\s+(?:also\s+)?(?:create|write|edit|modify|delete|remove|move|copy|rename|implement|fix|refactor|deploy|install|execute|run|commit|push|replace|migrate)\b/i.test(clause)) return "";
    // The prohibited object's plan noun must not become a positive PLAN intent.
    // Retain separately positive changes and conditional exceptions as before.
    return clause.replace(/^\b(?:do not|don't|never)\s+\w+\b/i, "").replace(/\b(?:plans?|roadmaps?)\b/gi, "");
  })
    // Objects between coordinated prohibited verbs do not end the prohibition.
    // Explicit positive transitions and new clauses still terminate it.
    .replace(/(^|[\s،؛,.!?؟])(?:و?لا|لن|لم|ممنوع)\s+(?:ت)?(?:بدأ|ابدأ|نفذ|شغل|حذف|احذف|عدل|غير|أنشئ|انشئ|نشئ|اصلح|أصلح|صلح|انقل|نقل|انسخ|نسخ)(?=$|[\s،؛,.!?؟])(?:(?![؛;!?؟\n]|\.(?:\s|$)|[،,](?!\s*(?:و?لا|أو|او|و)(?=\s))|\s(?:ثم|لكن|وبعدين|بعدها)(?=\s))[\s\S])*/g, "$1");
}
export function isConversationAcknowledgment(value: string): boolean {
  return /^(?:ماشي|تمام|أوكي|اوكي|آه|اه|كمل|continue|okay|ok)[.!؟?\s]*$/i.test(value.trim());
}
/** Conversation routing only; none of these phrases approves or dispatches an operation. */
export function requestsConversationPlan(value: string): boolean {
  const text = value.trim().normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "");
  return /^(?:please\s+)?(?:make|create|generate|draft|revise|update)\s+(?:(?:me\s+)?(?:a|the)\s+)?(?:engineering\s+)?plan\b/i.test(text)
    || /^(?:اعمللي|اعمل لي|اعمل|ضع|اكتب|جهز|أنشئ|انشئ)\s+(?:plan\b|(?:لي\s+)?(?:خطة|الخطة)(?=$|[\s.!؟]))/i.test(text);
}
export function requestsPlanHandoff(value: string): boolean {
  return /^(?:(?:please\s+)?execute\s+(?:the\s+)?plan|نف[ّ]?ذ\s+الخطة)[.!؟?\s]*$/i.test(value.trim());
}
export function requestsUnderstandingFollowup(value: string): boolean {
  return /^(?:please\s+)?(?:explain|summarize|what|why|how|which|اشرح|وضح|لخص|ما|ماذا|لماذا|كيف|هل|ايه|إيه|ماهي)/i.test(value.trim())
    && /(?:project|workspace|source|files?|findings|understanding|inspected|المشروع|الكود|الملفات|الفحص|النتائج|المخاطر|فهمت)/i.test(value);
}

/** Artifact preparation only; trailing proposal details are not new planning intent. */
export function requestsExactProposal(value: string): boolean {
  return /^(?:please\s+)?(?:create|prepare|generate|draft)\s+(?:(?:the|an?)\s+)?exact\s+proposal(?=$|[\s:.,!?])/i.test(value.trim());
}

/** Bounded planning answers only. Header normalization preserves the supplied criteria. */
export function planningAcceptanceSection(value: string): string | undefined {
  const text = value.trim();
  if (text.length > 3000) return;
  const match = /^(?:(?:For the current engineering plan,\s*)?use these explicit\s+)?(acceptance criteria|success criteria|acceptance|success|expected outcome|معايير النجاح|معايير القبول)\s*[:：]\s*(\S[\s\S]*)$/i.exec(text);
  if (!match) return;
  return /^(?:acceptance|success criteria|success|expected outcome):/i.test(text) ? text : `Acceptance:\n${match[2]}`;
}

export function requestsPendingPlanningContinuation(value: string): boolean {
  return /^(?:please\s+)?(?:continue|resume)\s+(?:the\s+)?(?:current|existing)\s+(?:saved\s+)?PLAN_NOT_READY\s+(?:engineering\s+)?(?:plan|workflow)\b/i.test(value.trim());
}

/** Chat prose cannot mint a workflow state. Descriptions/questions remain ordinary chat. */
export function declaresPlanningReadiness(value: string): boolean {
  return /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:PLAN_READY\b|(?:Status|Readiness)\s*:\s*PLAN_READY\b)/i.test(value);
}
