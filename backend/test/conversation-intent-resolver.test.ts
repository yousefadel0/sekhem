import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "../src/conversation/conversation-intent-resolver";
import { requestsConversationExecution } from "../src/conversation/conversation-intent";

const boundedReadRequest = "اختبار تشخيص واحد: اقرأ الملف package.json فقط، بمسار نسبي package.json من جذر مساحة العمل OMNIROUTE_TEST، عبر Runtime الحالي. قدم تقريرًا مختصرًا عن اسم المشروع وأوامر scripts مع مراجع من القراءة الفعلية. نفذ قراءة واحدة فقط؛ لا تضف اسم الفولدر إلى المسار، ولا تقرأ ملفًا آخر، ولا تعاود القراءة عند الفشل، ولا تعدل ملفات أو تشغل Terminal أو تغير أي صلاحيات. إذا فشل الطلب اذكر السبب وتوقف.";
for (const text of [
  boundedReadRequest,
  "نفّذ قراءة واحدة فقط للملف package.json",
  "نفذ فحص package.json فقط، لا تعدل ملفات أو تشغل أوامر أو تغير صلاحيات.",
  "نفذ تحليل package.json ثم قدم تقريرًا.",
  "Run a single read-only inspection of package.json; do not modify files or execute commands.",
  "Execute an analysis of package.json; do not write files or run Terminal commands.",
  "Read package.json; لا تعدل ملفات، ولا تشغل Terminal أو تغير صلاحيات.",
  "اقرأ package.json لا تعدل ملفات أو تشغل أوامر أو تغير صلاحيات"
]) test(`inspection wrappers and coordinated prohibitions do not start planning: ${text}`, () => {
  assert.equal(requestsConversationExecution(text), false);
  for (const context of [base(), { ...base(), certifiedUnderstanding: { runId: "old-report", sequence: 1 } }]) {
    const before = JSON.stringify(context);
    const decision = resolveConversationIntent(text, context);
    assert.equal(decision.route, "INSPECTION");
    assert.equal(decision.inspectionPlanningObjective, undefined);
    assert.equal(JSON.stringify(context), before);
  }
});
for (const text of [
  "نفذ قراءة package.json ثم عدل الاسم",
  "اقرأ package.json ولا تعدل ملفات أو تشغل أوامر، لكن عدل الاسم",
  "اقرأ package.json لا تعدل ملفات. ثم شغل الاختبارات",
  "Run an inspection of package.json, then modify its name.",
  "Execute an analysis of package.json and run npm test.",
  "Read package.json; do not modify files or execute commands, but edit the name.",
  "نفذ الأمر cat package.json",
  "run node --version"
]) test(`positive changes and terminal requests remain distinct: ${text}`, () => {
  assert.equal(requestsConversationExecution(text), true);
  const context = { ...base(), workspace: { workspaceId: "w", bindingVersion: 1, runtimeId: "r", runtimeFingerprint: "f" } };
  assert.equal(resolveConversationIntent(text, context).route, text === "run node --version" ? "TERMINAL_PROPOSAL" : "PLANNING");
});
const base = (): ConversationWorkflowSummary => ({activeInspections:[],certifiedUnderstanding:null,latestPlan:null,execution:null,pendingApprovals:[],workspace:null});
for (const text of [
  "اختبار شات فقط: اسم الرمز الذي اخترته هو نيل-47. رد بكلمة «جاهز» فقط. لا تقرأ ملفات ولا تستخدم أدوات ولا تبدأ Agent Run.",
  "شات فقط، لا تبدأ Agent Run، رد بكلمة جاهز.",
  "Chat only: reply ready. Do not start an Agent Run.",
  "Just chat. Don't launch the Agent Run; reply ready.",
  "Never start an Agent Run or execute commands. Reply ready."
]) test(`prohibited start and its object are not positive execution intent: ${text}`, () => {
  assert.equal(requestsConversationExecution(text), false);
  for (const context of [base(), { ...base(), certifiedUnderstanding: { runId: "old-report", sequence: 1 } }]) {
    const before = JSON.stringify(context);
    assert.equal(resolveConversationIntent(text, context).route, "CONVERSATION");
    assert.equal(JSON.stringify(context), before);
  }
});
for (const text of [
  "Do not start an Agent Run, but edit the title.",
  "Don't launch the Agent Run; run npm test.",
  "لا تبدأ Agent Run، لكن عدل العنوان.",
  "لا تبدأ Agent Run. ثم شغل الاختبارات.",
  "Run an inspection of package.json, then modify its name."
]) test(`positive action after prohibited start retains planning: ${text}`, () => {
  assert.equal(requestsConversationExecution(text), true);
  assert.equal(resolveConversationIntent(text, base()).route, "PLANNING");
});
for (const text of [
  "بص على src/App.tsx وحده وقلّي المسارات اللي Routes بيربطها بكل صفحة. قراءة وتحليل بس؛ ممنوع تعديل الملفات أو تشغيل أوامر.",
  "شوف في src/App.tsx المسارات، ولا تعدّل أو تنفّذ.",
  "راجع src/App.tsx وقلّي الصفحات. ممنوع تعديل الملفات أو تشغيل أوامر.",
  "Summarize src/App.tsx; do not modify or execute anything.",
  "Look at src/App.tsx and explain its routes; do not execute or modify anything."
]) test(`file-analysis paraphrase retains inspection: ${text}`, () => {
  assert.equal(requestsConversationExecution(text), false);
  assert.equal(resolveConversationIntent(text, base()).route, "INSPECTION");
});
for (const text of [
  "اقرأ README.md فقط ولخّص هدف المشروع كما هو موضح فيه. افصل الحقائق عن الاستنتاجات، ولا تعدّل أو تنفّذ أي شيء.",
  "حلّل src/App.tsx فقط: ما الصفحات المسجلة في Routes؟ استشهد بالملف نفسه ولا تنفّذ أو تعدّل شيئًا."
]) test(`coordinated Arabic prohibitions retain inspection: ${text}`, () => {
  assert.equal(requestsConversationExecution(text), false);
  assert.equal(resolveConversationIntent(text, base()).route, "INSPECTION");
});
for (const text of ["بص على src/App.tsx؛ ممنوع تعديل الملفات أو تشغيل أوامر. ثم عدّل العنوان", "اقرأ README.md ولا تعدّل أو تنفّذ أي شيء. ثم عدّل العنوان", "اقرأ README.md ولا تنفّذ أو تعدّل شيئًا، لكن عدّل العنوان"]) test(`positive clause after prohibition remains planning: ${text}`, () => {
  assert.equal(requestsConversationExecution(text), true);
  assert.equal(resolveConversationIntent(text, base()).route, "PLANNING");
});
test("Arabic verbatim read with غير موجود routes to inspection, not planning", () => {
  const text = "اقرأ index.html بالكامل، وحلل محتواه من الملف نفسه. اذكر الـHero heading حرفيًا، ولا تخمّن أي شيء غير موجود في القراءة.";
  assert.equal(requestsConversationExecution(text), false);
  assert.equal(resolveConversationIntent(text, base()).route, "INSPECTION");
});
for (const text of ["غير موجود", "غير مذكور"]) test(`Arabic descriptive negation is not modification: ${text}`, () => {
  assert.equal(requestsConversationExecution(text), false);
  assert.equal(resolveConversationIntent(text, base()).route, "CONVERSATION");
});
test("positive Arabic change command retains planning intent", () => {
  const text = "غير العنوان في index.html إلى عنوان جديد";
  assert.equal(requestsConversationExecution(text), true);
  assert.equal(resolveConversationIntent(text, base()).route, "PLANNING");
});
test("read followed by a separate positive Arabic change command retains planning precedence", () => {
  for (const text of ["اقرأ index.html. غير العنوان إلى عنوان جديد", "اقرأ index.html ثم غير العنوان إلى عنوان جديد"]) {
    assert.equal(requestsConversationExecution(text), true);
    assert.equal(resolveConversationIntent(text, base()).route, "PLANNING");
  }
});
for (const [text,route] of [["Hello","CONVERSATION"],["Read index.html","INSPECTION"],["Create an engineering plan","PLANNING"],["execute plan","PLAN_EXECUTION"],["Can you see this workspace?","WORKSPACE"]]) test(text,()=>assert.equal(resolveConversationIntent(text,base()).route,route));
test("continue selects exactly one inspection",()=>{const c=base();c.activeInspections=[{runId:"run-a",state:"AWAITING_INPUT"}];assert.deepEqual(resolveConversationIntent("continue",c),{route:"INSPECTION_CONTINUATION",target:{runId:"run-a"},reason:"unique-active-inspection"});});
test("multiple matching inspections are ambiguous",()=>{const c=base();c.activeInspections=[{runId:"a",state:"UNDERSTANDING"},{runId:"b",state:"AWAITING_INPUT"}];assert.equal(resolveConversationIntent("continue",c).route,"AMBIGUOUS");});
test("unrelated chat stays conversational with pending work",()=>{const c=base();c.activeInspections=[{runId:"a",state:"UNDERSTANDING"}];c.pendingApprovals=[{runId:"b",approvalId:"approval-b"}];assert.equal(resolveConversationIntent("What is BGP?",c).route,"CONVERSATION");});
test("acknowledgment gives guidance, never approval",()=>{const c=base();c.pendingApprovals=[{runId:"a",approvalId:"approval-a"}];assert.equal(resolveConversationIntent("okay",c).route,"APPROVAL_GUIDANCE");assert.equal(resolveConversationIntent("approve",c).route,"APPROVAL_GUIDANCE");});
test("multiple approval targets are ambiguous",()=>{const c=base();c.pendingApprovals=[{runId:"a"},{runId:"b"}];assert.equal(resolveConversationIntent("okay",c).route,"AMBIGUOUS");});
test("certified source questions use understanding",()=>{const c=base();c.certifiedUnderstanding={runId:"a",sequence:1};assert.equal(resolveConversationIntent("Summarize the inspected files",c).route,"UNDERSTANDING");});
test("terminal or absent inspection cannot continue",()=>assert.equal(resolveConversationIntent("continue",base()).route,"UNAVAILABLE"));
test("resolver never mutates workflow state",()=>{const c=base();c.latestPlan={runId:"a",planId:"p",readiness:"PLAN_READY"};const before=JSON.stringify(c);resolveConversationIntent("execute plan",c);assert.equal(JSON.stringify(c),before);});

