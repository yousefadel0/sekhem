import assert from "node:assert/strict";
import { it } from "node:test";
import { createHash, generateKeyPairSync } from "node:crypto";
import { Server, utils } from "ssh2";
import { SshConnectionService } from "../src/ssh/ssh-connection.service";

const hostKey=generateKeyPairSync("rsa",{modulusLength:2048}).privateKey.export({type:"pkcs1",format:"pem"}).toString();
const userKey=generateKeyPairSync("rsa",{modulusLength:2048}).privateKey.export({type:"pkcs1",format:"pem"}).toString();
const host=utils.parseKey(hostKey);if(host instanceof Error)throw host;
const authorized=utils.parseKey(userKey);if(authorized instanceof Error)throw authorized;
const pin=`SHA256:${createHash("sha256").update(host.getPublicSSH()).digest("base64").replace(/=+$/,"")}`;

async function probe(fingerprint=pin,accept=true) {
  let sessions=0,authAttempts=0;
  const server=new Server({hostKeys:[hostKey]},client=>{
    client.on("error",()=>{});
    client.on("authentication",ctx=>{
      authAttempts++;
      if(accept && ctx.method==="publickey" && ctx.username==="operator" && ctx.key.data.equals(authorized.getPublicSSH()) && (!ctx.signature || authorized.verify(ctx.blob!,ctx.signature,ctx.hashAlgo)))ctx.accept();else ctx.reject();
    });
    client.on("session",(_accept,reject)=>{sessions++;reject();});
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const address=server.address();assert.ok(address&&typeof address!=="string");
    const key=Buffer.from(userKey);
    const result=await new SshConnectionService().validate({host:"127.0.0.1",port:address.port,username:"operator",hostFingerprint:fingerprint,credentialRef:"test",status:"REGISTERED"},{privateKey:key});
    assert.equal(key.every(b=>b===0),true);assert.equal(sessions,0);
    return {result,authAttempts};
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
it("loopback fixture authenticates pinned SSH handshake and opens no command/shell/file channel",async()=>{assert.equal((await probe()).result,"VERIFIED");});
it("changed SSH host key fails before authentication",async()=>{const p=await probe(`SHA256:${Buffer.alloc(32,1).toString("base64").replace(/=+$/,"")}`);assert.equal(p.result,"HOST_KEY_MISMATCH");assert.equal(p.authAttempts,0);});
it("rejected key authentication produces safe bounded classification",async()=>{assert.equal((await probe(pin,false)).result,"AUTHENTICATION_FAILED");});
