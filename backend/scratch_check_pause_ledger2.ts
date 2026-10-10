import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // The actual id format is rt1_WORKFLOW_PAUSE_<digest>. Read it.
    const row = await prisma.auditEvent.findUnique({
      where: { id: 'rt1_WORKFLOW_PAUSE_7e61b3acd17e4a989736170b357cb3b1fabe9c2ee86e9e0982875d9306386b93' }
    });
    console.log('=== WORKFLOW_PAUSE row (by real id) ===');
    if (row) {
      const meta = row.metadata as any;
      console.log(JSON.stringify({ recordId: meta.recordId, revision: meta.revision, payload: meta.payload }, null, 2));
    } else {
      console.log('NOT FOUND');
    }

    // List ALL WORKFLOW_PAUSE records to see which runs have pause rows
    const allPauses = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger', metadata: { path: ['recordType'], equals: 'WORKFLOW_PAUSE' } },
      take: 20
    });
    console.log('\nAll WORKFLOW_PAUSE records:');
    for (const r of allPauses) {
      const meta = r.metadata as any;
      console.log(`- ${meta.recordId} rev=${meta.revision} state=${(meta.payload as any)?.state} resumeStatus=${(meta.payload as any)?.resumeStatus}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();