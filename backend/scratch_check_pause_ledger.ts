import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // WORKFLOW_PAUSE ledger row for the paused run
    const pauseRow = await prisma.auditEvent.findUnique({
      where: { id: 'WORKFLOW_PAUSE:run_1791329712492_akele' }
    });
    console.log('=== WORKFLOW_PAUSE ledger row ===');
    console.log(pauseRow ? JSON.stringify({ id: pauseRow.id, revision: (pauseRow.metadata as any)?.revision, payload: (pauseRow.metadata as any)?.payload }, null, 2) : 'NOT FOUND');

    // Also check RUNTIME_REVISION rows for it
    const revisions = await prisma.auditEvent.findMany({
      where: { action: { startsWith: 'RUNTIME_REVISION:' } },
      take: 5
    });
    console.log('\nSample RUNTIME_REVISION actions:', revisions.map(r => r.action).slice(0, 3));

    // Check how runtimeKey builds ids — look at a known WORKFLOW_PAUSE row pattern
    const anyPause = await prisma.auditEvent.findFirst({
      where: { actor: 'runtime-ledger', metadata: { path: ['recordType'], equals: 'WORKFLOW_PAUSE' } }
    });
    console.log('\nAny WORKFLOW_PAUSE record found by metadata:', anyPause ? anyPause.id : 'NONE');
  } finally {
    await prisma.$disconnect();
  }
}
main();