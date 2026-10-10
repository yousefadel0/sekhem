import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/[[...path]]/route";

for(const [path,content,deadline] of [
  ["conversations/conv/messages","اعمللي plan",310000],
  ["conversations/conv/messages","Generate the engineering plan",310000],
  ["conversations/conv/plans","",310000],
  ["conversations/conv/messages","hello",120000],
  ["conversations/conv/messages","حلل المشروع",120000],
  ["conversations/conv/messages","نفذ الخطة",120000],
  ["ai-gateway/assistant","اعمللي plan",120000],
] as const) test(`proxy deadline ${deadline} for ${path}: ${content}`,async t=>{
  t.mock.timers.enable({apis:["setTimeout"]});
  let signal:AbortSignal|undefined,calls=0;
  const body=JSON.stringify({content,timeoutMs:999999});
  t.mock.method(globalThis,"fetch",async(_url:any,init:any)=>{
    calls++;signal=init.signal;
    assert.equal(new TextDecoder().decode(init.body),body);
    assert.equal(init.headers.get("cookie"),"sekhem_session=test");
    return new Promise((_resolve,reject)=>signal!.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true}));
  });
  const promise=POST(new NextRequest(`http://localhost/api/${path}`,{method:"POST",headers:{"content-type":"application/json",cookie:"sekhem_session=test"},body}),{params:Promise.resolve({path:path.split("/")})});
  await setImmediate();assert.ok(signal);
  t.mock.timers.tick(deadline-1);assert.equal(signal.aborted,false);
  t.mock.timers.tick(1);
  const response=await promise;
  assert.equal(response.status,504);assert.equal(calls,1);
  assert.match((await response.json()).errors[0].message,new RegExp(`${deadline/1000}-second`));
});
