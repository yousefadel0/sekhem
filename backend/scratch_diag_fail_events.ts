import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Get failure diagnostic events for run_1791330582082_9ggg4
    const events = await prisma.agentRunEvent.findMany({
      where: {
        agentRunId: 'run_1791330582082_9ggg4',
        eventType: { in: ['INSPECTION_FAILED', 'MODEL_OUTPUT_DIAGNOSTIC', 'PROVIDER_REQUEST_DIAGNOSTIC'] }
      },
      orderBy: { seq: 'asc' }
    });
    console.log('=== Failure-related events ===');
    for (const e of events) {
      console.log(`seq=${e.seq} ${e.eventType}`);
      console.log(JSON.stringify(e.payload ?? {}, null, 2).slice(0, 3000));
      console.log('---');
    }

    // Also the last INSPECTION_STATE_CHANGED with FAILED state
    const failedState = await prisma.agentRunEvent.findFirst({
      where: { agentRunId: 'run_1791330582082_9ggg4', payload: { path: ['state'], equals: 'FAILED' } },
      orderBy: { seq: 'desc' }
    });
    if (failedState) {
      console.log('\n=== Final FAILED state event ===');
      console.log(`seq=${failedState.seq} ${failedState.eventType}`);
      console.log(JSON.stringify(failedState.payload ?? {}, null, 2).slice(0, 4000));
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();