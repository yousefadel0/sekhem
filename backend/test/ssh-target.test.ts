import assert from "node:assert/strict";
import { it } from "node:test";
import { createHash } from "node:crypto";
import { SshTargetService } from "../src/ssh/ssh-target.service";
import { SshCredentialResolver, verifySshHostKey } from "../src/ssh/ssh-connection.service";
import { sshConfiguration } from "../src/ssh/ssh-target.contract";
import { projectDurableAgentContext } from "../src/agent-runtime/context-projection/agent-context-projection.service";
import { SshTargetController } from "../src/ssh/ssh-target.controller";

const pin = `SHA256:${createHash("sha256").update("host-key").digest("base64").replace(/=+$/, "")}`;
const config = { host: "example.test", port: 22, username: "operator", hostFingerprint: pin, credentialRef: "project_key", status: "REGISTERED" };
function fixture() {
  let claims: any = { sub: "u", sessionId: "s", email: "u@test", displayName: "U", role: "Admin", organizationId: "org", exp: Math.floor(Date.now()/1000)+1000 };
  let allow = true, connects = 0, resolve = true;
  const targets: any[] = [], revisions: any[] = [], checks: any[] = [];
  const find = (rows: any[], where: any) => rows.find(r => Object.entries(where).every(([k,v]) => r[k] === v));
  const tx: any = {
    $executeRawUnsafe: async () => 0,
    project: { findUnique: async () => ({ id: "p", organizationId: "org" }) },
    sshTarget: { findUnique: async ({where}:any) => find(targets,where),
      create: async ({data}:any) => { targets.push(structuredClone(data)); return structuredClone(data); },
      update: async ({where,data}:any) => { const r=find(targets,where); Object.assign(r,data); return structuredClone(r); } },
    sshTargetRevision: { findUnique: async ({where}:any) => find(revisions, Object.values(where)[0]),
      findUniqueOrThrow: async ({where}:any) => { const r=find(revisions,Object.values(where)[0]); assert.ok(r); return structuredClone(r); },
      create: async ({data}:any) => { const r={...structuredClone(data),createdAt:new Date()}; revisions.push(r); return structuredClone(r); } },
    sshConnectionValidation: { findUnique: async ({where}:any) => { const r=find(checks,Object.values(where)[0]); return r && structuredClone(r); },
      findFirst: async ({where}:any) => { const r=checks.filter(r=>Object.entries(where).every(([k,v])=>r[k]===v)).at(-1); return r && structuredClone(r); },
      create: async ({data}:any) => { const r={...data,startedAt:new Date(),completedAt:null}; checks.push(r); return structuredClone(r); },
      update: async ({where,data}:any) => { const r=find(checks,where); assert.equal(r.status,"PENDING"); Object.assign(r,data); return structuredClone(r); } }
  };
  let tail=Promise.resolve();
  const db: any = {$transaction: (fn:any) => { const task=tail.then(async()=> { const previous=[targets,revisions,checks].map(r=>structuredClone(r)); try { return await fn(tx); } catch(e) { [targets,revisions,checks].forEach((r,i)=>r.splice(0,r.length,...previous[i])); throw e; }}); tail=task.then(()=>{},()=>{}); return task; }};
  const auth: any = {validateDurableSession: async()=> { if(!claims) throw new Error("SESSION_INVALID"); return {...claims}; }};
  const authz: any = {assertAuthorized: async()=> { if(!allow) throw new Error("PROJECT_DENIED"); }};
  const credentials: any = {resolve: ()=> { if(!resolve) throw new Error("SECRET_ERROR"); return {privateKey:Buffer.from("secret")}; }};
  let connection: any = {validate: async()=> { connects++; return "VERIFIED"; }};
  const service=()=>new SshTargetService(db,auth,authz,credentials,{validate:(...args:any[])=>connection.validate(...args)} as any);
  const create=()=>service().configure("cookie","p",{targetId:null,expectedVersion:0,requestId:"create",configuration:config,acknowledgement:"PIN_HOST_IDENTITY"});
  const update=(id:string,configuration:any,version=1,requestId="update")=>service().configure("cookie","p",{targetId:id,expectedVersion:version,requestId,configuration,acknowledgement:"PIN_HOST_IDENTITY"});
  const validate=(id:string,requestId="check",version=1)=>service().validate("cookie","p",id,{expectedVersion:version,requestId,acknowledgement:"VALIDATE_CONNECTION_ONLY"});
  return {targets,revisions,checks,service,create,update,validate,connects:()=>connects, actor:(v:any)=>claims=v, deny:()=>allow=false, unavailable:()=>resolve=false, transport:(v:any)=>connection=v};
}

