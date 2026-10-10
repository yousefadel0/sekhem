import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Latest run in acceptance conversation
    const runs = await prisma.agentRun.findMany({
      where: { conversationId: 'conv-1791336587788-pss3d9' },
      orderBy: { createdAt: 'desc' }
    });
    console.log('Runs:');
    for (const r of runs) console.log(`${r.id} status=${r.status} failureReason=${r.failureReason ?? '-'}`);

    if (!runs.length) return;
    const events = await prisma.agentRunEvent.findMany({
      where: { agentRunId: runs[0].id, eventType: 'MODEL_OUTPUT_DIAGNOSTIC' },
      orderBy: { seq: 'asc' }
    });
    console.log(`\nDiagnostics (${events.length}):`);
    for (const e of events) {
      const p = e.payload as any;
      console.log(`seq=${e.seq} codes=${JSON.stringify(p.codes)}`);
      if (p.validation?.issues?.length) {
        for (const i of p.validation.issues) console.log(`   - ${i.code} @ ${i.path} (${i.category})`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();