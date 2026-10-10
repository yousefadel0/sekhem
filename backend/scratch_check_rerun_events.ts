import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Latest run in this conversation (the retry)
    const runs = await prisma.agentRun.findMany({
      where: { conversationId: 'conv-1791334966115-eqmjez' },
      orderBy: { createdAt: 'desc' }
    });
    console.log('Runs:');
    for (const r of runs) console.log(`${r.id} status=${r.status} failureReason=${r.failureReason}`);

    const latest = runs[0];
    if (!latest) return;
    const events = await prisma.agentRunEvent.findMany({
      where: { agentRunId: latest.id, eventType: { in: ['MODEL_OUTPUT_DIAGNOSTIC', 'INSPECTION_STATE_CHANGED'] } },
      orderBy: { seq: 'asc' }
    });
    console.log(`\nKey events for ${latest.id}:`);
    for (const e of events) {
      const p = e.payload as any;
      if (e.eventType === 'MODEL_OUTPUT_DIAGNOSTIC') {
        console.log(`seq=${e.seq} MODEL_OUTPUT_DIAGNOSTIC codes=${JSON.stringify(p.codes)}`);
        if (p.validation) {
          console.log('  validation issues:');
          for (const issue of p.validation.issues ?? []) {
            console.log(`   - ${issue.code} @ ${issue.path} (${issue.category})`);
          }
        }
      } else if (p.state === 'FAILED' || p.state === 'COMPLETED') {
        console.log(`seq=${e.seq} INSPECTION_STATE_CHANGED state=${p.state} code=${p.code}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();