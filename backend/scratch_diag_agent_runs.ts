import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Find runs from our test conversation
    const testRuns = await prisma.agentRun.findMany({
      where: { conversationId: { contains: 'conv-1791329712408' } },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    console.log('=== TEST CONVERSATION AGENT RUNS ===');
    console.log(JSON.stringify(testRuns, null, 2));
    
    // Get all recent runs for comparison
    const recentRuns = await prisma.agentRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    console.log('\n=== RECENT AGENT RUNS ===');
    console.log(JSON.stringify(recentRuns, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();