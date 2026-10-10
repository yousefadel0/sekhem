import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  // Get all reasoning-related events for the failed run
  const events = await prisma.agentRunEvent.findMany({
    where: { 
      agentRunId: 'run_1791330582082_9ggg4',
      eventType: { in: ['INSPECTION_REASONING_SETTLED', 'INSPECTION_STATE_CHANGED', 'MODEL_OUTPUT_DIAGNOSTIC', 'PROVIDER_REQUEST_DIAGNOSTIC'] }
    },
    orderBy: { seq: 'asc' }
  });
  
  console.log('=== KEY EVENTS FOR FAILED RUN ===');
  events.forEach(e => {
    console.log(`\nSeq ${e.seq} - ${e.eventType}`);
    if (e.payload) console.log('Payload:', JSON.stringify(e.payload, null, 2));
  });
  
  await prisma.$disconnect();
}

main();