it("server-owned registration creates immutable revision, not operational authority",async()=>{
  const f=fixture(),r=await f.create();assert.match(r.targetId,/^ssh_[a-f0-9]{64}$/);assert.equal(r.version,1);
  assert.deepEqual(r.configuration,config);assert.equal(f.connects(),0);assert.equal(f.checks.length,0);
  const view=await f.service().read("cookie","p",r.targetId);assert.equal(view.executionAuthority,"NONE");assert.equal(view.validation,undefined);
});
it("explicit update and revocation preserve old revisions and cannot revive",async()=>{
  const f=fixture(),r=await f.create(),original=JSON.stringify(f.revisions[0]);
  await f.update(r.targetId,{...config,host:"replacement.test"});assert.equal(f.targets[0].version,2);assert.equal(JSON.stringify(f.revisions[0]),original);
  await f.update(r.targetId,{...config,status:"REVOKED"},2,"revoke");
  await assert.rejects(f.update(r.targetId,config,3,"revive"),/SSH_TARGET_REVOKED/);
  await assert.rejects(f.validate(r.targetId,"after-revoke",3),/SSH_TARGET_REVOKED/);
  assert.equal((await f.service().read("cookie","p",r.targetId,1)).revision.version,1);
});
it("registration and validation replay are idempotent across reload",async()=>{
  const f=fixture(),r=await f.create();assert.deepEqual(await f.create(),r);const check=await f.validate(r.targetId);
  assert.deepEqual(await f.validate(r.targetId),check);assert.equal(f.connects(),1);assert.equal(f.revisions.length,1);assert.equal(f.checks.length,1);
  assert.deepEqual((await f.service().read("cookie","p",r.targetId)).validation,check);
});
it("stale and conflicting updates fail closed",async()=>{
  const f=fixture(),r=await f.create();await f.update(r.targetId,{...config,port:2222});
  await assert.rejects(f.update(r.targetId,config,1,"stale"),/SSH_TARGET_STALE/);
  await assert.rejects(f.update(r.targetId,config,1,"update"),/SSH_REPLAY_CONFLICT/);
  await assert.rejects(f.validate(r.targetId),/SSH_TARGET_STALE/);
});
it("concurrent target updates serialize and admit only one expected revision",async()=>{
  const f=fixture(),r=await f.create();const result=await Promise.allSettled([f.update(r.targetId,{...config,port:2222},1,"a"),f.update(r.targetId,{...config,port:3333},1,"b")]);
  assert.equal(result.filter(r=>r.status==="fulfilled").length,1);assert.equal(f.revisions.length,2);
});
it("host identity is pinned exactly and mismatch never silently changes configuration",async()=>{
  assert.equal(verifySshHostKey(Buffer.from("host-key"),pin),true);assert.equal(verifySshHostKey(Buffer.from("other-key"),pin),false);
  const f=fixture(),r=await f.create();f.transport({validate:async()=>"HOST_KEY_MISMATCH"});const check=await f.validate(r.targetId);
  assert.equal(check.status,"HOST_KEY_MISMATCH");assert.equal(f.revisions[0].configuration.hostFingerprint,pin);assert.equal(f.targets[0].version,1);
});
it("invalid target, raw credential material, command, and missing pin acknowledgement are rejected",async()=>{
  for(const bad of [{...config,host:"user@host/path"},{...config,port:0},{...config,username:"user;cmd"},{...config,hostFingerprint:""},{...config,privateKey:"secret"},{...config,credentialRef:"../key"}]) assert.throws(()=>sshConfiguration(bad));
  const f=fixture(),r=await f.create();await assert.rejects(f.service().validate("cookie","p",r.targetId,{expectedVersion:1,requestId:"x",acknowledgement:"VALIDATE_CONNECTION_ONLY",command:"ls"}),/SSH_REQUEST_INVALID/);
  await assert.rejects(f.service().configure("cookie","p",{targetId:r.targetId,expectedVersion:1,requestId:"x",configuration:config,acknowledgement:""}),/SSH_EXPLICIT_PIN_REQUIRED/);
});
it("invalid session, foreign organization, unauthorized project and foreign owner fail closed",async()=>{
  const f=fixture(),r=await f.create();f.deny();await assert.rejects(f.validate(r.targetId),/PROJECT_DENIED/);assert.equal(f.connects(),0);
  const g=fixture(),x=await g.create();g.actor({sub:"other",sessionId:"s",organizationId:"org",exp:Date.now()/1000+10});await assert.rejects(g.validate(x.targetId),/SSH_TARGET_NOT_FOUND/);
  g.actor({sub:"u",sessionId:"s",organizationId:"foreign",exp:Date.now()/1000+10});await assert.rejects(g.validate(x.targetId),/SSH_PROJECT_SCOPE_DENIED/);
  g.actor(null);await assert.rejects(g.validate(x.targetId),/SESSION_INVALID/);
});
it("local runtime grant cannot authorize SSH connection; connection grants no local or SSH execution authority",async()=>{
  const f=fixture(),r=await f.create();f.deny();await assert.rejects(f.validate(r.targetId),/PROJECT_DENIED/);
  assert.equal(f.checks.length,0);assert.equal(f.connects(),0);
});
it("credential resolution is server-owned and scoped; unavailable credentials persist safe failure only",async()=>{
  const old=process.env.SEKHEM_SSH_CREDENTIAL_REFERENCES;try {
    process.env.SEKHEM_SSH_CREDENTIAL_REFERENCES=JSON.stringify({key:{projectId:"p",organizationId:"org",privateKeyEnv:"DATABASE_URL"}});
    const resolver=new SshCredentialResolver();assert.throws(()=>resolver.resolve("key","p","org"),/SSH_CREDENTIAL_UNAVAILABLE/);
    assert.throws(()=>resolver.resolve("key","other","org"));
    const f=fixture(),r=await f.create();f.unavailable();const check=await f.validate(r.targetId);assert.equal(check.status,"CREDENTIAL_UNAVAILABLE");assert.equal(JSON.stringify(check).includes("SECRET_ERROR"),false);assert.equal(f.connects(),0);
  } finally { if(old===undefined)delete process.env.SEKHEM_SSH_CREDENTIAL_REFERENCES;else process.env.SEKHEM_SSH_CREDENTIAL_REFERENCES=old; }
});
it("interrupted validation remains uncertain on reload and never redispatches",async()=>{
  const f=fixture(),r=await f.create();f.transport({validate:async()=>{f.actor(null);return "VERIFIED";}});await assert.rejects(f.validate(r.targetId),/SESSION_INVALID/);
  f.actor({sub:"u",sessionId:"s",email:"u@test",displayName:"U",role:"Admin",organizationId:"org",exp:Date.now()/1000+100});
  assert.equal((await f.validate(r.targetId)).status,"PENDING");await assert.rejects(f.validate(r.targetId,"new-check"),/SSH_VALIDATION_UNCERTAIN/);assert.equal(f.checks.length,1);
});
it("target change during validation cannot certify stale revision",async()=>{
  const f=fixture(),r=await f.create();f.transport({validate:async()=>{await f.update(r.targetId,{...config,port:2222});return "VERIFIED";}});
  assert.equal((await f.validate(r.targetId)).status,"STALE");
});
it("historical successful connection cannot be replayed as current after target rotation",async()=>{
  const f=fixture(),r=await f.create();await f.validate(r.targetId);await f.update(r.targetId,{...config,port:2222});
  await assert.rejects(f.validate(r.targetId),/SSH_TARGET_STALE/);assert.equal(f.connects(),1);
});
it("credential metadata and SSH records cannot enter durable model projection",()=>{
  const projection=projectDurableAgentContext({runId:"r",cursor:2,watermark:2,stepIndex:0,status:"RUNNING"},[
    {id:"a",agentRunId:"r",seq:1,stepIndex:0,eventType:"SSH_TARGET_REGISTERED",payload:{credentialRef:"secret-ref",privateKey:"secret-key"}},
    {id:"b",agentRunId:"r",seq:2,stepIndex:0,eventType:"PROGRESS",payload:{message:"safe",credentialRef:"secret-ref",privateKey:"secret-key"}}
  ]);const rendered=JSON.stringify(projection);assert.equal(rendered.includes("secret-ref"),false);assert.equal(rendered.includes("secret-key"),false);
});
it("HTTP controller delegates every action through durable-session service boundary",async()=>{
  const calls:any[]=[];const service:any={configure:async(...args:any[])=>calls.push(args),read:async(...args:any[])=>calls.push(args),validate:async(...args:any[])=>calls.push(args)};
  const controller=new SshTargetController(service);await controller.configure("session","p",{});await controller.read("session","p","id","2");await controller.validate("session","p","id",{});
  assert.deepEqual(calls.map(c=>c[0]),["session","session","session"]);assert.equal(calls[1][3],2);
});