test("unique contextual approval targets its exact pending reference",()=>{const c=base();c.pendingApprovals=[{runId:"a",approvalId:"approval-a"}];assert.deepEqual(resolveConversationIntent("approve the pending proposal",c).target,{runId:"a",approvalId:"approval-a"});});
test("two approvals on one run remain ambiguous",()=>{const c=base();c.pendingApprovals=[{runId:"a",approvalId:"one"},{runId:"a",approvalId:"two"}];assert.equal(resolveConversationIntent("I approve the pending proposal",c).route,"AMBIGUOUS");});
test("follow-up resolves execution workflow uniquely",()=>{const c=base();c.execution={runId:"a",status:"COMPLETED"};const d=resolveConversationIntent("what happened to that proposal?",c);assert.equal(d.reason,"persisted-workflow-state");assert.equal(d.target?.runId,"a");});
test("multiple persisted proposal workflows are ambiguous",()=>{const c=base();c.workflows=[{runId:"a"},{runId:"b"}];assert.equal(resolveConversationIntent("what happened to that proposal?",c).route,"AMBIGUOUS");});
test("unknown proposal reference remains conversation",()=>assert.equal(resolveConversationIntent("what happened to that proposal?",base()).route,"CONVERSATION"));

test("legacy flags cannot override approval safety or ambiguity",()=>{const c=base();c.pendingApprovals=[{runId:"a",approvalId:"a"},{runId:"b",approvalId:"b"}];assert.equal(resolveConversationIntent("approve the pending proposal",c,{triggerAgent:true,transferToAgent:true}).route,"AMBIGUOUS");});
test("execute plan has an explicit resolver route",()=>assert.equal(resolveConversationIntent("execute plan",base(),{triggerAgent:true}).route,"PLAN_EXECUTION"));

