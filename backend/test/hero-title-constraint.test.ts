import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { interpretContext, validatePlanningProposal, type AgentPlanningProposal } from "../src/agent-runtime/understanding/agent-planning.contract";
import { arabicHeroRequest, heroConstrainedResult, heroTitle } from "../src/agent-runtime/understanding/hero-title-constraint";
import { resolvedHeroPlanningObjective } from "../src/agent-runtime/understanding/persisted-planning";
import { prepareExactActions } from "../src/agent-runtime/execution/exact-plan-proposal";

const source = '\uFEFF<!doctype html>\r\n<style>.hero{color:red}</style>\r\n<section class="hero" id="home">\r\n<h1>\r\nBuilding\r\n<span>simple</span>\r\ndigital experiences.\r\n</h1>\r\n<p>simple elsewhere</p>\r\n</section>\r\n';
const objective = 'Change the Hero title in index.html from "Building simple digital experiences." to "Building intelligent digital experiences."\nAcceptance: exact target index.html; change only the Hero title, preserving its existing markup; preserve CSS; preserve encoding.';
const ref = "runtime:verified-source-receipt";
const arabicRequest = 'غيّر Hero heading من "Building intelligent digital experiences." إلى "Building intelligent digital products." مع الحفاظ على باقي محتوى الملف كما هو.';

test("bounded Arabic Hero change resolves verbatim quoted values and preservation", () => {
  const current = source.replace("<span>simple</span>", "<span>intelligent</span>");
  const f = fixture(current, arabicRequest);
  const constraint = f.base.constraints.find(c => c.rule === "HERO_TITLE_TEXT_ONLY")!;
  assert.equal(constraint.requestQuote, "مع الحفاظ على باقي محتوى الملف كما هو");
  assert.equal(constraint.textChange?.before, "Building intelligent digital experiences.");
  assert.equal(constraint.textChange?.after, "Building intelligent digital products.");
  assert.equal(heroConstrainedResult(current, constraint.textChange!), current.replace("digital experiences.", "digital products."));
  assert.equal(f.base.readiness, "UNDERSTANDING_READY");
  assert.equal(validate(f).plan.readiness, "PLAN_READY");
  assert.equal(validate(f).plan.authorization, "NOT_GRANTED");
});

test("Arabic quoted OLD/NEW are never trimmed or normalized into an accepted change", () => {
  const current = source.replace("<span>simple</span>", "<span>intelligent</span>");
  const paddedOld = arabicRequest.replace('من "Building', 'من " Building');
  assert.equal(arabicHeroRequest(paddedOld)?.before, " Building intelligent digital experiences.");
  assert.ok(!fixture(current, paddedOld).base.constraints.some(c => c.textChange));
  const paddedNew = arabicRequest.replace('إلى "Building', 'إلى " Building');
  assert.equal(arabicHeroRequest(paddedNew)?.after, " Building intelligent digital products.");
  assert.ok(!fixture(current, paddedNew).base.constraints.some(c => c.textChange));
});

test("Arabic preservation requires successfully verified Hero change", () => {
  const mismatch = fixture(source, arabicRequest);
  assert.equal(mismatch.base.constraints.find(c => c.requestQuote === "مع الحفاظ على باقي محتوى الملف كما هو")?.rule, "UNRESOLVED");
  assert.equal(mismatch.base.readiness, "NEEDS_CLARIFICATION");
});

test("unsupported Arabic restrictions on the bounded Hero command remain fail-closed", () => {
  const current = source.replace("<span>simple</span>", "<span>intelligent</span>");
  for (const restriction of ["بدون تغيير الصلاحيات", "مع الحفاظ على كل شيء آمن", "مع الحفاظ على باقي محتوى الملف كما هو وتغيير اللون", "لا تطلب موافقة"]) {
    const f = fixture(current, arabicRequest.replace("مع الحفاظ على باقي محتوى الملف كما هو.", restriction + "."));
    assert.ok(f.base.constraints.some(c => c.rule === "UNRESOLVED" && c.requestQuote === restriction));
    assert.equal(f.base.readiness, "NEEDS_CLARIFICATION");
  }
  assert.equal(arabicHeroRequest('غيّر navbar من "old" إلى "new"'), undefined);
});

