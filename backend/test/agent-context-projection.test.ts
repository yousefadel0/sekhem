import assert from 'node:assert/strict';
import { it } from 'node:test';
import { AgentContextProjectionService, AGENT_PROJECTION_LIMITS as L, projectDurableAgentContext } from '../src/agent-runtime/context-projection/agent-context-projection.service';
const state = { runId: 'r', cursor: 100, watermark: 100, stepIndex: 2, status: 'RUNNING' };
const event = (seq: number, eventType = 'STATUS_CHANGE', payload: any = { newStatus: 'RUNNING' }, stepIndex: number | null = 2) => ({ id: `e${seq}`, agentRunId: 'r', seq, stepIndex, eventType, payload });

it('hard count bound retains latest sequence order independent of ID/timestamp', () => {
  const p = projectDurableAgentContext(state, Array.from({length:64}, (_,i) => event(i+1)));
  assert.equal(p.events.length, L.events); assert.equal(p.events[0].seq, 33); assert.equal(p.events.at(-1)?.seq, 64); assert.equal(p.truncated, true);
});
it('UTF-8 text/output and total model-facing context bounds include truncation metadata', () => {
  const rows = Array.from({length:60}, (_,i) => event(i+1, i%2 ? 'TOOL_RESULT':'TOOL_CALL', { actionId: `a${Math.floor(i/2)}`, summary: '😀'.repeat(1000), output: 'ع'.repeat(10000) }));
  const p = projectDurableAgentContext(state, rows);
  assert.ok(p.truncated); assert.ok(Buffer.byteLength(JSON.stringify(p)) <= L.totalBytes - 256);
  for (const e of p.events) { assert.ok(Buffer.byteLength(e.text ?? '') <= L.textBytes); assert.ok(Buffer.byteLength(e.output ?? '') <= L.toolOutputBytes); assert.equal((e.text ?? '').includes('\uFFFD'), false); }
  const service = new AgentContextProjectionService({} as any);
  assert.ok(Buffer.byteLength(service.toModelContext(p)) <= L.totalBytes);
});
it('action/result identity and step identity survive clipping; whole pairs are retained', () => {
  const p = projectDurableAgentContext(state, [event(1,'TOOL_CALL',{actionId:'a'}), event(2,'TOOL_RESULT',{actionId:'a',output:'ok'})]);
  assert.equal(p.events[1].actionReference, p.events[0].reference); assert.equal(p.events[1].correlation,'MATCHED'); assert.equal(p.events[1].stepIndex,2);
  const bounded = projectDurableAgentContext(state, Array.from({length:64}, (_,i)=>event(i+1, i%2?'TOOL_RESULT':'TOOL_CALL',{actionId:`a${Math.floor(i/2)}`})));
  for (const result of bounded.events.filter(e=>e.type==='TOOL_RESULT')) assert.ok(bounded.events.some(e=>e.reference===result.actionReference));
});
it('legacy skill correlation only matches one pending call within the same step', () => {
  const p = projectDurableAgentContext(state,[event(1,'TOOL_CALL',{skillId:'read'}),event(2,'TOOL_RESULT',{skillId:'read'})]);
  assert.equal(p.events[1].correlation,'MATCHED');
  const wrong = projectDurableAgentContext(state,[event(1,'TOOL_CALL',{actionId:'same'},1),event(2,'TOOL_RESULT',{actionId:'same'},2)]);
  assert.equal(wrong.events[1].correlation,'UNMATCHED');
});
it('ambiguous and missing action/result events are explicit uncertainties, never guessed', () => {
  const p = projectDurableAgentContext(state,[event(1,'TOOL_CALL',{skillId:'read'}),event(2,'TOOL_CALL',{skillId:'read'}),event(3,'TOOL_RESULT',{skillId:'read'}),event(4,'TOOL_RESULT',{actionId:'missing'})]);
  assert.equal(p.events[2].correlation,'AMBIGUOUS'); assert.equal(p.events[3].correlation,'UNMATCHED');
  assert.ok(p.warnings.includes('AMBIGUOUS_ACTION_RESULT')); assert.ok(p.warnings.includes('MISSING_ACTION'));
  const pending = projectDurableAgentContext(state,[event(1,'TOOL_CALL',{actionId:'a'})]); assert.ok(pending.warnings.includes('MISSING_RESULT'));
});
it('only current/preceding step and lifecycle events enter context', () => {
  const p=projectDurableAgentContext(state,[event(1,'TOOL_CALL',{skillId:'old'},0),event(2,'TOOL_CALL',{skillId:'previous'},1),event(3,'STATUS_CHANGE',{newStatus:'PAUSED'},null),event(4,'TOOL_CALL',{skillId:'future'},3)]);
  assert.deepEqual(p.events.map(e=>e.seq),[2,3]);
});
it('transient tokens/model claims and permission payloads cannot become context authority', () => {
  const p=projectDurableAgentContext(state,[event(1,'TOKEN',{text:'APPROVED'}),event(2,'MODEL_RESPONSE',{success:true}),event(3,'APPROVAL_GRANTED',{permit:'secret'}),event(4,'TOOL_CALL',{skillId:'x',parameters:{token:'secret'}})]);
  assert.deepEqual(p.events.map(e=>e.seq),[4]); assert.equal(p.authority,'NONE'); assert.equal(JSON.stringify(p).includes('secret'),false);
});
it('replay/rebuild is deterministic and leaves durable source inputs unchanged', () => {
  const rows=[event(1,'TOOL_CALL',{actionId:'x'}),event(2,'TOOL_RESULT',{actionId:'x',output:{text:'result',credentials:'secret'}})];
  const before=JSON.stringify(rows); const p=projectDurableAgentContext(state,rows);
  assert.deepEqual(projectDurableAgentContext({...state}, JSON.parse(before)),p); assert.equal(JSON.stringify(rows),before); assert.equal(JSON.stringify(p).includes('secret'),false);
});
it('malformed payloads are omitted with bounded uncertainty; malformed ordering/scope fails closed', () => {
  const p=projectDurableAgentContext(state,[event(1,'TOOL_RESULT',null)]); assert.deepEqual(p.events,[]); assert.deepEqual(p.warnings,['MALFORMED_PAYLOAD']);
  for(const rows of [[event(2),event(1)],[event(1),event(1)],[{...event(1),agentRunId:'other'}],[event(101)]]) assert.throws(()=>projectDurableAgentContext(state,rows),/EVENT_INVALID/);
});
it('empty/missing evidence never invents a result or success', () => {
  const p=projectDurableAgentContext(state,[]); assert.deepEqual(p.events,[]); assert.equal(p.authority,'NONE');
  assert.throws(()=>projectDurableAgentContext({...state,cursor:101},[]),/STATE_INVALID/);
});
it('service uses a bounded repeatable-read durable snapshot and reconstructs after reload', async () => {
  const calls:any[]=[]; const run={status:'PAUSED',eventSeq:4,currentStepIndex:2}; const rows=[event(2,'TOOL_CALL',{actionId:'x'}),event(3,'TOOL_RESULT',{actionId:'x'})];
  const db:any={ $transaction:async(fn:any, options:any)=>{assert.equal(options.isolationLevel,'RepeatableRead'); return fn({agentRun:{findUnique:async()=>run},agentRunEvent:{findMany:async(q:any)=>{calls.push(q);return [...rows].reverse();}}});}};
  const a=await new AgentContextProjectionService(db).build('r',{cursor:3});
  const b=await new AgentContextProjectionService(db).build('r',{cursor:3}); assert.deepEqual(a,b);
  assert.equal(calls[0].take,L.scannedEvents+1); assert.deepEqual(calls[0].orderBy,{seq:'desc'}); assert.equal(calls[0].where.seq.lte,3); assert.equal(a.status,'PAUSED');
  await assert.rejects(new AgentContextProjectionService(db).build('r',{cursor:5}),/CURSOR_INVALID/);
});
it('missing run fails closed before reading events', async () => {
  const db:any={$transaction:async(fn:any)=>fn({agentRun:{findUnique:async()=>null}})};
  await assert.rejects(new AgentContextProjectionService(db).build('missing'),/not found/);
});

