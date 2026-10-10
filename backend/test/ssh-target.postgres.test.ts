import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SshTargetService } from "../src/ssh/ssh-target.service";
import { isolatedDatabaseUrl } from "./helpers/isolated-database";

it("disposable PostgreSQL schema persists SSH revisions, fences concurrent updates, and rejects history mutation",{ skip: process.env.SEKHEM_RUNTIME_DB_TEST !== "1" },async()=>{
  const url=isolatedDatabaseUrl();
  const schema=`ssh_test_${randomUUID().replaceAll("-","")}`,admin=new PrismaClient({datasources:{db:{url}}});
  const scopedUrl=new URL(url);scopedUrl.searchParams.set("schema",schema);const db=new PrismaClient({datasources:{db:{url:scopedUrl.toString()}}});let created=false;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
    await admin.$transaction(async tx=>{
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe('CREATE TABLE "Project" ("id" TEXT PRIMARY KEY)');
      await tx.$executeRawUnsafe('INSERT INTO "Project" ("id") VALUES (\'p\')');
      const sql=readFileSync("prisma/migrations/20261005090000_ssh_target_registration/migration.sql","utf8").replace(/^BEGIN;\s*/,"").replace(/COMMIT;\s*$/,"");
      for(const statement of sql.split("-- statement").map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
    });
    const claims:any={sub:"u",sessionId:"s",organizationId:"org",role:"Admin",exp:Date.now()/1000+1000};
    // Only SSH models are queried through Prisma; project fixture is isolated and has no application attributes.
    const wrapped:any={$transaction:(fn:any,options:any)=>db.$transaction(tx=>fn(new Proxy(tx,{get:(t,p)=>p==="project"?{findUnique:async()=>({id:"p",organizationId:"org"})}:Reflect.get(t,p)})),options)};
    let connects=0;
    const service=()=>new SshTargetService(wrapped,{validateDurableSession:async()=>claims} as any,{assertAuthorized:async()=>{}} as any,{resolve:()=>({privateKey:Buffer.from("fixture")})} as any,{validate:async()=>{connects++;return "VERIFIED";}} as any);
    const configuration={host:"example.test",port:22,username:"operator",hostFingerprint:`SHA256:${createHash("sha256").update("fixture").digest("base64").replace(/=+$/,"")}`,credentialRef:"key",status:"REGISTERED"};
    const request={targetId:null,expectedVersion:0,requestId:"create",configuration,acknowledgement:"PIN_HOST_IDENTITY"};
    const initial=await service().configure("cookie","p",request);
    assert.deepEqual(await service().configure("cookie","p",request),initial);
    const updates=await Promise.allSettled([1,2].map(i=>service().configure("cookie","p",{...request,targetId:initial.targetId,expectedVersion:1,requestId:`update${i}`,configuration:{...configuration,port:2200+i}})));
    assert.equal(updates.filter(r=>r.status==="fulfilled").length,1);
    assert.equal(await db.sshTargetRevision.count(),2);
    assert.deepEqual((await service().read("cookie","p",initial.targetId,1)).revision,initial);
    await assert.rejects(db.sshTargetRevision.update({where:{targetId_version:{targetId:initial.targetId,version:1}},data:{digest:"tampered"}}),/immutable/);
    const input={expectedVersion:2,requestId:"check",acknowledgement:"VALIDATE_CONNECTION_ONLY"};
    const checks=await Promise.all([service().validate("cookie","p",initial.targetId,input),service().validate("cookie","p",initial.targetId,input)]);
    assert.equal(connects,1);assert.equal(await db.sshConnectionValidation.count(),1);
    const persisted=await service().validate("cookie","p",initial.targetId,input);assert.equal(persisted.status,"VERIFIED");assert.equal(checks.every(c=>c.id===persisted.id),true);
    await assert.rejects(db.sshConnectionValidation.update({where:{id:persisted.id},data:{status:"PENDING"}}),/transition invalid/);
    assert.equal((await service().read("cookie","p",initial.targetId)).validation!.id,persisted.id);
  } finally {await db.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect();}
});