function resolvedEnvelopeFixture() {
  const current = source.replace("<span>simple</span>", "<span>intelligent</span>");
  const runtimeReference = { receiptId: "verified-source-receipt", relativePath: "index.html", verificationState: "VERIFIED", truncated: false };
  const checkpoint = { status: "GROUNDED", evidence: [{ id: ref, read: true, runtimeReference }], understanding: {
    readiness: "UNDERSTANDING_READY", facts: [{ id: "hero-heading", text: heroTitle(current)!.excerpt, evidenceRef: ref }],
    inferences: [{ text: "The Hero heading", factIds: ["hero-heading"] }]
  } };
  const target = { concept: "hero", path: "index.html", evidenceId: "verified-source-receipt", factId: "hero-heading" };
  const envelope = `Create an engineering plan to modify only the resolved hero source target.\nOriginal request: ${arabicRequest}\nResolved source target (context, not authorization): ${JSON.stringify(target)}`;
  return { current, envelope, certified: { checkpoint, references: [runtimeReference] } as any };
}

test("certified server target wrapper stays separate from user constraint interpretation", () => {
  const { current, envelope, certified } = resolvedEnvelopeFixture();
  const objective = resolvedHeroPlanningObjective(envelope, certified);
  assert.equal(objective, arabicRequest);
  const f = fixture(current, objective);
  assert.ok(!f.base.constraints.some(c => c.rule === "UNRESOLVED"));
  assert.ok(f.base.constraints.every(c => !c.requestQuote?.includes("resolved hero source target")));
  assert.equal(validate(f).plan.readiness, "PLAN_READY");
});

test("unmatched or uncertified resolved-target wrappers cannot discard restrictions", () => {
  for (const mutate of [(s: any) => { s.references[0].receiptId = "other"; }, (s: any) => { s.checkpoint.status = "PARTIAL"; },
    (s: any) => { s.references[0].truncated = true; }, (s: any) => { s.checkpoint.understanding.facts[0].text = '<section class="hero">'; }]) {
    const { current, envelope, certified } = resolvedEnvelopeFixture(); mutate(certified);
    assert.equal(resolvedHeroPlanningObjective(envelope, certified), envelope);
    assert.equal(fixture(current, envelope).base.readiness, "NEEDS_CLARIFICATION");
  }
});
test("bounded multiline from/to labels resolve the exact Hero change", () => {
  const current = source.replace("<span>simple</span>", "<span>intelligent</span>");
  for (const instruction of [
    'Change the Hero heading in index.html from:\n"Building intelligent digital experiences."\nto:\n"Building intelligent digital products."',
    'Change the Hero heading text in index.html.\n\nTarget:\nChange the existing heading from:\n"Building intelligent digital experiences."\nto:\n"Building intelligent digital products."',
    'Change the Hero heading in index.html from "Building intelligent digital experiences." to "Building intelligent digital products."'
  ]) {
    const f = fixture(current, instruction);
    const change = f.base.constraints.find(c => c.rule === "HERO_TITLE_TEXT_ONLY")?.textChange;
    assert.equal(change?.before, "Building intelligent digital experiences.");
    assert.equal(change?.after, "Building intelligent digital products.");
    assert.equal(change?.replacement, "product");
  }
});

test("bounded multiline acceptance retains exact request provenance", () => {
  for (const content of ["The heading matches the requested text.", "- The heading matches the requested text.\n- Surrounding markup remains unchanged."]) {
    const acceptance = `Success criteria:\n${content}`;
    const f = fixture(source, `Plan a source update.\n${acceptance}\n\nVerification:\nRead back the result.`);
    assert.equal(f.base.successCriteria.find(c => c.id === "requested-outcome")?.requestQuote, acceptance);
    assert.ok(!f.base.unknowns.some(u => u.id === "success-criteria"));
  }
});

