import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Find AGENT_INSPECTION ledger row for this run (id format rt1_AGENT_INSPECTION_<digest>)
    const rows = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger', metadata: { path: ['recordType'], equals: 'AGENT_INSPECTION' } },
      take: 20
    });
    console.log('=== AGENT_INSPECTION records ===');
    for (const r of rows) {
      const meta = r.metadata as any;
      const payload = meta.payload ?? {};
      if (payload.runId === 'run_1791329712492_akele') {
        console.log(`FOUND for our run: ${meta.recordId} rev=${meta.revision}`);
        console.log(JSON.stringify({ state: payload.state, iterations: payload.iterations, maxIterations: payload.maxIterations, current: payload.current ? { planVersion: payload.current.planVersion, tool: payload.current.action?.tool, relativePath: payload.current.action?.relativePath, state: payload.current.state } : null, planningContinuation: payload.planningContinuation }, null, 2));
      }
    }

    // Also check RUNTIME_PROPOSAL records for this run
    const proposals = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger', metadata: { path: ['recordType'], equals: 'RUNTIME_PROPOSAL' } },
      take: 50
    });
    console.log('\n=== RUNTIME_PROPOSAL records for our run ===');
    for (const r of proposals) {
      const meta = r.metadata as any;
      const p = meta.payload ?? {};
      if (p.runId === 'run_1791329712492_akele') {
        console.log(`${meta.recordId} rev=${meta.revision} proposalId=${p.proposalId} state=${p.state}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();