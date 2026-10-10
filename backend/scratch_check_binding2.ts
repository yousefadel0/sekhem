import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Find the workspace binding record and active pointer with correct module/action filters
    const rows = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger' },
      take: 1000
    });
    let count = 0;
    for (const r of rows) {
      const meta = r.metadata as any;
      if (!meta?.recordType) continue;
      count++;
      if (meta.recordType === 'active' || (meta.payload && meta.payload.workspaceId !== undefined && meta.recordType !== 'AGENT_INSPECTION')) {
        console.log(`type=${meta.recordType} id=${meta.recordId} rev=${meta.revision}`);
        console.log(' payload:', JSON.stringify(meta.payload).slice(0, 400));
      }
    }
    console.log('total ledger rows scanned:', count);
  } finally {
    await prisma.$disconnect();
  }
}
main();