test("bare نفذ without pending workflow remains non-executing", () => assert.equal(resolveConversationIntent("نفذ", base()).route, "CONVERSATION"));
test("bare نفذ resolves one pending workflow without execution", () => {
  const c = base(); c.eligiblePlans = [{ runId: "a", planId: "plan", planVersion: 4, digest: "digest" }];
  const before = structuredClone(c);
  assert.deepEqual(resolveConversationIntent("نفّذ", c), { route: "UNDERSTANDING", reason: "persisted-workflow-state", target: { runId: "a" } });
  assert.deepEqual(c, before);
});
test("bare نفذ deduplicates stages of one workflow and holds multiple targets", () => {
  const c = base(); c.pendingApprovals = [{ runId: "a", approvalId: "approval" }]; c.activeInspections = [{ runId: "a", state: "AWAITING_INPUT" }];
  assert.equal(resolveConversationIntent("نفذ", c).target?.runId, "a");
  c.activeInspections.push({ runId: "b", state: "UNDERSTANDING" });
  assert.equal(resolveConversationIntent("نفذ", c).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent("نفذ", { ...base(), truncated: true }).route, "AMBIGUOUS");
});
test("completed execution is not an eligible pending target for نفذ", () => {
  const c = base(); c.execution = { runId: "a", status: "COMPLETED" };
  assert.equal(resolveConversationIntent("نفذ", c).route, "CONVERSATION");
});

test("explicit plan handoff and agreement retain existing plan controls", () => {
  const c = base(); c.eligiblePlans = [{ runId: "a", planId: "plan", planVersion: 1, digest: "digest" }];
  for (const text of ["نفذ الخطة", "موافق"]) {
    assert.equal(resolveConversationIntent(text, c).route, "APPROVAL_GUIDANCE");
  }
});

test("continuation matrix uses durable context without changing it or granting authority", () => {
  const pending = base(); pending.pendingApprovals = [{ runId: "a", approvalId: "approval-a" }];
  const before = structuredClone(pending);
  for (const text of ["نفذ", "نفّذ", "نفذ؟"]) {
    assert.deepEqual(resolveConversationIntent(text, pending), { route: "UNDERSTANDING", reason: "persisted-workflow-state", target: { runId: "a" } });
  }
  for (const text of ["approve", "okay", "موافق"]) {
    assert.ok(["APPROVAL_GUIDANCE", "UNAVAILABLE"].includes(resolveConversationIntent(text, pending).route));
  }
  assert.deepEqual(pending, before);
});

for (const text of [
  "Read README.md and summarize it; do not modify or execute anything.",
  "Analyze src/App.tsx; do not execute or modify anything.",
  "اقرأ README.md ولا تعدّل أو تنفّذ أي شيء.",
  "حلّل src/App.tsx ولا تنفّذ أو تعدّل شيئًا."
]) test(`read-only semantic matrix preserves request and file scope: ${text}`, () => {
  const decision = resolveConversationIntent(text, base());
  assert.equal(decision.route, "INSPECTION");
  assert.equal(requestsConversationExecution(text), false);
});
