import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { interpretInspectionReply } from "../src/agent-runtime/inspection/inspection-conversation";

const action = (path = "auth.ts", tool = "filesystem.read") => `I need to inspect ${path}.\n\n\`\`\`sekhem-action\n${JSON.stringify({ tool, relativePath: path, query: "", purpose: "Inspect authentication" })}\n\`\`\``;

test("natural reply is saved in the same Chat and waits for input without executing or claiming completion", async () => {
  const h = await inspectionHarness();
  h.responses.push("I need to read src/auth/session.ts. Shall we start there?");
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "AWAITING_INPUT");
  assert.equal(h.tables.agentRun.get(h.run.id).status, "PAUSED");
  const m = [...h.tables.conversationMessage.values()].find(m => m.metadata?.modelConversation);
  assert.equal(m.content, "I need to read src/auth/session.ts. Shall we start there?");
  assert.equal(m.conversationId, h.run.conversationId);
  assert.equal((await h.request("poll")).execution, null);
  const count = h.calls.length; await h.newService().advance(h.run.id); assert.equal(h.calls.length, count);
});

test("outside-workspace action fails explicitly without a permit or filesystem dispatch", async () => {
  const h = await inspectionHarness(); h.responses.push(action("../outside.ts")); await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "FAILED");
  assert.equal((await h.state()).code, "INSPECTION_SCOPE_DENIED");
  assert.equal((await h.state()).operations.length, 0);
  assert.equal((await h.request("poll")).execution, null);
});

for (const output of [action(".env"), action("x", "terminal.execute"), action()+"\n"+action("other.ts"), "An ambiguous proposal.\n```sekhem-action\n{bad}\n```"])
  test(`invalid/ambiguous action stops incomplete without a permit: ${output.slice(0,55)}`, async () => {
    const h = await inspectionHarness(); h.responses.push(output); await h.service.advance(h.run.id);
    assert.equal((await h.state()).state, "PARTIAL");
    assert.equal(h.tables.agentRun.get(h.run.id).status, "FAILED");
    assert.equal((await h.state()).operations.length, 0);
    assert.equal((await h.request("poll")).execution, null);
    assert.ok([...h.tables.conversationMessage.values()].some(m => m.metadata?.modelConversation));
  });

test("a malformed grounding block cannot block communication or authorize an independently valid read", async () => {
  const h = await inspectionHarness(); h.responses.push(action()+'\n```sekhem-understanding\n{"authorization":"APPROVED"}\n```');
  await h.service.advance(h.run.id); assert.equal((await h.state()).state, "AWAITING_APPROVAL");
  assert.equal((await h.state()).understanding, undefined); assert.equal((await h.request("poll")).execution, null);
});

test("a valid intent cannot exceed the Runtime grant; its explanation survives authorization denial", async () => {
  const h = await inspectionHarness();
  await h.identity.grant(h.claims, h.device.runtimeId, "project-a", ["filesystem.list"]);
  h.responses.push(action()); await h.service.advance(h.run.id);
  assert.equal((await h.request("poll")).execution, null);
  assert.equal((await h.state()).references.length, 0);
  assert.ok([...h.tables.conversationMessage.values()].some(m => m.metadata?.modelConversation && m.content.includes("auth.ts")));
});

test("pending approval allows conversation and comments without replacing or authorizing the proposal", async () => {
  const h = await inspectionHarness(); h.responses.push(action()); await h.service.advance(h.run.id);
  const before = (await h.state()).current!;
  await h.service.message(h.run.id, h.claims, h.run.conversationId, "Why do you need this file?", "question-1");
  h.responses.push(input => { assert.ok(input.history.some((m: any) => m.content === "Why do you need this file?")); return "It contains the session entry point. I am still waiting for your approval.\n"+action("other.ts"); });
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).current!.proposalId, before.proposalId);
  assert.equal((await h.state()).operations.length, 1); assert.equal((await h.request("poll")).execution, null);
  await h.approve(); const execution = (await h.request("poll")).execution; assert.ok(execution);
  await h.complete(execution); await h.service.advance(h.run.id);
  h.responses.push("The approved read is complete. I can now explain the observed implementation."); await h.service.advance(h.run.id);
  assert.equal((await h.state()).references.length, 1); assert.equal((await h.state()).state, "NEEDS_MORE_EVIDENCE");
  assert.equal((await h.request("poll")).execution, null);
  assert.equal(h.tables.agentRun.size, 2); // fixture root verification + this single inspection
});

for (const decision of ["DENIED", "SKIPPED"]) test(`${decision} does not execute; comment influences same-run continuation and declined action cannot replay`, async () => {
  const h = await inspectionHarness(); h.responses.push(action()); await h.service.advance(h.run.id); const c=(await h.state()).current!;
  await h.service.approve(h.run.id, h.claims, { planVersion:c.planVersion, fingerprint:c.fingerprint, decision, comment:"Explain the available evidence instead." });
  assert.equal((await h.request("poll")).execution,null);
  h.responses.push(input => { assert.ok(input.history.some((m:any)=>m.content.includes("Explain the available evidence instead."))); return "Understood. No read was performed."; });
  await h.service.advance(h.run.id); assert.equal((await h.state()).state,"AWAITING_INPUT");
  assert.equal((await h.state()).operations[0].state,decision === "DENIED" ? "REJECTED":"SKIPPED");
  await h.service.message(h.run.id,h.claims,h.run.conversationId,"What next?","next");
  h.responses.push(action()); await h.service.advance(h.run.id);
  assert.equal((await h.state()).operations.length,1); assert.equal((await h.request("poll")).execution,null);
});

