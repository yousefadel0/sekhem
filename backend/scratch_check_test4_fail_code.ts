import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // failureReason on run + last INSPECTION_STATE_CHANGED payload details
    const run = await prisma.agentRun.findUnique({ where: { id: 'run_1791336809140_hjquc' } });
    console.log('failureReason:', run?.failureReason);

    // Look for any MODEL_OUTPUT_DIAGNOSTIC or other diagnostic events with validation info
    const diags = await prisma.agentRunEvent.findMany({
      where: { agentRunId: 'run_1791336809140_hjquc', eventType: { contains: 'DIAGNOSTIC' } },
      orderBy: { seq: 'asc' }
    });
    console.log(`Diagnostic events (${diags.length}):`);
    for (const d of diags) console.log(`seq=${d.seq} ${d.eventType}: ${(JSON.stringify(d.payload ?? {}) as string).slice(0, 600)}`);
  } finally {
    await prisma.$disconnect();
  }
}
main();