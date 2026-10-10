import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Find the newest run in the new conversation
    const runs = await prisma.agentRun.findMany({
      where: { conversationId: 'conv-1791334966115-eqmjez' },
      orderBy: { createdAt: 'desc' }
    });
    console.log('Runs in new conversation:');
    for (const r of runs) {
      console.log(`${r.id} status=${r.status} failureReason=${r.failureReason} eventSeq=${r.eventSeq}`);
    }

    if (runs.length) {
      const events = await prisma.agentRunEvent.findMany({
        where: { agentRunId: runs[0].id },
        orderBy: { seq: 'asc' }
      });
      console.log(`\nEvents (${events.length}):`);
      for (const e of events) {
        console.log(`seq=${e.seq} ${e.eventType} ${(JSON.stringify(e.payload ?? {}) as string).slice(0, 260)}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();