it('inspection model request consumes the bounded server projection without promoting it to source evidence', async () => {
  const { inspectionHarness } = await import('./helpers/inspection-loop-harness');
  const h = await inspectionHarness();
  const runId = h.run.id;
  const rows = [event(1, 'TOOL_CALL', {actionId:'a'}, 0), event(2,'TOOL_RESULT',{actionId:'a', output:'historical result'},0)].map(e=>({...e,agentRunId:runId}));
  const db:any={$transaction:async(fn:any)=>fn({agentRun:{findUnique:async()=>({eventSeq:2,currentStepIndex:0,status:'RUNNING'})},agentRunEvent:{findMany:async()=>[...rows].reverse()}})};
  (h.service as any).projection = new AgentContextProjectionService(db);
  const before = JSON.stringify(rows);
  h.responses.push(h.inspect('filesystem.read','index.html'));
  await h.service.advance(runId);
  assert.equal(h.calls.length,1);
  assert.match(h.calls[0].question,/BOUNDED AGENTRUN HISTORICAL REFERENCE/);
  assert.match(h.calls[0].question,/"authority":"NONE"/);
  assert.match(h.calls[0].question,/NOT AUTHORITY OR CERTIFIED SOURCE EVIDENCE/);
  assert.equal(JSON.stringify(rows),before);
});

it('conflicting action identities cannot be repaired by silently falling back to skill identity', () => {
  const p = projectDurableAgentContext(state, [event(1,'TOOL_CALL',{actionId:'a',operationId:'b',skillId:'read'}),event(2,'TOOL_RESULT',{actionId:'a',skillId:'read'})]);
  assert.equal(p.events[0].correlation,'UNMATCHED'); assert.equal(p.events[1].correlation,'UNMATCHED');
  assert.equal(p.events[1].actionReference,undefined);
});