test("missing or ambiguous Hero targets remain blocked", async () => {
  for (const target of ['from:\n"Building simple digital experiences."',
    'from:\n"Building simple digital experiences."\nto:\n"Building intelligent digital experiences."\nfrom:\n"Building simple digital experiences."\nto:\n"Building other digital experiences."']) {
    const f = fixture(source, `Change only the Hero heading in index.html ${target}`);
    assert.ok(!f.base.constraints.some(c => c.rule === "HERO_TITLE_TEXT_ONLY"));
    assert.equal(validate(f).plan.readiness, "PLAN_NOT_READY");
    const result = await new AgentUnderstandingService().createPlan(f.context, "source", f.visible, undefined, true);
    assert.ok(result?.plan.validation.issues.some(i => i.code === "NEEDS_INFORMATION"));
  }
});

test("missing ambiguous and oversized acceptance remain blocked", async () => {
  for (const suffix of ["", "\nSuccess criteria:\n", "\nSuccess criteria:\n-", "\nSuccess criteria:\n- First outcome.\n\nSuccess criteria:\n- Second outcome.", `\nSuccess criteria:\n${"x".repeat(513)}`, `\nSuccess criteria:\n${Array(7).fill("- Outcome.").join("\n")}`]) {
    const f = fixture(source, `Modify index.html.${suffix}`);
    assert.ok(f.base.unknowns.some(u => u.id === "success-criteria"));
    const result = await new AgentUnderstandingService().createPlan(f.context, "source", f.visible, undefined, true);
    assert.ok(result?.plan.validation.issues.some(i => i.code === "NEEDS_INFORMATION"));
  }
  const f = fixture(source, objective + "\nSuccess criteria:\n");
  assert.ok(f.base.unknowns.some(u => u.id === "success-criteria"), "Explicit invalid criteria cannot fall back to the Hero target");
});
test("planning-stage workspace prohibition allows future Hero writes with explicit evidence-only prompt scope", async () => {
  const f = fixture(source, objective + " Planning only. Do not write the workspace.");
  assert.equal(f.base.constraints.find(c => c.requestQuotes?.includes("Do not write the workspace"))?.rule, "PLANNING_ONLY");
  const result = await new AgentUnderstandingService().createPlan(f.context, "source", f.visible, {
    requestStructuredReasoning: async input => {
      const contract = JSON.parse(input.question.split("[PLANNING CONTRACT DATA]\n")[1]);
      assert.deepEqual(contract.heroAllowedScopes.map((s: any) => s.scopeRefs), [["scope-1"]]);
      assert.match(input.systemInstruction, /Project scope is explicitly excluded from Hero steps/);
      assert.match(input.systemInstruction, /every step \(including PROPOSE\) must use exactly the scopeRefs/);
      return JSON.stringify(f.proposal);
    }
  }, true);
  assert.equal(result?.plan.readiness, "PLAN_READY");
  f.proposal.steps[0].scopeRefs.push("project");
  assert.ok(validate(f).plan.validation.issues.some(i => i.code === "HERO_SCOPE_VIOLATION"));
});

for (const restriction of ["Do not write the workspace", "Planning only. No writes"]) test(`genuine write restriction still blocks future WRITE: ${restriction}`, () => {
  const f = fixture(source, objective + " " + restriction + ".");
  assert.ok(f.base.constraints.some(c => c.rule === "NO_WRITE"));
  assert.ok(validate(f).plan.validation.issues.some(i => i.code === "CONSTRAINT_VIOLATION"));
});

