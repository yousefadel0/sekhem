import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Run 1: run_1791330582082_9ggg4 (Test 8 - backend architecture)
    console.log('=== RUN 1: run_1791330582082_9ggg4 (Backend Architecture) ===');
    const run1Events = await prisma.agentRunEvent.findMany({
      where: { agentRunId: 'run_1791330582082_9ggg4' },
      orderBy: { seq: 'asc' }
    });
    console.log(`Event count: ${run1Events.length}`);
    console.log('Events:');
    run1Events.forEach((e, i) => {
      console.log(`  [${i}] seq=${e.seq} type=${e.eventType} state=${e.stateAfter} ts=${e.timestamp}`);
    });
    
    // Show full detail of last 3 events
    console.log('\nLast 3 events full detail:');
    run1Events.slice(-3).forEach(e => {
      console.log(`\nseq=${e.seq}:`);
      console.log(`  eventType: ${e.eventType}`);
      console.log(`  stateAfter: ${e.stateAfter}`);
      console.log(`  timestamp: ${e.timestamp}`);
      if (e.metadata) console.log(`  metadata: ${JSON.stringify(e.metadata)}`);
    });
    
    // Run 2: run_1791329712492_akele (package.json - original paused run)
    console.log('\n\n=== RUN 2: run_1791329712492_akele (Package.json Update) ===');
    const run2Events = await prisma.agentRunEvent.findMany({
      where: { agentRunId: 'run_1791329712492_akele' },
      orderBy: { seq: 'asc' }
    });
    console.log(`Event count: ${run2Events.length}`);
    console.log('Events:');
    run2Events.forEach((e, i) => {
      console.log(`  [${i}] seq=${e.seq} type=${e.eventType} state=${e.stateAfter} ts=${e.timestamp}`);
    });
    
    console.log('\nLast 3 events full detail:');
    run2Events.slice(-3).forEach(e => {
      console.log(`\nseq=${e.seq}:`);
      console.log(`  eventType: ${e.eventType}`);
      console.log(`  stateAfter: ${e.stateAfter}`);
      console.log(`  timestamp: ${e.timestamp}`);
      if (e.metadata) console.log(`  metadata: ${JSON.stringify(e.metadata)}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();