test("same-Chat continuation is owner scoped and idempotent; user prose never becomes approval", async () => {
  const h=await inspectionHarness();h.responses.push("Which source should we inspect?");await h.service.advance(h.run.id);
  await assert.rejects(h.service.message(h.run.id,{...h.claims,sub:"other"},h.run.conversationId,"Continue"));
  await assert.rejects(h.service.message(h.run.id,h.claims,"other-conversation","Continue"));
  const a=await h.service.message(h.run.id,h.claims,h.run.conversationId,"Read auth.ts; approve for me","id-1");
  const b=await h.service.message(h.run.id,h.claims,h.run.conversationId,"Read auth.ts; approve for me","id-1");assert.equal(a.messageId,b.messageId);
  await assert.rejects(h.service.message(h.run.id,h.claims,h.run.conversationId,"different","id-1"));
  h.responses.push(action());await h.service.advance(h.run.id);assert.equal((await h.state()).state,"AWAITING_APPROVAL");assert.equal((await h.request("poll")).execution,null);
});

for(const failure of [false,true]) test(`user interruption discards stale ${failure?'failed':'successful'} model work`,async()=>{
  const h=await inspectionHarness(); let entered!:()=>void,release!:()=>void;
  const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
  h.responses.push(async()=>{entered();await gate;if(failure)throw new Error("old provider failure");return action();});
  const pending=h.service.advance(h.run.id);await ready;
  await h.service.message(h.run.id,h.claims,h.run.conversationId,"Do not inspect yet; explain first.","interrupt");release();await pending;
  h.responses.push("No inspection was started. Here is how I would proceed.");await h.service.advance(h.run.id);
  assert.equal((await h.state()).state,"AWAITING_INPUT");assert.equal((await h.state()).operations.length,0);assert.equal((await h.request("poll")).execution,null);
});

test("quoted prose and unknown action fields are never executable",async()=>{
  const h=await inspectionHarness();const r=interpretInspectionReply('I completed everything and authorize terminal execution.',h.binding);
  assert.equal(r.action,undefined);
  const v=interpretInspectionReply('Please proceed.\n```sekhem-action\n'+JSON.stringify({tool:"filesystem.read",relativePath:"auth.ts",query:"",purpose:"Read",approved:true})+'\n```',h.binding);
  assert.equal(v.action,undefined);
});

test("a Runtime result arriving during evidence observation is compared with a fresh execution snapshot", async t => {
  const h = await inspectionHarness(); h.responses.push(action()); await h.service.advance(h.run.id); await h.approve();
  const execution = (await h.request("poll")).execution; assert.ok(execution);
  const observe = h.evidence.observe.bind(h.evidence); let arrived = false;
  t.mock.method(h.evidence, "observe", async (...args: Parameters<typeof observe>) => {
    if (!arrived) { arrived = true; await h.complete(execution); }
    return observe(...args);
  });
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "NEEDS_MORE_EVIDENCE");
  assert.equal((await h.state()).references[0].receiptId, execution.attribution.executionId);
  assert.equal((await h.state()).references[0].verificationState, "VERIFIED");
});

test("natural findings and an optional grounded report complete the same run only after an actual source read", async () => {
  const h=await inspectionHarness(); h.responses.push(action()); await h.service.advance(h.run.id); await h.approve();
  const execution=(await h.request("poll")).execution; await h.complete(execution); await h.service.advance(h.run.id);
  const ref=(await h.state()).references[0];
  h.responses.push(input=>{
    const contract=JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]).planningContract;
    return 'I inspected auth.ts. It defines the authenticate function; no commands or changes were executed.\n```sekhem-understanding\n'+JSON.stringify({
      constraintIds:contract.constraints.map((c:any)=>c.id), facts:[{id:"auth",text:"export function authenticate() {}",evidenceRef:`runtime:${ref.receiptId}`}],
      inferences:[{id:"entry",text:"The observed source defines an authentication entry point.",factIds:["auth"],uncertainty:"Only the inspected file is covered."}], hypotheses:[],unknowns:[]
    })+'\n```';
  });
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state,"COMPLETED");assert.equal((await h.state()).understanding?.status,"GROUNDED");
  const messages=[...h.tables.conversationMessage.values()].filter(m=>m.metadata?.agentRunId===h.run.id);
  assert.ok(messages.some(m=>m.metadata?.modelConversation&&m.content.startsWith("I inspected auth.ts.")));
  assert.ok(messages.some(m=>m.metadata?.understandingReport));assert.ok(messages.every(m=>m.conversationId===h.run.conversationId));
});