test("qualified or ambiguous planning-stage restrictions remain unresolved", () => {
  for (const restriction of ["Do not write the workspace unless safe", "Planning only if convenient", "Do not write the workspace during an unspecified phase"]) {
    const f = fixture(source, objective + " " + restriction + ".");
    assert.ok(f.base.constraints.some(c => c.rule === "UNRESOLVED"));
    assert.equal(f.base.readiness, "NEEDS_CLARIFICATION");
  }
});
test("bounded planning restrictions normalize with provenance and require certified reuse admission", () => {
  const instruction = "Create an engineering plan to change only the index.html Hero title from 'Building simple digital experiences.' to 'Building intelligent digital experiences.'. Replace only the text simple inside the existing Hero h1 span with intelligent. Preserve markup, CSS, encoding and every other byte. Planning only. Do not redo inspection. Do not execute anything. Do not request or perform approval. Do not create an Execution Permit. Do not write the workspace.";
  const f = fixture(source, instruction);
  assert.ok(f.base.constraints.some(c => c.rule === "UNRESOLVED" && c.requestQuote === "Do not redo inspection"));
  f.context.certifiedSourceReuse = true;
  const base = interpretContext(f.context, f.visible);
  assert.equal(base.readiness, "UNDERSTANDING_READY");
  assert.ok(base.constraints.some(c => c.rule === "CERTIFIED_SOURCE_REUSE"));
  assert.ok(base.constraints.some(c => c.rule === "PLANNING_ONLY" && c.requestQuote === "Planning only"));
  assert.ok(base.constraints.length <= 6);
  const quotes = base.constraints.flatMap(c => c.requestQuotes ?? (c.requestQuote ? [c.requestQuote] : []));
  for (const clause of ["Do not redo inspection", "Do not execute anything", "Do not request or perform approval", "Do not create an Execution Permit", "Do not write the workspace", "Preserve markup, CSS, encoding and every other byte"]) assert.ok(quotes.includes(clause));
  f.context.objective += " Must preserve invisible magic.";
  const rejected = interpretContext(f.context, f.visible);
  assert.ok(rejected.constraints.some(c => c.rule === "UNRESOLVED" && c.requestQuote === "Must preserve invisible magic"));
  assert.equal(rejected.readiness, "NEEDS_CLARIFICATION");
});
test("genuine workflow-clause overflow fails closed while retaining clause provenance", () => {
  const f = fixture(source, Array(33).fill("Planning only").join(". "));
  assert.equal(f.base.readiness, "NEEDS_CLARIFICATION");
  assert.ok(f.base.unknowns.some(u => u.id === "constraint-interpretation"));
  assert.equal(f.base.constraints.find(c => c.source === "USER" && c.rule === "PLANNING_ONLY")?.requestQuotes?.length, 33);
});
function fixture(text = source, instruction = objective) {
  const context = new AgentUnderstandingService().understand({ userId: "user", projectId: "project", instruction, availableCapabilities: [], workspaceAvailable: true });
  context.userIntent = [...new Set([...context.userIntent, "PLAN" as const])]; // Existing persisted-planning entry point.
  context.evidence = [{ sourceType: "workspace", sourceId: "read-operation", relativePath: "index.html", provenance: ref,
    status: "COLLECTED", metadata: { operation: "filesystem.read" }, warnings: [],
    runtimeReference: { receiptId: "verified-source-receipt", relativePath: "index.html", truncated: false, verificationState: "VERIFIED" } as any,
    content: { text, detectedMime: "text/html", extractorId: "text", truncated: false } }];
  const visible = new Map([[ref, text]]), base = interpretContext(context, visible);
  const proposal: AgentPlanningProposal = { constraintIds: base.constraints.map(c => c.id),
    facts: [{ id: "hero", text: heroTitle(text)?.excerpt ?? "unavailable", evidenceRef: ref }], inferences: [], hypotheses: [], unknowns: [],
    steps: [
      { id: "change", type: "IMPLEMENT", purpose: "PROPOSE_CHANGE", effect: "WRITE", evidenceRefs: [ref], missingInformationIds: [], dependencies: [], scopeRefs: ["scope-1"],
        verificationCriterionIds: ["requested-outcome", "hero-text-only"], dependencyStatus: "KNOWN", description: "Update only the identified Hero text after approval and preimage validation.", verificationDescription: "Preserve markup, CSS, encoding and all other bytes." },
      { id: "verify", type: "VERIFY", purpose: "CHECK_OUTCOME", effect: "READ_ONLY", evidenceRefs: [ref], missingInformationIds: [], dependencies: ["change"], scopeRefs: ["scope-1"],
        verificationCriterionIds: ["requested-outcome", "hero-text-only"], dependencyStatus: "KNOWN", description: "Read back index.html through Runtime.", verificationDescription: "The complete read matches the approved exact result." }
    ] };
  return { context, visible, base, proposal };
}
const validate = (f: ReturnType<typeof fixture>) => validatePlanningProposal(f.base, f.proposal, f.visible, true);

