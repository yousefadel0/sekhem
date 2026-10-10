import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';

it('generated initiative models/enums match the existing initiative migration, retaining dashboard Initiative', () => {
  const migration = readFileSync('prisma/migrations/20260920000000_add_agent_initiative_runtime/migration.sql', 'utf8');
  const names = ['AgentInitiative', 'AgentInitiativeVersion', 'AgentInitiativePlan', 'AgentInitiativeTask', 'AgentInitiativeDecision'];
  for (const name of names) {
    const model = Prisma.dmmf.datamodel.models.find(m => m.name === name);
    assert.ok(model, `Missing generated ${name}`);
    const table = migration.match(new RegExp(`CREATE TABLE "${name}" \\(([\\s\\S]*?)\\n\\);`))![1];
    const columns = Array.from(table.matchAll(/^\s+"([^"]+)" (TEXT|JSONB|INTEGER|TIMESTAMP\(3\)|"AgentInitiative[^" ]+")( NOT NULL)?/gm));
    assert.deepEqual(model.fields.filter(f => f.kind !== 'object').map(f => f.name).sort(), columns.map(c => c[1]).sort());
    for (const column of columns) {
      const field = model.fields.find(f => f.name === column[1])!;
      const type = { TEXT: 'String', JSONB: 'Json', INTEGER: 'Int', 'TIMESTAMP(3)': 'DateTime' }[column[2]] ?? column[2].replaceAll('"', '');
      assert.equal(field.type, type); assert.equal(field.isRequired, !!column[3]);
    }
  }
  for (const match of migration.matchAll(/CREATE TYPE "([^"]+)" AS ENUM \(([^;]+)\);/g)) {
    assert.deepEqual(Prisma.dmmf.datamodel.enums.find(e => e.name === match[1])?.values.map(v => v.name), Array.from(match[2].matchAll(/'([^']+)'/g)).map(m => m[1]));
  }
  assert.ok(Prisma.dmmf.datamodel.models.some(m => m.name === 'Initiative'));
});
it('generated client exposes initiative delegates and event sequencing fields together, without connecting to data', async () => {
  const client = new PrismaClient();
  try {
    for (const delegate of [client.agentInitiative, client.agentInitiativeVersion, client.agentInitiativePlan, client.agentInitiativeTask, client.agentInitiativeDecision]) assert.ok(delegate);
    assert.ok(Prisma.dmmf.datamodel.models.find(m => m.name === 'AgentRun')?.fields.some(f => f.name === 'eventSeq'));
    const event = Prisma.dmmf.datamodel.models.find(m => m.name === 'AgentRunEvent')!;
    assert.deepEqual(event.uniqueFields, [['agentRunId', 'seq']]);
  } finally { await client.$disconnect(); }
});
