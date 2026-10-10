import type { ConversationMessageDto } from "./sekhem-conversation"

/** Project only the known server report format; retain the full report in Details. */
export function inspectionReportSummary(message: ConversationMessageDto): string | null {
  if (message.senderType !== "assistant" || !message.metadata?.agentRunId || message.metadata.inspectionReport !== true ||
    message.metadata.understandingReport !== true || message.metadata.outcome !== "COMPLETED" ||
    !message.content.startsWith("Project understanding — inspected scope\n")) return null
  const heading = "\nInferred (not certified facts):\n", end = "\nUnknown / missing information:\n"
  const from = message.content.indexOf(heading), to = message.content.indexOf(end, from + heading.length)
  if (from < 0 || to < 0) return null
  const arabic = /[\u0600-\u06ff]/.test(message.content.slice(from + heading.length, to))
  const inference = message.content.slice(from + heading.length, to).trim()
    // Internal fact identifiers remain in the original report and source details.
    .replace(/\s*\[fact-[A-Za-z0-9_-]+(?:,\s*fact-[A-Za-z0-9_-]+)*\]/g, "")
    .replace(/\bUncertainty:\s*/g, arabic ? "حدود الاستنتاج: " : "Limits: ")
    .replace(/truncated=false/g, arabic ? "القراءة المسجلة غير مقتطعة" : "the recorded read is not truncated")
    .replace(/\s*\(([12])\)\s*/g, "\n\n$1. ")
  if (!inference) return null
  // Never remove uncertainty, unknowns, hypotheses or the recorded scope limits.
  return `### ${arabic ? "الملخص والاستنتاجات" : "Summary and inferences"}\n${inference}\n\n${arabic ? "الاستشهادات والتقرير الأصلي متاحان في التفاصيل." : "Citations and the original report are available in Details."}\n\n### ${arabic ? "حدود الفحص والمعلومات الناقصة" : "Limits and missing information"}\n${message.content.slice(to + end.length)}`
}