const preSshControl = "Do not create a proposal, request approval, issue a permit, or modify any file yet";
const preSshRequest = `Change only the Hero heading in index.html:
"Building intelligent digital products."
→
"Building intelligent digital experiences."

Preserve the existing <h1>, the <span> around "intelligent", surrounding structure/whitespace, and all other content.

This is a controlled pre-SSH validation change. Stop at persisted PLAN_READY for review. ${preSshControl}.`;

test("exact pre-SSH combined planning control resolves without changing Hero scope or granting authority", () => {
  const text = source.replace("<span>simple</span>", "<span>intelligent</span>").replace("digital experiences.", "digital products.");
  const f = fixture(text, preSshRequest);
  const control = f.base.constraints.find(c => c.requestQuote === preSshControl)!;
  assert.equal(control.rule, "PLANNING_ONLY");
  assert.equal(control.source, "USER");
  assert.equal(control.description, preSshControl);
  assert.equal(control.textChange, undefined);
  assert.equal(f.base.unknowns.some(u => u.id === "constraint-interpretation"), false);
  const hero = f.base.constraints.find(c => c.rule === "HERO_TITLE_TEXT_ONLY")!;
  assert.equal(hero.textChange?.before, "Building intelligent digital products.");
  assert.equal(hero.textChange?.after, "Building intelligent digital experiences.");
  assert.equal(heroConstrainedResult(text, hero.textChange!), text.replace("digital products.", "digital experiences."));
  const result = validate(f);
  assert.equal(result.plan.readiness, "PLAN_READY");
  assert.equal(result.plan.authorization, "NOT_GRANTED");
});

test("combined planning control near misses and unrelated unknown restrictions remain blocking", () => {
  const text = source.replace("<span>simple</span>", "<span>intelligent</span>").replace("digital experiences.", "digital products.");
  for (const control of [
    `${preSshControl} unless convenient`,
    preSshControl.replace("issue a permit", "issue credentials"),
    preSshControl.replace("or modify any file yet", "or modify any file except CSS"),
  ]) {
    const f = fixture(text, preSshRequest.replace(preSshControl, control));
    assert.ok(f.base.constraints.some(c => c.rule === "UNRESOLVED" && c.requestQuote === control));
    assert.equal(validate(f).plan.readiness, "PLAN_NOT_READY");
  }
  const f = fixture(text, `${preSshRequest}\nMust preserve invisible magic.`);
  assert.ok(f.base.constraints.some(c => c.rule === "UNRESOLVED" && c.requestQuote === "Must preserve invisible magic"));
  assert.equal(validate(f).plan.readiness, "PLAN_NOT_READY");
});

test("combined control is not reclassified as planning-only without PLAN intent", () => {
  const f = fixture();
  f.context.objective = preSshControl;
  f.context.userIntent = ["INSPECT"];
  const result = interpretContext(f.context, f.visible);
  assert.ok(result.constraints.some(c => c.requestQuote === preSshControl && c.rule === "UNRESOLVED"));
  assert.ok(result.unknowns.some(u => u.id === "constraint-interpretation"));
});

const liveModification = `Change only the Hero heading text in index.html from "Building intelligent digital experiences." to "Building intelligent digital products." Preserve the existing h1 element, span tags, formatting, structure, and every other part of index.html unchanged.

Success criteria:
- The Hero heading exactly reads "Building intelligent digital products."
- The existing h1 structure and span tags remain unchanged.
- All other content in index.html remains unchanged.
- Verification requires exact before/after diff and read-back after a separately authorized execution.

Prepare the engineering plan only and stop after persisted PLAN_READY. Do not create a proposal. Do not request approval. Do not issue an execution permit. Do not execute or modify any file.`;

