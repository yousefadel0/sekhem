import 'reflect-metadata';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Test } from '@nestjs/testing';
import { ProjectAccessService } from '../src/auth/project-access.service';
import { AuthService } from '../src/auth/auth.service';
import type { SessionClaims } from '../src/auth/auth.dto';
import { mapProjectSummary, mapProjectPhase, mapProjectPlatform, mapModulePhase } from '../src/data-access/product-mappers';
import { ProductController } from '../src/product.controller';
import { ProductService } from '../src/product.service';
import { ProductWriteService } from '../src/product-write.service';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';

it('all five roles create personal projects that satisfy the existing read mapper', async () => {
  for (const role of ['Admin','PM','Security Reviewer','Technical Reviewer','Viewer'] as const) {
    const claims: SessionClaims = {sub:'fixture-owner',sessionId:'fixture-session',email:'fixture@example.test',displayName:'Fixture',role,organizationId:'fixture-org',exp:Math.floor(Date.now()/1000)+60};
    const tx = {user:{findUnique:async()=>({status:'active',organizationId:'fixture-org'})},project:{create:async({data}: {data: Record<string, unknown>})=>({...data,createdAt:new Date(),updatedAt:new Date()})}};
    const service = new ProjectAccessService({$transaction:async(fn: (transaction: typeof tx)=>unknown)=>fn(tx)} as never, {} as never);
    const created = await service.createPersonal(claims,{name:'Private fixture'});
    const mapped = mapProjectSummary(created as never);
    assert.equal(mapped.phase,'development');assert.equal(mapped.platform,'personal');
    assert.equal(created.personalOwnerId,claims.sub);
    assert.deepEqual(created.members,{create:{userId:claims.sub,role}});
  }
});

it('unknown project values and development module phase remain rejected', () => {
  assert.throws(()=>mapProjectPhase('unrecognized-phase'),/Invalid Project phase/);
  assert.throws(()=>mapProjectPlatform('unrecognized-platform'),/Invalid Project platform/);
  assert.throws(()=>mapModulePhase('development'),/Invalid Module phase/);
  assert.equal(mapProjectPhase('phase_1_activation'),'phase_1_activation');
  assert.equal(mapProjectPlatform('SONiC'),'SONiC');
});

it('dashboard HTTP waits for async data and contains rejection without losing the listener', async () => {
  let reject = true, authorizationChecks = 0;
  const module = await Test.createTestingModule({controllers:[ProductController],providers:[
    {provide:ProductService,useValue:{getDashboard:async()=>{if(reject)throw new Error('private fixture rejection');return {project:{id:'fixture'}};},health:()=>({status:'ok'})}},
    {provide:ProductWriteService,useValue:{}},
    {provide:AuthService,useValue:{validateDurableSession:async()=>({sub:'fixture-owner',role:'Viewer'})}},
    {provide:ProjectAccessService,useValue:{assert:async()=>{authorizationChecks++;}}}
  ]}).compile();
  const app=module.createNestApplication({logger:false});app.setGlobalPrefix('api');app.useGlobalFilters(new ApiExceptionFilter());
  try {
    await app.listen(0,'127.0.0.1');const address=app.getHttpServer().address();const url=`http://127.0.0.1:${address.port}/api`;
    const failure=await fetch(`${url}/projects/fixture/dashboard`);assert.equal(failure.status,500);
    const body=await failure.json();assert.equal(body.data,null);assert.equal(body.errors[0].code,'INTERNAL_SERVER_ERROR');assert.equal(JSON.stringify(body).includes('private fixture rejection'),false);
    assert.equal((await fetch(`${url}/health`)).status,200);
    reject=false;const success=await fetch(`${url}/projects/fixture/dashboard`);assert.equal(success.status,200);
    assert.deepEqual((await success.json()).data,{project:{id:'fixture'}});assert.equal(authorizationChecks,2);
  } finally {await app.close();}
});
