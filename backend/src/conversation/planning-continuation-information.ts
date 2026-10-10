import { requestsPendingPlanningContinuation } from "./conversation-intent";

export interface PlanningContinuationInformation {
  change?: { relativePath: "index.html"; before: string; after: string };
  preservation: Array<{ quote: string; clause: string }>;
  acceptance: string[];
}
const control = /^(?:Planning continuation only\.|Planning only\.|Do not (?:create (?:an exact|a) proposal|request (?:human )?approval|issue an execution permit|modify any file|execute anything|start a new inspection)\.)$/i;
/** Bounded user-data extraction, never authority. Unknown or duplicate sections
 * are rejected rather than discarded or recovered from historical messages. */
export function currentPlanningInformation(message: string): PlanningContinuationInformation | null {
  if (!requestsPendingPlanningContinuation(message)) return null;
  if (!/^(?:Required change|Target|Change|Constraints|Preservation constraints|Acceptance criteria|Success criteria|Acceptance|Success|Expected outcome):/im.test(message)) return null;
  if (message.length > 4000) throw new Error("PLANNING_CONTINUATION_INFORMATION_INVALID");
  const sections = new Map<string, string[]>(); let section: string | undefined;
  for (const raw of message.split(/\r?\n/).slice(1)) {
    const line = raw.trim();
    const header = /^(Required change|Constraints|Acceptance criteria|Success criteria|Acceptance):\s*$/i.exec(line);
    if (header) {
      section = /^Required/i.test(header[1]) ? "change" : /^Constraints/i.test(header[1]) ? "constraints" : "acceptance";
      if (sections.has(section)) throw new Error("PLANNING_CONTINUATION_INFORMATION_INVALID");
      sections.set(section, []); continue;
    }
    if (control.test(line)) { section = undefined; continue; }
    if (!line) continue;
    if (section) sections.get(section)!.push(line);
    else if (!/^Use the authoritative persisted Version \d+ and its existing source checkpoint\.$/i.test(line))
      throw new Error("PLANNING_CONTINUATION_INFORMATION_INVALID");
  }
  const result: PlanningContinuationInformation = { preservation: [], acceptance: [] };
  if (sections.has("change")) {
    const text = sections.get("change")!.join("\n");
    const change = /^index\.html\n"([^"\r\n]+)"\n→\n"([^"\r\n]+)"$/.exec(text)
      ?? /^index\.html\n"([^"\r\n]+)"[ \t]*→[ \t]*"([^"\r\n]+)"$/.exec(text);
    if (!change || change[1].length > 160 || change[2].length > 160) throw new Error("PLANNING_CONTINUATION_INFORMATION_INVALID");
    result.change = { relativePath: "index.html", before: change[1], after: change[2] };
  }
  const mappings: Array<[RegExp, string]> = [
    [/^Change only the Hero heading text\.$/i, "Preserve existing Hero markup."],
    [/^Preserve the existing <h1> structure\.$/i, "Preserve existing Hero markup."],
    [/^Preserve the existing <span> wrapping "intelligent"\.$/i, "Preserve existing Hero markup."],
    [/^Preserve all surrounding structure and whitespace\.$/i, "Preserve surrounding content."],
    [/^Do not intentionally change any other content\.$/i, "Keep all other content unchanged."]
  ];
  for (const item of sections.get("constraints") ?? []) {
    const quote = item.replace(/^[-*]\s+/, ""), match = mappings.find(([pattern]) => pattern.test(quote));
    if (!match || !result.change) throw new Error("PLANNING_CONTINUATION_INFORMATION_INVALID");
    result.preservation.push({ quote, clause: match[1] });
  }
  if (sections.has("constraints") && !result.preservation.length) throw new Error("PLANNING_CONTINUATION_INFORMATION_INVALID");
  if (result.change && !result.preservation.some(item => /^Change only the Hero heading text\.$/i.test(item.quote))) throw new Error("PLANNING_CONTINUATION_INFORMATION_INVALID");
  if (sections.has("acceptance")) {
    result.acceptance = sections.get("acceptance")!;
    if (!result.acceptance.length || result.acceptance.length > 8 || result.acceptance.join("\n").length > 512 ||
      result.acceptance.some(line => !/^(?:\d+[.)]|[-*])\s+\S/.test(line))) throw new Error("PLANNING_CONTINUATION_INFORMATION_INVALID");
  }
  return result;
}

export function continuationObjective(saved: string, information: PlanningContinuationInformation): string {
  const change = information.change;
  return [change ? `Change only the index.html Hero heading from ${JSON.stringify(change.before)} to ${JSON.stringify(change.after)}.` : saved,
    ...new Set(information.preservation.map(item => item.clause)),
    ...(information.acceptance.length ? [`Acceptance:\n${information.acceptance.join("\n")}`] : [])].join("\n");
}