test("full live Hero modification resolves preservation and current-stage controls using the valid-plan contract", () => {
  const text = source.replace("<span>simple</span>", "<span>intelligent</span>");
  const f = fixture(text, liveModification);
  assert.deepEqual(f.base.constraints.filter(c => c.rule === "UNRESOLVED"), []);
  const hero = f.base.constraints.find(c => c.rule === "HERO_TITLE_TEXT_ONLY")!;
  assert.equal(hero.textChange?.before, "Building intelligent digital experiences.");
  assert.equal(hero.textChange?.after, "Building intelligent digital products.");
  assert.equal(heroConstrainedResult(text, hero.textChange!), text.replace("digital experiences.", "digital products."));
  assert.ok((hero.requestQuotes ?? [hero.requestQuote!]).some(q => q.endsWith("Preserve the existing h1 element, span tags, formatting, structure, and every other part of index.html unchanged")));
  const controls = f.base.constraints.find(c => c.source === "USER" && c.rule === "PLANNING_ONLY")!;
  for (const quote of ["Do not create a proposal", "Do not request approval", "Do not issue an execution permit", "Do not execute or modify any file"]) assert.ok(controls.requestQuotes?.includes(quote));
  assert.equal(validate(f).plan.readiness, "PLAN_READY");
  assert.equal(validate(f).plan.authorization, "NOT_GRANTED");
});

test("live Hero restriction near misses and unsupported controls remain unresolved", () => {
  const text = source.replace("<span>simple</span>", "<span>intelligent</span>");
  for (const instruction of [
    liveModification.replace("every other part of index.html unchanged", "every other part of index.html unchanged except CSS"),
    liveModification.replace("Do not create a proposal", "Do not create a proposal unless convenient"),
    liveModification.replace("Building intelligent digital experiences.", "Wrong heading"),
    liveModification.replace("Prepare the engineering plan only and stop after persisted PLAN_READY. ", ""),
  ]) {
    const f = fixture(text, instruction);
    assert.ok(f.base.constraints.some(c => c.rule === "UNRESOLVED"));
    assert.equal(validate(f).plan.readiness, "PLAN_NOT_READY");
  }
});

const goldenRequest = "Create an engineering plan to change only the index.html Hero title from 'Building simple digital experiences.' to 'Building intelligent digital experiences.'. Preserve markup, CSS, encoding and every other byte. Replace only the text simple inside the existing Hero h1 span with intelligent. Planning and exact proposal only. Acceptance: exact Hero text change with all other bytes preserved.";
test("the persisted Golden request resolves its explicit constraints without authorizing writes", () => {
  const instruction = "Create an engineering plan to change only the index.html Hero title from 'Building simple digital experiences.' to 'Building intelligent digital experiences.'. Preserve markup, CSS, encoding and every other byte. Replace only the text simple inside the existing Hero h1 span with intelligent. Acceptance: exactly one Hero title text-node replacement in index.html, preserving its h1 and span tags, whitespace, formatting, attributes and all other content; no other file changes. Planning and exact proposal only. No writes. No execution. Use the newly certified inspection run_1790860163677_6gbbe, checkpoint 1, workspace binding v40 and receipt rt1_RUNTIME_EXECUTION_1bb96d17ad7dcb64b9d247da2109efb9cdbe59096fead3d50d0b54aba9bb34d2. Show exact before/after and expected diff.";
  const f = fixture(source, instruction);
  assert.ok(!f.base.constraints.some(c => c.rule === "UNRESOLVED"));
  assert.equal(f.base.constraints.find(c => c.textChange)?.textChange?.replacement, "intelligent");
  assert.equal(f.base.constraints.find(c => c.requestQuote === "No writes")?.rule, "NO_WRITE");
});
test("Golden request ignores plan-to-change and resolves single-quoted targets and preservation", () => {
  const f = fixture(source, goldenRequest), change = f.base.constraints.find(c => c.textChange)?.textChange;
  assert.ok(change);
  assert.equal(change.before, "Building simple digital experiences.");
  assert.equal(change.after, "Building intelligent digital experiences.");
  assert.equal(heroConstrainedResult(source, change), source.replace("<span>simple</span>", "<span>intelligent</span>"));
  for (const clause of ["Preserve markup, CSS, encoding and every other byte", "Replace only the text simple inside the existing Hero h1 span with intelligent"]) {
    assert.equal(f.base.constraints.find(c => c.requestQuote === clause || c.requestQuotes?.includes(clause))?.rule, "HERO_TITLE_TEXT_ONLY");
  }
  assert.equal(f.base.constraints.find(c => c.requestQuote === "Planning and exact proposal only")?.rule, "PLANNING_ONLY");
  assert.ok(!f.base.constraints.some(c => c.rule === "UNRESOLVED"));
  assert.equal(validate(f).plan.readiness, "PLAN_READY");
  assert.equal(validate(f).plan.authorization, "NOT_GRANTED");
});
for (const request of [
  goldenRequest.replace("Building intelligent digital experiences.", "x".repeat(161)),
  goldenRequest + " Change Hero heading from 'Building simple digital experiences.' to 'Another heading'.",
  goldenRequest.replace("with intelligent", "with different"),
  goldenRequest.replace("every other byte", "every other byte except CSS"),
  goldenRequest.replace("'Building simple digital experiences.'", "'Wrong heading'"),
]) test(`Golden constraints fail closed: ${request.slice(-75)}`, () => {
  assert.equal(validate(fixture(source, request)).plan.readiness, "PLAN_NOT_READY");
});
test("new preservation clauses remain unresolved without a source-backed Hero change", () => {
  const f = fixture(source.replace('class="hero"', 'class="other"'), goldenRequest);
  assert.ok(f.base.constraints.some(c => c.rule === "UNRESOLVED"));
  assert.ok(!f.base.constraints.some(c => c.textChange));
});

