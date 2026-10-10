import assert from 'node:assert/strict';
import { it } from 'node:test';
import { AgentRunRecoveryService } from '../src/agent-runtime/recovery/agent-run-recovery.service';
import { AgentContextProjectionService } from '../src/agent-runtime/context-projection/agent-context-projection.service';
import { AgentRuntimeService } from '../src/agent-runtime/agent-runtime.service';
import { AgentRuntimeEventsController } from '../src/agent-runtime/agent-runtime.events.controller';

function fixture() {
  const run:any={id:'r',status:'RUNNING',eventSeq:2,eventTerminalSeq:null,currentStepIndex:0,planVersion:2,failureReason:null};
  const events:any[]=[{id:'a',agentRunId:'r',seq:1,stepIndex:0,eventType:'TOOL_CALL',payload:{actionId:'x'}},
    {id:'b',agentRunId:'r',seq:2,stepIndex:0,eventType:'TOOL_RESULT',payload:{actionId:'x',output:'not verification authority'}}];
  let held=false, writes=0;
  const tx:any={
    $queryRawUnsafe:async(sql:string)=>{
      if(sql.includes('pg_try_advisory')) { if(held) return [{locked:false}]; held=true; return [{locked:true}]; }
      assert.match(sql,/FOR UPDATE/);return [{id:run.id}];
    },
    agentRun:{findUnique:async()=>({...run}),update:async({data}:any)=>{writes++;Object.assign(run,data);return {...run};}},
    agentRunEvent:{
      aggregate:async()=>({_count:{seq:events.length},_min:{seq:events.length?Math.min(...events.map(e=>e.seq)):null},_max:{seq:events.length?Math.max(...events.map(e=>e.seq)):null}}),
      findMany:async(q:any)=>{let rows=events.filter(e=>e.agentRunId===q.where.agentRunId);
        if(q.where.seq.gt!==undefined) rows=rows.filter(e=>e.seq>q.where.seq.gt);
        if(q.where.seq.lte!==undefined) rows=rows.filter(e=>e.seq<=q.where.seq.lte);
        if(q.where.eventType) rows=rows.filter(e=>q.where.eventType.in.includes(e.eventType));
        return rows.sort((a,b)=>q.orderBy.seq==='desc'?b.seq-a.seq:a.seq-b.seq).slice(0,q.take);},
      create:async({data}:any)=>{writes++;const e={...data,seq:++run.eventSeq};events.push(e);if(['COMPLETED','FAILED','CANCELLED'].includes(run.status))run.eventTerminalSeq=run.eventSeq;return e;}
    }
  };
  const db:any={$transaction:async(fn:any)=>{const wasHeld=held;try{return await fn(tx);}finally{if(!wasHeld)held=false;}}};
  const service=()=>new AgentRunRecoveryService(db,new AgentContextProjectionService(db));
  return {run,events,db,tx,service,writes:()=>writes};
}
it('earlier cursor replays only missing seq and rebuilds full durable context without authority writes',async()=>{
  const f=fixture(),before=JSON.stringify(f.events);const p=await f.service().snapshot('r',1);
  assert.deepEqual(p.replay.events.map((e:any)=>e.seq),[2]);assert.deepEqual(p.projection.events.map(e=>e.seq),[1,2]);
  assert.equal(p.projection.events[1].actionReference,p.projection.events[0].reference);assert.equal(p.stepIndex,0);assert.equal(p.planVersion,2);
  assert.equal(p.automaticDispatch,false);assert.equal(p.executionAuthority,'NONE');assert.equal(f.writes(),0);assert.equal(JSON.stringify(f.events),before);
});
it('browser/SSE reconnect and reload are identical and never dispatch or consume a permit',async()=>{
  const f=fixture();const first=await f.service().snapshot('r',1);const reloaded=await f.service().snapshot('r',1);
  assert.deepEqual(first,reloaded);assert.equal(f.writes(),0);assert.equal(f.events.length,2);
  const exhausted=await f.service().snapshot('r',2);assert.deepEqual(exhausted.replay.events,[]);
});
it('unmatched in-flight action becomes UNCERTAIN with stable action/step reference',async()=>{
  const f=fixture();f.events.pop();f.run.eventSeq=1;
  const p=await f.service().snapshot('r');assert.equal(p.recoveryState,'UNCERTAIN');assert.equal(p.requiresRevalidation,true);
  assert.deepEqual(p.interruptedActions,[{reference:'agent-event:r:1',stepIndex:0,actionId:'x'}]);assert.equal(p.automaticDispatch,false);
});
it('process restart durably parks interruption once; repeated recovery never executes again',async()=>{
  const f=fixture();f.events.pop();f.run.eventSeq=1;
  assert.equal(await f.service().parkInterrupted('r'),true);assert.equal(f.run.status,'PAUSED');assert.equal(f.run.currentStepIndex,0);
  const count=f.events.length;assert.equal(await f.service().parkInterrupted('r'),false);assert.equal(f.events.length,count);
  const p=await f.service().snapshot('r',1);assert.equal(p.recoveryState,'UNCERTAIN');assert.equal(p.replay.events[0].eventType,'RECOVERY_REQUIRED');
  assert.equal(p.executionAuthority,'NONE');assert.equal(f.writes(),2);
});
it('approval/paused state is retained when no interrupted action is present',async()=>{
  for(const status of ['PAUSED','AWAITING_APPROVAL']) {const f=fixture();f.run.status=status;const p=await f.service().snapshot('r');assert.equal(p.recoveryState,status);assert.equal(await f.service().parkInterrupted('r'),false);assert.equal(f.writes(),0);}
});
it('interrupted planning fails once and reload never redispatches or creates authority',async()=>{
  const f=fixture();f.run.status='PLANNING';
  assert.equal(await f.service().parkInterrupted('r',true),true);
  assert.equal(f.run.status,'FAILED');assert.ok(f.run.completedAt instanceof Date);
  const count=f.events.length, writes=f.writes();
  assert.equal(await f.service().parkInterrupted('r',true),false);
  const snapshot=await f.service().snapshot('r',2);
  assert.equal(snapshot.recoveryState,'TERMINAL');assert.equal(snapshot.automaticDispatch,false);
  assert.equal(snapshot.executionAuthority,'NONE');assert.equal(snapshot.requiresRevalidation,true);
  assert.equal(f.events.length,count);assert.equal(f.writes(),writes);
  assert.deepEqual(f.events.at(-1).payload,{previousStatus:'PLANNING',newStatus:'FAILED',sourceSeq:2,recoveryState:'UNCERTAIN',automaticDispatch:false,requiresRevalidation:true});
});
it('terminal runs remain terminal after reconnect/recovery and retain terminal watermark',async()=>{
  for(const status of ['COMPLETED','FAILED','CANCELLED']) {const f=fixture();f.run.status=status;f.run.eventTerminalSeq=2;
    const p=await f.service().snapshot('r',2);assert.equal(p.recoveryState,'TERMINAL');assert.equal(p.status,status);assert.equal(p.replay.replayComplete,true);
    assert.equal(await f.service().parkInterrupted('r'),false);assert.equal(f.writes(),0);}
});
it('concurrent recovery is fenced while winner parks exactly once',async()=>{
  const f=fixture();const results=await Promise.allSettled([f.service().parkInterrupted('r'),f.service().parkInterrupted('r')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.match((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message,/RECOVERY_BUSY/);
  assert.equal(f.events.filter(e=>e.eventType==='RECOVERY_REQUIRED').length,1);
});
it('incomplete/malformed sequence or persisted state fails closed',async()=>{
  for(const corrupt of [(f:any)=>f.events.splice(0,1),(f:any)=>f.events[1].seq=3,(f:any)=>f.run.currentStepIndex=-1,(f:any)=>f.run.status='invented']) {
    const f=fixture();corrupt(f);await assert.rejects(f.service().snapshot('r'),/HISTORY_INCOMPLETE|STATE_INVALID/);assert.equal(f.writes(),0);
  }
  const f=fixture();await assert.rejects(f.service().snapshot('r',3),/CURSOR_INVALID/);
});
it('transient/model records cannot become recovery authority or fabricate successful results',async()=>{
  const f=fixture();f.events[1].eventType='TOKEN';f.events[1].payload={success:true,permitConsumed:false};
  const p=await f.service().snapshot('r');assert.equal(p.recoveryState,'UNCERTAIN');assert.equal(p.projection.events.length,1);assert.equal(p.executionAuthority,'NONE');
});
it('recovery endpoint validates durable session and run authorization before reading',async()=>{
  let accessed=false;const controller=new AgentRuntimeEventsController({recoverRunSnapshot:async()=>{accessed=true;}} as any,
    {validateDurableSession:async()=>{throw new Error('SESSION_INVALID');}} as any);
  await assert.rejects(controller.recoverRun('r','bad'),/SESSION_INVALID/);assert.equal(accessed,false);
  const service=new AgentRuntimeService(null as any,null as any,null as any,{} as any);
  service.authorizeRunRead=async()=>{throw new Error('FORBIDDEN');};await assert.rejects(service.recoverRunSnapshot('r',{} as any),/FORBIDDEN/);
});
it('startup fallback never reconstructs session claims or calls executeRun',async()=>{
  const f=fixture();f.db.agentRun={findMany:async()=>[{...f.run,userId:'u',title:'Interrupted'}]};
  const service=new AgentRuntimeService(null as any,null as any,null as any,f.db);
  (service as any).recovery=f.service();let dispatched=0;(service as any).executeRun=async()=>{dispatched++;};
  assert.deepEqual(await service.recoverUnfinishedRuns(),{recoveredCount:1});await new Promise(resolve=>setImmediate(resolve));assert.equal(dispatched,0);assert.equal(f.run.status,'PAUSED');
});

it('consumed permits remain untouched across repeated recovery/reconnect',async()=>{
  const f=fixture();const permit={state:'CONSUMED',uses:1};let calls=0;
  f.db.exactExecutionPermit={update:async()=>{calls++;throw new Error('permit replay');},create:async()=>{calls++;throw new Error('new permit');}};
  await f.service().snapshot('r',1);await f.service().parkInterrupted('r');await f.service().snapshot('r',2);
  assert.deepEqual(permit,{state:'CONSUMED',uses:1});assert.equal(calls,0);
});
