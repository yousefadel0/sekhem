import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Run 1: run_1791330582082_9ggg4 (Backend Architecture - last event)
    console.log('=== RUN 1: run_1791330582082_9ggg4 (Latest Event Detail) ===');
    const run1LastEvent = await prisma.agentRunEvent.findFirst({
      where: { agentRunId: 'run_1791330582082_9ggg4' },
      orderBy: { seq: 'desc' }
    });
    
    console.log('Last event:');
    console.log(JSON.stringify(run1LastEvent, null, 2));
    
    // Check for any PLANNING_CHECKPOINT or terminal events
    const run1Terminal = await prisma.agentRunEvent.findMany({
      where: {
        agentRunId: 'run_1791330582082_9ggg4',
        eventType: { in: ['PLANNING_CHECKPOINT', 'PROPOSAL_COMPLETE', 'EXECUTION_COMPLETE', 'AGENT_COMPLETE', 'WORKFLOW_COMPLETE', 'FAILED'] }
      }
    });
    console.log(`\nTerminal event candidates: ${run1Terminal.length}`);
    if (run1Terminal.length > 0) {
      console.log(JSON.stringify(run1Terminal, null, 2));
    }
    
    // Check AgentRun record in detail
    const run1Record = await prisma.agentRun.findUnique({
      where: { id: 'run_1791330582082_9ggg4' }
    });
    console.log('\nAgentRun record:');
    console.log(JSON.stringify(run1Record, null, 2));
    
    // Run 2: run_1791329712492_akele (Package.json - UNDERSTANDING_CHECKPOINT event detail)
    console.log('\n\n=== RUN 2: run_1791329712492_akele (Checkpoint Details) ===');
    const run2CheckpointEvent = await prisma.agentRunEvent.findFirst({
      where: {
        agentRunId: 'run_1791329712492_akele',
        eventType: 'UNDERSTANDING_CHECKPOINT'
      }
    });
    
    console.log('UNDERSTANDING_CHECKPOINT event:');
    console.log(JSON.stringify(run2CheckpointEvent, null, 2));
    
    // Check for any AgentRunCheckpoint records
    const run2Checkpoints = await prisma.agentRunCheckpoint.findMany({
      where: { agentRunId: 'run_1791329712492_akele' }
    });
    console.log(`\nCheckpoint records: ${run2Checkpoints.length}`);
    if (run2Checkpoints.length > 0) {
      console.log(JSON.stringify(run2Checkpoints, null, 2));
    }
    
    // Check AgentRun record
    const run2Record = await prisma.agentRun.findUnique({
      where: { id: 'run_1791329712492_akele' }
    });
    console.log('\nAgentRun record:');
    console.log(JSON.stringify(run2Record, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();