test("verified Hero-only scope becomes PLAN_READY with immutable source coordinates and no authorization", async () => {
  const f = fixture();
  assert.ok(f.base.constraints.some(c => c.rule === "HERO_TITLE_TEXT_ONLY"));
  assert.ok(!f.base.constraints.some(c => c.rule === "UNRESOLVED"));
  const result = validate(f);
  assert.deepEqual(result.plan.validation.issues, []);
  assert.equal(result.plan.readiness, "PLAN_READY"); assert.equal(result.plan.authorization, "NOT_GRANTED");
  const change = result.plan.constraints.find(c => c.textChange)!.textChange!;
  const after = heroConstrainedResult(source, change)!;
  assert.equal(after, source.replace("<span>simple</span>", "<span>intelligent</span>"));
  assert.equal(after.charCodeAt(0), 0xfeff); assert.equal(after.split("\r\n").length, source.split("\r\n").length);
  assert.deepEqual(result.plan.steps.map(s => s.input), [{}, {}]);
  const generated = await new AgentUnderstandingService().createPlan(f.context, "verified source data", f.visible, {
    requestStructuredReasoning: async input => { assert.match(input.question, /HERO_TITLE_TEXT_ONLY/); return JSON.stringify(f.proposal); }
  }, true);
  assert.equal(generated?.plan.readiness, "PLAN_READY");
});

test("the actual short Arabic request resolves against the unique read Hero, without defaulting to another file", () => {
  const f = fixture(source, "غير عنوان الـHero إلى Building intelligent digital experiences.");
  assert.equal(validate(f).plan.readiness, "PLAN_READY");
  assert.equal(f.base.constraints.find(c => c.textChange)?.textChange?.before, "Building simple digital experiences.");
  f.context.evidence[0].relativePath = "other.html";
  assert.ok(!interpretContext(f.context, f.visible).constraints.some(c => c.rule === "HERO_TITLE_TEXT_ONLY"));
});

for (const [name, mutate] of Object.entries({
  "other file/project scope": (f: ReturnType<typeof fixture>) => { f.proposal.steps[0].scopeRefs = ["project"]; },
  "unrelated receipt": (f: ReturnType<typeof fixture>) => { f.proposal.steps[0].evidenceRefs = ["runtime:other"]; },
  "terminal step": (f: ReturnType<typeof fixture>) => { f.proposal.steps[0].effect = "EXECUTE"; },
  "additional write": (f: ReturnType<typeof fixture>) => { f.proposal.steps.push({ ...f.proposal.steps[0], id: "extra" }); },
  "no dependent readback": (f: ReturnType<typeof fixture>) => { f.proposal.steps[1].dependencies = []; },
  "missing preservation criterion": (f: ReturnType<typeof fixture>) => { f.proposal.steps[0].verificationCriterionIds = ["requested-outcome"]; },
  "irrelevant source fact": (f: ReturnType<typeof fixture>) => { f.proposal.facts[0].text = "simple elsewhere"; },
  "modified source identity": (f: ReturnType<typeof fixture>) => { f.visible.set(ref, source + " "); }
})) test(`Hero constraint rejects ${name}`, () => {
  const f = fixture(); mutate(f); assert.equal(validate(f).plan.readiness, "PLAN_NOT_READY");
});

