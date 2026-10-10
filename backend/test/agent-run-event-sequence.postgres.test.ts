import { AgentRunRecoveryService } from "../src/agent-runtime/recovery/agent-run-recovery.service";
import { AgentContextProjectionService } from "../src/agent-runtime/context-projection/agent-context-projection.service";
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { isolatedDatabaseUrl } from './helpers/isolated-database';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

it('PostgreSQL durable append serializes concurrent writers, isolates runs, rolls back counters and restores terminal state', { skip: process.env.SEKHEM_RUNTIME_DB_TEST !== '1' }, async () => {
  // Only a disposable test schema is touched; never application/runtime/workspace records.
  const url = isolatedDatabaseUrl();
  const db = new PrismaClient({ datasources: { db: { url } } });
  const schema = `event_seq_test_${randomUUID().replaceAll('-', '')}`;
  const scoped = (fn: (tx: any) => Promise<any>) => db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    return fn(tx);
  }, { timeout: 30000, maxWait: 30000 });
  let created = false;
  try {
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    await scoped(async tx => {
      await tx.$executeRawUnsafe('CREATE TABLE "AgentRun" ("id" TEXT PRIMARY KEY, "status" TEXT NOT NULL, "currentStepIndex" INTEGER NOT NULL DEFAULT 0, "planVersion" INTEGER NOT NULL DEFAULT 1, "failureReason" TEXT, "pausedAt" TIMESTAMP, "completedAt" TIMESTAMP, "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
      await tx.$executeRawUnsafe('CREATE TABLE "AgentRunEvent" ("id" TEXT PRIMARY KEY, "agentRunId" TEXT NOT NULL REFERENCES "AgentRun"("id"), "timestamp" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "actor" TEXT NOT NULL DEFAULT \'system\', "stepIndex" INTEGER DEFAULT 0, "eventType" TEXT NOT NULL DEFAULT \'STATUS_CHANGE\', "payload" JSONB NOT NULL DEFAULT \'{}\')');
      await tx.$executeRawUnsafe(`INSERT INTO "AgentRun" ("id","status") VALUES ('r','RUNNING'), ('s','COMPLETED')`);
      await tx.$executeRawUnsafe(`INSERT INTO "AgentRunEvent" ("id","agentRunId","timestamp") VALUES ('legacy-b','r','2020-01-01'), ('legacy-a','r','2020-01-01')`);
      const sql = readFileSync('prisma/migrations/20261004180000_agent_run_event_sequence/migration.sql', 'utf8').replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, '');
      for (const statement of sql.split('-- statement').map(x => x.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    });
    const append = (id: string, run: string) => scoped(tx => tx.$queryRawUnsafe('INSERT INTO "AgentRunEvent" ("id", "agentRunId", "timestamp", "seq") VALUES ($1,$2,$3,999) RETURNING "seq"', id, run, new Date(1)));
    const result = await Promise.all(Array.from({ length: 12 }, (_, i) => append(`new-${i}`, 'r')));
    assert.deepEqual(result.map(x => x[0].seq).sort((a,b) => a-b), Array.from({length:12}, (_,i) => i+3));
    assert.equal((await append('other', 's'))[0].seq, 1);
    await assert.rejects(scoped(async tx => { await tx.$executeRawUnsafe(`INSERT INTO "AgentRunEvent" ("id","agentRunId","timestamp") VALUES ('rollback','r',now())`); throw new Error('rollback'); }), /rollback/);
    assert.equal((await append('after-rollback', 'r'))[0].seq, 15);
    await assert.rejects(scoped(tx => tx.$executeRawUnsafe(`UPDATE "AgentRunEvent" SET "seq"=50 WHERE "id"='new-0'`)), /IMMUTABLE/);
    await scoped(tx => tx.$executeRawUnsafe(`UPDATE "AgentRun" SET "status"='COMPLETED' WHERE "id"='r'`));
    const restored: any = await scoped(tx => tx.$queryRawUnsafe(`SELECT * FROM "AgentRun" WHERE "id"='r'`));
    assert.equal(restored[0].eventSeq, 15); assert.equal(restored[0].eventTerminalSeq, 15);
    assert.equal((await append('trailing', 'r'))[0].seq, 16);
    const terminal: any = await scoped(tx => tx.$queryRawUnsafe(`SELECT * FROM "AgentRun" WHERE "id"='r'`));
    assert.equal(terminal[0].eventTerminalSeq, 16);
    await scoped(tx => tx.$executeRawUnsafe(`UPDATE "AgentRun" SET "status"='RUNNING' WHERE "id"='r'`));
    const resumed: any = await scoped(tx => tx.$queryRawUnsafe(`SELECT * FROM "AgentRun" WHERE "id"='r'`));
    assert.equal(resumed[0].eventTerminalSeq, null);
    const projectionUrl = new URL(url!); projectionUrl.searchParams.set('schema', schema);
    const reloadedClient = new PrismaClient({ datasources: { db: { url: projectionUrl.toString() } } });
    try {
      const projection = await new AgentContextProjectionService(reloadedClient as any).build('r', { cursor: 15 });
      assert.equal(projection.cursor, 15); assert.equal(projection.events.length, 15);
      assert.deepEqual(projection.events.map(e => e.seq), Array.from({length:15}, (_,i)=>i+1));
      assert.deepEqual(await new AgentContextProjectionService(reloadedClient as any).build('r', {cursor:15}), projection);
      const recovery = new AgentRunRecoveryService(reloadedClient as any, new AgentContextProjectionService(reloadedClient as any));
      let unlock!: () => void, acquired!: () => void;
      const release = new Promise<void>(r => { unlock = r; });
      const ready = new Promise<void>(r => { acquired = r; });
      const blocker = scoped(async tx => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', 'agent-run-recovery:r');
        acquired(); await release;
      });
      await ready;
      try { await assert.rejects(recovery.parkInterrupted('r'), /RECOVERY_BUSY/); }
      finally { unlock(); await blocker; }
      assert.equal(await recovery.parkInterrupted('r'), true);
      assert.equal(await recovery.parkInterrupted('r'), false);
      const restored = await recovery.snapshot('r', 16);
      assert.equal(restored.status, 'PAUSED'); assert.equal(restored.recoveryState, 'UNCERTAIN');
      assert.equal(restored.replay.events.length, 1); assert.equal(restored.replay.events[0].eventType, 'RECOVERY_REQUIRED');
      assert.equal(restored.replay.events[0].seq, 17);
      assert.deepEqual(await recovery.snapshot('r', 16), restored);

    } finally { await reloadedClient.$disconnect(); }

  } finally {
    if (created) await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  }
});
