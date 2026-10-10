import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Check current active binding version vs what the inspection loop expects (44)
    const rows = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger', metadata: { path: ['recordType'], equals: 'active' } },
      take: 10
    });
    console.log('Active binding pointers:');
    for (const r of rows) {
      const meta = r.metadata as any;
      console.log(JSON.stringify({ id: meta.recordId, payload: meta.payload }, null, 2));
    }

    // The binding used by run_1791336809140_hjquc — find its AGENT_INSPECTION row
    const inspections = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger', metadata: { path: ['recordType'], equals: 'AGENT_INSPECTION' } },
      take: 200
    });
    for (const r of inspections) {
      const meta = r.metadata as any;
      const p = meta.payload ?? {};
      if (p.runId === 'run_1791336809140_hjquc') {
        console.log('\nInspection loop for test-4 run:', JSON.stringify({
          recordId: meta.recordId, revision: meta.revision, state: p.state,
          binding: p.binding ? { workspaceId: p.binding.workspaceId, version: p.binding.version, runtimeId: p.binding.runtimeId } : null
        }, null, 2));
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();