for (const [name, text] of Object.entries({
  "duplicate Hero": source + source,
  "two headings": source.replace("</h1>", "</h1><h1>Other</h1>"),
  "unread title": "<html>No title</html>",
  "commented Hero": `<!--${source}-->`,
  "unclosed comment": `<!--${source}`,
  "class name inside another attribute": source.replace('class="hero" id="home"', 'data-hint=\'class="hero"\''),
  "duplicate class attribute": source.replace('class="hero"', 'class="other" class="hero"'),
  "ambiguous second malformed Hero": source + source.replace('class="hero"', 'class="hero" class="other"'),
  "unsupported title structure": source.replace("<span>simple</span>", "<em>simple</em>"),
  "wrong requested original": source.replace("<span>simple</span>", "<span>complex</span>")
})) test(`ambiguous or unsupported ${name} stays unresolved`, () => {
  const f = fixture(text); assert.ok(f.base.constraints.some(c => c.rule === "UNRESOLVED"));
  assert.equal(validate(f).plan.readiness, "PLAN_NOT_READY");
});

test("negated Hero changes do not acquire a positive text-change constraint", () => {
  for (const instruction of ['Do not change the Hero title to "Building intelligent digital experiences."', 'لا تغير عنوان الـHero إلى Building intelligent digital experiences.']) {
    assert.ok(!fixture(source, instruction).base.constraints.some(c => c.rule === "HERO_TITLE_TEXT_ONLY"));
  }
});

test("denied, truncated or non-read evidence cannot establish the Hero mutation scope", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.context.evidence[0].status = "DENIED"; },
    (f: ReturnType<typeof fixture>) => { f.context.evidence[0].content!.truncated = true; },
    (f: ReturnType<typeof fixture>) => { f.context.evidence[0].metadata.operation = "filesystem.list"; },
    (f: ReturnType<typeof fixture>) => { f.visible.set(ref, source.slice(0, -1)); }
  ]) { const f = fixture(); mutate(f); assert.ok(interpretContext(f.context, f.visible).constraints.some(c => c.rule === "UNRESOLVED")); }
});

test("recognizing Hero scope never resolves an additional unsupported security constraint", () => {
  const f = fixture(source, objective + "\nPreserve authorization behavior.");
  assert.ok(f.base.constraints.some(c => c.rule === "UNRESOLVED")); assert.equal(validate(f).plan.readiness, "PLAN_NOT_READY");
});

test("exact proposal must preserve all other bytes even when the model proposes a unique replacement", async () => {
  const f = fixture(), result = validate(f);
  const fresh: any = { binding: { rootPath: "D:\\fixture" }, conversation: { projectId: "project" }, sourceConversationId: "chat", references: [f.context.evidence[0].runtimeReference] };
  const evidence: any = { admit: async () => ({ operation: { tool: "filesystem.read" }, reference: { truncated: false }, file: { text: source } }) };
  for (const after of [source.replace("color:red", "color:blue").replace("simple</span>", "intelligent</span>"),
    source.replace("<span>simple</span>", "intelligent"), source.replace("simple elsewhere", "unrelated change")]) {
    await assert.rejects(prepareExactActions({ evidence, gateway: { requestStructuredReasoning: async () => JSON.stringify({ stepId: "change", search: source, replacement: after }) } }, {} as any, fresh, result), /HERO_SCOPE_VIOLATION/);
  }
  const actions = await prepareExactActions({ evidence, gateway: { requestStructuredReasoning: async () => JSON.stringify({ stepId: "change", search: "<span>simple</span>", replacement: "<span>intelligent</span>" }) } }, {} as any, fresh, result);
  assert.deepEqual(actions.map(a => a.tool), ["filesystem.write", "filesystem.read"]);
  assert.equal(actions[0].input.content, source.replace("<span>simple</span>", "<span>intelligent</span>"));
  assert.equal(actions[1].expectedAfterHash, actions[0].expectedAfterHash);
});
